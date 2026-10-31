// Add callback2 by composing the frozen target family and weighted target graph.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Graph,lcg,normalized,bounded} from '../graph-builder.mjs';
import {buildDecisionGraph} from '../build-ai-decision.mjs';
import {aiClosedStep} from '../build-ai-closed.mjs';
import {buildAiDefinitionStep} from './build-ai-definition.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
const dir=new URL('./',import.meta.url),shared=new URL('../',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex'),load=async(name,base=dir)=>JSON.parse(await readFile(new URL(name+'.json',base),'utf8'));
const sum=(g,xs)=>xs.reduce((n,x)=>g.add(n,g.cast(x,'float32')),g.constant(0)),selectBool=(g,c,a,b)=>g.gt(g.where(c,g.cast(a,'float32'),g.cast(b,'float32')),0);
const bit=(g,bytes,n)=>{const q=g.floor(g.mul(bytes[n>>>3],2**-(n&7)));return g.gt(g.sub(q,g.mul(g.floor(g.mul(q,.5)),2)),0);};
export function weightedTargetRepeats(g,x,partyGraph,candidates,enabled,externalRage){
  const repeatDraw=lcg(g,x.seed),drawRepeat=g.and(enabled,g.eq(x.repeatCode,3)),repeats=g.where(g.eq(x.repeatCode,3),g.add(bounded(g,normalized(g,repeatDraw.raw),2),3),g.where(g.eq(x.repeatCode,4),2,g.where(g.eq(x.repeatCode,5),4,g.where(g.eq(x.repeatCode,7),7,g.where(g.eq(x.repeatCode,8),3,1)))));
  let seed=g.where(drawRepeat,repeatDraw.seed,x.seed),position=g.add(x.position,g.cast(drawRepeat,'int32')),picking=enabled,count=g.constant(0);
  const laneZero=g.mul(x.selectorIndex,0),result=[g.add(laneZero,-1),...Array(7).fill(laneZero)],hp=g.where(x.dead,0,1);
  for(let i=0;i<7;i++){
    const active=g.and(picking,g.lt(i,repeats)),weighted=g.and(active,g.not(externalRage)),feeds=Object.fromEntries(partyGraph.inputs.map(d=>[d.name,x[d.name]]));
    Object.assign(feeds,{seed,position,hp,candidate:g.cat(candidates.map(c=>g.and(c,weighted))),rageEnabled:g.and(weighted,x.rageEnabled)});
    const pick=g.inline(partyGraph,feeds,`status9_repeat${i}_${g.index}`),id=g.where(externalRage,x.actorId,pick.targetId),success=g.and(active,g.ge(id,0));
    result[i]=g.where(success,id,result[i]);count=g.add(count,g.cast(success,'float32'));seed=pick.nextSeed;position=pick.nextPosition;picking=success;
  }
  return{seed,position,count,targets:g.cat(result)};
}
export function status9Target(g,x,previous,partyGraph){
  const selected=g.eq(x.selectorIndex,2),old=g.inline(previous,{...x,enabled:g.and(x.enabled,g.not(selected))},`status9_prior_${g.index}`),
    ids=g.split(x.ids,4),present=g.split(x.present,4),candidate=g.split(x.candidate,4),dead=g.split(x.dead,4),excluded=g.split(x.excluded,4),status=g.split(x.partyStatusBytes,16),sourceStatus=g.split(x.actorStatusBytes,4),
    live=ids.map((_,i)=>g.and(present[i],g.not(dead[i]))),eligible=ids.map((_,i)=>g.and(live[i],candidate[i],g.not(excluded[i]))),partyCount=sum(g,eligible),
    inParty=g.or(...ids.map(id=>g.eq(id,x.rageId))),actorMatch=g.eq(x.actorId,x.rageId),sourceTyped=g.and(x.actorPresent,x.actorType400),
    rageParty=ids.map((id,i)=>g.and(x.rageEnabled,sourceTyped,g.eq(id,x.rageId),live[i])),rageActor=g.and(x.rageEnabled,sourceTyped,g.not(inParty),actorMatch,g.not(x.actorDead)),rageCandidate=g.or(...rageParty,rageActor),
    initialCount=g.where(rageCandidate,1,partyCount),filtered=eligible.map((p,i)=>g.and(selectBool(g,rageCandidate,rageParty[i],p),g.not(bit(g,status.slice(i*4,i*4+4),9)))),filteredActor=g.and(rageActor,g.not(bit(g,sourceStatus,9))),filteredCount=g.add(sum(g,filtered),g.cast(filteredActor,'float32')),
    rageKnown=g.or(g.lt(x.rageId,0),inParty,actorMatch),coverage=g.and(g.or(g.not(g.and(x.rageEnabled,sourceTyped)),rageKnown),g.or(g.le(filteredCount,0),x.actorPresent)),active=g.and(x.enabled,selected,coverage),run=g.and(active,g.gt(filteredCount,0)),
    externalRage=g.and(x.rageEnabled,g.not(inParty),actorMatch,x.actorPresent,g.not(x.actorDead),g.not(x.actorExcluded)),repeated=weightedTargetRepeats(g,x,partyGraph,filtered,run,externalRage),prior=g.split(x.previousTargets,8),early=[...prior];
  let rank=g.constant(0);for(let i=0;i<4;i++){for(let j=0;j<4;j++)early[j]=g.where(g.and(filtered[i],g.eq(rank,j)),ids[i],early[j]);rank=g.add(rank,g.cast(filtered[i],'float32'));}early[0]=g.where(filteredActor,x.actorId,early[0]);
  const enumerated=g.and(active,g.gt(initialCount,0)),success=g.and(run,g.gt(repeated.count,0)),nextSeed=g.where(run,repeated.seed,x.seed),nextPosition=g.where(run,repeated.position,x.position),count=g.where(run,repeated.count,g.where(enumerated,0,x.previousTargetCount)),targets=g.where(run,repeated.targets,g.where(enumerated,g.cat(early),x.previousTargets));
  return{nextSeed:g.where(selected,nextSeed,old.nextSeed),nextPosition:g.where(selected,nextPosition,old.nextPosition),consumed:g.where(selected,g.sub(nextPosition,x.position),old.consumed),supported:selectBool(g,selected,coverage,old.supported),callbackSuccess:selectBool(g,selected,success,old.callbackSuccess),targetCount:g.where(selected,count,old.targetCount),targets:g.where(selected,targets,old.targets),filteredCount:g.where(selected,filteredCount,old.filteredCount),rageCandidateUsed:g.where(selected,g.cast(rageCandidate,'int32'),old.rageCandidateUsed),partyCount:g.where(selected,partyCount,old.partyCount),affectableCount:g.where(selected,filteredCount,old.affectableCount)};
}
function finish(g){g.contract.inputDomains=Object.fromEntries(g.inputs.filter(d=>g.contract.inputDomains[d.name]||d.dtype==='bool').map(d=>[d.name,{...(g.contract.inputDomains[d.name]??{values:[false,true,0,1]}),width:d.shape[1]}]));g.contract.inputContractVersion=1;return g;}
const authority=[{file:'src/Combat/Overlay_24/func_ov024_021ee0f0.cpp',address:'JPN021ee8bc',sha256:'019e5ec9d64ecf4c61fb39141d3f2f23077f4f3dd3766dd1f1228c1cfa861eef'},{file:'src/Combat/Overlay_24/func_ov024_021eda60.cpp',sha256:'1e374c81fd3a563ea6d3cb13eb1eb9abc000f348e3b13aae6a924c44839982ff'},{file:'src/Combat/Overlay_24/func_ov024_021edf00.cpp',sha256:'303ffac398e5576f49a9b95778521ccaa8e9f4c4f698c824de97106a09429904'},{file:'src/Combat/Overlay_24/func_ov024_021ed8c0.cpp',sha256:'abd0e22d3c01e3ec0c619fb808a4cc26970571cf629662a2d5dfd996541d08dd'}];
export async function buildStatus9Target(){
  const previous=await load('rom-ai-transition-target4'),party=await load('rom-party-target4',shared),g=new Graph('rom-ai-status9-target4',{...structuredClone(previous.contract),authority:[...previous.contract.authority,...authority],scope:'Frozen transition/common/default target callbacks plus original callback2. Begin with the live anger target when available, otherwise enumerate eligible party; remove raw stats14 bit9 targets, preserving actual partial buffer writes. A nonempty filtered list uses the existing weighted-repeat algorithm and all8 raw result shorts. No new arithmetic or RNG surrogate is introduced.',scopeJa:'実callback2を追加します。怒り対象または有効な味方候補から状態bit0x200の対象を除き、残った対象をROMの重み付き反復抽選へ渡します。',defaults:{...previous.contract.defaults,selectorIndex:2},selector2:{predicate:'raw party/source status14 &0x200 must be clear',count:'Empty initial list preserves count/buffer; nonempty clears count before filtering; no survivor rejects, retaining partial writes.',repetition:'code3 consumes bounded2 for3..4 picks;4/5/7/8 mean2/4/7/3 picks;other0..31 means1 pick.',population:'Four explicit party lookup slots and the acting actor. Unknown external anger population or a missing source when weighted selection would execute is unsupported.',scope:'Target callback only; no action11 execution, complete AI caller or whole monster316 evidence follows automatically.'},sharedBase:{name:previous.name,sha256:hash(await readFile(new URL(previous.name+'.onnx',dir)))}});
  const x=Object.fromEntries(previous.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)]));for(const[name,value]of Object.entries(status9Target(g,x,previous,party)))g.output(value,name);return finish(g);
}
export async function buildStatus9Step(target){
  const previous=await load('rom-ai-transition-step'),prefix=await load('rom-weighted-ai6',shared),decision=buildDecisionGraph(prefix);target??=await buildStatus9Target();
  const g=new Graph('rom-ai-status9-step',{...structuredClone(previous.contract),authority:[...decision.contract.authority,...target.contract.authority],scope:'One bounded candidate/eligibility/target step with frozen transition/common/default callbacks plus actual callback2. Original operation34 definition retry is composed separately.',scopeJa:'既存AIの候補選択・使用条件・対象決定へcallback2を接続した1ステップです。',callbacks:target.contract.selector2,sharedBase:{name:previous.name,sha256:hash(await readFile(new URL(previous.name+'.onnx',dir)))}}),x=Object.fromEntries(previous.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)]));for(const[name,value]of Object.entries(aiClosedStep(g,x,decision,target)))g.output(value,name);return finish(g);
}
async function save(g){const bytes=g.model();auditModelBytes(bytes,{name:g.name});for(const[ext,value]of[['onnx',bytes],['json',JSON.stringify(g.json(),null,2)+'\n']]){const p=new URL(g.name+'.'+ext,dir),tmp=new URL(g.name+'.'+ext+'.tmp',dir);await writeFile(tmp,value);await rename(tmp,p);}return{name:g.name,sha256:hash(bytes),nodes:g.nodes.length,bytes:bytes.length};}
export async function writeStatus9Targets(){const target=await buildStatus9Target(),step=await buildStatus9Step(target),report=[await save(target),await save(step)];report.push(await save(await buildAiDefinitionStep({baseName:step.name,name:'rom-ai-definition-status9-step'})));await writeFile(new URL('status9-target-models.json',dir),JSON.stringify(report,null,2)+'\n');return report;}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await writeStatus9Targets(),null,2));
