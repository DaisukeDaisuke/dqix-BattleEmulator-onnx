// Original state-conditioned damage selectors. The caller still computes its
// physical fallback first; these helpers consume no additional RNG.
import {commonRawBit} from './common-modifier-rules.mjs';
export const COMMON_STATE_SELECTOR_RULES=Object.freeze([
  {selector:1,condition:'enemy species2',species:2,scale:1.5,jpn:'021d9300',matching:'func_ov024_021d8a40'},
  {selector:2,condition:'enemy auxiliary metal bit12',add:1,jpn:'021d9344',matching:'func_ov024_021d8a84'},
  {selector:10,condition:'enemy species1',species:1,scale:1.5,jpn:'021d9550',matching:'func_ov024_021d8c90'},
  {selector:12,condition:'enemy species3',species:3,scale:1.5,jpn:'021d95b4',matching:'func_ov024_021d8cf4'},
  {selector:13,condition:'poison flag and subtype1/2, or paralysis flag',scale:1.5,jpn:'021d95f8',matching:'func_ov024_021d8d38'},
  {selector:15,condition:'sleep or confusion flag',scale:2,jpn:'021d9674',matching:'func_ov024_021d8db4'},
  {selector:16,condition:'enemy species11',species:11,scale:1.25,jpn:'021d96d8',matching:'func_ov024_021d8e18'},
  {selector:18,condition:'enemy species8',species:8,scale:1.5,jpn:'021d972c',matching:'func_ov024_021d8e6c'},
  {selector:20,condition:'enemy species7',species:7,scale:1.5,jpn:'021d9794',matching:'func_ov024_021d8ed4'},
  {selector:22,condition:'enemy species12',species:12,scale:1.5,jpn:'021d980c',matching:'func_ov024_021d8f4c'},
  {selector:23,condition:'enemy species5',species:5,scale:1.5,jpn:'021d9850',matching:'func_ov024_021d8f90'},
  {selector:26,condition:'enemy species6',species:6,scale:1.5,jpn:'021d98dc',matching:'func_ov024_021d901c'},
  {selector:28,condition:'enemy species0',species:0,scale:1.5,jpn:'021d9944',matching:'func_ov024_021d9084'},
  {selector:30,condition:'enemy species4',species:4,scale:1.5,jpn:'021d9a34',matching:'func_ov024_021d9174'},
  {selector:32,condition:'enemy species10',species:10,scale:1.5,jpn:'021d9a80',matching:'func_ov024_021d91c0'}
].map(Object.freeze));
export const COMMON_STATE_SELECTOR_IDS=Object.freeze(COMMON_STATE_SELECTOR_RULES.map(rule=>rule.selector));
export function commonStateSelectorDamage(g,selector,fallback,{targetParty,targetSpecies,targetMetal,targetStatusBytes,targetKindsBytes}){
  const enemy=g.eq(targetParty,0),kind=g.add(commonRawBit(g,targetKindsBytes,0),g.mul(commonRawBit(g,targetKindsBytes,1),2)),poison=g.and(g.gt(commonRawBit(g,targetStatusBytes,1),0),g.or(g.eq(kind,1),g.eq(kind,2))),paralysis=g.gt(commonRawBit(g,targetStatusBytes,3),0),
    species=g.and(enemy,g.or(...COMMON_STATE_SELECTOR_RULES.filter(rule=>rule.species!==undefined).map(rule=>g.and(g.eq(selector,rule.selector),g.eq(targetSpecies,rule.species))))),ailment=g.and(g.eq(selector,13),g.or(poison,paralysis)),hypnosis=g.and(g.eq(selector,15),g.or(g.gt(commonRawBit(g,targetStatusBytes,4),0),g.gt(commonRawBit(g,targetStatusBytes,5),0))),metal=g.and(g.eq(selector,2),enemy,targetMetal),
    coefficient=COMMON_STATE_SELECTOR_RULES.filter(rule=>rule.scale!==undefined).reduce((value,rule)=>g.where(g.eq(selector,rule.selector),rule.scale,value),g.constant(1)),damage=g.where(g.or(species,ailment,hypnosis),g.floor(g.mul(fallback,coefficient)),g.where(metal,g.add(fallback,1),fallback));
  return{damage,supported:g.or(...COMMON_STATE_SELECTOR_IDS.map(id=>g.eq(selector,id)))};
}
