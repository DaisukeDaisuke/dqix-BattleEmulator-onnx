#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import rom from '../restored/dq9-unified/data/rom.mjs';
import {BATTLE_DEFINITIONS,seedBytes} from '../data/common-battle.mjs';
import {ACTOR_FIELDS} from '../graph-v2/rules.mjs';
import {ACTION_STATUSES} from '../graph-v2/extended-rules.mjs';
import {COMMON_RAW_TIMER_OFFSETS} from '../graph-v2/common-modifier-rules.mjs';
import {createCommonBattleRunner} from '../runtime/common-battle.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';

// Verification-only projection of explicit initial RAM data and independently
// observed ARM endpoints. This file contains no battle transition algorithm.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=value=>createHash('sha256').update(typeof value==='string'||ArrayBuffer.isView(value)?value:JSON.stringify(value)).digest('hex');
const clone=value=>structuredClone(value),scalar=value=>Array.isArray(value)?value[0]:value;
const index=Object.fromEntries(ACTOR_FIELDS.map((name,i)=>[name,i]));
const bit=(word,mask)=>Number(!!(word&mask));
const signedRanks=packed=>Array.from({length:10},(_,i)=>{const n=packed>>>(i*3)&7;return n<4?n:n-8;});

function initialStats(raw,{enemy=false}={}){
  const bytes=Buffer.alloc(0xb0);
  for(const[key,offset,fallback]of [['hp',0,100],['mp',2,10],['maxHp',4,100],['maxMp',6,100],['attack',8,0],['defense',10,0],['agility',12,0]])bytes.writeUInt16LE(raw[key]??fallback,offset);
  const status=((raw.status??0)|((raw.hp??100)===0?1:0)|(raw.poison?2:0)|(raw.hpRegen?0x80000000:0)|(raw.mpRegen?0x40000000:0))>>>0;
  bytes.writeUInt32LE(status,0x14);bytes.writeUInt32LE(raw.flags18??0,0x18);bytes.writeUInt32LE(raw.ranksPacked??0,0x58);
  bytes[0x21]=raw.defend??0;bytes.writeUInt16LE(raw.poisonKind??(raw.poison?2:0),0x22);
  for(const[key,offset]of [['mpDuration',0x68],['hpDuration',0x69],['mpRecovery',0x8b],['hpRecovery',0x8c],['chargeBlock',0x3a],['chargeByte',0x3b],['angerDuration',0x7e],['angerRecovery',0xa1]])bytes[offset]=raw[key]??0;
  bytes.writeInt16LE(raw.angerTarget??0,0x2e);
  for(let i=0;i<(raw.resistances?.length??0)&&i<22;i++)bytes[0x3e+i]=raw.resistances[i];
  for(const[offset,value]of Object.entries(raw.statBytes??{}))bytes[Number(offset)]=value;
  // These writes occur after initializeVitalActor in the independent harness.
  if(enemy){bytes.writeInt16LE(raw.coverById??-1,0x2c);bytes[0x38]=raw.initialActorCursor??0;}
  return bytes;
}

function projectActor(bytes,base){
  const actor=[...base.actor],put=(name,value)=>actor[index[name]]=value;
  const rawStatus=bytes.readUInt32LE(0x14),rawFlags=bytes.readUInt32LE(0x18),rawRanks=signedRanks(bytes.readUInt32LE(0x58));
  for(const[name,offset]of [['hp',0],['mp',2],['maxHp',4],['maxMp',6]])put(name,bytes.readUInt16LE(offset));
  for(const[name,offset]of [['defend',0x21],['hpDuration',0x69],['mpDuration',0x68],['hpRecovery',0x8c],['mpRecovery',0x8b]])put(name,bytes[offset]);
  for(const[name,mask]of [['paralysis',8],['sleep',16],['confusion',32],['blind',64],['skip',0x80000],['doubleDodge',0x2000000],['mpRegen',0x40000000],['hpRegen',0x80000000]])put(name,bit(rawStatus,mask));
  put('poison',Number(!!(rawStatus&2)&&(bytes[0x22]&3)===2));put('acrobat',bit(rawFlags,0x400));put('doubleGuard',bit(rawFlags,1));
  ['attackRank','defenseRank','agilityRank'].forEach((name,i)=>put(name,rawRanks[i]));
  const aux=[bytes[0x3b]>>>3&1,bytes[0x3b]>>>4,bytes[0x3a],bit(rawFlags,0x1000),bytes[0x7e],bytes[0xa1],bytes.readInt16LE(0x2e),...ACTION_STATUSES.flatMap(s=>[bytes[s.durationOffset],bytes[s.recoveryOffset]])];
  const status=[bytes[0x22]&3,bytes[0x5c],bytes[0x7f],bytes[0x5d],bytes[0x80],bytes[0x5e],bytes[0x81]],tension=[bytes[0x24],bit(rawStatus,0x800000),bit(rawStatus,0x1000000)];
  return{actor,aux,status,tension,wakeSkip:bytes[0x3b]&1,rawStatus,rawFlags,rawRanks,rawTimers:COMMON_RAW_TIMER_OFFSETS.map(offset=>bytes[offset]),state3c:bytes[0x3c],statusKinds:bytes.readUInt16LE(0x22),dead:!!(rawStatus&1),excluded:!!(rawFlags&0x2000),
    coverById:bytes.readInt16LE(0x2c),coverTargetId:bytes.readInt16LE(0x2a),history:[bytes.readInt16LE(0x32),bytes.readInt16LE(0x34)],actorCursor:bytes[0x38],
    currentStats:[bytes.readUInt16LE(8),bytes.readUInt16LE(10),bytes.readUInt16LE(12)]};
}

function definitionsFromInitial(c){
  if(!Array.isArray(c.definitionProvenance)||c.definitionProvenance.length!==c.allMonsterRecords?.length)throw Error(c.id+': missing explicit initial definition provenance');
  const monsters={};
  for(let i=0;i<c.definitionProvenance.length;i++){
    const p=c.definitionProvenance[i],original=rom.monsters.find(m=>m.id===p.baseId),change=p.ramChanges;
    if(!original||hash(Buffer.from(original.raw,'hex'))!==p.baseRecordSHA256)throw Error(c.id+': original definition hash differs');
    if(!change||change.actions?.length!==6||!Number.isInteger(change.extraMode)||change.extraMode<0||change.extraMode>7||change.angerTriggers!==0)throw Error(c.id+': unknown RAM definition edits');
    const bytes=Buffer.from(original.raw,'hex');
    change.actions.forEach((id,slot)=>bytes.writeUInt16LE(id,0x18+2*slot));
    bytes.writeUInt32LE(((bytes.readUInt32LE(0x10)&~0x700)|(change.extraMode<<8))>>>0,0x10);bytes.writeUInt32LE(0,0x24);
    if(bytes.toString('hex')!==p.raw||p.raw!==c.allMonsterRecords[i])throw Error(c.id+': RAM definition contains unaccounted changes');
    const definition=clone(BATTLE_DEFINITIONS.monsters[p.baseId]);
    definition.actions=[...change.actions];definition.extraActionMode=change.extraMode;definition.flags=bytes.readUInt32LE(0x10);
    definition.otherAngerChances=[0,0];definition.config.splice(1,3,0,0,0);monsters[definition.id]=definition;
  }
  const originals=[...rom.actions].sort((a,b)=>a.id-b.id).map(a=>a.raw);
  if(JSON.stringify(c.allActionRecords)!==JSON.stringify(originals))throw Error(c.id+': action records differ from the permanent table');
  return{...BATTLE_DEFINITIONS,monsters};
}

export function multiActorArmInput(c){
  if(c.kind!=='full_turn'||!c.includeBegin||!c.includeFinish||c.actors?.length!==2||!Array.isArray(c.enemies)||c.enemies.length<1||c.enemies.length>8)throw Error(c.id+': unsupported explicit initial RAM layout');
  const definitions=definitionsFromInitial(c),rawActors=[c.actors[0],...c.enemies];
  const actors=rawActors.map((raw,i)=>{
    const party=i===0,actorId=party?0:191+i,definition=party?null:definitions.monsters[raw.monsterId];
    if(!party&&!definition)throw Error(c.id+': missing initial monster definition');
    const defaults={party:Number(party),id:actorId,baseAttack:raw.baseAttack??raw.attack??0,baseDefense:raw.baseDefense??raw.defense??0,baseAgility:raw.baseAgility??raw.agility??0,
      level:raw.level??20,dodgeRate:party?2:definition.dodgeRate,guardRate:party?(c.partyShieldGuardTenths??0)/10:definition.guardRate,
      criticalThreshold:party?Math.trunc(100*(2+.01*Math.max((c.deftness??0)-150,0))):0,hpEquipmentRegen:raw.hpEquipmentRegen??0};
    const base={actor:ACTOR_FIELDS.map(name=>defaults[name]??0)},bytes=initialStats(raw,{enemy:!party}),projection=projectActor(bytes,base);
    const{history,actorCursor,currentStats,...state}=projection;
    return{actorId,group:party?-1:raw.group??0,present:raw.present!==0,roster:raw.roster!==0,definitionId:party?null:raw.monsterId,originalMonsterId:party?null:raw.monsterId,
      ...state,species:definition?.species??0,metal:definition?.metal??false,preparation:[0,0,0,0,bit(bytes[0x3c],64)],
      config:party?[1,0,0,0,2,4,0]:[...definition.config.slice(0,6),Number(bytes[0x53]!==0)],resistances:Array.from(bytes.slice(0x3e,0x54)),
      weapon:[0,0,10,0],charm:[c.currentCharm??0,c.baseCharm??0,c.equipmentCharm??0],magic:[bytes.readUInt32LE(0x10)>>>10&1023,bytes.readUInt32LE(0x10)>>>20&1023],packedScale:party?[0,(c.deftness??0)&1023]:[0,0],
      ai:{cursor:actorCursor,alternate:!!(state.state3c&1),revengeId:history[0],previousId:history[1],storedTransitionId:0,previousTargetCount:0,previousTargets:Array(8).fill(-1)},auxiliaryBytes:Array(9).fill(0),
      commands:party?[{actionId:c.actionId,targets:[c.targetId??192],targetGroup:0}]:[],initialAuthority:{kind:'explicit strict ARM initial RAM',id:c.id,expectedStateUsed:false}};
  });
  const token=c.comboToken??0;
  const row={schema:'dq9-common-battle-state-v1',encounterId:'strict-arm:'+c.id,seed:seedBytes(c.seed),position:1,turn:c.turn??1,completedTurns:0,firstTurn:(c.turn??1)===1,surprise:0,actors,
    groups:Array.from({length:3},(_,i)=>({cursor:c.initialGroupCursors?.[i]??0,usedSlots:Array.from({length:6},(_,j)=>!!((c.initialGroupUsedSlots?.[i]??0)&(1<<j)))})),
    combo:[c.comboSide??0,c.comboCount??0,c.comboAction??0,c.comboTarget??-1,token&65535,token>>>16],context:[1,0],outcome:c.outcome??0,finished:false,supported:true,
    camera:{mode:'numeric-only',row4Words:[],records:[],state:null},pendingCommands:[],nowstate:[]};
  return{row,definitions};
}

export async function verifyCommonMultiActorRom({sourcePath,programPath=resolve(root,'graph-v2/common-battle-program.json'),ortRuntime,backend='onnxruntime-wasm',maxTransitions=20000,onlyId,trace=false,observedPath}={}){
  const sourceBytes=await readFile(sourcePath),source=JSON.parse(sourceBytes);
  if(!source.executionComplete||!source.programUnmodified||source.romSHA256!==rom.romSha256)throw Error('Independent complete original ARM source is required');
  const selected=source.results.filter(r=>!onlyId||r.case.id===onlyId);if(!selected.length)throw Error('No cases selected');
  for(const r of selected)if(!r.ok||!r.strictInitializedMemory)throw Error(r.case.id+': strict ARM execution did not complete');
  const program=JSON.parse(await readFile(programPath)),models=new Map();
  for(const module of program.modules){const ir=JSON.parse(await readFile(resolve(dirname(programPath),module.ir))),onnx=await readFile(resolve(dirname(programPath),module.onnx));if(hash(onnx)!==module.sha256||ir.name!==module.name)throw Error('Program binding differs: '+module.name);models.set(module.name,{name:module.name,ir,onnx});}
  const executor=createGraphExecutor({models,ortRuntime,backend}),started=performance.now();
  const report={schema:'dq9-common-multi-actor-arm-v1',source:resolve(sourcePath),sourceSha256:hash(sourceBytes),romSha256:rom.romSha256,authority:source.method,programHash:hash(program),moduleHashes:Object.fromEntries(program.modules.map(m=>[m.name,m.sha256])),moduleCount:program.modules.length,
    runtimeSha256:hash(await readFile(resolve(root,'runtime/common-battle.mjs'))),fieldsCompared:0,mismatches:0,mismatchesByField:{},examples:[],cases:[],turnEndpoints:0,
    scope:{initialInputsOnly:true,expectedEndpointFeedback:false,definitionEdits:'Explicit supplied RAM data, verified against original row hashes and byte edits; executable ROM unchanged.',actors:'Every observed actorRows entry',groups:'Every groupRows entry, including empty groups',cameraIncluded:false,notCompared:['allocator-dependent combo pointer token','unrepresented raw memory bytes'],maxTransitions}},observed=[];
  function compare(id,key,got,want){
    if(Array.isArray(want)){if(!Array.isArray(got)||got.length!==want.length){report.mismatches++;report.examples.push({id,key,shape:[got?.length,want.length]});return;}for(let i=0;i<want.length;i++)compare(id,key+'['+i+']',got[i],want[i]);return;}
    report.fieldsCompared++;if(got!==want){report.mismatches++;report.mismatchesByField[key]=(report.mismatchesByField[key]??0)+1;if(report.examples.length<100)report.examples.push({id,key,actual:got,expected:want});}
  }
  async function compareEndpoint(id,row,want,expectedSeed,expectedPosition,initial){
    compare(id,'seed',row.seed,seedBytes(expectedSeed));compare(id,'position',row.position,expectedPosition);compare(id,'turn',row.turn,want.turn);compare(id,'outcome',row.outcome,want.outcome);
    compare(id,'combo',row.combo.slice(0,4),[want.comboSide,want.comboCount,want.comboAction,want.comboTarget]);compare(id,'actorCount',row.actors.length,want.actorRows.length);
    for(const endpoint of want.actorRows){
      const actual=row.actors.find(a=>a.actorId===endpoint.actorId),base=initial.actors.find(a=>a.actorId===endpoint.actorId),expected=projectActor(Buffer.from(endpoint.statsRaw,'hex'),base);
      if(!actual||!base)throw Error(id+': actor missing from common state');
      const key='actor'+endpoint.actorId;for(const field of ['actor','aux','status','tension','wakeSkip','rawStatus','rawFlags','rawRanks','rawTimers','state3c','statusKinds','dead','excluded','coverById','coverTargetId'])compare(id,key+'.'+field,actual[field],expected[field]);
      compare(id,key+'.history',[actual.ai.revengeId,actual.ai.previousId],expected.history);compare(id,key+'.cursor',actual.ai.cursor,endpoint.actorCursor);
      if(endpoint.actorId>=192){compare(id,key+'.group',actual.group,endpoint.group);compare(id,key+'.definitionId',actual.definitionId,endpoint.definitionId);}
      const ir=models.get(program.operations.stateView).ir,values={actor:actual.actor,aux:actual.aux,tension:actual.tension,wakeSkip:actual.wakeSkip,present:actual.present,
        rawStatusBytes:Array.from({length:4},(_,i)=>actual.rawStatus>>>8*i&255),rawFlagBytes:Array.from({length:4},(_,i)=>actual.rawFlags>>>8*i&255),rawRanks:actual.rawRanks,rawTimers:actual.rawTimers,deathReset:false,escapeReset:false};
      const input=Object.fromEntries(ir.inputs.map(d=>{const value=values[d.name]??ir.contract.defaults?.[d.name];return[d.name,Array.isArray(value)?value:[value]];}));
      const [view]=await executor.runGraph(ir.name,[input]);compare(id,key+'.currentStats',[scalar(view.attack),scalar(view.defense),scalar(view.agility)],expected.currentStats);
    }
    compare(id,'groupCount',row.groups.length,want.groupRows.length);
    for(const group of want.groupRows){const actual=row.groups[group.index],count=row.actors.filter(a=>a.actor[index.party]===0&&a.group===group.index&&a.present!==false&&a.roster!==false).length;
      compare(id,'group'+group.index,[count,actual.cursor,actual.usedSlots.reduce((bits,value,i)=>bits|(value?1<<i:0),0)],[group.count,group.cursor,group.usedSlots]);}
  }
  try{for(const r of selected){
    const{row,definitions}=multiActorArmInput(r.case),runner=await createCommonBattleRunner({program,definitions,getModel:name=>models.get(name)?.ir,runGraph:executor.runGraph}),maxTurns=r.case.turnCount??1,before=report.mismatches;
    const result=await runner.run({rows:[row],maxTurns,maxTransitions,trace}),actual=result.rows[0];
    compare(r.case.id,'complete',result.complete,true);compare(r.case.id,'supported',actual.supported,true);
    await compareEndpoint(r.case.id,actual,r.turnState,r.nextState,1+r.consumed,row);report.turnEndpoints++;
    const finishes=r.phases.filter(p=>p.name.endsWith('full_finish_turn'));
    for(let i=0;i<finishes.length-1;i++){
      const finish=finishes[i],prefix=await runner.run({rows:[row],maxTurns:i+1,maxTransitions,trace:false});
      const position=1+r.trace.filter(t=>t.function==='NextRandom'&&t.instruction<=finish.instructions).length;
      await compareEndpoint(r.case.id+'/turn'+i,prefix.rows[0],finish.state,finish.seed,position,row);report.turnEndpoints++;
      if(observedPath)observed.push({id:r.case.id,turnPrefix:i+1,input:row,definitions,result:prefix});
    }
    report.cases.push({id:r.case.id,actorCount:row.actors.length,turns:maxTurns,complete:result.complete,mismatches:report.mismatches-before,inputHash:result.inputHash,unresolvedEffects:result.unresolvedEffects,position:actual.position,expectedPosition:1+r.consumed});
    if(observedPath)observed.push({id:r.case.id,input:row,definitions,result});
  }}finally{await executor.release();}
  report.passed=report.mismatches===0&&report.cases.every(c=>c.complete);report.elapsedMs=performance.now()-started;
  report.runtime={version:ortRuntime.env.versions.web,backend,counts:executor.counts};
  if(observedPath)await writeFile(resolve(observedPath),JSON.stringify({report,cases:observed},null,2)+'\n');return report;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2),options={},mapping={'--source':'sourcePath','--program':'programPath','--ort-dir':'ortDirectory','--backend':'backend','--only-id':'onlyId','--max-transitions':'maxTransitions','--out':'outputPath','--observed-out':'observedPath'};
    for(let i=0;i<args.length;i++){if(args[i]==='--trace'){options.trace=true;continue;}const key=mapping[args[i]];if(!key||!args[i+1]||args[i+1].startsWith('--'))throw Error('Use --source ARM_JSON --ort-dir ORT_DIST [--only-id ID] [--trace] [--out JSON] [--observed-out JSON]');options[key]=args[++i];}
    if(options.maxTransitions!==undefined){options.maxTransitions=Number(options.maxTransitions);if(!Number.isSafeInteger(options.maxTransitions)||options.maxTransitions<1)throw Error('Invalid transition budget');}
    const ortRuntime=await loadLocalOrt(options.ortDirectory??process.env.ORT_RUNTIME_DIR),report=await verifyCommonMultiActorRom({...options,ortRuntime}),content=JSON.stringify(report,null,2)+'\n';
    if(options.outputPath)await writeFile(resolve(options.outputPath),content);console.log(content);if(!report.passed)process.exitCode=1;
  }catch(error){console.error(error.stack??String(error));process.exitCode=1;}
}
