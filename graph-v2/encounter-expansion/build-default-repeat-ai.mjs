import {sourceSHA256} from '../../data/source-authority.mjs';
// Complete callback0 routing and raw target repetition, composed with the
// immutable common callbacks. Existing encounter graphs are not regenerated.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Graph,lcg,normalized,bounded} from '../graph-builder.mjs';
import {buildDecisionGraph} from '../build-ai-decision.mjs';
import {aiClosedStep} from '../build-ai-closed.mjs';
import {monsterAiInputs} from './profiles.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';

const directory=new URL('./',import.meta.url),shared=new URL('../',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
const boolSelect=(g,c,a,b)=>g.gt(g.where(c,g.cast(a,'float32'),g.cast(b,'float32')),0);
const sum=(g,values)=>values.reduce((a,b)=>g.add(a,g.cast(b,'float32')),g.constant(0));
const choose=(g,values,index)=>values.reduce((v,item,i)=>g.where(g.eq(index,i),item,v),values[0]);
const load=async(name,local=false)=>JSON.parse(await readFile(new URL(`${name}.json`,local?directory:shared),'utf8'));
export const DEFAULT_REPEAT_ENEMY_INPUTS={
  enemyIds:{dtype:'int32',width:8,default:Array.from({length:8},(_,i)=>192+i),domain:{min:192,max:199,integer:true},label:'敵オブジェクトID（8列・一意）'},
  enemyPresent:{dtype:'bool',width:8,default:[true,...Array(7).fill(false)],label:'敵オブジェクトの実在（roster参加とは別）'},
  enemyCandidate:{dtype:'bool',width:8,default:[true,...Array(7).fill(false)],label:'敵グループrosterへの参加'},
  enemyDead:{dtype:'bool',width:8,default:Array(8).fill(false),label:'敵の死亡フラグ（stats14 bit0、HPとは独立）'},
  enemyExcluded:{dtype:'bool',width:8,default:Array(8).fill(false),label:'敵の対象除外（flags18 & 0x2000）'},
  enemyGroups:{dtype:'int32',width:8,default:Array(8).fill(0),domain:{min:0,max:2,integer:true},label:'敵rosterグループ（同グループ内は入力列順）'},
  actorGroup:{dtype:'int32',width:1,default:0,domain:{min:0,max:2,integer:true},label:'行動する敵のグループbyte17c'}
};
function contractShapes(g){
  const domains=g.contract.inputDomains??{};
  g.contract.inputDomains=Object.fromEntries(g.inputs.filter(d=>domains[d.name]||d.dtype==='bool').map(d=>[d.name,{...(domains[d.name]??{values:[false,true,0,1]}),width:d.shape[1]}]));
  g.contract.inputContractVersion=1;return g;
}

export function defaultRepeatedTarget(g,x,base,partyGraph){
  const isDefault=g.eq(x.selectorIndex,0),old=g.inline(base,{...x,enabled:g.and(x.enabled,g.not(isDefault))},`repeat_common_${g.index}`),
    self=g.eq(x.targetScope,1),party=g.and(g.eq(x.targetSide,1),g.not(self)),enemy=g.and(g.eq(x.targetSide,2),g.not(self)),
    partySingle=g.and(party,g.or(g.eq(x.targetScope,2),g.eq(x.targetScope,5))),partyAll=g.and(party,g.or(g.eq(x.targetScope,3),g.eq(x.targetScope,4))),
    enemySingle=g.and(enemy,g.or(g.eq(x.targetScope,2),g.eq(x.targetScope,8))),enemyAll=g.and(enemy,g.or(g.eq(x.targetScope,3),g.eq(x.targetScope,4))),
    enemyOther=g.and(enemy,g.eq(x.targetScope,8)),enemyGroup=g.and(enemy,g.eq(x.targetScope,4)),
    ids=g.split(x.ids,4),present=g.split(x.present,4),candidate=g.split(x.candidate,4),dead=g.split(x.dead,4),excluded=g.split(x.excluded,4),
    enemyIds=g.split(g.cast(x.enemyIds,'float32'),8),enemyPresent=g.split(x.enemyPresent,8),enemyCandidate=g.split(x.enemyCandidate,8),
    enemyDead=g.split(x.enemyDead,8),enemyExcluded=g.split(x.enemyExcluded,8),enemyGroups=g.split(g.cast(x.enemyGroups,'float32'),8),actorGroup=g.cast(x.actorGroup,'float32'),
    eligible=ids.map((_,i)=>g.and(present[i],candidate[i],g.not(dead[i]),g.not(excluded[i]))),partyCount=sum(g,eligible),
    inParty=g.or(...ids.map(id=>g.eq(id,x.rageId))),inEnemies=g.or(...enemyIds.map(id=>g.eq(id,x.rageId))),
    externalRage=g.and(x.rageEnabled,g.or(...enemyIds.map((id,i)=>g.and(g.eq(id,x.rageId),enemyPresent[i],g.not(enemyDead[i]),g.not(enemyExcluded[i]))))),
    rageKnown=g.or(g.lt(x.rageId,0),inParty,inEnemies),coverage=g.and(x.actorPresent,g.or(g.not(partySingle),g.not(x.rageEnabled),rageKnown)),
    active=g.and(x.enabled,isDefault,coverage),doPartySingle=g.and(active,partySingle),
    partyInputs=Object.fromEntries(partyGraph.inputs.map(d=>[d.name,x[d.name]]));
  Object.assign(partyInputs,{hp:g.where(x.dead,0,1),candidate:g.cat(eligible.map(e=>g.and(e,doPartySingle,g.not(externalRage)))),rageEnabled:g.and(doPartySingle,g.not(externalRage),x.rageEnabled)});
  const pickedParty=g.inline(partyGraph,partyInputs,`repeat_party_${g.index}`),partyTarget=g.where(externalRage,x.rageId,pickedParty.targetId),
    prior=g.split(x.previousTargets,8),partyBuffer=[...prior];
  let partyRank=g.constant(0);
  for(let i=0;i<4;i++){
    for(let j=0;j<4;j++)partyBuffer[j]=g.where(g.and(eligible[i],g.eq(partyRank,j)),ids[i],partyBuffer[j]);
    partyRank=g.add(partyRank,g.cast(eligible[i],'float32'));
  }
  // The ROM walks group0..2, then each group's source roster order. Empty
  // uniform selection reads the actual local constant's first short (-1).
  const enemyBuffer=[...prior];let enemyCount=g.constant(0);
  for(let group=0;group<3;group++)for(let i=0;i<8;i++){
    const keep=g.and(enemyPresent[i],enemyCandidate[i],g.not(enemyDead[i]),g.not(enemyExcluded[i]),g.eq(enemyGroups[i],group),
      g.or(g.not(enemyGroup),g.eq(enemyGroups[i],actorGroup)),g.or(g.not(enemyOther),g.not(g.eq(enemyIds[i],x.actorId))));
    for(let j=0;j<8;j++)enemyBuffer[j]=g.where(g.and(keep,g.eq(enemyCount,j)),enemyIds[i],enemyBuffer[j]);
    enemyCount=g.add(enemyCount,g.cast(keep,'float32'));
  }
  const selectEnemy=g.and(active,enemySingle,g.gt(enemyCount,0)),enemyDraw=lcg(g,pickedParty.nextSeed),
    enemyIndex=g.where(g.gt(enemyCount,0),bounded(g,normalized(g,enemyDraw.raw),enemyCount),0),
    enemyTarget=g.where(g.gt(enemyCount,0),choose(g,enemyBuffer,enemyIndex),g.where(enemyOther,x.actorId,-1)),
    selectionSeed=g.where(selectEnemy,enemyDraw.seed,pickedParty.nextSeed),selectionPosition=g.add(pickedParty.nextPosition,g.cast(selectEnemy,'int32')),
    initialCount=g.where(self,1,g.where(partySingle,1,g.where(partyAll,partyCount,g.where(enemySingle,1,g.where(enemyAll,enemyCount,0))))),
    initialBuffer=prior.map((p,i)=>g.where(self,i===0?x.actorId:p,
      g.where(partySingle,i===0?partyTarget:partyBuffer[i],g.where(partyAll,partyBuffer[i],g.where(enemySingle,i===0?enemyTarget:p,g.where(enemyAll,enemyBuffer[i],p))))));
  // Unlike the smart weighted-repeat helper, callback0 always draws both table
  // replacements before consulting repeatCode, even for fixed/zero counts.
  const first=lcg(g,selectionSeed),second=lcg(g,first.seed),repeatTable=[0,0,0,g.add(bounded(g,normalized(g,first.raw),2),3),2,4,0,7,3,0,1,g.add(bounded(g,normalized(g,second.raw),3),6)];
  let repeats=g.constant(0);for(let i=0;i<12;i++)repeats=g.where(g.eq(x.repeatCode,i),repeatTable[i],repeats);
  let seed=g.where(active,second.seed,x.seed),position=g.where(active,g.add(selectionPosition,g.constant(2,'int32')),x.position);
  const sampled=[];
  for(let i=0;i<8;i++){
    const draw=lcg(g,seed),needsDraw=g.and(active,g.lt(i,repeats),g.gt(initialCount,0)),
      index=g.where(g.gt(initialCount,0),bounded(g,normalized(g,draw.raw),initialCount),0);
    sampled.push(choose(g,initialBuffer,index));seed=g.where(needsDraw,draw.seed,seed);position=g.add(position,g.cast(needsDraw,'int32'));
  }
  const repeated=g.gt(repeats,0),targets=g.cat(initialBuffer.map((v,i)=>g.where(repeated,g.where(g.lt(i,repeats),sampled[i],g.where(g.lt(i,initialCount),0,v)),v))),
    actualTargets=g.where(active,targets,x.previousTargets),actualCount=g.where(active,g.where(repeated,repeats,initialCount),x.previousTargetCount);
  return{
    nextSeed:g.where(isDefault,seed,old.nextSeed),nextPosition:g.where(isDefault,position,old.nextPosition),
    consumed:g.where(isDefault,g.sub(position,x.position),old.consumed),supported:boolSelect(g,isDefault,coverage,old.supported),
    callbackSuccess:boolSelect(g,isDefault,active,old.callbackSuccess),targetCount:g.where(isDefault,actualCount,old.targetCount),targets:g.where(isDefault,actualTargets,old.targets),
    filteredCount:g.where(isDefault,initialCount,old.filteredCount),rageCandidateUsed:g.where(isDefault,g.cast(g.and(active,partySingle,g.or(externalRage,g.gt(g.cast(pickedParty.usedRage,'float32'),0))),'int32'),old.rageCandidateUsed),
    partyCount:g.where(isDefault,partyCount,old.partyCount),affectableCount:g.where(isDefault,initialCount,old.affectableCount)
  };
}

export async function buildDefaultRepeatTargetGraph(){
  const base=await load('rom-ai-common-target4',true),party=await load('rom-party-target4'),sources=[['02154a04','02156184'],['0215fbe0','02161360'],['02153d10','02155490'],['02153d78',null],['02153e78',null],['0215eb1c',null]];
  const authority=await Promise.all(sources.map(async([us,jp])=>{const file=`src/Combat/Overlay_0/func_ov000_${us}.cpp`;return{file,...(jp?{address:`overlay0:0x${jp}`}:{USA_name_address:`0x${us}`}),matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10',sha256:sourceSHA256(file)};}));
  const g=new Graph('rom-ai-default-repeat-target4',{
    ...base.contract,authority:[...base.contract.authority,...authority],
    scope:'Immutable common smart/wise callbacks plus complete default callback0 routing for an existing record: self; weighted/all party; uniform/all/group/other enemy; the actual two-draw repeat table and subsequent resampling with replacement.',
    scopeJa:'既存のAI対象処理に、通常判断の敵全体・同グループ・自分以外・一様抽選と、ROMの繰返し表を追加します。最大4人＋8敵の対象決定を扱い、技の効果実行は別処理です。',
    routing:'Scope1 selects source regardless of side. Party side1 scopes2/5 select weighted after enumeration,3/4 enumerate. Enemy side2 scope2 selects uniformly,8 excludes source and returns source if empty,4 enumerates source group,3 enumerates all. Other routes yield count0. All callbacks require an existing action record; record lookup failure is outside this projection.',
    repetitions:'Copy the actual12-byte table [0,0,0,0,2,4,0,7,3,0,1,0], then always draw inclusive3..4 into slot3 and6..8 into slot11. Codes12..31 return0 after those draws. A positive count resamples with replacement from the original target buffer. bounded(0) returns0 and consumes no RNG, so an empty list repeats its preserved first short.',
    padding:'For callback0 every one of the8 signed target-buffer shorts follows the original in-place writes, including enumeration residue, zeroing the original count before copying repetitions, and untouched tail. Other callbacks retain their immutable common-model contracts.',
    enemyPopulation:'enemyIds contains distinct192..199 IDs. Columns preserve within-group roster order; enumeration visits groups0,1,2. Present/roster/dead/excluded are separate. HP is not a substitute for raw deadbit. All eight object slots may exist outside the candidate roster, including the source. actorGroup is the actual source byte17c and must agree with its represented object. Party roster order and special-battle eligibility have already been projected by the caller.',
    exclusions:'Existing source object and existing action record required for callback0. Rage lookups consulted by weighted party selection must be among the supplied party/enemy IDs or negative. Other handlers keep the immutable common target model limitations. This is target selection, not a complete encounter.',
    defaults:{...base.contract.defaults,selectorIndex:0,targetSide:1,targetScope:3,repeatCode:3,...Object.fromEntries(Object.entries(DEFAULT_REPEAT_ENEMY_INPUTS).map(([k,v])=>[k,v.default]))},
    labels:{...base.contract.labels,...Object.fromEntries(Object.entries(DEFAULT_REPEAT_ENEMY_INPUTS).map(([k,v])=>[k,v.label]))},
    inputDomains:{...base.contract.inputDomains,previousTargets:{min:-32768,max:32767,integer:true},...Object.fromEntries(Object.entries(DEFAULT_REPEAT_ENEMY_INPUTS).filter(([,v])=>v.domain).map(([k,v])=>[k,v.domain]))},
    example:'Actual action73 target fields side1/scope3/repeat3 with one party and one enemy object; prior output buffer is explicit. The closed default uses original monster301 action slots.',
    sharedBase:{model:base.name,sha256:hash(await readFile(new URL(`${base.name}.onnx`,directory)))},
    rawBufferAuthority:'evidence-v2/ghidra/default-target-defined/response.json and damage-selector-pure-defined/response.json; actual callback0 through-return input-only cohorts are verified separately.'
  });
  const x=Object.fromEntries(base.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)]));
  for(const[name,spec]of Object.entries(DEFAULT_REPEAT_ENEMY_INPUTS))x[name]=g.input(name,['N',spec.width],spec.dtype);
  for(const[name,value]of Object.entries(defaultRepeatedTarget(g,x,base,party)))g.output(value,name);
  return contractShapes(g);
}
export async function buildDefaultRepeatStepGraph(target){
  const previous=await load('rom-ai-common-step',true),prefix=await load('rom-weighted-ai6'),decision=buildDecisionGraph(prefix),monster=rom.monsters.find(m=>m.id===301);
  target??=await buildDefaultRepeatTargetGraph();
  const g=new Graph('rom-ai-default-repeat-step',{
    ...previous.contract,authority:[...decision.contract.authority,...target.contract.authority],
    scope:'One bounded closed AI step with immutable common candidate rules and smart/wise handlers plus complete callback0 default routing/repetition for existing records. Default is actual monster301; effects and full-turn execution are separate.',
    scopeJa:'黒騎士の実行動表を既定値に、候補選択・使用条件・対象決定・採用または再探索を1回進めます。さみだれづきの対象繰返しとホイミの敵側抽選も含みます。',
    callbacks:target.contract.scope,exclusions:target.contract.exclusions,enemyPopulation:target.contract.enemyPopulation,repetitions:target.contract.repetitions,
    defaults:{...previous.contract.defaults,...monsterAiInputs(monster),...Object.fromEntries(Object.entries(DEFAULT_REPEAT_ENEMY_INPUTS).map(([k,v])=>[k,v.default])),actorAttack:monster.attack,actorDefense:monster.defense},
    labels:{...previous.contract.labels,...target.contract.labels},inputDomains:{...previous.contract.inputDomains,...target.contract.inputDomains},
    defaultMonsterId:301,defaultMonsterName:monster.name,defaultSteps:7,targetBufferScope:target.contract.padding,
    example:'Actual monster301 uses [249,1,73,30,249,73], scheme5, judgment0. Dynamic MP/usedSlots/actor cursor and initial output buffer are explicit state. A numerical example does not replace the separate original-profile and actual whole-turn proofs.'
  });
  const x=Object.fromEntries(previous.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)]));
  for(const[name,spec]of Object.entries(DEFAULT_REPEAT_ENEMY_INPUTS))x[name]=g.input(name,['N',spec.width],spec.dtype);
  for(const[name,value]of Object.entries(aiClosedStep(g,x,decision,target)))g.output(value,name);
  return contractShapes(g);
}
async function save(g){const bytes=g.model();for(const[ext,value]of[['onnx',bytes],['json',JSON.stringify(g.json(),null,2)+'\n']]){const name=`${g.name}.${ext}`,tmp=new URL(`${name}.pending-${process.pid}`,directory);await writeFile(tmp,value);await rename(tmp,new URL(name,directory));}return{model:g.name,modelSHA256:hash(bytes),nodes:g.nodes.length,bytes:bytes.length};}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const target=await buildDefaultRepeatTargetGraph(),step=await buildDefaultRepeatStepGraph(target),reports=[];
  for(const graph of[target,step])reports.push(await save(graph));
  const tmp=new URL(`default-repeat-ai-models.json.pending-${process.pid}`,directory);await writeFile(tmp,JSON.stringify(reports,null,2)+'\n');await rename(tmp,new URL('default-repeat-ai-models.json',directory));console.log(JSON.stringify(reports,null,2));
}
