// Original product numbers, original ROM records and declared resolved numeric
// equipment inputs have separate provenance. Definition changes are state.
import encounters from '../../restored/dq9-unified/data/encounters.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {ACTOR_FIELDS} from '../rules.mjs';
import {DEFAULT_AUX} from '../extended-rules.mjs';
import {monsterAiInputs} from './profiles.mjs';
import {decodeMonsterConfig} from './profile-records.mjs';
export const MONSTER310=rom.monsters.find(m=>m.id===310);
export const MONSTER747=rom.monsters.find(m=>m.id===747);
export const ERUSIONN_SOURCE=encounters.find(c=>c.branch==='erusionn_new_arugo'&&c.variant==='erusionn_v6');
if(!MONSTER310||!MONSTER747||!ERUSIONN_SOURCE)throw Error('Missing original310/747 record or profile');
const dodgeTable=[0,2,4,8,25],dodgeRank=m=>parseInt(m.raw.slice(0x10*2,0x14*2).match(/../g).reverse().join(''),16)>>>13&7;
export const MONSTER310_DODGE_RATE=dodgeTable[dodgeRank(MONSTER310)];
if(!Number.isFinite(MONSTER310_DODGE_RATE)||dodgeTable[dodgeRank(MONSTER747)]!==MONSTER310_DODGE_RATE)throw Error('Unrepresented dynamic dodge rank');
const sourceMap={hp:'hp',maxHp:'maxHp',mp:'mp',maxMp:'maxMp',baseAttack:'defaultATK',baseDefense:'defaultDEF',baseAgility:'defaultSpeed',attackRank:'AtkBuffLevel',defenseRank:'BuffLevel',agilityRank:'speedLevel',sleep:'sleeping',paralysis:'paralysis',poison:'PoisonEnable',acrobat:'acrobaticStar'};
function actor(source,index){
  const a=Object.fromEntries(ACTOR_FIELDS.map(k=>[k,0]));
  for(const[k,s]of Object.entries(sourceMap)){if(!Number.isFinite(source[s]))throw Error('Missing original310 '+s);a[k]=source[s];}
  Object.assign(a,{party:index===0?1:0,id:index===0?0:192,level:index===0?24:MONSTER310.modelFlags&127,dodgeRate:index===0?2:MONSTER310_DODGE_RATE,guardRate:index===0?4.5:0,criticalThreshold:index===0?500:0});
  return ACTOR_FIELDS.map(k=>a[k]);
}
export function makeErusionnRow({seed=[1,0,0,0,0,0,0,0],maxTurns=8}={}){
  const decoded=decodeMonsterConfig(MONSTER310,{partyJob:1}),party=Array(22).fill(100);
  ['Fire','Ice','Wind','ThunderExplosion','Earth','Darkness','Light'].forEach((k,i)=>party[i]=ERUSIONN_SOURCE.armor.percentages[k]);
  return{seed,position:[1],actors:ERUSIONN_SOURCE.actors.flatMap(actor),aux:[...DEFAULT_AUX],status:Array(14).fill(0),wakeSkip:[0,0],combo:[0,0,0,-1,0,0],context:[1,0],config:decoded.config,turn:[1],maxTurns:[maxTurns],outcome:[0],supported:[1],finished:[0],completedTurns:0,extraAlternate:[false],resistanceBytes:[...party,...decoded.resistances],appeal:[0,0,216,decoded.resistances[21]],effectResistances:[decoded.resistances[16],decoded.resistances[12]],preparationState:Array(10).fill(0),tension:Array(6).fill(0),weapon:[0,0,10,MONSTER310.modelFlags>>>7&15],ai:{...monsterAiInputs(MONSTER310),status9:[false,false,false,false],definitionId:[310],storedTransitionId:[0],transitionCount:[0]}};
}
export function erusionnProfileAudit(){return{
  romId:310,name:MONSTER310.name,branch:ERUSIONN_SOURCE.branch,variant:ERUSIONN_SOURCE.variant,source:ERUSIONN_SOURCE.source,
  numericActors:ERUSIONN_SOURCE.actors.map((a,i)=>({id:i===0?0:192,hp:a.hp,maxHp:a.maxHp,mp:a.mp,maxMp:a.maxMp,attack:a.defaultATK,defense:a.defaultDEF,agility:a.defaultSpeed,magicalMending:a.HealPower,level:i===0?24:35,levelAuthority:i===0?'Original explicit Ally_Level24; the erusionn_lv21 build label is stale.':'Original explicit Enemy_level35 and original mons_data2.nat modelFlags0x5a3 low7 independently agree. Definition changes preserve originalMonsterId310 and therefore this resolved level.'})),
  config:decodeMonsterConfig(MONSTER310,{partyJob:1}).provenance,
  enemyDodge:{rank:dodgeRank(MONSTER310),rate:MONSTER310_DODGE_RATE,source:'Original word0x10 bits13..15; original float rate table[0,2,4,8,25]. Both310/747 have rank1. Actual dodge getter returns0x40000000=2 in the enclosing-turn trace.'},
  definitions:[MONSTER310,MONSTER747].map(m=>({id:m.id,name:m.name,scheme:m.scheme,judgment:m.judgment,limitedSlots:m.limitedSlots,rawTurnBehavior:m.turnBehavior,extraMode:m.turnBehavior&7,actions:m.actions,raw:m.raw})),
  definitionChanges:'Original operation34 actions596 and595 exchange definition310/747 and stored transition ID. The original monster ID310, current HP/MP/stats/resistances and actor/group cursors persist. Target scratch is reset before reselection. Name-buffer copying and raw object pointers are outside the numerical projection.',
  weapon:{inputs:[0,0,10,11],meaning:'Explicit resolved weapon-absent numeric state, with attack211 taken from the original equipped profile and enemy species11 from original aux bits7..10. No item identity, bare-hands action flag or equipment-change menu is reconstructed.'},
  charm:{inputs:[0,0,216,5],originalIntegerComparisonThreshold:.116,meaning:'Explicit10-bit current/base0 plus equipment216, actual resistance5. ROM computes a binary32 threshold and compares integer bounded100; this represents the original integer comparison class, not a claim that the literal is a continuous probability or that an equipment inventory was recovered.'},
  restrictions:['One manual-normal party0 and one original310 enemy192 with persistent310/747 AI definitions.','Two enemy actions per turn, exact mandatory extra-action draw, bounded candidate retries with explicit unsupported result on budget exhaustion.','Executed original records1/14/16/539/161 reuse immutable kernels; operation34 is handled during planning, never as an ordinary damage action.','Only represented primary/skip/coup/anger/regen/tension state; no force/metal/counter/reflection/barrier or arbitrary AI records.','Camera, inventory, additional actors and weapon/menu changes are outside this program.']
};}
