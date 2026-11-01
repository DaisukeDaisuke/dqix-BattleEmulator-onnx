#!/usr/bin/env node
// Initial operands drive both shared graphs. Original outputs are comparison only.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
import {createCommonAnimationActorResourceRunner} from '../runtime/common-animation-actor-resource.mjs';
import {initialCommonResourceLoader} from '../runtime/common-resource-loader.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=x=>createHash('sha256').update(x).digest('hex');
const scalar=(o,k)=>Number(o[k]?.[0]);
const signed32=x=>x>=0x80000000?x-0x100000000:x;

export async function verifyActorResource({sourcePath,ortDirectory}={}){
  const bytes=await readFile(sourcePath),source=JSON.parse(bytes);
  if(!source.executionComplete||!source.programUnmodified||!source.results?.length||source.results.some(r=>!r.strictInitializedMemory))throw Error('Unchanged original callers with strict initialized memory are required');
  const models=new Map();
  for(const name of['rom-common-animation-actor-resource','rom-common-resource-loader']){
    const irBytes=await readFile(resolve(root,'graph-v2',name+'.json')),onnx=await readFile(resolve(root,'graph-v2',name+'.onnx'));
    models.set(name,{name,ir:JSON.parse(irBytes),onnx,sha256:hash(onnx),irSha256:hash(irBytes)});
  }
  const ort=await loadLocalOrt(ortDirectory),executor=createGraphExecutor({models,ortRuntime:ort});
  const runner=createCommonAnimationActorResourceRunner({getModel:name=>models.get(name)?.ir,runGraph:executor.runGraph});
  const report={schema:'dq9-common-actor-resource-arm-verification-v1',source:resolve(sourcePath),sourceSHA256:hash(bytes),romSHA256:source.romSHA256,cases:[],boundaries:[],fieldsCompared:0,mismatches:0,examples:[],models:[...models.values()].map(({name,sha256,irSha256})=>({name,sha256,irSha256})),runtimeVersion:ort.env.versions.web,
    scope:'Whole original actor-resource precheck for inactive/rejected participants, static and computed filename queueing, full queue failure, task wait, missing task and null-file removal. Initial state alone drives ONNX actor decisions and common loader id/status/removal decisions. The separate nonempty archive installer is not claimed.'};
  function compare(id,key,got,want){
    if(Array.isArray(want)){if(!Array.isArray(got)||got.length!==want.length)throw Error(id+': shape mismatch '+key);want.forEach((v,i)=>compare(id,key+'['+i+']',got[i],v));return;}
    report.fieldsCompared++;if(got!==want){report.mismatches++;if(report.examples.length<50)report.examples.push({id,key,actual:got,expected:want});}
  }
  async function call(name,patch){
    const model=models.get(name).ir,values={...model.contract.defaults,...patch},feeds={};
    for(const d of model.inputs){const value=values[d.name];if(value===undefined)throw Error('Missing initial/computed input '+d.name);const row=Array.isArray(value)?value:[value];feeds[d.name]=d.dtype==='bool'?row.map(Boolean):row;}
    return(await executor.runGraph(name,[feeds]))[0];
  }
  try{
    for(const row of source.results){
      const c=row.case,id=c.id,before=report.mismatches;
      const loaderFields=['taskIds','taskStatuses','taskTypes','fileLengthsU16','scratchFirstWords','scratchNumWords'];
      const loader={...Object.fromEntries(loaderFields.map(k=>[k,c[k]])),taskCount:c.taskCount,taskCounter:c.taskCounter,scratchBytes:c.scratchBytes,priorRightmostAllocationByte:c.priorRightmostAllocationByte??0,scratchRightArenaUsage:c.scratchRightArenaUsage??0,scratchBaseU16:[0x1000,0x238]};
      const allocatorU16=c.allocatorPresent?[0x7000,0x239]:[0,0];
      const runtimeLoader=initialCommonResourceLoader({contract:'dq9-functional-original-file-loader-v1',initialLayout:'empty-v1',scratchBytes:c.scratchBytes,scratchRightArenaUsage:c.scratchRightArenaUsage??0,scratchBaseU16:[0x1000,0x238],taskCounter:c.taskCounter});
      for(const field of loaderFields)runtimeLoader[field]=[...c[field]];
      runtimeLoader.taskCount=c.taskCount;runtimeLoader.rightmostAllocationByte=c.priorRightmostAllocationByte??0;
      // The original harness initializes every task directory byte to20 before
      // the first guest instruction, including inactive slots.
      runtimeLoader.slots.forEach(slot=>slot.directory=20);
      const runtimeState={scriptFlagsU16:[...c.scriptFlagsU16],resourceStateU16:[...c.resourceStateU16]};
      const runtimeResult=await runner.run({state:runtimeState,loaderState:runtimeLoader,context:{...c,firstParticipantPresent:!!c.firstParticipantPresent,partyObjectPresent:!!c.actorObjectPresent,allocatorU16}});
      const queryTaskId=signed32(c.resourceStateU16[2]+65536*c.resourceStateU16[3]);
      const inputs={...c,stage:0,partyObjectPresent:!!c.actorObjectPresent,globalAllocatorIndex:c.allocatorIndex??0,loadedFilePresent:false};
      let out=await call('rom-common-animation-actor-resource',inputs),operations=1,request=null,loaderOut=null;
      if(scalar(out,'requestTaskStatus')){
        const status=await call('rom-common-resource-loader',{...loader,operation:3,queryTaskId});
        if(!scalar(status,'supported'))throw Error(id+': original status query requires another producer');
        inputs.taskStatusReturned=true;inputs.taskStatus=scalar(status,'taskStatus');
        out=await call('rom-common-animation-actor-resource',inputs);operations++;
      }
      if(scalar(out,'requestLoadedFile')){
        // This cohort's supplied loader data pointers are all null. No observed
        // GetLoadedFile result is injected into the graph.
        inputs.loadedFileReturned=true;inputs.loadedFilePresent=false;
        out=await call('rom-common-animation-actor-resource',inputs);operations++;
      }
      if(scalar(out,'requestQueue')){
        const kind=scalar(out,'requestPathKind');
        request=kind===0?{outer:'s019bm.chr',inner:''}:{outer:'chara_mp.gp2',inner:'mp'+String(scalar(out,'requestBodyNumber')).padStart(2,'0')+String(scalar(out,'requestWeaponNumber')).padStart(2,'0')+'bm.chr'};
        if(row.actorResourceQueueEntry){
          compare(id,'queueEntry.resourceStateU16',out.nextResourceStateU16,row.actorResourceQueueEntry.resourceStateU16);
          compare(id,'queueEntry.scriptFlagsU16',out.nextScriptFlagsU16,row.actorResourceQueueEntry.scriptFlagsU16);
          compare(id,'queueEntry.taskType',scalar(out,'requestTaskType'),row.actorResourceQueueEntry.taskType);
          compare(id,'queueEntry.innerFilename',request.inner||null,row.actorResourceQueueEntry.innerFilename??null);
        }
        loaderOut=await call('rom-common-resource-loader',{...loader,operation:0,requestValid:true,requestTaskType:scalar(out,'requestTaskType'),requestExternalAllocatorU16:allocatorU16});
        if(!scalar(loaderOut,'supported')){
          if(!scalar(loaderOut,'queueFull')||row.ok||!row.error?.includes('coproc_moveto_Wait_for_interrupt')||row.failedPc!=='0x020cb6c0'||!row.actorResourceQueueEntry)throw Error(id+': unsupported original boundary');
          compare(id,'fullQueue.callNotCompleted',scalar(out,'callCompleted'),0);
          compare(id,'runtime.fullQueue.callNotCompleted',runtimeResult.complete,false);
          compare(id,'runtime.fullQueue.originalBoundary',runtimeState.boundary?.kind,'original-queue-full-panic');
          compare(id,'runtime.fullQueue.preCallState',runtimeState.resourceStateU16,row.actorResourceQueueEntry.resourceStateU16);
          report.boundaries.push({id,boundary:'original-queue-full-panic-wait-for-interrupt',pc:row.failedPc,callCompleted:false,mismatches:report.mismatches-before});
          continue;
        }
        out=await call('rom-common-animation-actor-resource',{...inputs,stage:1,queueReturned:true,queuedTaskId:scalar(loaderOut,'queuedTaskId')});operations++;
      }else if(scalar(out,'requestRemoveTask')){
        loaderOut=await call('rom-common-resource-loader',{...loader,operation:2,queryTaskId});
        if(!scalar(loaderOut,'supported'))throw Error(id+': original task removal requires another producer');
        out=await call('rom-common-animation-actor-resource',{...inputs,stage:4,removeReturned:true});operations++;
      }
      if(!row.ok||!row.completeFunctionExecuted)throw Error(id+': original call did not complete');
      compare(id,'supported',scalar(out,'supported'),1);compare(id,'callCompleted',scalar(out,'callCompleted'),1);
      compare(id,'returnValue',scalar(out,'returnValue'),row.integerResult);
      compare(id,'scriptFlagsU16',out.nextScriptFlagsU16,row.actorResource.scriptFlagsU16);
      compare(id,'resourceStateU16',out.nextResourceStateU16,row.actorResource.resourceStateU16);
      compare(id,'runtime.complete',runtimeResult.complete,true);
      compare(id,'runtime.returnValue',runtimeResult.returnValue,row.integerResult);
      compare(id,'runtime.scriptFlagsU16',runtimeState.scriptFlagsU16,row.actorResource.scriptFlagsU16);
      compare(id,'runtime.resourceStateU16',runtimeState.resourceStateU16,row.actorResource.resourceStateU16);
      for(const field of loaderFields)compare(id,'runtime.loader.'+field,runtimeLoader[field],row.loaderState[field]);
      compare(id,'runtime.loader.taskCount',runtimeLoader.taskCount,row.loaderState.taskCount);
      compare(id,'runtime.loader.taskCounter',runtimeLoader.taskCounter,row.loaderState.taskCounter);
      for(let i=0;i<row.actorResource.requests.length;i++){
        const want=row.actorResource.requests[i],got=runtimeLoader.slots[i];
        compare(id,'runtime.request'+i+'.outer',got.outerFilename,want.outer);
        compare(id,'runtime.request'+i+'.inner',got.innerFilename,want.inner);
        compare(id,'runtime.request'+i+'.directory',got.directory,want.directory);
        compare(id,'runtime.request'+i+'.allocator',runtimeLoader.externalAllocatorU16[2*i]+65536*runtimeLoader.externalAllocatorU16[2*i+1],want.allocator);
      }
      compare(id,'seedUnchanged',row.nextState,`0x${BigInt(c.seed).toString(16).padStart(16,'0')}`);
      if(loaderOut){
        compare(id,'loader.taskCount',scalar(loaderOut,'nextTaskCount'),row.loaderState.taskCount);
        compare(id,'loader.taskCounter',scalar(loaderOut,'nextTaskCounter'),row.loaderState.taskCounter);
        compare(id,'loader.taskIds',loaderOut.nextTaskIds,row.loaderState.taskIds);
        for(const field of loaderFields)compare(id,'loader.'+field,loaderOut['next'+field[0].toUpperCase()+field.slice(1)],row.loaderState[field]);
        if(request&&scalar(loaderOut,'queuedTaskId')>=0){
          const originalRequest=row.actorResource.requests.at(-1);
          compare(id,'request.outer',request.outer,originalRequest.outer);compare(id,'request.inner',request.inner,originalRequest.inner);
          compare(id,'request.directory',scalar(await call('rom-common-animation-actor-resource',inputs),'requestDirectory'),originalRequest.directory);
        }
      }
      report.cases.push({id,operations,request,returned:scalar(out,'returnValue'),mismatches:report.mismatches-before});
    }
  }finally{await executor.release();}
  report.completeOriginalCalls=report.cases.length;report.originalBoundaryCalls=report.boundaries.length;
  report.passed=report.mismatches===0&&report.cases.length+report.boundaries.length===source.results.length;return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),options={};let out;
  for(let i=0;i<args.length;i++){if(args[i]==='--source')options.sourcePath=args[++i];else if(args[i]==='--ort-dir')options.ortDirectory=args[++i];else if(args[i]==='--out')out=args[++i];else throw Error('Unknown argument '+args[i]);}
  const report=await verifyActorResource(options);if(out)await writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,fields:report.fieldsCompared,mismatches:report.mismatches,examples:report.examples}));if(!report.passed)process.exitCode=1;
}
