import encounters from '../../restored/dq9-unified/data/encounters.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {ACTOR_FIELDS} from '../rules.mjs';
import {AUX_FIELDS,DEFAULT_AUX} from '../extended-rules.mjs';
import {monsterAiInputs} from './profiles.mjs';
import {decodeMonsterConfig} from './profile-records.mjs';
export const MONSTER305=rom.monsters.find(x=>x.id===305);
export const NUSHI_SOURCES=encounters.filter(x=>x.branch==='nusisama1_v2_new_arugo');
const direct={hp:'hp',maxHp:'maxHp',mp:'mp',maxMp:'maxMp',baseAttack:'defaultATK',baseDefense:'defaultDEF',baseAgility:'defaultSpeed',attackRank:'AtkBuffLevel',defenseRank:'BuffLevel',agilityRank:'speedLevel',sleep:'sleeping',paralysis:'paralysis',poison:'PoisonEnable',acrobat:'acrobaticStar'};
export function nushiActor(source,index,profile){
  const party=index===0,values=Object.fromEntries(ACTOR_FIELDS.map(key=>[key,0])),proof={};
  for(const[key,old]of Object.entries(direct)){if(!Number.isFinite(source[old]))throw Error(`Missing source field ${old}`);values[key]=source[old];proof[key]={source:`actors[${index}].${old}`,value:source[old]};}
  const compiled=profile.defines.map(x=>/^lv(\d+)_/.exec(x.name)).find(Boolean);if(!compiled)throw Error('No explicit compile-profile level');
  Object.assign(values,{level:party?Number(compiled[1]):0,party:Number(party),id:party?0:192,dodgeRate:party?2:0,guardRate:party?profile.configuration.ShieldGuardP:0,criticalThreshold:party?profile.configuration.kaisinnP:0,defend:0});
  Object.assign(proof,{level:{source:party?'CMake compile-definition '+profile.defines.find(x=>/^lv\d+_/.test(x.name)).name:'Explicit enemy level0; no enemy level-dependent regeneration/tension/coup is represented.',value:values.level},
    guardRate:{source:party?'Original configuration.ShieldGuardP; explicit resolved numerical rate, not an inferred equipment item.':'Actual monster caller guard return0.',value:values.guardRate},
    criticalThreshold:{source:party?'Original configuration.kaisinnP per10000; actual caller deftness450 gives the same5% threshold.':'Actual monster caller critical threshold0.',value:values.criticalThreshold},
    dodgeRate:{source:party?'Original normal/sweep callAttackFun bounded100<2; actual base party dodge2.':'Actual monster caller dodge return0.',value:values.dodgeRate},
    defend:{source:'Original initial defence=1.0 (no defense command) corresponds to ROM defend code0.',value:0},party:{source:'Decoded side flag, first actor is party.',value:values.party},id:{source:'Actual ROM object ID mapping party0/enemy0xc0.',value:values.id}});
  if(source.defence!==1)throw Error('Only the original initial unguarded profile is audited here.');
  for(const key of ACTOR_FIELDS)if(!(key in proof))proof[key]={source:'Explicit initial inactive/absent-state restriction: no blind/confusion/skip, no double-dodge/guard, no HP/MP/equipment regeneration. These zeros are not inferred from a different monster profile.',value:0};
  return{values:ACTOR_FIELDS.map(k=>values[k]),proof:ACTOR_FIELDS.map(name=>({name,...proof[name]}))};
}
export function makeNushiRow({variant='nusisama1_v6_tamahane',seed=[1,0,0,0,0,0,0,0],maxTurns=8}={}){
  const source=NUSHI_SOURCES.find(x=>x.variant===variant);if(!source)throw Error('Unknown original Nushi profile');
  const m=decodeMonsterConfig(MONSTER305,{partyJob:1}),r=m.resistances;
  return{seed,position:[1],actors:source.actors.flatMap((a,i)=>nushiActor(a,i,source).values),aux:[...DEFAULT_AUX],config:m.config,status:Array(14).fill(0),wakeSkip:[0,0],combo:[0,0,0,-1,0,0],context:[1,0],turn:[1],maxTurns:[maxTurns],outcome:[0],supported:[1],finished:[0],completedTurns:0,extraAlternate:[false],
    resistancesByActor:[100,100,100,100,100,r[18],r[19],r[9],r[15],r[7]],
    appeal:[0,0,102,r[21]],effectResistances:[r[16],r[12]],preparationState:Array(10).fill(0),ai:monsterAiInputs(MONSTER305)};
}
export function nushiProfileAudit(){return NUSHI_SOURCES.map(source=>({variant:source.variant,sourceCommit:source.source.commit,sourceHashes:source.source,defines:source.defines,
  actorFields:source.actors.map((a,i)=>nushiActor(a,i,source).proof),config:decodeMonsterConfig(MONSTER305,{partyJob:1}).provenance,
  initialAux:AUX_FIELDS.map((name,i)=>({name,value:DEFAULT_AUX[i],source:name==='angerTarget'?'Explicit no-target sentinel-1; no original Player target-ID field.':'Explicit inactive initial ROM state. Original specialCharge/rage/AtkBuffLevel/BuffLevel/speedLevel/acrobaticStar and primary statuses are0; original inactive timers-1 map to no active ROM timer0.'})),
  appeal:{originalLiteralChance:source.configuration.mitoreP,originalReferenceResistance:source.configuration.OriginalAppealReferenceResistance,originalBaseChance:source.configuration.OriginalAppealBaseChance,
    input:[0,0,102,MONSTER305.resistances[21]],meaning:'Explicit effectiveCharm102 representative yields positive binary32 chance strictly between0 and1. The original literal0.0020 is compared against integer bounded100, not a continuous uniform fraction. No exact charm equipment decomposition is recovered from this source; [current0,base0,equipment102] is a declared numerical representative.',
    successRequired:true,secondStageTable:'Actual JPN02183b58 weights90/5/5; actual monster305 second/third effect resistance bytes are0, so only the first effect can be applied.'},
  mpOverride:{original:source.actors[1].mp,romRecord:MONSTER305.mp,reason:'The unchanged original profile deliberately supplies enemyMP255/max255 while ROM record has32. This is an explicit initial numerical override, not a claim about the unmodified encounter initialization.'},
  restrictions:['Party normal command only, no items/spells/skills from the source menu.','No elemental/species/equipment attack modifiers or weapon proc effects.','Charm102 is explicit; success must be implemented and verified, not suppressed.','Enemy HP1256/ATK110/DEF90/AGI36/AI/all22resistances/anger bytes are raw ROM-derived.','Camera is outside the combat program.']}));}
