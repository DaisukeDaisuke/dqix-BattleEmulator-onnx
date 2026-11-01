#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import rom from '../restored/dq9-unified/data/rom.mjs';
import {BATTLE_DEFINITIONS,seedBytes} from '../data/common-battle.mjs';
import {ACTOR_FIELDS} from '../graph-v2/rules.mjs';
import {createCommonBattleRunner} from '../runtime/common-battle.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';

// Verification-only adapter for the restored strict ARM full-turn fixtures.
// Only each fixture's initial case becomes an input. Expected endpoints are
// read after inference and never fed back into the common battle runner.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=value=>createHash('sha256').update(typeof value==='string'||ArrayBuffer.isView(value)?value:JSON.stringify(value)).digest('hex');
const fields=Object.fromEntries(ACTOR_FIELDS.map((key,index)=>[key,index]));
const scalar=value=>Array.isArray(value)?value[0]:value;
const auxDefault=()=>[0,0,0,0,0,0,-1,...Array(14).fill(0)];
const targetBuffer=()=>Array(8).fill(-1);

function initialBytes(actor){
  const bytes=new Uint8Array(0xb0),view=new DataView(bytes.buffer);
  view.setUint32(0x14,((actor.status??0)|(actor.poison?2:0)|(actor.hpRegen?0x80000000:0)|(actor.mpRegen?0x40000000:0))>>>0,true);
  view.setUint32(0x18,actor.flags18??0,true);view.setUint32(0x58,actor.ranksPacked??0,true);
  for(let i=0;i<21;i++)bytes[0x3e+i]=actor.resistances?.[i]??100;
  for(const[offset,value]of Object.entries(actor.statBytes??{}))bytes[Number(offset)]=value;
  return{bytes,view};
}

export function armFixtureInput(record,originalCase){
  const input=record.input;
  if(originalCase.kind!=='full_turn'||record.includesFinish===false||!originalCase.includeFinish)throw Error(record.id+': only complete numerical full_turn fixtures are supported');
  if(input.actors?.length!==66||input.aux?.length!==35||input.status?.length!==14||originalCase.actors?.length!==2)throw Error(record.id+': unknown initial-state layout');
  const monster=rom.monsters.find(item=>item.raw===originalCase.monsterRaw);
  if(!monster)throw Error(record.id+': fixture monster definition differs from the published ROM table');
  if(JSON.stringify(seedBytes(originalCase.seed))!==JSON.stringify(input.seed))throw Error(record.id+': initial seed projection differs');
  const actors=originalCase.actors.map((raw,index)=>{
    const actor=input.actors.slice(index*33,index*33+33),actorId=actor[fields.id],party=actor[fields.party]!==0,aux=auxDefault(),{bytes,view}=initialBytes(raw);
    if(party)aux.splice(0,3,...input.aux.slice(0,3));else aux.splice(3,4,...input.aux.slice(3,7));
    aux.splice(7,14,...input.aux.slice(7+index*14,21+index*14));
    const rank=view.getUint32(0x58,true),rawStatus=view.getUint32(0x14,true),rawFlags=view.getUint32(0x18,true);
    return{actorId,group:party?-1:0,present:true,roster:true,dead:!!(rawStatus&1),excluded:!!(rawFlags&0x2000),
      definitionId:party?null:monster.id,originalMonsterId:party?null:monster.id,actor,aux,
      status:input.status.slice(index*7,index*7+7),wakeSkip:input.wakeSkip[index],
      tension:input.tension?.slice(index*3,index*3+3)??[0,0,0],preparation:input.preparationState?.slice(index*5,index*5+5)??Array(5).fill(0),
      config:[...input.config],resistances:Array.from(bytes.slice(0x3e,0x54)),weapon:[0,0,10,0],charm:[0,0,0],
      ai:{cursor:0,alternate:!!(bytes[0x3c]&1),storedTransitionId:0,previousTargetCount:0,previousTargets:targetBuffer()},
      rawStatus,rawFlags,rawRanks:Array.from({length:10},(_,i)=>{const value=(rank>>>(3*i))&7;return value<4?value:value-8;}),
      state3c:bytes[0x3c],auxiliaryBytes:Array(9).fill(0),magic:[raw.magicalMight??0,raw.magicalMending??0],packedScale:party?[originalCase.packedScale0??0,originalCase.deftness??0]:[0,0],commands:party?[{actionId:originalCase.actionId,targets:[originalCase.targetId??192]}]:[],
      initialAuthority:{kind:'strict ARM initial case',id:record.id,expectedStateUsed:false}};
  });
  return{schema:'dq9-common-battle-state-v1',encounterId:'strict-arm-fixture:'+record.id,seed:[...input.seed],position:scalar(input.position),
    turn:scalar(input.turn),completedTurns:0,firstTurn:scalar(input.turn)===1,surprise:0,actors,
    groups:Array.from({length:3},()=>({cursor:0,usedSlots:Array(6).fill(false)})),combo:[...input.combo],context:[...input.context],
    outcome:0,finished:false,supported:true,camera:{mode:'numeric-only',row4Words:[],records:[],state:null},pendingCommands:[],nowstate:[]};
}

export function legacyEndpoint(row){
  const party=row.actors.find(actor=>actor.actor[fields.party]!==0),enemy=row.actors.find(actor=>actor.actor[fields.party]===0);
  return{state:{actors:[...party.actor,...enemy.actor],aux:[...party.aux.slice(0,3),...enemy.aux.slice(3,7),...party.aux.slice(7),...enemy.aux.slice(7)],
    status:[...party.status,...enemy.status],wakeSkip:[party.wakeSkip,enemy.wakeSkip],seed:[...row.seed],position:[row.position],
    comboPrefix:row.combo.slice(0,4),outcome:[row.outcome],supported:[Number(row.supported)],turn:[row.turn]},
    ai:{actorCursor:[enemy.ai.cursor],groupCursor:[row.groups[enemy.group].cursor],usedSlots:row.groups[enemy.group].usedSlots.map(Number)}};
}

export async function verifyCommonBattleRom({recordsPath,sourceRoot,sourcePath,programPath=resolve(root,'graph-v2/common-battle-program.json'),
  ortRuntime,backend='onnxruntime-wasm',maxTransitions=10000,onlyId,limit,trace=false,observedPath}={}){
  if(!recordsPath||!ortRuntime)throw Error('Fixture records and the actual ORT Web runtime are required.');
  const recordBytes=await readFile(recordsPath),records=JSON.parse(recordBytes);
  if(records.cameraIncluded!==false||!Array.isArray(records.cases))throw Error('Only explicit camera-excluded full-turn fixtures are accepted');
  const authoritativePath=sourcePath?resolve(sourcePath):resolve(sourceRoot??dirname(recordsPath),records.source);
  const sourceBytes=await readFile(authoritativePath),source=JSON.parse(sourceBytes);
  if(hash(sourceBytes)!==records.sourceSha256)throw Error('The authoritative ARM source hash does not match the projection');
  if(!source.programUnmodified||source.romSHA256!==BATTLE_DEFINITIONS.romSha256)throw Error('The fixture does not identify the unmodified matching ROM');
  const originals=new Map(source.results.map(result=>[result.case.id,result]));
  let selected=records.cases;if(onlyId)selected=selected.filter(record=>record.id===onlyId);if(limit)selected=selected.slice(0,limit);
  if(!selected.length)throw Error('No fixture cases selected');
  for(const record of selected){const raw=originals.get(record.id);if(!raw?.ok||!raw.strictInitializedMemory)throw Error(record.id+': strict ARM execution did not complete');}
  const program=JSON.parse(await readFile(programPath,'utf8')),models=new Map();
  for(const module of program.modules){
    const ir=JSON.parse(await readFile(resolve(dirname(programPath),module.ir),'utf8')),onnx=await readFile(resolve(dirname(programPath),module.onnx));
    if(hash(onnx)!==module.sha256||ir.name!==module.name)throw Error('Shared module binding differs: '+module.name);
    models.set(module.name,{name:module.name,ir,onnx});
  }
  const runtimeSha256=hash(await readFile(resolve(root,'runtime/common-battle.mjs'))),executor=createGraphExecutor({models,ortRuntime,backend});
  const runner=await createCommonBattleRunner({program,definitions:BATTLE_DEFINITIONS,getModel:name=>models.get(name)?.ir,runGraph:executor.runGraph});
  const rows=selected.map(record=>armFixtureInput(record,originals.get(record.id).case)),budgets=new Set(selected.map(record=>record.options?.turns??1));
  if(budgets.size!==1||![...budgets].every(value=>Number.isSafeInteger(value)&&value>=1))throw Error('A fixture cohort must declare one valid turn budget');
  const maxTurns=[...budgets][0],started=performance.now();let result,fieldsCompared=0,mismatches=0,turnsCompared=0;
  const examples=[],mismatchesByField={},cases=[],turnResults=[];
  const compare=(id,key,got,want)=>{
    if(!Array.isArray(got)||got.length!==want.length)throw Error(id+'.'+key+': endpoint shape changed');
    for(let index=0;index<want.length;index++){fieldsCompared++;if(got[index]!==want[index]){mismatches++;mismatchesByField[key]=(mismatchesByField[key]??0)+1;if(examples.length<80)examples.push({id,key,index,actual:got[index],expected:want[index]});}}
  };
  const compareRecord=(record,row)=>{
    const projection=legacyEndpoint(row);
    for(const[key,want]of Object.entries(record.expectedState))compare(record.id,key,projection.state[key],want);
    for(const[key,want]of Object.entries(record.expectedAi??{}))compare(record.id,'ai.'+key,projection.ai[key],want);
    if(record.expectedCompletedTurns!==undefined)compare(record.id,'completedTurns',[row.completedTurns],[record.expectedCompletedTurns]);
    return projection;
  };
  try{
    result=await runner.run({rows,maxTurns,maxTransitions,trace});
    selected.forEach((record,lane)=>{
      const before=mismatches,projection=compareRecord(record,result.rows[lane]);
      cases.push({id:record.id,mismatches:mismatches-before,position:result.rows[lane].position,expectedPosition:scalar(record.expectedState.position),
        stateHash:hash(projection),supported:result.rows[lane].supported,budgetExhausted:result.rows[lane].budgetExhausted});
    });
    const laneById=new Map(selected.map((record,lane)=>[record.id,lane]));
    const turns=(records.turns??[]).filter(turn=>laneById.has(records.cases[turn.lane]?.id));
    for(const turnIndex of [...new Set(turns.map(turn=>turn.turnIndex))].sort((a,b)=>a-b)){
      const expected=turns.filter(turn=>turn.turnIndex===turnIndex),lanes=expected.map(turn=>laneById.get(records.cases[turn.lane].id));
      // Each requested prefix is rerun from the same initial input. No oracle
      // endpoint or prior expected state is used as an intermediate input.
      const prefix=await runner.run({rows:lanes.map(lane=>rows[lane]),maxTurns:turnIndex+1,maxTransitions,trace:false});
      if(prefix.programHash!==result.programHash)throw Error('Program changed during turn-prefix verification');
      expected.forEach((record,index)=>{const before=mismatches;compareRecord(record,prefix.rows[index]);turnsCompared++;
        turnResults.push({id:record.id,turnIndex,mismatches:mismatches-before,position:prefix.rows[index].position,expectedPosition:scalar(record.expectedState.position),complete:prefix.complete,
          ...(observedPath?{state:prefix.rows[index]}:{})});});
    }
  }finally{await executor.release();}
  const report={schema:'dq9-common-battle-arm-verification-v1',passed:mismatches===0&&result.complete,
    authority:source.method,romSha256:source.romSHA256,source:authoritativePath,sourceSha256:hash(sourceBytes),records:resolve(recordsPath),recordsSha256:hash(recordBytes),
    programHash:result.programHash,moduleHashes:result.moduleHashes,moduleCount:program.modules.length,runtimeSha256,inputHash:result.inputHash,
    runtime:{version:ortRuntime.env.versions.web,backend,counts:{...executor.counts},sharedOrtModels:[...executor.explicitOrtModels]},
    scope:{initialInputOnly:true,expectedEndpointFeedback:false,cameraIncluded:false,maxTurns,maxTransitions},
    elapsedMs:performance.now()-started,cases:cases.length,turnsCompared,fieldsCompared,mismatches,mismatchesByField,examples,caseResults:cases,
    complete:result.complete,unresolvedEffects:result.unresolvedEffects,budgetExhausted:result.budgetExhausted};
  if(observedPath)await writeFile(resolve(observedPath),JSON.stringify({report,inputs:rows,results:result.rows,traces:result.traces,turnResults,expected:selected.map(record=>({id:record.id,state:record.expectedState,ai:record.expectedAi}))},null,2)+'\n');
  return report;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const options={},mapping={'--records':'recordsPath','--source-root':'sourceRoot','--source':'sourcePath','--program':'programPath','--ort-dir':'ortDirectory','--backend':'backend','--only-id':'onlyId','--limit':'limit','--max-transitions':'maxTransitions','--out':'outputPath','--observed-out':'observedPath'},args=process.argv.slice(2);
    for(let i=0;i<args.length;i++){if(args[i]==='--trace'){options.trace=true;continue;}const key=mapping[args[i]];if(!key||!args[i+1]||args[i+1].startsWith('--'))throw Error('Use --records FILE --source-root ROOT --ort-dir EXISTING_ORT_DIST [--backend onnxruntime-wasm|native-wasm] [--only-id ID] [--limit N] [--trace] [--out JSON] [--observed-out JSON]');options[key]=args[++i];}
    for(const key of['limit','maxTransitions'])if(options[key]!==undefined){options[key]=Number(options[key]);if(!Number.isSafeInteger(options[key])||options[key]<1)throw Error(key+' must be a positive integer');}
    const ortRuntime=await loadLocalOrt(options.ortDirectory??process.env.ORT_RUNTIME_DIR),report=await verifyCommonBattleRom({...options,ortRuntime});
    const content=JSON.stringify(report,null,2)+'\n';if(options.outputPath)await writeFile(resolve(options.outputPath),content);console.log(content);if(!report.passed)process.exitCode=1;
  }catch(error){console.error(error.stack??String(error));process.exitCode=1;}
}
