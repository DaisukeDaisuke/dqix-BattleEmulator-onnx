import encounters from '../../restored/dq9-unified/data/encounters.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {ACTOR_FIELDS} from '../rules.mjs';
import {DEFAULT_AUX} from '../extended-rules.mjs';

export const MONSTER300=rom.monsters.find(x=>x.id===300);
export const BURUDOGA_SOURCES=encounters.filter(x=>x.branch==='burudoga_v9_new_arugo');
export const PROFILE_LIMITS={
  level:'The original branch has no level member or compile level. The default9 is an explicitly declared representative of the ROM below-level10 coup-ineligible domain, not a recovered original level. No regeneration or other represented level-dependent effect is active. Initial level0..9 has the same represented behavior.',
  shield:'The no_tate original has no shield. The tate branch does not implement a shield success test; therefore its guard rate is not inferable from the original. The initial no_tate profile is the complete comparison target. Optional tate numerical inputs require an explicitly supplied ROM guard rate and are not silently promoted to an equipment-exact profile.',
  command:'Party uses normal action1, not the full legacy menu/items. The real monster300 AI chooses between1/546 and has one action with the mandatory extra-action helper draw. Camera remains an explicit external phase.'
};
const baseActor=(old,party,{partyLevel,partyGuard})=>{
  const a=Object.fromEntries(ACTOR_FIELDS.map(key=>[key,0]));
  Object.assign(a,{hp:old.hp,maxHp:old.maxHp,mp:old.mp,maxMp:old.maxMp,baseAttack:old.atk,baseDefense:old.def,baseAgility:old.speed,party:Number(party),id:party?0:192,
    level:party?partyLevel:0,dodgeRate:party?2:0,guardRate:party?partyGuard:0,criticalThreshold:party?200:0});
  return ACTOR_FIELDS.map(key=>a[key]);
};
export function monsterAiInputs(monster){
  const byAction=new Map(rom.actions.map(x=>[x.id,x])),records=monster.actions.map(id=>byAction.get(id)),view=record=>new DataView(Uint8Array.from(record.raw.match(/../g),x=>parseInt(x,16)).buffer);
  return{scheme:[monster.scheme],judgment:[monster.judgment],mp:[monster.mp],actionIds:monster.actions,mpCosts:records.map(x=>x.mpCost),operations:records.map(x=>x.operation),spell:records.map(x=>!!(x.w10&1)),ability:records.map(x=>!!(x.w10&2)),limited:records.map((_,i)=>!!(monster.limitedSlots&(1<<i))),
    smartTarget:records.map(x=>view(x).getUint16(12,true)),wiseTarget:records.map(x=>view(x).getUint16(14,true)),targetSide:records.map(x=>(x.w08>>>8)&3),targetScope:records.map(x=>view(x).getUint32(20,true)>>>28),repeatCode:records.map(x=>(view(x).getUint32(28,true)>>>14)&31)};
}
export function makeBurudogaRow({variant='burudoga_v9_no_tate',seed=[1,0,0,0,0,0,0,0],maxTurns=8,partyLevel=9,partyGuard}={}){
  const source=BURUDOGA_SOURCES.find(x=>x.variant===variant);if(!source)throw Error(`Unknown original profile ${variant}`);
  if(!Number.isInteger(partyLevel)||partyLevel<0||partyLevel>9)throw Error('This initial profile requires the explicit coup-ineligible level0..9 contract.');
  if(partyGuard===undefined){if(variant!=='burudoga_v9_no_tate')throw Error('The tate source does not identify an exact ROM shield guard rate; supply it explicitly.');partyGuard=0;}
  if(!Number.isFinite(partyGuard)||partyGuard<0||partyGuard>100)throw Error('Invalid party guard rate.');
  return{seed,position:[1],actors:source.actors.flatMap((a,i)=>baseActor(a,i===0,{partyLevel,partyGuard})),aux:[...DEFAULT_AUX],config:[1,0,0,0,2,4,0],status:Array(14).fill(0),wakeSkip:[0,0],combo:[0,0,0,-1,0,0],context:[1,0],turn:[1],maxTurns:[maxTurns],outcome:[0],supported:[1],finished:[0],completedTurns:0,extraAlternate:[false],resistancesByActor:Array(10).fill(100),ai:monsterAiInputs(MONSTER300)};
}
