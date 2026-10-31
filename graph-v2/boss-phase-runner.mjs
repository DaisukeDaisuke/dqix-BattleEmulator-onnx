// Browser-compatible orchestration. All RNG, stats, damage, status probability,
// target choice and initiative arithmetic stays in the supplied ONNX graphs.
// runGraph(name, rows) accepts/returns one object per original lane, where every
// tensor value is a flat row array. The batch is never filtered or reordered.
export const BOSS_RUNNER_MODELS=[
  'rom-boss-state-view2','rom-turn-order2','rom-ai-boss-step','rom-extra-actions',
  'rom-boss-plan-layout3','rom-primary-recovery2','rom-boss-command-route2',
  'rom-boss-action-core2','rom-boss-event-core2','rom-boss-post-status2','rom-boss-turn-tail2'
];
const clone=x=>Array.isArray(x)?x.map(clone):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,clone(v)])):x;
const rowValue=x=>Array.isArray(x)?[...x]:[x];
const scalar=x=>Array.isArray(x)?x[0]:x;
const flag=x=>!!scalar(x);
const commonState=['seed','position','actors','aux','status','wakeSkip','combo','context'];
const nextName=name=>`next${name[0].toUpperCase()}${name.slice(1)}`;

export async function createBossPhaseRunner({runGraph,getModel,onTrace,onTurnComplete,afterCombatTurn,cameraScope='No camera phase supplied',maxAiSteps=7,strictDomains=true}={}){
  if(typeof runGraph!=='function'||typeof getModel!=='function')throw Error('runGraph and getModel are required');
  const models=Object.fromEntries(await Promise.all(BOSS_RUNNER_MODELS.map(async name=>[name,await getModel(name)])));
  for(const name of BOSS_RUNNER_MODELS)if(!models[name])throw Error(`Missing graph ${name}`);
  const core=models['rom-boss-action-core2'],aiModel=models['rom-ai-boss-step'],fields=core.contract.actorFields,auxFields=core.contract.auxFields;
  const defaults=name=>Object.fromEntries(Object.entries(models[name].contract.defaults??{}).map(([k,v])=>[k,rowValue(v)]));
  let graphCalls=0;const domainViolations=[];
  function checkDomains(model,rows,phase){
    const failures=[],contract=model.contract??{},inputByName=Object.fromEntries(model.inputs.map(x=>[x.name,x]));
    const inspect=(value,rule,path,dtype)=>{
      if(typeof value==='number'&&!Number.isFinite(value))failures.push(`${path}: nonfinite`);
      if(rule.min!==undefined&&(typeof value!=='number'||value<rule.min))failures.push(`${path}: below ${rule.min}`);
      if(rule.max!==undefined&&(typeof value!=='number'||value>rule.max))failures.push(`${path}: above ${rule.max}`);
      if(rule.integer&&!Number.isInteger(value))failures.push(`${path}: noninteger`);
      if(rule.values&&!rule.values.some(v=>dtype==='bool'?Number(v)===Number(value):v===value))failures.push(`${path}: outside declared values`);
    };
    rows.forEach((row,lane)=>{
      for(const d of model.inputs)row[d.name].forEach((value,index)=>inspect(value,contract.fieldDomains?.[d.name]?.[index]??contract.inputDomains?.[d.name]??{},`${lane}:${d.name}[${index}]`,d.dtype));
      for(const relation of contract.relations??[]){if(!inputByName[relation.left.input]||!inputByName[relation.right.input])continue;const left=row[relation.left.input][relation.left.index],right=row[relation.right.input][relation.right.index];if(relation.op==='<='&&!(left<=right))failures.push(`${lane}:${relation.left.input}[${relation.left.index}] exceeds ${relation.right.input}[${relation.right.index}]`);}
    });
    if(failures.length){domainViolations.push({phase,model:model.name,failures});if(strictDomains)throw Error(`${model.name} input domain violation: ${failures.slice(0,4).join('; ')}`);}
  }
  async function call(name,rows,phase){
    const model=models[name],base=defaults(name),inputs=rows.map(row=>Object.fromEntries(model.inputs.map(({name:key,shape})=>{
      const value=row[key]??base[key];if(value===undefined)throw Error(`${name}: missing ${key}`);
      const array=rowValue(value);if(array.length!==shape[1])throw Error(`${name}.${key}: ${array.length} columns, expected ${shape[1]}`);return[key,array];
    })));
    checkDomains(model,inputs,phase);const outputs=await runGraph(name,inputs,{phase});graphCalls++;
    if(!Array.isArray(outputs)||outputs.length!==rows.length)throw Error(`${name}: runGraph must preserve every batch lane`);
    if(onTrace)await onTrace({phase,model:name,inputs:clone(inputs),outputs:clone(outputs)});
    return outputs;
  }
  function apply(state,out,names=commonState){for(const name of names){const value=out[nextName(name)];if(value!==undefined)state[name]=rowValue(value);}}
  function reject(state,reason){state.supported=[0];state.finished=[1];state.reason=reason;}
  function createState(row={}){
    const base=defaults('rom-boss-action-core2'),state={...base,...clone(row)};
    for(const key of commonState)state[key]=rowValue(state[key]??base[key]);
    for(const key of ['config'])state[key]=rowValue(state[key]??base[key]);
    state.turn=rowValue(row.turn??1);state.maxTurns=rowValue(row.maxTurns??32);state.outcome=rowValue(row.outcome??0);state.supported=rowValue(row.supported??1);state.finished=rowValue(row.finished??0);
    state.resistancesByActor=row.resistancesByActor?clone(row.resistancesByActor):[100,100,100,100,100,100,100,100,100,100];
    state.extraAlternate=rowValue(row.extraAlternate??false);state.ai={...defaults('rom-ai-boss-step'),...clone(row.ai??{})};state.completedTurns=row.completedTurns??0;state.reason=row.reason??null;state.lastActions=[];
    if(state.resistancesByActor.length!==10)throw Error('resistancesByActor requires five resistance bytes per actor');
    if(flag(state.config[6]))reject(state,'Successful/attempted appeal preparation is outside this monster303 runner; enemyAppealGate must be0.');
    return state;
  }
  async function view(states,phase){
    const out=await call('rom-boss-state-view2',states,phase);
    out.forEach((x,i)=>{if(!flag(x.supported))reject(states[i],'Actor identity/counter/critical profile is outside the two-actor contract.');if(!flag(states[i].outcome))states[i].outcome=rowValue(x.outcome);if(flag(states[i].outcome))states[i].finished=[1];});return out;
  }
  const live=state=>flag(state.supported)&&!flag(state.outcome)&&scalar(state.turn)<=scalar(state.maxTurns)&&!flag(state.finished);

  // Public entry for independently verifying the exact preparation/core/post
  // chain with actual ARM function-chain fixtures. Commands are preplanned.
  async function executeCommands(inputStates,commands,{phase='command',normalize=true}={}){
    const states=normalize?inputStates.map(createState):inputStates;
    if(commands.length!==states.length)throw Error('One command per original lane is required');
    const beforeView=await view(states,`${phase}:before`),indices=commands.map(c=>scalar(c.sourceIndex));
    const gates=states.map((s,i)=>live(s)&&flag(beforeView[i].canExecute[indices[i]])&&commands[i].enabled!==false&&scalar(commands[i].enabled??1)!==0);
    if(onTrace){const skipped=states.flatMap((s,i)=>live(s)&&scalar(commands[i].enabled??1)!==0&&!gates[i]?[{lane:i,sourceIndex:indices[i],plannedAction:scalar(commands[i].actionId),reason:flag(s.wakeSkip[indices[i]])?'wakeSkip':'command gate'}]:[]);if(skipped.length)await onTrace({phase:`${phase}:skipped`,skipped});}
    const primary=await call('rom-primary-recovery2',states.map((s,i)=>({...s,sourceIndex:[indices[i]],actionId:rowValue(commands[i].actionId),targetCount:rowValue(commands[i].targetCount??1),present:[true],pendingRecoveryMessage:[false],recoveryMessage:[false],enabled:[gates[i]]})),`${phase}:primary`);
    primary.forEach((x,i)=>apply(states[i],x));
    const routes=await call('rom-boss-command-route2',states.map((s,i)=>({...s,sourceIndex:[indices[i]],actionId:primary[i].nextAction,targetCount:primary[i].nextTargetCount,recovered:primary[i].recovered,enabled:[gates[i]]})),`${phase}:route`);
    routes.forEach((x,i)=>{if(gates[i]&&!flag(x.supported))reject(states[i],'Confusion command selection, source skip-bit preparation, or an unsupported party action was reached.');if(gates[i])apply(states[i],x,['aux']);});
    const ordinary=await call('rom-boss-action-core2',states.map((s,i)=>({...s,sourceIndex:[indices[i]],actionId:flag(routes[i].ordinaryGate)?routes[i].nextAction:[1],resistances:s.resistancesByActor.slice((1-indices[i])*5,(2-indices[i])*5),enabled:[gates[i]&&flag(routes[i].ordinaryGate)&&live(s)]})),`${phase}:core`);
    ordinary.forEach((x,i)=>{if(gates[i]&&flag(routes[i].ordinaryGate)&&!flag(x.supported))reject(states[i],'The ordinary effect core rejected the current profile or MP state.');if(gates[i]&&flag(routes[i].ordinaryGate)&&flag(x.supported))apply(states[i],x);});
    const events=await call('rom-boss-event-core2',states.map((s,i)=>({...s,sourceIndex:[indices[i]],actionId:flag(routes[i].eventGate)?routes[i].nextAction:[503],enabled:[gates[i]&&flag(routes[i].eventGate)&&live(s)]})),`${phase}:event`);
    events.forEach((x,i)=>{if(gates[i]&&flag(routes[i].eventGate)){if(!flag(x.supported))reject(states[i],'The event effect core rejected the selected event.');else apply(states[i],x);}});
    await view(states,`${phase}:after-core`);
    const post=await call('rom-boss-post-status2',states.map((s,i)=>({...s,sourceIndex:[indices[i]],enabled:[gates[i]&&live(s)]})),`${phase}:post`);post.forEach((x,i)=>apply(states[i],x));
    const results=states.map((s,i)=>({enabled:[gates[i]],wakeSkipped:[!flag(beforeView[i].canExecute[indices[i]])&&flag(s.wakeSkip[indices[i]])],sourceIndex:[indices[i]],plannedAction:rowValue(commands[i].actionId),actionId:routes[i].nextAction,targetCount:routes[i].nextTargetCount,targets:rowValue(commands[i].targets??[indices[i]===0?192:0,-1,-1,-1,-1,-1,-1,-1]),recovered:primary[i].recovered,damage:flag(routes[i].eventGate)?events[i].damage:ordinary[i].damage,internalDamage:flag(routes[i].eventGate)?events[i].internalDamage:ordinary[i].internalDamage,critical:ordinary[i].critical,charged:[flag(ordinary[i].charged)||flag(events[i].charged)],seed:[...s.seed],position:[...s.position],outcome:[...s.outcome],supported:[...s.supported]}));
    return{states,commands:results};
  }

  async function run({rows,maxTurns,turns=32}={}){
    if(!Array.isArray(rows)||!rows.length)throw Error('A nonempty batch is required');
    const states=rows.map(row=>createState(maxTurns===undefined?row:{...row,maxTurns}));
    // These are declared composition-domain checks, not emulated status rules.
    // The supported normal-only party cannot inflict these states on the enemy.
    // Starting with them would require execution-time AI replanning after the
    // first recovery command, which is a separate caller branch.
    for(const state of states){
      if(['paralysis','sleep','confusion'].some(key=>flag(state.actors[33+fields.indexOf(key)])))reject(state,'Initial enemy primary ailments require execution-time replanning of a later 503 command; this caller branch is outside the current whole-turn profile.');
      if([0,1].some(actor=>flag(state.actors[actor*33+fields.indexOf('skip')])))reject(state,'Initial status14 skip bit0x80000 requires the separate stats3b bit1 preparation/post contract. The independent wakeSkip bit0 remains supported.');
    }
    const startCalls=graphCalls;
    for(let loop=0;loop<turns;loop++){
      const startView=await view(states,`turn${loop}:state`),active=states.map(live);if(!active.some(Boolean))break;
      states.forEach((s,i)=>{if(active[i]){s.combo=[0,0,0,-1,0,0];s.ai.usedSlots=Array(6).fill(false);s.lastActions=[];s.lastCommandResults=[];}});
      const order=await call('rom-turn-order2',states.map((s,i)=>({...s,agility:startView[i].initiativeAgility,actorIds:startView[i].actorIds,present:startView[i].alive.map(v=>!!v&&active[i]),surprise:[0],firstTurn:[scalar(s.turn)===1]})),`turn${loop}:initiative`);order.forEach((x,i)=>apply(states[i],x,['seed','position']));
      const enemyActions=states.map(()=>[]),enemyCounts=states.map(()=>[]),enemyTargets=states.map(()=>[]);
      for(let decision=0;decision<2;decision++){
        const aiEnabled=states.map((s,i)=>active[i]&&live(s)&&flag(startView[i].enemyCanPlan));
        states.forEach((s,i)=>{
          const v=startView[i];Object.assign(s.ai,{seed:[...s.seed],position:[...s.position],initialized:[false],attempt:[0],phase:[0],selectedAction:[-1],selectedSlot:[-1],previousTargetCount:[0],previousTargets:Array(8).fill(-1),enabled:[aiEnabled[i]],mp:v.enemyMp,hp:v.partyHp,present:v.partyPresent,candidate:v.partyPresent,dead:v.partyDead,paralyzed:v.partyParalyzed,asleep:v.partyAsleep,defense:v.partyDefense,agility:v.partyAgility,defenseRank:v.partyDefenseRank,agilityRank:v.partyAgilityRank,actorDead:v.enemyDead,actorParalyzed:v.enemyParalyzed,rageEnabled:v.rageEnabled,rageId:v.rageId});
        });
        let last;
        for(let step=0;step<maxAiSteps;step++){
          last=await call('rom-ai-boss-step',states.map(s=>s.ai),`turn${loop}:enemy-plan${decision}:step${step}`);
          last.forEach((x,i)=>{if(aiEnabled[i]&&(!flag(x.supported)||flag(x.protocolError))){reject(states[i],'Enemy AI reached an unsupported target selector, repeat code or protocol state.');states[i].ai.enabled=[false];}for(const [input,output]of Object.entries(aiModel.contract.feedback))if(x[output]!==undefined)states[i].ai[input]=rowValue(x[output]);});
        }
        states.forEach((s,i)=>{
          if(aiEnabled[i]&&scalar(s.ai.phase)!==2)reject(s,'Enemy AI did not reach a terminal decision within the exact seven-attempt bound.');
          if(aiEnabled[i]){s.seed=[...s.ai.seed];s.position=[...s.ai.position];}
          enemyActions[i].push(aiEnabled[i]?scalar(s.ai.selectedAction):503);enemyCounts[i].push(aiEnabled[i]?scalar(last[i].targetCount):0);enemyTargets[i].push(...(aiEnabled[i]?last[i].targets:Array(8).fill(-1)));
        });
        if(decision===0){
          const extra=await call('rom-extra-actions',states.map((s,i)=>({...s,party:[false],mode:[2],alternate:s.extraAlternate,enabled:[active[i]&&live(s)]})),`turn${loop}:extra-action`);
          extra.forEach((x,i)=>{if(active[i]&&live(states[i])&&scalar(x.extraCount)!==1)reject(states[i],'Expected the audited monster303 extra-action count1.');apply(states[i],x,['seed','position']);states[i].extraAlternate=rowValue(x.nextAlternate);});
        }
      }
      const layout=await call('rom-boss-plan-layout3',states.map((s,i)=>({orderIndices:active[i]?order[i].orderIndices:[0,1],partyAction:startView[i].partyPlannedAction,enemyActions:enemyActions[i],partyTargetCount:startView[i].partyPlannedTargetCount,partyTargets:flag(startView[i].partyPlannedTargetCount)?[192,-1,-1,-1,-1,-1,-1,-1]:Array(8).fill(-1),enemyTargetCounts:enemyCounts[i],enemyTargets:enemyTargets[i],partyWeaponFirst:[false]})),`turn${loop}:layout`);
      layout.forEach((x,i)=>{if(active[i]&&!flag(x.supported))reject(states[i],'The three-command layout rejected the initiative or action records.');});
      for(let slot=0;slot<3;slot++){
        const commands=layout.map((x,i)=>({actionId:x.planActions[slot],sourceIndex:x.sourceIndices[slot],targetCount:x.planTargetCounts[slot],targets:x.planTargets.slice(slot*8,(slot+1)*8),enabled:active[i]&&live(states[i])}));
        const executed=await executeCommands(states,commands,{phase:`turn${loop}:slot${slot}`,normalize:false});executed.commands.forEach((x,i)=>{if(active[i])states[i].lastCommandResults.push(clone(x));if(flag(x.enabled))states[i].lastActions.push(clone(x));});
      }
      const tail=await call('rom-boss-turn-tail2',states.map((s,i)=>({...s,enteredTurn:[active[i]&&flag(s.supported)]})),`turn${loop}:tail`);
      tail.forEach((x,i)=>{if(active[i]&&flag(states[i].supported)){apply(states[i],x);states[i].turn=rowValue(x.nextTurn);states[i].outcome=rowValue(x.nextOutcome);states[i].finished=rowValue(x.finished);}if(active[i])states[i].completedTurns++;});
      if(afterCombatTurn){
        const patch=await afterCombatTurn({states:clone(states),enabled:active,turnIndex:loop,runGraph:call});
        if(patch){if(patch.length!==states.length)throw Error('afterCombatTurn must preserve batch lanes');patch.forEach((p,i)=>{if(active[i]&&p)Object.assign(states[i],clone(p));});}
      }
      if(onTrace)await onTrace({phase:`turn${loop}:complete`,states:clone(states),cameraIncluded:!!afterCombatTurn,cameraScope});
      // A view for lightweight UI summaries. The consumer must not mutate it;
      // copy only the lanes/fields that it intends to retain or display.
      if(onTurnComplete)await onTurnComplete({states,enabled:active,turnIndex:loop,cameraIncluded:!!afterCombatTurn,cameraScope});
    }
    return{rows:states,graphCalls:graphCalls-startCalls,batchSize:states.length,seedFiltering:false,cameraIncluded:!!afterCombatTurn,cameraScope,domainViolations:clone(domainViolations),scope:afterCombatTurn?'Restricted monster303 combat phases plus the explicitly supplied external turn adapter.':'Restricted monster303 combat phases. Camera and full raw presentation memory are outside this execution.',models:[...BOSS_RUNNER_MODELS]};
  }
  return{run,executeCommands,createState,models:BOSS_RUNNER_MODELS,contract:{batch:'Every graph invocation preserves original lane count/order; disabled or terminal lanes use model gates.',numericRules:'All battle/RNG arithmetic is in the graphs; JavaScript connects tensors and routes phases.',profile:'One party0 with preselected normal action and real monster303 enemy192 with scheme1, two planned actions, audited action set1/44/48/228/275 and events503/504/900/901/938. No surprise, counter, attraction or confusion command routing. Initial enemy primary ailments and initial status14 skip bit0x80000 are rejected because they need additional caller branches; the separate wakeSkip flag is implemented. Camera is an explicit external phase.'}};
}
