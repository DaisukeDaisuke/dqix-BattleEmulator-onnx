// Preserve source literals, including HP305/max300. Resolved equipment and
// original ROM definition/auxiliary fields have independent provenance.
import encounters from '../../restored/dq9-unified/data/encounters.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {ACTOR_FIELDS} from '../rules.mjs';
import {DEFAULT_AUX} from '../extended-rules.mjs';
import {monsterAiInputs} from './profiles.mjs';
import {decodeMonsterConfig} from './profile-records.mjs';
export const MONSTER319=rom.monsters.find(m=>m.id===319),MONSTER751=rom.monsters.find(m=>m.id===751);
export const ERUGI1_PRIMARY_VARIANT='erugiosu_1_gouketu';
export const ERUGI1_ACTION_IDS=[1,540,189,20,161,286,577];
export function erugi1Source(variant=ERUGI1_PRIMARY_VARIANT){const s=encounters.find(c=>c.branch==='erugiosu1_new_arugo'&&c.variant===variant);if(!s)throw Error('Unknown independently audited primary319 variant '+variant);return s;}
function actor(source,index){
  const a=Object.fromEntries(ACTOR_FIELDS.map(k=>[k,0]));
  for(const[k,s]of Object.entries({hp:'hp',maxHp:'maxHp',mp:'mp',maxMp:'maxMp',baseAttack:'defaultATK',baseDefense:'defaultDEF',baseAgility:'speed',attackRank:'AtkBuffLevel',defenseRank:'BuffLevel',sleep:'sleeping',paralysis:'paralysis',skip:'inactive'})){if(!Number.isFinite(source[s]))throw Error('Missing literal319 '+s);a[k]=source[s];}
  if(source.defence!==1||source.TensionLevel!==0||source.rage!==0||source.specialCharge!==0)throw Error('Only the audited ordinary initial319 source state is represented by this profile');
  Object.assign(a,{party:Number(index===0),id:index===0?0:192,level:index===0?49:MONSTER319.modelFlags&127,dodgeRate:index===0?2:4,guardRate:index===0?9:0,criticalThreshold:index===0?500:0});
  return ACTOR_FIELDS.map(k=>a[k]);
}
export function makeErugi1Row({seed=[1,0,0,0,0,0,0,0],maxTurns=8,variant=ERUGI1_PRIMARY_VARIANT}={}){
  const source=erugi1Source(variant),d=decodeMonsterConfig(MONSTER319,{partyJob:1}),other=decodeMonsterConfig(MONSTER751,{partyJob:1}),party=Array(22).fill(100),aux=[...DEFAULT_AUX];
  if(JSON.stringify(d.config)!==JSON.stringify(other.config)||JSON.stringify(d.resistances)!==JSON.stringify(other.resistances))throw Error('Definition pair has differing represented config/resistance rules');
  ['Fire','Ice','Wind','ThunderExplosion','Earth','Darkness','Light'].forEach((k,i)=>party[i]=source.armor.percentages[k]);aux[6]=0;
  return{seed,position:[1],actors:source.actors.flatMap(actor),aux,status:Array(14).fill(0),wakeSkip:[0,0],combo:[0,0,0,-1,0,0],context:[1,0],config:d.config,turn:[1],maxTurns:[maxTurns],outcome:[0],supported:[1],finished:[0],completedTurns:0,extraAlternate:[false],resistanceBytes:[...party,...d.resistances],appeal:[0,0,0,d.resistances[21]],effectResistances:[d.resistances[16],d.resistances[12]],preparationState:Array(10).fill(0),tension:Array(6).fill(0),weapon:[1,4,10,MONSTER319.modelFlags>>>7&15],ai:{...monsterAiInputs(MONSTER319),definitionId:[319],storedTransitionId:[0],transitionCount:[0],status9:[false,false,false,false]}};
}
export function erugi1ProfileAudit(variant=ERUGI1_PRIMARY_VARIANT){const source=erugi1Source(variant);return{
  branch:source.branch,variant,source:source.source,sourceAudit:'evidence-v2/original/monster319/profile-audit.json',monsterId:319,romName:MONSTER319.name,
  numericActors:source.actors.map((a,i)=>({id:i===0?0:192,hp:a.hp,maxHp:a.maxHp,mp:a.mp,maxMp:a.maxMp,attack:a.defaultATK,defense:a.defaultDEF,agility:a.speed,heal:a.HealPower,level:i===0?49:51})),
  levelAuthority:'Original explicit Ally_Level49/Enemy_Level51. Enemy original mons_data2 flags3763 low7=51 independently agree; current AI definition changes to751 do not replace originalMonsterId319.',
  overmaxAuthority:'Original main.cpp literal partyHP305/maxHP300 is retained, not clamped. ProcessCombatTurn recalculates six non-vital stats; whole-ROM verification must establish this declared initial state. New admission variants retain all numerical ONNX graph bytes and all individual field bounds; only the party HP<=max relation is removed.',
  rates:{partyCritical:500,partyDodge:2,partyGuard:9,enemyCritical:0,enemyDodge:4,enemyGuard:0,authority:'Unchanged original primary branch plus actual319/751 getter cohort emulation-monster319-rate-run/response.json SHA e474fe4bbd98c521f744f368cf80e2f9b0c8b60f2e475b477176478cc437eda2.'},
  definitions:[319,751].map(id=>{const m=rom.monsters.find(r=>r.id===id);return{id,raw:m.raw,scheme:m.scheme,judgment:m.judgment,turnBehavior:m.turnBehavior,actionIds:m.actions};}),
  config:decodeMonsterConfig(MONSTER319,{partyJob:1}).provenance,
  weapon:{inputs:[1,4,10,13],meaning:'Explicit weapon present, encoded lightning4, neutral species1 property1.0 and enemy species13. Raw319 lightning susceptibility125 reproduces the original post-critical1.25 numeric condition. Item identity and other weapon properties are not reconstructed.'},
  charm:{inputs:[0,0,0,0],meaning:'Actual319/751 last susceptibility byte0 disables appeal. No inferred charm inventory is required.'},
  restrictions:['One manually normal-attacking party0 and one enemy192, originalMonsterId319.','Only original319/751 AI definition changes; judgment2 decisions occur during preparation, and fixed mode2 consumes its mandatory extra-action draw.','Initial source ailments/ranks/tension are zero. Enemy161 changes tension through verified state; table transitions retain HP/MP/stats and cursors.','No party items/menu, force/metal/counter/reflection/barrier, other actor rosters or camera.','The two copied319 configurations from ganasadai1_new_arugo have distinct source behavior and do not inherit the primary-branch baseline.'],
  originalDifferences:'Original damage-triggered coup thresholds use a fixed HP310 table despite maxHP300. ROM uses actual maxHP; preserve any difference. Source and ROM death-state/coup timing remain independently compared.'
};}
