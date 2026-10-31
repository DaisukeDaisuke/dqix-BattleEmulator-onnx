// Separate authorities: original product stats, original ROM records and
// explicitly declared resolved-equipment numeric representatives.
import encounters from '../../restored/dq9-unified/data/encounters.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {ACTOR_FIELDS} from '../rules.mjs';
import {DEFAULT_AUX} from '../extended-rules.mjs';
import {monsterAiInputs} from './profiles.mjs';
import {decodeMonsterConfig} from './profile-records.mjs';
export const MONSTER313=rom.monsters.find(m=>m.id===313);
export const GOREONN_SOURCE=encounters.find(c=>c.branch==='goreonn_new_arugo'&&c.variant==='goreonn_v6');
if(!MONSTER313||!GOREONN_SOURCE)throw Error('Missing original313 record/profile');
const sourceMap={hp:'hp',maxHp:'maxHp',mp:'mp',maxMp:'maxMp',baseAttack:'defaultATK',baseDefense:'defaultDEF',baseAgility:'defaultSpeed',attackRank:'AtkBuffLevel',defenseRank:'BuffLevel',agilityRank:'speedLevel',sleep:'sleeping',paralysis:'paralysis',poison:'PoisonEnable',acrobat:'acrobaticStar',skip:'isStunned'};
function actor(source,index){const a=Object.fromEntries(ACTOR_FIELDS.map(k=>[k,0]));for(const[k,s]of Object.entries(sourceMap)){if(!Number.isFinite(source[s]))throw Error('Missing original '+s);a[k]=source[s];}Object.assign(a,{party:index===0?1:0,id:index===0?0:192,level:index===0?47:MONSTER313.modelFlags&127,dodgeRate:index===0?2:0,guardRate:index===0?6.5:0,criticalThreshold:index===0?500:0});return ACTOR_FIELDS.map(k=>a[k]);}
export function makeGoreonnRow({seed=[1,0,0,0,0,0,0,0],maxTurns=8}={}){
  const decoded=decodeMonsterConfig(MONSTER313,{partyJob:1}),party=Array(22).fill(100);['Fire','Ice','Wind','ThunderExplosion','Earth','Darkness','Light'].forEach((k,i)=>party[i]=GOREONN_SOURCE.armor.percentages[k]);
  return{seed,position:[1],actors:GOREONN_SOURCE.actors.flatMap(actor),aux:[...DEFAULT_AUX],status:Array(14).fill(0),wakeSkip:[0,0],combo:[0,0,0,-1,0,0],context:[1,0],config:decoded.config,turn:[1],maxTurns:[maxTurns],outcome:[0],supported:[1],finished:[0],completedTurns:0,extraAlternate:[false],resistanceBytes:[...party,...decoded.resistances],appeal:[0,0,253,decoded.resistances[21]],effectResistances:[decoded.resistances[16],decoded.resistances[12]],preparationState:Array(10).fill(0),tension:Array(6).fill(0),weapon:[1,4,11,MONSTER313.modelFlags>>>7&15],ai:{...monsterAiInputs(MONSTER313),status9:[false,false,false,false]}};
}
export function goreonnProfileAudit(){return{
  branch:GOREONN_SOURCE.branch,variant:GOREONN_SOURCE.variant,source:GOREONN_SOURCE.source,
  numericActors:GOREONN_SOURCE.actors.map((a,i)=>({id:i===0?0:192,hp:a.hp,maxHp:a.maxHp,mp:a.mp,maxMp:a.maxMp,attack:a.defaultATK,defense:a.defaultDEF,agility:a.defaultSpeed,level:i===0?47:25,levelAuthority:i===0?'Original explicit Ally_Level47, not stale CMake label.':'Original explicit Enemy_level25 and original mons_data2.nat modelFlags0x99 low7 independently agree.'})),
  config:decodeMonsterConfig(MONSTER313,{partyJob:1}).provenance,
  weapon:{inputs:[1,4,11,1],meaning:'Explicit equipped weapon, encoded lightning element4, signed species1 property11/10, enemy species1 from modelFlags bits7..10. These are resolved numeric conditions; an item identity is not recovered.',authority:'Actual weapon-properties-defined11 and emulation-weapon-property-complete-run19, plus original mons_data2.nat.'},
  charm:{inputs:[0,0,253,10],originalIntegerComparisonThreshold:.306,meaning:'Explicit10-bit current/base0 plus equipment253, with actual enemy coefficient10. ROM threshold is computed in binary32 and compared to integer bounded100. This is a numeric representative, not an equipment/charm inventory reconstruction.'},
  originalDifferences:'Original product multiplies1.1 before tension/critical; actual ROM equipment/species correction is afterward. Independent original-versus-ROM controls preserve the resulting damage differences. Original attacker-side anger bug and inactive timer encodings are not copied into the ROM graph.',
  restrictions:['One party0 using normal1 and one enemy192 from original313 six-slot AI.','No camera/menu/items/weapon changes or multiple targets; unknown actions stop explicitly.','Only represented primary/skip/coup/anger/regen and six tension fields; no force/metal/counter/reflection/barrier.','Only type1 appeal effects; original313 effect2/3 bytes are0.','Static original AI record fields are program constants; persistent cursors/usedSlots remain mutable.']
};}
