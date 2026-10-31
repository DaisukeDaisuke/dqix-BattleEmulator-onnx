import {writeFile} from 'node:fs/promises';
import {Graph} from './graph-builder.mjs';
import {turnOrder2} from './build-turn-graphs.mjs';
import {buildTurnTailModel,buffStat} from './transition-graphs.mjs';
import {buildExtendedAction,advanceCoupTail} from './extended-action.mjs';
import {ACTOR_FIELDS} from './rules.mjs';
import {AUX_FIELDS,CONFIG_FIELDS,DEFAULT_AUX,DEFAULT_CONFIG,DEFAULT_EXTENDED_ACTORS,EXTENDED_PROVENANCE} from './extended-rules.mjs';
import {extendedInputContract} from './input-domains.mjs';
const reports=[],action=buildExtendedAction();reports.push(await action.save());
reports.push(await buildExtendedAction({name:'rom-normal-action-core2',includePreparation:false,includePostStatus:false}).save());
const g=new Graph('rom-battle-step2',{
  ...extendedInputContract({battle:true}),scopeJa:'味方1人と敵1体が通常攻撃する小型戦闘PoC。順序→前半行動→後半行動→ターン末の4段階を反復し、HP0または指定ターンで停止。AI・対象計画・カメラは未接続。',defaultSteps:129,
  scope:'Four-phase, two-actor normal-attack PoC episode. Phase0 resets turn-local combo then computes initiative, phase1 first action, phase2 second action, phase3 turn tail. One shared action graph is reused by phase1/2 instead of duplicating a full strike graph.',
  actorFields:ACTOR_FIELDS,auxFields:AUX_FIELDS,configFields:CONFIG_FIELDS,provenance:EXTENDED_PROVENANCE,
  phases:{0:'turn-local combo reset and initiative',1:'first action',2:'second action',3:'turn tail'},
  turnInitialization:'matching func_ov000_0215d090 called by0215d588 and the overlay26 turn caller resets combo side/count/action/context to0 and target to−1 before the next turn. The PoC performs those represented writes in phase0; no RNG is consumed by the reset.',
  supported:'Criticals, level-based coup, HP-crossing/critical anger checks, enemy anger expiry, after-action attack/defense/agility buffs, blind/guard/dodge/acrobat timers, HP/MP regen and severe poison; preselected normal actions only.',
  excluded:'Primary paralysis/sleep/confusion/skip command replacement, successful charm/distraction, AI/action/target selection and its RNG, non-normal spells/items/skills, metal/tension/reflection/cover/counter/weapon-specific effects, full raw memory and camera. The actual monster303 AI is not replaced by a claim that it chooses normal attack every turn.',
  eventBuffer:'Every action is supplied a valid event buffer and successful node allocations. Event allocator counters, resource exhaustion and full presentation memory are outside the decoded-state PoC.',
  profileGuards:'Primary ailments, party acrobat counter routing, nonzero enemy critical threshold, or wrong actor side/ID yield supported0 and frozen state/RNG. Negative/invalid numeric inputs are outside the explicit input contract and must be rejected by the host.',
  bounds:'Actor0 party id0, actor1 enemy ROM id192; vitals integer0..32767,current<=max; base stats u16; levels0..99; ranks-2..2; timer durations0..255,recoveries0..4; coup duration0..15; phase0..3; position1..4950; turn/maxTurns1..1000; context two u16 limbs. Enemy critical threshold0; party0..10000; rates0..100; config chance0..100,min/max0..255 including reversed ranges. Stored order at phase1/2 is the partial permutation produced by phase0, with first actor0/1 and second other actor or−1.',
  loop:'Apply feedback until finished1. At most4*maxTurns+1 calls for a valid initial phase0. Unsupported profiles are errors, not won/lost results. Terminal lanes freeze while other lanes finish.',
  feedback:{seed:'nextSeed',position:'nextPosition',actors:'nextActors',aux:'nextAux',combo:'nextCombo',context:'nextContext',turn:'nextTurn',outcome:'nextOutcome',phase:'nextPhase',order:'nextOrder',damageLedger:'nextDamageLedger'},
  defaults:{seed:[1,0,0,0,0,0,0,0],position:1,actors:DEFAULT_EXTENDED_ACTORS,aux:DEFAULT_AUX,config:DEFAULT_CONFIG,combo:[0,0,0,0,0,0],context:[1,0],turn:1,maxTurns:32,outcome:0,phase:0,order:[-1,-1],damageLedger:[0,0],surprise:0},
  labels:{actors:'2人の戦闘状態',aux:'必殺・怒り・状態期限',config:'必殺/怒り条件',phase:'0順序 / 1前半行動 / 2後半行動 / 3ターン末',order:'行動者の配列番号',damageLedger:'今ターンの各行動ダメージ',turn:'次に実行するターン番号',maxTurns:'最大ターン（含む）',outcome:'0続行 / 1勝利 / 2敗北'}
});
const seed=g.input('seed',['N',8]),position=g.input('position',['N',1],'int32'),actors=g.input('actors',['N',ACTOR_FIELDS.length*2]),auxInput=g.input('aux',['N',AUX_FIELDS.length]),config=g.input('config',['N',CONFIG_FIELDS.length]),combo=g.input('combo',['N',6]),context=g.input('context',['N',2]),turn=g.input('turn',['N',1],'int32'),maxTurns=g.input('maxTurns',['N',1],'int32'),outcome=g.input('outcome'),phase=g.input('phase'),storedOrder=g.input('order',['N',2]),damageLedger=g.input('damageLedger',['N',2]),surprise=g.input('surprise');
const columns=g.split(actors,ACTOR_FIELDS.length*2),a=[0,1].map(i=>Object.fromEntries(ACTOR_FIELDS.map((k,j)=>[k,columns[i*ACTOR_FIELDS.length+j]]))),auxColumns=g.split(auxInput,AUX_FIELDS.length),aux=Object.fromEntries(AUX_FIELDS.map((k,i)=>[k,auxColumns[i]]));
const supported=g.and(g.eq(a[0].party,1),g.eq(a[1].party,0),g.eq(a[0].id,0),g.eq(a[1].id,192),g.eq(a[0].acrobat,0),g.eq(a[1].criticalThreshold,0),...a.flatMap(x=>['sleep','confusion','paralysis','skip'].map(k=>g.eq(x[k],0))));
const detectedBefore=g.where(g.le(a[0].hp,0),2,g.where(g.le(a[1].hp,0),1,0)),active=g.and(supported,g.eq(outcome,0),g.eq(detectedBefore,0),g.le(turn,maxTurns)),phase0=g.and(active,g.eq(phase,0)),phase1=g.and(active,g.eq(phase,1)),phase2=g.and(active,g.eq(phase,2)),phase3=g.and(active,g.eq(phase,3));
const order=turnOrder2(g,{seed,position,agility:g.cat(a.map(x=>buffStat(g,x.baseAgility,x.agilityRank,'defense',false,x.party))),actorIds:g.cat(a.map(x=>x.id)),present:g.and(phase0,g.gt(g.cat(a.map(x=>x.hp)),0)),surprise,firstTurn:g.eq(turn,g.constant(1,'int32'))});
const indices=g.split(storedOrder,2),sourceIndex=g.where(g.eq(phase,1),indices[0],indices[1]),actionGate=g.and(g.or(phase1,phase2),g.ge(sourceIndex,0));
const resolved=g.inline(action,{seed,position,actors,aux:auxInput,config,combo,context,sourceIndex,enabled:actionGate},'action');
const after=g.split(resolved.nextActors,ACTOR_FIELDS.length*2),deathAfter=g.where(g.le(after[0],0),2,g.where(g.le(after[ACTOR_FIELDS.length],0),1,0)),actionTerminal=g.and(actionGate,g.gt(deathAfter,0));
const tail=g.inline(buildTurnTailModel(),{seed,position,actors,turn,maxTurns,outcome:g.where(phase3,0,1)},'tail');
const tailColumns=g.split(tail.nextActors,ACTOR_FIELDS.length*2),tailActors=[0,1].map(i=>Object.fromEntries(ACTOR_FIELDS.map((k,j)=>[k,tailColumns[i*ACTOR_FIELDS.length+j]]))),tailAux=advanceCoupTail(g,aux,tailActors,phase3);
const nextSeed=g.where(phase0,order.nextSeed,g.where(actionGate,resolved.nextSeed,g.where(phase3,tail.nextSeed,seed))),nextPosition=g.where(phase0,order.nextPosition,g.where(actionGate,resolved.nextPosition,g.where(phase3,tail.nextPosition,position)));
const nextActors=g.where(actionGate,resolved.nextActors,g.where(phase3,tail.nextActors,actors)),nextAux=g.where(actionGate,resolved.nextAux,g.where(phase3,g.cat(AUX_FIELDS.map(k=>tailAux[k])),auxInput));
const nextTurn=g.where(phase3,tail.nextTurn,g.add(turn,g.cast(actionTerminal,'int32'))),nextOutcome=g.where(actionTerminal,deathAfter,g.where(phase3,tail.nextOutcome,g.where(g.and(supported,g.eq(outcome,0)),detectedBefore,outcome)));
const nextPhase=g.where(actionTerminal,0,g.where(phase0,1,g.where(phase1,g.where(g.ge(indices[1],0),2,3),g.where(phase2,3,g.where(phase3,0,phase)))));
const ledger=g.split(damageLedger,2),nextLedger=g.cat([g.where(phase0,0,g.where(phase1,resolved.damage,ledger[0])),g.where(phase0,0,g.where(phase2,resolved.damage,ledger[1]))]);
const finished=g.or(g.not(supported),g.gt(nextOutcome,0),g.gt(nextTurn,maxTurns));
for(const [name,value] of Object.entries({nextSeed,nextPosition,nextActors,nextAux,nextCombo:g.where(phase0,g.constant([0,0,0,-1,0,0],'float32',[6]),resolved.nextCombo),nextContext:resolved.nextContext,nextTurn,nextOutcome,nextPhase,nextOrder:g.where(phase0,order.orderIndices,storedOrder),nextDamageLedger:nextLedger,damage:g.where(actionGate,resolved.damage,0),critical:g.where(actionGate,resolved.critical,0),charged:g.where(actionGate,resolved.charged,0),angerActivated:g.where(actionGate,resolved.angerActivated,0),sourceIndex:g.where(actionGate,sourceIndex,-1),consumed:g.sub(nextPosition,position),supported:g.cast(supported,'float32'),active:g.cast(active,'float32'),finished:g.cast(finished,'float32'),completedTurns:g.sub(nextTurn,g.constant(1,'int32'))}))g.output(value,name);
reports.push(await g.save());await writeFile(new URL('extended-models.json',import.meta.url),JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify(reports.map(({name,bytes,nodes})=>({name,bytes,nodes})),null,2));
