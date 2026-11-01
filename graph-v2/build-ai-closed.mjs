// Closed bounded step: a real candidate gate, a supported target callback, and
// its acceptance continuation are one ONNX invocation. No callback UI inputs.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Graph} from './graph-builder.mjs';
import {buildDecisionGraph} from './build-ai-decision.mjs';
import {buildAiTargetCallbackGraph} from './build-ai-default-target.mjs';
import rom from '../restored/dq9-unified/data/rom.mjs';
const root=new URL('./',import.meta.url),choose=(g,x,index,otherwise=0)=>g.split(x,6).reduce((v,item,i)=>g.where(g.eq(index,i),item,v),g.constant(otherwise));
const boolSelect=(g,c,a,b)=>g.gt(g.where(c,g.cast(a,'float32'),g.cast(b,'float32')),0);
export function aiClosedStep(g,x,decisionGraph,targetGraph) {
  const falseValue=g.eq(0,1),validPhase=g.or(g.eq(x.phase,0),g.eq(x.phase,2)),
    a=g.inline(decisionGraph,{...x,enabled:g.and(x.enabled,validPhase),pendingSlot:g.constant(-1),pendingFallback:falseValue,targetResolved:falseValue,targetSucceeded:falseValue},`closed_candidate_${g.index}`),
    slot=a.nextPendingSlot,fallback=a.nextPendingFallback,
    callbackIndex=g.where(g.eq(x.judgment,1),choose(g,x.smartTarget,slot),g.where(g.eq(x.judgment,2),choose(g,x.wiseTarget,slot),0)),
    resolvedIndex=g.where(g.or(fallback,g.ge(callbackIndex,161)),0,callbackIndex),
    targetFeeds=Object.fromEntries(targetGraph.inputs.map(input=>[input.name,x[input.name]]));
  Object.assign(targetFeeds,{seed:a.nextSeed,position:a.nextPosition,enabled:g.and(x.enabled,a.targetRequest),selectorIndex:resolvedIndex,
    targetSide:g.where(fallback,x.fallbackTargetSide,choose(g,x.targetSide,slot)),targetScope:g.where(fallback,x.fallbackTargetScope,choose(g,x.targetScope,slot)),
    repeatCode:g.where(fallback,x.fallbackRepeatCode,choose(g,x.repeatCode,slot))});
  if('candidateActionId' in targetFeeds)targetFeeds.candidateActionId=g.where(fallback,2,choose(g,x.actionIds,slot));
  if('candidateOperation' in targetFeeds)targetFeeds.candidateOperation=g.where(fallback,1,choose(g,x.operations,slot));
  const callback=g.inline(targetGraph,targetFeeds,`closed_target_${g.index}`),resumeFeeds={};
  for(const input of decisionGraph.inputs) {
    const feedback=decisionGraph.contract.feedback[input.name];resumeFeeds[input.name]=feedback?a[feedback]:x[input.name];
  }
  Object.assign(resumeFeeds,{seed:callback.nextSeed,position:callback.nextPosition,enabled:g.and(x.enabled,a.targetRequest,callback.supported),
    pendingSlot:a.nextPendingSlot,pendingFallback:a.nextPendingFallback,targetResolved:g.and(a.targetRequest,callback.supported),targetSucceeded:callback.callbackSuccess});
  const b=g.inline(decisionGraph,resumeFeeds,`closed_resume_${g.index}`),
    protocolError=g.or(g.and(x.enabled,g.not(validPhase)),a.protocolError,b.protocolError),
    supported=g.and(g.not(protocolError),g.or(g.not(a.targetRequest),callback.supported)),result={};
  for(const [input,output] of Object.entries(decisionGraph.contract.feedback)) {
    if(['pendingSlot','pendingFallback','targetResolved','targetSucceeded'].includes(input))continue;
    result[output]=g.values[x[input]].dtype==='bool'?boolSelect(g,supported,b[output],x[input]):g.where(supported,b[output],x[input]);
  }
  result.targetCount=g.where(supported,callback.targetCount,x.previousTargetCount);
  result.targets=g.where(supported,callback.targets,x.previousTargets);
  result.supported=supported;result.protocolError=protocolError;result.finished=g.eq(result.nextPhase,2);
  result.consumed=g.sub(result.nextPosition,x.position);
  result.attemptedSlot=g.where(g.and(supported,g.gt(a.nextAttempt,x.attempt)),slot,-1);
  result.targetInvoked=g.and(supported,a.targetRequest);
  result.eligibilityCallbackInvoked=g.and(result.targetInvoked,g.not(fallback));
  result.rejectionReason=g.where(supported,g.where(a.targetRequest,b.rejectionReason,a.rejectionReason),0);
  result.unsupportedSelector=g.where(g.and(a.targetRequest,g.not(callback.supported)),resolvedIndex,-1);
  result.unsupportedRepeatCode=g.where(g.and(a.targetRequest,g.not(callback.supported)),targetFeeds.repeatCode,-1);
  return result;
}

export async function buildAiClosedGraph() {
  const prefix=JSON.parse(await readFile(new URL('rom-weighted-ai6.json',root),'utf8')),decision=buildDecisionGraph(prefix),target=await buildAiTargetCallbackGraph(),
    m=rom.monsters.find(x=>x.id===9),byAction=new Map(rom.actions.map(x=>[x.id,x])),records=m.actions.map(id=>byAction.get(id)),fallback=byAction.get(2),
    field=(offset,bits,mask)=>records.map(a=>(Buffer.from(a.raw,'hex').readUInt32LE(offset)>>>bits)&mask),
    defaults={...target.contract.defaults,...decision.contract.defaults,phase:0,scheme:m.scheme,judgment:m.judgment,mp:m.mp,actionIds:m.actions,
      mpCosts:records.map(a=>a.mpCost),operations:records.map(a=>a.operation),spell:records.map(a=>!!(a.w10&1)),ability:records.map(a=>!!(a.w10&2)),
      limited:Array.from({length:6},(_,i)=>!!(m.limitedSlots&(1<<i))),smartTarget:records.map(a=>Buffer.from(a.raw,'hex').readUInt16LE(12)),wiseTarget:records.map(a=>Buffer.from(a.raw,'hex').readUInt16LE(14)),
      targetSide:field(8,8,3),targetScope:field(20,28,15),repeatCode:field(28,14,31),
      fallbackTargetSide:(fallback.w08>>>8)&3,fallbackTargetScope:Buffer.from(fallback.raw,'hex').readUInt32LE(20)>>>28,fallbackRepeatCode:(Buffer.from(fallback.raw,'hex').readUInt32LE(28)>>>14)&31,
      seed:[249,230,132,163,233,230,26,155],actorId:192};
  for(const key of ['pendingSlot','pendingFallback','targetResolved','targetSucceeded','selectorIndex'])delete defaults[key];
  const feedback={...decision.contract.feedback,previousTargetCount:'targetCount',previousTargets:'targets'};
  for(const key of ['pendingSlot','pendingFallback','targetResolved','targetSucceeded'])delete feedback[key];
  const g=new Graph('rom-ai-closed-step',{
    authority:[...decision.contract.authority,...target.contract.authority],
    scope:'One closed bounded AI step: lazy candidate generation for all8 schemes, MP/status/limited/legacy gates, an actual supported target callback, and acceptance/resume. Repeating the output state progresses to an action or action2 fallback; no manual callback success input exists.',
    scopeJa:'AI候補の選択、MP・状態・使用済み判定、対応済みの実対象関数、採用・再探索までを1回のグラフ実行で進めます。初期値は実ROMのおばけキノコ。行動の効果や戦闘の勝敗はこのモデルの範囲外です。',
    defaultSteps:7,defaultMonsterId:m.id,defaultMonsterName:m.name,
    callbacks:'Callback0 supports self/party/empty standard routes with repeat0, including unconditional2draw. Callback9 supports its exact fewer-than2-non-paralyzed-candidates rejection. A valid angry target remains its own candidate list. Other handlers or repetition modes explicitly stop with supported=false.',
    unsupported:'If a needed callback is unsupported or the input protocol is invalid, all committed RNG and decision state are held at the input values. unsupportedSelector/unsupportedRepeatCode identify the unresolved callback. It must not be counted as an ordinary rejection or a completed decision.',
    dispatch:'smartTarget/wiseTarget come from action word0c/0e. Judgment0 uses callback0; judgment1/2 choose those indices. Indices>=161 use callback0, as the ROM dispatcher does. Null table entries below161 are not automatically assumed to be callback0 here.',
    newDecision:'Reset initialized=false,attempt=0,phase=0,selectedAction=-1,selectedSlot=-1. Keep actual actor/group cursors and used slots for the correct turn lifecycle. phase2 is terminal and freezes state.',
    population:target.contract.partyPopulation,
    exclusions:'Arbitrary target handlers, enemy group selectors, repetition modes1..31, full action execution, cameras and complete battles remain outside this AI step. Legacy levelUnlocked and actor judgment flags are explicit decoded source state.',
    defaults,labels:{...decision.contract.labels,...target.contract.labels,phase:'AI進行状態（0次候補・2確定）',smartTarget:'各スロットの判断力1対象関数',wiseTarget:'各スロットの判断力2対象関数',targetSide:'各スロットの対象側',targetScope:'各スロットの対象範囲',repeatCode:'各スロットの繰返しコード',fallbackTargetSide:'行動2の対象側',fallbackTargetScope:'行動2の対象範囲',fallbackRepeatCode:'行動2の繰返しコード'},
    feedback,inputDomains:{...decision.contract.inputDomains,...target.contract.inputDomains,phase:{values:[0,2],integer:true},smartTarget:{min:0,max:65535,integer:true},wiseTarget:{min:0,max:65535,integer:true},fallbackTargetSide:{min:0,max:3,integer:true},fallbackTargetScope:{min:0,max:15,integer:true},fallbackRepeatCode:{min:0,max:31,integer:true}},
    example:'Actual ROM monster9 (おばけキノコ) six action records [1,1,1,1,228,1], scheme1, judgment0, MP3 and limited-slot bit4 against one living party actor0. All its initial target callbacks are supported callback0/repeat0. The model selects actions/targets; it does not execute normal-attack or sleep-breath effects.',
    alternateExample:'Actual ROM monster303 (病魔パンデルム) has scheme1, judgment1 and actions [1,275,1,48,44,228]. Its smart selectors [0,61,0,32,24,158] include currently unsupported handlers. Preserve those unresolved branches explicitly; do not silently change its judgment or action table to make it complete.',
    proof:'Composed from graph components directly compared to1956 actual ARM gate/cycle executions. The closed graph has its own equivalence and direct-ROM sequence report, separate from the component proof.'});
  const x={};
  for(const input of decision.inputs)if(!['pendingSlot','pendingFallback','targetResolved','targetSucceeded'].includes(input.name))x[input.name]=g.input(input.name,input.shape,input.dtype);
  for(const input of target.inputs)if(!(input.name in x)&&!['targetSide','targetScope','repeatCode','selectorIndex'].includes(input.name))x[input.name]=g.input(input.name,input.shape,input.dtype);
  for(const name of ['smartTarget','wiseTarget','targetSide','targetScope','repeatCode'])x[name]=g.input(name,['N',6]);
  for(const name of ['fallbackTargetSide','fallbackTargetScope','fallbackRepeatCode'])x[name]=g.input(name);
  for(const [name,value] of Object.entries(aiClosedStep(g,x,decision,target)))g.output(value,name);return g;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const graph=await buildAiClosedGraph(),report=await graph.save();await writeFile(new URL('ai-closed-models.json',root),JSON.stringify([report],null,2)+'\n');console.log(JSON.stringify({name:report.name,nodes:report.nodes,bytes:report.bytes}));
}
