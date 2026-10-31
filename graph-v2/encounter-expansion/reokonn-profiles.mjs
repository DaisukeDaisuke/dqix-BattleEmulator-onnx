// The original numerical profile and explicit ROM representatives are distinct
// authorities. In particular, no level is inferred from the branch name.
import encounters from '../../restored/dq9-unified/data/encounters.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {ACTOR_FIELDS} from '../rules.mjs';
import {AUX_FIELDS,DEFAULT_AUX} from '../extended-rules.mjs';
import {monsterAiInputs} from './profiles.mjs';
import {decodeMonsterConfig} from './profile-records.mjs';
export const MONSTER301=rom.monsters.find(m=>m.id===301);
export const REOKONN_SOURCE=encounters.find(e=>e.branch==='reokonn_lv8_new_arugo'&&e.variant==='reokonn_v6');
const direct={hp:'hp',maxHp:'maxHp',mp:'mp',maxMp:'maxMp',baseAttack:'defaultATK',baseDefense:'defaultDEF',baseAgility:'defaultSpeed',defenseRank:'BuffLevel',agilityRank:'speedLevel',sleep:'sleeping',paralysis:'paralysis',poison:'PoisonEnable',acrobat:'acrobaticStar'};
export function reokonnActor(source,index){
  const party=index===0,a=Object.fromEntries(ACTOR_FIELDS.map(k=>[k,0])),proof={};
  for(const[key,field]of Object.entries(direct)){if(!Number.isFinite(source[field]))throw Error('Missing reokonn field '+field);a[key]=source[field];proof[key]={source:`encounters.reokonn_v6.actors[${index}].${field}`,value:a[key]};}
  Object.assign(a,{party:Number(party),id:party?0:192,level:party?8:9,criticalThreshold:party?200:0,dodgeRate:2,guardRate:party?.5:0});
  for(const[key,source]of Object.entries({party:'Explicit party/enemy side.',id:'Actual object IDs party0/enemy192.',level:party?'Explicit level8 numerical representative; original Player/CMake has no level field, and the branch LV8 label is not treated as actual RAM provenance.':'Explicit auxiliary level9 representative; no selected action uses the level selector.',criticalThreshold:party?'Original threshold200 per10000; actual party deftness0 gives2%.':'Actual original monster301 critical threshold0.',dodgeRate:party?'Original party bounded100<2 and actual base party dodge2.':'Actual monster301 getter2.0 from raw dodge rank1; original party normal also checks enemy dodge2.',guardRate:party?'Original ShieldGuardP0.5; actual shield property5/10 is an explicit rate representative, not recovered gear.':'Actual monster301 getter0.'}))proof[key]={source,value:a[key]};
  for(const key of ACTOR_FIELDS)if(!(key in proof))proof[key]={source:'Explicit initially absent represented condition. Original has no active ATK rank, blind/confusion/skip, HP/MP regeneration or defense command; no other boss defaults are copied.',value:a[key]};
  return{values:ACTOR_FIELDS.map(k=>a[k]),proof:ACTOR_FIELDS.map(name=>({name,...proof[name]}))};
}
export function makeReokonnRow({seed=[1,0,0,0,0,0,0,0],maxTurns=8}={}){
  const m=decodeMonsterConfig(MONSTER301,{partyJob:1}),aux=[...DEFAULT_AUX],party=Array(22).fill(100);
  aux[AUX_FIELDS.indexOf('coupReady')]=REOKONN_SOURCE.actors[0].specialCharge;
  aux[AUX_FIELDS.indexOf('coupDuration')]=REOKONN_SOURCE.actors[0].specialChargeTurn;
  return{seed,position:[1],actors:REOKONN_SOURCE.actors.flatMap((a,i)=>reokonnActor(a,i).values),aux,config:m.config,status:Array(14).fill(0),wakeSkip:[0,0],combo:[0,0,0,-1,0,0],context:[1,0],turn:[1],maxTurns:[maxTurns],outcome:[0],supported:[1],finished:[0],completedTurns:0,extraAlternate:[false],resistanceBytes:[...party,...m.resistances],appeal:[0,0,0,m.resistances[21]],effectResistances:[m.resistances[16],m.resistances[12]],preparationState:Array(10).fill(0),ai:{...monsterAiInputs(MONSTER301),status9:[false,false,false,false]}};
}
export function reokonnProfileAudit(){const s=REOKONN_SOURCE,row=makeReokonnRow();return{
  branch:s.branch,variant:s.variant,sourceCommit:s.source.commit,sourceHashes:s.source,defines:s.defines,actorFields:s.actors.map((a,i)=>reokonnActor(a,i).proof),config:decodeMonsterConfig(MONSTER301,{partyJob:1}).provenance,
  initialAux:AUX_FIELDS.map((name,i)=>({name,value:row.aux[i],source:name==='coupReady'?'Original initial specialCharge=true, retained.':name==='coupDuration'?'Original initial specialChargeTurn0, retained even with ready=true; actual ROM four-bit turn decrement wraps0 to15.':name==='angerTarget'?'Explicit inactive target sentinel.':'Explicit inactive represented ROM condition.'})),
  monsterTurnBehavior:{raw:MONSTER301.turnBehavior,extraMode:MONSTER301.turnBehavior&7,dodgeRank:MONSTER301.turnBehavior>>>5&3,dodgeRate:2,scope:'Raw byte32 is not two actions: low3 bits0 means one action with the mandatory extra-action RNG draw; upper0x20 belongs to dodge rank1.',authority:'evidence-v2/ghidra/monster301-attributes-defined/response.json'},
  appeal:{input:row.appeal,originalLiteral:s.configuration.mitoreP,meaning:'Explicit current/base/equipment0, actual monster resistance5. Original retains primary+appeal position increments while commenting out only appeal-success logic; the nonpositive chance cannot succeed but still consumes its draw. Full charm equipment is not reconstructed.'},
  initialHealPower:{original:s.actors[0].HealPower,value:22,scope:'The party normal-only program never casts healing. The actual harness initializes magicalMending22 explicitly; it is not an unsupported HP regeneration term.'},
  originalDifferences:{damageCoupBaseHP:s.configuration.baseHP,actualMaxHp:s.actors[0].maxHp,meaning:'Original process7A8 uses baseHP65 while actual ROM uses current maximumHP56. Do not force the ROM graph to inherit that source discrepancy. Initial ready=true usually bypasses the generation branch.'},
  resistanceBytes:row.resistanceBytes.map((value,i)=>({actor:Math.floor(i/22),index:i%22,value,source:i>=22?'Original monster301 raw22 resistance bytes.':'Explicit100 numerical resistance for the initial no-armor-modifier profile; not a reconstruction of complete equipment.'})),
  restrictions:['One manual-normal party and one actual monster301 with all six AI slots, including repeated73 and self-heal30.','Party level8/job1/deftness0/shield5 are declared ROM numerical representatives; original level/gear RAM is absent.','Initial ready=true/duration0 is preserved, not reset to fit a simpler domain.','No party menu/items/healing/weapon switching, additional actors, reflection/tension/counters, or weapon-proc effects.','Camera is a separate outer phase; no initial or intermediate seed filtering.']};}
