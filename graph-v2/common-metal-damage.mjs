import {tensionCoefficient,tensionBonus} from './encounter-expansion/build-tension-primitives.mjs';

export const COMMON_METAL_DAMAGE_AUTHORITY={path:'restored/dqix-decomp-decomp-matching/src/Combat/Overlay_24/func_ov024_021e6a90.cpp',sha256:'cfbcf59823f0114318cf642726d56851de69e7d5bb9aa7bbbc7c9c8fb5a0891e',symbol:'JPN021e7328 / USA021e6a90',scope:'The same common postprocess runs for every target. Metal identity is an input decoded from the original typed monster definition, not an encounter/program selector.'};
export function decodeMetalRuleFields(action){return{metalDamageFlag:action.w10>>>24&1,metalPhysicalKind:action.w08>>>8&3};}

// This function includes the existing ordinary tension expression. Suppress
// its additive level bonus only for party attacks against a metal target.
export function commonMetalPreCritical(g,r,hit,base,{stage,low,high,partySource,level,targetMetal,critical}){
  const boost=g.and(hit,g.gt(r.tensionFlag,0),g.or(g.gt(low,0),g.gt(high,0)),g.or(g.eq(r.criticalDamageSuppressed,0),g.gt(base,0))),coefficient=tensionCoefficient(g,stage,g.cast(g.not(partySource),'float32')),bonus=g.where(g.and(partySource,targetMetal),0,tensionBonus(g,stage,level)),tension=g.where(boost,g.add(g.mul(base,coefficient),bonus),base);
  return g.where(g.and(critical,targetMetal,g.gt(r.metalDamageFlag,0)),base,tension);
}

export function commonMetalBeforeMinimum(g,value,r,{targetMetal,critical,weaponAlwaysOne}){
  const ordinary=g.and(targetMetal,g.gt(r.metalDamageFlag,0),g.or(g.eq(r.metalPhysicalKind,1),g.eq(r.id,219)),g.not(critical),g.not(g.eq(r.id,517)),g.not(g.eq(r.id,130)),g.not(weaponAlwaysOne));
  return g.where(ordinary,0,value);
}

export function commonMetalMinimumAllowed(g,r,{targetMetal}){
  return g.or(g.not(targetMetal),g.gt(r.metalDamageFlag,0));
}

export function commonMetalAfterMinimum(g,rng,value,r,{enabled,targetMetal,critical,partySource,weaponMetalBonus,stage,low,high,allowTension}){
  const special=g.and(enabled,targetMetal,g.not(critical),g.or(g.eq(r.id,64),g.eq(r.id,126))),roll=rng.bounded(special,2);let damage=g.where(special,g.add(1,roll),value);
  damage=g.where(g.and(enabled,targetMetal,partySource,g.gt(r.equipmentFlag,0),weaponMetalBonus),g.add(damage,1),damage);
  const boost=g.and(enabled,targetMetal,allowTension,g.gt(r.tensionFlag,0),g.or(g.gt(low,0),g.gt(high,0)));
  return g.where(boost,g.mul(damage,tensionCoefficient(g,stage,g.cast(g.not(partySource),'float32'))),damage);
}
