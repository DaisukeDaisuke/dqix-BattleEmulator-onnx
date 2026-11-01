// Original level-dependent damage selectors. Coefficients select a shared
// binary32 graph; actor/encounter identity never selects an implementation.
import {Graph} from './graph-builder.mjs';
import {RandomGraph} from './transition-graphs.mjs';

export const COMMON_LEVEL_SELECTOR_RULES=Object.freeze([
  {selector:49,mode:0,offset:70,divisor:22,factor:0,low:-.1,high:.1,minimum:180,minimumLow:.9,minimumHigh:1.1,draws:2,jpn:'021da068',matching:'021d97a8',sha256:'53106647321a5236ff43401801026644e4d9f220abb7eb2b67cce3521b576bbf'},
  {selector:50,mode:0,offset:90,divisor:22,factor:0,low:-.1,high:.1,minimum:200,minimumLow:.9,minimumHigh:1.1,draws:2,jpn:'021da178',matching:'021d98b8',sha256:'c48442d59d6791f17a0f8aa83b9d8fff2ed1b3b45003a407ca8e285e2ade3533'},
  {selector:52,mode:0,offset:100,divisor:23,factor:0,low:-.1,high:.1,minimum:170,minimumLow:.9,minimumHigh:1.1,draws:2,jpn:'021da288',matching:'021d99c8',sha256:'bcab7fc398106cf76f363cbe89e78564cc9da585454dc902e9e452899720faa0'},
  {selector:54,mode:1,offset:10,divisor:1,factor:2,low:-.1,high:.1,minimum:0,minimumLow:0,minimumHigh:0,draws:1,jpn:'021da398',matching:'021d9ad8',sha256:'1ff104a57137a1a403a6b73c78d5cc45f569dda8045469b0236f1158398135dd'},
  {selector:55,mode:2,offset:53,divisor:1,factor:3,low:.9,high:1.1,minimum:140,minimumLow:.9,minimumHigh:1.1,draws:2,jpn:'021da44c',matching:'021d9b8c',sha256:'a2830a2cdc22cfdf71156961e3443b50566189542f61aa1c1739c5ca77c11662'},
  {selector:56,mode:2,offset:50,divisor:1,factor:5,low:.9,high:1.1,minimum:200,minimumLow:.9,minimumHigh:1.1,draws:2,jpn:'021da53c',matching:'021d9c7c',sha256:'e2f2c8bc74e0fd8079f748de76f220b3a5e0fa16ad7aa75007e6a858d1579357'},
  {selector:58,mode:2,offset:0,divisor:1,factor:7,low:.95,high:1.05,minimum:280,minimumLow:.95,minimumHigh:1.05,draws:2,jpn:'021da640',matching:'021d9d80',sha256:'5dcba260a714b62c4aa3188e60c51ac0eea452fe6353d94b6a34c66cb358dd14'},
  {selector:59,mode:0,offset:100,divisor:23,factor:0,low:-.05,high:.05,minimum:217,minimumLow:.9,minimumHigh:1.1,draws:2,jpn:'021da720',matching:'021d9e60',sha256:'9bfdb4fb3e2e4b9f0bb0a813cb911551c5c48166e9a7e061204253226688b031'},
  {selector:60,mode:0,offset:150,divisor:26,factor:0,low:-.1,high:.1,minimum:200,minimumLow:.95,minimumHigh:1.05,draws:2,jpn:'021da830',matching:'021d9f70',sha256:'3f3c9c8a3b96123fa94f4715d9ad95ca4233fe3e85143c19f58e2f87c182f9a6'},
  {selector:61,mode:3,offset:0,divisor:1,factor:6,low:.6,high:1.1,minimum:180,minimumLow:.7,minimumHigh:1.3,draws:2,jpn:'021da940',matching:'021da080',sha256:'9e148b111c0157c74ad8a8695ea63c78fa26e38f6216fdc65a384c605ed5b7a2'},
  {selector:62,mode:2,offset:0,divisor:1,factor:7,low:.9,high:1.1,minimum:260,minimumLow:.9,minimumHigh:1.1,draws:2,jpn:'021daa28',matching:'021da168',sha256:'78ad0a715e73891c4d3c6ca3f5773c09509bf97c352a2dd7405572df9ecea706'}
].map(Object.freeze));
export const COMMON_LEVEL_SELECTOR_IDS=Object.freeze(COMMON_LEVEL_SELECTOR_RULES.map(rule=>rule.selector));

export function commonLevelSelectorDamage(g,rng,{selector,level,fallback,enabled,levelAvailable}){
  const index=g.cast(g.max(0,g.min(selector,66)),'int32'),rows=new Map(COMMON_LEVEL_SELECTOR_RULES.map(rule=>[rule.selector,rule]));
  const column=(name,otherwise=0)=>g.op('Gather',[g.constant(Array.from({length:67},(_,id)=>Math.fround(rows.get(id)?.[name]??otherwise)),'float32',[67]),index],{axis:0},{shape:['N',1]});
  const supported=g.or(...COMMON_LEVEL_SELECTOR_IDS.map(id=>g.eq(selector,id))),active=g.and(enabled,supported),sample=g.and(active,levelAvailable),mode=column('mode'),factor=column('factor'),offset=column('offset'),divisor=column('divisor',1),hasMinimum=g.eq(column('draws'),2);
  const firstRoll=rng.range(sample,column('low'),column('high'));
  // Keep division, multiplication and addition as separate rounding sites.
  // In mode3 the factor multiplies the random value BEFORE the level.
  const base=g.add(offset,g.where(g.eq(mode,0),g.mul(level,g.op('Div',[level,divisor])),g.mul(factor,level))),primary=g.where(g.eq(mode,3),g.mul(level,g.mul(factor,firstRoll)),g.where(g.le(mode,1),g.add(base,g.mul(base,firstRoll)),g.mul(base,firstRoll)));
  // The original consumes this second draw even if primary already exceeds
  // the entire possible minimum range. Selector54 alone has one draw.
  const secondRoll=rng.range(g.and(sample,hasMinimum),column('minimumLow'),column('minimumHigh')),minimum=g.mul(column('minimum'),secondRoll),calculated=g.floor(g.where(hasMinimum,g.max(primary,minimum),primary));
  return{damage:g.where(sample,calculated,fallback),supported,active};
}

export function buildCommonLevelSelectors(){
  const g=new Graph('rom-common-level-selectors',{
    inputContractVersion:1,scope:'Original level damage helper family with the resolved source level and explicit party-auxiliary availability. Physical fallback evaluation, resistance, wrapping, HP effects and command scheduling are caller responsibilities.',
    rules:COMMON_LEVEL_SELECTOR_RULES,formulaModes:{0:'offset+level*(level/divisor), then base+base*roll',1:'offset+factor*level, then base+base*roll',2:'(offset+factor*level)*roll',3:'level*(factor*roll)'},
    authority:{table:'JPN021ff9c0 +selector*8',level:'Party auxiliary job index+8b8 and unsigned16 job level+16c; enemy original resolved level getter matching02159dbc. A missing party auxiliary returns the supplied fallback without RNG.'},
    rounding:'Each arithmetic node is a separate binary32 rounding site. All admitted level-dependent values are nonnegative and below signed32 overflow, so Floor equals original float-to-int truncation. No fused multiply/add or reassociation is permitted.',
    inputDomains:{seed:{min:0,max:255,integer:true,width:8},position:{min:1,max:4990,integer:true},selector:{min:0,max:66,integer:true},level:{min:0,max:65535,integer:true},fallback:{min:0,max:65535,integer:true},levelAvailable:{values:[true,false,0,1]},enabled:{values:[true,false,0,1]}},
    defaults:{seed:[1,0,0,0,0,0,0,0],position:1,selector:49,level:20,fallback:7,levelAvailable:true,enabled:true},feedback:{seed:'nextSeed',position:'nextPosition'}
  });
  const seed=g.input('seed',['N',8]),position=g.input('position',['N',1],'int32'),rng=new RandomGraph(g,seed,position),inputs={};
  for(const name of['selector','level','fallback'])inputs[name]=g.input(name);
  for(const name of['levelAvailable','enabled'])inputs[name]=g.input(name,['N',1],'bool');
  const result=commonLevelSelectorDamage(g,rng,inputs);
  for(const[name,value]of Object.entries({...result,nextSeed:rng.seed,nextPosition:rng.position,consumed:g.sub(rng.position,position)}))g.output(['supported','active'].includes(name)?g.cast(value,'float32'):value,name);
  return g;
}
