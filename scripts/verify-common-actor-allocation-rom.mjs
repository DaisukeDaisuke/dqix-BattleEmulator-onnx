#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
import {createCommonAnimationActorResourceRunner,COMMON_ANIMATION_ACTOR_RESOURCE_MODELS} from '../runtime/common-animation-actor-resource.mjs';
import {initialCommonResourceLoader} from '../runtime/common-resource-loader.mjs';

const args=process.argv.slice(2),option=n=>{const i=args.indexOf(n);return i<0?undefined:args[i+1];},root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=x=>createHash('sha256').update(x).digest('hex'),clone=x=>structuredClone(x),sourceBytes=await readFile(option('--source')),source=JSON.parse(sourceBytes);
if(!source.executionComplete||!source.programUnmodified||source.romSHA256!=='b7a7f82f9da6f5bd08b5ae436d67cbde020f15e79534e0d34853201cd24d775d')throw Error('Unchanged original ROM evidence is required');
const models=new Map();for(const name of COMMON_ANIMATION_ACTOR_RESOURCE_MODELS){const onnx=await readFile(resolve(root,'graph-v2',name+'.onnx')),ir=JSON.parse(await readFile(resolve(root,'graph-v2',name+'.json')));models.set(name,{name,onnx,ir,sha256:hash(onnx)});}
const ort=await loadLocalOrt(option('--ort-dir')),executor=createGraphExecutor({models,ortRuntime:ort});let allocationCalls=0;
const runner=createCommonAnimationActorResourceRunner({getModel:name=>models.get(name)?.ir,runGraph:executor.runGraph,onTrace:({model})=>{if(model==='rom-common-hmrf-allocator')allocationCalls++;}});
const report={schema:'dq9-common-actor-allocation-rom-verification-v1',sourceSHA256:hash(sourceBytes),models:[...models.values()].map(({name,sha256})=>({name,sha256})),runtimeSourceSHA256:hash(await readFile(resolve(root,'runtime/common-animation-actor-resource.mjs'))),allocatorRuntimeSHA256:hash(await readFile(resolve(root,'runtime/common-safe-allocator.mjs'))),fieldsCompared:0,mismatches:0,examples:[],cases:[],boundaries:[],scope:'Whole original actor precheck with a nonnull file pointer, including actual SafeAllocator null/exhausted allocation and resulting removal/cleanup. All raw allocator inputs and loader pointers are supplied initially; the original final values only enter comparisons. Successful archive installation remains an explicit boundary.'};
const fields=['taskIds','taskStatuses','taskTypes','fileLengthsU16','scratchFirstWords','scratchNumWords'];
function compare(id,key,actual,expected){if(Array.isArray(expected)){if(!Array.isArray(actual)||actual.length!==expected.length)throw Error('Shape mismatch '+key);expected.forEach((v,i)=>compare(id,key+'['+i+']',actual[i],v));return;}report.fieldsCompared++;if(actual!==expected){report.mismatches++;if(report.examples.length<40)report.examples.push({id,key,actual,expected});}}
function initial(c){
  const loader=initialCommonResourceLoader({contract:'dq9-functional-original-file-loader-v1',initialLayout:'empty-v1',scratchBytes:c.scratchBytes,scratchBaseU16:[0x1000,0x238],taskCounter:c.taskCounter,scratchRightArenaUsage:c.scratchRightArenaUsage??0});
  for(const field of fields)loader[field]=[...c[field]];loader.taskCount=c.taskCount;loader.rightmostAllocationByte=c.priorRightmostAllocationByte??0;loader.dataPointerU16=[...c.dataPointerU16];loader.slots.forEach(slot=>slot.directory=20);
  return{state:{scriptFlagsU16:[...c.scriptFlagsU16],resourceStateU16:[...c.resourceStateU16]},loaderState:loader,allocators:{37318656:clone(c.allocator)},context:{...c,firstParticipantPresent:!!c.firstParticipantPresent,partyObjectPresent:!!c.actorObjectPresent,allocatorU16:[0x7000,0x239],globalScriptOwnerPresent:true,globalAllocatorIndex:c.allocatorIndex}};
}
try{
  for(const original of source.results){
    if(!original.ok||!original.strictInitializedMemory||!original.completeFunctionExecuted)throw Error('Strict whole original caller is required: '+original.case.id);
    const c=original.case,input=initial(c),before=report.mismatches;allocationCalls=0;
    const result=await runner.run(input);compare(c.id,'complete',result.complete,true);compare(c.id,'returnValue',result.returnValue,original.integerResult);
    compare(c.id,'actualAllocationCallCount',allocationCalls,original.originalAllocationCalls);
    compare(c.id,'scriptFlagsU16',input.state.scriptFlagsU16,original.actorResource.scriptFlagsU16);compare(c.id,'resourceStateU16',input.state.resourceStateU16,original.actorResource.resourceStateU16);
    for(const[key,want]of Object.entries(original.allocator))compare(c.id,'allocator.'+key,input.allocators[37318656][key],want);
    for(const field of fields)compare(c.id,'loader.'+field,input.loaderState[field],original.loaderState[field]);
    compare(c.id,'loader.taskCount',input.loaderState.taskCount,original.loaderState.taskCount);compare(c.id,'loader.taskCounter',input.loaderState.taskCounter,original.loaderState.taskCounter);
    report.cases.push({id:c.id,allocationCalls,returnValue:result.returnValue,mismatches:report.mismatches-before});
  }
  // The separately ROM-proved allocator can succeed. The production adapter
  // must preserve that allocation and stop before the unimplemented installer,
  // including across JSON serialization; it must never allocate twice.
  const c=clone(source.results.find(r=>r.case.id==='nonnull-1-2-1').case);c.allocator.backU16=[0x4100,0x23a];
  const input=initial(c);allocationCalls=0;const pending=await runner.run(input),after=JSON.stringify(input),calls=executor.counts.ortCalls;
  const resumed=JSON.parse(after),again=await runner.run(resumed);
  const passed=!pending.complete&&pending.requiresArchiveInstaller===true&&pending.boundary?.kind==='original-archive-installation'&&allocationCalls===1&&input.allocators[37318656].frontU16[0]===0x400c&&!again.complete&&executor.counts.ortCalls===calls&&JSON.stringify(resumed)===after;
  report.boundaries.push({kind:'successful-allocation-preserved-at-installer-boundary',passed,originalWholeInstallerClaim:false});compare('boundary','preserved-without-reallocation',passed,true);
}finally{await executor.release();}
report.passed=report.mismatches===0&&report.boundaries.every(x=>x.passed);await writeFile(option('--out'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,fields:report.fieldsCompared,mismatches:report.mismatches,examples:report.examples}));if(!report.passed)process.exitCode=1;
