// Original poison/cure target callbacks. Selection follows the action-table
// callback number and supplied roster/raw state, never encounter identity.
import {lcg,normalized,bounded} from './graph-builder.mjs';
import {commonRawBit} from './common-modifier-rules.mjs';

export const COMMON_POISON_TARGET_INPUTS=Object.freeze({
  partyStatusKinds:{width:4,dtype:'float32',default:Array(4).fill(0),domain:{min:0,max:65535,integer:true},label:'味方stats22の状態種別word'},
  partyRawPoisonResistance:{width:4,dtype:'float32',default:Array(4).fill(100),domain:{min:0,max:255,integer:true},label:'味方stats4dの元の毒耐性byte'},
  enemyStatusBytes:{width:32,dtype:'float32',default:Array(32).fill(0),domain:{min:0,max:255,integer:true},label:'敵stats14の4byte×8体'},
  enemyStatusKinds:{width:8,dtype:'float32',default:Array(8).fill(0),domain:{min:0,max:65535,integer:true},label:'敵stats22の状態種別word'}
});
export const COMMON_POISON_TARGET_AUTHORITY=Object.freeze([
  {file:'src/Combat/Overlay_24/func_ov024_021ee8b4.cpp',address:'JPN0x021ef080',callback:13,sha256:'0daffbfae0328483326f1b8c33749e4ad4e8538e87346e25fb675de0ef65f49f'},
  {file:'src/Combat/Overlay_24/func_ov024_021f43b0.cpp',address:'JPN0x021f4b7c',callback:114,sha256:'6b4048013d379937716732ddff732e2ac336ea9cbb3082ebdc38d7538c7cec38'},
  {file:'src/Combat/Overlay_24/func_ov024_021f44ac.cpp',address:'JPN0x021f4c78',callback:115,sha256:'8e7bda05ee504c0077ef974985858cd4e2c1003e547c1e1d11be41d9a96650a1'},
  {file:'src/Combat/Overlay_24/func_ov024_021f4a54.cpp',address:'JPN0x021f5220',callback:121,sha256:'368a7cd59175eb9e07c0dafafc253c5a8c08c14c452a338eb4d8777c08f264c7'},
  {file:'src/Combat/Overlay_24/func_ov024_021f4b60.cpp',address:'JPN0x021f532c',callback:122,sha256:'ce217c3a17b106064e7c1fd4f97657659d6c4a5d61c9ba578e513fd2963d9623'}
].map(Object.freeze));
export const COMMON_POISON_TARGET_RULES=Object.freeze({
  13:'Enumerate eligible enemies in group order, keep active ordinary/severe poison and reject raw spell-reflection bit9. A nonempty filtered list consumes one bounded draw including a single candidate; failed filtering retains its exact partial count/buffer writes.',
  114:'Enumerate eligible party in roster order; require fewer than one third to have raw status26. Keep targets without active ordinary poison. Any survivor returns the entire original party list, including already-poisoned members and four-short temporary padding. No RNG.',
  115:'Apply callback114 filtering and require positive raw stats4d poison resistance. At least two thirds of eligible party must survive; failure retains the filtered count/buffer, success returns the entire original party list. No resolved resistance substitution or RNG.',
  121:'Like114 but reject both active ordinary and severe poison when determining whether any party member needs poison. Successful selection still returns the complete party roster. No RNG.',
  122:'Like115 but reject both active poison kinds. The original two-thirds threshold uses integer counts, and success returns every eligible party member. No RNG.'
});

export function commonPoisonTargetCallbacks(g,x,previous){
  const cure=g.eq(x.selectorIndex,13),ordinary=g.or(g.eq(x.selectorIndex,114),g.eq(x.selectorIndex,115)),severe=g.or(g.eq(x.selectorIndex,121),g.eq(x.selectorIndex,122)),wise=g.or(g.eq(x.selectorIndex,115),g.eq(x.selectorIndex,122)),creation=g.or(ordinary,severe),selected=g.or(cure,creation);
  const ids=g.split(x.ids,4),present=g.split(x.present,4),candidate=g.split(x.candidate,4),dead=g.split(x.dead,4),excluded=g.split(x.excluded,4),status=g.split(x.partyStatusBytes,16),kinds=g.split(x.partyStatusKinds,4),resistance=g.split(x.partyRawPoisonResistance,4),prior=g.split(x.previousTargets,8);
  const sum=values=>values.reduce((value,item)=>g.add(value,g.cast(item,'float32')),g.constant(0));
  const boolSelect=(condition,a,b)=>g.gt(g.where(condition,g.cast(a,'float32'),g.cast(b,'float32')),0);
  const poison=(bytes,word,kind)=>g.and(g.gt(commonRawBit(g,bytes,1),0),g.eq(g.sub(word,g.mul(g.floor(g.mul(word,.25)),4)),kind));
  const eligible=ids.map((_,i)=>g.and(present[i],candidate[i],g.not(dead[i]),g.not(excluded[i]))),partyCount=sum(eligible),status26Count=sum(eligible.map((keep,i)=>g.and(keep,g.gt(commonRawBit(g,status.slice(i*4,i*4+4),26),0))));
  const partyAllowed=g.and(g.gt(partyCount,0),g.lt(g.mul(status26Count,3),partyCount)),active=g.and(x.enabled,creation,partyAllowed);
  const filtered=eligible.map((keep,i)=>g.and(keep,g.not(poison(status.slice(i*4,i*4+4),kinds[i],1)),g.or(ordinary,g.not(poison(status.slice(i*4,i*4+4),kinds[i],2))),g.or(g.not(wise),g.gt(resistance[i],0)))),filteredCount=sum(filtered);
  const complete=g.and(active,g.gt(filteredCount,0),g.or(g.not(wise),g.ge(g.mul(filteredCount,3),g.mul(partyCount,2))));
  const roster=[g.constant(-1),g.constant(0),g.constant(0),g.constant(0)],partial=[...prior];let rosterCursor=g.constant(0),filteredCursor=g.constant(0);
  for(let i=0;i<4;i++){
    for(let j=0;j<4;j++){
      roster[j]=g.where(g.and(eligible[i],g.eq(rosterCursor,j)),ids[i],roster[j]);
      partial[j]=g.where(g.and(filtered[i],g.eq(filteredCursor,j)),ids[i],partial[j]);
    }
    rosterCursor=g.add(rosterCursor,g.cast(eligible[i],'float32'));filteredCursor=g.add(filteredCursor,g.cast(filtered[i],'float32'));
  }
  const partyTargets=g.cat(prior.map((value,i)=>i<4?g.where(complete,roster[i],g.where(active,partial[i],value)):value)),partyTargetCount=g.where(active,g.where(complete,partyCount,filteredCount),x.previousTargetCount);
  const enemyIds=g.split(g.cast(x.enemyIds,'float32'),8),enemyPresent=g.split(x.enemyPresent,8),enemyCandidate=g.split(x.enemyCandidate,8),enemyDead=g.split(x.enemyDead,8),enemyExcluded=g.split(x.enemyExcluded,8),groups=g.split(g.cast(x.enemyGroups,'float32'),8),enemyStatus=g.split(x.enemyStatusBytes,32),enemyKinds=g.split(x.enemyStatusKinds,8);
  const enemyEligible=enemyIds.map((_,i)=>g.and(enemyPresent[i],enemyCandidate[i],g.not(enemyDead[i]),g.not(enemyExcluded[i]),g.lt(groups[i],x.enemyGroupCount))),enemyCount=sum(enemyEligible),accepted=enemyEligible.map((keep,i)=>g.and(keep,g.eq(commonRawBit(g,enemyStatus.slice(i*4,i*4+4),9),0),g.or(poison(enemyStatus.slice(i*4,i*4+4),enemyKinds[i],1),poison(enemyStatus.slice(i*4,i*4+4),enemyKinds[i],2)))),enemyFilteredCount=sum(accepted),enemyBuffer=[...prior];
  let enemyCursor=g.constant(0);
  for(let group=0;group<3;group++)for(let i=0;i<8;i++){
    const keep=g.and(accepted[i],g.eq(groups[i],group));
    for(let j=0;j<8;j++)enemyBuffer[j]=g.where(g.and(keep,g.eq(enemyCursor,j)),enemyIds[i],enemyBuffer[j]);
    enemyCursor=g.add(enemyCursor,g.cast(keep,'float32'));
  }
  const cureActive=g.and(x.enabled,cure,g.gt(enemyCount,0)),drawActive=g.and(cureActive,g.gt(enemyFilteredCount,0)),draw=lcg(g,x.seed),drawIndex=bounded(g,normalized(g,draw.raw),g.max(enemyFilteredCount,1)),chosen=enemyBuffer.reduce((value,id,i)=>g.where(g.eq(drawIndex,i),id,value),enemyBuffer[0]);
  const cureTargets=g.cat(prior.map((value,i)=>g.where(cureActive,i===0?g.where(drawActive,chosen,enemyBuffer[i]):enemyBuffer[i],value))),cureCount=g.where(cureActive,g.where(drawActive,1,0),x.previousTargetCount),nextPosition=g.add(x.position,g.cast(drawActive,'int32'));
  return{
    ...previous,nextSeed:g.where(selected,g.where(drawActive,draw.seed,x.seed),previous.nextSeed),nextPosition:g.where(selected,nextPosition,previous.nextPosition),consumed:g.where(selected,g.sub(nextPosition,x.position),previous.consumed),
    supported:boolSelect(selected,g.eq(0,0),previous.supported),callbackSuccess:boolSelect(selected,g.or(complete,drawActive),previous.callbackSuccess),targetCount:g.where(selected,g.where(cure,cureCount,partyTargetCount),previous.targetCount),targets:g.where(selected,g.where(cure,cureTargets,partyTargets),previous.targets),
    filteredCount:g.where(selected,g.where(cure,enemyFilteredCount,filteredCount),previous.filteredCount),affectableCount:g.where(selected,g.where(cure,enemyFilteredCount,filteredCount),previous.affectableCount),partyCount:g.where(selected,partyCount,previous.partyCount),rageCandidateUsed:g.where(selected,g.cast(g.constant(0),'int32'),previous.rageCandidateUsed)
  };
}
