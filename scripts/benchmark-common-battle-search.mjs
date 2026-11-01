#!/usr/bin/env node
// Measure complete declared battle/camera search work, not isolated graph calls.
// The fixture contains initial conditions and explicit search domains only.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {cpus,arch,platform,availableParallelism} from 'node:os';
import {performance} from 'node:perf_hooks';
import {createCommonBattleSearch,createBattleSearchState} from '../runtime/common-battle-search.mjs';

const args=process.argv.slice(2);
const option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const clone=value=>JSON.parse(JSON.stringify(value));
const hash=value=>createHash('sha256').update(value).digest('hex');
const runtimeRoot=resolve(option('--runtime-root')??resolve(dirname(fileURLToPath(import.meta.url)),'..'));
const modelRoot=resolve(option('--model-dir')??resolve(runtimeRoot,'graph-v2'));
const batchSizes=(option('--batch-sizes')??'1,8').split(',').map(Number);
const repeats=Number(option('--repeats')??2);
assert(batchSizes.length>0&&batchSizes.every(n=>Number.isSafeInteger(n)&&n>0));
assert(Number.isSafeInteger(repeats)&&repeats>0);
if(!option('--input'))throw Error('Use --input initial-and-search-conditions.json --model-dir graphs --ort-dir local-onnxruntime-web-dist');
const fixtureBytes=await readFile(option('--input')),fixture=JSON.parse(fixtureBytes);
assert.equal(fixture.schema,'dq9-common-battle-search-benchmark-input-v1');
assert.equal(fixture.expectedOutputsUsed,false);
assert(fixture.input&&fixture.definitions&&fixture.seedRange&&fixture.domains);
assert(Number.isSafeInteger(fixture.maxTurns)&&fixture.maxTurns>0);
// ROM bytes, file tasks, and development-only archive availability are not
// inputs to the product runtime or this benchmark.
for(const key of ['initialCameraArchives','initialDefaultFallback','initialActorPrograms','rom','romPath']){
 if(Object.hasOwn(fixture.input.camera?.initial??{},key)||Object.hasOwn(fixture,key))throw Error('Development ROM data is outside the benchmark input: '+key);
}
const runtimeManifest=option('--runtime-manifest')?await readFile(option('--runtime-manifest')):null;
const setupStarted=performance.now();
const [{createCommonBattleCameraAdapter,COMMON_BATTLE_CAMERA_MODELS},{createGraphExecutor},{loadLocalOrt}]=await Promise.all([
 'runtime/common-battle-camera.mjs','web/graph-executor.mjs','scripts/verify-common-battle.mjs'
].map(path=>import(pathToFileURL(resolve(runtimeRoot,path)))));
const program=JSON.parse(await readFile(resolve(modelRoot,'common-battle-program.json')));
const baseProgramSHA256=hash(JSON.stringify(program)),models=new Map(),overlaid=new Set();
async function modelBytes(name,ext){
 if(option('--overlay-dir'))try{const bytes=await readFile(resolve(option('--overlay-dir'),name+ext));overlaid.add(name);return bytes;}catch(error){if(error.code!=='ENOENT')throw error;}
 return readFile(resolve(modelRoot,name+ext));
}
for(const name of new Set([...program.modules.map(m=>m.name),...COMMON_BATTLE_CAMERA_MODELS,'rom-camera-admission-entry4'])){
 const onnx=await modelBytes(name,'.onnx'),ir=JSON.parse(await modelBytes(name,'.json'));
 models.set(name,{name,onnx,ir,sha256:hash(onnx)});
}
for(const m of program.modules)if(models.get(m.name).sha256!==m.sha256){
 if(!overlaid.has(m.name))throw Error('Model binding mismatch '+m.name);
 m.sha256=models.get(m.name).sha256;
}
for(const name of models.keys())if(!program.modules.some(m=>m.name===name))program.modules.push({name,onnx:name+'.onnx',ir:name+'.json',sha256:models.get(name).sha256});
const ort=await loadLocalOrt(option('--ort-dir'));
const executor=createGraphExecutor({models,ortRuntime:ort});
const getModel=async name=>{if(!models.has(name))throw Error('Missing shared model '+name);return models.get(name).ir;};
const adapter=await createCommonBattleCameraAdapter({program,definitions:fixture.definitions,getModel,runGraph:executor.runGraph});
const search=createCommonBattleSearch(adapter);
const template=adapter.createInitialState({input:fixture.input,maxTurns:fixture.maxTurns});
const initial=()=>createBattleSearchState({adapterId:adapter.adapterId,initialState:template,seedPath:['battle','seed'],seedRange:fixture.seedRange,domains:fixture.domains,observations:fixture.observations??[]});
const difference=(after,before)=>Object.fromEntries(Object.keys(after).map(k=>[k,after[k]-(before[k]??0)]));
const report={
 schema:'dq9-common-battle-search-benchmark-v1',createdAt:new Date().toISOString(),
 provider:'ONNX Runtime Web WASM',gpuExecuted:false,node:process.version,
 environment:{platform:platform(),architecture:arch(),logicalCPUs:cpus().length,availableParallelism:availableParallelism(),cpuModel:cpus()[0]?.model??null,wasmThreads:ort.env.wasm.numThreads,hostExclusive:false},
 runtimeManifestSHA256:runtimeManifest?hash(runtimeManifest):null,searchSourceSHA256:hash(await readFile(new URL('../runtime/common-battle-search.mjs',import.meta.url))),
 inputSHA256:hash(fixtureBytes),definitionsSHA256:hash(JSON.stringify(fixture.definitions)),
 sourceSHA256:hash(await readFile(fileURLToPath(import.meta.url))),baseProgramSHA256,programSHA256:hash(JSON.stringify(program)),
 modelHashes:Object.fromEntries([...models].map(([name,m])=>[name,m.sha256])),explicitOverlayModels:[...overlaid],
 scope:'The complete declared common numerical battle, generated commands, required camera continuation and external row4 search. Completed branches are bounded requested turn sequences, not completed game battles. All surviving computed states must be identical across batch sizes. No isolated-kernel/C++ comparison or hardware-GPU extrapolation.',
 maxTurns:fixture.maxTurns,seedRange:fixture.seedRange,domainsSHA256:hash(JSON.stringify(fixture.domains)),observationCount:(fixture.observations??[]).length,
 setupMs:performance.now()-setupStarted,warmup:null,samples:[],passed:false
};
function resultIdentity(state){
 return hash(JSON.stringify(state.survivors.map(branch=>({
  initialSeed:branch.initialSeed,choices:branch.choices,consumedBoundaries:branch.consumedBoundaries,
  matchedObservations:branch.matchedObservations,state:branch.state
 })).map(value=>JSON.stringify(value)).sort()));
}
async function execute(batchSize){
 const before=clone(executor.counts),started=performance.now();
 const result=await search.run({state:initial(),batchSize,maxCandidates:fixture.maxCandidates??100000,maxAdapterCalls:fixture.maxAdapterCalls??100000,maxTransitions:fixture.maxTransitions??100000});
 const elapsedMs=performance.now()-started,complete=result.complete===true;
 const output={batchSize,elapsedMs,complete,budgetExhausted:result.budgetExhausted,stopReason:result.stopReason??null,error:result.error??null,progress:result.progress,runStats:result.runStats,executionCounts:difference(executor.counts,before),completedBranches:result.state.survivors.length,completedRequestedTurns:result.state.survivors.reduce((n,b)=>n+b.state.battle.completedTurns,0),finalStatesSHA256:resultIdentity(result.state),blocked:result.state.blocked.map(b=>({reason:b.reason,detail:b.detail}))};
 if(complete){output.completedBranchesPerSecond=output.completedBranches*1000/elapsedMs;output.completedRequestedTurnsPerSecond=output.completedRequestedTurns*1000/elapsedMs;}
 return output;
}
try{
 // The first full run is separately reported and excluded from warm throughput.
 // It warms every model used by these same declared inputs, not another kernel.
 report.warmup=await execute(Math.max(...batchSizes));
 if(!report.warmup.complete)throw Error('The declared benchmark is incomplete; no completed-work throughput is reported');
 console.error(JSON.stringify({phase:'warmup',...report.warmup}));
 for(let repeat=0;repeat<repeats;repeat++)for(const batchSize of repeat%2?[...batchSizes].reverse():batchSizes){
  const sample={repeat,...await execute(batchSize)};report.samples.push(sample);
  assert.equal(sample.complete,true,'The exact declared search must complete');
  assert.equal(sample.finalStatesSHA256,report.warmup.finalStatesSHA256,'Batch scheduling changed a computed surviving state');
  assert.deepEqual(sample.progress.stats,report.warmup.progress.stats,'Batch scheduling changed search work');
  console.error(JSON.stringify({phase:'measured',...sample}));
 }
 report.passed=true;
}catch(error){report.error=error.stack;process.exitCode=1;}
finally{await executor.release();}
if(option('--out')){await mkdir(dirname(resolve(option('--out'))),{recursive:true});await writeFile(option('--out'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({passed:report.passed,setupMs:report.setupMs,warmup:report.warmup,samples:report.samples,error:report.error}));
