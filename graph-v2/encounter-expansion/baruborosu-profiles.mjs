// Original source literals, raw ROM attributes, and declared equipment inputs
// remain separate. The copied SUPER320 aggregate is not a318 profile.
import encounters from '../../restored/dq9-unified/data/encounters.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {ACTOR_FIELDS} from '../rules.mjs';
import {AUX_FIELDS,DEFAULT_AUX} from '../extended-rules.mjs';
import {monsterAiInputs} from './profiles.mjs';
import {decodeMonsterConfig} from './profile-records.mjs';
export const MONSTER318=rom.monsters.find(m=>m.id===318);
export const MONSTER318_DEFINITIONS=[318,750].map(id=>rom.monsters.find(m=>m.id===id));
export const BARUBOROSU_SOURCE=encounters.find(c=>c.branch==='baruborosu_new_arugo'&&c.variant==='baruborosu_gouketu'&&c.boss===318);
if(!BARUBOROSU_SOURCE)throw Error('Missing audited primary318 source');
const rates=[0,2,4,8,25],word=m=>new DataView(Uint8Array.from(m.raw.match(/../g),x=>parseInt(x,16)).buffer).getUint32(16,true);
export const MONSTER318_DODGE_RATE=rates[word(MONSTER318)>>>13&7];
export const MONSTER318_GUARD_RATE=rates[word(MONSTER318)>>>16&7];
for(const m of MONSTER318_DEFINITIONS){
  if(m.judgment!==1||(m.turnBehavior&7)!==2||rates[word(m)>>>13&7]!==4||rates[word(m)>>>16&7]!==0||(m.modelFlags&127)!==53)throw Error('Unrepresented dynamic318 attributes');
  const a=decodeMonsterConfig(m,{partyJob:1}),b=decodeMonsterConfig(MONSTER318,{partyJob:1});if(JSON.stringify([a.config,a.resistances])!==JSON.stringify([b.config,b.resistances]))throw Error('Dynamic318 resistance/config requires new state');
}
function actor(source,index){
  const a=Object.fromEntries(ACTOR_FIELDS.map(k=>[k,0]));
  for(const[k,s]of Object.entries({hp:'hp',maxHp:'maxHp',mp:'mp',maxMp:'maxMp',baseAttack:'defaultATK',baseDefense:'defaultDEF',baseAgility:'defaultSpeed'})){if(!Number.isFinite(source[s]))throw Error('Missing audited318 '+s);a[k]=source[s];}
  Object.assign(a,{party:Number(index===0),id:index===0?0:192,level:index===0?50:MONSTER318.modelFlags&127,dodgeRate:index===0?2:MONSTER318_DODGE_RATE,guardRate:index===0?9:MONSTER318_GUARD_RATE,criticalThreshold:index===0?500:0,attackRank:source.AtkBuffLevel,defenseRank:source.BuffLevel,agilityRank:source.SpeedLevel,sleep:Number(source.sleeping),paralysis:Number(source.paralysis)});return ACTOR_FIELDS.map(k=>a[k]);
}
export function makeBaruborosuRow({variant='baruborosu_gouketu',seed=[1,0,0,0,0,0,0,0],maxTurns=8}={}){
  if(variant!==BARUBOROSU_SOURCE.variant)throw Error('Unknown318 source '+variant);
  const decoded=decodeMonsterConfig(MONSTER318,{partyJob:1}),party=Array(22).fill(100),aux=[...DEFAULT_AUX];
  ['Fire','Ice','Wind','ThunderExplosion','Earth','Darkness','Light'].forEach((k,i)=>party[i]=BARUBOROSU_SOURCE.armor.percentages[k]);party[14]=75;party[18]=50;aux[AUX_FIELDS.indexOf('angerTarget')]=0;
  return{seed,position:[1],actors:BARUBOROSU_SOURCE.actors.flatMap(actor),aux,status:Array(14).fill(0),wakeSkip:[0,0],combo:[0,0,0,-1,0,0],context:[1,0],config:decoded.config,turn:[1],maxTurns:[maxTurns],outcome:[0],supported:[1],finished:[0],completedTurns:0,extraAlternate:[false],resistanceBytes:[...party,...decoded.resistances],appeal:[0,0,304,decoded.resistances[21]],effectResistances:[decoded.resistances[16],decoded.resistances[12]],preparationState:Array(10).fill(0),tension:Array(6).fill(0),weapon:[1,4,10,MONSTER318.modelFlags>>>7&15],ai:{...monsterAiInputs(MONSTER318),status9:[false,false,false,false],definitionId:[318],storedTransitionId:[0],transitionCount:[0]}};
}
export function baruborosuProfileAudit(){return{
  romId:318,name:MONSTER318.name,sourceAudit:'evidence-v2/original/monster318/profile-audit.json',sourceAuditSha256:'17f9b5815067474f901566d04b3efb6b9905c5876d930c41b942961d2f91cd91',branch:BARUBOROSU_SOURCE.branch,primaryVariant:BARUBOROSU_SOURCE.variant,source:BARUBOROSU_SOURCE.source,actors:BARUBOROSU_SOURCE.actors,armor:BARUBOROSU_SOURCE.armor,
  definitions:MONSTER318_DEFINITIONS.map(m=>({id:m.id,name:m.name,scheme:m.scheme,judgment:m.judgment,limitedSlots:m.limitedSlots,extraMode:m.turnBehavior&7,actions:m.actions,raw:m.raw})),config:decodeMonsterConfig(MONSTER318,{partyJob:1}).provenance,
  levels:{party:50,enemy:53,authority:'Original explicit Ally_Level50; original mons_data2 flags2357 low7=53. AI definition750 retains originalMonsterId318.'},
  rates:{partyDodge:2,partyGuard:9,partyCritical:500,enemyDodge:4,enemyGuard:0,authority:'Source numeric literals and original ROM rate ranks. Actual enclosing-turn confirmation is a separate proof.'},
  weapon:{inputs:[1,4,10,2],rawInitialRequirements:{partyWeaponPresent:1,partyWeaponProperty0:4<<23,partyWeaponProperty8:10,partyWeaponPropertyC:10<<6},meaning:'Declared existing lightning-element weapon. The public property is species1Tenths; other species properties are required neutral1 by the frozen kernel contract. For this species2 target, matching func02085818 reads signed low6bits at party aux+0x2fc divided by10, so the explicit initial raw property8 is10. Original target lightning resistance100 gives element multiplier1. Item identity is not reconstructed; no copied320 1.25 factor is used.',initialDomainHistory:'history/baruborosu-species2-raw-zero-v1/manifest.json'},
  charm:{inputs:[0,0,304,5],meaning:'Explicit numerical representative: effective charm304 gives base chance4.08 and original appeal byte5 gives the same bounded100 comparison class as source literal.204. Equipment identity and charm decomposition are not recovered.'},
  susceptibility:[{actionId:160,element:15,arrayIndex:14,rawBaseChance:45,byte:75,threshold:34},{actionId:560,element:19,arrayIndex:18,rawBaseChance:50,byte:50,threshold:25}],
  susceptibilityAuthority:'USA02156648 uses binary32(0.5+baseChance*resistance) then truncation for the bounded100 comparison. USA02156b38 reads stats+0x3e+element-1 divided by100. These declared bytes reproduce source threshold classes, not unique original equipment. Actual560 component/whole proofs remain separate.',
  declaredRepresentatives:{partyJob:1,partyDeftness:450,shieldGuardTenths:90,magicalMending:234,inactiveRawCounters:0,angerTargetWhenInactive:0},
  restrictions:['One manually normal-attacking party0 and original enemy318/AI definition750 with two enemy commands.','Operation34 is a persistent AI definition transition; HP/MP/stats/resistances and originalMonsterId stay in the same state.','Only six executed records1/309/15/160/560/534; no menu, items, arbitrary equipment, reflection, force or unrepresented raw effects.','Only primary GOUKETU318 from this branch. The copied SUPER320 aggregate is excluded.','Camera is outside this combat program; finite AI retry budget exhaustion remains an explicit unsupported result.']
};}
