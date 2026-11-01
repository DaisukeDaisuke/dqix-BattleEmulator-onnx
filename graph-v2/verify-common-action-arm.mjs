import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {ACTOR_FIELDS,commonAuxDefault} from './common-battle-schema.mjs';
import {ACTION_STATUSES} from './extended-rules.mjs';
import {COMMON_RAW_TIMER_OFFSETS} from './common-modifier-rules.mjs';
import {COMMON_ACTION_RULES} from './build-common-action.mjs';
import {createCommonActionFixtureRunner} from './verify-common-action-fixtures.mjs';
import rom from '../restored/dq9-unified/data/rom.mjs';

// This optional verifier projects explicit initial caller cases and final ROM
// memory separately. No expected state or trace intermediate initializes a
// graph. It deliberately requires a single supplied target and live actors.
const rules=new Map(COMMON_ACTION_RULES.map(rule=>[rule.id,rule]));
const seedBytes=value=>Array.from({length:8},(_,i)=>Number(BigInt(value)>>BigInt(i*8)&255n));
const initialStats=(a={})=>{
  const b=Buffer.alloc(0xb0);
  for(const[key,offset,fallback]of[['hp',0,100],['mp',2,10],['maxHp',4,100],['maxMp',6,100],['attack',8,82],['defense',10,68],['agility',12,0]])b.writeUInt16LE(a[key]??fallback,offset);
  b.writeUInt32LE(((a.status??0)|((a.hp??100)===0?1:0)|(a.poison?2:0)|(a.hpRegen?0x80000000:0)|(a.mpRegen?0x40000000:0))>>>0,0x14);b.writeUInt32LE(a.flags18??0,0x18);b[0x21]=a.defend??0;b.writeUInt16LE(a.poisonKind??(a.poison?2:0),0x22);b.writeUInt32LE(a.ranksPacked??0,0x58);
  for(const[key,offset]of[['mpDuration',0x68],['hpDuration',0x69],['mpRecovery',0x8b],['hpRecovery',0x8c],['chargeBlock',0x3a],['chargeByte',0x3b],['angerDuration',0x7e],['angerRecovery',0xa1]])b[offset]=a[key]??0;
  // initializeNormalAction leaves history zero unless statBytes supplies it;
  // smart-target fixtures use a different initializer with -1 defaults.
  b.writeInt16LE(a.angerTarget??0,0x2e);
  // The original private initializer fills21 bytes, leaving appeal element22
  // at its explicitly zeroed initial value unless the case supplies it.
  for(let i=0;i<22;i++)b[0x3e+i]=a.resistances?.[i]??(i===21?0:100);
  for(const[offset,value]of Object.entries(a.statBytes??{}))b[Number(offset)]=value;return b;
};
export function actorFromStats(before,b){
  const a={...before},flags=b.readUInt32LE(0x14),flags18=b.readUInt32LE(0x18),ranks=b.readUInt32LE(0x58);
  Object.assign(a,{hp:b.readUInt16LE(0),mp:b.readUInt16LE(2),maxHp:b.readUInt16LE(4),maxMp:b.readUInt16LE(6),defend:b[0x21],hpDuration:b[0x69],mpDuration:b[0x68],hpRecovery:b[0x8c],mpRecovery:b[0x8b]});
  for(const[key,mask]of[['paralysis',8],['sleep',16],['confusion',32],['blind',64],['skip',0x80000],['doubleDodge',0x2000000],['hpRegen',0x80000000],['mpRegen',0x40000000]])a[key]=Number(!!(flags&mask));
  a.poison=Number(!!(flags&2)&&(b.readUInt16LE(0x22)&3)===2);a.acrobat=Number(!!(flags18&0x400));a.doubleGuard=Number(!!(flags18&1));
  for(const[i,key]of['attackRank','defenseRank','agilityRank'].entries()){const value=ranks>>3*i&7;a[key]=value<4?value:value-8;}return a;
}
const actorRows=actors=>actors.flatMap(actor=>ACTOR_FIELDS.map(key=>actor[key]));
export function projectedActor(b){
  const aux=commonAuxDefault();aux.splice(0,7,b[0x3b]>>3&1,b[0x3b]>>4,b[0x3a],b.readUInt32LE(0x18)>>12&1,b[0x7e],b[0xa1],b.readInt16LE(0x2e));aux.splice(7,14,...ACTION_STATUSES.flatMap(status=>[b[status.durationOffset],b[status.recoveryOffset]]));
  const kinds=b.readUInt16LE(0x22),ranks=b.readUInt32LE(0x58);
  return{aux,status:[kinds&3,b[0x5c],b[0x7f],b[0x5d],b[0x80],b[0x5e],b[0x81]],wakeSkip:b[0x3b]&1,tension:[b[0x24],b[0x16]>>7&1,b[0x17]&1],preparation:[kinds>>12&3,b.readInt16LE(0x28),kinds>>2&15,b[0x3b]>>1&1,b[0x3c]>>6&1],history:[b.readInt16LE(0x32),b.readInt16LE(0x34)],state3c:b[0x3c],resistances:Array.from(b.subarray(0x3e,0x54)),rawStatusBytes:Array.from(b.subarray(0x14,0x18)),rawFlagsBytes:Array.from(b.subarray(0x18,0x1c)),statusKindsBytes:Array.from(b.subarray(0x22,0x24)),rawRanks:Array.from({length:10},(_,i)=>{const value=ranks>>>3*i&7;return value<4?value:value-8;}),rawTimers:COMMON_RAW_TIMER_OFFSETS.map(offset=>b[offset])};
}
function projectedState(buffers){
  const aux=buffers.map(b=>{const row=commonAuxDefault();row.splice(0,7,b[0x3b]>>3&1,b[0x3b]>>4,b[0x3a],b.readUInt32LE(0x18)>>12&1,b[0x7e],b[0xa1],b.readInt16LE(0x2e));row.splice(7,14,...ACTION_STATUSES.flatMap(status=>[b[status.durationOffset],b[status.recoveryOffset]]));return row;});
  return{aux:[...aux[0].slice(0,3),...aux[1].slice(3,7),...aux[0].slice(7),...aux[1].slice(7)],status:buffers.flatMap(b=>[b[0x22]&3,b[0x5c],b[0x7f],b[0x5d],b[0x80],b[0x5e],b[0x81]]),wakeSkip:buffers.map(b=>b[0x3b]&1),tension:buffers.flatMap(b=>[b[0x24],b[0x16]>>7&1,b[0x17]&1]),preparationState:buffers.flatMap(b=>{const kinds=b.readUInt16LE(0x22);return[kinds>>12&3,b.readInt16LE(0x28),kinds>>2&15,b[0x3b]>>1&1,b[0x3c]>>6&1];}),history:buffers.flatMap(b=>[b.readInt16LE(0x32),b.readInt16LE(0x34)]),state3c:buffers.map(b=>b[0x3c]),resistances22:buffers.flatMap(b=>Array.from(b.subarray(0x3e,0x54)))};
}
export function commonArmActionInput(c){
  if(c.kind!=='normal_action'||c.actors?.length!==2||(c.inputTargetCount??c.targetCount??1)!==1)throw Error('Not a supplied single-target caller case: '+c.id);
  const rule=rules.get(c.actionId);if(!rule||rule.raw!==c.actionRaw)throw Error('Action bytes differ from original table: '+c.id);
  const buffers=c.actors.map(initialStats),actors=buffers.map((b,i)=>{const raw=c.actors[i],a=Object.fromEntries(ACTOR_FIELDS.map(key=>[key,0]));Object.assign(a,{baseAttack:raw.baseAttack??raw.attack??82,baseDefense:raw.baseDefense??raw.defense??68,baseAgility:raw.baseAgility??raw.agility??0,level:raw.level??9,party:Number(i===0),id:i===0?0:192,guardRate:i===0?(c.partyShieldGuardTenths??0)/10:0,dodgeRate:i===0?2:0});return actorFromStats(a,b);});
  // The harness writes PARTY_DATA+4 as a packed word; original02158444
  // reads only its low10 bits for deftness, independently of adjacent stats.
  const signed=(((c.deftness??0)&1023)-150)<<16>>16;actors[0].criticalThreshold=Math.floor(Math.fround(100*Math.fround(2+Math.fround(Math.fround(.01)*Math.max(signed,0)))));
  const source=c.sourceIndex??1,listed=c.targetId??(source===0?192:0),targetId=rule.targetScope===1||(rule.targetSide===2&&[3,4].includes(rule.targetScope))?(source===0?0:192):listed,target=targetId===0?0:targetId===192?1:-1;if(target<0)throw Error('Target outside the explicit fixture actors: '+c.id);
  // For the explicitly one-actor side, scope1 or friendly group/all collection
  // resolves to the source from initial roster membership and action columns.
  // Observed execution targets are never used to choose a graph input.
  const chance=trigger=>trigger===(c.angerTrigger1??0)?c.angerChance1??0:trigger===(c.angerTrigger2??0)?c.angerChance2??0:0;
  return{actors,source,target,input:{...projectedState(buffers),seed:seedBytes(c.seed),position:1,actors:actorRows(actors),actionId:c.actionId,sourceIndex:source,enabled:true,targetCount:1,combo:[c.comboSide??0,c.comboCount??0,c.comboAction??0,c.comboTarget??-1,0,0],context:[1,0],config:[[0,1,1,1,2,1,1,1,1,1,1,2,2][c.job??0],chance(24),chance(3),chance(4),c.angerMin??2,c.angerMax??4,0],magic:c.actors.flatMap(a=>[a.magicalMight??0,a.magicalMending??0]),packedScale:c.actors.flatMap((a,i)=>i===source?[c.packedScale0??0,c.packedScale4??0]:[0,0])}};
}

export function commonArmActorTableInput(c){
  if(c.kind!=='normal_action'||c.actors?.length!==2||(c.inputTargetCount??c.targetCount??1)!==1)throw Error('Not an initialized supplied-target action caller: '+c.id);
  const rule=rules.get(c.actionId);if(!rule||rule.raw!==c.actionRaw)throw Error('Action bytes differ from the original table: '+c.id);
  const rawActors=c.enemies?[c.actors[0],...c.enemies]:c.actors,sourceId=c.sourceId??((c.sourceIndex??1)===0?0:192),chance=trigger=>trigger===(c.angerTrigger1??0)?c.angerChance1??0:trigger===(c.angerTrigger2??0)?c.angerChance2??0:0;
  const actors=rawActors.map((raw,i)=>{
    const b=initialStats(raw),a=Object.fromEntries(ACTOR_FIELDS.map(key=>[key,0]));Object.assign(a,{baseAttack:raw.baseAttack??raw.attack??82,baseDefense:raw.baseDefense??raw.defense??68,baseAgility:raw.baseAgility??raw.agility??0,level:raw.level??9,party:Number(i===0),id:i===0?0:191+i,guardRate:i===0?(c.partyShieldGuardTenths??0)/10:0,dodgeRate:i===0?2:0});
    if(i===0){const signed=(((c.deftness??0)&1023)-150)<<16>>16;a.criticalThreshold=Math.floor(Math.fround(100*Math.fround(2+Math.fround(Math.fround(.01)*Math.max(signed,0)))));}
    const criticalBaseRate=i===0?Math.fround(2+Math.fround(Math.fround(.01)*Math.max(((c.deftness??0)&1023)-150,0))):0;
    const actor=actorFromStats(a,b);return{...projectedActor(b),actor:ACTOR_FIELDS.map(key=>actor[key]),initialActor:actor,criticalBaseRate,group:raw.group??0,magic:[raw.magicalMight??0,raw.magicalMending??0],packedScale:a.id===sourceId?[c.packedScale0??0,c.packedScale4??0]:[0,0],species:raw.species??0,metal:!!raw.metal,config:[[0,1,1,1,2,1,1,1,1,1,1,2,2][c.job??0],chance(24),chance(3),chance(4),c.angerMin??2,c.angerMax??4,0],otherAngerChances:[chance(19),chance(20)]};
  });
  const source=actors.find(a=>a.initialActor.id===sourceId),listed=c.targetId??(sourceId===0?192:0);if(!source)throw Error('Unknown initial source ID');
  let targets=[listed];if(rule.targetScope===1)targets=[sourceId];else if(rule.targetSide===2&&[3,4].includes(rule.targetScope)){
    const group=actors.find(a=>a.initialActor.id===listed)?.group??source.group;
    targets=actors.filter(a=>a.initialActor.party===source.initialActor.party&&a.initialActor.hp>0&&(rule.targetScope===4||a.group===group)).map(a=>a.initialActor.id);
  }
  if(targets.some(id=>!actors.some(a=>a.initialActor.id===id)))throw Error('Target outside explicit initial roster: '+c.id);
  return{actors,sourceId,targets,seed:seedBytes(c.seed),position:1,actionId:c.actionId,enabled:true,combo:[c.comboSide??0,c.comboCount??0,c.comboAction??0,c.comboTarget??-1,0,0],context:[1,0]};
}

export async function verifyCommonActionArm(paths){
  const runner=await createCommonActionFixtureRunner(),report={schema:'dq9-common-action-fresh-arm-verification-v1',models:runner.hashes,romSHA256:rom.romSha256,cases:0,fields:0,differences:0,examples:[],cohorts:[],scope:'Complete original action caller from one supplied target. The generic actor-table loop reconstructs self/group/all targets from the original record and initial roster, then calls the same begin/target/reaction/end graphs. Initial case data only, no oracle state or RNG feedback. Camera and the turn scheduler are outside this boundary.'};
  try{for(const path of paths){
    const bytes=await readFile(path),response=JSON.parse(bytes);if(!response.executionComplete||!response.programUnmodified||response.romSHA256!==rom.romSha256)throw Error('Unqualified actual-ROM response: '+path);
    let cases=0,differences=0;
    for(const row of response.results){
      if(!row.ok||!row.strictInitializedMemory)throw Error('Actual caller did not complete: '+row.case.id);
      if(row.case.enemies||row.case.verifyRawState){
        const initial=commonArmActorTableInput(row.case),got=runner.executeActors(initial),actualRaw=row.case.enemies?[row.actors[0],...row.enemyActors]:row.actors,expected={nextSeed:seedBytes(row.nextState),nextPosition:[row.consumed+1],consumed:[row.consumed],supported:[1],combo: [row.comboSide,row.comboCount,row.comboAction,row.comboTarget]},actual={nextSeed:got.nextSeed,nextPosition:got.nextPosition,consumed:got.consumed,supported:got.supported,combo:got.nextCombo.slice(0,4)};
        if(actualRaw.length!==initial.actors.length)throw Error('Observed actor count differs from initialized roster');
        for(let i=0;i<actualRaw.length;i++){
          const b=Buffer.from(actualRaw[i].statsRaw,'hex'),state=projectedActor(b),actor=actorFromStats(initial.actors[i].initialActor,b),wanted={...state,actor:ACTOR_FIELDS.map(key=>actor[key])};
          for(const key of['actor','aux','status','tension','preparation','history','wakeSkip','state3c','rawStatusBytes','rawFlagsBytes','statusKindsBytes','rawRanks','rawTimers']){expected['actor'+i+'.'+key]=Array.isArray(wanted[key])?wanted[key]:[wanted[key]];actual['actor'+i+'.'+key]=Array.isArray(got.actors[i][key])?got.actors[i][key]:[got.actors[i][key]];}
        }
        for(const[name,want]of Object.entries(expected))for(let i=0;i<want.length;i++){report.fields++;if(actual[name]?.[i]!==want[i]){report.differences++;differences++;if(report.examples.length<80)report.examples.push({id:row.case.id,field:name,column:i,actual:actual[name]?.[i],expected:want[i]});}}
        report.cases++;cases++;continue;
      }
      const initial=commonArmActionInput(row.case),got=runner.execute(initial.input,{selfTarget:initial.source===initial.target}),buffers=row.actors.map(actor=>Buffer.from(actor.statsRaw,'hex')),state=projectedState(buffers),internal=row.trace.find(item=>item.function==='damage_postprocess_return'),hp=row.trace.find(item=>item.function==='apply_hp_damage');
      const expected={nextSeed:seedBytes(row.nextState),nextPosition:[row.consumed+1],consumed:[row.consumed],supported:[1],nextActors:actorRows(buffers.map((b,i)=>actorFromStats(initial.actors[i],b))),nextAux:state.aux,nextStatus:state.status,nextWakeSkip:state.wakeSkip,nextTension:state.tension,nextPreparationState:state.preparationState,nextHistory:state.history,nextState3c:state.state3c,damage:[hp?Number(BigInt(hp.r3)):0],internalDamage:[internal?Number(BigInt(internal.r0)):0],comboSide:[row.comboSide],comboCount:[row.comboCount],comboAction:[row.comboAction],comboTarget:[row.comboTarget]};
      for(const[name,want]of Object.entries(expected))for(let i=0;i<want.length;i++){report.fields++;if(got[name]?.[i]!==want[i]){report.differences++;differences++;if(report.examples.length<80)report.examples.push({id:row.case.id,field:name,column:i,actual:got[name]?.[i],expected:want[i]});}}
      report.cases++;cases++;
    }
    report.cohorts.push({path,sha256:createHash('sha256').update(bytes).digest('hex'),cases,differences});
  }}finally{await runner.release();}return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){if(process.argv.length<3)throw Error('Pass saved strict original-ROM normal_action responses.');const report=await verifyCommonActionArm(process.argv.slice(2));console.log(JSON.stringify(report,null,2));if(report.differences)process.exitCode=1;}
