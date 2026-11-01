// Original blade-defense/equipment recoil callback, after source after-action
// recovery and before source coup/tension completion. Target records remain
// structural inputs; grouping, signed event sums, ordering and damage are ONNX.
import {Graph} from './graph-builder.mjs';
import {RandomGraph} from './transition-graphs.mjs';
import {clearCommonDeath} from './build-common-control.mjs';
import {COMMON_RAW_TIMER_FIELDS,commonRawBit} from './common-modifier-rules.mjs';
import {ACTOR_FIELDS,COMMON_AUX_FIELDS,COMMON_STATUS_FIELDS,COMMON_TENSION_FIELDS,COMMON_PREPARATION_FIELDS,COMMON_RAW_STATE_ABI,commonAuxDefault} from './common-battle-schema.mjs';
import rom from '../restored/dq9-unified/data/rom.mjs';
import {fileURLToPath} from 'node:url';

export const COMMON_BLADE_RECORD_FIELDS=Object.freeze(['recordAppended','recordPrimaryPresent','recordPrimaryDamage','recordCounter','recordTargetId']);
export const COMMON_BLADE_ACTOR_FIELDS=Object.freeze(['actorIds','actorPresent','actorDead','actorExcluded','actorBladeDefense','actorArmorRecoil','actorParty']);
const object=(names,values)=>Object.fromEntries(names.map((name,i)=>[name,values[i]]));
const pack=(g,names,values)=>g.cat(names.map(name=>values[name]));
const truth=(g,value)=>g.gt(value,0),float=(g,value)=>g.cast(value,'float32');
const signed16=(g,value)=>{const word=g.sub(value,g.mul(g.floor(g.mul(value,1/65536)),65536));return g.where(g.ge(word,32768),g.sub(word,65536),word);};

export function commonBladeDamage(g,damage,{defendAllowed,bladeDefense}){
  return g.where(g.and(defendAllowed,bladeDefense),g.mul(damage,.5),damage);
}

export function buildCommonBladeRecoil(){
  const defaults={seed:[1,0,0,0,0,0,0,0],position:1,enabled:true,present:true,recoilAllowed:true,scriptRestricted:false,sourceMetal:false,
    sourceActor:ACTOR_FIELDS.map(name=>({hp:100,maxHp:999,mp:20,maxMp:255,baseAttack:120,baseDefense:80,baseAgility:58,party:1,level:20,id:0})[name]??0),
    sourceAux:commonAuxDefault(),sourceStatus:Array(7).fill(0),sourceTension:[0,0,0],sourcePreparation:Array(5).fill(0),sourceHistory:[-1,-1],sourceWakeSkip:0,sourceState3c:0,
    sourceRawStatusBytes:Array(4).fill(0),sourceRawFlagsBytes:Array(4).fill(0),sourceStatusKindsBytes:[0,0],sourceRawRanks:Array(10).fill(0),sourceRawTimers:Array(COMMON_RAW_TIMER_FIELDS.length).fill(0),
    ...Object.fromEntries(COMMON_BLADE_RECORD_FIELDS.map(name=>[name,Array(32).fill(name==='recordTargetId'?-1:0)])),
    ...Object.fromEntries(COMMON_BLADE_ACTOR_FIELDS.map(name=>[name,Array(12).fill(name==='actorIds'?-1:0)]))};
  const g=new Graph('rom-common-blade-recoil',{schema:'dq9-common-blade-recoil-v1',defaults,inputContractVersion:1,inputDomains:{seed:{min:0,max:255,integer:true},position:{min:1,max:2147483000,integer:true}},fieldDomains:{},rawState:COMMON_RAW_STATE_ABI,
    recordCapacity:32,actorCapacity:12,groupCapacity:8,recordFields:COMMON_BLADE_RECORD_FIELDS,actorInputs:COMMON_BLADE_ACTOR_FIELDS,
    scope:'Shared original command recoil021e62cc. Appended non-counter records are grouped by target ID, preserving first-appearance order. Category0 event amounts are signed16; target state is read after all effects and after-action recovery. A source death ends later groups. No enemy identity selects an execution path.',
    authority:{romSHA256:rom.romSha256,matching:'src/Combat/Overlay_24/func_ov024_021e62cc.cpp',originalAddress:'JPN021e6b64',bladeFlag:'stats18 bit5 via JPN021e7048',excludedFlag:'stats18 bit13 via JPN021e7030',armorGetter:'matching02085400',death:'matching0215a004 /02088e80'},
    reductionRepresentation:'Per-actor fixed0/1 membership vectors feed integer MatMul reductions. Min selects the first appended record. Eight graph selection steps retain original group order; signed16 sums over32 records are exactly representable in binary32.',
    sourceIdentity:'sourceMetal and resolved armor recoil flags are explicit typed input properties. The runtime supplies all current actors, including excluded/dead ones. IDs must be unique. Equipment inventory decoding is outside this numerical boundary.',
    exclusions:['Allocator exhaustion is outside this boundary.','More than eight distinct non-counter target IDs is outside the original local recoil table and returns supported0.','A primary effect with multiple category0 events must supply their exact signed16 sum; the current command producer emits one primary event per represented operation1 iteration.']});
  const input=(name,width=1,dtype='float32')=>g.input(name,['N',width],dtype),seed=input('seed',8),position=input('position',1,'int32'),rng=new RandomGraph(g,seed,position),enabled=input('enabled',1,'bool'),present=input('present',1,'bool'),allowed=input('recoilAllowed',1,'bool'),script=input('scriptRestricted',1,'bool'),metal=input('sourceMetal',1,'bool'),
    actor=object(ACTOR_FIELDS,g.split(input('sourceActor',33),33)),aux=object(COMMON_AUX_FIELDS,g.split(input('sourceAux',21),21)),status=object(COMMON_STATUS_FIELDS,g.split(input('sourceStatus',7),7)),tension=object(COMMON_TENSION_FIELDS,g.split(input('sourceTension',3),3)),preparation=[...g.split(input('sourcePreparation',5),5)],history=input('sourceHistory',2),wake=input('sourceWakeSkip'),state3c=input('sourceState3c'),
    rawStatus=g.split(input('sourceRawStatusBytes',4),4),rawFlags=input('sourceRawFlagsBytes',4),kinds=g.split(input('sourceStatusKindsBytes',2),2),ranks=input('sourceRawRanks',10),timers=input('sourceRawTimers',COMMON_RAW_TIMER_FIELDS.length),records=Object.fromEntries(COMMON_BLADE_RECORD_FIELDS.map(name=>[name,input(name,32)])),roster=Object.fromEntries(COMMON_BLADE_ACTOR_FIELDS.map(name=>[name,g.split(input(name,12),12)]));
  const ones=g.constant(Array(32).fill(1),'float32',[32,1]),sum32=value=>g.op('MatMul',[value,ones],{},{shape:['N',1]}),indices=g.constant(Array.from({length:32},(_,i)=>i),'float32',[1,32]),
    valid=g.and(truth(g,records.recordAppended),g.not(truth(g,records.recordCounter)),g.not(g.eq(records.recordTargetId,actor.id))),primary=g.where(truth(g,records.recordPrimaryPresent),signed16(g,records.recordPrimaryDamage),0),groups=[];
  for(let i=0;i<12;i++){
    const matches=g.and(valid,g.eq(records.recordTargetId,roster.actorIds[i]),truth(g,roster.actorPresent[i])),amount=sum32(g.where(matches,primary,0)),first=g.op('Min',g.split(g.where(matches,indices,32),32));
    groups.push({first,amount,id:roster.actorIds[i],present:roster.actorPresent[i],dead:roster.actorDead[i],excluded:roster.actorExcluded[i],blade:roster.actorBladeDefense[i],armor:roster.actorArmorRecoil[i],party:roster.actorParty[i]});
  }
  const count=groups.map(row=>float(g,g.lt(row.first,32))).reduce((a,b)=>g.add(a,b)),supported=g.le(count,8),active=g.and(enabled,present,allowed,g.not(script),supported,g.eq(commonRawBit(g,rawStatus,0),0)),amounts=[],targets=[],events=[],oldHp=actor.hp;
  let died=g.eq(0,1);const remaining=groups.map(row=>row.first);
  for(let step=0;step<8;step++){
    const first=g.op('Min',remaining),selected=remaining.map(value=>g.and(g.lt(first,32),g.eq(value,first))),pick=key=>groups.map((row,i)=>g.where(selected[i],row[key],0)).reduce((a,b)=>g.add(a,b)),
      id=pick('id'),damage=pick('amount'),blade=truth(g,pick('blade')),party=truth(g,pick('party')),armor=truth(g,pick('armor')),eligible=g.and(active,g.not(died),g.lt(first,32),g.eq(pick('dead'),0),g.eq(pick('excluded'),0),g.gt(damage,0)),
      armorGate=g.and(eligible,party,g.not(blade),armor),armorRoll=rng.bounded(armorGate,100),recoil=g.and(eligible,g.or(blade,g.and(armorGate,g.lt(armorRoll,50)))),baseAmount=g.floor(g.mul(damage,g.where(blade,.25,Math.fround(.2)))),metalRoll=rng.bounded(g.and(recoil,metal),2),amount=g.where(recoil,g.where(metal,metalRoll,baseAmount),0),apply=g.gt(amount,0);
    actor.hp=g.where(apply,g.max(g.sub(actor.hp,amount),0),actor.hp);died=g.or(died,g.and(apply,g.le(actor.hp,0)));
    amounts.push(amount);targets.push(g.where(apply,id,-1));events.push(float(g,apply));remaining.forEach((value,i)=>remaining[i]=g.where(selected[i],32,value));
  }
  const next=clearCommonDeath(g,{actor,aux,status,tension},died),zero=g.mul(actor.hp,0),deadStatus=g.cat([g.add(1,g.mul(commonRawBit(g,rawStatus,2),4)),zero,zero,zero]);
  for(const index of[0,2])preparation[index]=g.where(died,0,preparation[index]);
  const values={nextSeed:rng.seed,nextPosition:rng.position,consumed:g.sub(rng.position,position),active:float(g,active),supported:float(g,supported),deathReset:float(g,died),eventCreated:float(g,events.map(value=>g.gt(value,0)).reduce((a,b)=>g.or(a,b))),selfDamage:g.sub(oldHp,actor.hp),recoilAmounts:g.cat(amounts),recoilTargetIds:g.cat(targets),recoilApplied:g.cat(events),
    nextSourceActor:pack(g,ACTOR_FIELDS,next.actor),nextSourceAux:pack(g,COMMON_AUX_FIELDS,next.aux),nextSourceStatus:pack(g,COMMON_STATUS_FIELDS,next.status),nextSourceTension:pack(g,COMMON_TENSION_FIELDS,next.tension),nextSourcePreparation:g.cat(preparation),nextSourceHistory:g.where(died,g.constant([-1,-1],'float32',[1,2]),history),nextSourceWakeSkip:wake,nextSourceState3c:state3c,
    nextSourceRawStatusBytes:g.where(died,deadStatus,g.cat(rawStatus)),nextSourceRawFlagsBytes:g.where(died,g.mul(rawFlags,0),rawFlags),nextSourceStatusKindsBytes:g.where(died,g.cat([zero,g.mul(commonRawBit(g,kinds,15),128)]),g.cat(kinds)),nextSourceRawRanks:g.where(died,g.mul(ranks,0),ranks),nextSourceRawTimers:g.where(died,g.mul(timers,0),timers)};
  for(const[name,value]of Object.entries(values))g.output(value,name);return g;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildCommonBladeRecoil().save()));
