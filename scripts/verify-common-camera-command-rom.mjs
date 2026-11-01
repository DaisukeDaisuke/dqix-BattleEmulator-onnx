#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {seedBytes,BATTLE_DEFINITIONS} from '../data/common-battle.mjs';
import {createCommonBattleRunner} from '../runtime/common-battle.mjs';
import {createCommonPresentationRunner} from '../runtime/common-presentation.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),sha=x=>createHash('sha256').update(x).digest('hex');
async function json(path){const file=await readFile(path),bytes=path.endsWith('.gz')?gunzipSync(file):file;return{value:JSON.parse(bytes),sha256:sha(bytes)};}
export async function verifyCommonCameraCommandRom({sourcePath,inputPath,ortDirectory,outputPath,observedPath}={}){
  const source=await json(sourcePath),initial=await json(inputPath),s=source.value;
  if(!s.executionComplete||!s.programUnmodified||s.romSHA256!==BATTLE_DEFINITIONS.romSha256)throw Error('A completed unmodified matching-ROM source is required');
  const programPath=resolve(root,'graph-v2/common-battle-program.json'),program=JSON.parse(await readFile(programPath)),models=new Map();
  for(const m of program.modules){const ir=JSON.parse(await readFile(resolve(dirname(programPath),m.ir))),onnx=await readFile(resolve(dirname(programPath),m.onnx));if(sha(onnx)!==m.sha256)throw Error('Model binding '+m.name);models.set(m.name,{name:m.name,ir,onnx});}
  const ort=await loadLocalOrt(ortDirectory),executor=createGraphExecutor({models,ortRuntime:ort,backend:'onnxruntime-wasm'}),getModel=name=>models.get(name)?.ir;
  const report={schema:'dq9-common-camera-command-rom-proof-v1',sourceSHA256:source.sha256,initialInputsSHA256:initial.sha256,romSHA256:s.romSHA256,programSHA256:sha(JSON.stringify(program)),modelHashes:Object.fromEntries(program.modules.map(m=>[m.name,m.sha256])),fieldsCompared:0,headerFieldsCompared:0,mismatches:0,examples:[],cases:[],scope:{initialInputsOnly:true,expectedFeedback:false,cameraHeaderProjection:true,wholeCameraCompared:false,wholeBattleComplete:false,unsupportedQueuesRetained:true}},observed=[];
  function compare(id,path,got,want,header=false){if(want&&typeof want==='object'){if(Array.isArray(want)){if(!Array.isArray(got)||got.length!==want.length){report.mismatches++;if(report.examples.length<40)report.examples.push({id,path,got,want});return;}for(let i=0;i<want.length;i++)compare(id,path+'.'+i,got[i],want[i],header);}else for(const[k,v]of Object.entries(want))compare(id,path+'.'+k,got?.[k],v,header);return;}report.fieldsCompared++;if(header)report.headerFieldsCompared++;if(!Object.is(got,want)){report.mismatches++;if(report.examples.length<40)report.examples.push({id,path,got,want});}}
  try{for(const original of s.results){
    if(!original.ok||!original.strictInitializedMemory)throw Error('Incomplete strict original case '+original.case.id);
    const item=initial.value.cases.find(x=>x.id===original.case.id);if(!item||item.input.completedTurns!==0||item.input.nowstate.length||item.expectedOutputsUsed!==false)throw Error('Initial-only fixture missing '+original.case.id);
    const input=structuredClone(item.input);input.camera={mode:'battle-camera',initial:{roster:input.actors.map(a=>({id:a.actorId}))},nextNumericTurnReady:true};
    // Older retained fixtures predate the explicit raw-timer ABI. Restore
    // those bytes from the original INITIAL case, never an endpoint.
    for(const actor of input.actors){const raw=actor.actorId<4?original.case.actors[actor.actorId]:(original.case.enemies?.[actor.actorId-192]??original.case.actors[1]);if(!raw)throw Error('Missing declared initial actor');const bytes=new Uint8Array(176);for(const[k,v]of Object.entries(raw.statBytes??{}))bytes[Number(k)]=v;const timers=program.rawTimerOffsets.map(offset=>bytes[offset]);if(actor.rawTimers?.length===timers.length&&JSON.stringify(actor.rawTimers)!==JSON.stringify(timers))throw Error('Initial raw timer disagreement '+item.id);actor.rawTimers=timers;}
    const runner=await createCommonBattleRunner({program,definitions:item.definitions,getModel,runGraph:executor.runGraph}),before=report.mismatches,result=await runner.runNumericTurn({rows:[input],maxTransitions:100000}),actual=result.rows[0],phase=original.phases.find(p=>p.name.endsWith('full_finish_turn'));
    if(!phase?.presentationQueue)throw Error('Missing original queue '+original.case.id);
    compare(item.id,'numeric.complete',result.complete,true);compare(item.id,'numeric.seed',actual.seed,seedBytes(original.nextState));compare(item.id,'numeric.position',actual.position,1+original.consumed);
    compare(item.id,'numeric.turn',actual.turn,phase.state.turn);compare(item.id,'numeric.outcome',actual.outcome,phase.state.outcome);
    compare(item.id,'numeric.combo',actual.combo.slice(0,4),[phase.state.comboSide,phase.state.comboCount,phase.state.comboAction,phase.state.comboTarget]);
    for(const expected of phase.state.actorRows){const a=actual.actors.find(x=>x.actorId===expected.actorId);if(!a)throw Error('Missing actor '+expected.actorId);compare(item.id,'actor.'+expected.actorId,{hp:a.actor[0],mp:a.actor[2],maxHp:a.actor[1],maxMp:a.actor[3],status:a.rawStatus,flags18:a.rawFlags,rawRanks:a.rawRanks},{hp:expected.hp,mp:expected.mp,maxHp:expected.maxHp,maxMp:expected.maxMp,status:expected.status,flags18:expected.flags18,rawRanks:Array.from({length:10},(_,i)=>{const v=(expected.ranksPacked>>>(i*3))&7;return v<4?v:v-8;})});}
    const presentation=await createCommonPresentationRunner({definitions:item.definitions})({state:actual,records:actual.turnRecords,runGraph:executor.runGraph,getModel}),got=presentation.camera?.preparedCommands;
    if(presentation.complete){const wanted=phase.presentationQueue.records.map(r=>({actionId:r.action,messageId:r.messageId,participants:r.sources,targets:r.targets,flagsA:r.flagsA,flagsB:r.flagsB}));compare(item.id,'commands',got,wanted,true);}
    report.cases.push({id:item.id,numericComplete:result.complete,cameraCommandsComplete:presentation.complete,commandCount:got?.length??0,originalCommandCount:phase.presentationQueue.count,mismatches:report.mismatches-before,unresolvedEffects:presentation.unresolvedEffects??[],inputSHA256:sha(JSON.stringify(input)),definitionsSHA256:sha(JSON.stringify(item.definitions))});
    observed.push({id:item.id,numeric:actual,presentation});
  }}finally{await executor.release();}
  report.admittedCases=report.cases.filter(x=>x.cameraCommandsComplete).length;report.blockedCases=report.cases.length-report.admittedCases;report.passed=report.mismatches===0&&report.admittedCases>0&&report.cases.every(x=>x.numericComplete);report.runtime={version:ort.env.versions.web,counts:executor.counts};
  if(outputPath)await writeFile(outputPath,JSON.stringify(report,null,2)+'\n');if(observedPath)await writeFile(observedPath,JSON.stringify({report,cases:observed})+'\n');return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i++){const key=({'--source':'sourcePath','--inputs':'inputPath','--ort-dir':'ortDirectory','--out':'outputPath','--observed-out':'observedPath'})[args[i]];if(!key||!args[i+1])throw Error('Use --source JSON[.gz] --inputs JSON[.gz] --ort-dir DIR --out JSON');options[key]=resolve(args[++i]);}const r=await verifyCommonCameraCommandRom(options);console.log(JSON.stringify(r));if(!r.passed)process.exitCode=1;}
