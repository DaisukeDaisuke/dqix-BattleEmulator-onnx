// Matching021573a8, enemy branch, followed by the original caller's
// MP-spend/restore leaves0215a124/0215a1d4. The flag is monster word10 bit19;
// it is an input definition property, independent of the monster ID.
export function commonEnemyMpDrain(g,rng,{enabled,definitionFlag,sourceParty,sourceId,sourceMp,sourceMaxMp,targetId,targetParty,targetMp,damage}){
  const gate=g.and(enabled,definitionFlag,g.not(sourceParty),g.gt(damage,0),g.or(g.ge(sourceMp,255),g.lt(sourceMp,sourceMaxMp))),roll=rng.bounded(gate,2);
  // Preserve the original binary32 multiply, separate add, cap and truncate.
  // Even targetMP0 consumes this draw once the source has qualified.
  const requested=g.add(g.mul(Math.fround(.1),damage),g.add(1,roll)),amount=g.where(gate,g.floor(g.min(requested,targetMp)),0),positive=g.gt(amount,0),spend=g.and(positive,g.or(targetParty,g.lt(targetMp,255))),restore=g.and(positive,g.not(g.eq(sourceId,targetId)));
  return{amount,nextTargetMp:g.where(spend,g.max(g.sub(targetMp,amount),0),targetMp),nextSourceMp:g.where(restore,g.min(g.add(sourceMp,amount),sourceMaxMp),sourceMp),eventCreated:positive};
}
