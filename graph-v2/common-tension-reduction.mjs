import {tensionBonus} from './encounter-expansion/build-tension-primitives.mjs';
import {Graph} from './graph-builder.mjs';

// Stage is stored as a byte. The lowering setter wraps, while the damage
// caller reads that same byte with LDRSB before the coefficient and bonus.
export const COMMON_TENSION_REDUCTION_AUTHORITY=Object.freeze({
  additional9:'JPN021e3fd4 / matching021e373c',
  additional14:'JPN021e47ac / matching021e3f14',
  stageSetter:'JPN02088000 / matching02087704',
  angerClear:'matching02088e64; enemy visual bytes17f/180 via020488cc',
  random:'These additional bodies draw no random values.',
  numericRead:'Matching021e6a90 / JPN021e7328 reads stats24 as signed char before JPN020758c4 and020758f0.',
  numericRange:'Logical stages0..4 and the seven finite preceding original rows, signed−7..−1 (raw249..255). Other raw bytes remain represented, but active numeric coefficient use is explicitly unsupported; no normalization is applied.',
  coefficientAddress:'Original main memory020e89d4..020e8a33',
  coefficientHex:'0000803f0000003fcdcccc3d000000000000803fcdcc4c3f9a99193fcdcccc3ecdcc4c3e000000000000004000008040000000410000c8410000803f0000803f0000c03f6666a63f000020400000004000008040000040400000c04000009040'
});
const coefficientBytes=Buffer.from(COMMON_TENSION_REDUCTION_AUTHORITY.coefficientHex,'hex'),coefficients=Array.from({length:24},(_,i)=>Math.max(1,coefficientBytes.readFloatLE(i*4)));
export const COMMON_TENSION_NUMERIC_STAGES=Object.freeze([0,1,2,3,4,249,250,251,252,253,254,255]);
export const commonSignedTensionStage=(g,stage)=>g.where(g.ge(stage,128),g.sub(stage,256),stage);
export const commonTensionNumericSupported=(g,stage)=>g.or(g.le(stage,4),g.ge(stage,249));
export function commonTensionCoefficient(g,stage,enemy){
  // An inactive unsupported branch must still have a valid eager Gather
  // index. The action's supported flag, not this index, admits numeric use.
  const signed=commonSignedTensionStage(g,stage),index=g.add(g.mul(g.where(commonTensionNumericSupported(g,stage),g.add(signed,7),7),2),enemy);
  return g.op('Gather',[g.constant(coefficients,'float32',[coefficients.length]),g.cast(index,'int32')],{axis:0},{shape:['N',1]});
}
export const commonTensionBonus=(g,stage,level)=>tensionBonus(g,commonSignedTensionStage(g,stage),level);
export function buildCommonTensionNumericBoundary(){
  const g=new Graph('rom-common-tension-signed-coefficient',{scope:'Original signed stats24 consumer and finite represented coefficient rows. Unsupported raw stages are carried without normalization; the coefficient output is meaningful only when supported=1.',authority:COMMON_TENSION_REDUCTION_AUTHORITY,inputDomains:{stage:{min:0,max:255,integer:true},enemy:{values:[0,1]}},defaults:{stage:255,enemy:0}}),stage=g.input('stage'),enemy=g.input('enemy');
  g.output(commonSignedTensionStage(g,stage),'signedStage');g.output(commonTensionCoefficient(g,stage,enemy),'coefficient');g.output(g.cast(commonTensionNumericSupported(g,stage),'float32'),'supported');return g;
}

export function commonTensionReduction(g,{enabled,damage,present,additional,stage,low,high,anger,angerDuration,angerRecovery}){
  const active=g.and(enabled,present,g.gt(damage,0),g.or(g.eq(additional,9),g.eq(additional,14))),lowered=g.and(active,g.or(g.gt(low,0),g.gt(high,0))),clearAnger=g.and(active,g.eq(additional,14),g.gt(anger,0)),decremented=g.add(g.sub(stage,1),g.where(g.eq(stage,0),256,0)),nextStage=g.where(lowered,decremented,stage),nextLow=g.where(lowered,g.where(g.eq(decremented,3),1,g.where(g.eq(decremented,0),0,low)),low),nextHigh=g.where(g.and(lowered,g.eq(decremented,3)),0,high);
  return{lowered,clearAnger,nextStage,nextLow,nextHigh,nextAnger:g.where(clearAnger,0,anger),nextAngerDuration:g.where(clearAnger,0,angerDuration),nextAngerRecovery:g.where(clearAnger,0,angerRecovery),commonStageCompatible:commonTensionNumericSupported(g,nextStage)};
}
