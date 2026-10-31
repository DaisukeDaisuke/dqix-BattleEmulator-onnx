import {Graph} from './graph-builder.mjs';
import {RandomGraph,buildTurnTailModel,buffStat} from './transition-graphs.mjs';
import {advanceAnger} from './lifecycle-rules.mjs';
import {advanceCoupTail} from './extended-action.mjs';
import {ACTOR_FIELDS} from './rules.mjs';
import {ACTION_STATUSES,AUX_FIELDS,DEFAULT_AUX,DEFAULT_EXTENDED_ACTORS} from './extended-rules.mjs';
import {BOSS_STATUS_FIELDS,BOSS_ACTION_IDS,BOSS_ACTION_RULES} from './boss-action-rules.mjs';
import {extendedInputContract} from './input-domains.mjs';
import {writeFile} from 'node:fs/promises';

const object=(names,values)=>Object.fromEntries(names.map((name,i)=>[name,values[i]]));
const unpackActors=(g,x)=>{const c=g.split(x,ACTOR_FIELDS.length*2);return[0,1].map(i=>object(ACTOR_FIELDS,c.slice(i*ACTOR_FIELDS.length,(i+1)*ACTOR_FIELDS.length)));};
const packActors=(g,actors)=>g.cat(actors.flatMap(a=>ACTOR_FIELDS.map(k=>a[k])));
const lookup=(g,key,values)=>values.slice(1).reduce((v,x,i)=>g.where(g.eq(key,i+1),x,v),g.constant(values[0]));
const timer=(actor,field,part)=>`a${actor}_${field}${part}`;
const statusDomains=()=>BOSS_STATUS_FIELDS.map(name=>({name,min:0,max:name.endsWith('poisonKind')?2:name.endsWith('Recovery')?4:255,integer:true}));

// Post-action helper pair, not primary recovery. The first helper consumes its
// shared roll and optional recovery rolls; the second ticks duration bytes.
// Retaining the distinction prevents sleep inflicted by a preceding action
// from silently losing the primary-recovery draw on the next command.
export function bossPostStatus(g,x){
  const actors=unpackActors(g,x.actors),status=object(BOSS_STATUS_FIELDS,g.split(x.status,14));
  let aux=object(AUX_FIELDS,g.split(x.aux,AUX_FIELDS.length));
  const active=g.and(x.enabled,g.gt(actors[0].hp,0),g.gt(actors[1].hp,0)),partySource=g.eq(x.sourceIndex,0),rng=new RandomGraph(g,x.seed,x.position);
  const shared=rng.bounded(active,100);
  aux=advanceAnger(g,aux,{enabled:g.and(active,g.not(partySource)),targetValid:g.eq(aux.angerTarget,actors[0].id),sharedRoll:shared});
  for(const s of ACTION_STATUSES){
    const current=g.where(partySource,actors[0][s.field],actors[1][s.field]),recovery=g.where(partySource,aux[timer(0,s.field,'Recovery')],aux[timer(1,s.field,'Recovery')]);
    const gate=g.and(active,g.not(g.eq(current,0)),g.gt(recovery,0)),next=g.max(g.sub(recovery,1),0),clear=g.and(gate,g.lt(rng.bounded(gate,100),lookup(g,next,s.thresholds)));
    for(let i=0;i<2;i++){
      const selected=g.eq(x.sourceIndex,i),apply=g.and(gate,selected),cleared=g.and(clear,selected),rk=timer(i,s.field,'Recovery'),dk=timer(i,s.field,'Duration');
      actors[i][s.field]=g.where(cleared,0,actors[i][s.field]);aux[rk]=g.where(cleared,0,g.where(apply,next,aux[rk]));aux[dk]=g.where(cleared,0,aux[dk]);
    }
  }
  // The source first-active table contains paralysis, sleep, confusion. Only
  // that first active primary ailment ticks, even if its duration is zero.
  for(let i=0;i<2;i++){
    let prior=g.eq(0,1);
    for(const field of ['paralysis','sleep','confusion']){
      const present=g.gt(actors[i][field],0),dk=timer(i,field,'Duration'),rk=timer(i,field,'Recovery');
      const ticking=g.and(active,g.eq(x.sourceIndex,i),g.not(prior),present,g.gt(status[dk],0));
      status[dk]=g.where(ticking,g.sub(status[dk],1),status[dk]);status[rk]=g.where(g.and(ticking,g.eq(status[dk],0)),4,status[rk]);prior=g.or(prior,present);
    }
  }
  for(const s of ACTION_STATUSES)for(let i=0;i<2;i++){
    const dk=timer(i,s.field,'Duration'),rk=timer(i,s.field,'Recovery'),tick=g.and(active,g.eq(x.sourceIndex,i),g.not(g.eq(actors[i][s.field],0)),g.gt(aux[dk],0));
    aux[dk]=g.where(tick,g.sub(aux[dk],1),aux[dk]);aux[rk]=g.where(g.and(tick,g.eq(aux[dk],0)),s.steps,aux[rk]);
  }
  return{nextSeed:rng.seed,nextPosition:rng.position,nextActors:packActors(g,actors),nextAux:g.cat(AUX_FIELDS.map(k=>aux[k])),nextStatus:g.cat(BOSS_STATUS_FIELDS.map(k=>status[k])),consumed:g.sub(rng.position,x.position),active:g.cast(active,'float32')};
}

export function buildBossPostModel(){
  const contract=extendedInputContract();for(const k of ['combo','config'])delete contract.fieldDomains[k];delete contract.inputDomains.context;
  contract.fieldDomains.status=statusDomains();
  const g=new Graph('rom-boss-post-status2',{
    ...contract,scopeJa:'行動後の怒り・強化状態回復と、麻痺→睡眠→混乱の優先順位に従う期限更新。戦闘継続時だけ1行動者に適用。',defaultSteps:1,
    scope:'Matching func_ov000_0215858c followed by021599f4, one selected participant after an ongoing command. Successful event allocations, only the represented statuses. Primary pre-action recovery is external.',
    actorFields:ACTOR_FIELDS,auxFields:AUX_FIELDS,statusFields:BOSS_STATUS_FIELDS,
    primaryRule:'Duration decrements only for the first active ailment in paralysis, sleep, confusion order; reaching zero sets recovery4. This is distinct from primary-recovery probability and action replacement.',
    feedback:{seed:'nextSeed',position:'nextPosition',actors:'nextActors',aux:'nextAux',status:'nextStatus'},
    defaults:{seed:[1,0,0,0,0,0,0,0],position:1,actors:DEFAULT_EXTENDED_ACTORS,aux:DEFAULT_AUX,status:Array(14).fill(0),sourceIndex:0,enabled:true},
    labels:{actors:'2人の状態',aux:'必殺・怒り・状態期限',status:'毒種別と主状態カウンタ',sourceIndex:'行動後処理する配列番号'}
  });
  const input={seed:g.input('seed',['N',8]),position:g.input('position',['N',1],'int32'),actors:g.input('actors',['N',66]),aux:g.input('aux',['N',35]),status:g.input('status',['N',14]),sourceIndex:g.input('sourceIndex'),enabled:g.input('enabled',['N',1],'bool')};
  for(const [name,value]of Object.entries(bossPostStatus(g,input)))g.output(value,name);return g;
}

export function buildBossTailModel(){
  const contract=extendedInputContract({battle:true});for(const k of ['combo','config'])delete contract.fieldDomains[k];for(const k of ['context','phase','order','damageLedger','surprise'])delete contract.inputDomains[k];contract.fieldDomains.status=statusDomains();contract.inputDomains.wakeSkip={min:0,max:1,integer:true,width:2};contract.inputDomains.enteredTurn={values:[false,true,0,1]};
  const g=new Graph('rom-boss-turn-tail2',{
    ...contract,scopeJa:'ターン末の回復・猛毒・必殺期限と死亡による状態消去。麻痺・睡眠・混乱の残り期限は行動後処理まで保持。',defaultSteps:1,
    scope:'The independently ROM-verified two-actor turn tail plus represented coup and death-cleared status bytes. enteredTurn finalizes exactly one turn, including a turn whose action already ended combat. A false enteredTurn is full state/RNG/counter identity. Action post-status and primary recovery are separate phases.',
    actorFields:ACTOR_FIELDS,auxFields:AUX_FIELDS,statusFields:BOSS_STATUS_FIELDS,
    feedback:{seed:'nextSeed',position:'nextPosition',actors:'nextActors',aux:'nextAux',status:'nextStatus',wakeSkip:'nextWakeSkip',turn:'nextTurn',outcome:'nextOutcome',enteredTurn:'nextEnteredTurn'},
    wakeSkip:'JPN0215fe68 calls0208a098 on ongoing turn-end entry: stats3b bit0 and bit2 are cleared before regen/poison. An already terminal outcome skips this entry and preserves the wake flag.',
    defaults:{seed:[1,0,0,0,0,0,0,0],position:1,actors:DEFAULT_EXTENDED_ACTORS,aux:DEFAULT_AUX,status:Array(14).fill(0),wakeSkip:[0,0],turn:1,maxTurns:32,outcome:0,enteredTurn:true},
    turnCommit:'JPN0215fe68 increments turn even when its entry outcome is already terminal. The enclosing runner calls it once for each entered turn and then stops; a later terminal runner invocation never re-enters it.',
    labels:{actors:'2人の状態',aux:'必殺・怒り・状態期限',status:'毒種別と主状態カウンタ',turn:'現在ターン',maxTurns:'PoC最大ターン',outcome:'0続行 /1勝利 /2敗北',enteredTurn:'開始済みターンを1回確定'}
  });
  const seed=g.input('seed',['N',8]),position=g.input('position',['N',1],'int32'),actorInput=g.input('actors',['N',66]),auxInput=g.input('aux',['N',35]),statusInput=g.input('status',['N',14]),wakeSkip=g.input('wakeSkip',['N',2]),turn=g.input('turn',['N',1],'int32'),maxTurns=g.input('maxTurns',['N',1],'int32'),outcome=g.input('outcome'),enteredTurn=g.input('enteredTurn',['N',1],'bool');
  const tail=g.inline(buildTurnTailModel(),{seed,position,actors:actorInput,turn,maxTurns,outcome:g.where(enteredTurn,outcome,1)},'tail'),actors=unpackActors(g,tail.nextActors),active=g.gt(tail.active,0),aux=advanceCoupTail(g,object(AUX_FIELDS,g.split(auxInput,35)),actors,active),status=object(BOSS_STATUS_FIELDS,g.split(statusInput,14));
  for(let i=0;i<2;i++){const dead=g.and(active,g.le(actors[i].hp,0));for(const k of BOSS_STATUS_FIELDS.filter(k=>k.startsWith(`a${i}_`)))status[k]=g.where(dead,0,status[k]);}
  const nextTurn=g.add(turn,g.cast(enteredTurn,'int32')),nextOutcome=g.where(enteredTurn,tail.nextOutcome,outcome),finished=g.or(g.gt(nextOutcome,0),g.gt(nextTurn,maxTurns));
  for(const [name,value]of Object.entries({...tail,nextTurn,nextOutcome,finished:g.cast(finished,'float32'),nextEnteredTurn:g.and(enteredTurn,g.not(finished)),nextAux:g.cat(AUX_FIELDS.map(k=>aux[k])),nextStatus:g.cat(BOSS_STATUS_FIELDS.map(k=>status[k])),nextWakeSkip:g.where(active,g.mul(wakeSkip,0),wakeSkip)}))g.output(value,name);return g;
}

// Arithmetic and ROM flag decisions needed by the thin batch orchestrator.
// Its host-side state connections never recompute a buffed stat or damage.
export function buildBossStateView(){
  const contract=extendedInputContract();for(const key of ['combo','config'])delete contract.fieldDomains[key];for(const key of ['seed','position','context','sourceIndex','enabled'])delete contract.inputDomains[key];contract.inputDomains.wakeSkip={min:0,max:1,integer:true,width:2};
  const g=new Graph('rom-boss-state-view2',{
    ...contract,scopeJa:'病魔との2人戦闘用に能力補正・生存・状態フラグをグラフ内で読出し、AIとターン順序へ接続します。',defaultSteps:1,
    scope:'Read-only state adapter for the restricted two-actor runner. Buffs use the same audited u16-before-cap rules; party command planning mirrors unable_to_plan with primary ailments. No RNG and no action arithmetic are implemented by the JavaScript runner.',
    actorFields:ACTOR_FIELDS,auxFields:AUX_FIELDS,defaults:{actors:DEFAULT_EXTENDED_ACTORS,aux:DEFAULT_AUX,wakeSkip:[0,0]},feedback:{},labels:{actors:'2人の状態',aux:'必殺・怒り・状態期限'}
  });
  const actors=unpackActors(g,g.input('actors',['N',66])),aux=object(AUX_FIELDS,g.split(g.input('aux',['N',35]),35)),party=actors[0],enemy=actors[1],zero=g.mul(party.hp,0),boolFalse=g.lt(zero,0),boolTrue=g.eq(zero,0),array4=x=>g.cat([x,zero,zero,zero]),bool4=x=>g.cat([x,boolFalse,boolFalse,boolFalse]),blocked=a=>g.or(g.le(a.hp,0),...['paralysis','sleep','confusion','skip'].map(k=>g.gt(a[k],0))),partyBlocked=blocked(party),enemyBlocked=blocked(enemy),defense=actors.map(a=>buffStat(g,a.baseDefense,a.defenseRank,'defense',true,a.party)),agility=actors.map(a=>buffStat(g,a.baseAgility,a.agilityRank,'defense',false,a.party)),outcome=g.where(g.le(party.hp,0),2,g.where(g.le(enemy.hp,0),1,0));
  const wakeSkip=g.input('wakeSkip',['N',2]);
  const outputs={
    outcome,supported:g.and(g.eq(party.party,1),g.eq(enemy.party,0),g.eq(party.id,0),g.eq(enemy.id,192),g.eq(party.acrobat,0),g.eq(enemy.criticalThreshold,0)),
    alive:g.gt(g.cat([party.hp,enemy.hp]),0),canExecute:g.and(g.gt(g.cat([party.hp,enemy.hp]),0),g.eq(wakeSkip,0)),
    actorIds:g.cat([party.id,enemy.id]),initiativeAgility:g.cat(agility),
    partyHp:array4(party.hp),partyDefense:array4(defense[0]),partyAgility:array4(agility[0]),
    partyDefenseRank:array4(party.defenseRank),partyAgilityRank:array4(party.agilityRank),
    partyParalyzed:bool4(g.gt(party.paralysis,0)),partyAsleep:bool4(g.gt(party.sleep,0)),partyDead:bool4(g.le(party.hp,0)),partyPresent:bool4(boolTrue),
    enemyDead:g.le(enemy.hp,0),enemyParalyzed:g.gt(enemy.paralysis,0),enemyMp:enemy.mp,rageEnabled:g.gt(aux.anger,0),rageId:aux.angerTarget,
    partyPlannedAction:g.where(partyBlocked,503,1),partyPlannedTargetCount:g.where(partyBlocked,0,1),enemyCanPlan:g.not(enemyBlocked)
  };
  for(const [name,value]of Object.entries(outputs))g.output(value,name);return g;
}

export function buildBossCommandRoute(options={}){
  const actionIds=options.actionIds??BOSS_ACTION_IDS,actionRules=options.actionRules??BOSS_ACTION_RULES;
  const contract=extendedInputContract();delete contract.fieldDomains.combo;delete contract.fieldDomains.config;for(const key of ['seed','position','context'])delete contract.inputDomains[key];Object.assign(contract.inputDomains,{actionId:{min:0,max:65535,integer:true},recovered:{values:[false,true,0,1]},targetCount:{min:0,max:8,integer:true}});
  const g=new Graph(options.name??'rom-boss-command-route2',{
    ...contract,scopeJa:'主状態の回復後に通常行動・行動不能・回復イベント・MP不足へ接続します。イベントの効果や乱数は別のcoreグラフで実行します。',defaultSteps:1,
    scope:'Caller routing after primary recovery: party coupSkip is cleared, remaining paralysis/sleep becomes503, insufficient MP becomes504, recovery events preserve900/901/938. Confusion command selection, party special skills, and source status14 skip bit0x80000 (which requires an additional stats3b bit1 preparation/post contract) are explicitly unsupported.',
    defaults:{actors:DEFAULT_EXTENDED_ACTORS,aux:DEFAULT_AUX,sourceIndex:0,actionId:1,targetCount:1,recovered:false,enabled:true},actorFields:ACTOR_FIELDS,auxFields:AUX_FIELDS,feedback:{aux:'nextAux'},labels:{actionId:'回復後の行動',sourceIndex:'行動者配列番号',recovered:'主状態が回復済み',targetCount:'計画対象数'},...(options.contract??{})
  });
  const actors=unpackActors(g,g.input('actors',['N',66])),aux=object(AUX_FIELDS,g.split(g.input('aux',['N',35]),35)),sourceIndex=g.input('sourceIndex'),actionId=g.input('actionId'),targetCount=g.input('targetCount'),recovered=g.input('recovered',['N',1],'bool'),enabled=g.input('enabled',['N',1],'bool'),party=g.eq(sourceIndex,0),source=Object.fromEntries(ACTOR_FIELDS.map(k=>[k,g.where(party,actors[0][k],actors[1][k])])),active=g.and(enabled,g.gt(source.hp,0));
  const disabled=g.or(...['paralysis','sleep','skip'].map(k=>g.gt(source[k],0))),confused=g.and(g.not(recovered),g.not(disabled),g.gt(source.confusion,0));
  let nextAction=g.where(g.and(active,g.not(recovered),disabled),503,actionId),cost=g.constant(0);
  for(const r of actionRules)cost=g.where(g.eq(nextAction,r.id),r.mpCost,cost);
  const insufficient=g.and(active,g.not(recovered),g.not(disabled),g.or(party,g.lt(source.mp,255)),g.lt(source.mp,cost));nextAction=g.where(insufficient,504,nextAction);
  const event=g.or(...[503,504,900,901,938].map(id=>g.eq(nextAction,id))),ordinary=g.or(...actionIds.map(id=>g.eq(nextAction,id))),supported=g.and(g.eq(source.skip,0),g.not(confused),g.or(event,g.and(ordinary,g.or(g.not(party),g.eq(nextAction,1)))));
  aux.coupSkip=g.where(g.and(active,party),0,aux.coupSkip);
  for(const [name,value]of Object.entries({nextAux:g.cat(AUX_FIELDS.map(k=>aux[k])),nextAction,nextTargetCount:g.where(g.and(active,event),0,targetCount),ordinaryGate:g.and(active,supported,ordinary),eventGate:g.and(active,supported,event),supported,insufficientMp:insufficient,active}))g.output(value,name);return g;
}

if(process.argv[1]&&new URL(`file://${process.argv[1]}`).href===import.meta.url){const reports=[];for(const graph of [buildBossPostModel(),buildBossTailModel(),buildBossStateView(),buildBossCommandRoute()])reports.push(await graph.save());await writeFile(new URL('boss-phase-models.json',import.meta.url),JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify(reports.map(({name,nodes,bytes})=>({name,nodes,bytes}))));}
