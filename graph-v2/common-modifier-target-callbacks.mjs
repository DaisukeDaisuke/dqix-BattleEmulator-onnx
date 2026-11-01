// Shared target callbacks for reflection and ailment-resistance modifiers.
// Their integer selectors belong to original action data, not actor identity.
import {commonRawBit} from './common-modifier-rules.mjs';

export const COMMON_MODIFIER_TARGET_AUTHORITY=Object.freeze([
  {file:'src/Combat/Overlay_24/func_ov024_021f0920.cpp',address:'JPN0x021f10ec',callback:46,sha256:'034491dccea4c9b811898f98fb66b09347662d5faa7dd468787a7a2c522f75da'},
  {file:'src/Combat/Overlay_24/func_ov024_021f094c.cpp',address:'JPN0x021f1118',callback:47,sha256:'8aa50e803a883936cb1a6408f9e5055a7c44ae0d17653ea34c0e083c201780df'},
  {file:'src/Combat/Overlay_24/func_ov024_021f26fc.cpp',address:'JPN0x021f2ec8',callback:79,sha256:'9073a29d3744336b2fa968dac265628335a1ba628a628aa6d14a66bce33b3136'},
  {file:'src/Combat/Overlay_24/func_ov024_021f5bb8.cpp',address:'JPN0x021f6384',callback:147,sha256:'fe167687d979ddb8876bab0a1549aad1438ab4dfac49f44ae64087698cc92a17'}
].map(Object.freeze));
export const COMMON_MODIFIER_TARGET_RULES=Object.freeze({
  46:'Existing source without raw spell-reflection bit9 succeeds without writing count or any target. Source death/exclusion alone is not checked by this predicate. No RNG.',
  47:'Existing source without spell reflection succeeds if an eligible party actor has nonzero MP and no silence bit8. Spell knowledge and party reflection are not predicates here. Count and all targets remain unchanged. No RNG.',
  79:'An existing source object with type400 and no ailment-resistance-up flag writes its own ID to target0 and count1. Failure preserves both. No RNG.',
  147:'Enumerate the eligible party roster in its supplied order. If any member lacks ailment-resistance-down, write the entire roster count and copy all four temporary target shorts, including already-weak members and original unused-slot padding. Otherwise preserve all outputs. No RNG.'
});

export function commonModifierTargetCallbacks(g,x,previous){
  const isReflection=g.eq(x.selectorIndex,46),isConditionalReflection=g.eq(x.selectorIndex,47),isResistanceUp=g.eq(x.selectorIndex,79),isResistanceDown=g.eq(x.selectorIndex,147),selected=g.or(isReflection,isConditionalReflection,isResistanceUp,isResistanceDown),
    ids=g.split(x.ids,4),present=g.split(x.present,4),candidate=g.split(x.candidate,4),dead=g.split(x.dead,4),excluded=g.split(x.excluded,4),partyStatus=g.split(x.partyStatusBytes,16),partyFlags=g.split(x.partyFlagBytes,16),mp=g.split(x.partyMp,4),sourceStatus=g.split(x.actorStatusBytes,4),sourceFlags=g.split(x.actorFlagBytes,4),prior=g.split(x.previousTargets,8),
    eligible=ids.map((_,i)=>g.and(present[i],candidate[i],g.not(dead[i]),g.not(excluded[i]))),count=eligible.reduce((value,keep)=>g.add(value,g.cast(keep,'float32')),g.constant(0)),
    unreflected=g.and(x.actorPresent,g.eq(commonRawBit(g,sourceStatus,9),0)),partyCanCast=g.or(...eligible.map((keep,i)=>g.and(keep,g.gt(mp[i],0),g.eq(commonRawBit(g,partyStatus.slice(i*4,i*4+4),8),0)))),
    resistanceUp=g.and(x.actorPresent,x.actorType400,g.eq(commonRawBit(g,sourceFlags,3),0)),needsWeakness=g.or(...eligible.map((keep,i)=>g.and(keep,g.eq(commonRawBit(g,partyFlags.slice(i*4,i*4+4),4),0)))),
    success=g.and(x.enabled,g.or(g.and(isReflection,unreflected),g.and(isConditionalReflection,unreflected,partyCanCast),g.and(isResistanceUp,resistanceUp),g.and(isResistanceDown,needsWeakness))),
    writeSelf=g.and(success,isResistanceUp),writeParty=g.and(success,isResistanceDown),buffer=[g.constant(-1),g.constant(0),g.constant(0),g.constant(0)];
  let cursor=g.constant(0);
  for(let i=0;i<4;i++){
    for(let j=0;j<4;j++)buffer[j]=g.where(g.and(eligible[i],g.eq(cursor,j)),ids[i],buffer[j]);
    cursor=g.add(cursor,g.cast(eligible[i],'float32'));
  }
  const targetCount=g.where(writeSelf,1,g.where(writeParty,count,x.previousTargetCount)),targets=g.cat(prior.map((value,i)=>i<4?g.where(writeParty,buffer[i],i===0?g.where(writeSelf,x.actorId,value):value):value)),
    boolSelect=(condition,a,b)=>g.gt(g.where(condition,g.cast(a,'float32'),g.cast(b,'float32')),0),affected=g.where(isResistanceDown,g.where(needsWeakness,count,0),g.cast(success,'float32'));
  return{
    ...previous,nextSeed:g.where(selected,x.seed,previous.nextSeed),nextPosition:g.where(selected,x.position,previous.nextPosition),consumed:g.where(selected,g.sub(x.position,x.position),previous.consumed),
    supported:boolSelect(selected,g.eq(0,0),previous.supported),callbackSuccess:boolSelect(selected,success,previous.callbackSuccess),targetCount:g.where(selected,targetCount,previous.targetCount),targets:g.where(selected,targets,previous.targets),
    filteredCount:g.where(selected,affected,previous.filteredCount),affectableCount:g.where(selected,affected,previous.affectableCount),partyCount:g.where(selected,count,previous.partyCount),rageCandidateUsed:g.where(selected,g.cast(g.constant(0),'int32'),previous.rageCandidateUsed)
  };
}
