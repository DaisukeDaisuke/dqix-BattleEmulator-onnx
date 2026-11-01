// Original action-table callbacks52/53/154. The same supplied party roster
// is used for every source definition; no source identity selects a program.
import {lcg,normalized,bounded} from './graph-builder.mjs';
import {commonRawBit} from './common-modifier-rules.mjs';
export const COMMON_SILENCE_TARGET_AUTHORITY=Object.freeze([
  {file:'src/Combat/Overlay_24/func_ov024_021f101c.cpp',address:'JPN0x021f17e8',callback:52,sha256:'0ef62ea82abb71a5ad2dcc92873c10c64b8cfe0d8870bffe24bca64c2d53627a'},
  {file:'src/Combat/Overlay_24/func_ov024_021f10e0.cpp',address:'JPN0x021f18ac',callback:53,sha256:'bace439d2a8b1d472e029f2da2d1b37c4fda0f0703544bfc65d1025c77db2f4a'},
  {file:'src/Combat/Overlay_24/func_ov024_021f6150.cpp',address:'JPN0x021f691c',callback:154,sha256:'27af1037b0b2e018122a76dd7346c7de56c593f3d9a1d6fe95f560cfdddf4ce2'}
].map(Object.freeze));
export const COMMON_SILENCE_TARGET_RULES=Object.freeze({
  52:'If any eligible party member lacks raw silence bit8, return the entire roster and all eight temporary target shorts. Failure preserves count/buffer. No RNG.',
  53:'If any eligible party member has an auxiliary spell-knowledge flag, positive MP and neither silence nor spell-reflection, return the entire roster and all eight temporary target shorts. Failure preserves count/buffer. No RNG.',
  154:'Enumerate eligible party and retain members without silence. A nonempty filtered list consumes exactly one bounded draw; failed filtering leaves the cleared count and partial buffer writes. Source identity and resistance do not filter this callback.'
});
export function commonSilenceTargetCallbacks(g,x,previous){
  const simple=g.eq(x.selectorIndex,52),wise=g.eq(x.selectorIndex,53),single=g.eq(x.selectorIndex,154),selected=g.or(simple,wise,single),ids=g.split(x.ids,4),present=g.split(x.present,4),candidate=g.split(x.candidate,4),dead=g.split(x.dead,4),excluded=g.split(x.excluded,4),status=g.split(x.partyStatusBytes,16),mp=g.split(x.partyMp,4),aux=g.split(x.partyAuxiliaryPresent,4),knowledge=g.split(x.partyAuxiliaryBytes,36),prior=g.split(x.previousTargets,8);
  const eligible=ids.map((_,i)=>g.and(present[i],candidate[i],g.not(dead[i]),g.not(excluded[i]))),count=eligible.reduce((n,keep)=>g.add(n,g.cast(keep,'float32')),g.constant(0)),silent=ids.map((_,i)=>g.gt(commonRawBit(g,status.slice(i*4,i*4+4),8),0)),unblocked=eligible.map((keep,i)=>g.and(keep,g.not(silent[i]))),canCast=unblocked.map((keep,i)=>g.and(keep,aux[i],g.gt(mp[i],0),g.eq(commonRawBit(g,status.slice(i*4,i*4+4),9),0),g.or(...knowledge.slice(i*9,i*9+9).map(byte=>g.gt(byte,0))))),filteredCount=unblocked.reduce((n,keep)=>g.add(n,g.cast(keep,'float32')),g.constant(0));
  const groupSuccess=g.and(x.enabled,g.or(g.and(simple,g.or(...unblocked)),g.and(wise,g.or(...canCast)))),singleActive=g.and(x.enabled,single,g.gt(count,0)),drawActive=g.and(singleActive,g.gt(filteredCount,0));
  const roster=[g.constant(-1),...Array.from({length:7},()=>g.constant(0))],filtered=[...prior];let total=g.constant(0),kept=g.constant(0);
  for(let i=0;i<4;i++){
    for(let j=0;j<4;j++){
      roster[j]=g.where(g.and(eligible[i],g.eq(total,j)),ids[i],roster[j]);
      filtered[j]=g.where(g.and(unblocked[i],g.eq(kept,j)),ids[i],filtered[j]);
    }
    total=g.add(total,g.cast(eligible[i],'float32'));kept=g.add(kept,g.cast(unblocked[i],'float32'));
  }
  const draw=lcg(g,x.seed),index=bounded(g,normalized(g,draw.raw),g.max(filteredCount,1)),chosen=filtered.reduce((v,id,i)=>g.where(g.eq(index,i),id,v),filtered[0]),targetCount=g.where(groupSuccess,count,g.where(singleActive,g.where(drawActive,1,0),x.previousTargetCount)),targets=g.cat(prior.map((value,i)=>g.where(groupSuccess,roster[i],g.where(singleActive,i===0?g.where(drawActive,chosen,filtered[i]):filtered[i],value)))),nextPosition=g.add(x.position,g.cast(drawActive,'int32'));
  const boolSelect=(condition,a,b)=>g.gt(g.where(condition,g.cast(a,'float32'),g.cast(b,'float32')),0);
  return{...previous,nextSeed:g.where(selected,g.where(drawActive,draw.seed,x.seed),previous.nextSeed),nextPosition:g.where(selected,nextPosition,previous.nextPosition),consumed:g.where(selected,g.sub(nextPosition,x.position),previous.consumed),supported:boolSelect(selected,g.eq(0,0),previous.supported),callbackSuccess:boolSelect(selected,g.or(groupSuccess,drawActive),previous.callbackSuccess),targetCount:g.where(selected,targetCount,previous.targetCount),targets:g.where(selected,targets,previous.targets),filteredCount:g.where(selected,filteredCount,previous.filteredCount),affectableCount:g.where(selected,filteredCount,previous.affectableCount),partyCount:g.where(selected,count,previous.partyCount),rageCandidateUsed:g.where(selected,g.cast(g.constant(0),'int32'),previous.rageCandidateUsed)};
}
