// Shared source/target routing. No encounter or monster identity selects code.
import {fileURLToPath} from 'node:url';
import {Graph} from './graph-builder.mjs';
import {RandomGraph} from './transition-graphs.mjs';
import {COMMON_ACTION_RULES} from './build-common-action.mjs';
import {commonCriticalThreshold} from './common-critical-rules.mjs';

// Original job table at JPN overlay0:02183b70. This is common ROM data,
// independent of the encounter and of the target's actor slot.
export const COMMON_COUNTER_JOB_DENOMINATORS=Object.freeze([0,32,64,128,32,64,64,16,32,32,64,64,32]);
const byte={min:0,max:255,integer:true},id={min:-32768,max:32767,integer:true},bool={values:[false,true,0,1]};
const bit=(g,bytes,n)=>{const q=g.floor(g.mul(bytes[n>>>3],2**-(n&7)));return g.gt(g.sub(q,g.mul(g.floor(g.mul(q,.5)),2)),0);};
export function buildCommonRedirectTarget(){
  const g=new Graph('rom-common-redirect-target',{
    inputContractVersion:1,
    authority:[{file:'src/Combat/Overlay_24/func_ov024_021e9f68.cpp',address:'JPN0x021ea734'},
      {file:'src/Combat/Overlay_0/func_ov000_02156558.cpp',role:'acrobat shared-roll and skill counter predicate'},
      {file:'src/Combat/Overlay_24/func_ov024_021ea500.cpp',role:'wide ordinary weapon suppression'}],
    scope:'One original redirect-helper call after shared100 and cover selection. Magic reflection, breath reflection, defend4 counter, defend5/9 redirect, cached counter decisions and acrobat counter are shared rules. Live party/enemy roster order and resolved equipment predicates are input state.',
    ordering:'Magic status then equipment quarter-roll; breath status; incapacity gate; defend4/5/9; party acrobat/skill counter. Defend9 consumes a bounded5 side choice even when the actual redirect target is cached. Defend5 skips target selection RNG when cached.',
    cache:'priorCounterState and priorRedirectTarget belong to the pre-redirect target within this command. New command resets them to0 and-1. Counter4 writes state1; automatic counter evaluates only state0 and stores1 or2.',
    boundary:'Caller supplies eligible ordered rosters and equipment predicates from initial actor configuration. It must perform redirected critical checks, combo reset, original-source command cleanup and numeric effect execution separately. No complete action is implied by this helper.',
    defaults:{seed:[1,0,0,0,0,0,0,0],position:1,enabled:true,sourceId:192,targetId:0,targetPresent:true,hitPresent:true,
      targetRawStatusBytes:[0,0,0,0],targetRawFlagsBytes:[0,0,0,0],targetDefend:0,actionId:1,targetSide:1,magicReflectable:false,breathReflectable:false,counterable:true,
      sourceWideWeapon:false,targetMagicReflectEquipment:false,targetCounterSkill:false,targetJob:0,scenarioId:0,sharedRoll:0,priorCounterState:0,priorRedirectTarget:-1,allowTension:true,substitute:false,specialReflect:false,
      partyRosterIds:[0,-1,-1,-1],partyRosterCount:1,enemyRosterIds:[192,-1,-1,-1,-1,-1,-1,-1],enemyRosterCount:1,combo:[0,0,0,-1,0,0]},
    inputDomains:{},feedback:{seed:'nextSeed',position:'nextPosition',priorCounterState:'nextCounterState',priorRedirectTarget:'nextRedirectTarget',allowTension:'nextAllowTension',substitute:'nextSubstitute',specialReflect:'nextSpecialReflect'}
  });
  const input=(name,width=1,dtype='float32',domain)=>{g.contract.inputDomains[name]={...(domain??(dtype==='bool'?bool:byte)),width};return g.input(name,['N',width],dtype);};
  const seed=input('seed',8),position=input('position',1,'int32',{min:0,max:2147483000,integer:true}),enabled=input('enabled',1,'bool'),sourceId=input('sourceId',1,'float32',id),targetId=input('targetId',1,'float32',id),present=input('targetPresent',1,'bool'),hitPresent=input('hitPresent',1,'bool'),
    status=g.split(input('targetRawStatusBytes',4),4),flags=g.split(input('targetRawFlagsBytes',4),4),defend=input('targetDefend'),actionId=input('actionId',1,'float32',{min:0,max:65535,integer:true}),side=input('targetSide',1,'float32',{min:0,max:3,integer:true}),
    magicFlag=input('magicReflectable',1,'bool'),breathFlag=input('breathReflectable',1,'bool'),counterFlag=input('counterable',1,'bool'),wide=input('sourceWideWeapon',1,'bool'),equipment=input('targetMagicReflectEquipment',1,'bool'),skill=input('targetCounterSkill',1,'bool'),job=input('targetJob',1,'float32',{min:0,max:12,integer:true}),scenario=input('scenarioId',1,'float32',{min:-1,max:65535,integer:true}),shared=input('sharedRoll',1,'float32',{min:0,max:99,integer:true}),
    priorCounter=input('priorCounterState',1,'float32',{min:0,max:2,integer:true}),priorTarget=input('priorRedirectTarget',1,'float32',id),allowTension=input('allowTension',1,'bool'),substitute=input('substitute',1,'bool'),special=input('specialReflect',1,'bool'),
    party=g.split(input('partyRosterIds',4,'float32',id),4),partyCount=input('partyRosterCount',1,'float32',{min:0,max:4,integer:true}),enemy=g.split(input('enemyRosterIds',8,'float32',id),8),enemyCount=input('enemyRosterCount',1,'float32',{min:0,max:8,integer:true}),combo=g.split(input('combo',6,'float32',{min:-32768,max:65535,integer:true}),6),rng=new RandomGraph(g,seed,position);
  const partyId=value=>g.and(g.ge(value,0),g.le(value,3)),targetParty=partyId(targetId),sourceParty=partyId(sourceId),exists=g.and(enabled,hitPresent,present,g.not(bit(g,status,0)),g.not(bit(g,flags,13))),active=g.and(exists,g.not(bit(g,flags,11)));
  const magicGate=g.and(active,magicFlag,g.eq(side,1),g.not(g.eq(sourceId,targetId))),magicStatus=g.and(magicGate,bit(g,status,9)),equipmentGate=g.and(magicGate,g.not(magicStatus),targetParty,equipment),equipmentRoll=rng.bounded(equipmentGate,4),magic=g.or(magicStatus,g.and(equipmentGate,g.eq(equipmentRoll,0)));
  const breath=g.and(active,g.not(magic),breathFlag,g.eq(side,1),bit(g,status,26)),physical=g.and(active,g.not(magic),g.not(breath),g.not(bit(g,status,3)),g.not(bit(g,status,4)),g.not(bit(g,status,19)),counterFlag,g.not(g.and(g.eq(actionId,1),sourceParty,wide)));
  const defend4=g.and(physical,g.eq(defend,4)),defend5=g.and(physical,g.eq(defend,5)),defend9=g.and(physical,g.eq(defend,9)),route=g.or(defend5,defend9),nineRoll=rng.bounded(defend9,5),sameSide=g.and(defend9,g.lt(nineRoll,2));
  const chooseParty=g.or(g.and(targetParty,sameSide),g.and(g.not(targetParty),g.not(sameSide))),candidateCount=g.where(chooseParty,partyCount,enemyCount),needsTarget=g.and(route,g.lt(priorTarget,0)),supported=g.and(g.ge(job,0),g.le(job,12),g.eq(job,g.floor(job))),drawTarget=g.and(needsTarget,g.gt(candidateCount,0)),chosenIndex=rng.bounded(drawTarget,g.max(candidateCount,1));
  const choose=values=>values.reduce((value,next,i)=>g.where(g.eq(chosenIndex,i),next,value),g.constant(-1));
  const selectedTarget=g.where(g.gt(candidateCount,0),g.where(chooseParty,choose(party),choose(enemy)),-1),nextCachedTarget=g.where(needsTarget,selectedTarget,priorTarget),redirectTarget=g.where(route,nextCachedTarget,targetId),redirectOther=g.and(route,g.not(g.eq(redirectTarget,targetId))),routeChangesSource=g.or(defend5,g.and(defend9,redirectOther));
  const skillBound=COMMON_COUNTER_JOB_DENOMINATORS.reduce((value,next,i)=>g.where(g.eq(job,i),next,value),g.constant(0)),automatic=g.and(physical,g.not(defend4),g.not(defend5),g.not(defend9),targetParty),evaluate=g.and(automatic,g.eq(priorCounter,0)),scriptBattle=g.or(g.eq(scenario,0x320),g.eq(scenario,0x321)),acrobat=bit(g,flags,10),skillGate=g.and(evaluate,g.not(scriptBattle),g.not(acrobat),skill,g.gt(skillBound,0)),skillRoll=rng.bounded(skillGate,g.max(skillBound,1));
  const newCounter=g.and(evaluate,g.not(scriptBattle),g.or(g.and(acrobat,g.ge(shared,50),g.lt(shared,75)),g.and(skillGate,g.eq(skillRoll,1)))),automaticCounter=g.and(automatic,g.or(g.eq(priorCounter,1),newCounter)),counter=g.or(defend4,automaticCounter),changedSource=g.or(magic,breath,counter,routeChangesSource);
  const nextCounter=g.where(defend4,1,g.where(evaluate,g.where(newCounter,1,2),priorCounter)),routeKind=g.where(magic,1,g.where(breath,2,g.where(counter,3,g.where(defend5,4,g.where(defend9,g.where(redirectOther,5,10),0))))),routed=g.gt(routeKind,0),nextSource=g.where(changedSource,targetId,sourceId),nextTarget=g.where(g.or(magic,breath,counter),sourceId,redirectTarget);
  const boolSelect=(condition,a,b)=>g.gt(g.where(condition,g.cast(a,'float32'),g.cast(b,'float32')),0);
  for(const[name,value]of Object.entries({nextSeed:g.where(supported,rng.seed,seed),nextPosition:g.where(supported,rng.position,position),consumed:g.where(supported,g.sub(rng.position,position),g.constant(0,'int32')),
    nextSourceId:g.where(supported,nextSource,sourceId),nextTargetId:g.where(supported,nextTarget,targetId),nextCounterState:g.where(supported,nextCounter,priorCounter),nextRedirectTarget:g.where(supported,nextCachedTarget,priorTarget),
    nextAllowTension:g.and(allowTension,g.not(g.and(supported,changedSource))),nextSubstitute:g.or(substitute,g.and(supported,routeChangesSource)),nextSpecialReflect:boolSelect(g.and(supported,exists),magic,special),
    counter:g.and(supported,counter),routeKind:g.where(supported,routeKind,0),routeTargetId:g.where(g.and(supported,routed),nextTarget,0),routeCount:g.cast(g.and(supported,routed),'float32'),active,supported,
    resetCombo:g.and(supported,g.or(counter,routeChangesSource)),nextCombo:g.cat(combo.map((value,i)=>i===3?value:g.where(g.and(supported,g.or(counter,routeChangesSource)),0,value)))
  }))g.output(value,name);
  return g;
}

export function buildCommonRedirectCritical(){
  const g=new Graph('rom-common-redirect-critical',{
    scope:'Original caller critical ordering after routing and target validity. The original command critical flag and the effective hit critical flag are separate outputs.',
    authority:{file:'src/Combat/Overlay_24/func_ov024_021eb5d0.cpp',critical:'src/Combat/Overlay_0/func_ov000_02156cc4.cpp'},
    order:'Counter, substitute and spell reflection evaluate the original action critical (unless cached at command begin), then evaluate the effective action. Original actions72/112 use bounded2 for the first of those two flags. Breath reflection alone retains the ordinary one-check/cached-check path.',
    defaults:{seed:[1,0,0,0,0,0,0,0],position:1,enabled:true,originalActionId:1,effectiveActionId:1,originalCriticalThreshold:200,effectiveCriticalThreshold:0,originalCriticalBaseRate:-1,effectiveCriticalBaseRate:-1,criticalHitCount:1,commandCriticalMode:false,commandCritical:false,extraCritical:false},
    inputContractVersion:1
  });
  const seed=g.input('seed',['N',8]),position=g.input('position',['N',1],'int32'),enabled=g.input('enabled',['N',1],'bool'),original=g.input('originalActionId'),effective=g.input('effectiveActionId'),originalThreshold=g.input('originalCriticalThreshold'),effectiveThreshold=g.input('effectiveCriticalThreshold'),originalBase=g.input('originalCriticalBaseRate'),effectiveBase=g.input('effectiveCriticalBaseRate'),hitCount=g.input('criticalHitCount'),mode=g.input('commandCriticalMode',['N',1],'bool'),cached=g.input('commandCritical',['N',1],'bool'),extra=g.input('extraCritical',['N',1],'bool'),rng=new RandomGraph(g,seed,position);
  const maximumAction=Math.max(...COMMON_ACTION_RULES.map(rule=>rule.id)),actionRules=new Map(COMMON_ACTION_RULES.map(rule=>[rule.id,rule]));
  const column=(action,key)=>{const valid=g.and(g.ge(action,0),g.le(action,maximumAction),g.eq(action,g.floor(action))),index=g.cast(g.max(0,g.min(action,maximumAction)),'int32'),values=g.constant(Array.from({length:maximumAction+1},(_,id)=>actionRules.get(id)?.[key]??0),'float32',[maximumAction+1]);return g.where(valid,g.op('Gather',[values,index],{axis:0},{shape:['N',1]}),0);};
  const check=(action,baseThreshold,baseRate,gate)=>{const forced=g.gt(column(action,'forcedCritical'),0),roll=rng.bounded(g.and(gate,g.not(forced)),10000),threshold=commonCriticalThreshold(g,{baseThreshold,baseRate,weight:column(action,'criticalWeight'),hitCount});return g.and(gate,g.or(forced,g.lt(roll,threshold)));};
  const extraGate=g.and(enabled,extra,g.not(mode)),special=g.or(g.eq(original,72),g.eq(original,112)),coin=rng.bounded(g.and(extraGate,special),2),originalDraw=g.or(g.and(extraGate,special,g.eq(coin,0)),check(original,originalThreshold,originalBase,g.and(extraGate,g.not(special)))),effectiveDraw=check(effective,effectiveThreshold,effectiveBase,g.and(enabled,g.or(extra,g.not(mode)))),hit=g.or(effectiveDraw,g.and(enabled,g.not(extra),mode,cached)),command=g.or(g.and(enabled,extra,g.or(originalDraw,g.and(mode,cached))),g.and(enabled,g.not(extra),hit));
  for(const[name,value]of Object.entries({nextSeed:rng.seed,nextPosition:rng.position,consumed:g.sub(rng.position,position),critical:hit,originalCritical:command}))g.output(value,name);
  return g;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const results=[];for(const g of[buildCommonRedirectTarget(),buildCommonRedirectCritical()]){const r=await g.save();results.push({name:r.name,nodes:r.nodes,bytes:r.bytes});}console.log(JSON.stringify(results));}
