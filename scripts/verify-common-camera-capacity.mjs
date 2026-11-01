#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
import {cameraParentModelNames,createCameraParentRunner,createCameraRow4BoundaryPlanner} from '../graph-v2/camera-parent-runner.mjs';
const args=process.argv.slice(2),option=k=>{const i=args.indexOf(k);return i<0?undefined:args[i+1];},clone=x=>structuredClone(x),hash=x=>createHash('sha256').update(x).digest('hex');
const modelDir=option('--model-dir'),fallback=option('--fallback-model-dir');
async function bytes(name,extension){try{return await readFile(resolve(modelDir,name+extension));}catch(error){if(error.code!=='ENOENT'||!fallback)throw error;return readFile(resolve(fallback,name+extension));}}
 const models=new Map();for(const name of new Set([...cameraParentModelNames(4),...cameraParentModelNames(12),'rom-camera-admission-entry4'])){const onnx=await bytes(name,'.onnx'),ir=JSON.parse(await bytes(name,'.json'));models.set(name,{name,onnx,ir,sha256:hash(onnx)});}
const ort=await loadLocalOrt(option('--ort-dir')),executor=createGraphExecutor({models,ortRuntime:ort}),runtime={getModel:async name=>models.get(name)?.ir,runGraph:executor.runGraph};
const proof={schema:'dq9-camera-capacity-contract-proof-v1',createdAt:new Date().toISOString(),provider:'ONNX Runtime Web WASM',gpuExecuted:false,models:[...models.values()].map(m=>({name:m.name,sha256:m.sha256})),tests:[],scope:'Actual graph execution of boundary gating, tensor capacity, skipped uncertainty and legacy/new capacity equivalence. These checks do not replace direct original-game comparisons for twelve-object goal, route or full battle behavior.'};
function initial(c){return{battleType:0,sceneByte:131,enabled:true,sceneMovementEnabled:true,priorInnerFlag:false,currentActionIndex:c.currentActionIndex,row4Words:clone(c.row4Words),roster:c.roster.map(a=>({...clone(a),visualFlags:(a.flag80?128:0)+(a.flag100?256:0)+80,visualPresent:true,routeCount:0,storedRoute:Array.from({length:16},(_,i)=>i+81),routeStep:-3,routeTime:50,routePositionXYZ:clone(a.position),resetPositionXYZ:[11,22,33],partyStatePresent:a.id<=3,partyDisabled:false,partyMovementBlocked:false,dead:false,lookupPresent:true})),commands:c.actionActors.map((id,i)=>({actionId:c.actionIds[i],participants:c.actionPresent?.[i]===false?[]:clone(c.actionParticipantLists?.[i]??[id]),targets:c.actionTargets[i]<0?[]:[c.actionTargets[i]],targetId:c.actionTargets[i],targetPresent:c.actionTargets[i]>=0}))};}
async function test(name,run){await run();proof.tests.push({name,passed:true});}
try{
 const twelve=JSON.parse(await readFile(option('--source'))).cases.find(c=>c.roster.length===12&&c.currentActionIndex===0),base=initial(twelve),boundary=await createCameraRow4BoundaryPlanner(runtime),parent12=await createCameraParentRunner(runtime),parent4=await createCameraParentRunner({...runtime,capacity:4});
 await test('Only actual compact rows are uncertainty inputs; inactive dispatch requests none',async()=>{
  const rows=Array.from({length:8},()=>clone(base));rows.forEach(r=>delete r.row4Words);
  rows[1].battleType=800;rows[2].battleType=800;rows[2].currentActionIndex=4;
  rows[3].commands[0].targetId=-1;rows[3].commands[0].targets=[];rows[3].commands[0].targetPresent=false;
  rows[4].commands[0].targetId=0;rows[4].commands[0].targets=[0];rows[5].enabled=false;rows[6].commands=[];rows[7].commands[0].participants=[];
  const before=JSON.stringify(rows),out=await boundary.run({rows});assert.equal(JSON.stringify(rows),before);assert.deepEqual(out.boundaries.map(b=>b.wordCount),[12,0,9,0,0,0,0,0]);assert.deepEqual(out.boundaries[0].rowIds,[0,1,2,3,192,193,194,195,196,197,198,199]);assert.deepEqual(out.boundaries[2].rowIds,[0,192,193,194,195,196,197,198,199]);assert.equal(out.graphCalls,3);proof.boundaries=out.boundaries;
 });
 await test('Skipped dispatcher accepts no external row+4 words',async()=>{
  const rows=[clone(base),clone(base)];rows[0].battleType=800;rows[1].commands[0].targetId=-1;rows[1].commands[0].targets=[];rows[1].commands[0].targetPresent=false;rows.forEach(r=>r.row4Words=[]);const result=await parent12.run({rows});assert.equal(result.complete,true);for(const state of result.states)assert.deepEqual(state.row4Words,[]);
 });
 await test('Legacy four-object and common twelve-object parent produce identical visible states',async()=>{
  const sources=JSON.parse(await readFile(option('--legacy-source'))).cases,rows=sources.filter(c=>c.roster.length<=4).map(initial);const a=await parent4.run({rows}),b=await parent12.run({rows});assert.equal(a.complete,true);assert.equal(b.complete,true);assert.deepEqual(b.states,a.states);proof.legacyParentCases=rows.length;
 });
 await test('Twelve-object parent computes every roster row and retains supplied words',async()=>{
  const result=await parent12.run({rows:[base]});assert.equal(result.complete,true);assert.equal(result.states[0].roster.length,12);assert.equal(result.states[0].row4Words.length,12);assert.deepEqual(result.states[0].activeRosterIds,base.roster.map(a=>a.id));proof.twelveParentState=result.states[0];proof.twelveParentGraphCalls=result.graphCalls;
 });
 await test('Raw72 records retain final record ordering while active compact order is bounded60',async()=>{
  const name='rom-camera-route-byte-prepare72',ir=models.get(name).ir,defaults=Object.fromEntries(Object.entries(ir.contract.defaults).map(([k,v])=>[k,Array.isArray(v)?clone(v):[v]])),row={...defaults,actionCount:[72],currentActionIndex:[71],actionActors:Array(72).fill(65535),actionPresent:Array(72).fill(false)};row.actionActors[71]=192;row.actionPresent[71]=true;
  const overflow={...clone(row),actionActors:Array(72).fill(0),actionPresent:Array(72).fill(true)};
  const output=await executor.runGraph(name,[row,overflow]);assert.equal(!!output[0].supported[0],true);assert.equal(output[0].orderedActionCount[0],1);assert.equal(output[0].nextMeta[7],1);assert.equal(!!output[1].supported[0],false);
 });
}finally{await executor.release();}
proof.passed=true;proof.executionCounts=executor.counts;
if(option('--out')){await mkdir(dirname(resolve(option('--out'))),{recursive:true});await writeFile(option('--out'),JSON.stringify(proof,null,2)+'\n');}
console.log(JSON.stringify({passed:proof.passed,tests:proof.tests,legacyParentCases:proof.legacyParentCases,twelveParentGraphCalls:proof.twelveParentGraphCalls,executionCounts:proof.executionCounts}));
