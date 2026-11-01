// Shared command-result reductions and source after-action state changes.
// Record identity is supplied by the structural caller; all numeric reduction,
// rounding, clamping and death-state changes remain graph operations.
import {Graph} from './graph-builder.mjs';
import {clearCommonDeath} from './build-common-control.mjs';
import {COMMON_RAW_TIMER_FIELDS,commonRawBit} from './common-modifier-rules.mjs';
import {ACTOR_FIELDS,COMMON_AUX_FIELDS,COMMON_STATUS_FIELDS,COMMON_TENSION_FIELDS,COMMON_PREPARATION_FIELDS,COMMON_HISTORY_FIELDS,COMMON_RAW_STATE_ABI,commonAuxDefault} from './common-battle-schema.mjs';
import rom from '../restored/dq9-unified/data/rom.mjs';
import {fileURLToPath} from 'node:url';

export const COMMON_AFTER_ACTION_RECORD_CAPACITY=32;
export const COMMON_AFTER_ACTION_RECORD_FIELDS=Object.freeze([
  'recordAllocated','recordAppended','recordPrimaryPresent','recordPrimaryDamage',
  'recordDamage','recordCounter','recordPostprocessed','recordEffectiveAction',
  'recordScratchWritten','recordScratch'
]);
export const COMMON_AFTER_ACTION_RULES=Object.freeze(rom.actions.map(action=>({
  actionId:action.id,afterAction:Buffer.from(action.raw,'hex').readUInt32LE(44)>>>10&15,
  firstRecord:Number(action.id===145),recoilFromDamage:Number(action.id===175),recoilFromSelector:Number(action.id===148)
})).map(Object.freeze));
const ruleMap=new Map(COMMON_AFTER_ACTION_RULES.map(row=>[row.actionId,row])),maxAction=Math.max(...ruleMap.keys());
const object=(names,values)=>Object.fromEntries(names.map((name,i)=>[name,values[i]]));
const pack=(g,names,value)=>g.cat(names.map(name=>value[name]));
const float=(g,value)=>g.cast(value,'float32');
const truth=(g,value)=>g.gt(value,0);
const signed16=(g,value)=>{const word=g.sub(value,g.mul(g.floor(g.mul(value,1/65536)),65536));return g.where(g.ge(word,32768),g.sub(word,65536),word);};

export function buildCommonAfterAction(){
  const defaults={seed:[1,0,0,0,0,0,0,0],position:1,enabled:true,present:true,counterOccurred:false,actionId:79,
    sourceActor:ACTOR_FIELDS.map(name=>({hp:100,maxHp:999,mp:20,maxMp:255,baseAttack:120,baseDefense:80,baseAgility:58,party:1,level:20,id:0})[name]??0),
    sourceAux:commonAuxDefault(),sourceStatus:Array(7).fill(0),sourceTension:[0,0,0],sourcePreparation:[0,0,0,0,0],sourceHistory:[-1,-1],sourceWakeSkip:0,sourceState3c:0,
    sourceRawStatusBytes:[0,0,0,0],sourceRawFlagsBytes:[0,0,0,0],sourceStatusKindsBytes:[0,0],sourceRawRanks:Array(10).fill(0),sourceRawTimers:Array(COMMON_RAW_TIMER_FIELDS.length).fill(0),
    ...Object.fromEntries(COMMON_AFTER_ACTION_RECORD_FIELDS.map(name=>[name,Array(COMMON_AFTER_ACTION_RECORD_CAPACITY).fill(0)]))};
  const g=new Graph('rom-common-after-action',{
    schema:'dq9-common-after-action-v2',scope:'The shared source after-action boundary after all-enemy anger and before source coup/tension completion. Represents afterAction1 MP drain, afterAction4 HP drain, and both original damage-derived and selector-produced recoil rows of afterAction3. No boss identity selects execution.',
    recordFields:COMMON_AFTER_ACTION_RECORD_FIELDS,recordCapacity:COMMON_AFTER_ACTION_RECORD_CAPACITY,actorFields:ACTOR_FIELDS,auxFields:COMMON_AUX_FIELDS,statusFields:COMMON_STATUS_FIELDS,tensionFields:COMMON_TENSION_FIELDS,preparationFields:COMMON_PREPARATION_FIELDS,historyFields:COMMON_HISTORY_FIELDS,rawState:COMMON_RAW_STATE_ABI,
    recordSemantics:'Each slot is one entered original target iteration, after source eligibility and target-record allocation/zeroing, before shared100. Allocated skipped targets therefore reset the last-record sum to0. Appended marks the actual linked target record. Represented operation1 emits one category0 primary event per processed iteration, including zero/miss/guard. Auxiliary category1/2 messages are excluded. Repeated target IDs never merge category0 records. ScratchWritten/Scratch are outputs from the actually executed selector graph, scattered unchanged into their iteration slots; they are never inferred from endpoint HP.',
    reductionRepresentation:'Fixed0/1 prefix matrices find the first appended and last allocated/postprocessed slots. Their integer counts are at most32, so matrix multiplication is exact. The selected first/last reductions each have at most one nonzero term. The only state-changing sum across records is MP drain row132, whose original per-hit cap1999 bounds32-hit sums by63968.',
    rounding:'HP drain sums signed16 event amounts in the selected target record then arithmetic-shifts by2. MP drain uses the caller sum of non-counter amounts then shifts by3. Recoil175 overwrites scratch with trunc(binary32(last postprocessed damage*.25)); a later accuracy miss preserves scratch, while an accuracy-passed guarded hit overwrites it with0. Recoil148 selects the last explicit scratch output from the selector35 graph, which already performed sourceHP*.8 rounding and +2. Input integer sums are exact below2^24.',
    authority:{romSHA256:rom.romSha256,matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10',caller:'src/Combat/Overlay_24/func_ov024_021eb5d0.cpp',hpDrain:'src/Combat/Overlay_24/func_ov024_021e5988.cpp',mpDrain:'src/Combat/Overlay_24/func_ov024_021e56c0.cpp',recoil:'src/Combat/Overlay_24/func_ov024_021e57e0.cpp',recoilScratch:'src/Combat/Overlay_24/func_ov024_021e6a90.cpp',selectorScratch:'src/Combat/Overlay_24/func_ov024_021d923c.cpp',targetAppend:'src/Combat/Overlay_0/func_ov000_021600cc.cpp',death:'src/Combat/Main/func_02088e80.cpp'},
    inputContractVersion:2,inputDomains:{seed:{min:0,max:255,integer:true,width:8},position:{min:1,max:2147483000,integer:true},actionId:{min:0,max:maxAction,integer:true},enabled:{values:[true,false,0,1]},present:{values:[true,false,0,1]},counterOccurred:{values:[true,false,0,1]}},fieldDomains:{},defaults,feedback:{},
    exclusions:['Other after-action handler indices remain unsupported.','Allocation failure and extra primary operation events require a corresponding structural record producer. This module does not infer records from HP deltas.','Weapon lifedrain and blade-defense recoil are separate caller callbacks and are not represented here.']
  });
  const input=(name,width=1,dtype='float32')=>g.input(name,['N',width],dtype),seed=input('seed',8),position=input('position',1,'int32'),enabled=input('enabled',1,'bool'),present=input('present',1,'bool'),counter=input('counterOccurred',1,'bool'),action=input('actionId'),
    actor=object(ACTOR_FIELDS,g.split(input('sourceActor',33),33)),aux=object(COMMON_AUX_FIELDS,g.split(input('sourceAux',21),21)),status=object(COMMON_STATUS_FIELDS,g.split(input('sourceStatus',7),7)),tension=object(COMMON_TENSION_FIELDS,g.split(input('sourceTension',3),3)),preparation=[...g.split(input('sourcePreparation',5),5)],history=input('sourceHistory',2),wakeSkip=input('sourceWakeSkip'),state3c=input('sourceState3c'),
    rawStatus=g.split(input('sourceRawStatusBytes',4),4),rawFlags=input('sourceRawFlagsBytes',4),kinds=g.split(input('sourceStatusKindsBytes',2),2),ranks=input('sourceRawRanks',10),timers=input('sourceRawTimers',COMMON_RAW_TIMER_FIELDS.length),records=Object.fromEntries(COMMON_AFTER_ACTION_RECORD_FIELDS.map(name=>[name,input(name,COMMON_AFTER_ACTION_RECORD_CAPACITY)]));
  const lookup=key=>g.op('Gather',[g.constant(Array.from({length:maxAction+1},(_,id)=>ruleMap.get(id)?.[key]??0),'float32',[maxAction+1]),g.cast(g.min(maxAction,g.max(action,0)),'int32')],{axis:0},{shape:['N',1]}),after=lookup('afterAction'),recoilDamageRule=truth(g,lookup('recoilFromDamage')),recoilSelectorRule=truth(g,lookup('recoilFromSelector')),recoilRule=g.or(recoilDamageRule,recoilSelectorRule),
    exists=g.op('Gather',[g.constant(Array.from({length:maxAction+1},(_,id)=>Number(ruleMap.has(id))),'float32',[maxAction+1]),g.cast(g.min(maxAction,g.max(action,0)),'int32')],{axis:0},{shape:['N',1]}),
    supported=g.and(g.ge(action,0),g.le(action,maxAction),g.eq(action,g.floor(action)),truth(g,exists),g.or(g.eq(after,0),g.eq(after,1),g.eq(after,2),g.eq(after,4),g.and(g.eq(after,3),recoilRule)));
  const capacity=COMMON_AFTER_ACTION_RECORD_CAPACITY,matrix=before=>g.constant(Array.from({length:capacity*capacity},(_,index)=>{const source=Math.floor(index/capacity),target=index%capacity;return Number(before?source<target:source>target);}),'float32',[capacity,capacity]),beforeMatrix=matrix(true),afterMatrix=matrix(false),ones=g.constant(Array(capacity).fill(1),'float32',[capacity,1]),
    product=(value,weights,width)=>g.op('MatMul',[value,weights],{},{shape:['N',width]}),sum=value=>product(value,ones,1),
    firstMask=flags=>g.and(flags,g.eq(product(float(g,flags),beforeMatrix,capacity),0)),lastMask=flags=>g.and(flags,g.eq(product(float(g,flags),afterMatrix,capacity),0)),
    allocated=truth(g,records.recordAllocated),emitted=g.and(allocated,truth(g,records.recordPrimaryPresent)),appended=g.and(allocated,truth(g,records.recordAppended)),eventDamage=g.where(emitted,signed16(g,records.recordPrimaryDamage),0),
    total=sum(g.where(g.and(emitted,g.not(truth(g,records.recordCounter))),records.recordDamage,0)),first=sum(g.where(firstMask(appended),eventDamage,0)),last=sum(g.where(lastMask(allocated),eventDamage,0)),
    postprocessed=g.and(allocated,truth(g,records.recordPostprocessed),g.eq(records.recordEffectiveAction,175)),selectorWritten=g.and(allocated,truth(g,records.recordScratchWritten)),
    damageScratch=sum(g.where(lastMask(postprocessed),g.floor(g.mul(records.recordDamage,.25)),0)),selectorScratch=sum(g.where(lastMask(selectorWritten),records.recordScratch,0)),scratch=g.where(recoilSelectorRule,selectorScratch,damageScratch);
  const active=g.and(enabled,present,supported,g.not(counter),g.gt(actor.hp,0),g.eq(commonRawBit(g,rawStatus,0),0)),hpAmount=g.floor(g.mul(g.where(truth(g,lookup('firstRecord')),first,last),.25)),mpAmount=g.floor(g.mul(total,.125)),
    heal=g.and(active,g.eq(after,4),g.gt(hpAmount,0)),restoreMp=g.and(active,g.eq(after,1),g.gt(mpAmount,0)),recoil=g.and(active,g.eq(after,3),recoilRule),oldHp=actor.hp,oldMp=actor.mp;
  actor.hp=g.where(heal,g.min(g.add(actor.hp,hpAmount),actor.maxHp),g.where(recoil,g.max(g.sub(actor.hp,scratch),0),actor.hp));
  actor.mp=g.where(restoreMp,g.min(g.add(actor.mp,mpAmount),actor.maxMp),actor.mp);
  const died=g.and(recoil,g.le(actor.hp,0)),next=clearCommonDeath(g,{actor,aux,status,tension},died),zero=g.mul(actor.hp,0),deadStatus=g.cat([g.add(1,g.mul(commonRawBit(g,rawStatus,2),4)),zero,zero,zero]);
  for(const index of[0,2])preparation[index]=g.where(died,0,preparation[index]);
  const outputs={nextSeed:seed,nextPosition:position,consumed:g.sub(position,position),supported:float(g,supported),active:float(g,active),
    nextSourceActor:pack(g,ACTOR_FIELDS,next.actor),nextSourceAux:pack(g,COMMON_AUX_FIELDS,next.aux),nextSourceStatus:pack(g,COMMON_STATUS_FIELDS,next.status),nextSourceTension:pack(g,COMMON_TENSION_FIELDS,next.tension),nextSourcePreparation:g.cat(preparation),nextSourceHistory:g.where(died,g.constant([-1,-1],'float32',[1,2]),history),nextSourceWakeSkip:wakeSkip,nextSourceState3c:state3c,
    nextSourceRawStatusBytes:g.where(died,deadStatus,g.cat(rawStatus)),nextSourceRawFlagsBytes:g.where(died,g.mul(rawFlags,0),rawFlags),nextSourceStatusKindsBytes:g.where(died,g.cat([zero,g.mul(commonRawBit(g,kinds,15),128)]),g.cat(kinds)),nextSourceRawRanks:g.where(died,g.mul(ranks,0),ranks),nextSourceRawTimers:g.where(died,g.mul(timers,0),timers),
    sumNonCounterDamage:total,firstRecordDamage:first,lastRecordDamage:last,recoilScratch:scratch,recoveryAmount:g.where(heal,hpAmount,g.where(restoreMp,mpAmount,0)),hpRecovered:g.where(heal,g.sub(actor.hp,oldHp),0),mpRecovered:g.where(restoreMp,g.sub(actor.mp,oldMp),0),selfDamage:g.where(recoil,scratch,0),deathReset:float(g,died),eventCreated:float(g,g.or(heal,restoreMp,recoil))};
  for(const[name,value]of Object.entries(outputs))g.output(value,name);
  return g;
}

if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildCommonAfterAction().save()));
