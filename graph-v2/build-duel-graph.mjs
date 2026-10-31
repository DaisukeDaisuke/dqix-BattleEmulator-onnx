import {writeFile} from 'node:fs/promises';
import {Graph} from './graph-builder.mjs';
import {turnOrder2} from './build-turn-graphs.mjs';
import {buildStrikeModel,buildTurnTailModel,buffStat} from './transition-graphs.mjs';
import {ACTOR_FIELDS,EXAMPLE_ACTORS} from './rules.mjs';

const defaults=[...EXAMPLE_ACTORS];defaults[ACTOR_FIELDS.indexOf('criticalThreshold')]=0;
const g=new Graph('rom-two-actor-turn',{
  scope:'One composed turn of a two-actor reduced normal-attack PoC: actual ROM initiative rules -> normal strike 1 -> normal strike 2 -> represented end-of-turn phase. Repeat feedback to an episode outcome. This is not the complete ROM battle engine.',
  architecture:'Graph.inline embeds the same validated strike and tail graphs, preserving all binary32 rounding sites; no parallel hand-written C++ implementation is introduced.',
  actorFields:ACTOR_FIELDS,
  supportedProfile:'One party actor and one enemy, both below level 10; already-selected normal attack1 against each other; resolved critical threshold0; no attack/defense/agility buffs or blind/sleep/confusion/paralysis/skip/defend/acrobat/double-dodge/double-guard. Represented HP/MP regeneration and poison are supported by the tail kernel. Threshold0 is an explicit reduced input profile, not a claim that the captured encounter had zero critical chance.',
  excluded:'AI selection, target selection/selection RNG, pre-action status recovery, all non-normal actions, coup, anger (no critical in this profile), tension, metal, reflection/counter/cover, equipment effects except supplied dodge/guard and HP regen, and camera. Full raw combatant memory and legacy nowstate are not reconstructed by this projection.',
  defaultProvenance:'HP/MP/base attack/defense/agility are copied from the original bilyouma Player initializers (89/18/82/90/58 and 696/255/68/68/50). Level9 and criticalThreshold0 are explicitly chosen reduced-profile settings; this is not the original full encounter configuration.',
  preconditions:'Actor0 party/id0 and actor1 enemy/id4; current<=max; positive maximum HP; integer vitals<=32767; integer base stats u16; rate inputs0..100; regeneration recovery0..4,duration0..255; poison1 denotes the damaging kind2 poison. sourceIndex is selected by initiative, not a user action.',
  guards:'Unsupported represented profile produces supported=0, active=0 and identity state/RNG. Callers must display unsupported instead of reporting a successful battle. No fallback rule is substituted.',
  stop:'Death before the next slot skips that slot and the tail RNG; active turn count still advances once. Already terminal lanes and lanes beyond inclusive maxTurns freeze. First-turn surprise excludes the appropriate initiative draw and attack slot.',
  feedback:{seed:'nextSeed',position:'nextPosition',actors:'nextActors',combo:'nextCombo',context:'nextContext',turn:'nextTurn',outcome:'nextOutcome'},
  defaults:{seed:[1,0,0,0,0,0,0,0],position:1,actors:defaults,combo:[0,0,0,0,0,0],context:[1,0],turn:1,maxTurns:32,outcome:0,surprise:0},
  labels:{actors:'2人の状態（制限profile）',combo:'コンボ状態',context:'行動token下位/上位16bit',turn:'次に実行するターン番号',maxTurns:'実行する最大ターン（含む）',outcome:'0続行 / 1勝利 / 2敗北',surprise:'0通常 / 1味方先制 / 2敵先制'}
});
const seed=g.input('seed',['N',8]),position=g.input('position',['N',1],'int32'),actors=g.input('actors',['N',ACTOR_FIELDS.length*2]),combo=g.input('combo',['N',6]),context=g.input('context',['N',2]),turn=g.input('turn',['N',1],'int32'),maxTurns=g.input('maxTurns',['N',1],'int32'),outcome=g.input('outcome'),surprise=g.input('surprise');
const columns=g.split(actors,ACTOR_FIELDS.length*2),a=[0,1].map(i=>Object.fromEntries(ACTOR_FIELDS.map((k,j)=>[k,columns[i*ACTOR_FIELDS.length+j]])));
const zeroFields=['criticalThreshold','attackRank','defenseRank','agilityRank','blind','sleep','confusion','paralysis','skip','defend','acrobat','doubleDodge','doubleGuard'];
const checks=[g.eq(a[0].party,1),g.eq(a[1].party,0),g.eq(a[0].id,0),g.eq(a[1].id,4)];
for(const actor of a){checks.push(g.lt(actor.level,10),g.ge(actor.level,0));for(const field of zeroFields)checks.push(g.eq(actor[field],0));}
const supported=g.and(...checks),alive=g.and(g.gt(a[0].hp,0),g.gt(a[1].hp,0)),active=g.and(supported,alive,g.eq(outcome,0),g.le(turn,maxTurns));
const agility=g.cat(a.map(actor=>buffStat(g,actor.baseAgility,actor.agilityRank,'defense',false,actor.party)));
const order=turnOrder2(g,{seed,position,agility,actorIds:g.cat(a.map(x=>x.id)),present:g.and(active,g.gt(g.cat(a.map(x=>x.hp)),0)),surprise,firstTurn:g.eq(turn,g.constant(1,'int32'))});
const indices=g.split(order.orderIndices,2),strike=buildStrikeModel();
const first=g.inline(strike,{seed:order.nextSeed,position:order.nextPosition,actors,combo,context,sourceIndex:indices[0],enabled:g.and(active,g.ge(indices[0],0))},'first');
const second=g.inline(strike,{seed:first.nextSeed,position:first.nextPosition,actors:first.nextActors,combo:first.nextCombo,context:first.nextContext,sourceIndex:indices[1],enabled:g.and(active,g.ge(indices[1],0))},'second');
const after=g.split(second.nextActors,ACTOR_FIELDS.length*2),partyHP=after[0],enemyHP=after[ACTOR_FIELDS.length];
const detectedOutcome=g.where(g.le(partyHP,0),2,g.where(g.le(enemyHP,0),1,0)),phaseOutcome=g.where(supported,g.where(g.eq(outcome,0),detectedOutcome,outcome),outcome);
const tail=g.inline(buildTurnTailModel(),{seed:second.nextSeed,position:second.nextPosition,actors:second.nextActors,turn,maxTurns,outcome:g.where(active,phaseOutcome,g.where(g.eq(phaseOutcome,0),1,phaseOutcome))},'tail');
// Tail's API skips terminal input; the enclosing active turn still counts when
// a strike ended combat. Select original/second state for inactive turns.
const nextSeed=g.where(active,tail.nextSeed,seed),nextPosition=g.where(active,tail.nextPosition,position),nextActors=g.where(active,tail.nextActors,actors),nextTurn=g.add(turn,g.cast(active,'int32'));
const nextOutcome=g.where(active,tail.nextOutcome,phaseOutcome),finished=g.or(g.not(supported),g.gt(nextOutcome,0),g.gt(nextTurn,maxTurns));
for(const [name,value] of Object.entries({nextSeed,nextPosition,nextActors,nextCombo:second.nextCombo,nextContext:second.nextContext,nextTurn,nextOutcome,consumed:g.sub(nextPosition,position),order:order.order,damage:g.cat([first.damage,second.damage]),supported:g.cast(supported,'float32'),active:g.cast(active,'float32'),finished:g.cast(finished,'float32'),completedTurns:g.sub(nextTurn,g.constant(1,'int32'))}))g.output(value,name);
const report=await g.save();await writeFile(new URL('duel-models.json',import.meta.url),JSON.stringify([report],null,2)+'\n');console.log(JSON.stringify({name:report.name,bytes:report.bytes,nodes:report.nodes},null,2));
