// Eight ROM AI schemes share one lazy candidate iterator and the same
// eligibility/target-continuation state machine. No future RNG is pre-drawn.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Graph,lcg,normalized,bounded} from './graph-builder.mjs';
import {aiAcceptanceStep,buildAiMachine} from './build-ai-machine.mjs';
const root=new URL('./',import.meta.url);
const sources=[['func_0208a370','0x0208ac64'],['func_0208a52c','0x0208ae20'],['func_0208a5d8','0x0208aecc'],['func_0208a700','0x0208aff4'],['func_0208a840','0x0208b134'],['func_0208a91c','0x0208b210']]
  .map(([name,address])=>({file:`src/Combat/Main/${name}.cpp`,address:`ram:${address}`,matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10'}));
const modulo=(g,x,n)=>g.sub(x,g.mul(g.floor(g.mul(x,1/n)),n));
const choose=(g,x,index,otherwise=-1)=>x.reduce((acc,item,i)=>g.where(g.eq(index,i),item,acc),g.constant(otherwise));
const integerBetween=(g,x,minimum,maximum)=>g.and(g.ge(x,minimum),g.le(x,maximum),g.eq(x,g.floor(x)));

export function aiCandidateStep(g,x,weightedGraph) {
  const weighted=g.or(g.eq(x.scheme,0),g.eq(x.scheme,1),g.eq(x.scheme,2),g.eq(x.scheme,4)),
    s3=g.eq(x.scheme,3),s5=g.eq(x.scheme,5),s6=g.eq(x.scheme,6),s7=g.eq(x.scheme,7);
  const queue=g.split(x.weightedQueue,6),badQueue=[];
  for(let i=0;i<6;i++) {badQueue.push(g.not(integerBetween(g,queue[i],0,5)));for(let j=0;j<i;j++)badQueue.push(g.eq(queue[i],queue[j]));}
  const invalid=g.or(g.not(integerBetween(g,x.scheme,0,7)),g.not(integerBetween(g,x.attempt,0,6)),
    g.and(g.not(x.initialized),g.not(g.eq(x.attempt,0))),
    g.and(weighted,x.initialized,g.or(...badQueue)),
    g.and(s3,g.not(integerBetween(g,x.actorCursor,0,5))),
    g.and(g.or(s5,s6),g.not(integerBetween(g,x.actorCursor,0,255))),
    g.and(s7,g.not(integerBetween(g,x.groupCursor,0,5))),
    g.and(s5,x.initialized,g.eq(modulo(g,x.attempt,2),1),g.not(integerBetween(g,x.pairOther,0,5))),
    g.and(s6,x.initialized,g.or(g.not(integerBetween(g,x.blockBase,0,1)),g.not(integerBetween(g,x.blockRemaining,0,5)),
      g.not(integerBetween(g,x.blockOffset,0,4)),g.and(g.eq(x.blockBase,0),g.gt(x.blockOffset,0)))));
  const protocolError=g.and(x.enabled,invalid),active=g.and(x.enabled,g.not(protocolError)),
    preparing=g.and(active,g.lt(x.attempt,6)),fresh=g.and(preparing,g.not(x.initialized));
  const profile=g.where(g.eq(x.scheme,4),3,x.scheme),drawWeighted=g.and(fresh,weighted),
    prefix=g.inline(weightedGraph,{seed:x.seed,position:x.position,profile,actions:g.constant([0,1,2,3,4,5],'float32',[1,6]),enabled:drawWeighted},`candidate_prefix_${g.index}`),
    nextQueue=g.where(drawWeighted,prefix.candidateSlots,x.weightedQueue);
  const actor5=g.where(fresh,modulo(g,x.actorCursor,3),x.actorCursor),actor6=g.where(fresh,modulo(g,x.actorCursor,2),x.actorCursor),
    drawPair=g.and(preparing,s5,g.eq(modulo(g,x.attempt,2),0)),
    drawBlock=g.and(preparing,s6,g.or(fresh,g.eq(x.blockRemaining,0))),drawCycle=g.or(drawPair,drawBlock);
  const random=lcg(g,prefix.nextSeed),unit=normalized(g,random.raw),parity=modulo(g,random.raw[0],2),
    pairFirst=g.add(g.mul(actor5,2),parity),newPairOther=g.add(g.mul(actor5,2),g.sub(1,parity)),
    blockBase=g.where(drawBlock,actor6,x.blockBase),blockWidth=g.where(g.eq(blockBase,0),1,5),
    blockOffset=g.where(drawBlock,bounded(g,unit,blockWidth),x.blockOffset),
    blockRemaining=g.where(drawBlock,blockWidth,x.blockRemaining);
  let slot=choose(g,g.split(nextQueue,6),x.attempt);
  slot=g.where(s3,x.actorCursor,slot);slot=g.where(s7,x.groupCursor,slot);
  slot=g.where(s5,g.where(drawPair,pairFirst,x.pairOther),slot);
  slot=g.where(s6,g.add(blockBase,blockOffset),slot);
  let nextActor=x.actorCursor;
  nextActor=g.where(g.and(preparing,s3),modulo(g,g.add(x.actorCursor,1),6),nextActor);
  nextActor=g.where(drawPair,modulo(g,g.add(actor5,1),3),nextActor);
  nextActor=g.where(drawBlock,g.sub(1,actor6),nextActor);
  const nextSeed=g.where(drawCycle,random.seed,prefix.nextSeed),nextPosition=g.add(prefix.nextPosition,g.cast(drawCycle,'int32')),
    cyclic6=g.and(preparing,s6);
  return {nextSeed,nextPosition,consumed:g.sub(nextPosition,x.position),candidateSlot:g.where(preparing,slot,-1),
    fallback:g.and(active,g.eq(x.attempt,6)),nextInitialized:g.or(x.initialized,preparing),nextAttempt:g.where(preparing,g.add(x.attempt,1),x.attempt),
    nextActorCursor:nextActor,nextGroupCursor:g.where(g.and(preparing,s7),modulo(g,g.add(x.groupCursor,1),6),x.groupCursor),
    nextWeightedQueue:nextQueue,nextPairOther:g.where(drawPair,newPairOther,x.pairOther),
    nextBlockBase:g.where(cyclic6,blockBase,x.blockBase),
    nextBlockOffset:g.where(cyclic6,g.where(g.eq(blockBase,0),0,modulo(g,g.add(blockOffset,1),5)),x.blockOffset),
    nextBlockRemaining:g.where(cyclic6,g.sub(blockRemaining,1),x.blockRemaining),protocolError};
}

const producerDefaults={seed:[1,0,0,0,0,0,0,0],position:1,scheme:1,enabled:true,initialized:false,attempt:0,actorCursor:0,groupCursor:0,weightedQueue:[0,1,2,3,4,5],pairOther:0,blockBase:0,blockOffset:0,blockRemaining:0};
const producerDomains={seed:{min:0,max:255,integer:true},position:{min:1,max:4990,integer:true},scheme:{min:0,max:7,integer:true},attempt:{min:0,max:6,integer:true},actorCursor:{min:0,max:255,integer:true},groupCursor:{min:0,max:255,integer:true},weightedQueue:{min:0,max:5,integer:true},pairOther:{min:0,max:5,integer:true},blockBase:{values:[0,1],integer:true},blockOffset:{min:0,max:4,integer:true},blockRemaining:{min:0,max:5,integer:true}};
const producerFeedback={seed:'nextSeed',position:'nextPosition',initialized:'nextInitialized',attempt:'nextAttempt',actorCursor:'nextActorCursor',groupCursor:'nextGroupCursor',weightedQueue:'nextWeightedQueue',pairOther:'nextPairOther',blockBase:'nextBlockBase',blockOffset:'nextBlockOffset',blockRemaining:'nextBlockRemaining'};
const producerLabels={scheme:'AI方式（0〜7）',initialized:'今回の行動選択を開始済み',attempt:'すでに試した候補数',actorCursor:'アクターの巡回カーソル',groupCursor:'グループの巡回カーソル',weightedQueue:'重み付き候補の順番',pairOther:'ペアの残りの候補',blockBase:'候補群（0単独・1残り5枠）',blockOffset:'次の候補群内位置',blockRemaining:'候補群の残数'};
function producerInputs(g) {
  const x={seed:g.input('seed',['N',8]),position:g.input('position',['N',1],'int32'),weightedQueue:g.input('weightedQueue',['N',6]),enabled:g.input('enabled',['N',1],'bool'),initialized:g.input('initialized',['N',1],'bool')};
  for(const name of ['scheme','attempt','actorCursor','groupCursor','pairOther','blockBase','blockOffset','blockRemaining'])x[name]=g.input(name);return x;
}
export function buildCandidateGraph(prefix) {
  const g=new Graph('rom-ai-candidate-step',{authority:sources,
    scope:'One lazy candidate request for every ROM AI scheme0..7, including actor/group rotation and conditional RNG. It is called again only after the previous candidate eligibility/target callback rejects.',
    protocol:'New decision: initialized=false,attempt=0; preserve actor/group cursors. Each enabled call requests one candidate and advances attempt before the gate. On candidate rejection call again with the callback-updated RNG. After six rejected candidates fallback=true requests action2. Do not call while an earlier target callback is pending or after its candidate succeeds.',
    rules:'Schemes0/1/2/4 draw once at initialization; scheme3 increments actorCursor modulo6; scheme7 increments groupCursor modulo6; scheme5 draws raw32 bit0 at each pair start and tries the opposite slot after failure; scheme6 draws bounded1 or bounded5 at group start, including the bounded1 draw.',
    constraints:'For scheme3 actorCursor must already be0..5; scheme7 groupCursor0..5. Schemes5/6 normalize the source byte cursor on initialization. weightedQueue must be a permutation while initialized for a weighted scheme. Iterator-local pair/block fields are next-request state, not extra ROM combatant memory.',
    proof:'Pinned matching-source equations and cursor order; direct ARM cycle-prefix coverage is recorded separately as it becomes available.',
    defaults:producerDefaults,labels:producerLabels,feedback:producerFeedback,inputDomains:producerDomains,
    example:'Isolated scheme1 request, current seed1. Action IDs are supplied by the separate ROM record table.'});
  const x=producerInputs(g);for(const [name,value] of Object.entries(aiCandidateStep(g,x,prefix)))g.output(value,name);return g;
}

export function buildDecisionGraph(prefix) {
  const base=buildAiMachine(),defaults={...base.contract.defaults,...producerDefaults,phase:0,pendingSlot:-1,pendingFallback:false};
  for(const key of ['candidateSlots','cursor','done','awaitingTarget'])delete defaults[key];
  const g=new Graph('rom-ai-decision-step',{authority:[...sources,...base.contract.authority],
    scope:'Resumable candidate generation plus eligibility/acceptance for all eight ROM AI schemes. Every failed gate or callback advances only the next required candidate, retaining callback RNG and both actor/group cursor state.',
    protocol:'phase0 requests/checks one candidate; phase1 waits for the real action target callback; phase2 is terminal. On needsTarget invoke the actual callback once, then resume with targetResolved/targetSucceeded and its updated seed/position. Failed callback resumes phase0; successful callback finishes phase2. After six failures action2 fallback returns after its target callback even if callback success is false.',
    newDecision:'Reset initialized=false,attempt=0,phase=0,targetResolved=false,targetSucceeded=false,selectedAction=-1,selectedSlot=-1,pendingSlot=-1,pendingFallback=false. Preserve actual actorCursor/groupCursor and usedSlots according to turn/group lifecycle.',
    constraints:base.contract.constraints+' Also hold phase/pendingSlot/pendingFallback as produced while target selection is pending. Scheme3 actorCursor and scheme7 groupCursor must be0..5.',
    exclusions:base.contract.exclusions.replace('cyclic AI schemes, ',''),
    proof:'ROM-matching source for all producer and gate rules. External callback semantics remain explicit; synthetic continuation tests do not establish arbitrary handler accuracy.',
    defaults,labels:{...base.contract.labels,...producerLabels,phase:'進行状態（0候補処理・1対象待ち・2完了）',pendingSlot:'対象選択を待つスロット',pendingFallback:'行動2の対象選択を待機'},
    feedback:{...producerFeedback,phase:'nextPhase',pendingSlot:'nextPendingSlot',pendingFallback:'nextPendingFallback',usedSlots:'nextUsedSlots',selectedAction:'nextSelectedAction',selectedSlot:'nextSelectedSlot',targetResolved:'nextTargetResolved',targetSucceeded:'nextTargetSucceeded'},
    inputDomains:{...base.contract.inputDomains,...producerDomains,phase:{values:[0,1,2],integer:true},pendingSlot:{min:-1,max:5,integer:true}},
    example:base.contract.example});
  const x=producerInputs(g);
  for(const input of base.inputs)if(!(input.name in x)&&!['candidateSlots','cursor','done','awaitingTarget'].includes(input.name))x[input.name]=g.input(input.name,input.shape,input.dtype);
  x.phase=g.input('phase');x.pendingSlot=g.input('pendingSlot');x.pendingFallback=g.input('pendingFallback',['N',1],'bool');
  const waiting=g.eq(x.phase,1),done=g.eq(x.phase,2),controlError=g.and(x.enabled,g.or(g.not(integerBetween(g,x.phase,0,2)),
    g.and(x.targetResolved,g.not(waiting),g.not(done)),g.and(waiting,g.not(x.pendingFallback),g.not(integerBetween(g,x.pendingSlot,0,5))))),
    generate=g.and(x.enabled,g.eq(x.phase,0),g.not(controlError)),producer=aiCandidateStep(g,{...x,enabled:generate},prefix),
    active=g.and(x.enabled,g.not(controlError),g.not(producer.protocolError)),requestValid=g.and(generate,g.not(producer.protocolError)),
    pendingSlot=g.where(requestValid,producer.candidateSlot,x.pendingSlot),
    pendingFallback=g.or(g.and(requestValid,producer.fallback),g.and(g.not(requestValid),x.pendingFallback)),
    queueStart=g.where(pendingFallback,0,pendingSlot),queue=g.cat(Array.from({length:6},(_,i)=>modulo(g,g.add(queueStart,i),6))),
    accepted=aiAcceptanceStep(g,{...x,seed:producer.nextSeed,position:producer.nextPosition,candidateSlots:queue,cursor:g.where(pendingFallback,6,0),done,awaitingTarget:waiting,enabled:active});
  const protocolError=g.or(controlError,producer.protocolError,accepted.protocolError),
    nextPhase=g.where(g.and(active,g.not(protocolError)),g.where(accepted.nextDone,2,g.where(accepted.nextAwaitingTarget,1,0)),x.phase);
  const outputs={...producer,nextSeed:accepted.nextSeed,nextPosition:accepted.nextPosition,consumed:g.sub(accepted.nextPosition,x.position),
    nextPhase,nextPendingSlot:pendingSlot,nextPendingFallback:pendingFallback,protocolError,
    nextUsedSlots:accepted.nextUsedSlots,nextSelectedAction:accepted.nextSelectedAction,nextSelectedSlot:accepted.nextSelectedSlot,
    nextTargetResolved:accepted.nextTargetResolved,nextTargetSucceeded:accepted.nextTargetSucceeded,
    needsTarget:accepted.needsTarget,targetRequest:accepted.targetRequest,callbackAction:accepted.callbackAction,callbackSlot:accepted.callbackSlot,rejectionReason:accepted.rejectionReason,finished:accepted.nextDone};
  delete outputs.candidateSlot;delete outputs.fallback;
  for(const [name,value] of Object.entries(outputs))g.output(value,name);return g;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const prefix=JSON.parse(await readFile(new URL('rom-weighted-ai6.json',root),'utf8')),graphs=[buildCandidateGraph(prefix),buildDecisionGraph(prefix)],models=[];
  for(const g of graphs)models.push(await g.save());
  await writeFile(new URL('ai-decision-models.json',root),JSON.stringify(models,null,2)+'\n');console.log(JSON.stringify(models.map(({name,nodes,bytes})=>({name,nodes,bytes})),null,2));
}
