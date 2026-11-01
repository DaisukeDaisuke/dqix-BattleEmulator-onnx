#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
import {createCameraGoalDispatcher,CAMERA_DISPATCH_MODELS} from '../graph-v2/camera-goal-dispatcher.mjs';
import {createCommonBattleSearch,createBattleSearchState} from '../runtime/common-battle-search.mjs';

const args=process.argv.slice(2),option=k=>{const i=args.indexOf(k);return i<0?undefined:args[i+1];};
const variedWord=Number(option('--vary-word')??0);if(!Number.isInteger(variedWord)||variedWord<0||variedWord>=12)throw Error('--vary-word must be an actual row index0..11');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),modelDir=resolve(option('--model-dir')??resolve(root,'graph-v2'));
const hash=b=>createHash('sha256').update(b).digest('hex'),clone=x=>structuredClone(x),restore=x=>JSON.parse(JSON.stringify(x));
const sourcePaths=(option('--sources')??'').split(',').filter(Boolean);if(!sourcePaths.length)throw Error('Supply --sources containing complete original goal-dispatch evidence. No ROM is loaded by this verifier.');
const sources=[];for(const path of sourcePaths){const bytes=await readFile(path),data=JSON.parse(bytes);if(data.executionComplete!==true||data.programUnmodified!==true||!data.romSHA256)throw Error('Complete unmodified original evidence required: '+path);sources.push({path,sha256:hash(bytes),data});}
async function modelBytes(name,extension){try{return await readFile(resolve(modelDir,name+extension));}catch(error){if(error.code!=='ENOENT'||!option('--fallback-model-dir'))throw error;return readFile(resolve(option('--fallback-model-dir'),name+extension));}}
const models=new Map();for(const name of CAMERA_DISPATCH_MODELS){const onnx=await modelBytes(name,'.onnx'),ir=JSON.parse(await modelBytes(name,'.json'));models.set(name,{name,onnx,ir,sha256:hash(onnx)});}
const ort=await loadLocalOrt(option('--ort-dir')),executor=createGraphExecutor({models,ortRuntime:ort});
const dispatcher=await createCameraGoalDispatcher({getModel:name=>models.get(name)?.ir,runGraph:executor.runGraph});
const modelIdentity=hash(JSON.stringify([...models.values()].map(m=>[m.name,m.sha256]))),adapterId='camera-goal-search-component-v1:'+modelIdentity;
function initialInput(c){return{roster:c.roster.map(r=>({id:r.id,start:r.start??0,goal:r.goal??255,auxiliaryNode:r.auxiliaryNode??255,expansionDepth:r.expansionDepth??0,preferredTarget:r.preferredTarget??255,secondaryTarget:r.secondaryTarget??255,faceNode:r.faceNode??255,movementPresence:r.movementPresence??1,flag400:!!r.flag400,descriptorPresent:r.descriptorPresent!==0,flag80:!!r.flag80,flag100:!!r.flag100,partyStatePresent:r.id<=3,partyDisabled:!!r.partyDisabled,position:r.position,lookupPresent:r.lookupPresent!==0})),commands:c.actionActors.map((id,i)=>({actionId:c.actionIds?.[i]??1,participants:c.actionPresent?.[i]===false?null:(c.actionParticipantLists?.[i]??[id]),targetId:c.actionTargets?.[i]??-1,targetPresent:(c.actionTargets?.[i]??-1)>=0})),currentActionIndex:c.currentActionIndex,priorInnerFlag:!!c.priorInnerFlag};}
function row4Words(bytes,count){return Array.from({length:count},(_,i)=>bytes[4*i]+256*bytes[4*i+1]+65536*bytes[4*i+2]+16777216*bytes[4*i+3]);}
function projected(s){return{returnValue:s.returnValue[0],rows:Array.from({length:s.rosterCount[0]},(_,i)=>({id:s.ids[i],startNode:s.actors[i*8],goalNode:s.actors[i*8+1],auxiliaryNode:s.actors[i*8+2],faceNode:s.actors[i*8+6]}))};}
async function advanceBatch(lanes){
  const result=Array(lanes.length),execute=[];
  lanes.forEach((lane,index)=>{
    assert.deepEqual(Object.keys(lane).sort(),lane.row4Input?['id','row4Input','state']:['id','state']);
    if(lane.state.phase==='finished'){assert.equal(lane.row4Input,undefined);result[index]={id:lane.id,state:clone(lane.state),status:'complete'};return;}
    if(!lane.row4Input){result[index]={id:lane.id,state:clone(lane.state),status:'needs-row4',boundary:{id:'dispatch:0',kind:'camera-row4',wordCount:lane.state.row4WordCount}};return;}
    assert.equal(lane.row4Input.boundaryId,'dispatch:0');execute.push({lane,index,input:{...clone(lane.state.input),row4Words:clone(lane.row4Input.words)}});
  });
  if(execute.length){const computed=await dispatcher.run({rows:execute.map(x=>x.input)});for(let i=0;i<execute.length;i++){
    const{lane,index}=execute[i],camera=computed.states[i],state={phase:'finished',input:clone(lane.state.input),camera:clone(camera)};
    result[index]=camera.supported[0]?{id:lane.id,state,row4Consumed:true,status:'observation',observationId:'camera:0',snapshot:projected(camera)}:{id:lane.id,state,row4Consumed:true,status:'unsupported',reason:'Declared goal-dispatch component does not cover this branch'};
  }}
  return result;
}
const search=createCommonBattleSearch({adapterId,advanceBatch}),report={schema:'dq9-common-battle-search-camera-proof-v1',createdAt:new Date().toISOString(),provider:'ONNX Runtime Web WASM',gpuExecuted:false,sources:sources.map(s=>({path:s.path,sha256:s.sha256,romSHA256:s.data.romSHA256})),models:[...models.values()].map(m=>({name:m.name,sha256:m.sha256})),runtimeSHA256:hash(await readFile(resolve(root,'runtime/common-battle-search.mjs'))),cases:[],originalCases:0,fieldsCompared:0,mismatches:0,ambiguousCases:0,jsonResumes:0,scope:'Actual ONNX goal-dispatch component plus host exhaustive search. Explicit verification-only neighborhoods vary the explicitly selected word by -1,0,+1 while holding every other supplied row word at the declared fixture input. Original observations filter goal outputs only. The known original input must survive and its computed goals and all supplied retained row+4 words must match the unmodified original. This does not establish all alternate candidates against original execution, whole camera geometry, damage, RNG transitions or multiple battle turns.'};
let start=performance.now();
try{for(const source of sources)for(const original of source.data.results){
  if(!original.ok||!original.strictInitializedMemory||!original.completeFunctionExecuted||original.case.kind!=='camera_goal_dispatcher_math')throw Error('Invalid complete original case '+original.case?.id);
  const c=original.case,input=initialInput(c),expected={returnValue:original.integerResult,rows:original.rows.map(r=>({id:r.id,startNode:r.startNode,goalNode:r.goalNode,auxiliaryNode:r.auxiliaryNode,faceNode:r.faceNode}))};
  if(variedWord>=c.row4Words.length)throw Error('Selected uncertainty word does not exist in '+c.id);
  const words=c.row4Words.map((value,i)=>i!==variedWord?{min:value,max:value}:{min:Math.max(0,value-1),max:Math.min(4294967295,value+1)});
  const initial=createBattleSearchState({adapterId,initialStates:[{phase:'await-row4',input,row4WordCount:c.row4Words.length}],domains:{default:{words}},observations:[{id:'camera:0',checks:[{path:['returnValue'],equals:expected.returnValue},{path:['rows'],equals:expected.rows}]}]});
  const whole=await search.run({state:initial,batchSize:8});assert.equal(whole.error,undefined);assert.equal(whole.complete,true);assert.equal(whole.state.blocked.length,0);
  const known=whole.state.survivors.find(b=>b.choices[0].words.every((v,i)=>v===c.row4Words[i]));assert.ok(known,'Original input disappeared: '+c.id);
  assert.deepEqual(projected(known.state.camera),expected);assert.deepEqual(row4Words(known.state.camera.observedRow4Bytes,c.row4Words.length),original.finalStackRow4Words);
  let state=initial,stepped,count=0;do{stepped=await search.run({state,batchSize:1,maxCandidates:1,maxAdapterCalls:1});assert.equal(stepped.error,undefined);state=restore(stepped.state);report.jsonResumes++;assert.ok(++count<40,'Resume did not progress');}while(!stepped.complete);
  const canonical=s=>s.survivors.map(b=>JSON.stringify({choices:b.choices,state:b.state,consumed:b.consumedBoundaries,matched:b.matchedObservations})).sort();assert.deepEqual(canonical(state),canonical(whole.state));
  const fields=1+5*expected.rows.length+c.row4Words.length;report.fieldsCompared+=fields;report.originalCases++;if(whole.state.survivors.length>1)report.ambiguousCases++;
  report.cases.push({id:c.id,variedWord,explicitDomain:words,candidates:whole.state.stats.row4Assignments,survivors:whole.state.survivors.length,rejectedCandidates:whole.state.stats.row4Assignments-whole.state.survivors.length,retainedOriginal:true,originalProjectionFields:fields,jsonResumes:count,mismatches:0});
}}
finally{await executor.release();}
report.elapsedMs=performance.now()-start;report.executionCounts=executor.counts;report.passed=true;report.variedWord=variedWord;report.filteredCases=report.cases.filter(c=>c.rejectedCandidates>0).length;
if(option('--out')){await mkdir(dirname(resolve(option('--out'))),{recursive:true});await writeFile(option('--out'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({passed:report.passed,originalCases:report.originalCases,fieldsCompared:report.fieldsCompared,mismatches:report.mismatches,ambiguousCases:report.ambiguousCases,filteredCases:report.filteredCases,variedWord,jsonResumes:report.jsonResumes,elapsedMs:report.elapsedMs,executionCounts:report.executionCounts,scope:report.scope}));
