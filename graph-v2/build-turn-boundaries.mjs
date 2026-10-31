// Small ROM turn-boundary helpers. Existing action/AI graphs remain separate.
import {readFile,writeFile} from 'node:fs/promises';
import {Graph,lcg,normalized,bounded} from './graph-builder.mjs';
import {ACTOR_FIELDS} from './rules.mjs';
import {DEFAULT_EXTENDED_ACTORS} from './extended-rules.mjs';
import {extendedInputContract} from './input-domains.mjs';
import {BOSS_STATUS_FIELDS} from './boss-action-rules.mjs';
import runtimeTables from '../restored/dq9-unified/data/runtime-tables.mjs';
import statusRules from '../restored/dq9-unified/data/status-progress.mjs';
import rom from '../restored/dq9-unified/data/rom.mjs';

const root=new URL('./',import.meta.url),commit='e0d1df250bfc554efe2fd37513a4ad3867a77b10',commonDomains={seed:{integer:true,min:0,max:255},position:{integer:true,min:1,max:4990}},
  choose=(g,values,index,otherwise=0)=>values.reduce((acc,value,i)=>g.where(g.eq(index,i),value,acc),g.constant(otherwise));

export function buildExtraActions(){
  const g=new Graph('rom-extra-actions',{
    authority:{file:'src/Combat/Overlay_0/func_ov000_0215f57c.cpp',address:'overlay0:0x02160cfc',internalDrawSite:'overlay0:0x02160d64',matchingCommit:commit,table:'data/runtime-tables.mjs extraActions'},
    scope:'Actual extra-action count helper after the first command is planned. Party returns0 without RNG. Enemy always consumes bounded2, even for fixed mode0/2/3, then toggles stats3c bit0.',
    scopeJa:'最初の行動を計画した直後の追加行動数です。敵は固定2回行動でも乱数を1回消費します。病魔パンデルムはmode2で追加1回。',
    defaults:{seed:[1,0,0,0,0,0,0,0],position:1,party:false,mode:2,alternate:false,enabled:true},
    labels:{party:'味方の呼出し',mode:'ROMの行動回数方式0〜7',alternate:'stats3c bit0の交互フラグ',enabled:'この関数を呼ぶ'},
    feedback:{seed:'nextSeed',position:'nextPosition',alternate:'nextAlternate'},inputDomains:{...commonDomains,mode:{integer:true,min:0,max:7}},defaultSteps:1,
    caller:'ProcessCombatTurn generates the actor first command, invokes this helper once, then generates that many additional commands. It is not called after each additional command.'});
  const seed=g.input('seed',['N',8]),position=g.input('position',['N',1],'int32'),party=g.input('party',['N',1],'bool'),mode=g.input('mode'),alternate=g.input('alternate',['N',1],'bool'),enabled=g.input('enabled',['N',1],'bool'),active=g.and(enabled,g.not(party)),
    draw=lcg(g,seed),roll=bounded(g,normalized(g,draw.raw),2),table=runtimeTables.extraActions.map(value=>g.constant(value));
  table[1]=g.cast(g.gt(roll,0),'float32');table[4]=g.where(alternate,1,0);table[5]=g.where(alternate,2,0);table[6]=g.where(alternate,0,1);table[7]=g.where(alternate,0,2);
  g.output(g.where(active,draw.seed,seed),'nextSeed');g.output(g.add(position,g.cast(active,'int32')),'nextPosition');g.output(g.cast(active,'int32'),'consumed');
  g.output(g.where(active,choose(g,table,mode),0),'extraCount');g.output(g.gt(g.where(active,g.cast(g.not(alternate),'float32'),g.cast(alternate,'float32')),0),'nextAlternate');return g;
}

export function buildPrimaryRecovery(){
  const inputContract=extendedInputContract(),g=new Graph('rom-primary-recovery2',{
    authority:{file:'src/Combat/Overlay_0/func_ov000_0215833c.cpp',address:'overlay0:0x02159abc',matchingCommit:commit,rules:'data/status-progress.mjs primary'},
    scope:'The actual recovery-before-action helper only: one existing actor, one unconditional bounded100 draw, paralysis/sleep/confusion priority, recovery counters and replacement event. No appeal, confusion action selection, ordinary action effect, or after-action duration advancement is included.',
    scopeJa:'行動直前の麻痺・睡眠・混乱の自然回復判定です。存在する行動者なら毎回乱数を1回消費し、回復した場合は回復イベントへ行動を差し替えます。',
    actorFields:ACTOR_FIELDS,statusFields:BOSS_STATUS_FIELDS,
    defaults:{seed:[1,0,0,0,0,0,0,0],position:1,actors:DEFAULT_EXTENDED_ACTORS,status:Array(14).fill(0),sourceIndex:0,actionId:1,targetCount:1,present:true,pendingRecoveryMessage:false,recoveryMessage:false,enabled:true},
    labels:{actors:'2人の状態',status:'毒種別と主状態の個別カウンタ',sourceIndex:'行動者0味方 /1敵',actionId:'予定していたROM行動',targetCount:'予定の対象数',present:'行動者が存在する',pendingRecoveryMessage:'stats3c bit0x40',recoveryMessage:'既存の回復メッセージフラグ',enabled:'この関数を呼ぶ'},
    inputDomains:{...commonDomains,sourceIndex:{values:[0,1],integer:true},actionId:{integer:true,min:0,max:65535},targetCount:{integer:true,min:0,max:8}},
    fieldDomains:{actors:inputContract.fieldDomains.actors,status:BOSS_STATUS_FIELDS.map(name=>({name,min:0,max:name.endsWith('poisonKind')?2:name.endsWith('Recovery')?4:255,integer:true}))},
    relations:inputContract.relations,
    feedback:{seed:'nextSeed',position:'nextPosition',actors:'nextActors',status:'nextStatus',actionId:'nextAction',targetCount:'nextTargetCount',recoveryMessage:'nextRecoveryMessage'},defaultSteps:1,
    order:'Paralysis bit8 takes priority over sleep bit16 and confusion bit32, even if its recovery counter is0. A nonzero selected recovery byte is decremented before testing. Duration bytes do not tick in this helper.',
    events:'Successful paralysis/sleep/confusion recovery changes action to900/901/938 and target count to0. Recovery does not execute the originally selected attack in the same action slot.',
    thresholds:statusRules.primary.map(rule=>({mask:rule.mask,action:rule.action,thresholds:rule.thresholds})),
    integerEquivalence:'ROM compares binary32 roll/100 against binary32 tables. For integer roll0..99 these audited thresholds give exactly the same strict comparison.',
    callerBoundary:'The caller separately clears stats3b bit2, stats3c bit0x40 and coupSkip after this helper. It can replace a still-disabled actor with action503. Neither cleanup nor blocked-action effects are silently included here.'});
  const seed=g.input('seed',['N',8]),position=g.input('position',['N',1],'int32'),actorsInput=g.input('actors',['N',66]),statusInput=g.input('status',['N',14]),sourceIndex=g.input('sourceIndex'),actionId=g.input('actionId'),targetCount=g.input('targetCount'),
    present=g.input('present',['N',1],'bool'),pending=g.input('pendingRecoveryMessage',['N',1],'bool'),oldMessage=g.input('recoveryMessage',['N',1],'bool'),enabled=g.input('enabled',['N',1],'bool'),
    actors=g.split(actorsInput,66),status=g.split(statusInput,14),selected=(slot,field)=>actors[slot*ACTOR_FIELDS.length+ACTOR_FIELDS.indexOf(field)],
    current=field=>g.where(g.eq(sourceIndex,0),selected(0,field),selected(1,field)),active=g.and(enabled,present),draw=lcg(g,seed),roll=bounded(g,normalized(g,draw.raw),100),
    primaryFields=['paralysis','sleep','confusion'],code=g.where(g.gt(current('paralysis'),0),1,g.where(g.gt(current('sleep'),0),2,g.where(g.gt(current('confusion'),0),3,0)));
  let recovered=g.eq(g.constant(0),1),nextAction=actionId;
  for(let actor=0;actor<2;actor++)for(let field=0;field<3;field++){
    const name=primaryFields[field],duration=BOSS_STATUS_FIELDS.indexOf(`a${actor}_${name}Duration`),recovery=BOSS_STATUS_FIELDS.indexOf(`a${actor}_${name}Recovery`),
      selectedRule=g.and(active,g.eq(sourceIndex,actor),g.eq(code,field+1)),advance=g.and(selectedRule,g.gt(status[recovery],0)),decrement=g.sub(status[recovery],1),
      threshold=choose(g,statusRules.primary[field].thresholds.map(value=>g.constant(value)),decrement),success=g.and(advance,g.lt(roll,threshold));
    actors[actor*ACTOR_FIELDS.length+ACTOR_FIELDS.indexOf(name)]=g.where(success,0,selected(actor,name));
    status[recovery]=g.where(success,0,g.where(advance,decrement,status[recovery]));status[duration]=g.where(success,0,status[duration]);
    recovered=g.or(recovered,success);nextAction=g.where(success,statusRules.primary[field].action,nextAction);
  }
  g.output(g.where(active,draw.seed,seed),'nextSeed');g.output(g.add(position,g.cast(active,'int32')),'nextPosition');g.output(g.cast(active,'int32'),'consumed');
  g.output(g.cat(actors),'nextActors');g.output(g.cat(status),'nextStatus');g.output(nextAction,'nextAction');g.output(g.where(recovered,0,targetCount),'nextTargetCount');
  g.output(g.or(oldMessage,g.and(active,pending)),'nextRecoveryMessage');g.output(recovered,'recovered');g.output(g.where(active,code,0),'primaryCode');
  g.output(g.and(active,g.not(recovered),g.eq(current('paralysis'),0),g.eq(current('sleep'),0),g.eq(current('confusion'),0),g.eq(current('skip'),0),g.gt(current('hp'),0)),'canRunOrdinaryAction');return g;
}

export async function buildPlanLayout(){
  const priorityGraph=JSON.parse(await readFile(new URL('rom-action-priority4.json',root),'utf8')),maxId=Math.max(...rom.actions.map(action=>action.id)),priorityTable=Array(maxId+1).fill(-1),weaponTable=Array(maxId+1).fill(0);
  for(const action of rom.actions){const bytes=Buffer.from(action.raw,'hex');priorityTable[action.id]=(bytes.readUInt32LE(44)>>>14)&63;weaponTable[action.id]=+(!!(action.w10&0x80000));}
  const g=new Graph('rom-boss-plan-layout3',{
    authority:[{file:'src/Combat/Overlay_0/ProcessCombatTurn.cpp',address:'overlay0:0x0215edbc',matchingCommit:commit},priorityGraph.contract.authority],
    scope:'Assemble exactly one party command and the two already-produced monster303 commands in the two-actor initiative order, then perform the exact ROM stable priority passes. Targets travel with their command. No RNG, AI acceptance, or action effects are executed by this layout helper.',
    scopeJa:'2人の先攻順に味方1行動・病魔2行動を並べ、実ROMの行動優先度を適用します。技と対象は閉AIの出力をそのまま受け取ります。',
    defaults:{orderIndices:[0,1],partyAction:1,enemyActions:[1,275],partyTargetCount:1,partyTargets:[192,-1,-1,-1,-1,-1,-1,-1],enemyTargetCounts:[1,1],enemyTargets:[0,-1,-1,-1,-1,-1,-1,-1,0,-1,-1,-1,-1,-1,-1,-1],partyWeaponFirst:false},
    labels:{orderIndices:'initiativeのactor配列順',partyAction:'味方の予定ROM技',enemyActions:'閉AIが決めた敵2技',partyTargetCount:'味方の対象数',partyTargets:'味方の対象8slot',enemyTargetCounts:'敵2行動の対象数',enemyTargets:'敵2行動の対象各8slot',partyWeaponFirst:'味方の装備先行条件'},
    inputDomains:{orderIndices:{integer:true,min:0,max:1},partyAction:{integer:true,min:0,max:maxId},enemyActions:{integer:true,min:0,max:maxId},partyTargetCount:{integer:true,min:0,max:8},partyTargets:{integer:true,min:-1,max:65535},enemyTargetCounts:{integer:true,min:0,max:8},enemyTargets:{integer:true,min:-1,max:65535}},
    constraints:'orderIndices must be a permutation of[0,1]; both actors participate and monster303 contributes exactly two commands. The target counts describe meaningful prefixes. This is not a general16-actor scheduler. Unknown ROM action IDs return supported=false.',
    outputs:'planActions,planSources(actual0/192),sourceIndices,planTargetCounts,planTargets(three8-slot rows),originalCommandIndices(0=party,1=firstenemy,2=secondenemy).',defaultSteps:1,feedback:{}});
  const order=g.split(g.input('orderIndices',['N',2]),2),party=g.input('partyAction'),enemy=g.split(g.input('enemyActions',['N',2]),2),partyCount=g.input('partyTargetCount'),partyTargets=g.input('partyTargets',['N',8]),enemyCounts=g.split(g.input('enemyTargetCounts',['N',2]),2),enemyTargets=g.input('enemyTargets',['N',16]),
    enemyTargetRows=[0,1].map(row=>g.op('Gather',[enemyTargets,g.constant(Array.from({length:8},(_,i)=>row*8+i),'int32',[8])],{axis:1},{shape:['N',8]})),weapon=g.input('partyWeaponFirst',['N',1],'bool');
  const partyFirst=g.eq(order[0],0),actions=[g.where(partyFirst,party,enemy[0]),g.where(partyFirst,enemy[0],enemy[1]),g.where(partyFirst,enemy[1],party)],indices=[g.where(partyFirst,0,1),g.where(partyFirst,1,2),g.where(partyFirst,2,0)],
    sourceIndices=indices.map(index=>g.where(g.eq(index,0),0,1)),sources=sourceIndices.map(index=>g.where(g.eq(index,0),0,192)),
    counts=[g.where(partyFirst,partyCount,enemyCounts[0]),g.where(partyFirst,enemyCounts[0],enemyCounts[1]),g.where(partyFirst,enemyCounts[1],partyCount)],
    targetRows=[g.where(partyFirst,partyTargets,enemyTargetRows[0]),g.where(partyFirst,enemyTargetRows[0],enemyTargetRows[1]),g.where(partyFirst,enemyTargetRows[1],partyTargets)],
    priorities=actions.map(action=>g.op('Gather',[g.constant(priorityTable,'float32',[priorityTable.length]),g.cast(action,'int32')],{axis:0},{shape:['N',1]})),
    weaponEligible=actions.map((action,i)=>g.and(weapon,g.eq(sourceIndices[i],0),g.gt(g.op('Gather',[g.constant(weaponTable,'float32',[weaponTable.length]),g.cast(action,'int32')],{axis:0},{shape:['N',1]}),0))),zero=g.mul(party,0),
    layout=g.inline(priorityGraph,{inputActions:g.cat([...actions,zero]),inputSources:g.cat([...sources,zero]),priority:g.cat([...priorities,zero]),weaponFirst:g.cat([...weaponEligible,g.gt(zero,0)]),present:g.gt(g.cat([g.add(zero,1),g.add(zero,1),g.add(zero,1),zero]),0)},'priority'),
    outputOrder=g.split(layout.orderIndices,4),outActions=[],outSources=[],outIndices=[],outCounts=[],outTargets=[],outOriginal=[];
  for(let i=0;i<3;i++){
    outActions.push(choose(g,actions,outputOrder[i],-1));outSources.push(choose(g,sources,outputOrder[i],-1));outIndices.push(choose(g,sourceIndices,outputOrder[i],-1));outCounts.push(choose(g,counts,outputOrder[i]));
    let target=g.add(g.mul(partyTargets,0),-1);for(let j=0;j<3;j++)target=g.where(g.eq(outputOrder[i],j),targetRows[j],target);outTargets.push(target);outOriginal.push(choose(g,indices,outputOrder[i],-1));
  }
  g.output(g.cat(outActions),'planActions');g.output(g.cat(outSources),'planSources');g.output(g.cat(outIndices),'sourceIndices');g.output(g.cat(outCounts),'planTargetCounts');g.output(g.cat(outTargets),'planTargets');g.output(g.cat(outOriginal),'originalCommandIndices');
  g.output(g.and(g.or(g.and(g.eq(order[0],0),g.eq(order[1],1)),g.and(g.eq(order[0],1),g.eq(order[1],0))),...priorities.map(value=>g.ge(value,0))),'supported');return g;
}

if(process.argv[1]&&new URL(`file://${process.argv[1]}`).href===import.meta.url){
  const reports=[];for(const graph of [buildExtraActions(),buildPrimaryRecovery(),await buildPlanLayout()])reports.push(await graph.save());
  await writeFile(new URL('turn-boundary-models.json',root),JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify(reports.map(({name,nodes,bytes})=>({name,nodes,bytes}))));
}
