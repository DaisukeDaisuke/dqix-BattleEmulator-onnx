import {Graph} from './graph-builder.mjs';
import {COMMON_MODIFIER_RULES,COMMON_RAW_TIMER_FIELDS,commonRawBit,commonRawOverlay,clearCommonModifier} from './common-modifier-rules.mjs';

export const COMMON_MODIFIER_CREATION_RULES=Object.freeze([
  {operation:46,field:'force',parameterMinimum:1,parameterMaximum:5,duration:5,source:'matching021dff3c /0208869c /020886dc..02088818',originalAddress:'0x021e07d4'},
  {operation:61,field:'fireShield',duration:5,blockedStatusBit:17,clears:'iceShield',source:'matching021e0e38 /02088bf0 /02088c10',originalAddress:'0x021e16d0'},
  {operation:62,field:'iceShield',duration:5,blockedStatusBit:17,clears:'fireShield',source:'matching021e0f30 /02088c54 /02088c74',originalAddress:'0x021e17c8'}
].map(Object.freeze));

// Mutate graph-value arrays, never host numerical actor state. The common
// target-effect module supplies the original operationHit and raw status.
export function applyCommonModifierCreation(g,state,{operation,parameter,hit,present}){
  const forceRule=COMMON_MODIFIER_RULES[4],forceFamily=g.and(g.eq(operation,46),g.ge(parameter,1),g.le(parameter,5),g.eq(parameter,g.floor(parameter))),shieldFamily=g.or(g.eq(operation,61),g.eq(operation,62)),supported=g.or(forceFamily,shieldFamily),living=g.and(present,g.eq(commonRawBit(g,state.rawStatusBytes,0),0)),force=g.and(hit,living,forceFamily);
  commonRawOverlay(g,state.rawFlagsBytes,forceRule.bit,g.where(force,1,commonRawBit(g,state.rawFlagsBytes,forceRule.bit)));
  for(let i=0;i<forceRule.kindBits.length;i++)commonRawOverlay(g,state.statusKindsBytes,forceRule.kindBits[i],g.where(force,commonRawBit(g,[parameter],i),commonRawBit(g,state.statusKindsBytes,forceRule.kindBits[i])));
  state.rawTimers[forceRule.timerIndex]=g.where(force,5,state.rawTimers[forceRule.timerIndex]);state.rawTimers[forceRule.timerIndex+1]=g.where(force,0,state.rawTimers[forceRule.timerIndex+1]);
  const shieldEligible=g.and(hit,living,g.eq(commonRawBit(g,state.rawStatusBytes,17),0)),applied=[force];
  for(const[index,operationId,opposite]of[[2,61,3],[3,62,2]]){
    const rule=COMMON_MODIFIER_RULES[index],gate=g.and(shieldEligible,g.eq(operation,operationId));
    commonRawOverlay(g,state.rawFlagsBytes,rule.bit,g.where(gate,1,commonRawBit(g,state.rawFlagsBytes,rule.bit)));
    state.rawTimers[rule.timerIndex]=g.where(gate,5,state.rawTimers[rule.timerIndex]);state.rawTimers[rule.timerIndex+1]=g.where(gate,0,state.rawTimers[rule.timerIndex+1]);
    clearCommonModifier(g,state,COMMON_MODIFIER_RULES[opposite],gate);applied.push(gate);
  }
  return{supported,applied:g.or(...applied)};
}

// Small independently executable model for direct original-handler evidence.
// The battle graph inlines the same helper and adds no runtime dispatch path.
export function buildCommonModifierCreation(){
  const g=new Graph('rom-common-modifier-creation',{schema:'dq9-common-modifier-creation-v1',sources:COMMON_MODIFIER_CREATION_RULES,scope:'Original Force and fire/ice shield operation bodies. The target-hit predicate is supplied by the common caller; this body consumes no random draws. Fire/ice cannot be created while the raw breath-barrier flag is set, regardless of stored rank; each clears the other shield and both of its timer bytes.',defaults:{operation:46,parameter:1,hit:true,present:true,rawStatusBytes:[0,0,0,0],rawFlagsBytes:[0,0,0,0],statusKindsBytes:[0,0],rawTimers:Array(10).fill(0)},inputDomains:{operation:{min:0,max:127,integer:true},parameter:{min:-32768,max:32767,integer:true},hit:{values:[0,1,false,true]},present:{values:[0,1,false,true]},rawStatusBytes:{min:0,max:255,integer:true},rawFlagsBytes:{min:0,max:255,integer:true},statusKindsBytes:{min:0,max:255,integer:true}},fieldDomains:{rawTimers:COMMON_RAW_TIMER_FIELDS.map((name,i)=>({name,min:0,max:i%2?4:255,integer:true}))}});
  const state={};for(const[name,width]of[['rawStatusBytes',4],['rawFlagsBytes',4],['statusKindsBytes',2],['rawTimers',10]])state[name]=[...g.split(g.input(name,['N',width]),width)];
  const result=applyCommonModifierCreation(g,state,{operation:g.input('operation'),parameter:g.input('parameter'),hit:g.input('hit',['N',1],'bool'),present:g.input('present',['N',1],'bool')});
  for(const[name,value]of Object.entries(state))g.output(g.cat(value),'next'+name[0].toUpperCase()+name.slice(1));
  g.output(g.cast(result.applied,'float32'),'applied');g.output(g.cast(result.supported,'float32'),'supported');return g;
}
