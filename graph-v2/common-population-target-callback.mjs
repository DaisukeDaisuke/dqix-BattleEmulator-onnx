import {COMMON_SUMMON_ROWS} from './common-summon-rules.mjs';

export const COMMON_POPULATION_TARGET_INPUTS={
  candidateActionId:{width:1,default:1,domain:{min:0,max:4095,integer:true}},
  candidateOperation:{width:1,default:1,domain:{min:0,max:127,integer:true}},
  populationContextAvailable:{width:1,dtype:'bool',default:false},
  populationBtPresent:{width:1,dtype:'bool',default:true},
  populationLiveCount:{width:1,default:0,domain:{min:0,max:15,integer:true}},
  populationGroupCount:{width:1,default:0,domain:{min:0,max:3,integer:true}},
  populationGroupMonsterIds:{width:3,default:[0,0,0],domain:{min:0,max:65535,integer:true}},
  populationGroupLiveCounts:{width:3,default:[0,0,0],domain:{min:0,max:15,integer:true}},
  populationLoadedMonsterIds:{width:4,default:[-1,-1,-1,-1],domain:{min:-1,max:32767,integer:true}},
  actorOriginalMonsterId:{width:1,default:-1,domain:{min:-1,max:65535,integer:true}}
};
export const COMMON_POPULATION_TARGET_AUTHORITY={file:'src/Combat/Overlay_24/func_ov024_021f45c8.cpp',address:'JPN021f4d94',table:'JPN02200310 callback116 pointer',callback:116};
export function commonPopulationTargetCallback(g,x,previous){
  const select=g.eq(x.selectorIndex,116),typed=g.and(x.actorPresent,x.actorType400),coverage=g.or(g.not(typed),x.populationContextAvailable),loaded=g.split(x.populationLoadedMonsterIds,4),groups=g.split(x.populationGroupMonsterIds,3),counts=g.split(x.populationGroupLiveCounts,3);
  let summon=g.constant(-1);for(const row of COMMON_SUMMON_ROWS)summon=g.where(g.eq(x.candidateActionId,row.actionId),row.monsterId,summon);
  const found=g.ge(summon,0),resource=g.or(...loaded.map(id=>g.eq(id,summon))),groupAllowed=g.or(g.lt(x.populationGroupCount,3),...groups.map((id,i)=>g.and(g.lt(i,x.populationGroupCount),g.or(g.eq(id,summon),g.eq(counts[i],0)))));
  const requestAllowed=g.or(g.not(g.eq(x.candidateOperation,12)),g.not(found),g.and(resource,groupAllowed));
  const success=g.and(x.enabled,select,coverage,typed,x.populationBtPresent,requestAllowed,g.lt(x.populationLiveCount,g.where(g.eq(x.actorOriginalMonsterId,266),8,5)));
  const bool=(a,b)=>g.gt(g.where(select,g.cast(a,'float32'),g.cast(b,'float32')),0),targets=g.split(x.previousTargets,8);
  return{...previous,nextSeed:g.where(select,x.seed,previous.nextSeed),nextPosition:g.where(select,x.position,previous.nextPosition),consumed:g.where(select,g.sub(x.position,x.position),previous.consumed),supported:bool(coverage,previous.supported),callbackSuccess:bool(success,previous.callbackSuccess),
    targetCount:g.where(select,g.where(success,1,x.previousTargetCount),previous.targetCount),targets:g.where(select,g.where(success,g.cat([x.actorId,...targets.slice(1)]),x.previousTargets),previous.targets),
    filteredCount:g.where(select,g.cast(success,'float32'),previous.filteredCount),affectableCount:g.where(select,g.cast(success,'float32'),previous.affectableCount),rageCandidateUsed:g.where(select,g.constant(0,'int32'),previous.rageCandidateUsed)};
}
