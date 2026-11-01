// Matching func_ov024_021e8dc0 (JPN021e9658): this second repetition
// stage duplicates the complete selected list after default-target sampling.
// Initial selection has eight slots; the command's execution list has32.
export const COMMON_EXTRA_HIT_JOB_DENOMINATORS=Object.freeze([0,12,32,32,12,16,24,8,12,16,32,24,16]);
// Original five float words at JPN020e89e4, returned by02074948 with
// index clamped0..4. These apply before unsigned16 postprocess conversion.
export const COMMON_TARGET_DAMAGE_FALLOFF=Object.freeze([1,.8,.6,.4,.2].map(Math.fround));

export function expandCommonCommandTargets(g,rng,{enabled,repeatCode,actionId,weaponRepeatFlag,party,wideWeapon,doubleHitWeapon,extraHitSkill,job,targets,count}){
  const randomRepeat=g.floor(rng.range(g.and(enabled,g.eq(repeatCode,2)),3,4));
  let repetitions=g.where(g.eq(repeatCode,1),2,g.where(g.eq(repeatCode,2),randomRepeat,g.where(g.eq(repeatCode,6),4,g.where(g.eq(repeatCode,9),5,1))));
  const doubled=g.and(enabled,party,weaponRepeatFlag,doubleHitWeapon);
  repetitions=g.where(doubled,g.mul(repetitions,2),repetitions);
  const skillGate=g.and(enabled,party,g.eq(actionId,1),g.not(wideWeapon),extraHitSkill),denominator=COMMON_EXTRA_HIT_JOB_DENOMINATORS.reduce((value,next,i)=>g.where(g.eq(job,i),next,value),g.constant(0)),drawSkill=g.and(skillGate,g.gt(denominator,0)),skillRoll=rng.bounded(drawSkill,g.max(denominator,1)),extra=g.and(drawSkill,g.eq(skillRoll,1));
  repetitions=g.where(enabled,g.add(repetitions,g.cast(extra,'float32')),1);
  const targetCount=g.mul(count,repetitions),capacity=g.le(targetCount,32),divisor=g.max(count,1),expanded=[];
  for(let i=0;i<32;i++){
    const index=g.sub(i,g.mul(g.floor(g.op('Div',[i,divisor])),divisor));
    let selected=targets[0];for(let j=1;j<targets.length;j++)selected=g.where(g.eq(index,j),targets[j],selected);
    expanded.push(g.where(g.lt(i,targetCount),selected,-1));
  }
  return{targets:expanded,targetCount,repetitions,capacity,suppressRepeatedCombo:g.or(doubled,extra),extraHit:extra};
}
