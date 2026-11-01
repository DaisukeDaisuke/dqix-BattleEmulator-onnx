// Original additional7/10 use raw target bytes, not the resolved resistance
// getter used by primary effects. Keep the state predicate before the draw.
import {resistanceFraction} from './boss-action-rules.mjs';
export const COMMON_ADDITIONAL_AILMENT_AUTHORITY=Object.freeze([
  {additional:7,file:'src/Combat/Overlay_24/func_ov024_021e33a4.cpp',resistanceOffset:0x47,predicate:'src/Combat/Main/func_0208830c.cpp',setter:'src/Combat/Main/func_02088338.cpp'},
  {additional:10,file:'src/Combat/Overlay_24/func_ov024_021e386c.cpp',resistanceOffset:0x4a,predicate:'src/Combat/Main/func_020883ac.cpp',setter:'src/Combat/Main/func_020883cc.cpp'}
].map(Object.freeze));

export function commonAdditionalAilment(g,rng,{enabled,additional,damage,present,dead,high,paralyzed,rawSleepResistance,rawConfusionResistance,partySource,partyChance,enemyChance,critical}){
  const sleep=g.eq(additional,7),confusion=g.eq(additional,10),rawResistance=g.where(sleep,rawSleepResistance,rawConfusionResistance),eligible=g.and(enabled,g.or(sleep,confusion),g.gt(damage,0),present,g.not(dead),g.not(high),g.or(g.not(sleep),g.not(paralyzed)),g.gt(rawResistance,0));
  const roll=rng.bounded(eligible,100),baseChance=g.where(partySource,partyChance,enemyChance),chance=g.where(critical,100,g.mul(baseChance,resistanceFraction(g,rawResistance))),applied=g.and(eligible,g.lt(roll,chance));
  return{applied,sleep:g.and(applied,sleep),confusion:g.and(applied,confusion)};
}
