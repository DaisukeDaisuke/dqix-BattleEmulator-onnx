// Encounter differences are input data. This module never selects a program.
import rom from '../restored/dq9-unified/data/rom.mjs';
import encounters from '../restored/dq9-unified/data/encounters.mjs';
import hitTables from '../restored/dq9-unified/data/hit-tables.mjs';
import {ACTOR_FIELDS} from '../graph-v2/rules.mjs';
import {ACTION_STATUSES} from '../graph-v2/extended-rules.mjs';
import {INPUT_PRESETS} from './battle-presets.mjs';

const readRaw=record=>new DataView(Uint8Array.from(record.raw.match(/../g),x=>parseInt(x,16)).buffer);
const firstById=records=>Object.fromEntries(records.map(r=>[r.id,r]));
export const ACTION_DEFINITIONS=Object.fromEntries(Object.entries(firstById(rom.actions)).map(([id,a])=>{
  const v=readRaw(a),w14=v.getUint32(20,true),w1c=v.getUint32(28,true),w2c=v.getUint32(44,true);
  return[id,{id:a.id,name:a.name,operation:a.operation,selector:a.selector,mpCost:a.mpCost,damageId:a.damageId,
    parameter:v.getInt16(48,true),secondaryParameter:v.getInt16(50,true),
    targetSide:(a.w08>>>8)&3,targetScope:w14>>>28,repeatCode:(w1c>>>14)&31,
    smartTarget:v.getUint16(12,true),wiseTarget:v.getUint16(14,true),
    spell:!!(a.w10&1),ability:!!(a.w10&2),coverAllowed:!!(a.w10&0x1000),magicReflectable:!!(a.w10&0x400),breathReflectable:!!(a.w10&4),counterAllowed:!!(a.w10&0x80),prepaid:!!(a.w08&0x10000000),planningCategory:(a.w18>>>12)&15,category:(w1c>>>19)&31,priority:(w2c>>>14)&63,weaponFirstEligible:!!(a.w10&0x80000),
    damageElement:(a.w08>>>22)&31,effectElement:(a.w18>>>27)&31,
    combo:!!(w2c&(1<<27)),raw:a.raw}];
}));
export const MONSTER_DEFINITIONS=Object.fromEntries(rom.monsters.map(m=>{
  const v=readRaw(m),anger=v.getUint32(36,true),pairs=[{trigger:anger&127,chance:(anger>>>7)&127},{trigger:(anger>>>14)&127,chance:(anger>>>21)&127}];
  const chance=t=>pairs.find(p=>p.trigger===t)?.chance??0;
  return[m.id,{id:m.id,name:m.name,hp:m.hp,mp:m.mp,attack:m.attack,defense:m.defense,agility:m.agility,
    scheme:m.scheme,judgment:m.judgment,actions:[...m.actions],limitedSlots:m.limitedSlots,
    extraActionMode:m.turnBehavior&7,flags:m.flags,model:m.model,modelFlags:m.modelFlags,radiusSource:m.radiusSource,
    level:m.modelFlags&127,species:(m.modelFlags>>>7)&15,metal:!!(m.modelFlags&0x1000),otherAngerChances:[chance(19),chance(20)],
    dodgeRate:hitTables.guardDodgeRates[(m.flags>>>13)&7]??0,guardRate:hitTables.guardDodgeRates[(m.flags>>>16)&7]??0,
    resistances:[...m.resistances],config:[0,chance(24),chance(3),chance(4),v.getUint8(40),v.getUint8(41),Number(m.resistances[21]!==0)]}];
}));
export const BATTLE_DEFINITIONS={schema:'dq9-common-definitions-v1',romSha256:rom.romSha256,actions:ACTION_DEFINITIONS,monsters:MONSTER_DEFINITIONS,
  population:{partySlots:4,enemySlots:8,enemyGroups:3,authority:'Matching Combatant lookup and source roster enumeration; these are ROM object limits, not a battle action limit.'}};

const snapshots=new Map(Object.values(INPUT_PRESETS).flatMap(p=>p.presets??[]).map(p=>[p.id,p.inputs]));
const index=Object.fromEntries(ACTOR_FIELDS.map((name,i)=>[name,i]));
const vec=a=>ACTOR_FIELDS.map(k=>a[k]??0);
const levelFrom=source=>{
  const c=source.configuration??{};
  for(const k of ['Ally_Level','AllyLevel','ALLY_LEVEL','Level','level'])if(Number.isInteger(c[k]))return c[k];
  for(const d of source.defines??[]){const m=d.name.match(/(?:^BattleEmulatorLV|(?:^|_)lv)(\d+)(?:_|$)/i);if(m)return Number(m[1]);}
  const m=source.variant.match(/(?:^|_)lv(\d+)(?:_|$)/i);return m?Number(m[1]):null;
};
const zeroAux=()=>[0,0,0,0,0,0,-1,...Array(14).fill(0)];
function sourceActor(source,old,actorIndex,monsterId,snapshot){
  const party=actorIndex===0,monster=MONSTER_DEFINITIONS[monsterId],c=source.configuration??{};
  const legacy=snapshot?.actors?.slice(actorIndex*33,(actorIndex+1)*33),level=party?levelFrom(source):(old.battleLevel??monster.level);
  const guard=party?(c.shieldGuardP??c.ShieldGuardP??c.OriginalGuardP??0):monster.guardRate;
  const a=legacy?.length===33?[...legacy]:vec({hp:old.hp??monster?.hp,maxHp:old.maxHp??monster?.hp,mp:old.mp??monster?.mp,maxMp:old.maxMp??monster?.mp,
    baseAttack:old.defaultATK??old.atk??monster?.attack,baseDefense:old.defaultDEF??old.def??monster?.defense,baseAgility:old.defaultSpeed??old.speed??monster?.agility,
    attackRank:old.AtkBuffLevel??old.AttackLevel??0,defenseRank:old.BuffLevel??0,agilityRank:old.speedLevel??0,blind:old.blind??0,sleep:old.sleeping??0,confusion:old.confused??old.confusion??0,
    paralysis:old.paralysis??0,skip:old.turnSkipped??0,defend:old.defence===.5?1:old.defence===.1?3:0,acrobat:old.acrobaticStar??0,
    party:Number(party),dodgeRate:party?(c.mikawasiP??c.dodgeP??2):monster.dodgeRate,guardRate:guard,criticalThreshold:party?(c.OriginalPhysicalCriticalP??c.kaisinnP??500):0,
    hpRegen:old.ReHeal??0,hpDuration:old.ReHealTurns??0,hpRecovery:0,mpRegen:old.MPRegen??0,mpDuration:0,mpRecovery:0,
    poison:old.PoisonEnable??0,level:level??0,hpEquipmentRegen:old.equipmentHPRecovery??0,id:party?0:191+actorIndex});
  const actorId=party?0:191+actorIndex;a[index.id]=actorId;a[index.party]=Number(party);
  const aux=zeroAux(),oldAux=snapshot?.aux;
  if(oldAux){
    if(party)aux.splice(0,3,...oldAux.slice(0,3));else aux.splice(3,4,...oldAux.slice(3,7));
    for(let i=0;i<ACTION_STATUSES.length*2;i++)aux[7+i]=oldAux[7+actorIndex*14+i]??0;
  }else{
    aux[0]=old.specialCharge??0;aux[1]=old.specialChargeTurn??0;aux[2]=old.dirtySpecialCharge??0;
    aux[3]=old.rage??0;aux[4]=old.rageTurn??0;
  }
  const resistances=snapshot?.resistanceBytes?.slice(actorIndex*22,(actorIndex+1)*22)??(party?Array(22).fill(100):[...monster.resistances]);
  if(party&&!snapshot?.resistanceBytes){const p=source.armor?.percentages??{};for(const [i,key]of ['Fire','Ice','Wind','ThunderExplosion','Earth','Darkness','Light'].entries())if(p[key]!==undefined)resistances[i]=p[key];}
  if(party)for(let i=0;i<22;i++){const replacement=c['OriginalResistanceByte'+(0x3e+i)];if(replacement!==undefined)resistances[i]=replacement;}
  const state={actorId,group:party?-1:Math.min(actorIndex-1,2),present:true,roster:true,dead:false,excluded:false,
    definitionId:party?null:monsterId,originalMonsterId:party?null:monsterId,species:party?0:monster.species,metal:party?false:monster.metal,actor:a,aux,
    status:snapshot?.status?.slice(actorIndex*7,(actorIndex+1)*7)??[old.PoisonEnable?1:0,0,0,Math.max(0,old.sleepingTurn??0),0,0,0],
    wakeSkip:snapshot?.wakeSkip?.[actorIndex]??0,tension:snapshot?.tension?.slice(actorIndex*3,(actorIndex+1)*3)??[old.TensionLevel??0,0,0],
    config:party?[source.coup?.afterActionChance??1,0,0,0,0,0,0]:[...monster.config],resistances,
    weapon:party?(snapshot?.weapon??[Number(source.equipmentPolicy?.enabled??false),c.OriginalWeaponElement??0,10,13]):[0,0,0,0],
    charm:party?(snapshot?.appeal?.slice(0,3)??[0,0,0]):[0,0,0],
    ai:{cursor:0,alternate:false,storedTransitionId:0,previousTargets:[-1,0,0,0,0,0,0,0],previousTargetCount:0},
    rawStatus:0,rawFlags:0,rawRanks:Array(10).fill(0),rawTimers:Array(10).fill(0),auxiliaryBytes:Array(9).fill(0),magic:[0,old.HealPower??0],
    preparation:snapshot?.preparationState?.slice(actorIndex*5,(actorIndex+1)*5)??Array(5).fill(0),
    inventory:party?structuredClone(source.inventory??{}):{},commands:party?[{actionId:1,target:192}]:[]};
  state.initialAuthority={source:source.source,branch:source.branch,variant:source.variant,numericPreset:!!legacy,
    level:legacy?'published input definition':level===null?'explicit representative 0; supply a known level for level-dependent behavior':'original configuration',
    equipment:'Decoded numerical inputs; no inventory of equipped items is inferred.'};
  return state;
}
export const ENCOUNTER_DEFINITIONS=encounters.map((source,i)=>{
  const id=source.branch+'__'+source.variant,candidate=snapshots.get(source.variant),enemyIds=source.enemyIds??[source.boss];
  // A repeated legacy variant name must never import another enemy's state.
  const snapshot=candidate&&candidate.actors[34]===(source.actors[1].maxHp??MONSTER_DEFINITIONS[enemyIds[0]].hp)?candidate:undefined;
  const groupIds=[...new Set(enemyIds)];
  return{id,titleJa:(MONSTER_DEFINITIONS[source.boss]?.name??String(source.boss))+' / '+source.variant,
    sourceIndex:i,definitionIds:[...enemyIds],actors:source.actors.map((old,j)=>({...sourceActor(source,old,j,j?enemyIds[j-1]:null,snapshot),group:j?groupIds.indexOf(enemyIds[j-1]):-1})),
    inputNotes:['Original initial values are data, not a claim that every effect and camera sequence is verified.'],
    camera:structuredClone(source.camera??{})};
});

export function seedBytes(value=1n){
  if(Array.isArray(value)){if(value.length!==8||value.some(x=>!Number.isInteger(x)||x<0||x>255))throw Error('seed must contain eight byte limbs');return [...value];}
  if(typeof value==='number'&&!Number.isSafeInteger(value))throw Error('Use a decimal/hex string for a seed outside JavaScript safe integers');
  let n=typeof value==='bigint'?value:typeof value==='string'?BigInt(value):BigInt(value);
  if(n<0n||n>0xffffffffffffffffn)throw Error('seed outside uint64');
  return Array.from({length:8},(_,i)=>Number((n>>BigInt(i*8))&255n));
}
export function makeEncounterInput(id,{seed=1n,position=1,overrides={}}={}){
  const encounter=typeof id==='object'?id:ENCOUNTER_DEFINITIONS.find(e=>e.id===id);
  if(!encounter)throw Error('Unknown encounter input '+id);
  const row={schema:'dq9-common-battle-state-v1',encounterId:encounter.id,seed:seedBytes(seed),position,turn:1,completedTurns:0,
    firstTurn:true,surprise:0,actors:structuredClone(encounter.actors),groups:Array.from({length:3},()=>({cursor:0,usedSlots:Array(6).fill(false)})),
    combo:[0,0,0,-1,0,0],context:[1,0],outcome:0,finished:false,supported:true,
    camera:{mode:'pending-input',row4Words:[],records:[],state:null},pendingCommands:[],nowstate:[],...structuredClone(overrides)};
  return row;
}
