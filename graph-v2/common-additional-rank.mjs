// Additional2/8/13 share an early random draw but read raw susceptibility
// bytes directly, independently of the resolved ailment-resistance getter.
export const COMMON_ADDITIONAL_RANK_AUTHORITY=Object.freeze({
  attack:'JPN021e3754 / matching021e2ebc; Main0208776c/020877c0/02087838',
  defense:'JPN021e3e2c / matching021e3594; Main02087860/020878b4/0208792c',
  magicBarrier:'JPN021e4620 / matching021e3d88; JPN02088620/02088674, matching Main02087d24/02087d78/02087df0',
  randomOrder:'Positive amount and present target, then bounded100, then raw resistance, dead flag and rank limits.',
  rawResistanceOffsets:[0x4f,0x50,0x52]
});

export function commonAdditionalRank(g,rng,{enabled,damage,present,dead,parameter,rawResistance,critical,ignoreResistance,rank,duration,recovery,durationOnSet}){
  const gate=g.and(enabled,present,g.gt(damage,0)),roll=rng.bounded(gate,100),delta=g.min(2,g.max(-2,parameter)),lowering=g.lt(delta,0),resisted=g.and(lowering,g.not(ignoreResistance),g.or(g.le(rawResistance,0),g.and(g.not(critical),g.ge(roll,rawResistance)))),withinLimits=g.or(g.and(lowering,g.gt(rank,-2)),g.and(g.not(lowering),g.lt(rank,2))),applied=g.and(gate,g.not(resisted),g.not(dead),withinLimits),nextRank=g.min(2,g.max(-2,g.add(rank,delta))),clear=g.eq(nextRank,0);
  return{applied,roll,nextRank:g.where(applied,nextRank,rank),nextDuration:g.where(applied,g.where(clear,0,durationOnSet),duration),nextRecovery:g.where(applied,0,recovery)};
}
