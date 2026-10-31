// Four actual judgment callbacks used by ROM monster303. The existing checked
// callback0/9 model remains intact; these models have separate contracts.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Graph,lcg} from './graph-builder.mjs';
import {buildAiTargetCallbackGraph} from './build-ai-default-target.mjs';
import {buildDecisionGraph} from './build-ai-decision.mjs';
import {buildAiClosedGraph,aiClosedStep} from './build-ai-closed.mjs';
import rom from '../restored/dq9-unified/data/rom.mjs';

const root=new URL('./',import.meta.url),sum=(g,xs)=>xs.map(x=>g.cast(x,'float32')).reduce((a,b)=>g.add(a,b));
const matchingCommit='e0d1df250bfc554efe2fd37513a4ad3867a77b10';
const extraFields={defense:{values:[90,0,0,0],label:'味方の現在守備力',min:0,max:65535},agility:{values:[58,0,0,0],label:'味方の現在すばやさ',min:0,max:65535},
  defenseRank:{values:[0,0,0,0],label:'守備力変化段階',min:-2,max:2},agilityRank:{values:[0,0,0,0],label:'すばやさ変化段階',min:-2,max:2},
  asleep:{values:[false,false,false,false],label:'睡眠（stats+0x14のbit0x10）',dtype:'bool'},
  status26:{values:[false,false,false,false],label:'状態フラグ26（stats+0x14の0x04000000）',dtype:'bool'},
  dead:{values:[false,false,false,false],label:'死亡フラグ（stats+0x14のbit0x1）',dtype:'bool'},
  actorDead:{values:false,width:1,label:'行動するアクターの死亡フラグ',dtype:'bool'},
  actorPresent:{values:true,width:1,label:'行動するアクターが存在する',dtype:'bool'},
  actorExcluded:{values:false,width:1,label:'行動するアクターは対象選択から除外中',dtype:'bool'},
  actorParalyzed:{values:false,width:1,label:'行動するアクターの麻痺状態（0x8）',dtype:'bool'}};

export function aiBossTarget4(g,x,base,partyGraph){
  const index=x.selectorIndex,is24=g.eq(index,24),is32=g.eq(index,32),is61=g.eq(index,61),is158=g.eq(index,158),
    extra=g.or(is24,is32,is61,is158),livePredicate=g.where(x.dead,0,1),old=g.inline(base,{...x,hp:livePredicate,enabled:g.and(x.enabled,g.not(extra))},`boss_base_${g.index}`),
    ids=g.split(x.ids,4),hp=g.split(x.hp,4),present=g.split(x.present,4),excluded=g.split(x.excluded,4),candidate=g.split(x.candidate,4),
    defense=g.split(x.defense,4),agility=g.split(x.agility,4),defRank=g.split(x.defenseRank,4),agiRank=g.split(x.agilityRank,4),
    flag26=g.split(x.status26,4),sleepState=g.split(x.asleep,4),dead=g.split(x.dead,4),eligible=ids.map((_,i)=>g.and(present[i],g.not(dead[i]),g.not(excluded[i]),candidate[i]));
  const count=sum(g,eligible),inParty=g.or(...ids.map(id=>g.eq(id,x.rageId))),
    is0=g.eq(index,0),is9=g.eq(index,9),partySingle=g.and(g.eq(x.targetSide,1),g.or(g.eq(x.targetScope,2),g.eq(x.targetScope,5))),
    externalActor=g.and(x.rageEnabled,g.not(inParty),g.eq(x.rageId,x.actorId),x.actorPresent,g.not(x.actorDead)),
    externalWeighted=g.and(externalActor,g.not(x.actorExcluded)),
    rageKnown=g.or(g.lt(x.rageId,0),inParty,g.eq(x.rageId,x.actorId)),
    needsRage=g.or(is9,g.and(is61,g.gt(count,0)),g.and(is0,partySingle)),coverage=g.not(g.and(x.rageEnabled,g.not(rageKnown),needsRage)),
    defAffected=eligible.map((live,i)=>g.and(live,g.gt(defense[i],0),g.gt(defRank[i],-2))),
    agiAffected=eligible.map((live,i)=>g.and(live,g.gt(agility[i],0),g.gt(agiRank[i],-2))),
    notAsleep=eligible.map((live,i)=>g.and(live,g.not(sleepState[i]))),status26Count=sum(g,eligible.map((live,i)=>g.and(live,flag26[i]))),
    gate24=g.gt(sum(g,defAffected),0),gate32=g.gt(sum(g,agiAffected),0),gate158=g.and(g.lt(g.mul(status26Count,3),count),g.gt(sum(g,notAsleep),0)),
    extraSupported=g.or(is24,is32,is158,g.and(is61,g.eq(x.repeatCode,0))),supported=g.and(coverage,g.or(g.and(g.not(extra),old.supported),extraSupported,g.and(is9,externalActor))),
    active=g.and(x.enabled,extraSupported,coverage),passAll=g.and(active,g.or(g.and(is24,gate24),g.and(is32,gate32),g.and(is158,gate158))),
    active61=g.and(active,is61),hasParty=g.gt(count,0),choose61=g.and(active61,hasParty);
  const partyFeeds=Object.fromEntries(partyGraph.inputs.map(input=>[input.name,x[input.name]]));
  partyFeeds.hp=livePredicate;
  const chooseWeighted61=g.and(choose61,g.not(externalWeighted));
  partyFeeds.candidate=g.gt(g.where(chooseWeighted61,g.cast(x.candidate,'float32'),0),0);partyFeeds.rageEnabled=g.and(chooseWeighted61,x.rageEnabled);
  const picked=g.inline(partyGraph,partyFeeds,`boss_weighted_${g.index}`),packed=Array(4).fill(g.constant(-1));let rank=g.constant(0);
  for(let i=0;i<4;i++){for(let j=0;j<4;j++)packed[j]=g.where(g.and(eligible[i],g.eq(rank,j)),ids[i],packed[j]);rank=g.add(rank,g.cast(eligible[i],'float32'));}
  const allTargets=g.cat([...packed,...Array(4).fill(g.add(g.mul(count,0),-1))]),chosenId=g.where(externalWeighted,x.actorId,picked.targetId),
    selectedTargets=g.cat([chosenId,...Array(7).fill(g.add(g.mul(count,0),-1))]),
    actorTargets=g.cat([x.actorId,...Array(7).fill(g.add(g.mul(count,0),-1))]),
    externalZero=g.and(x.enabled,is0,old.supported,partySingle,externalWeighted),externalNine=g.and(x.enabled,is9,externalActor),
    repeat1=lcg(g,x.seed),repeat2=lcg(g,repeat1.seed),
    nextSeed=g.where(supported,g.where(externalZero,repeat2.seed,g.where(choose61,picked.nextSeed,old.nextSeed)),x.seed),
    nextPosition=g.where(supported,g.where(externalZero,g.add(x.position,g.constant(2,'int32')),g.where(choose61,picked.nextPosition,old.nextPosition)),x.position),
    targetCount=g.where(supported,g.where(externalZero,1,g.where(externalNine,0,g.where(passAll,count,g.where(active61,g.where(hasParty,g.cast(g.ge(chosenId,0),'float32'),0),old.targetCount)))),x.previousTargetCount),
    targets=g.where(supported,g.where(externalZero,actorTargets,g.where(passAll,allTargets,g.where(choose61,selectedTargets,old.targets))),x.previousTargets);
  return {nextSeed,nextPosition,consumed:g.sub(nextPosition,x.position),supported,
    callbackSuccess:g.and(supported,g.or(old.callbackSuccess,passAll,choose61,externalZero)),targetCount,targets,
    filteredCount:g.where(g.and(is9,externalActor),g.cast(g.not(x.actorParalyzed),'float32'),old.filteredCount),rageCandidateUsed:g.where(g.and(is9,externalActor),g.constant(1,'int32'),old.rageCandidateUsed),
    partyCount:count,affectableCount:g.where(is24,sum(g,defAffected),g.where(is32,sum(g,agiAffected),g.where(is158,sum(g,notAsleep),-1)))};
}

export async function buildAiBossTargetGraph(){
  const base=await buildAiTargetCallbackGraph(),party=JSON.parse(await readFile(new URL('rom-party-target4.json',root),'utf8'));
  const g=new Graph('rom-ai-boss-target4',{
    ...base.contract,
    authority:[...base.contract.authority,
      ...[['021ef5ec','021efdb8'],['021eff3c','021f0708'],['021f1844','021f2010'],['021f6424','021f6bf0'],['021ed8c0','021ee08c']].map(([file,address])=>({file:`src/Combat/Overlay_24/func_ov024_${file}.cpp`,address:`overlay24:0x${address}`,matchingCommit})),
      {file:'src/Combat/Overlay_24/func_ov024_021f66cc.cpp',tableAddress:'overlay24:0x021fff70',audit:'graph-v2/ai-callback-dispatch-audit.json',matchingCommit}],
    scope:'Actual judgment callbacks0/9 plus24/32/61/158 used by monster303. Callback24/32/158 use their exact party aggregate gates without consuming RNG. Callback61 repeat0 performs one weighted party selection, without the default callback two repeat-count draws.',
    scopeJa:'病魔パンデルムのAI対象選択を含む実ROMの対象関数です。守備力低下・すばやさ低下・毒攻撃・甘い息の採否と対象を決定します。技のダメージや状態変化の効果はまだ実行しません。',
    selector24:'If any eligible party actor has current defense !=0 and defenseRank>-2, select the entire eligible party; otherwise reject and preserve the previous target buffer/count.',
    selector32:'The corresponding agility !=0 and agilityRank>-2 test; select the entire eligible party after any eligible actor passes.',
    selector61:'First enumerate the eligible party. An empty list sets targetCount0 and rejects. Otherwise execute weighted party targeting once for repeat0 and return success, without an unconditional repeat draw.',
    selector158:'Enumerate the eligible party. Require3*status26Count<partyCount and at least one eligible actor without stats14 bit0x10. status26 is mask0x04000000, distinct from weighted-target attraction mask0x08000000. If accepted, select the entire eligible party. There are no RNG calls.',
    exclusions:'Callback9 with2+ non-paralyzed candidates, unimplemented callback indices, and callback61 with repeatCode!=0 remain explicit supported=false. Callbacks24/32/158 do not inspect repeatCode in the ROM, so their gates support all repeat values. Callback0 retains its existing supported routing/repeat0 contract.',
    dispatch:'Direct ROM table extraction confirms these are full u16 judgment callback indices from action+0x0c/+0x0e, not packed target side/scope fields. All161 ROM table entries are non-null with zero this-adjustment.',
    angerPopulation:'The represented population includes four party slots plus the acting actorId with explicit actorPresent/actorDead/actorExcluded/actorParalyzed. A live valid anger target can be that acting enemy outside the party roster. Unknown external anger IDs yield supported=false for callbacks that consult anger. Callback9 ignores exclusion in its separate anger-list helper, while weighted targeting checks it.',
    aliveState:'ROM func_02010088 tests stats14 bit0x1, independently of numerical HP. dead/actorDead carry that exact predicate. The inline legacy party-target helper receives0/1 derived from !dead solely for its live test; HP is not used to guess death. present describes existing objects and candidate describes roster/membership, so anger can target an existing non-roster object.',
    defaults:{...base.contract.defaults,...Object.fromEntries(Object.entries(extraFields).map(([name,data])=>[name,data.values]))},
    labels:{...base.contract.labels,...Object.fromEntries(Object.entries(extraFields).map(([name,data])=>[name,data.label]))},
    inputDomains:{...base.contract.inputDomains,rageId:{min:-1,max:65535,integer:true},...Object.fromEntries(Object.entries(extraFields).filter(([,data])=>data.dtype!=='bool').map(([name,data])=>[name,{min:data.min,max:data.max,integer:true}]))},
    example:'Default callback0 for one living LV15 party actor0; change selectorIndex to24/32/61/158 for the actual monster303 callback gates.'});
  const x=Object.fromEntries(base.inputs.map(input=>[input.name,g.input(input.name,input.shape,input.dtype)]));
  for(const [name,data] of Object.entries(extraFields))x[name]=g.input(name,['N',data.width??4],data.dtype??'float32');
  for(const [name,value] of Object.entries(aiBossTarget4(g,x,base,party)))g.output(value,name);return g;
}

export async function buildAiBossStepGraph(){
  const previous=await buildAiClosedGraph(),target=await buildAiBossTargetGraph(),prefix=JSON.parse(await readFile(new URL('rom-weighted-ai6.json',root),'utf8')),decision=buildDecisionGraph(prefix),
    monster=rom.monsters.find(item=>item.id===303),byAction=new Map(rom.actions.map(action=>[action.id,action])),records=monster.actions.map(id=>byAction.get(id)),buffers=records.map(action=>Buffer.from(action.raw,'hex')),
    defaults={...previous.contract.defaults,...Object.fromEntries(Object.entries(extraFields).map(([name,data])=>[name,data.values])),scheme:monster.scheme,judgment:monster.judgment,mp:monster.mp,actionIds:monster.actions,
      mpCosts:records.map(action=>action.mpCost),operations:records.map(action=>action.operation),spell:records.map(action=>!!(action.w10&1)),ability:records.map(action=>!!(action.w10&2)),
      limited:Array.from({length:6},(_,i)=>!!(monster.limitedSlots&(1<<i))),smartTarget:buffers.map(buffer=>buffer.readUInt16LE(12)),wiseTarget:buffers.map(buffer=>buffer.readUInt16LE(14)),
      targetSide:buffers.map(buffer=>(buffer.readUInt32LE(8)>>>8)&3),targetScope:buffers.map(buffer=>buffer.readUInt32LE(20)>>>28),repeatCode:buffers.map(buffer=>(buffer.readUInt32LE(28)>>>14)&31)};
  const g=new Graph('rom-ai-boss-step',{
    ...previous.contract,authority:[...decision.contract.authority,...target.contract.authority],
    scope:'Closed bounded AI decision step for all8 candidate schemes with MP/status/limited/legacy gates and actual supported callbacks0/9/24/32/61/158. One call selects, evaluates, targets and accepts or schedules retry. No callback boolean is supplied externally.',
    scopeJa:'実ROMの病魔パンデルムの6候補から、使用条件と対象を判定して採用または再探索します。出力を次の入力に戻すと行動が確定します。行動の効果、2回行動のターン管理、カメラ、戦闘の勝敗は別の処理です。',
    callbacks:target.contract.scope,exclusions:target.contract.exclusions+' Full action effects, turn lifecycle and camera remain separate.',
    defaults,labels:{...previous.contract.labels,...target.contract.labels},
    inputDomains:{...previous.contract.inputDomains,...target.contract.inputDomains},
    defaultMonsterId:303,defaultMonsterName:monster.name,defaultSteps:7,
    example:'Actual ROM monster303, judgment1, actions[1,275,1,48,44,228], scheme1, MP255 and limited-slot mask58. One living LV15 party actor has defense90, agility58, ranks0, status26=false and no sleepState. All six initial callbacks are implemented.',
    alternateExample:'Other monster/action tables may use unsupported callbacks. The supported output remains mandatory; it is never a battle outcome.',
    proof:'Independent source equivalence and direct actual ROM callback tests are saved separately for this extended model; prior closed callback0/9 proof remains available.'});
  const x=Object.fromEntries(previous.inputs.map(input=>[input.name,g.input(input.name,input.shape,input.dtype)]));
  for(const input of target.inputs)if(!(input.name in x)&&!['selectorIndex','targetSide','targetScope','repeatCode'].includes(input.name))x[input.name]=g.input(input.name,input.shape,input.dtype);
  for(const [name,value] of Object.entries(aiClosedStep(g,x,decision,target)))g.output(value,name);return g;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const reports=[];for(const graph of [await buildAiBossTargetGraph(),await buildAiBossStepGraph()])reports.push(await graph.save());
  await writeFile(new URL('ai-boss-models.json',root),JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify(reports.map(({name,nodes,bytes})=>({name,nodes,bytes}))));
}
