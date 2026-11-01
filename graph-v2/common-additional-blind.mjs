// Additional18 uses the raw blind-resistance byte46. It draws before the
// original dead predicate, with no high-tension or critical override.
import {resistanceFraction} from './boss-action-rules.mjs';
export const COMMON_ADDITIONAL_BLIND_AUTHORITY=Object.freeze({body:'JPN021e4c78 / matching func_ov024_021e43e0',table:'JPN021ffc30 +18*8',predicate:'Main func_02088840 checks raw death bit0 only',setter:'Main func_02088854 writes blind duration5f=4, recovery82=0 and raw status14 bit6; the caller then writes subtype22 bits6..8',order:'Positive amount and present target, bounded100, chance from raw byte46, then living predicate and strict roll<chance. Critical and high-tension flags do not override this callback.'});
export function commonAdditionalBlind(g,rng,{enabled,damage,present,dead,rawResistance,partySource,partyChance,enemyChance}){
  const gate=g.and(enabled,present,g.gt(damage,0)),roll=rng.bounded(gate,100),baseChance=g.where(partySource,partyChance,enemyChance),chance=g.mul(baseChance,resistanceFraction(g,rawResistance));
  return{applied:g.and(gate,g.not(dead),g.lt(roll,chance)),roll};
}
