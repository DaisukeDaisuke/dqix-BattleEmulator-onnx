import {Graph} from './graph-builder.mjs';
import {COMMON_MODIFIER_RULES,COMMON_RAW_TIMER_FIELDS,commonRawBit,commonRawOverlay,clearCommonModifier} from './common-modifier-rules.mjs';

export const COMMON_MODIFIER_CREATION_RULES=Object.freeze([
  {operation:46,field:'force',parameterMinimum:1,parameterMaximum:5,duration:5,source:'matching021dff3c /0208869c /020886dc..02088818',originalAddress:'0x021e07d4'},
  {operation:61,field:'fireShield',duration:5,blockedStatusBit:17,clears:'iceShield',source:'matching021e0e38 /02088bf0 /02088c10',originalAddress:'0x021e16d0'},
  {operation:62,field:'iceShield',duration:5,blockedStatusBit:17,clears:'fireShield',source:'matching021e0f30 /02088c54 /02088c74',originalAddress:'0x021e17c8'},
  {operation:31,field:'spellReflection',duration:5,source:'matching021de678 /020888e0 /020888f4',originalAddress:'0x021def10'},
  {operation:64,field:'ailmentResistanceUp',duration:5,clears:'ailmentResistanceDown',source:'matching021e1120 /02088cb8 /02088ccc',originalAddress:'0x021e19b8'},
  {operation:65,field:'ailmentResistanceDown',duration:5,clears:'ailmentResistanceUp',source:'matching021e1218 /02088d10 /02088d24',originalAddress:'0x021e1ab0'}
].map(Object.freeze));

// Mutate graph-value arrays, never host numerical actor state. The common
// target-effect module supplies the original operationHit and raw status.
export function applyCommonModifierCreation(g,state,{operation,parameter,hit,present}){
  const forceRule=COMMON_MODIFIER_RULES[4],forceFamily=g.and(g.eq(operation,46),g.ge(parameter,1),g.le(parameter,5),g.eq(parameter,g.floor(parameter))),shieldFamily=g.or(g.eq(operation,61),g.eq(operation,62)),otherFamily=g.or(...[31,64,65].map(id=>g.eq(operation,id))),supported=g.or(forceFamily,shieldFamily,otherFamily),living=g.and(present,g.eq(commonRawBit(g,state.rawStatusBytes,0),0)),force=g.and(hit,living,forceFamily);
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
  for(const[index,operationId,opposite]of[[5,31],[6,64,7],[7,65,6]]){
    const rule=COMMON_MODIFIER_RULES[index],gate=g.and(hit,living,g.eq(operation,operationId));
    commonRawOverlay(g,state[rule.flag],rule.bit,g.where(gate,1,commonRawBit(g,state[rule.flag],rule.bit)));
    state.rawTimers[rule.timerIndex]=g.where(gate,5,state.rawTimers[rule.timerIndex]);state.rawTimers[rule.timerIndex+1]=g.where(gate,0,state.rawTimers[rule.timerIndex+1]);
    if(opposite!==undefined)clearCommonModifier(g,state,COMMON_MODIFIER_RULES[opposite],gate);applied.push(gate);
  }
  return{supported,applied:g.or(...applied)};
}

// Small independently executable model for direct original-handler evidence.
// The battle graph inlines the same helper and adds no runtime dispatch path.
export function buildCommonModifierCreation(){
  const g=new Graph('rom-common-modifier-creation',{schema:'dq9-common-modifier-creation-v2',sources:COMMON_MODIFIER_CREATION_RULES,scope:'Original Force, fire/ice shield, magic-reflection and ailment-resistance operation bodies. The target-hit predicate is supplied by the common caller; these bodies consume no random draws. Fire/ice cannot be created while the raw breath-barrier flag is set, regardless of stored rank; each clears the other shield and both timer bytes. Ailment-resistance up/down likewise clear the opposing flag and its timer bytes. Magic reflection refreshes its own duration without clearing unrelated state.',defaults:{operation:46,parameter:1,hit:true,present:true,rawStatusBytes:[0,0,0,0],rawFlagsBytes:[0,0,0,0],statusKindsBytes:[0,0],rawTimers:Array(COMMON_RAW_TIMER_FIELDS.length).fill(0)},inputDomains:{operation:{min:0,max:127,integer:true},parameter:{min:-32768,max:32767,integer:true},hit:{values:[0,1,false,true]},present:{values:[0,1,false,true]},rawStatusBytes:{min:0,max:255,integer:true},rawFlagsBytes:{min:0,max:255,integer:true},statusKindsBytes:{min:0,max:255,integer:true}},fieldDomains:{rawTimers:COMMON_RAW_TIMER_FIELDS.map((name,i)=>({name,min:0,max:i%2?4:255,integer:true}))}});
  const state={};for(const[name,width]of[['rawStatusBytes',4],['rawFlagsBytes',4],['statusKindsBytes',2],['rawTimers',COMMON_RAW_TIMER_FIELDS.length]])state[name]=[...g.split(g.input(name,['N',width]),width)];
  const result=applyCommonModifierCreation(g,state,{operation:g.input('operation'),parameter:g.input('parameter'),hit:g.input('hit',['N',1],'bool'),present:g.input('present',['N',1],'bool')});
  for(const[name,value]of Object.entries(state))g.output(g.cat(value),'next'+name[0].toUpperCase()+name.slice(1));
  g.output(g.cast(result.applied,'float32'),'applied');g.output(g.cast(result.supported,'float32'),'supported');return g;
}
