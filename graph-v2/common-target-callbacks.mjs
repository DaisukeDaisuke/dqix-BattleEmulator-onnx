// Additional ROM target callbacks are selected by callback number, never by
// encounter or AI definition ID. Object enemyType remains an input field;
// changing an AI definition does not change that immutable object identity.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Graph,lcg,normalized,bounded} from './graph-builder.mjs';
import {buildDecisionGraph} from './build-ai-decision.mjs';
import {aiClosedStep} from './build-ai-closed.mjs';
import {weightedTargetRepeats} from './encounter-expansion/build-status9-targets.mjs';
import {commonModifierTargetCallbacks,COMMON_MODIFIER_TARGET_AUTHORITY,COMMON_MODIFIER_TARGET_RULES} from './common-modifier-target-callbacks.mjs';
import {commonPopulationTargetCallback,COMMON_POPULATION_TARGET_INPUTS,COMMON_POPULATION_TARGET_AUTHORITY} from './common-population-target-callback.mjs';
import {commonPoisonTargetCallbacks,COMMON_POISON_TARGET_INPUTS,COMMON_POISON_TARGET_AUTHORITY,COMMON_POISON_TARGET_RULES} from './common-poison-target-callbacks.mjs';
import {commonSilenceTargetCallbacks,COMMON_SILENCE_TARGET_AUTHORITY,COMMON_SILENCE_TARGET_RULES} from './common-silence-target-callbacks.mjs';
import {commonStanceTargetCallbacks,COMMON_STANCE_TARGET_AUTHORITY,COMMON_STANCE_TARGET_RULES} from './common-stance-target-callbacks.mjs';

const root=new URL('./',import.meta.url),expanded=new URL('./encounter-expansion/',import.meta.url);
const load=async(name,base=root)=>JSON.parse(await readFile(new URL(name+'.json',base),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sum=(g,values)=>values.reduce((total,value)=>g.add(total,g.cast(value,'float32')),g.constant(0));
const selectBool=(g,condition,a,b)=>g.gt(g.where(condition,g.cast(a,'float32'),g.cast(b,'float32')),0);

export const COMMON_TARGET_INPUTS={
  ...COMMON_POISON_TARGET_INPUTS,
  ...Object.fromEntries(Object.entries(COMMON_POPULATION_TARGET_INPUTS).map(([key,value])=>[key,{dtype:'float32',label:key,...value}])),
  actorFlagBytes:{width:4,dtype:'float32',default:[0,0,0,0],domain:{min:0,max:255,integer:true},label:'行動者の現在stats18の4byte'},
  actorStanceRanks:{width:2,dtype:'float32',default:[0,0],domain:{min:-4,max:3,integer:true},label:'行動者のsigned3-bit rank8/9'},
  partyDefend:{width:4,dtype:'float32',default:Array(4).fill(0),domain:{min:0,max:255,integer:true},label:'味方stats21の防御モード'},
  enemyDefend:{width:8,dtype:'float32',default:Array(8).fill(0),domain:{min:0,max:255,integer:true},label:'敵stats21の防御モード'},
  partyTensionStage:{width:4,dtype:'float32',default:Array(4).fill(0),domain:{min:0,max:255,integer:true},label:'味方stats24の保存された符号なしbyte'},
  enemyOriginalMonsterIds:{width:8,dtype:'float32',default:Array(8).fill(-1),domain:{min:-1,max:65535,integer:true},label:'敵object.enemyType（AI定義IDとは独立、不在・不明は-1）'},
  enemyCoverSources:{width:8,dtype:'float32',default:Array(8).fill(-1),domain:{min:-32768,max:32767,integer:true},label:'敵stats+0x2cのかばう側ID（signed16）'},
  actorHp:{width:1,dtype:'float32',default:100,domain:{min:0,max:65535,integer:true},label:'行動者の現在HP'},
  actorMaxHp:{width:1,dtype:'float32',default:100,domain:{min:0,max:65535,integer:true},label:'行動者の最大HP'},
  enemyHp:{width:8,dtype:'float32',default:Array(8).fill(100),domain:{min:0,max:65535,integer:true},label:'敵の現在HP'},
  enemyAttackRank:{width:8,dtype:'float32',default:Array(8).fill(0),domain:{min:-4,max:3,integer:true},label:'敵のsigned3-bit攻撃段階'},
  enemyMaxHp:{width:8,dtype:'float32',default:Array(8).fill(100),domain:{min:0,max:65535,integer:true},label:'敵の最大HP'},
  actorBarrierRank:{width:1,dtype:'float32',default:0,domain:{min:-4,max:3,integer:true},label:'行動者の呪文耐性段階'},
  actorBreathJudgment:{width:1,dtype:'bool',default:false,label:'行動者のstats+0x3c bit2'},
  enemyBreathBarrierRank:{width:8,dtype:'float32',default:Array(8).fill(0),domain:{min:-4,max:3,integer:true},label:'敵のブレス耐性段階'}
};
const authority=[
  {file:'src/Combat/Overlay_24/func_ov024_021f1330.cpp',address:'JPN0x021f1afc',callback:56,sha256:'a81edb8e37867dcdafc0713bf85d0a02e9cb04824212a12222581c68d4b0be30'},
  {file:'src/Combat/Overlay_24/func_ov024_021f21b4.cpp',address:'JPN0x021f2980',callback:72,sha256:'a06e960a46c7a35ae121146e0998e5a4c3a3a4f7397b96f0735dae19acedad4b'},
  {file:'src/Combat/Overlay_24/func_ov024_021f2c30.cpp',address:'JPN0x021f33fc',callback:84},
  {file:'src/Combat/Overlay_24/func_ov024_021f1f64.cpp',address:'JPN0x021f2730',callback:69},
  {file:'src/Combat/Overlay_24/func_ov024_021f23e0.cpp',address:'JPN0x021f2bac',callback:74},
  {file:'src/Combat/Overlay_24/func_ov024_021f2ab4.cpp',address:'JPN0x021f3280',callback:83},
  {file:'src/Combat/Overlay_24/func_ov024_021f57a8.cpp',address:'JPN0x021f5f74',callback:140},
  {file:'src/Combat/Overlay_24/func_ov024_021eda78.cpp',scope:'Callback69 raw beneficial-state predicate, including exact defend modes1/2/4/5'},
  {file:'src/Combat/Overlay_24/func_ov024_021f2754.cpp',address:'JPN0x021f2f20',callback:80,sha256:'49bd5b66ddf582ccf4147ae90a4bf77e03606a42d7dab54f75c02fd0dcf847fd'},
  {file:'src/Combat/Overlay_24/func_ov024_021f286c.cpp',address:'JPN0x021f3038',callback:81,sha256:'716925b5e725e07eb5eef539ac899ca2fa804de59d14034c39465439ea4cd6a9'},
  {file:'src/Combat/Overlay_24/func_ov024_021f3168.cpp',address:'JPN0x021f3934',callback:90,sha256:'15ab59c68d2f3c66d3f35f7102e48fc936090a0810423990ae1c1aebf56f3582'},
  {file:'src/Combat/Overlay_24/func_ov024_021f6500.cpp',address:'JPN0x021f6ccc',callback:159,sha256:'347e52907b2fced0daff02749dee6c75ea37d8f8add0b7664b06920c8ec8a4f9'},
  {file:'src/Combat/Overlay_24/func_ov024_021edf00.cpp',sha256:'303ffac398e5576f49a9b95778521ccaa8e9f4c4f698c824de97106a09429904'},
  {file:'src/Combat/Overlay_24/func_ov024_021ed8c0.cpp',sha256:'abd0e22d3c01e3ec0c619fb808a4cc26970571cf629662a2d5dfd996541d08dd'}
];

function finish(g){
  const domains=g.contract.inputDomains??{};
  g.contract.inputDomains=Object.fromEntries(g.inputs.filter(d=>domains[d.name]||d.dtype==='bool').map(d=>[d.name,{...(domains[d.name]??{values:[false,true,0,1]}),width:d.shape[1]}]));
  g.contract.inputContractVersion=1;return g;
}

export function commonTargetCallbacks(g,x,previous,partyGraph){
  const attackSelector=g.eq(x.selectorIndex,84),magicSelector=g.eq(x.selectorIndex,74),dispelSelector=g.eq(x.selectorIndex,69),tensionSelector=g.eq(x.selectorIndex,83),rankSelector=g.or(g.eq(x.selectorIndex,72),attackSelector,magicSelector,dispelSelector,tensionSelector),ordinaryCover=g.or(g.eq(x.selectorIndex,80),g.eq(x.selectorIndex,81)),coverSelector=g.or(g.eq(x.selectorIndex,159),ordinaryCover),breathSelector=g.eq(x.selectorIndex,56),selfMagicSelector=g.eq(x.selectorIndex,90),barrierSelector=g.or(breathSelector,selfMagicSelector),selected=g.or(rankSelector,coverSelector,barrierSelector);
  const old=g.inline(previous,{...x,enabled:g.and(x.enabled,g.not(selected))},'shared_callback_previous_'+g.index);
  const ids=g.split(x.ids,4),present=g.split(x.present,4),candidate=g.split(x.candidate,4),dead=g.split(x.dead,4),excluded=g.split(x.excluded,4),defense=g.split(x.defense,4),partyRanks=g.split(x.partyRankFields,40),rank=g.split(x.defenseRank,4).map((value,i)=>g.where(magicSelector,partyRanks[i*10+6],g.where(attackSelector,partyRanks[i*10],value)));
  const enemyAttackRank=g.split(x.enemyAttackRank,8),enemyMagicRank=g.split(x.enemyBarrierRank,8),enemyIds=g.split(g.cast(x.enemyIds,'float32'),8),enemyPresent=g.split(x.enemyPresent,8),enemyCandidate=g.split(x.enemyCandidate,8),enemyDead=g.split(x.enemyDead,8),enemyExcluded=g.split(x.enemyExcluded,8),groups=g.split(g.cast(x.enemyGroups,'float32'),8),enemyDefense=g.split(x.enemyDefense,8),enemyRank=g.split(x.enemyDefenseRank,8).map((value,i)=>g.where(magicSelector,enemyMagicRank[i],g.where(attackSelector,enemyAttackRank[i],value))),enemyTypes=g.split(x.enemyOriginalMonsterIds,8),covered=g.split(x.enemyCoverSources,8);
  const statusBytes=g.split(x.partyStatusBytes,16),enemyStatusBytes=g.split(x.enemyStatusBytes,32),partyDefend=g.split(x.partyDefend,4),enemyDefend=g.split(x.enemyDefend,8),rawBit=(bytes,n)=>{const q=g.floor(g.mul(bytes[n>>>3],2**-(n&7)));return g.gt(g.sub(q,g.mul(g.floor(g.mul(q,.5)),2)),0);};
  const predicate=(status,mode,currentDefense,currentRank)=>g.or(
    g.and(dispelSelector,g.or(...[9,20,21,22,26,27,28,29,30,31].map(n=>rawBit(status,n)),...[1,2,4,5].map(n=>g.eq(mode,n)))),
    g.and(tensionSelector,g.or(rawBit(status,23),rawBit(status,24))),
    g.and(g.not(g.or(dispelSelector,tensionSelector)),g.or(g.not(g.eq(x.selectorIndex,72)),g.gt(currentDefense,0)),g.gt(currentRank,-2)));
  const eligible=ids.map((_,i)=>g.and(present[i],candidate[i],g.not(dead[i]),g.not(excluded[i]))),partyCount=sum(g,eligible);
  // 021edf00 accepts a live anger object even when it is excluded from an
  // ordinary roster. Filtering that single object must not reopen the roster.
  const sourceTyped=g.and(x.actorPresent,x.actorType400),rageGate=g.and(x.rageEnabled,sourceTyped);
  const rageParty=ids.map((id,i)=>g.and(rageGate,g.eq(id,x.rageId),present[i],g.not(dead[i])));
  const rageEnemies=enemyIds.map((id,i)=>g.and(rageGate,g.eq(id,x.rageId),enemyPresent[i],g.not(enemyDead[i])));
  const rage=g.or(...rageParty,...rageEnemies),rageKnown=g.or(g.lt(x.rageId,0),...ids.map(id=>g.eq(id,x.rageId)),...enemyIds.map(id=>g.eq(id,x.rageId)));
  const filtered=eligible.map((e,i)=>g.and(selectBool(g,rage,rageParty[i],e),predicate(statusBytes.slice(i*4,i*4+4),partyDefend[i],defense[i],rank[i])));
  const filteredEnemies=rageEnemies.map((e,i)=>g.and(e,predicate(enemyStatusBytes.slice(i*4,i*4+4),enemyDefend[i],enemyDefense[i],enemyRank[i])));
  const filteredCount=g.add(sum(g,filtered),sum(g,filteredEnemies)),initialCount=g.where(rage,1,partyCount);
  const defenseCoverage=g.or(g.and(tensionSelector,g.not(sourceTyped)),g.and(g.or(g.not(rageGate),rageKnown),g.or(g.le(filteredCount,0),x.actorPresent)));
  const defenseActive=g.and(x.enabled,rankSelector,defenseCoverage,g.or(g.not(tensionSelector),sourceTyped)),directTensionRage=g.and(defenseActive,tensionSelector,rage),repeatActive=g.and(defenseActive,g.not(directTensionRage),g.gt(filteredCount,0));
  const directEnemyRage=g.or(...filteredEnemies.map((e,i)=>g.and(e,g.not(enemyExcluded[i]))));
  // The shared helper only uses actorId for the explicit external anger
  // return. Its party selector still receives the original source history.
  const repeated=weightedTargetRepeats(g,{...x,actorId:x.rageId},partyGraph,filtered,repeatActive,directEnemyRage);
  const previousTargets=g.split(x.previousTargets,8),defenseBuffer=[...previousTargets];let defenseCount=g.constant(0);
  function append(buffer,count,id,keep){
    for(let j=0;j<8;j++)buffer[j]=g.where(g.and(keep,g.eq(count,j)),id,buffer[j]);
    return g.add(count,g.cast(keep,'float32'));
  }
  for(let i=0;i<4;i++)defenseCount=append(defenseBuffer,defenseCount,ids[i],filtered[i]);
  for(let i=0;i<8;i++)defenseCount=append(defenseBuffer,defenseCount,enemyIds[i],filteredEnemies[i]);
  const enumeratedDefense=g.and(defenseActive,g.gt(initialCount,0));
  const defenseNextCount=g.where(directTensionRage,1,g.where(repeatActive,repeated.count,g.where(enumeratedDefense,0,x.previousTargetCount)));
  const defenseTargets=g.where(directTensionRage,g.cat([x.rageId,...previousTargets.slice(1)]),g.where(repeatActive,repeated.targets,g.where(enumeratedDefense,g.cat(defenseBuffer),x.previousTargets)));
  // Callbacks72/84 return success after the repetition helper even when that
  // helper rejects an excluded anger object and writes a zero-count buffer.
  const defenseSuccess=g.or(directTensionRage,repeatActive);

  const enemyEligible=enemyIds.map((_,i)=>g.and(enemyPresent[i],enemyCandidate[i],g.not(enemyDead[i]),g.not(enemyExcluded[i]),g.lt(groups[i],x.enemyGroupCount)));
  const enemyHp=g.split(x.enemyHp,8),enemyMaxHp=g.split(x.enemyMaxHp,8);
  const sourceCanCover=g.and(x.actorPresent,x.actorType400,g.ge(x.actorId,192),g.le(x.actorId,199),g.gt(x.actorHp,0),g.ge(g.mul(x.actorHp,2),x.actorMaxHp));
  const coverAccepted=enemyEligible.map((e,i)=>g.and(e,selectBool(g,ordinaryCover,
    g.and(g.not(g.eq(enemyIds[i],x.actorId)),g.lt(covered[i],0),g.or(g.not(g.eq(x.selectorIndex,81)),g.eq(enemyHp[i],0),g.lt(g.mul(enemyHp[i],2),enemyMaxHp[i]))),
    g.and(g.eq(enemyTypes[i],314),g.le(covered[i],0)))));
  const coverBuffer=[...previousTargets];let coverCount=g.constant(0);
  for(let group=0;group<3;group++)for(let i=0;i<8;i++)coverCount=append(coverBuffer,coverCount,enemyIds[i],g.and(coverAccepted[i],g.eq(groups[i],group)));
  const enemyCount=sum(g,enemyEligible),coverActive=g.and(x.enabled,coverSelector,g.or(g.not(ordinaryCover),sourceCanCover)),coverDraw=g.and(coverActive,g.gt(coverCount,0));
  const draw=lcg(g,x.seed),index=bounded(g,normalized(g,draw.raw),g.max(coverCount,1));
  const chosen=coverBuffer.reduce((value,id,i)=>g.where(g.eq(index,i),id,value),coverBuffer[0]);
  const coverNextCount=g.where(coverActive,g.where(g.gt(enemyCount,0),g.where(coverDraw,1,0),x.previousTargetCount),x.previousTargetCount);
  const coverTargets=g.where(coverActive,g.cat(coverBuffer.map((id,i)=>i===0?g.where(coverDraw,chosen,id):id)),x.previousTargets);
  const partyStatus=g.split(x.partyStatusBytes,16),partyMp=g.split(x.partyMp,4),auxPresent=g.split(x.partyAuxiliaryPresent,4),auxBytes=g.split(x.partyAuxiliaryBytes,36),bit=(bytes,n)=>{const q=g.floor(g.mul(bytes[n>>>3],2**-(n&7)));return g.gt(g.sub(q,g.mul(g.floor(g.mul(q,.5)),2)),0);};
  const canCast=g.or(...eligible.map((e,i)=>g.and(e,auxPresent[i],g.gt(partyMp[i],0),g.not(bit(partyStatus.slice(i*4,i*4+4),8)),g.not(bit(partyStatus.slice(i*4,i*4+4),9)),g.or(...auxBytes.slice(i*9,i*9+9).map(value=>g.gt(value,0))))));
  const selfMagicSuccess=g.and(x.enabled,selfMagicSelector,sourceTyped,g.lt(x.actorBarrierRank,2),canCast);
  const breathRank=g.split(x.enemyBreathBarrierRank,8),breathActive=g.and(x.enabled,breathSelector,sourceTyped,x.actorBreathJudgment),breathBuffer=[...previousTargets];let breathCount=g.constant(0);
  for(let group=0;group<3;group++)for(let i=0;i<8;i++)breathCount=append(breathBuffer,breathCount,enemyIds[i],g.and(enemyEligible[i],g.eq(groups[i],group),g.lt(breathRank[i],2)));
  const breathDraw=g.and(breathActive,g.gt(breathCount,0)),breathIndex=bounded(g,normalized(g,draw.raw),g.max(breathCount,1)),breathChosen=breathBuffer.reduce((value,id,i)=>g.where(g.eq(breathIndex,i),id,value),breathBuffer[0]);
  const breathNextCount=g.where(g.and(breathActive,g.gt(enemyCount,0)),g.where(breathDraw,1,0),x.previousTargetCount),breathTargets=g.where(breathActive,g.cat(breathBuffer.map((id,i)=>i===0?g.where(breathDraw,breathChosen,id):id)),x.previousTargets);
  const barrierCount=g.where(selfMagicSelector,g.where(selfMagicSuccess,1,x.previousTargetCount),breathNextCount),barrierTargets=g.where(selfMagicSelector,g.where(selfMagicSuccess,g.cat([x.actorId,...previousTargets.slice(1)]),x.previousTargets),breathTargets);
  const nextSeed=g.where(barrierSelector,g.where(breathDraw,draw.seed,x.seed),g.where(rankSelector,g.where(repeatActive,repeated.seed,x.seed),g.where(coverDraw,draw.seed,x.seed)));
  const nextPosition=g.where(barrierSelector,g.add(x.position,g.cast(breathDraw,'int32')),g.where(rankSelector,g.where(repeatActive,repeated.position,x.position),g.add(x.position,g.cast(coverDraw,'int32'))));
  const success=selectBool(g,barrierSelector,g.or(selfMagicSuccess,breathDraw),selectBool(g,rankSelector,defenseSuccess,coverDraw)),coverage=selectBool(g,rankSelector,defenseCoverage,g.eq(0,0));
  return commonTensionStageTarget(g,x,commonStanceTargetCallbacks(g,x,commonPopulationTargetCallback(g,x,commonModifierTargetCallbacks(g,x,commonPoisonTargetCallbacks(g,x,commonSilenceTargetCallbacks(g,x,{
    nextSeed:g.where(selected,nextSeed,old.nextSeed),nextPosition:g.where(selected,nextPosition,old.nextPosition),consumed:g.where(selected,g.sub(nextPosition,x.position),old.consumed),
    supported:selectBool(g,selected,coverage,old.supported),callbackSuccess:selectBool(g,selected,success,old.callbackSuccess),
    targetCount:g.where(selected,g.where(barrierSelector,barrierCount,g.where(rankSelector,defenseNextCount,coverNextCount)),old.targetCount),targets:g.where(selected,g.where(barrierSelector,barrierTargets,g.where(rankSelector,defenseTargets,coverTargets)),old.targets),
    filteredCount:g.where(selected,g.where(barrierSelector,g.where(selfMagicSelector,g.cast(selfMagicSuccess,'float32'),breathCount),g.where(rankSelector,filteredCount,coverCount)),old.filteredCount),rageCandidateUsed:g.where(selected,g.cast(g.and(rankSelector,rage),'int32'),old.rageCandidateUsed),
    partyCount:g.where(selected,partyCount,old.partyCount),affectableCount:g.where(selected,g.where(barrierSelector,g.where(selfMagicSelector,g.cast(selfMagicSuccess,'float32'),breathCount),g.where(rankSelector,filteredCount,coverCount)),old.affectableCount)
  }))))));
}

// Callback140 uses the unsigned stored stage byte independently of its flags.
// The source actor and anger history are not consulted by this original body.
function commonTensionStageTarget(g,x,old){
  const selected=g.eq(x.selectorIndex,140),ids=g.split(x.ids,4),present=g.split(x.present,4),candidate=g.split(x.candidate,4),dead=g.split(x.dead,4),excluded=g.split(x.excluded,4),stage=g.split(x.partyTensionStage,4),eligible=ids.map((_,i)=>g.and(present[i],candidate[i],g.not(dead[i]),g.not(excluded[i]))),partyCount=sum(g,eligible),filtered=eligible.map((gate,i)=>g.and(gate,g.not(g.eq(stage[i],0)))),count=sum(g,filtered),active=g.and(x.enabled,selected),pick=g.and(active,g.gt(count,0)),buffer=[...g.split(x.previousTargets,8)];
  let offset=g.constant(0);for(let i=0;i<4;i++){for(let j=0;j<8;j++)buffer[j]=g.where(g.and(filtered[i],g.eq(offset,j)),ids[i],buffer[j]);offset=g.add(offset,g.cast(filtered[i],'float32'));}
  const draw=lcg(g,x.seed),index=bounded(g,normalized(g,draw.raw),g.max(count,1)),chosen=buffer.reduce((value,id,i)=>g.where(g.eq(index,i),id,value),buffer[0]),nextSeed=g.where(pick,draw.seed,x.seed),nextPosition=g.add(x.position,g.cast(pick,'int32')),enumerated=g.and(active,g.gt(partyCount,0)),targets=g.where(enumerated,g.cat([g.where(pick,chosen,buffer[0]),...buffer.slice(1)]),x.previousTargets);
  return{...old,nextSeed:g.where(selected,nextSeed,old.nextSeed),nextPosition:g.where(selected,nextPosition,old.nextPosition),consumed:g.where(selected,g.sub(nextPosition,x.position),old.consumed),supported:g.or(selected,old.supported),callbackSuccess:selectBool(g,selected,pick,old.callbackSuccess),targetCount:g.where(selected,g.where(enumerated,g.where(pick,1,0),x.previousTargetCount),old.targetCount),targets:g.where(selected,targets,old.targets),filteredCount:g.where(selected,count,old.filteredCount),rageCandidateUsed:g.where(selected,g.cast(g.mul(count,0),'int32'),old.rageCandidateUsed),partyCount:g.where(selected,partyCount,old.partyCount),affectableCount:g.where(selected,count,old.affectableCount)};
}

export async function buildCommonTargetCallbacks(previous){
  const party=await load('rom-party-target4');
  const g=new Graph('rom-common-ai-target',{
    ...structuredClone(previous.contract),authority:[...(previous.contract.authority??[]),...authority,...COMMON_MODIFIER_TARGET_AUTHORITY,...COMMON_POISON_TARGET_AUTHORITY,...COMMON_SILENCE_TARGET_AUTHORITY,...COMMON_STANCE_TARGET_AUTHORITY,COMMON_POPULATION_TARGET_AUTHORITY],
    scope:'Shared ROM target callbacks for one explicit four-party/eight-enemy population. Callback selection depends only on the action input, with no encounter or definition-ID dispatch.',
    callbackRules:{...previous.contract.callbackRules,...COMMON_MODIFIER_TARGET_RULES,...COMMON_POISON_TARGET_RULES,...COMMON_SILENCE_TARGET_RULES,...COMMON_STANCE_TARGET_RULES,
      116:'Typed source plus existing BT. Operation12 resolves the original summon table, loaded resource slots and full-group reuse availability; then the original cached live count must be below5 (source object type266 below8). Success writes self/count1, failure preserves the buffer, and neither path draws RNG.',
      56:'Existing typed enemy source with stats+0x3c bit2 enumerates live enemies in group order, keeps signed breath-barrier rank<2, and draws once from a nonempty list. The action execution scope subsequently determines whether the effect is self-only.',
      19:'Eligible enemy defense<65535, defense rank<2 and no raw status bit9; one bounded draw.',138:'Eligible party MP>0 and no raw status bit9; one bounded draw.',
      72:'Use a live anger object if available, otherwise the eligible party roster. Keep current DEF!=0 and signed defense rank>-2. Empty filtering rejects without a second roster fallback. Nonempty filtering invokes the original weighted-repeat helper.',
      84:'Use the same original anger-or-party enumeration and weighted-repeat helper as72, filtering signed attack rank>-2. Unlike72, neither current attack nor defense is tested for zero. Failure does not reopen the party roster.',
      69:'Use the original anger-or-party enumeration. Keep raw status14 bits9/20/21/22/26/27/28/29/30/31 or defend modes1/2/4/5, then use weighted repetition. Ordinary attack/defense ranks alone do not satisfy the original beneficial-state predicate.',
      74:'Use the original anger-or-party enumeration, keeping signed magic-barrier rank6>-2 without testing current defense or resolved susceptibility; then use weighted repetition.',
      83:'Require a typed source. A live anger object returns directly with count1 and no RNG, without checking tension or exclusion. Otherwise enumerate the party, retain raw low/high tension flags and use weighted repetition.',
      140:'Enumerate the eligible party, retain unsigned raw stats24!=0 independently of low/high flags, and consume one bounded draw for one survivor. No source/anger predicate is used; preserve count and buffer if the original initial roster is empty.' ,
      80:'The acting enemy must exist and have HP/maxHP>=0.5. Enumerate live nonexcluded enemies in group order, omit self and already-covered signed stats+0x2c>=0, then consume one bounded draw, including one candidate.',
      81:'Apply callback80 eligibility, then keep only targets with HP/maxHP<0.5. HP0/maxHP0 is zero in the original helper; positiveHP/maxHP0 is infinity. Integer comparisons preserve the original half threshold exactly.',
      90:'Existing typed enemy source with magic-barrier rank<2 selects itself only if an eligible party actor has spell knowledge, positive MP and neither silence nor spell-reflection status. No RNG is consumed; early rejection preserves the target buffer and count.',
      159:'Enumerate eligible enemy groups in source roster order. Keep object.enemyType314 and signed stats+0x2c<=0. A nonempty filtered list consumes one bounded draw, including a single candidate, then overwrites target0 and count1.'},
    objectIdentity:'enemyOriginalMonsterIds is the immutable object enemyType, not its current AI definition ID. The callback159 literal314 belongs to the ROM helper and does not choose a battle program.',
    rawProjection:previous.contract.rawProjection+' enemyOriginalMonsterIds comes from object.enemyType; enemyCoverSources is signed16 currentStats+0x2c, reset to -1 at turn entry.',
    defaults:{...previous.contract.defaults,...Object.fromEntries(Object.entries(COMMON_TARGET_INPUTS).map(([name,s])=>[name,s.default]))},
    labels:{...previous.contract.labels,...Object.fromEntries(Object.entries(COMMON_TARGET_INPUTS).map(([name,s])=>[name,s.label]))},
    inputDomains:{...previous.contract.inputDomains,...Object.fromEntries(Object.entries(COMMON_TARGET_INPUTS).map(([name,s])=>[name,s.domain]))}
  });
  const x=Object.fromEntries(previous.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)]));
  for(const[name,s]of Object.entries(COMMON_TARGET_INPUTS))x[name]=g.input(name,['N',s.width],s.dtype);
  for(const[name,value]of Object.entries(commonTargetCallbacks(g,x,previous,party)))g.output(value,name);
  return finish(g);
}

export async function buildCommonAiStep(target){
  const previous=await load('rom-ai-transition-step',expanded),decision=buildDecisionGraph(await load('rom-weighted-ai6'));
  const g=new Graph('rom-common-ai-step',{
    ...structuredClone(previous.contract),authority:[...decision.contract.authority,...target.contract.authority],
    defaults:{...target.contract.defaults,...previous.contract.defaults},labels:{...previous.contract.labels,...target.contract.labels},
    inputDomains:{...previous.contract.inputDomains,...target.contract.inputDomains},callbackRules:target.contract.callbackRules,rawProjection:target.contract.rawProjection,
    sharedBase:{name:previous.name,sha256:hash(await readFile(new URL(previous.name+'.onnx',expanded)))}
  });
  delete g.contract.defaults.selectorIndex;
  const x=Object.fromEntries(previous.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)]));
  for(const d of target.inputs)if(!(d.name in x)&&d.name!=='selectorIndex')x[d.name]=g.input(d.name,d.shape,d.dtype);
  for(const[name,value]of Object.entries(aiClosedStep(g,x,decision,target)))g.output(value,name);
  return finish(g);
}
