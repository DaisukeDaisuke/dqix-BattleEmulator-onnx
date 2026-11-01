import {fileURLToPath} from 'node:url';
import {Graph} from './graph-builder.mjs';
import {ACTOR_FIELDS} from './rules.mjs';
import {sourceSHA256} from '../data/source-authority.mjs';

const directory=new URL('./',import.meta.url);
const evidence=path=>({path,sha256:sourceSHA256(path)});
const common={inputContractVersion:1,inputDomains:{},defaults:{}};

export function buildCommonPresentationAdvance(){
  const g=new Graph('rom-common-presentation-advance',{...common,
    authority:[{path:'src/Combat/Overlay_25/func_ov025_021def30.cpp',sha256:'9cdd2dc7e074f0ef5750baca6515c279dc051fc9fb469d0781e76a57f11a181e'}],
    scope:'One explicitly scheduled presentation advance. Empty auxiliary FIFO increments the command index; every advance sets presentationState=1 and clears the override pointer. No RNG or rendering completion is inferred.',
    defaults:{queueCount:0,currentIndex:0,presentationState:1,overridePresent:false,enabled:true},
    inputDomains:{queueCount:{width:1,min:0,max:5,integer:true},currentIndex:{width:1,min:0,max:2147483000,integer:true},presentationState:{width:1,min:0,max:255,integer:true}},
    feedback:{currentIndex:'nextCurrentIndex',presentationState:'nextPresentationState',overridePresent:'nextOverridePresent'}});
  const count=g.input('queueCount'),index=g.input('currentIndex',['N',1],'int32'),state=g.input('presentationState'),override=g.input('overridePresent',['N',1],'bool'),enabled=g.input('enabled',['N',1],'bool');
  g.output(g.add(index,g.cast(g.and(enabled,g.eq(count,0)),'int32')),'nextCurrentIndex');
  g.output(g.where(enabled,1,state),'nextPresentationState');
  g.output(g.and(override,g.not(enabled)),'nextOverridePresent');
  g.output(g.and(enabled,g.gt(count,0)),'requiresAuxiliaryProducer');
  return g;
}

export function buildCommonPresentationStack(){
  const g=new Graph('rom-common-presentation-stack',{...common,
    authority:[evidence('evidence-v2/ghidra/camera-planner-defined/response.json'),evidence('evidence-v2/ghidra/camera-selector-defined-v2/response.json'),evidence('src/Combat/Overlay_25/func_ov025_021db8d8.cpp'),evidence('src/Combat/Overlay_0/func_ov000_0216e678.cpp'),evidence('src/GameState/GameStateInstance.cpp')],
    scope:'Four selector stack words as eight exact u16 limbs. Forced source auxiliary-node stores and quiet preservation of the preceding planner second visual-object pointer share one rule. Pointer identities are explicit initial ABI inputs, independent of monster definitions.',
    plannerAuthority:'func_ov025_021e1048/JPN021e1958 stores each ordered visual roster record pointer at record+8; func_ov025_021e0638/JPN021e0f48 does not reorder the twelve-byte records. The second record pointer occupies selectorSP+0xc. At least two planner records and the same stack ABI are required for quiet continuation.',
    defaults:{priorU16:[0,0,0,0,0,0,0,0],programProjection:[1,10],currentActionIndex:0,sourceAuxiliaryNode:255,sourcePresent:true,sourceVisualPresent:true,programPresent:true,selectorReached:true,callFreeCamera:true,forced:true,freeCameraSelected:true,plannerReached:true,plannerSecondPresent:true,plannerSecondAddressU16:[0,0],gameStateSingletonU16:[0x33d8,0x020f],enabled:true},
    inputDomains:{priorU16:{width:8,min:0,max:65535,integer:true},programProjection:{width:2,min:0,max:65535,integer:true},currentActionIndex:{width:1,min:0,max:2147483000,integer:true},sourceAuxiliaryNode:{width:1,min:0,max:255,integer:true},plannerSecondAddressU16:{width:2,min:0,max:65535,integer:true},gameStateSingletonU16:{width:2,min:0,max:65535,integer:true}},
    feedback:{priorU16:'nextU16'}});
  const prior=g.split(g.input('priorU16',['N',8]),8),projection=g.split(g.input('programProjection',['N',2]),2),index=g.input('currentActionIndex'),aux=g.input('sourceAuxiliaryNode'),second=g.split(g.input('plannerSecondAddressU16',['N',2]),2),singleton=g.split(g.input('gameStateSingletonU16',['N',2]),2),b={};
  for(const name of ['sourcePresent','sourceVisualPresent','programPresent','selectorReached','callFreeCamera','forced','freeCameraSelected','plannerReached','plannerSecondPresent','enabled'])b[name]=g.input(name,['N',1],'bool');
  const admitted=g.and(b.selectorReached,b.callFreeCamera,g.or(b.forced,g.not(b.plannerReached),b.plannerSecondPresent)),active=g.and(b.enabled,admitted),
    bit=(v,n)=>g.eq(g.sub(g.floor(g.mul(v,1/n)),g.mul(g.floor(g.mul(v,1/(n*2))),2)),1),var5=g.not(g.and(bit(projection[0],1),bit(projection[0],2))),next=[...prior];
  const store=(row,low,high,condition=active)=>{next[row*2]=g.where(condition,low,prior[row*2]);next[row*2+1]=g.where(condition,high,prior[row*2+1]);};
  // The nested free-camera function can promote its stack argument4 to1.
  // JPN0216fe74 stores that decision at SP+0x98, the same physical row0+4.
  // Carry the computed selection, including counter/random promotion, not just
  // the earlier caller's forced flag. No new random value is drawn here.
  store(0,g.cast(b.freeCameraSelected,'float32'),0);
  // A quiet call whose dispatcher skipped the planner leaves this word as
  // preceding stack residue. Only an actual planner second-record write or
  // the forced branch's auxiliary-node store replaces it.
  store(1,g.where(b.forced,g.where(g.and(b.sourcePresent,b.sourceVisualPresent),aux,255),second[0]),g.where(b.forced,0,second[1]),g.and(active,g.or(b.forced,g.and(b.plannerReached,b.plannerSecondPresent))));
  store(2,singleton[0],singleton[1],g.and(active,g.not(g.eq(index,0))));
  store(3,g.cast(var5,'float32'),0,g.and(active,b.programPresent));
  g.output(g.cat(next),'nextU16');g.output(g.or(g.not(b.enabled),admitted),'supported');g.output(active,'active');return g;
}

export function buildCommonPresentationCommand(){
  const defaults={actionId:1,operation:1,sourceId:0,targetId:192,participantCount:1,targetCount:1,damage:1,comboCount:0,comboEnabled:true,critical:false,dodged:false,guarded:false,operationHit:true,effectApplied:true,auxiliaryEvent:false,terminal:false,partyWeaponMessage:false,enabled:true};
  for(const who of ['Source','Target'])for(const when of ['before','after']){
    defaults[when+who+'Actor']=ACTOR_FIELDS.map(name=>({hp:100,maxHp:100,mp:10,maxMp:10,baseAttack:40,baseDefense:30,baseAgility:20,level:15,id:who==='Source'?0:192,party:who==='Source'?1:0})[name]??0);
    defaults[when+who+'Aux']=[0,0,0,0,0,0,-1,...Array(14).fill(0)];defaults[when+who+'Status']=Array(7).fill(0);defaults[when+who+'WakeSkip']=0;defaults[when+who+'Tension']=[0,0,0];
  }
  defaults.afterTargetActor[0]=99;
  const g=new Graph('rom-common-presentation-command',{...common,defaults,actorFields:ACTOR_FIELDS,
    authority:[{path:'src/Combat/Overlay_0/func_ov000_02160030.cpp',sha256:'03389919486632ccf069412b3c3b72feb0376db208ddfdd7bd9825f707c93ef7'},
      {path:'src/Combat/Overlay_0/func_ov000_02157d14.cpp',role:'command population'},
      {path:'src/Combat/Overlay_24/func_ov024_021eb5d0.cpp',role:'common command header and per-target flag accumulation'},
      {path:'src/Combat/Overlay_24/func_ov024_021e6a90.cpp',role:'computed hit record and combo byte'}],
    scope:'Shared command-header metadata from computed target impacts and before/after actor operands. Nonlethal operation1 damage, including severe-poison application, and failed rank/blind/barrier effects with unchanged state use the common header rule. Computed critical/dodge/guard flags and up to eight targets are folded in original target order. Impact/message buffers, other successful state changes and redirected target snapshots remain explicit boundaries. Action IDs and encounter population do not select a producer.',
    commandFields:['actionId','messageId','sourceId','targetId','flagsA','flagsB'],
    inputDomains:{actionId:{width:1,min:0,max:65535,integer:true},damage:{width:1,min:0,max:65535,integer:true},comboCount:{width:1,min:0,max:127,integer:true}}});
  const action=g.input('actionId'),operation=g.input('operation'),sourceId=g.input('sourceId'),targetId=g.input('targetId'),participants=g.input('participantCount'),targets=g.input('targetCount'),damage=g.input('damage'),combo=g.input('comboCount'),b={};
  for(const name of ['comboEnabled','critical','dodged','guarded','operationHit','effectApplied','auxiliaryEvent','terminal','partyWeaponMessage','enabled'])b[name]=g.input(name,['N',1],'bool');
  const state={};for(const who of ['Source','Target'])for(const when of ['before','after'])for(const [type,width]of [['Actor',33],['Aux',21],['Status',7],['WakeSkip',1],['Tension',3]])state[when+who+type]=g.split(g.input(when+who+type,['N',width]),width);
  const bs=state.beforeSourceActor,as=state.afterSourceActor,bt=state.beforeTargetActor,at=state.afterTargetActor,
    poisonIndex=ACTOR_FIELDS.indexOf('poison'),poisonApplied=g.and(g.eq(operation,1),g.eq(bt[poisonIndex],0),g.eq(at[poisonIndex],1),g.eq(state.beforeTargetStatus[0],0),g.eq(state.afterTargetStatus[0],2)),
    failedStatus=g.and(g.or(...[3,4,5,19,22,23].map(op=>g.eq(operation,op))),g.not(b.operationHit),g.not(b.effectApplied),g.eq(damage,0)),
    checks=[g.or(g.eq(operation,1),failedStatus),g.eq(participants,1),g.ge(targets,1),g.le(targets,8),g.ge(damage,0),g.gt(at[0],0),g.eq(g.sub(bt[0],damage),at[0]),g.eq(bs[32],sourceId),g.eq(bt[32],targetId),g.not(g.eq(bs[17],bt[17])),g.not(b.auxiliaryEvent),g.not(b.terminal),g.not(b.partyWeaponMessage)];
  for(const name of ['attackRank','defenseRank','blind','sleep','confusion','paralysis','skip','defend','acrobat','doubleDodge','doubleGuard','hpRegen','mpRegen','agilityRank','hpEquipmentRegen'])for(const row of [bs,bt])checks.push(g.eq(row[ACTOR_FIELDS.indexOf(name)],0));
  for(let i=0;i<33;i++){checks.push(g.eq(bs[i],as[i]));if(i!==0)checks.push(g.or(g.eq(bt[i],at[i]),i===poisonIndex?poisonApplied:g.eq(0,1)));}
  for(const who of ['Source','Target']){
    for(const type of ['Aux','Status','WakeSkip'])for(let i=0;i<state['before'+who+type].length;i++)checks.push(g.or(g.eq(state['before'+who+type][i],state['after'+who+type][i]),who==='Target'&&type==='Status'&&i===0?poisonApplied:g.eq(0,1)));
    for(let i=0;i<6;i++)checks.push(g.eq(state['before'+who+'Aux'][i],0));
    for(const when of ['before','after'])for(const value of state[when+who+'Tension'])checks.push(g.eq(value,0));
    checks.push(g.or(g.and(g.eq(state['before'+who+'Actor'][poisonIndex],0),g.eq(state['before'+who+'Status'][0],0)),g.and(g.eq(state['before'+who+'Actor'][poisonIndex],1),g.eq(state['before'+who+'Status'][0],2))),g.eq(state['before'+who+'WakeSkip'][0],0));
  }
  // USA021eb5d0 initializes command+0xb bit3. Positive combo-eligible
  // postprocess021e6a90 clears it, then writes a nonzero combo in bits5..7.
  // The per-target critical branch sets command+0xa bit0 independently.
  const admitted=g.and(...checks),active=g.and(b.enabled,admitted),zero=g.mul(action,0),flagsB=g.where(g.and(b.comboEnabled,g.gt(damage,0)),g.mul(g.min(combo,3),32),8),
    flagsA=g.add(g.cast(b.critical,'float32'),g.add(g.mul(g.cast(b.guarded,'float32'),2),g.mul(g.cast(b.dodged,'float32'),4)));
  g.output(g.cat([action,zero,sourceId,targetId,flagsA,flagsB]),'command');g.output(g.or(g.not(b.enabled),admitted),'supported');g.output(active,'wrote');return g;
}

export function buildCommonPeriodicPresentation(){
  const capacity=8,actorWidth=ACTOR_FIELDS.length;
  const g=new Graph('rom-common-periodic-presentation',{...common,
    authority:[{path:'src/Combat/Overlay_0/func_ov000_0215a23c.cpp',sha256:'ed331a3b8cd20d268ad96075c32711846d808dbadf17a2e3937e786fe0a26de0'},
      {path:'src/Combat/Overlay_0/func_ov000_0215c758.cpp',sha256:'37be63b19166c2dd9aaf5f975a0473050a344ba0b9ce063257fe81681574928d'}],
    scope:'One common turn-tail group to command metadata, exact impact payloads and message IDs. Party HP gains produce930/931, party MP gains932/933, severe poison934. All matching targets share one record in roster order. Scratch flags are retained across groups, including zero-delta HP/MP writes. Enemy MP gain creates no command. Nonlethal unchanged-status groups only. Payloads exclude pointer allocation and linked-list construction.',
    actorFields:ACTOR_FIELDS,capacity,
    defaults:{operation:3,partyGroup:true,present:Array(capacity).fill(false),beforeActors:Array(capacity*actorWidth).fill(0),afterActors:Array(capacity*actorWidth).fill(0),beforeStatus:Array(capacity*7).fill(0),afterStatus:Array(capacity*7).fill(0),requestedAmounts:Array(capacity).fill(0),rawStatusU16:Array(capacity*2).fill(0),statusKinds:Array(capacity).fill(0),scratchFlagsU16:Array(capacity*4).fill(0),messageData:Array(7).fill(0),metadataInputsComplete:false,enabled:true},
    inputDomains:{operation:{width:1,min:1,max:3,integer:true}},
    commandFields:['actionId','messageId','sourceId','firstTargetId','flagsA','flagsB']});
  const operation=g.input('operation'),partyGroup=g.input('partyGroup',['N',1],'bool'),enabled=g.input('enabled',['N',1],'bool'),present=g.split(g.input('present',['N',capacity],'bool'),capacity),
    before=g.split(g.input('beforeActors',['N',capacity*actorWidth]),capacity*actorWidth),after=g.split(g.input('afterActors',['N',capacity*actorWidth]),capacity*actorWidth),
    bs=g.split(g.input('beforeStatus',['N',capacity*7]),capacity*7),as=g.split(g.input('afterStatus',['N',capacity*7]),capacity*7),
    hp=g.eq(operation,1),mp=g.eq(operation,2),poison=g.eq(operation,3),zero=g.mul(operation,0),checks=[g.or(hp,mp,poison),g.or(g.not(hp),partyGroup)],hits=[],prefix=[],ids=[],amounts=[];
  const requested=g.split(g.input('requestedAmounts',['N',capacity]),capacity),rawStatus=g.split(g.input('rawStatusU16',['N',capacity*2]),capacity*2),kinds=g.split(g.input('statusKinds',['N',capacity]),capacity),messages=g.split(g.input('messageData',['N',7]),7),metadataInputsComplete=g.input('metadataInputsComplete',['N',1],'bool');
  let scratch=g.split(g.input('scratchFlagsU16',['N',capacity*4]),capacity*4),count=zero;
  const orMask=(value,mask)=>{const bit=g.sub(g.floor(g.mul(value,1/mask)),g.mul(g.floor(g.mul(value,1/(mask*2))),2));return g.add(value,g.mul(g.sub(1,bit),mask));};
  for(let i=0;i<capacity;i++){
    const b=before.slice(i*actorWidth,(i+1)*actorWidth),a=after.slice(i*actorWidth,(i+1)*actorWidth),s=bs.slice(i*7,(i+1)*7),active=g.and(enabled,present[i]),alive=g.gt(b[0],0),
      severe=g.and(poison,alive,g.gt(b[ACTOR_FIELDS.indexOf('poison')],0),g.eq(s[0],2)),
      hit=g.and(active,g.or(g.and(partyGroup,hp,g.gt(a[0],b[0])),g.and(partyGroup,mp,g.gt(a[2],b[2])),severe));
    checks.push(g.or(g.not(active),g.and(g.eq(g.gt(b[17],0),partyGroup),g.ge(a[0],0),g.ge(a[2],0))));
    for(let j=0;j<actorWidth;j++)if(j!==0&&j!==2)checks.push(g.or(g.not(active),g.eq(b[j],a[j])));
    for(let j=0;j<7;j++)checks.push(g.or(g.not(active),g.eq(s[j],as[i*7+j])));
    checks.push(g.or(g.not(g.and(active,severe)),g.and(g.gt(a[0],0),g.eq(g.sub(b[0],g.min(g.max(g.floor(g.mul(b[1],1/16)),1),999)),a[0]))));
    const writeScratch=g.and(active,g.or(g.and(partyGroup,g.or(hp,mp),g.gt(requested[i],0)),severe));
    scratch=scratch.map((value,j)=>{
      const limb=j%4,updated=g.where(hp,limb===2?64:0,g.where(mp,limb===2?orMask(value,8):value,limb===0?orMask(value,2):value));
      return g.where(g.and(writeScratch,g.eq(count,Math.floor(j/4))),updated,value);
    });
    hits.push(hit);count=g.add(count,g.cast(hit,'float32'));prefix.push(count);ids.push(b[32]);
    amounts.push(g.where(poison,g.min(g.max(g.floor(g.mul(b[1],1/16)),1),999),g.where(hp,g.sub(b[0],a[0]),g.sub(b[2],a[2]))));
  }
  const compact=(values,fallback)=>Array.from({length:capacity},(_,slot)=>{
    let value=g.add(zero,fallback);for(let i=0;i<capacity;i++)value=g.where(g.and(hits[i],g.eq(prefix[i],slot+1)),values[i],value);return value;
  });
  const targets=compact(ids,-1),deltas=compact(amounts,0),action=g.where(hp,g.where(g.eq(count,1),930,931),g.where(mp,g.where(g.eq(count,1),932,933),934)),admitted=g.and(...checks),wrote=g.and(enabled,admitted,g.gt(count,0));
  g.output(g.cat([action,zero,targets[0],targets[0],zero,zero]),'command');g.output(g.cat(targets),'targets');g.output(count,'targetCount');g.output(g.cat(deltas),'amounts');
  const mod=(value,n)=>g.sub(value,g.mul(g.floor(g.mul(value,1/n)),n)),short=value=>{const u=mod(value,65536);return[mod(u,256),g.floor(g.mul(u,1/256))];};
  const columns=Array.from({length:actorWidth},(_,j)=>compact(Array.from({length:capacity},(_,i)=>after[i*actorWidth+j]),0)),statusColumns=[0,1].map(j=>compact(Array.from({length:capacity},(_,i)=>rawStatus[i*2+j]),0)),kindColumn=compact(kinds,0),payloads=[];
  for(let i=0;i<capacity;i++){
    const payload=Array(36).fill(zero),store=(offset,values)=>values.forEach((value,j)=>payload[offset+j]=value);
    store(0,scratch.slice(i*4,i*4+4).flatMap(short));store(12,[deltas[i],columns[0][i],columns[2][i],columns[1][i],columns[3][i]].flatMap(short));store(24,[statusColumns[0][i],statusColumns[1][i]].flatMap(short));
    store(28,[zero,mod(g.floor(g.mul(kindColumn[i],.25)),16),mod(kindColumn[i],4)]);
    payloads.push(...payload.map(value=>g.where(g.and(wrote,metadataInputsComplete,g.lt(i,count)),value,0)));
  }
  g.output(g.cat(scratch),'nextScratchFlagsU16');g.output(g.cat(payloads),'impactPayloadBytes');
  g.output(g.where(poison,0,g.where(hp,g.where(g.eq(count,1),messages[0],messages[1]),g.where(g.eq(count,1),messages[2],messages[3]))),'startMessage');
  g.output(g.cat([g.where(poison,messages[4],0),g.where(poison,messages[5],0)]),'impactMessageIds');g.output(g.where(poison,2,0),'impactMessageCount');
  g.output(g.and(metadataInputsComplete,admitted),'metadataSupported');
  g.output(g.or(g.not(enabled),admitted),'supported');g.output(wrote,'wrote');return g;
}

export async function buildCommonPresentation(){
  const reports=[];for(const g of [buildCommonPresentationAdvance(),buildCommonPresentationStack(),buildCommonPresentationCommand(),buildCommonPeriodicPresentation()])reports.push(await g.save(directory));
  return reports.map(x=>({name:x.name,nodes:x.nodes,bytes:x.bytes}));
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildCommonPresentation()));
