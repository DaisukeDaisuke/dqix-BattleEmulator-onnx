// One definition-independent controller for the shared ONNX module set.
// This file owns lists, lookup, scheduling and tensor wiring. Damage, recovery,
// RNG, AI decisions and effect arithmetic are executed by ONNX graphs.
const clone=value=>globalThis.structuredClone?globalThis.structuredClone(value):JSON.parse(JSON.stringify(value));
const scalar=value=>Array.isArray(value)||ArrayBuffer.isView(value)?value[0]:value;
const array=value=>Array.isArray(value)||ArrayBuffer.isView(value)?Array.from(value):[value];
const yes=value=>!!scalar(value);
const pad=(values,width,fill=0)=>Array.from({length:width},(_,i)=>values[i]??fill);
const emptyTargets=()=>Array(8).fill(-1);
const bytes32=value=>Array.from({length:4},(_,i)=>(Number(value)>>>i*8)&255);
const EVENT_ACTIONS=new Set([503,504,900,901,914,937,938]);
class Boundary extends Error{constructor(reason,details={}){super(reason);this.details=details;}}
class Budget extends Error{}

export function romInitiativeSort(rows){
  // Matching func_020749ac, descending first-pivot Hoare partition. Equal
  // speeds swap endpoints; JavaScript stable sort has different tie behavior.
  const out=rows.map(value=>({...value}));
  function sort(lo,hi){let i=lo,j=hi,pivot=out[i].initiative;
    for(;;){while(out[i].initiative>pivot)i++;while(out[j].initiative<pivot)j--;if(i>=j)break;[out[i],out[j]]=[out[j],out[i]];i++;j--;}
    if(lo<i-1)sort(lo,i-1);if(j+1<hi)sort(j+1,hi);
  }
  if(out.length>1)sort(0,out.length-1);return out;
}
export async function commonProgramHash(program){
  const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(program)));
  return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
}

export async function createCommonBattleRunner({program,definitions,getModel,runGraph,presentationRunner}={}){
  if(program?.schema!=='dq9-common-battle-program-v1')throw Error('A common battle program is required');
  if(!definitions?.actions||!definitions?.monsters)throw Error('Action and monster definition tables are required');
  if(typeof getModel!=='function'||typeof runGraph!=='function')throw Error('getModel and runGraph are required');
  const fields=program.actorFields,idx=Object.fromEntries(fields.map((key,i)=>[key,i]));
  const models=new Map(),modelPending=new Map(),ops=program.operations;
  const model=async name=>{if(models.has(name))return models.get(name);if(!modelPending.has(name))modelPending.set(name,Promise.resolve(getModel(name)).then(value=>{models.set(name,value);return value;}));return modelPending.get(name);};
  const programHash=await commonProgramHash(program),moduleHashes=Object.fromEntries(program.modules.map(x=>[x.name,x.sha256]));
  const value=(a,key)=>a?.actor[idx[key]]??0,party=a=>value(a,'party')!==0;
  const exists=a=>!!a&&a.present!==false,member=a=>exists(a)&&a.roster!==false;
  const alive=a=>member(a)&&!a.dead&&!a.excluded;
  const actorById=(s,id)=>s.actors.find(a=>a.actorId===id);
  const parties=s=>s.actors.filter(a=>party(a)&&a.roster!==false);
  const enemies=s=>[0,1,2].flatMap(group=>s.actors.filter(a=>!party(a)&&a.roster!==false&&a.group===group));
  const roster=s=>[...parties(s),...enemies(s)];
  const definition=a=>definitions.monsters[String(a.definitionId)];
  const action=id=>definitions.actions[String(id)];
  const charged=s=>parties(s).filter(a=>alive(a)&&a.aux[0]>0).length;
  const tensorActor=a=>({actor:a.actor,aux:a.aux,status:a.status,tension:a.tension,preparation:a.preparation,wakeSkip:a.wakeSkip,rawTimers:a.rawTimers,present:exists(a)});
  const presentationSnapshot=a=>a?clone({actor:a.actor,aux:a.aux,status:a.status,wakeSkip:a.wakeSkip,tension:a.tension,rawStatus:a.rawStatus,rawFlags:a.rawFlags,rawRanks:a.rawRanks,statusKinds:a.statusKinds,rawTimers:a.rawTimers}):null;
  const identityInput=(s,a)=>({...tensorActor(a),rawStatusBytes:bytes32(a.rawStatus??0),rawFlagBytes:bytes32(a.rawFlags??0),rawRanks:a.rawRanks,statusKindsBytes:[(a.statusKinds??0)&255,(a.statusKinds??0)>>>8],seed:s.seed,position:s.position,enabled:true});
  function commitRandom(s,out){if(out.nextSeed)s.seed=Array.from(out.nextSeed);if(out.nextPosition)s.position=scalar(out.nextPosition);}
  function commitActor(a,out,prefix=''){
    const oldHp=value(a,'hp');
    for(const[key,suffix]of Object.entries({actor:'Actor',aux:'Aux',status:'Status',tension:'Tension',preparation:'Preparation',rawTimers:'RawTimers'}))if(out['next'+prefix+suffix])a[key]=Array.from(out['next'+prefix+suffix]);
    if(out['next'+prefix+'WakeSkip'])a.wakeSkip=scalar(out['next'+prefix+'WakeSkip']);
    if(value(a,'hp')<=0){a.dead=true;if(oldHp>0){a.deathResetPending=true;if(a.ai){a.ai.revengeId=-1;a.ai.previousId=-1;}}}
    if(out['next'+prefix+'History']&&a.ai){[a.ai.revengeId,a.ai.previousId]=Array.from(out['next'+prefix+'History']);}
    if(out['next'+prefix+'State3c'])a.state3c=scalar(out['next'+prefix+'State3c']);
    for(const [suffix,key]of [['RawStatusBytes','rawStatus'],['RawFlagsBytes','rawFlags'],['RawFlagBytes','rawFlags'],['StatusKindsBytes','statusKinds']])if(out['next'+prefix+suffix])a[key]=out['next'+prefix+suffix].reduce((n,b,i)=>n+b*2**(8*i),0);
    if(out['next'+prefix+'RawRanks'])a.rawRanks=Array.from(out['next'+prefix+'RawRanks']);
  }
  function outcome(s){
    const p=parties(s).some(a=>alive(a)&&value(a,'hp')>0),e=enemies(s).some(a=>alive(a)&&value(a,'hp')>0);
    s.outcome=p?(e?0:1):2;s.finished=s.outcome!==0;return s.outcome;
  }
  function validate(s){
    if(s.budgetExhausted&&!s.requestedTurnsComplete)throw Error('A budget-stopped prefix must be replayed from the saved initial input; it is not a turn-boundary state');
    if(!Array.isArray(s.seed)||s.seed.length!==8||s.seed.some(x=>!Number.isInteger(x)||x<0||x>255))throw Error('seed: eight exact byte limbs required');
    if(!Number.isInteger(s.position)||s.position<0||s.position>2147483000)throw Error('position: int32 RNG counter required');
    if(!Array.isArray(s.actors)||!s.actors.length)throw Error('actors: nonempty actor array required');
    const used=new Set();
    for(const a of s.actors){
      for(const[key,width]of Object.entries({actor:33,aux:21,status:7,tension:3,preparation:5,config:7,resistances:22,weapon:4,charm:3}))if(!Array.isArray(a[key])||a[key].length!==width||a[key].some(x=>!Number.isFinite(x)))throw Error(`actor ${a.actorId}: ${key} must have ${width} finite values`);
      if(!Number.isInteger(a.actorId)||used.has(a.actorId)||value(a,'id')!==a.actorId)throw Error('Actor IDs must be unique and agree with actor.id');used.add(a.actorId);
      if(party(a)?a.actorId<0||a.actorId>3:a.actorId<192||a.actorId>199)throw Error('Actor ID outside the ROM party0..3/enemy192..199 lookup');
      if(!party(a)&&(!Number.isInteger(a.group)||a.group<0||a.group>2))throw Error('Enemy group outside0..2');
      if(!party(a)&&!definition(a))throw Error(`Missing monster definition ${a.definitionId}`);
      if(value(a,'level')<0||value(a,'level')>99)throw Error('Current periodic graph requires level0..99');
      a.state3c??=0;a.magic??=[0,0];a.packedScale??=[0,0];for(const key of ['magic','packedScale'])if(!Array.isArray(a[key])||a[key].length!==2||a[key].some(x=>!Number.isInteger(x)||x<0||x>1023))throw Error(key+' must contain two values in0..1023');
      a.ai??={};a.ai.cursor??=0;a.ai.alternate??=!!(a.state3c&1);a.ai.previousTargetCount??=0;a.ai.previousTargets??=emptyTargets();
      a.wakeSkip??=0;a.rawStatus??=0;a.rawFlags??=0;a.rawRanks??=Array(10).fill(0);a.auxiliaryBytes??=Array(9).fill(0);
      a.rawTimers??=Array(10).fill(0);if(!Array.isArray(a.rawTimers)||a.rawTimers.length!==10||a.rawTimers.some((x,i)=>!Number.isInteger(x)||x<0||x>(i%2?4:255)))throw Error('rawTimers must contain magic/breath/fire/ice/force duration0..255 and recovery0..4 pairs');
      a.statusKinds??=a.status[0]&3;
      for(const key of ['rawStatus','rawFlags'])if(!Number.isInteger(a[key])||a[key]<0||a[key]>4294967295)throw Error(key+' must be uint32');
      if(!Number.isInteger(a.statusKinds)||a.statusKinds<0||a.statusKinds>65535)throw Error('statusKinds must be uint16');
      a.coverById??=-1;a.coverTargetId??=-1;
    }
    if(parties(s).length>4||enemies(s).length>8)throw Error('Actor population exceeds ROM lookup limits');
    s.groups??=Array.from({length:3},()=>({cursor:0,usedSlots:Array(6).fill(false)}));
    if(s.groups.length!==3)throw Error('Three ROM group state slots are required');
    s.turn??=1;s.completedTurns??=0;s.firstTurn??=s.turn===1;s.surprise??=0;s.scenarioId??=-1;
    s.combo??=[0,0,0,-1,0,0];s.context??=[1,0];s.camera??={mode:'pending-input',row4Words:[],records:[]};s.nowstate??=[];s.unresolvedEffects=[];
    s.supported=true;s.budgetExhausted=false;s.transitions=0;s.requestedTurnsComplete=false;s.phase='initial';
  }

  async function run({rows,maxTurns=1,maxTransitions=100000,trace=false,onProgress,shouldStop}={}){
    if(!Array.isArray(rows)||!rows.length)throw Error('A nonempty batch is required');
    if(!Number.isInteger(maxTurns)||maxTurns<1||!Number.isInteger(maxTransitions)||maxTransitions<1)throw Error('Budgets must be positive integers');
    const states=rows.map(clone);states.forEach(validate);
    const inputHash=await commonProgramHash({definitions,rows}),traces=states.map(()=>[]),queues=new Map();let flushQueued=false,graphCalls=0,batchRows=0;
    // Independent battles that reach the same graph in the same microtask are
    // evaluated as one N-row invocation. There is no per-seed JS numeric kernel.
    async function flush(){flushQueued=false;const pending=[...queues.entries()];queues.clear();
      for(const[name,jobs]of pending){try{const outputs=await runGraph(name,jobs.map(job=>job.input),{phase:'common-battle'});graphCalls++;batchRows+=jobs.length;if(outputs.length!==jobs.length)throw Error(name+': output batch length changed');jobs.forEach((job,i)=>job.resolve(outputs[i]));}catch(error){jobs.forEach(job=>job.reject(error));}}
    }
    async function call(s,lane,operation,values){
      if(shouldStop?.())throw new Budget('User stopped the run');
      if(++s.transitions>maxTransitions)throw new Budget('Transition budget exhausted');
      const name=ops[operation]??operation,ir=await model(name),input={};
      for(const d of ir.inputs){const v=values[d.name]??ir.contract?.defaults?.[d.name];if(v===undefined)throw Error(`${name}.${d.name}: missing input`);input[d.name]=array(v);if(input[d.name].length!==d.shape[1])throw Error(`${name}.${d.name}: expected ${d.shape[1]} values`);}
      const out=await new Promise((resolve,reject)=>{const jobs=queues.get(name)??[];jobs.push({input,resolve,reject});queues.set(name,jobs);if(!flushQueued){flushQueued=true;queueMicrotask(flush);}});
      if(trace)traces[lane].push({turn:s.turn,phase:s.phase,model:name,input:clone(input),output:clone(out)});
      return out;
    }
    async function draw(s,lane,maximum){const out=await call(s,lane,'random',{seed:s.seed,position:s.position,maximum,enabled:true});commitRandom(s,out);return scalar(out.value??out.result);}
    async function views(s,lane){
      const result=new Map();for(const a of roster(s)){
        a.state3c=((a.state3c??0)&~65)|(a.ai.alternate?1:0)|(a.preparation[4]?64:0);
        a.statusKinds=(a.statusKinds&~3)|(a.status[0]&3);
        const out=await call(s,lane,'stateView',{...identityInput(s,a),rawStatusBytes:bytes32((a.rawStatus&~1)|Number(!!a.dead)),rawFlagBytes:bytes32((a.rawFlags&~0x2000)|(a.excluded?0x2000:0)),rawRanks:a.rawRanks,deathReset:!!a.deathResetPending,escapeReset:!!a.escapeResetPending});
        if(out.statusBytes)a.rawStatus=out.statusBytes.reduce((n,b,i)=>n+b*2**(8*i),0);if(out.flagBytes)a.rawFlags=out.flagBytes.reduce((n,b,i)=>n+b*2**(8*i),0);if(out.ranks)a.rawRanks=Array.from(out.ranks);if(out.nextRawTimers)a.rawTimers=Array.from(out.nextRawTimers);if(out.nextStatusKindsBytes)a.statusKinds=out.nextStatusKindsBytes.reduce((n,b,i)=>n+b*2**(8*i),0);a.deathResetPending=false;a.escapeResetPending=false;
        result.set(a.actorId,Object.fromEntries(Object.entries(out).map(([key,v])=>[key,v.length===1?scalar(v):Array.from(v)])));
      }return result;
    }
    function tableInputs(a){
      const m=definition(a);if(!m)throw new Boundary('monster-definition',{actor:a.actorId,definitionId:a.definitionId});
      const records=m.actions.map(id=>action(id));if(records.some(x=>!x))throw new Boundary('action-definition',{actor:a.actorId,actions:m.actions});
      const fallback=action(2);return{scheme:m.scheme,judgment:m.judgment,mp:value(a,'mp'),actionIds:m.actions,mpCosts:records.map(x=>x.mpCost),operations:records.map(x=>x.operation),spell:records.map(x=>x.spell),ability:records.map(x=>x.ability),limited:records.map((_,i)=>!!(m.limitedSlots&(1<<i))),smartTarget:records.map(x=>x.smartTarget),wiseTarget:records.map(x=>x.wiseTarget),targetSide:records.map(x=>x.targetSide),targetScope:records.map(x=>x.targetScope),repeatCode:records.map(x=>x.repeatCode),fallbackTargetSide:fallback.targetSide,fallbackTargetScope:fallback.targetScope,fallbackRepeatCode:fallback.repeatCode};
    }
    function population(s,a,view){
      const pp=pad(parties(s),4,null),ee=pad(enemies(s),8,null),v=x=>x?view.get(x.actorId)??{}:{};
      const status=x=>x?v(x).statusBytes??bytes32(x.rawStatus):[0,0,0,0],flags=x=>x?v(x).flagBytes??bytes32(x.rawFlags):[0,0,0,0];
      return{ids:pp.map((x,i)=>x?.actorId??i),hp:pp.map(x=>value(x,'hp')),present:pp.map(exists),candidate:pp.map(member),excluded:pp.map(x=>!!x?.excluded),dead:pp.map(x=>!!x?.dead),baseHalf:pp.map(x=>!!x?.baseHalf),attracted:pp.map(x=>x?.attracted??!!(x?.rawStatus&0x08000000)),
        priorityEnabled:a.ai.priorityEnabled??!!(definition(a)?.flags&0x04000000),revengeId:a.ai.revengeId??-1,previousId:a.ai.previousId??-1,rageEnabled:a.aux[3]>0,rageId:a.aux[6],actorId:a.actorId,
        paralyzed:pp.map(x=>value(x,'paralysis')>0),asleep:pp.map(x=>value(x,'sleep')>0),status26:pp.map(x=>!!(x?.rawStatus&0x4000000)),status9:pp.map(x=>!!(x?.rawStatus&0x200)),
        defense:pp.map(x=>v(x).defense??0),agility:pp.map(x=>v(x).agility??0),defenseRank:pp.map(x=>value(x,'defenseRank')),agilityRank:pp.map(x=>value(x,'agilityRank')),
        actorDead:!!a.dead,actorPresent:exists(a),actorExcluded:!!a.excluded,actorParalyzed:value(a,'paralysis')>0,actorAttack:v(a).attack??0,actorDefense:v(a).defense??0,actorBlind:value(a,'blind')>0,actorHp:value(a,'hp'),actorMaxHp:value(a,'maxHp'),
        enemyIds:ee.map((x,i)=>x?.actorId??192+i),enemyPresent:ee.map(exists),enemyCandidate:ee.map(member),enemyDead:ee.map(x=>!!x?.dead),enemyExcluded:ee.map(x=>!!x?.excluded),enemyGroups:ee.map(x=>x?.group??0),actorGroup:a.group,
        enemyOriginalMonsterIds:ee.map(x=>x?.originalMonsterId??-1),enemyCoverSources:ee.map(x=>x?.coverById??-1),enemyHp:ee.map(x=>value(x,'hp')),enemyMaxHp:ee.map(x=>value(x,'maxHp')),actorBarrierRank:a.rawRanks[6],actorBreathJudgment:!!(a.state3c&4),enemyBreathBarrierRank:ee.map(x=>x?.rawRanks?.[7]??0),
        partyStatusBytes:pp.flatMap(status),partyFlagBytes:pp.flatMap(flags),partyRankFields:pp.flatMap(x=>x?v(x).ranks??x.rawRanks:Array(10).fill(0)),actorType400:a.actorType400!==false,actorStatusBytes:status(a),
        enemyDefense:ee.map(x=>v(x).defense??0),enemyDefenseRank:ee.map(x=>value(x,'defenseRank')),enemyBarrierRank:ee.map(x=>x?.rawRanks?.[6]??0),enemyGroupCount:enemies(s).reduce((count,x)=>Math.max(count,x.group+1),0),
        partyMp:pp.map(x=>value(x,'mp')),partyAuxiliaryPresent:pp.map(x=>exists(x)&&x.auxiliaryPresent!==false),partyAuxiliaryBytes:pp.flatMap(x=>x?.auxiliaryBytes??Array(9).fill(0)),enemyStatus9:ee.map(x=>!!(x?.rawStatus&0x200))};
    }
    async function ai(s,lane,a){
      const view=await views(s,lane),group=s.groups[a.group],name=ops.ai,ir=await model(name);
      let state={initialized:false,attempt:0,phase:0,selectedAction:-1,selectedSlot:-1,weightedQueue:[0,1,2,3,4,5],pairOther:0,blockBase:0,blockOffset:0,blockRemaining:0,actorCursor:a.ai.cursor,groupCursor:group.cursor,usedSlots:group.usedSlots,previousTargetCount:0,previousTargets:[-1,0,0,0,0,0,0,0]};
      for(;;){
        const out=await call(s,lane,'ai',{...population(s,a,view),...tableInputs(a),...state,seed:s.seed,position:s.position,enabled:true,
          levelUnlocked:a.ai.levelUnlocked??Array(6).fill(true),judgeSpell:a.ai.judgeSpell??!!(a.state3c&8),judgeAbility:a.ai.judgeAbility??!!(a.state3c&16),judgeOther:a.ai.judgeOther??!!(a.state3c&32),silenced:a.ai.silenced??!!(a.rawStatus&0x100),suppressFlee:s.suppressFlee??(s.firstTurn&&s.surprise===2),legacyRestricted:!!a.ai.legacyRestricted});
        if(!yes(out.supported))throw new Boundary('AI-callback',{actor:a.actorId,definitionId:a.definitionId,selector:scalar(out.unsupportedSelector),repeatCode:scalar(out.unsupportedRepeatCode)});
        commitRandom(s,out);for(const[input,output]of Object.entries(ir.contract.feedback??{}))if(out[output])state[input]=out[output].length===1?scalar(out[output]):Array.from(out[output]);
        a.ai.cursor=scalar(state.actorCursor);group.cursor=scalar(state.groupCursor);group.usedSlots=array(state.usedSlots);a.ai.previousTargetCount=scalar(out.targetCount);a.ai.previousTargets=Array.from(out.targets);
        if(!yes(out.finished))continue;
        const id=scalar(out.nextSelectedAction),record=action(id);if(!record)throw new Boundary('action-definition',{actionId:id});
        if(record.operation===34){
          const destination=record.parameter===0?a.ai.storedTransitionId:record.parameter;
          if(definitions.monsters[destination]){a.ai.storedTransitionId=destination;a.definitionId=destination;}
          a.ai.previousTargets=emptyTargets();a.ai.previousTargetCount=0;
          state={...state,initialized:false,attempt:0,phase:0,selectedAction:-1,selectedSlot:-1,pairOther:0,blockBase:0,blockOffset:0,blockRemaining:0,previousTargets:emptyTargets(),previousTargetCount:0};continue;
        }
        return{sourceId:a.actorId,sources:[a.actorId],actionId:id,targets:Array.from(out.targets),targetCount:scalar(out.targetCount),deferred:false,selectedSlot:scalar(out.nextSelectedSlot)};
      }
    }
    async function turnBegin(s,lane){
      const out=await call(s,lane,'turnBegin',{combo:s.combo,context:s.context,usedSlots:s.groups.flatMap(g=>g.usedSlots)});
      s.combo=Array.from(out.nextCombo);s.context=Array.from(out.nextContext);s.groups.forEach((g,i)=>g.usedSlots=out.nextUsedSlots.slice(i*6,i*6+6));
      for(const a of roster(s)){a.coverById=-1;a.coverTargetId=-1;}
    }
    async function initiative(s,lane){
      const order=[];let acceptedEnemies=0;
      for(const a of roster(s)){
        if(!alive(a))continue;
        if(s.firstTurn&&((s.surprise===1&&!party(a))||(s.surprise===2&&party(a))))continue;
        if(s.firstTurn&&s.surprise===2&&!party(a)&&acceptedEnemies>0&&await draw(s,lane,100)>=67)continue;
        const out=await call(s,lane,'initiative',identityInput(s,a));commitRandom(s,out);order.push({actorId:a.actorId,initiative:scalar(out.initiative)});if(!party(a))acceptedEnemies++;
      }s.initiative=romInitiativeSort(order);
    }
    async function planCommand(s,lane,a,number){
      if(['sleep','paralysis','confusion','skip'].some(key=>value(a,key)>0))return{sourceId:a.actorId,sources:[a.actorId],actionId:503,targets:emptyTargets(),targetCount:0,deferred:false};
      if(party(a)){
        const commands=a.commands??[],selected=commands[Math.min(s.completedTurns,Math.max(0,commands.length-1))];
        if(!selected)throw new Boundary('party-command',{actor:a.actorId,turn:s.turn});
        return{sourceId:a.actorId,sources:[a.actorId],actionId:selected.actionId,targets:pad(selected.targets??[selected.target??192],8,-1),targetCount:selected.targetCount??selected.targets?.length??1,targetGroup:selected.targetGroup??actorById(s,selected.target??192)?.group??0,selectedKind:selected.kind??0,deferred:false};
      }
      if(definition(a).judgment===2)return{sourceId:a.actorId,sources:[a.actorId],actionId:2,targets:emptyTargets(),targetCount:0,deferred:true};
      return ai(s,lane,a);
    }
    async function planning(s,lane){
      const commands=[],append=command=>{commands.push(command);if(command.actionId===146||command.actionId===929){const source=actorById(s,command.sourceId),target=actorById(s,command.targets[0]);if(source&&target&&command.targetCount>0){source.coverTargetId=target.actorId;target.coverById=source.actorId;}}};
      for(const entry of s.initiative){const a=actorById(s,entry.actorId);append(await planCommand(s,lane,a,0));
        const out=await call(s,lane,'extraActions',{seed:s.seed,position:s.position,party:party(a),mode:party(a)?0:definition(a).extraActionMode,alternate:!!a.ai.alternate,enabled:true});commitRandom(s,out);a.ai.alternate=yes(out.nextAlternate);a.state3c=(a.state3c&~1)|Number(a.ai.alternate);
        for(let n=0;n<scalar(out.extraCount);n++)append(await planCommand(s,lane,a,n+1));
      }commands.forEach((c,i)=>c.planningIndex=i);s.pendingCommands=commands;
    }
    async function planningPreprocess(s,lane){
      for(const command of s.pendingCommands){const a=actorById(s,command.sourceId),record=action(command.actionId);if(!record)throw new Boundary('action-definition',{actionId:command.actionId});
        const out=await call(s,lane,'planningPreprocess',{...identityInput(s,a),actionId:command.actionId,targetCount:command.targetCount,prepaid:!!record.prepaid,mpCost:record.mpCost,mpDiscount:!!a.mpDiscount,actionCategory:record.planningCategory,spellFlag:!!record.spell,rawFlagBytes:bytes32(a.rawFlags),priorMotion:a.motion??0,priorState3c:a.state3c??0,enabled:!s.scriptBattleMode});
        commitActor(a,out);command.actionId=scalar(out.nextAction);command.targetCount=scalar(out.nextTargetCount);a.motion=scalar(out.nextMotion);a.state3c=scalar(out.nextState3c);a.rawFlags=out.nextRawFlagBytes.reduce((n,b,i)=>n+b*2**(8*i),0);
      }
    }
    function priority(s){
      const rank=p=>p===1?0:p===5?1:p===10?2:p===32?4:3;
      s.pendingCommands.sort((a,b)=>{const ra=action(a.actionId),rb=action(b.actionId),d=rank(ra?.priority)-rank(rb?.priority);if(d)return d;
        const fast=c=>!!actorById(s,c.sourceId)?.firstStrikeWeapon&&!!action(c.actionId)?.weaponFirstEligible;
        return Number(fast(b))-Number(fast(a))||a.planningIndex-b.planningIndex;});
    }
    async function targets(s,lane,a,command,record){
      let list=[],already=false;const view=await views(s,lane),own=party(a)?parties(s):enemies(s),other=party(a)?enemies(s):parties(s);
      if(command.confused&&party(a)){
        const pp=pad(own,4,null),out=await call(s,lane,'confusionTarget',{...identityInput(s,a),candidateIds:pp.map((x,i)=>x?.actorId??i),candidatePresent:pp.map(alive),targetScope:record.targetScope});
        if(!yes(out.supported))throw new Boundary('confusion-target',{actionId:record.id,sourceId:a.actorId});commitRandom(s,out);return{list:scalar(out.targetCount)?[scalar(out.targetId)]:[],already:true};
      }
      if(party(a)){
        let scope=record.targetScope;if(scope===6)scope=a.groupAttackPassive?3:2;if(scope===5)scope=a.weaponAllTargets?3:a.weaponGroupTargets?4:2;
        const chosen=command.targets[0],group=command.targetGroup??actorById(s,chosen)?.group??0;
        if(scope===1)list=[a.actorId];
        else if(record.targetSide===1){
          let selectedGroup=group;
          const liveGroups=[0,1,2].filter(g=>other.some(x=>x.group===g&&alive(x)));
          if(scope===2){const target=actorById(s,chosen);if(!target)list=[chosen];else if(alive(target))list=[chosen];else{
              if(!other.some(x=>x.group===selectedGroup&&alive(x)))selectedGroup=liveGroups[await draw(s,lane,liveGroups.length)]??0;
              const candidates=other.filter(x=>x.group===selectedGroup&&alive(x));list=[candidates[await draw(s,lane,candidates.length)]?.actorId??0];}}
          else if(scope===4){if(!other.some(x=>x.group===selectedGroup&&alive(x)))selectedGroup=liveGroups[await draw(s,lane,liveGroups.length)]??0;list=other.filter(x=>x.group===selectedGroup&&alive(x)).map(x=>x.actorId);}
          else if(scope===3)list=other.filter(alive).map(x=>x.actorId);
        }else if(record.targetSide===2){
          if([2,7,8].includes(scope))list=[record.operation===18?chosen:alive(actorById(s,chosen))?chosen:a.actorId];
          else if(scope===3||scope===4)list=own.filter(x=>member(x)&&!x.excluded&&(record.operation===33||!x.dead)).map(x=>x.actorId);
        }
      }else{
        const rage=actorById(s,a.aux[6]),judgment=definition(a).judgment;
        if(judgment!==2&&a.aux[3]&&[2,5].includes(record.targetScope)&&record.targetSide===1&&alive(rage))list=[rage.actorId];
        else if([3,4].includes(record.targetScope)){
          if(record.operation===33)throw new Boundary('group-revival-capacity',{actionId:record.id});
          const group=actorById(s,command.targets[0])?.group??a.group;
          list=(record.targetSide===2?own.filter(x=>record.targetScope!==4||x.group===group):other).filter(x=>member(x)&&!x.excluded&&([18,33].includes(record.operation)||!x.dead)).map(x=>x.actorId);
        }else list=command.targets.slice(0,command.targetCount).filter(id=>{const x=actorById(s,id);return exists(x)&&([18,33].includes(record.operation)||!x.dead&&!x.excluded);});
        if(!list.length){
          const out=await call(s,lane,'target',{...population(s,a,view),seed:s.seed,position:s.position,selectorIndex:0,targetSide:record.targetSide,targetScope:record.targetScope,repeatCode:record.repeatCode,previousTargets:command.targets,previousTargetCount:0,enabled:true});
          if(!yes(out.supported))throw new Boundary('execution-target',{actionId:record.id,actor:a.actorId,targetSide:record.targetSide,targetScope:record.targetScope});commitRandom(s,out);list=out.targets.slice(0,scalar(out.targetCount));already=true;
        }
      }
      return{list,already};
    }
    async function appeal(s,lane,a){
      if(party(a))return false;
      for(const p of parties(s).filter(alive)){
        const out=await call(s,lane,'appeal',{seed:s.seed,position:s.position,partyActor:p.actor,enemyActor:a.actor,partyObjectFlags:[Number(exists(p)),Number(!!p.dead),Number(!!p.excluded),Number(p.mentalImmune??p.tension[2]>0)],enemyObjectFlags:[Number(exists(a)),Number(!!a.dead),Number(!!a.excluded),Number(a.mentalImmune??a.tension[2]>0)],charm:p.charm,preparation:a.preparation,resistance21:a.resistances[21],effectResistances:[a.resistances[16],a.resistances[12]],enabled:true});
        commitRandom(s,out);if(out.nextPreparation)a.preparation=Array.from(out.nextPreparation);if(yes(out.success))return true;
      }return false;
    }
    async function coverTarget(s,lane,targetId,record,priorCovered){
      const population=pad(roster(s),12,null),target=actorById(s,targetId),side=target?(party(target)?parties(s):enemies(s)):[];
      const out=await call(s,lane,'coverTarget',{seed:s.seed,position:s.position,
        actors:population.flatMap(a=>a?.actor??fields.map(key=>key==='id'?-1:0)),actorPresent:population.map(exists),
        rawStatusBytes:population.flatMap(a=>bytes32(a?.rawStatus??0)),rawFlagBytes:population.flatMap(a=>bytes32(a?.rawFlags??0)),
        coverTargetIds:population.map(a=>a?.coverTargetId??-1),rosterIds:pad(side.filter(alive).map(a=>a.actorId),8,-1),rosterCount:side.filter(alive).length,
        targetId,hitPresent:true,coverAllowed:!!record.coverAllowed,priorCovered,enabled:true});
      if(!yes(out.supported))throw new Boundary('cover-target',{actionId:record.id,targetId});
      commitRandom(s,out);return{targetId:scalar(out.nextTargetId),covered:yes(out.covered),priorCovered:yes(out.nextCovered),skipTarget:yes(out.skipTarget),routeKind:scalar(out.routeKind)};
    }
    async function repeatedHitTarget(s,lane,targetId,record){
      // Matching func_ov000_02154c68 is called for each hit after shared100.
      // It may replace a dead/excluded area target; the command's selected
      // target list and its repetition draws are not replayed here.
      const target=actorById(s,targetId);
      if(exists(target)&&!target.dead&&!target.excluded)return targetId;
      const partyTarget=targetId>=0&&targetId<=3;
      if(!partyTarget&&!exists(target))return targetId;
      const candidates=(partyTarget?parties(s):enemies(s)).filter(a=>alive(a)&&(partyTarget||record.targetScope!==4||a.group===target.group));
      return candidates.length?candidates[await draw(s,lane,candidates.length)].actorId:targetId;
    }
    async function execute(s,lane,command){
      let a=actorById(s,command.sourceId);if(!alive(a)||a.wakeSkip)return;
      const beforePosition=s.position,skipPostBefore=!!(a.rawFlags&0x100),appealed=await appeal(s,lane,a);
      const unable=['sleep','paralysis','confusion','skip'].some(key=>value(a,key)>0);
      if(!party(a)&&!appealed&&((command.actionId===503&&!unable)||definition(a).judgment===2))Object.assign(command,await ai(s,lane,a));
      const recovered=await call(s,lane,'primaryRecovery',{...identityInput(s,a),actionId:command.actionId,targetCount:command.targetCount,pendingRecoveryMessage:!!a.preparation[4],recoveryMessage:!!command.recoveryMessage});
      commitRandom(s,recovered);commitActor(a,recovered);command.actionId=scalar(recovered.nextAction);command.targetCount=scalar(recovered.nextTargetCount);command.recoveryMessage=yes(recovered.nextRecoveryMessage);
      let record=action(command.actionId);const targetIr=await model(ops.targetEffect),supported=targetIr.contract.actionIds.includes(command.actionId)||EVENT_ACTIONS.has(command.actionId);
      const prepared=await call(s,lane,'prepareRoute',{...identityInput(s,a),actionId:command.actionId,targetCount:command.targetCount,mpCost:record?.mpCost??0,prepaid:!!record?.prepaid,actionCategory:record?.planningCategory??0,spellFlag:!!record?.spell,rawStatusBytes:bytes32(a.rawStatus),rawFlagBytes:bytes32(a.rawFlags),mpDiscount:!!a.mpDiscount,priorState3c:a.state3c??0,actionSupported:supported,appealSuccess:appealed,recovered:yes(recovered.recovered)});
      commitActor(a,prepared);command.actionId=scalar(prepared.nextAction);command.targetCount=scalar(prepared.nextTargetCount);
      if(prepared.nextState3c)a.state3c=scalar(prepared.nextState3c);
      if(yes(prepared.needsConfusionSelection)){
        const out=await call(s,lane,'confusion',{seed:s.seed,position:s.position,actor:a.actor,sameSideAliveCount:(party(a)?parties(s):enemies(s)).filter(alive).length,scenarioId:s.scenarioId,enabled:true});commitRandom(s,out);command.actionId=scalar(out.actionId??out.nextAction);command.targetCount=0;command.targets=emptyTargets();command.confused=true;
      }
      if(!yes(prepared.supported)&&!command.confused)throw new Boundary('common-action',{actor:a.actorId,actionId:command.actionId,definitionId:a.definitionId});
      record=action(command.actionId);let critical=false;
      const occurrence={turn:s.turn,sourceId:a.actorId,participants:[...command.sources],actionId:command.actionId,targets:[],impacts:[],startPosition:beforePosition,event:EVENT_ACTIONS.has(command.actionId),auxiliaryEvent:false};
      const capture=s.camera.mode!=='numeric-only';if(capture)occurrence.presentationBefore={source:presentationSnapshot(a)};
      {
        if(!record)throw new Boundary('action-definition',{actionId:command.actionId});
        if(party(a)&&record.planningCategory===3)throw new Boundary('party-item-inventory',{actor:a.actorId,actionId:command.actionId,reasonDetail:'Party item effects require inventory state and the original item-consumption tail.'});
        const selected=await targets(s,lane,a,command,record),begun=await call(s,lane,'commandBegin',{seed:s.seed,position:s.position,sourceActor:a.actor,actionId:command.actionId,targets:pad(selected.list,8,-1),targetCount:selected.list.length,targetsAlreadyRepeated:selected.already,mpDiscount:!!a.mpDiscount,mpProtected:!!(a.rawFlags&0x200),enabled:true});
        if(!yes(begun.supported))throw new Boundary('common-command-begin',{actor:a.actorId,actionId:command.actionId,reason:scalar(begun.reason)});
        commitRandom(s,begun);commitActor(a,begun,'Source');command.targets=Array.from(begun.nextTargets);command.targetCount=scalar(begun.nextTargetCount);occurrence.targets=command.targets.slice(0,command.targetCount);
        let priorCovered=false,previousTargetId=-1;occurrence.routes=[];
        for(const originalTargetId of occurrence.targets){
          if(!alive(a)||value(a,'hp')<=0)break;
          let targetId=originalTargetId,sharedAlreadyDrawn=false,sharedRoll=0,coverResolved=false;
          const repeatingArea=[3,4,5,7,8,11].includes(record.repeatCode)&&[3,4].includes(record.targetScope)&&[1,2].includes(record.targetSide);
          const coverState=roster(s).some(candidate=>value(candidate,'defend')>=6&&value(candidate,'defend')<=8);
          if(priorCovered||coverState||repeatingArea){
            // The caller's shared draw precedes cover selection. Forward it
            // to the effect graph so a selected guard never draws it twice.
            sharedRoll=await draw(s,lane,100);sharedAlreadyDrawn=true;
          }
          if(repeatingArea)targetId=await repeatedHitTarget(s,lane,targetId,record);
          const preCoverTarget=actorById(s,targetId);
          if(![18,33].includes(record.operation)&&(!exists(preCoverTarget)||preCoverTarget.dead)){
            if(!sharedAlreadyDrawn)await draw(s,lane,100);
            occurrence.routes.push({originalTargetId,targetId,skipped:true,reason:'missing-or-dead-target'});continue;
          }
          if(targetId!==previousTargetId){priorCovered=false;previousTargetId=targetId;}
          if(priorCovered||coverState){
            const preCoverTargetId=targetId,route=await coverTarget(s,lane,targetId,record,priorCovered);priorCovered=route.priorCovered;coverResolved=true;
            occurrence.routes.push({originalTargetId,preCoverTargetId,...route});
            if(route.skipTarget)continue;
            targetId=route.targetId;if(route.covered)occurrence.auxiliaryEvent=true;
          }
          const actualTarget=actorById(s,targetId),targetPresent=exists(actualTarget);
          const target=targetPresent?actualTarget:{actor:fields.map(key=>key==='maxHp'?1:key==='id'?255:0),aux:[0,0,0,0,0,0,-1,...Array(14).fill(0)],status:Array(7).fill(0),tension:[0,0,0],wakeSkip:0,config:Array(7).fill(0),preparation:Array(5).fill(0),resistances:Array(22).fill(100),species:0};
          if(capture&&!occurrence.presentationBefore.target)occurrence.presentationBefore.target=presentationSnapshot(target);
          const impactBefore=capture?{source:presentationSnapshot(a),target:presentationSnapshot(target)}:null;
          if(targetPresent&&target.metal&&record.operation===1)throw new Boundary('metal-damage',{actor:a.actorId,targetId,actionId:command.actionId});
          const out=await call(s,lane,'targetEffect',{seed:s.seed,position:s.position,sourceActor:a.actor,targetActor:target.actor,targetPresent,targetMetal:!!target.metal,coverResolved,sharedAlreadyDrawn,sharedRoll,sourceMagic:a.magic,sourcePackedScale:a.packedScale,
            sourceSpecies:a.species??0,sourceRawFlagsBytes:bytes32(a.rawFlags),sourceStatusKindsBytes:[a.statusKinds&255,a.statusKinds>>>8],sourceRawTimers:a.rawTimers,targetRawTimers:target.rawTimers??Array(10).fill(0),targetRawStatusBytes:bytes32(target.rawStatus??0),targetRawFlagsBytes:bytes32(target.rawFlags??0),targetRawRanks:target.rawRanks??Array(10).fill(0),targetStatusKindsBytes:[(target.statusKinds??0)&255,(target.statusKinds??0)>>>8],
            sourceHistory:[a.ai.revengeId??-1,a.ai.previousId??-1],targetHistory:[target.ai?.revengeId??-1,target.ai?.previousId??-1],sourceState3c:a.state3c??0,targetState3c:target.state3c??0,sourceAux:a.aux,targetAux:target.aux,sourceStatus:a.status,targetStatus:target.status,sourceTension:a.tension,targetTension:target.tension,sourceWakeSkip:a.wakeSkip,targetWakeSkip:target.wakeSkip,sourceConfig:a.config,targetConfig:target.config,sourcePreparation:a.preparation,targetPreparation:target.preparation,resistances:target.resistances,sourceWeapon:[...a.weapon.slice(0,3),target.species??a.weapon[3]],chargedPartyCount:charged(s),coupBlocked:!!s.coupBlocked,actionId:command.actionId,commandCritical:yes(begun.commandCritical),preparedConfusion:!!command.confused,combo:s.combo,context:s.context,enabled:true});
          if(!yes(out.supported))throw new Boundary('common-target-effect',{actor:a.actorId,targetId,actionId:command.actionId});
          commitRandom(s,out);commitActor(a,out,'Source');if(targetPresent)commitActor(target,out,'Target');if(targetPresent&&yes(out.escaped)){target.excluded=true;target.dead=false;target.deathResetPending=false;target.escapeResetPending=true;target.ai.revengeId=-1;target.ai.previousId=-1;}if(out.nextCombo)s.combo=Array.from(out.nextCombo);if(out.nextContext)s.context=Array.from(out.nextContext);critical||=yes(out.critical);
          occurrence.impacts.push({targetId,originalTargetId,damage:scalar(out.damage),internalDamage:scalar(out.internalDamage),recovery:scalar(out.recoveryAmount),critical:yes(out.critical),hp:value(target,'hp'),mp:value(target,'mp'),effectApplied:yes(out.effectApplied),
            comboCount:s.combo[1],...(out.accuracyPassed?{accuracyPassed:yes(out.accuracyPassed)}:{}),...(out.dodged?{dodged:yes(out.dodged)}:{}),...(out.guarded?{guarded:yes(out.guarded)}:{}),...(out.blindMiss?{blindMiss:yes(out.blindMiss)}:{}),...(out.operationHit?{operationHit:yes(out.operationHit)}:{}),
            ...(capture?{presentationBefore:impactBefore,presentationAfter:{source:presentationSnapshot(a),target:presentationSnapshot(target)}}:{})});
          occurrence.auxiliaryEvent||=yes(out.charged)||yes(out.angerActivated)||yes(out.escaped)||value(target,'hp')<=0;
        }
        for(const enemy of enemies(s).filter(alive)){
          const out=await call(s,lane,'enemyReaction',{seed:s.seed,position:s.position,sourceActor:a.actor,targetActor:enemy.actor,targetAux:enemy.aux,targetConfig:enemy.config,otherAngerChances:definition(enemy)?.otherAngerChances??[0,0],actionId:command.actionId,critical,enabled:true});commitRandom(s,out);commitActor(enemy,out,'Target');occurrence.auxiliaryEvent||=yes(out.angerActivated);
        }
      }
      const end=await call(s,lane,'commandEnd',{seed:s.seed,position:s.position,sourceActor:a.actor,sourceAux:a.aux,sourceConfig:a.config,sourceTension:a.tension,actionId:command.actionId,context:s.context,opponentsAlive:(party(a)?enemies(s):parties(s)).some(alive),chargedPartyCount:charged(s),coupBlocked:!!s.coupBlocked,enabled:true});
      commitRandom(s,end);commitActor(a,end,'Source');s.context=Array.from(end.nextContext);occurrence.auxiliaryEvent||=yes(end.charged);outcome(s);
      const skipPost=skipPostBefore&&!['sleep','paralysis','confusion','skip'].some(key=>value(a,key)>0);
      if(!s.finished&&!skipPost)for(const sourceId of command.sources){const source=actorById(s,sourceId);if(!exists(source))continue;
        const beforeModifiers=[source.rawStatus,source.rawFlags,source.statusKinds,...source.rawRanks];
        const out=await call(s,lane,'postStatus',{...identityInput(s,source),targetValid:alive(actorById(s,source.aux[6]))});commitRandom(s,out);commitActor(source,out);
        const afterModifiers=[source.rawStatus,source.rawFlags,source.statusKinds,...source.rawRanks];occurrence.auxiliaryEvent||=afterModifiers.some((value,i)=>value!==beforeModifiers[i]);
      }
      if(capture)occurrence.presentationAfter={source:presentationSnapshot(a),target:presentationSnapshot(actorById(s,occurrence.impacts[0]?.targetId??occurrence.targets[0]))};
      occurrence.comboCount=s.combo[1];occurrence.endPosition=s.position;occurrence.outcome=s.outcome;s.turnRecords.push(occurrence);
    }
    async function commands(s,lane){
      const redirected=roster(s).filter(a=>alive(a)&&value(a,'defend')>3&&![6,7,8].includes(value(a,'defend')));
      if(redirected.length)throw new Boundary('counter-or-reflection-routing',{actors:redirected.map(a=>({actorId:a.actorId,defend:value(a,'defend')})),reasonDetail:'Counter/reflection transfer is not yet connected to the common numerical target loop.'});
      for(const command of s.pendingCommands){if(s.finished)break;await execute(s,lane,command);}
    }
    async function finishTurn(s,lane){
      if(!s.finished){
        const apply=async(a,operation)=>{const before=s.camera.mode==='numeric-only'?null:JSON.stringify([a.actor,a.aux,a.status]),selected=s.pendingCommands.filter(c=>c.sourceId===a.actorId),out=await call(s,lane,'periodic',{...identityInput(s,a),operation,defendMpRecovery:!!a.defendMpRecovery,selectedCommandCount:selected.length,selectedCommandKind:selected[0]?.selectedKind??0});commitRandom(s,out);commitActor(a,out);if(before&&before!==JSON.stringify([a.actor,a.aux,a.status]))s.presentationExtraEvents=true;};
        for(const a of roster(s).filter(alive))await apply(a,0);
        const partySnapshot=parties(s).filter(alive);for(const operation of[1,2,3])for(const a of partySnapshot)await apply(a,operation);
        const enemySnapshot=enemies(s).filter(alive);for(const operation of[2,3])for(const a of enemySnapshot)await apply(a,operation);
        outcome(s);
        if(!s.finished){await draw(s,lane,100);for(const a of roster(s).filter(alive)){const out=await call(s,lane,'turnStatus',identityInput(s,a));commitRandom(s,out);commitActor(a,out);}}
      }
      s.completedTurns++;s.turn++;s.firstTurn=false;outcome(s);await views(s,lane);
      s.nowstate.push({turn:s.turn-1,seed:[...s.seed],position:s.position,outcome:s.outcome,actors:s.actors.map(a=>({actorId:a.actorId,hp:value(a,'hp'),mp:value(a,'mp'),actor:[...a.actor],aux:[...a.aux],status:[...a.status],tension:[...a.tension],dead:a.dead})),records:clone(s.turnRecords)});
    }
    async function presentation(s,lane){
      s.camera.records??=[];s.camera.records.push(...clone(s.turnRecords));
      if(s.camera.mode==='numeric-only'){s.camera.complete=false;s.camera.scope='Numerical transition only; camera RNG has intentionally not been applied.';return;}
      if(typeof presentationRunner==='function'){
        const result=await presentationRunner({state:clone(s),records:clone(s.turnRecords),runGraph:(name,inputs)=>Promise.all(inputs.map(input=>call(s,lane,name,input))),getModel:model});
        if(result?.seed)s.seed=Array.from(result.seed);if(result?.position!==undefined)s.position=scalar(result.position);if(result?.camera)s.camera=clone(result.camera);
        if(!result?.complete)throw new Boundary('presentation',{details:result?.unresolvedEffects??'Incomplete presentation transition'});return;
      }
      throw new Boundary('presentation-initial-state',{row4Words:s.camera.row4Words,reason:'The shared camera requires an initial visual/program state and event schedule; numeric-only is an explicit separate mode.'});
    }
    const handlers={'turn-begin':turnBegin,initiative,planning,'planning-preprocess':planningPreprocess,priority:async(s)=>priority(s),commands,finish:finishTurn,presentation};
    await Promise.all(states.map(async(s,lane)=>{try{
      outcome(s);if(s.finished){s.phase='terminal';s.requestedTurnsComplete=true;return;}for(let n=0;n<maxTurns;n++){
        if(s.camera.mode!=='numeric-only'&&s.camera.nextNumericTurnReady===false&&s.completedTurns>0)throw new Boundary('presentation-to-next-turn',{reasonDetail:'The asynchronous presentation lifecycle has not yet returned to the numerical turn boundary.'});
        s.turnRecords=[];s.presentationExtraEvents=false;
        for(const phase of program.phases){s.phase=phase.op??phase.id??phase.name;const handler=handlers[s.phase];if(!handler)throw Error('Unknown common phase '+s.phase);await handler(s,lane);}
        await onProgress?.({lane,turn:s.turn,completedTurns:s.completedTurns,position:s.position,outcome:s.outcome,graphCalls,transitions:s.transitions});if(s.finished)break;
      }s.phase='ready';s.requestedTurnsComplete=true;
    }catch(error){
      if(error instanceof Budget){s.budgetExhausted=true;s.stopReason=error.message;}
      else if(error instanceof Boundary){s.supported=false;s.unresolvedEffects.push({phase:s.phase,reason:error.message,...error.details});}
      else throw error;
    }}));
    const unresolvedEffects=states.flatMap((s,lane)=>s.unresolvedEffects.map(value=>({lane,...value}))),complete=states.every(s=>s.requestedTurnsComplete&&s.supported&&!s.budgetExhausted);
    return{rows:states,traces:trace?traces:undefined,complete,wholeBattleComplete:complete&&states.every(s=>s.finished&&s.camera.complete),numericOnly:states.every(s=>s.camera.mode==='numeric-only'),unresolvedEffects,budgetExhausted:states.some(s=>s.budgetExhausted),programHash,moduleHashes,inputHash,graphCalls,batchRows,scope:'One common actor-array controller and the same ONNX modules for all input definitions. complete means the requested bounded scope completed, not all game actions or camera states are covered.'};
  }
  return{run,programHash,moduleHashes,program};
}
