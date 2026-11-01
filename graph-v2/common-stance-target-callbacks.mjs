export const COMMON_STANCE_TARGET_AUTHORITY=Object.freeze([
  {callback:75,address:'JPN021f2cc8',file:'src/Combat/Overlay_24/func_ov024_021f24fc.cpp'},
  {callback:129,address:'JPN021f59a0',file:'src/Combat/Overlay_24/func_ov024_021f51d4.cpp'}
].map(Object.freeze));
export const COMMON_STANCE_TARGET_RULES=Object.freeze({
  75:'Typed source object and signed guard rank8<2: write self/count1. Failure preserves all target shorts and count; no RNG.',
  129:'Typed source object and signed dodge rank9<2: write self/count1. Failure preserves all target shorts and count; no RNG.'
});
export function commonStanceTargetCallbacks(g,x,old){
  const guard=g.eq(x.selectorIndex,75),dodge=g.eq(x.selectorIndex,129),selected=g.or(guard,dodge),ranks=g.split(x.actorStanceRanks,2),rank=g.where(guard,ranks[0],ranks[1]),success=g.and(x.enabled,selected,x.actorPresent,x.actorType400,g.lt(rank,2)),previous=g.split(x.previousTargets,8),targets=g.cat([g.where(success,x.actorId,previous[0]),...previous.slice(1)]),zero=g.sub(x.position,x.position),floatZero=g.cast(zero,'float32');
  return{...old,nextSeed:g.where(selected,x.seed,old.nextSeed),nextPosition:g.where(selected,x.position,old.nextPosition),consumed:g.where(selected,zero,old.consumed),supported:g.or(selected,old.supported),callbackSuccess:g.or(success,g.and(g.not(selected),old.callbackSuccess)),targetCount:g.where(selected,g.where(success,1,x.previousTargetCount),old.targetCount),targets:g.where(selected,targets,old.targets),filteredCount:g.where(selected,g.cast(success,'float32'),old.filteredCount),rageCandidateUsed:g.where(selected,zero,old.rageCandidateUsed),partyCount:g.where(selected,floatZero,old.partyCount),affectableCount:g.where(selected,g.cast(success,'float32'),old.affectableCount)};
}
