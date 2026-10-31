import {sourceSHA256} from '../../data/source-authority.mjs';
// Additional actual smart/wise callbacks. Previously delivered graphs are read
// as immutable IR; this module writes only the two new common variants.
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
const sum=(g,xs)=>xs.reduce((a,b)=>g.add(a,g.cast(b,'float32')),g.constant(0));
const named=(g,index,values)=>g.or(...values.map(x=>g.eq(index,x)));
async function load(name,local=false){return JSON.parse(await readFile(new URL(`${name}.json`,local?directory:shared),'utf8'));}
function validateContractShape(g){
  const domains=g.contract.inputDomains??{};
  g.contract.inputDomains=Object.fromEntries(g.inputs.filter(d=>domains[d.name]||d.dtype==='bool').map(d=>[d.name,{...(domains[d.name]??{values:[false,true,0,1]}),width:d.shape[1]}]));
  g.contract.inputContractVersion=1;return g;
}
const additionalInputs={
  actorAttack:{dtype:'float32',width:1,default:163,label:'行動する敵の現在攻撃力（u16）',domain:{min:0,max:65535,integer:true}},
  actorDefense:{dtype:'float32',width:1,default:160,label:'行動する敵の現在守備力（怒り対象が自分の場合）',domain:{min:0,max:65535,integer:true}},
  actorBlind:{dtype:'bool',width:1,default:false,label:'行動する敵の幻惑（stats14 & 0x40）'},
  status9:{dtype:'bool',width:4,default:[false,false,false,false],label:'味方の状態フラグ9（stats14 & 0x200）'}
};

export function commonTarget(g,x,base,partyGraph){
  const index=x.selectorIndex,is1=g.eq(index,1),is9=g.eq(index,9),is7=g.eq(index,7),is61=g.eq(index,61),
    aggregate=named(g,index,[3,4,157]),is157=g.eq(index,157),repeated=named(g,index,[1,7,9,61]),extra=g.or(aggregate,repeated),
    old=g.inline(base,{...x,enabled:g.and(x.enabled,g.not(extra))},`common_base_${g.index}`),
    ids=g.split(x.ids,4),present=g.split(x.present,4),candidate=g.split(x.candidate,4),dead=g.split(x.dead,4),excluded=g.split(x.excluded,4),
    paralyzed=g.split(x.paralyzed,4),defense=g.split(x.defense,4),status9=g.split(x.status9,4),status26=g.split(x.status26,4),
    live=ids.map((_,i)=>g.and(present[i],g.not(dead[i]))),eligible=ids.map((_,i)=>g.and(live[i],candidate[i],g.not(excluded[i]))),partyCount=sum(g,eligible),
    inParty=g.or(...ids.map(id=>g.eq(id,x.rageId))),actorMatch=g.eq(x.rageId,x.actorId),
    externalAlive=g.and(actorMatch,x.actorPresent,g.not(x.actorDead)),
    rageParty=ids.map((id,i)=>g.and(x.rageEnabled,x.actorPresent,g.eq(id,x.rageId),live[i])),
    rageActor=g.and(x.rageEnabled,x.actorPresent,g.not(inParty),externalAlive),
    rageCandidate=g.or(...rageParty,rageActor),rageKnown=g.or(g.lt(x.rageId,0),inParty,actorMatch),
    ragePrefix=g.and(g.or(is1,is9),rageCandidate),
    initialParty=eligible.map((e,i)=>boolSelect(g,ragePrefix,rageParty[i],e)),
    initialCount=g.where(ragePrefix,1,partyCount),
    filtered=initialParty.map((e,i)=>g.and(e,boolSelect(g,is1,g.gt(g.mul(x.actorAttack,2),defense[i]),boolSelect(g,is9,g.not(paralyzed[i]),g.eq(0,0))))),
    filteredActor=g.and(ragePrefix,rageActor,boolSelect(g,is1,g.gt(g.mul(x.actorAttack,2),x.actorDefense),g.not(x.actorParalyzed))),
    filteredCount=g.add(sum(g,filtered),g.cast(filteredActor,'float32')),
    sourceGate=g.or(g.not(is1),g.and(x.actorPresent,g.not(x.actorBlind))),
    enough=g.where(is9,2,1),reachesRepeat=g.and(repeated,sourceGate,g.ge(filteredCount,enough)),
    needsRage=g.and(repeated,sourceGate,g.or(is1,is9,g.gt(partyCount,0))),
    coverage=g.and(g.or(g.not(needsRage),g.not(x.rageEnabled),rageKnown),g.or(g.not(reachesRepeat),x.actorPresent)),
    supported=g.where(extra,g.cast(coverage,'float32'),g.cast(old.supported,'float32')),
    active=g.and(x.enabled,coverage),runRepeat=g.and(active,reachesRepeat),
    externalWeighted=g.and(x.rageEnabled,g.not(inParty),externalAlive,g.not(x.actorExcluded)),
    affected=sum(g,eligible.map((e,i)=>g.and(e,boolSelect(g,is157,status26[i],status9[i])))),
    allAccepted=g.and(active,aggregate,g.gt(partyCount,0),g.lt(g.mul(affected,3),partyCount));

  // Candidate buffers are actual in-place writes, including rejection after a
  // single non-paralyzed candidate in callback9. Their unused bytes matter.
  const prior=g.split(x.previousTargets,8),packedParty=Array(4).fill(g.constant(0));let partyRank=g.constant(0);
  for(let i=0;i<4;i++){
    for(let j=0;j<4;j++)packedParty[j]=g.where(g.and(eligible[i],g.eq(partyRank,j)),ids[i],packedParty[j]);
    partyRank=g.add(partyRank,g.cast(eligible[i],'float32'));
  }
  const allTargets=g.cat([...packedParty,...prior.slice(4)]),filteredBuffer=[...prior];let filteredRank=g.constant(0);
  for(let i=0;i<4;i++){
    for(let j=0;j<4;j++)filteredBuffer[j]=g.where(g.and(filtered[i],g.eq(filteredRank,j)),ids[i],filteredBuffer[j]);
    filteredRank=g.add(filteredRank,g.cast(filtered[i],'float32'));
  }
  filteredBuffer[0]=g.where(filteredActor,x.actorId,filteredBuffer[0]);
  const filtering=g.and(active,g.or(is1,is9),sourceGate,g.gt(initialCount,0)),
    earlyCount=g.where(filtering,0,g.where(g.and(active,g.or(is7,is61)),partyCount,x.previousTargetCount)),
    earlyTargets=g.where(filtering,g.cat(filteredBuffer),x.previousTargets);

  // Real weighted-repeat helper: code3 draws an inclusive3..4; fixed counts
  // are2/4/7/3 for4/5/7/8. Other codes use one pick, without the callback0
  // helper's two unconditional repeat draws.
  const repeatDraw=lcg(g,x.seed),drawRepeat=g.and(runRepeat,g.eq(x.repeatCode,3)),
    repeats=g.where(g.eq(x.repeatCode,3),g.add(bounded(g,normalized(g,repeatDraw.raw),2),3),
      g.where(g.eq(x.repeatCode,4),2,g.where(g.eq(x.repeatCode,5),4,g.where(g.eq(x.repeatCode,7),7,g.where(g.eq(x.repeatCode,8),3,1)))));
  let seed=g.where(drawRepeat,repeatDraw.seed,x.seed),position=g.add(x.position,g.cast(drawRepeat,'int32')),picking=runRepeat,count=g.constant(0);
  const laneZero=g.mul(filteredCount,0),result=[g.add(laneZero,-1),...Array(7).fill(laneZero)],liveAsHp=g.where(x.dead,0,1);
  for(let j=0;j<7;j++){
    const enabled=g.and(picking,g.lt(j,repeats)),weightedEnabled=g.and(enabled,g.not(externalWeighted)),
      feeds=Object.fromEntries(partyGraph.inputs.map(d=>[d.name,x[d.name]]));
    Object.assign(feeds,{seed,position,hp:liveAsHp,candidate:g.cat(filtered.map(e=>g.and(e,weightedEnabled))),rageEnabled:g.and(weightedEnabled,x.rageEnabled)});
    const picked=g.inline(partyGraph,feeds,`common_repeat${j}_${g.index}`),id=g.where(externalWeighted,x.actorId,picked.targetId),success=g.and(enabled,g.ge(id,0));
    result[j]=g.where(success,id,result[j]);count=g.add(count,g.cast(success,'float32'));
    seed=picked.nextSeed;position=picked.nextPosition;picking=success;
  }
  const repeatTargets=g.cat(result),success=g.or(allAccepted,g.and(runRepeat,g.or(is61,g.gt(count,0)))),
    nextSeed=g.where(extra,g.where(runRepeat,seed,x.seed),old.nextSeed),
    nextPosition=g.where(extra,g.where(runRepeat,position,x.position),old.nextPosition),
    targetCount=g.where(extra,g.where(allAccepted,partyCount,g.where(runRepeat,count,earlyCount)),old.targetCount),
    targets=g.where(extra,g.where(allAccepted,allTargets,g.where(runRepeat,repeatTargets,earlyTargets)),old.targets);
  return{
    nextSeed,nextPosition,consumed:g.sub(nextPosition,x.position),supported:g.gt(supported,0),
    callbackSuccess:boolSelect(g,extra,success,old.callbackSuccess),targetCount,targets,
    filteredCount:g.where(extra,filteredCount,old.filteredCount),rageCandidateUsed:g.where(extra,g.cast(ragePrefix,'int32'),old.rageCandidateUsed),
    partyCount,affectableCount:g.where(aggregate,g.sub(partyCount,affected),g.where(repeated,filteredCount,old.affectableCount))
  };
}

export async function buildCommonTargetGraph(){
  const base=await load('rom-ai-nushi-target4',true),party=await load('rom-party-target4'),sources=[['021edfa0','021ee76c'],['021ee20c','021ee9d8'],['021ee378','021eeb44'],['021f639c','021f6b68'],['021ed8c0','021ee08c'],['021ee454','021eec20']];
  const authority=await Promise.all(sources.map(async([us,jp])=>{const file=`src/Combat/Overlay_24/func_ov024_${us}.cpp`;return{file,address:`overlay24:0x${jp}`,matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10',sha256:sourceSHA256(file)};}));
  const g=new Graph('rom-ai-common-target4',{
    ...base.contract,authority:[...base.contract.authority,...authority],
    scope:'Immutable callbacks0/24/32/62/158 plus actual callbacks1/3/4/7/9/61/157 and their shared weighted-repeat helper. This chooses or rejects targets; it does not execute an action effect or a battle.',
    scopeJa:'既存の対象選択に、攻撃力と守備力による採否、状態人数が3分の1未満かの判定、最大7回の重み付き対象抽選を追加します。行動の効果や戦闘の勝敗は別処理です。',
    selector1:'Missing or blind source rejects without writes. A live anger target is the initial candidate list even outside the party roster; otherwise enumerate eligible party. Keep targets with2*sourceAttack>targetDefense. If the initial list was nonempty, count is cleared even when every target fails. Then use weighted repetition.',
    selector3and4:'Enumerate eligible party; reject empty or3*status9Count>=partyCount. Otherwise copy the four-short local list and preserve the caller last four shorts. status9 is raw stats14&0x200, without an invented state name.',
    selector157:'The same strict one-third condition using status26 (0x04000000). Unlike158 it has no additional non-sleeping-target condition.',
    selector7and61:'Enumerate directly into caller targets, then set count. Empty party rejects with count0 and prior buffer retained, even with a valid anger target. Nonempty invokes the shared repeated weighted selection. Callback7 returns firstTarget>=0;61 returns success after helper invocation regardless of final count.',
    selector9:'Anger list first, otherwise party. Write non-paralyzed candidates in source order. Fewer than2 then sets count0 and rejects, preserving already-written buffer slots. Otherwise invoke the same repeated weighted selection.',
    repetitions:'Actual code3 draws inclusive3..4. Codes4/5/7/8 mean2/4/7/3 picks. All other codes0..31 mean1 pick. The same filtered candidate list is reused; replacement is allowed. Only code3 consumes a repeat-count draw.',
    padding:'For new callbacks1/3/4/7/9/61/157, all8 target buffer shorts follow actual writes, including rejection and unused tail. Weighted helper constant is[-1,0,0,0,0,0,0,0]. Inherited callbacks0/24/32/62/158 retain their existing diagnostic unused-slot normalization; only firstcount slots are semantic there.',
    exclusions:'The acting enemy and all4 party object slots must be represented. Unknown external anger population yields supported=false when consulted; missing weighted source is unsupported if the helper would run. Callback0 keeps its prior routing/repeat0 restrictions. Unsupported handlers are preserved explicitly. This does not supply a general full-battle engine.',
    defaults:{...base.contract.defaults,selectorIndex:1,actorAttack:163,actorDefense:160,actorBlind:false,status9:[false,false,false,false]},
    labels:{...base.contract.labels,...Object.fromEntries(Object.entries(additionalInputs).map(([k,v])=>[k,v.label]))},
    inputDomains:{...base.contract.inputDomains,actorId:{min:192,max:199,integer:true},...Object.fromEntries(Object.entries(additionalInputs).filter(([,v])=>v.domain).map(([k,v])=>[k,v.domain]))},
    example:'Direct callback1 with the actual monster151 attack163/defense160 and one explicit party actor. The separate closed default uses its real six-action table; effects of those actions are outside this model.',
    sharedBase:{model:base.name,sha256:hash(await readFile(new URL(`${base.name}.onnx`,directory)))},
    rawBufferAuthority:'evidence-v2/ghidra/expanded-target-defined/response.json: actual JPN0x021ff428 helper constant; actual callback through-return buffers compared separately.'
  });
  const x=Object.fromEntries(base.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)]));
  for(const[name,spec]of Object.entries(additionalInputs))x[name]=g.input(name,['N',spec.width],spec.dtype);
  for(const[name,value]of Object.entries(commonTarget(g,x,base,party)))g.output(value,name);
  return validateContractShape(g);
}

export async function buildCommonAiStepGraph(){
  const previous=await load('rom-ai-nushi-step',true),target=await buildCommonTargetGraph(),prefix=await load('rom-weighted-ai6'),decision=buildDecisionGraph(prefix),monster=rom.monsters.find(m=>m.id===151);
  const g=new Graph('rom-ai-common-step',{
    ...previous.contract,authority:[...decision.contract.authority,...target.contract.authority],
    scope:'One bounded closed AI step using all8 candidate schemes, exact eligibility/resume, and callbacks0/1/3/4/7/9/24/32/61/62/157/158. The real monster151 table is the numerical default, without claiming that all its effects are implemented.',
    scopeJa:'候補選択・使用条件・拡張した対象選択・採用または再探索を1回で進めます。既定値はキャノンキングの実6行動表です。このモデルは技を選び、効果の実行や勝敗判定は行いません。',
    callbacks:target.contract.scope,exclusions:target.contract.exclusions,
    defaults:{...previous.contract.defaults,...monsterAiInputs(monster),...Object.fromEntries(Object.entries(additionalInputs).map(([k,v])=>[k,v.default])),actorAttack:monster.attack,actorDefense:monster.defense},
    labels:{...previous.contract.labels,...target.contract.labels},inputDomains:{...previous.contract.inputDomains,...target.contract.inputDomains},
    defaultMonsterId:151,defaultMonsterName:monster.name,defaultSteps:7,
    example:'Actual monster151: scheme1, judgment2, MP15, actions[1,283,332,295,1,1], wise callbacks[1,61,62,0,1,1]. All used target handlers are implemented; the action effects and full encounter remain separate.',
    targetBufferScope:target.contract.padding,
    proof:'New actual callback cohorts and a separately identified closed-step projection. Existing300/303/305 programs and model bytes are unchanged.'
  });
  const x=Object.fromEntries(previous.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)]));
  for(const[name,spec]of Object.entries(additionalInputs))x[name]=g.input(name,['N',spec.width],spec.dtype);
  for(const[name,value]of Object.entries(aiClosedStep(g,x,decision,target)))g.output(value,name);
  return validateContractShape(g);
}

async function save(g){const bytes=g.model();for(const[ext,value]of[['onnx',bytes],['json',JSON.stringify(g.json(),null,2)+'\n']]){const name=`${g.name}.${ext}`,tmp=new URL(`${name}.pending-${process.pid}`,directory);await writeFile(tmp,value);await rename(tmp,new URL(name,directory));}return{model:g.name,modelSHA256:hash(bytes),nodes:g.nodes.length,bytes:bytes.length};}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const reports=[];for(const graph of[await buildCommonTargetGraph(),await buildCommonAiStepGraph()])reports.push(await save(graph));
  const tmp=new URL(`common-ai-models.json.pending-${process.pid}`,directory);await writeFile(tmp,JSON.stringify(reports,null,2)+'\n');await rename(tmp,new URL('common-ai-models.json',directory));console.log(JSON.stringify(reports,null,2));
}
