// Original state-conditioned damage selectors. The caller still computes its
// physical fallback first; these four helpers consume no additional RNG.
import {commonRawBit} from './common-modifier-rules.mjs';
export const COMMON_STATE_SELECTOR_RULES=Object.freeze([
  {selector:1,condition:'enemy species2',scale:1.5,jpn:'021d9300',matching:'func_ov024_021d8a40'},
  {selector:2,condition:'enemy auxiliary metal bit12',add:1,jpn:'021d9344',matching:'func_ov024_021d8a84'},
  {selector:13,condition:'poison flag and subtype1/2, or paralysis flag',scale:1.5,jpn:'021d95f8',matching:'func_ov024_021d8d38'},
  {selector:32,condition:'enemy species10',scale:1.5,jpn:'021d9a80',matching:'func_ov024_021d91c0'}
].map(Object.freeze));
export const COMMON_STATE_SELECTOR_IDS=Object.freeze(COMMON_STATE_SELECTOR_RULES.map(rule=>rule.selector));
export function commonStateSelectorDamage(g,selector,fallback,{targetParty,targetSpecies,targetMetal,targetStatusBytes,targetKindsBytes}){
  const enemy=g.eq(targetParty,0),kind=g.add(commonRawBit(g,targetKindsBytes,0),g.mul(commonRawBit(g,targetKindsBytes,1),2)),poison=g.and(g.gt(commonRawBit(g,targetStatusBytes,1),0),g.or(g.eq(kind,1),g.eq(kind,2))),paralysis=g.gt(commonRawBit(g,targetStatusBytes,3),0),
    species=g.and(enemy,g.or(g.and(g.eq(selector,1),g.eq(targetSpecies,2)),g.and(g.eq(selector,32),g.eq(targetSpecies,10)))),ailment=g.and(g.eq(selector,13),g.or(poison,paralysis)),metal=g.and(g.eq(selector,2),enemy,targetMetal),
    damage=g.where(g.or(species,ailment),g.floor(g.mul(fallback,1.5)),g.where(metal,g.add(fallback,1),fallback));
  return{damage,supported:g.or(...COMMON_STATE_SELECTOR_IDS.map(id=>g.eq(selector,id)))};
}
