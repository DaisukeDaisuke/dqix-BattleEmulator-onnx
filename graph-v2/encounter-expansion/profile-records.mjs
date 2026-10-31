// Initial profile fields come from named source records. Do not inherit a
// different monster's literal defaults merely because the tensor ABI matches.
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {makeBurudogaRow,MONSTER300} from './profiles.mjs';

const bytes=monster=>Uint8Array.from(monster.raw.match(/../g),x=>parseInt(x,16));
export function decodeMonsterConfig(monster,{partyJob=1}={}){
  const b=bytes(monster),v=new DataView(b.buffer),packed=v.getUint32(0x24,true),rules=[{trigger:packed&127,chance:packed>>>7&127},{trigger:packed>>>14&127,chance:packed>>>21&127}];
  const chance=trigger=>rules.find(r=>r.trigger===trigger)?.chance??0;
  // Actual JPN02183e40 job chance table, verified in the action-caller audit.
  const coupByJob=[0,1,1,1,2,1,1,1,1,1,1,2,2];
  if(!Number.isInteger(partyJob)||partyJob<0||partyJob>=coupByJob.length)throw Error('Unknown explicit party job.');
  const resistances=Array.from(b.slice(0x6c,0x82));
  if(JSON.stringify(resistances)!==JSON.stringify(monster.resistances))throw Error('ROM decoded22-byte resistance list disagrees with raw record.');
  return{config:[coupByJob[partyJob],chance(24),chance(3),chance(4),b[0x28],b[0x29],Number(resistances[21]!==0)],resistances,
    provenance:{monsterId:monster.id,raw:monster.raw,partyJob,fields:[
      {name:'coupAfterActionChance',value:coupByJob[partyJob],source:'Actual ROM JPN02183e40 job table; explicit partyJob input, not a monster field.'},
      ...[[24,'angerCriticalChance'],[3,'angerHalfChance'],[4,'angerQuarterChance']].map(([trigger,name])=>({name,value:chance(trigger),source:'Monster raw word0x24; first matching7-bit trigger/chance pair.',trigger,rules})),
      {name:'angerMin',value:b[0x28],source:'Monster raw byte0x28.'},{name:'angerMax',value:b[0x29],source:'Monster raw byte0x29.'},
      {name:'enemyAppealGate',value:Number(resistances[21]!==0),source:'Monster raw byte0x81 / resistance[21], copied by actual initializer to currentStats+0x53.',rawValue:resistances[21]}
    ],resistanceInitialization:'All22 bytes at raw0x6c..0x81 map to currentStats0x3e..0x53. The prior21-byte fixture initializer omitted the appeal byte; its explicit zero-input proofs are historical only.'}};
}

export function makeBurudogaAppealRow(options={}){
  const row=makeBurudogaRow(options),decoded=decodeMonsterConfig(MONSTER300,{partyJob:1}),r=decoded.resistances;
  row.config=decoded.config;
  // Five action-kernel percentages: defense debuff, agility debuff, sleep,
  // poison and selected physical/earth damage. Both actual damage entries are100.
  if(r[4]!==r[7])throw Error('The fixed two-effect schedule needs equal earth and physical resistance.');
  row.resistancesByActor=[100,100,100,100,100,r[18],r[19],r[9],r[15],r[7]];
  // Explicit numerical representative: no charm buff or charm-bearing gear.
  // The source omits charm entirely and unconditionally consumes the failed
  // appeal draw. effectiveCharm<=100 is a proven behavioral class, not an
  // inferred exact equipment configuration. Successful appeal is not supported.
  row.appeal=[0,0,0,r[21]];
  return row;
}

export const BURUDOGA_APPEAL_PROVENANCE={
  ...decodeMonsterConfig(MONSTER300).provenance,
  appealFields:['partyCurrentCharm','partyBaseCharm','partyEquipmentCharm','enemyAppealResistance'],
  charm:'The original branch has no charm member or successful-appeal path. Zero current/base/equipment charm is an explicit numerical representative of current-base+equipment<=100, which guarantees no successful appeal for every seed. It is not a recovered equipment inventory.',
  defaults:[0,0,0,MONSTER300.resistances[21]],
  historical:'burudoga-resident-program.json is kept unchanged as an explicit appealResistance0 control. Use burudoga-appeal-resident-program.json for the actual monster300 resistance10 profile.'
};

export function auditMonsterConfig(id){const monster=rom.monsters.find(m=>m.id===id);if(!monster)throw Error('Unknown monster');return decodeMonsterConfig(monster);}
