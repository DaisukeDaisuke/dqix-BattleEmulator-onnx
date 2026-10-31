// Original source numbers and ROM records are kept as separate authorities.
import encounters from '../../restored/dq9-unified/data/encounters.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {ACTOR_FIELDS} from '../rules.mjs';
import {AUX_FIELDS,DEFAULT_AUX} from '../extended-rules.mjs';
import {monsterAiInputs} from './profiles.mjs';
import {decodeMonsterConfig} from './profile-records.mjs';

export const MONSTER308=rom.monsters.find(m=>m.id===308);
export const ANONN_SOURCE=encounters.find(c=>c.branch==='anonn_new_arugo'&&c.variant==='anonn_v6');
const map={hp:'hp',maxHp:'maxHp',mp:'mp',maxMp:'maxMp',baseAttack:'defaultATK',baseDefense:'defaultDEF',baseAgility:'defaultSpeed',attackRank:'AtkBuffLevel',defenseRank:'BuffLevel',agilityRank:'speedLevel',sleep:'sleeping',paralysis:'paralysis',poison:'PoisonEnable',acrobat:'acrobaticStar',skip:'isStunned'};
export function anonnActor(source,index){
  const party=index===0,a=Object.fromEntries(ACTOR_FIELDS.map(k=>[k,0])),proof={};
  for(const[key,field]of Object.entries(map)){if(!Number.isFinite(source[field]))throw Error('Missing original actor field '+field);a[key]=source[field];proof[key]={source:`encounters.anonn_v6.actors[${index}].${field}`,value:a[key]};}
  const cfg=ANONN_SOURCE.configuration;
  Object.assign(a,{party:Number(party),id:party?0:192,level:party?cfg.Ally_Level:cfg.Enemy_level,dodgeRate:party?2:0,guardRate:party?cfg.ShieldGuardP:0,criticalThreshold:party?cfg.OriginalPhysicalCriticalP:0,defend:0});
  for(const[key,reason]of Object.entries({party:'Explicit side mapping.',id:'Actual object IDs party0/enemy0xc0.',level:party?'Original Ally_Level21 and erusionn_lv21 compile definition.':'Original Enemy_level35; actual fixtures explicitly initialize the resolved enemy auxiliary level35.',dodgeRate:party?'Original bounded100<2; actual party base dodge2.':'Actual monster default dodge0.',guardRate:party?'Original ShieldGuardP2.5; resolved numerical rate, gear identity separate.':'Actual monster default guard0.',criticalThreshold:party?'OriginalPhysicalCriticalP500 per10000; actual deftness450 returns5%.':'Actual monster threshold0; critical draw still occurs.',defend:'Original defence1 is no guard command, ROM code0.'}))proof[key]={source:reason,value:a[key]};
  for(const key of ACTOR_FIELDS)if(!(key in proof))proof[key]={source:'Explicit initially absent represented condition; no effect is inferred from another monster profile.',value:a[key]};
  return{values:ACTOR_FIELDS.map(k=>a[k]),proof:ACTOR_FIELDS.map(name=>({name,...proof[name]}))};
}
export function makeAnonnRow({seed=[1,0,0,0,0,0,0,0],maxTurns=8,incapacityResistance=75}={}){
  if(!Number.isInteger(incapacityResistance)||incapacityResistance<0||incapacityResistance>255)throw Error('Invalid explicit incapacity resistance byte.');
  const source=ANONN_SOURCE,m=decodeMonsterConfig(MONSTER308,{partyJob:1}),party=Array(22).fill(100),order=['Fire','Ice','Wind','ThunderExplosion','Earth','Darkness','Light'];
  order.forEach((key,i)=>{party[i]=source.armor.percentages[key];});party[14]=incapacityResistance;
  const enemy=m.resistances;
  return {seed,position:[1],actors:source.actors.flatMap((a,i)=>anonnActor(a,i).values),aux:[...DEFAULT_AUX],status:Array(14).fill(0),wakeSkip:[0,0],combo:[0,0,0,-1,0,0],context:[1,0],config:m.config,turn:[1],maxTurns:[maxTurns],outcome:[0],supported:[1],finished:[0],completedTurns:0,extraAlternate:[false],
    resistanceBytes:[...party,...enemy],appeal:[0,0,210,enemy[21]],effectResistances:[enemy[16],enemy[12]],preparationState:Array(10).fill(0),ai:{...monsterAiInputs(MONSTER308),status9:[false,false,false,false]}};
}
export function anonnProfileAudit(){const source=ANONN_SOURCE,row=makeAnonnRow();return{
  variant:source.variant,branch:source.branch,sourceCommit:source.source.commit,sourceHashes:source.source,defines:source.defines,actorFields:source.actors.map((a,i)=>anonnActor(a,i).proof),config:decodeMonsterConfig(MONSTER308,{partyJob:1}).provenance,
  initialAux:AUX_FIELDS.map((name,i)=>({name,value:DEFAULT_AUX[i],source:name==='angerTarget'?'Explicit inactive target sentinel.':'Explicit inactive initial ROM condition; old inactive -1 timers project to zero inactive counters.'})),
  resistanceBytes:row.resistanceBytes.map((value,i)=>({actor:Math.floor(i/22),index:i%22,value,source:i>=22?'Original monster308 raw0x6c..0x81, all22 bytes.':i<7?'Original equipment aggregate armor.percentages in ROM element order.':i===14?'Explicit numerical representative of original WAR_CRY bounded100<34. Actual threshold=floor(F(.5+F(45*F(75/100))))=34. Mental equipment identity is not recovered.':'Explicit default100 for unused primary/physical coefficients; not recovered gear properties.'})),
  appeal:{input:row.appeal,originalLiteral:source.configuration.mitoreP,meaning:'Explicit10-bit current0/base0/equipment210 numerical representative, stable under actual whole-turn current-stat recomputation from base. ROM computes a binary32 threshold around.22 and compares against integer bounded100; original also uses integer bounded100. Component gear/charm RAM is not reconstructed. The earlier current210/base0/equipment0 draft is archived as an invalid intended-positive-chance representative.'},
  stateProjection:'Persistent skipKind and3b bit1/3c bit6 are carried in preparationState. A pending action160 skip may cross a turn and is handled by the next preparation/post sequence.',
  restrictions:['One manually normal-attacking party and one original308, all six actual AI slots.','No source menu healing/items/weapon switching; initial equippedATK205 retained.','No mental-immunity/barriers/reflection, weaponproc effects, tension or added actors.','Only type1 appeal effects; actual308 effect2/3 susceptibility bytes are0.','Combat camera remains an explicit outer phase.','All input seeds are retained; unsupported states are reported, never filtered.']};}
