// Original product numbers, ROM record fields and explicit resolved numeric
// equipment conditions remain separately identified; no item inference.
import encounters from '../../restored/dq9-unified/data/encounters.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {ACTOR_FIELDS} from '../rules.mjs';
import {DEFAULT_AUX} from '../extended-rules.mjs';
import {monsterAiInputs} from './profiles.mjs';
import {decodeMonsterConfig} from './profile-records.mjs';
export const MONSTER311=rom.monsters.find(m=>m.id===311);
export const GADONNGO_SOURCE=encounters.find(c=>c.branch==='gadonnko_new_arugo'&&c.variant==='gadonngo_v6');
if(!MONSTER311||!GADONNGO_SOURCE)throw Error('Missing exact311 original record/profile');
const sourceMap={hp:'hp',maxHp:'maxHp',mp:'mp',maxMp:'maxMp',baseAttack:'defaultATK',baseDefense:'defaultDEF',baseAgility:'defaultSpeed',attackRank:'AtkBuffLevel',defenseRank:'BuffLevel',agilityRank:'speedLevel',sleep:'sleeping',paralysis:'paralysis',poison:'PoisonEnable',acrobat:'acrobaticStar',skip:'isStunned'};
function actor(source,index){const a=Object.fromEntries(ACTOR_FIELDS.map(k=>[k,0]));for(const[k,s]of Object.entries(sourceMap)){if(!Number.isFinite(source[s]))throw Error('Missing original311 '+s);a[k]=source[s];}Object.assign(a,{party:Number(index===0),id:index===0?0:192,level:index===0?47:MONSTER311.modelFlags&127,dodgeRate:index===0?2:0,guardRate:index===0?6.5:8,criticalThreshold:index===0?500:0});return ACTOR_FIELDS.map(k=>a[k]);}
export function makeGadonngoRow({seed=[1,0,0,0,0,0,0,0],maxTurns=8}={}){
  const d=decodeMonsterConfig(MONSTER311,{partyJob:1}),party=Array(22).fill(100),aux=[...DEFAULT_AUX];
  ['Fire','Ice','Wind','ThunderExplosion','Earth','Darkness','Light'].forEach((k,i)=>party[i]=GADONNGO_SOURCE.armor.percentages[k]);
  party[14]=75;party[16]=50;aux[6]=0;
  return{seed,position:[1],actors:GADONNGO_SOURCE.actors.flatMap(actor),aux,status:Array(14).fill(0),wakeSkip:[0,0],combo:[0,0,0,-1,0,0],context:[1,0],config:d.config,turn:[1],maxTurns:[maxTurns],outcome:[0],supported:[1],finished:[0],completedTurns:0,extraAlternate:[false],resistanceBytes:[...party,...d.resistances],appeal:[0,0,253,d.resistances[21]],effectResistances:[d.resistances[16],d.resistances[12]],preparationState:Array(10).fill(0),tension:Array(6).fill(0),weapon:[1,4,11,MONSTER311.modelFlags>>>7&15],ai:{...monsterAiInputs(MONSTER311),status9:[false,false,false,false]}};
}
export function gadonngoProfileAudit(){return{
  branch:GADONNGO_SOURCE.branch,variant:GADONNGO_SOURCE.variant,source:GADONNGO_SOURCE.source,sourceAudit:'evidence-v2/original/gadonnko/profile-audit.json',monsterId:311,romName:MONSTER311.name,
  numericActors:GADONNGO_SOURCE.actors.map((a,i)=>({id:i===0?0:192,hp:a.hp,maxHp:a.maxHp,mp:a.mp,maxMp:a.maxMp,attack:a.defaultATK,defense:a.defaultDEF,agility:a.defaultSpeed,heal:a.HealPower,level:i===0?47:15,levelAuthority:i===0?'Original explicit Ally_Level47, not copied erusionn_lv21 macro label.':'Original ROM mons_data2 modelFlags143 low7=15. Original Enemy_level35 remains a separate difference; original action290 itself explicitly uses15*2.5.'})),
  resolvedRates:{partyCritical:500,partyDodge:2,partyGuard:6.5,enemyCritical:0,enemyDodge:0,enemyGuard:8,authority:'Actual getter cohort emulation-monster311-rate-run confirms enemy rank3 guard8/dodge0 and declared party shield6.5/base dodge2.'},
  config:decodeMonsterConfig(MONSTER311,{partyJob:1}).provenance,
  weapon:{inputs:[1,4,11,1],meaning:'Explicit present weapon, lightning element4, species1 property11/10, enemy species1 from actual auxiliary bits7..10. No recovered item ID; actual post-critical multiplier order is authoritative.'},
  charm:{inputs:[0,0,253,10],originalIntegerComparisonThreshold:.306,meaning:'Resolved10-bit equipment253 with current/base0 and actual monster coefficient10. Numeric representative, not a recovered charm inventory.'},
  susceptibility:{partyElement15:75,partyElement17:50,meaning:'Explicit numerical representatives of original115 integer-roll threshold18.75 and272 rounded threshold13. Raw272 field is17/currentStats4e, independently tested with other resistance bytes held distinct. These percentages do not identify equipment.'},
  initialInactiveFields:{angerTarget:0,reason:'Explicit zero-initialized ROM field with anger inactive, independently from combo target=-1.'},
  restrictions:['One party0 manually using normal1 and one enemy192 with original fixed311 AI.','Camera/menu/items/bare-hands/equipment changes/extra actors remain outside.','Only represented primary/skip/coup/anger/regen/tension state; no force/metal/counter/reflection/barriers.','Original AI has no tension161 action; initial actual encounter profile starts tension0.','Only type1 appeal effects; original311 effect2/3 bytes are0.','Static original AI record columns are program weights; only persistent cursors/usedSlots change.','Pre-action134 MP0..3 replacement/raw3c flags are explicitly unsupported; original encounter MP255 is retained.'],
  shieldDefenseAuthority:'Original word08 bit28 routes134 through the pre-action MP/payment and defense-table pass before priority execution. Actual planning PC021551d4 sets defend1 even when party acts first; the134 body separately sets1 at021e6070. Finish_turn clears0 at0215ff48. The direct body MP exemption prevents a second payment, not a universal free-action claim.',
  originalDifferences:'Original product multiplies1.1 before tension/critical; actual ROM equipment correction follows critical. Both whole planning paths activate shield defense before attacks, while the original standalone body omits the additional ROM core setter. Preserve these boundary/arithmetic differences rather than altering frozen numerical kernels.'
};}
