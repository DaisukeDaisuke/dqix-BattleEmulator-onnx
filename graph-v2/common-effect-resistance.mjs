// Original actor-local resistance getter. These constants encode its exact
// integer-percent and binary32 division behavior, not learned probabilities.
import {Graph} from './graph-builder.mjs';
import {commonRawBit} from './common-modifier-rules.mjs';

export const COMMON_EFFECT_RESISTANCE_AUTHORITY=Object.freeze({
  originalAddress:'0x021582b8',matchingSource:'src/Combat/Overlay_0/func_ov000_02156b38.cpp',
  scope:'Actual actor-local resistance getter for elements1..21. Missing actors and out-of-range elements return1. Force reduces its matching elemental percentages by50; ailment-resistance flags subtract/add25 for elements9..21, with resistance-up taking precedence. Physical element8 ignores both. Negative percentages clamp to0; weakness may produce280percent.'
});
export const COMMON_EFFECT_RESISTANCE_MAXIMUM=280;

export function commonEffectResistancePercentages(g,{rawResistances,rawFlagsBytes,statusKindsBytes,present}){
  const up=g.gt(commonRawBit(g,rawFlagsBytes,3),0),down=g.gt(commonRawBit(g,rawFlagsBytes,4),0),force=g.gt(commonRawBit(g,rawFlagsBytes,7),0),
    forceKind=g.add(commonRawBit(g,statusKindsBytes,9),g.add(g.mul(commonRawBit(g,statusKindsBytes,10),2),g.mul(commonRawBit(g,statusKindsBytes,11),4))),
    ailmentDelta=g.where(up,-25,g.where(down,25,0)),elementKinds=[1,2,3,3,4,4,5];
  return rawResistances.map((raw,index)=>{
    const delta=index<7?g.where(g.and(force,g.eq(forceKind,elementKinds[index])),-50,0):index===7?0:ailmentDelta;
    return index<21?g.where(present,g.max(g.add(raw,delta),0),100):g.add(g.mul(raw,0),100);
  });
}

export function commonEffectResistanceFraction(g,percent){
  return g.op('Gather',[g.constant(Array.from({length:COMMON_EFFECT_RESISTANCE_MAXIMUM+1},(_,i)=>Math.fround(i/100)),'float32',[COMMON_EFFECT_RESISTANCE_MAXIMUM+1]),g.cast(percent,'int32')],{axis:0},{shape:g.values[percent].shape});
}

export function buildCommonEffectResistance(){
  const g=new Graph('rom-common-effect-resistance',{
    schema:'dq9-common-effect-resistance-v1',authority:COMMON_EFFECT_RESISTANCE_AUTHORITY,
    rounding:'Raw byte plus signed integer delta is exact. The Gather table stores binary32(i/100) for every reachable i0..280, retaining original division rounding instead of replacing division by multiplication with0.01.',
    defaults:{rawResistances:Array(22).fill(100),rawFlagsBytes:[0,0,0,0],statusKindsBytes:[0,0],present:true,element:1},
    inputDomains:{rawResistances:{min:0,max:255,integer:true},rawFlagsBytes:{min:0,max:255,integer:true},statusKindsBytes:{min:0,max:255,integer:true},present:{values:[0,1,false,true]},element:{min:-65536,max:65535,integer:true}},
    feedback:{},scopeLimit:'No action accuracy, damage roll, status creation, recovery or target routing is included in this read-only helper.'
  });
  const rawResistances=g.split(g.input('rawResistances',['N',22]),22),rawFlagsBytes=g.split(g.input('rawFlagsBytes',['N',4]),4),statusKindsBytes=g.split(g.input('statusKindsBytes',['N',2]),2),present=g.input('present',['N',1],'bool'),element=g.input('element'),
    percentages=g.cat(commonEffectResistancePercentages(g,{rawResistances,rawFlagsBytes,statusKindsBytes,present})),fractions=commonEffectResistanceFraction(g,percentages),
    valid=g.and(g.ge(element,1),g.le(element,21)),index=g.cast(g.min(21,g.max(0,g.sub(element,1))),'int32'),
    selected=g.op('GatherElements',[fractions,index],{axis:1},{shape:['N',1]}),percent=g.op('GatherElements',[percentages,index],{axis:1},{shape:['N',1]});
  g.output(percentages,'percentages');g.output(fractions,'fractions');g.output(g.where(valid,selected,1),'selectedFraction');g.output(g.where(valid,percent,100),'selectedPercent');return g;
}
