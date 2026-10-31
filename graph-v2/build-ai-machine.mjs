// Resumable AI eligibility/acceptance. Target callbacks run between graph steps;
// their updated RNG state is fed back rather than guessed or discarded here.
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {Graph} from './graph-builder.mjs';

const authority=[
  {matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10',file:'src/Combat/Main/func_0208a03c.cpp',address:'ram:0x0208a930'},
  {matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10',file:'src/Combat/Main/func_0208a370.cpp',address:'ram:0x0208ac64'}
];
const truth=(g,x)=>g.gt(x,0);
const choose=(g,values,index,otherwise=0)=>values.reduce((value,item,i)=>g.where(g.eq(index,i),item,value),g.constant(otherwise));
const boolChoose=(g,values,index)=>truth(g,choose(g,values.map(x=>g.cast(x,'float32')),index));

export function aiAcceptanceStep(g,x) {
  const queue=g.split(x.candidateSlots,6),actions=g.split(x.actionIds,6),costs=g.split(x.mpCosts,6),ops=g.split(x.operations,6),
    spells=g.split(x.spell,6),abilities=g.split(x.ability,6),limited=g.split(x.limited,6),unlocked=g.split(x.levelUnlocked,6),used=g.split(x.usedSlots,6);
  const fallback=g.eq(x.cursor,6),slot=choose(g,queue,x.cursor,-1),action=g.where(fallback,2,choose(g,actions,slot,-1)),
    cost=choose(g,costs,slot),operation=choose(g,ops,slot),isSpell=boolChoose(g,spells,slot),isAbility=boolChoose(g,abilities,slot);

  // A queue supplied by rom-weighted-ai6 is a permutation of 0..5. Reject bad
  // protocol inputs explicitly; the disabled prefix's -1 queue is not valid.
  const invalidQueue=[];
  for(let i=0;i<6;i++) {
    invalidQueue.push(g.or(g.lt(queue[i],0),g.gt(queue[i],5),g.not(g.eq(queue[i],g.floor(queue[i])))));
    for(let j=0;j<i;j++)invalidQueue.push(g.eq(queue[i],queue[j]));
  }
  const invalidCursor=g.or(g.lt(x.cursor,0),g.gt(x.cursor,6),g.not(g.eq(x.cursor,g.floor(x.cursor))));
  const protocolError=g.and(x.enabled,g.not(x.done),g.or(invalidCursor,...invalidQueue,g.and(x.targetResolved,g.not(x.awaitingTarget))));
  const active=g.and(x.enabled,g.not(x.done),g.not(protocolError));

  const judged=flag=>g.or(g.eq(x.judgment,2),g.and(g.eq(x.judgment,1),flag));
  const checkSpell=g.and(isSpell,judged(x.judgeSpell)),checkAbility=g.and(isAbility,judged(x.judgeAbility)),
    checkOther=g.and(g.not(g.or(isSpell,isAbility)),judged(x.judgeOther));
  // Cost 255 means the all-MP action convention: any positive MP passes.
  const insufficient=g.or(g.and(g.eq(x.mp,0),g.not(g.eq(cost,0))),g.and(g.lt(cost,255),g.lt(x.mp,cost)));
  let reason=g.where(g.and(checkOther,insufficient),7,0);
  reason=g.where(g.and(checkAbility,insufficient),6,reason);
  reason=g.where(g.and(checkSpell,insufficient),5,reason);
  reason=g.where(g.and(checkSpell,x.silenced),4,reason);
  reason=g.where(g.and(x.legacyRestricted,g.not(boolChoose(g,unlocked,slot))),3,reason);
  reason=g.where(g.and(boolChoose(g,limited,slot),boolChoose(g,used,slot)),2,reason);
  reason=g.where(g.and(x.suppressFlee,g.eq(action,225)),1,reason);
  reason=g.where(fallback,0,reason);

  const beginning=g.and(active,g.not(x.awaitingTarget)),targetRequest=g.and(beginning,g.eq(reason,0)),
    gateRejected=g.and(beginning,g.not(g.eq(reason,0))),returned=g.and(active,x.awaitingTarget,x.targetResolved),
    accepted=g.and(returned,g.or(fallback,x.targetSucceeded)),callbackRejected=g.and(returned,g.not(fallback),g.not(x.targetSucceeded)),
    rejected=g.or(gateRejected,callbackRejected);
  const nextCursor=g.where(rejected,g.min(g.add(x.cursor,1),6),x.cursor),
    nextAwaiting=g.or(g.and(x.awaitingTarget,g.not(returned)),targetRequest),
    nextDone=g.or(x.done,accepted),ordinaryAccepted=g.and(accepted,g.not(fallback));
  const nextUsed=used.map((value,i)=>g.where(ordinaryAccepted,
    g.where(g.eq(operation,34),0,g.cast(g.or(value,g.eq(slot,i)),'float32')),g.cast(value,'float32')));
  const needsTarget=g.and(active,nextAwaiting,g.not(nextDone)),
    reportedReason=g.where(callbackRejected,8,g.where(gateRejected,reason,0));
  // phase: 0 disabled, 1 rejected/advance, 2 request/wait callback, 3 accepted,
  // 4 protocol error, 5 already done. It is descriptive, not extra game state.
  const phase=g.where(protocolError,4,g.where(x.enabled,g.where(x.done,5,g.where(accepted,3,g.where(rejected,1,2))),0));
  return {
    nextSeed:x.seed,nextPosition:x.position,consumed:g.sub(x.position,x.position),
    nextCursor,nextUsedSlots:g.cast(g.cat(nextUsed),'bool'),nextAwaitingTarget:nextAwaiting,nextDone,
    nextSelectedAction:g.where(accepted,action,x.selectedAction),nextSelectedSlot:g.where(accepted,slot,x.selectedSlot),
    nextTargetResolved:g.and(x.targetResolved,g.not(returned)),nextTargetSucceeded:g.and(x.targetSucceeded,g.not(returned)),
    needsTarget,targetRequest,callbackAction:g.where(needsTarget,action,-1),callbackSlot:g.where(needsTarget,slot,-1),
    rejectionReason:reportedReason,phase,protocolError
  };
}

export function buildAiMachine() {
  const six=value=>Array(6).fill(value),
    defaults={seed:[1,0,0,0,0,0,0,0],position:1,candidateSlots:[0,1,2,3,4,5],actionIds:six(1),mpCosts:six(0),operations:six(1),
      spell:six(false),ability:six(false),limited:six(false),levelUnlocked:six(true),usedSlots:six(false),
      enabled:true,cursor:0,done:false,awaitingTarget:false,targetResolved:false,targetSucceeded:false,selectedAction:-1,selectedSlot:-1,
      mp:0,judgment:2,judgeSpell:false,judgeAbility:false,judgeOther:false,silenced:false,suppressFlee:false,legacyRestricted:false};
  const g=new Graph('rom-ai-acceptance6',{
    authority,
    scope:'One resumable step of weighted-AI candidate eligibility and acceptance. It preserves source gate order, target callback boundaries, group used-slot mutation and unconditional action2 fallback after all six failures.',
    proof:'The eligibility rules are lifted from the pinned matching source. Direct ROM prefix evidence proves initial weighted slot selection only, not all eligibility branches or target callback completion.',
    protocol:'Start cursor=0, done=false, awaitingTarget=false and targetResolved=false. On targetRequest/needsTarget invoke the real action target callback once. Resume with awaitingTarget=true, targetResolved=true, targetSucceeded=callbackReturn!=0 and the callback-updated seed/position. Feed all next state outputs back. Gate rejection advances one queue entry without RNG. Target callback rejection keeps its RNG consumption and advances the queue.',
    callback:'For cursor0..5 execute func_ov024_021f66cc. Cursor6 executes func_ov000_02154a04 for action2; after that callback the source returns action2 even for zero targets. This graph does not fabricate callback results.',
    constraints:'candidateSlots must be a permutation of0..5 from the enabled weighted prefix. Slot metadata, candidate queue and actor gate inputs must remain fixed while awaiting the callback; group usedSlots may be updated only from nextUsedSlots. To begin a new decision reset cursor/done/awaitingTarget/targetResolved/selectedAction/selectedSlot and provide a newly generated queue.',
    sourceFields:'mp=actor+2 u16; spell/ability=action.word10 bits0/1; mpCosts=action.word08 low8; operations=action.word18 bits5..11; limited=monster.word10 bits20..25; usedSlots=battle group byte+0x81bf; judgeSpell/Ability/Other=actor+0x3c bits3/4/5. judgment must be the ROM judgment result. legacyRestricted is the fully evaluated matching-grotto/legacy-boss condition; levelUnlocked is the real per-action CanUseLevelUpMove result.',
    suppressFlee:'True exactly for enemy surprise2 on turn0; action225 is then rejected before other gates.',
    exclusions:'Does not implement arbitrary target callback handlers, CanUseLevelUpMove or judgment decoding, action execution, cyclic AI schemes, command count or complete battles. External callback results are required and explicitly exposed.',
    rejectionReason:'0 none,1 surprise flee,2 used limited slot,3 locked legacy move,4 silence,5 spell MP,6 ability MP,7 other MP,8 callback returned failure.',
    example:'Isolated source-consistent normal-attack projection: six action1 records, cost0, operation1, no spell/ability flags. It intentionally requests a target callback rather than claiming a complete enemy action.',
    defaults,
    labels:{candidateSlots:'試行する6スロットの順番',actionIds:'各スロットのROM行動ID',mpCosts:'各スロットのMPコスト',operations:'各スロットの操作ID',
      spell:'呪文フラグ',ability:'特技フラグ',limited:'回数制限スロット',levelUnlocked:'レベル条件を満たす行動',usedSlots:'グループの使用済みスロット',
      cursor:'候補位置（6は行動2へのフォールバック）',done:'選択完了',awaitingTarget:'対象選択を待機中',targetResolved:'対象選択の結果あり',
      targetSucceeded:'対象選択が成功',selectedAction:'確定済み行動ID',selectedSlot:'確定済みスロット',mp:'現在MP',judgment:'判断力の判定結果',
      judgeSpell:'呪文MPを判断',judgeAbility:'特技MPを判断',judgeOther:'その他のMPを判断',silenced:'呪文封印',suppressFlee:'初回敵先制時の逃走禁止',legacyRestricted:'魔王レベルの行動制限を適用'},
    feedback:{seed:'nextSeed',position:'nextPosition',cursor:'nextCursor',usedSlots:'nextUsedSlots',awaitingTarget:'nextAwaitingTarget',done:'nextDone',
      selectedAction:'nextSelectedAction',selectedSlot:'nextSelectedSlot',targetResolved:'nextTargetResolved',targetSucceeded:'nextTargetSucceeded'},
    inputDomains:{seed:{min:0,max:255,integer:true},position:{min:1,max:4990,integer:true},candidateSlots:{min:0,max:5,integer:true},
      actionIds:{min:0,max:65535,integer:true},mpCosts:{min:0,max:255,integer:true},operations:{min:0,max:127,integer:true},cursor:{min:0,max:6,integer:true},
      selectedAction:{min:-1,max:65535,integer:true},selectedSlot:{min:-1,max:5,integer:true},mp:{min:0,max:65535,integer:true},judgment:{values:[0,1,2],integer:true}}
  });
  const x={seed:g.input('seed',['N',8]),position:g.input('position',['N',1],'int32')};
  for(const name of ['candidateSlots','actionIds','mpCosts','operations'])x[name]=g.input(name,['N',6]);
  for(const name of ['spell','ability','limited','levelUnlocked','usedSlots'])x[name]=g.input(name,['N',6],'bool');
  for(const name of ['enabled','done','awaitingTarget','targetResolved','targetSucceeded','judgeSpell','judgeAbility','judgeOther','silenced','suppressFlee','legacyRestricted'])x[name]=g.input(name,['N',1],'bool');
  for(const name of ['cursor','selectedAction','selectedSlot','mp','judgment'])x[name]=g.input(name);
  const result=aiAcceptanceStep(g,x);
  for(const [name,value] of Object.entries(result))g.output(value,name);
  return g;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const g=buildAiMachine(),report=await g.save();
  await writeFile(new URL('./ai-machine-models.json',import.meta.url),JSON.stringify([report],null,2)+'\n');
  console.log(JSON.stringify({name:report.name,nodes:report.nodes,bytes:report.bytes}));
}
