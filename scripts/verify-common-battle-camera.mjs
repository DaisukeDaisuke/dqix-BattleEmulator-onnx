#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCommonBattleCameraAdapter,createInitialBattleCameraState} from '../runtime/common-battle-camera.mjs';
import {createCommonBattleSearch,createBattleSearchState} from '../runtime/common-battle-search.mjs';
import {COMMON_BATTLE_CAMERA_EXAMPLE} from '../data/common-battle-camera-example.mjs';
import {BATTLE_DEFINITIONS} from '../data/common-battle.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),hash=x=>createHash('sha256').update(typeof x==='string'||ArrayBuffer.isView(x)?x:JSON.stringify(x)).digest('hex'),json=x=>JSON.parse(JSON.stringify(x));
export async function verifyCommonBattleCamera({ortDirectory,outputPath,maxTurns=2}={}){
  const programPath=resolve(root,'graph-v2/common-battle-program.json'),program=JSON.parse(await readFile(programPath)),models=new Map();
  for(const m of program.modules){const onnx=await readFile(resolve(dirname(programPath),m.onnx)),ir=JSON.parse(await readFile(resolve(dirname(programPath),m.ir)));if(hash(onnx)!==m.sha256)throw Error('Model hash differs: '+m.name);models.set(m.name,{name:m.name,ir,onnx,sha256:m.sha256,executionProvider:ir.schema==='dq9-cpu-double-graph-ir-v1'?'wasm-explicit-cpu':undefined});}
  const ortRuntime=await loadLocalOrt(ortDirectory),executor=createGraphExecutor({models,ortRuntime,backend:'onnxruntime-wasm'}),adapter=await createCommonBattleCameraAdapter({program,definitions:BATTLE_DEFINITIONS,getModel:name=>models.get(name)?.ir,runGraph:executor.runGraph});
  const report={schema:'dq9-common-battle-camera-ort-integration-v1',createdAt:new Date().toISOString(),adapterId:adapter.adapterId,programHash:hash(program),scope:'Actual ONNX Runtime integration and continuation/control checks. This is not independent original-ROM accuracy evidence.',runtimeRomUsed:false,tests:[],failures:[],boundaries:[],milliseconds:0};
  const check=(name,want,got)=>{const passed=JSON.stringify(want)===JSON.stringify(got);report.tests.push({name,passed});if(!passed)report.failures.push({name,want,got});};
  const initial=()=>createInitialBattleCameraState({input:COMMON_BATTLE_CAMERA_EXAMPLE.inputs,maxTurns});
  const start=performance.now();
  try{
    const base=initial(),[limited]=await adapter.advanceBatch([{id:'budget',state:base}],{maxTransitions:1});
    check('numeric budget remains retryable','budget',limited.status);check('numeric budget rolls back unfinished RNG/actors',base.battle,limited.state.battle);check('numeric budget consumed no row4',false,limited.row4Consumed);
    let state=initial(),row4Input,final;
    for(let i=0;i<100;i++){
      const [out]=await adapter.advanceBatch([{id:'direct',state,...(row4Input?{row4Input}:{})}],{maxTransitions:100000});
      report.boundaries.push({step:i,status:out.status,boundary:out.boundary??null,observationId:out.observationId??null,position:out.state.battle.position,completedTurns:out.state.battle.completedTurns,reason:out.reason??null});
      state=json(out.state);final=out;
      if(out.status==='needs-row4')row4Input={boundaryId:out.boundary.id,words:Array(out.boundary.wordCount).fill(0)};else row4Input=undefined;
      if(out.status==='complete'||out.status==='unsupported'||out.status==='budget')break;
    }
    check('two-turn requested battle/camera schedule completes','complete',final.status);check('requested turn count',maxTurns,state.battle.completedTurns);
    const search=createCommonBattleSearch({adapterId:adapter.adapterId,advanceBatch:adapter.advanceBatch}),domains={boundaries:Object.fromEntries(report.boundaries.filter(x=>x.status==='needs-row4').map(x=>[x.boundary.id,{words:Array.from({length:x.boundary.wordCount},()=>({min:0,max:0,step:1}))}]))};
    const searchInitial=createBattleSearchState({adapterId:adapter.adapterId,initialStates:[initial()],domains,observations:[]});
    const searched=await search.run({state:searchInitial,batchSize:8,maxCandidates:100,maxAdapterCalls:100,maxTransitions:100000});
    check('explicit single-candidate search completes',true,searched.complete);check('all consistent branches survive',1,searched.state.survivors.length);
    if(searched.state.survivors[0])check('search continuation equals direct JSON continuation',state,searched.state.survivors[0].state);
    let cursor=searchInitial,last;
    for(let i=0;i<100;i++){last=await search.run({state:json(cursor),batchSize:1,maxCandidates:1,maxAdapterCalls:1,maxTransitions:100000});cursor=last.state;if(last.complete||last.error||cursor.blocked.length)break;}
    check('one-step JSON search resumes complete',true,last.complete);check('one-step JSON retains the same survivor states',searched.state.survivors.map(b=>b.state),cursor.survivors.map(b=>b.state));
    const [waiting]=await adapter.advanceBatch([{id:'consume',state:initial()}]);
    if(waiting.status==='needs-row4'){
      const candidate={boundaryId:waiting.boundary.id,words:Array(waiting.boundary.wordCount).fill(0)},[small]=await adapter.advanceBatch([{id:'consume',state:waiting.state,row4Input:candidate}],{maxTransitions:1});
      check('camera budget remains retryable','budget',small.status);check('camera budget records input adoption',true,small.row4Consumed);check('camera budget preserves previous world',waiting.state.world,small.state.world);check('camera budget preserves RNG',waiting.state.battle.seed,small.state.battle.seed);
      const [resumed]=await adapter.advanceBatch([{id:'consume',state:json(small.state)}]);
      check('camera retry needs no repeated candidate','observation',resumed.status);check('camera retry does not consume again',false,resumed.row4Consumed);check('camera input appears once in history',1,resumed.state.row4History.length);
    }
    report.directFinal={status:final.status,stateHash:hash(state),position:state.battle.position,completedTurns:state.battle.completedTurns,observations:state.observationsCompleted,row4Inputs:state.row4History.length};report.searchProgress=searched.progress;report.searchError=searched.error??null;report.blocked=searched.state.blocked.map(b=>({reason:b.reason,detail:b.detail??null}));
  }finally{report.milliseconds=performance.now()-start;await executor.release();}
  report.passed=report.failures.length===0;
  if(outputPath){await mkdir(dirname(resolve(outputPath)),{recursive:true});await writeFile(outputPath,JSON.stringify(report,null,2)+'\n');}
  return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const arg=n=>{const i=process.argv.indexOf(n);return i<0?undefined:process.argv[i+1];},r=await verifyCommonBattleCamera({ortDirectory:arg('--ort-dir'),outputPath:arg('--out'),maxTurns:Number(arg('--turns')??2)});
  console.log(JSON.stringify({passed:r.passed,tests:r.tests.length,failures:r.failures,boundaries:r.boundaries,searchError:r.searchError,blocked:r.blocked,milliseconds:r.milliseconds}));if(!r.passed)process.exitCode=1;
}
