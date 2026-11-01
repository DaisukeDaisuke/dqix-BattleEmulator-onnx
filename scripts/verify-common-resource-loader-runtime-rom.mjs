#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildCommonResourceLoader} from '../graph-v2/build-common-resource-loader.mjs';
import {createCommonResourceLoaderRunner,initialCommonResourceLoader} from '../runtime/common-resource-loader.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
if(!option('--source')||!option('--ort-dir'))throw Error('Use --source original-external-loader.json --ort-dir EXISTING_ORT_DIRECTORY --out JSON');
const hash=x=>createHash('sha256').update(x).digest('hex'),sourceBytes=await readFile(option('--source')),source=JSON.parse(sourceBytes);
if(!source.executionComplete||!source.programUnmodified||source.romSHA256!=='b7a7f82f9da6f5bd08b5ae436d67cbde020f15e79534e0d34853201cd24d775d')throw Error('Complete unchanged original ROM evidence is required');
const graph=buildCommonResourceLoader(),model={name:graph.name,onnx:graph.model(),ir:graph.json()},ort=await loadLocalOrt(option('--ort-dir')),executor=createGraphExecutor({models:[model],ortRuntime:ort});
const runner=createCommonResourceLoaderRunner({getModel:()=>model.ir,runGraph:executor.runGraph});
const report={schema:'dq9-common-resource-loader-runtime-rom-verification-v1',sourceSHA256:hash(sourceBytes),modelSHA256:hash(model.onnx),runtimeSourceSHA256:hash(await readFile(new URL('../runtime/common-resource-loader.mjs',import.meta.url))),runtime:ort.env.versions.web,fieldsCompared:0,mismatches:0,examples:[],cases:[],boundaries:[],scope:'Actual runtime methods through real ORT, compared with complete unchanged original queue/status/remove/fence and no-eligible-read Process calls. Every represented raw pointer/flag/counter and every active/inactive structural filename/directory is compared. Initial loader operands only enter production; original final state is comparison-only. External and GP1/GP2 reads remain explicit boundaries.'};
const fields=['taskIds','taskStatuses','taskTypes','fileLengthsU16','scratchFirstWords','scratchNumWords','externalAllocatorU16','dataPointerU16','loaderFlagsU16','processLockBitsU16'];
const limbs=n=>[n%65536,Math.floor(n/65536)];
function compare(id,key,actual,expected){
  if(Array.isArray(expected)){if(!Array.isArray(actual)||actual.length!==expected.length)throw Error('Shape mismatch '+key);expected.forEach((v,i)=>compare(id,key+'['+i+']',actual[i],v));return;}
  report.fieldsCompared++;if(actual!==expected){report.mismatches++;if(report.examples.length<40)report.examples.push({id,key,actual,expected});}
}
function initial(c){
  const s=initialCommonResourceLoader({contract:'dq9-functional-original-file-loader-v1',initialLayout:'empty-v1',scratchBytes:c.scratchBytes,scratchRightArenaUsage:c.scratchRightArenaUsage,scratchBaseU16:[0x1000,0x0238],taskCounter:c.taskCounter,loaderFlagsU16:c.loaderFlagsU16,processLockBitsU16:c.processLockBitsU16});
  for(const field of fields)if(c[field])s[field]=structuredClone(c[field]);
  s.dataPointerU16=c.dataPointers.flatMap(limbs);s.taskCount=c.taskCount;s.rightmostAllocationByte=c.priorRightmostAllocationByte;
  s.slots=c.outerNames.map((outerFilename,i)=>({directory:c.directoryIndices[i],outerFilename,innerFilename:c.innerNames[i],bytes:null,readComplete:false}));
  return s;
}
try{
  for(const original of source.results){
    if(!original.ok||!original.strictInitializedMemory||!original.completeFunctionExecuted)throw Error('Strict complete original call required');
    const c=original.case,s=initial(c),before=report.mismatches;let result;
    if(c.operation==='queue'){
      const path=c.filename.replace(/\\/g,'/'),directory=path.startsWith('data/prm/')?20:path.startsWith('data/pack_lv5/')?19:null;
      if(directory===null)throw Error('Original directory mapping is not declared');
      result=await runner.queue(s,{directory,outerFilename:path.slice(path.lastIndexOf('/')+1),innerFilename:c.requestTaskType===2?c.resourceName:'',type:c.requestTaskType,externalAllocatorU16:c.requestExternalAllocatorU16});
      compare(c.id,'complete',result.complete,true);compare(c.id,'integerResult',result.id,original.integerResult);
    }else if(c.operation==='remove')result=await runner.remove(s,c.queryTaskId);
    else if(c.operation==='status'){result=await runner.status(s,c.queryTaskId);compare(c.id,'integerResult',result,original.integerResult);}
    else if(c.operation==='fence')result=await runner.addFence(s);
    else if(c.operation==='process'){result=await runner.process(s);compare(c.id,'complete',result.complete,true);}
    else throw Error('Unknown original operation');
    for(const field of fields)compare(c.id,field,s[field],field==='dataPointerU16'?original.taskNames.flatMap(t=>limbs(t.dataPointer)):original.loaderState[field]);
    for(const field of ['taskCount','taskCounter','rightmostAllocationByte','scratchRightArenaUsage'])compare(c.id,field,s[field],original.loaderState[field]);
    original.taskNames.forEach((t,i)=>{compare(c.id,'slot'+i+'.outer',s.slots[i]?.outerFilename,t.outer);compare(c.id,'slot'+i+'.inner',s.slots[i]?.innerFilename,t.inner);compare(c.id,'slot'+i+'.directory',s.slots[i]?.directory,t.directory);});
    for(let i=0;i<s.taskCount;i++)if(s.taskIds[i]>=0&&s.taskIds.indexOf(s.taskIds[i])===i){const task=runner.task(s,s.taskIds[i]);compare(c.id,'task'+i+'.dataPointerU16',task.dataPointerU16,s.dataPointerU16.slice(2*i,2*i+2));compare(c.id,'task'+i+'.externalAllocatorU16',task.externalAllocatorU16,s.externalAllocatorU16.slice(2*i,2*i+2));}
    compare(c.id,'negativeTask',runner.task(s,-1),null);
    report.cases.push({id:c.id,operation:c.operation,mismatches:report.mismatches-before});
    if(c.taskCount&&c.taskStatuses[0]===0&&(c.externalAllocatorU16[0]||c.externalAllocatorU16[1])){
      const blocked=initial(c),beforeState=JSON.stringify(blocked),pending=await runner.process(blocked),passed=pending.requiresExternalAllocator===true&&!pending.complete&&JSON.stringify(blocked)===beforeState;
      report.boundaries.push({id:c.id,kind:'external-allocator-read',passed});compare(c.id,'external-read-retains-state',passed,true);
    }
  }
  const empty=initialCommonResourceLoader({contract:'dq9-functional-original-file-loader-v1',initialLayout:'empty-v1',scratchBytes:65536,scratchBaseU16:[0x1000,0x0238]});
  compare('empty-layout','statuses',empty.taskStatuses,Array(24).fill(-1));compare('empty-layout','flags',empty.loaderFlagsU16,[1,0]);
  for(const type of[1,2]){
    const s=structuredClone(empty),queued=await runner.queue(s,{directory:20,outerFilename:'actmsg.nat',innerFilename:'inside',type}),before=JSON.stringify(s),pending=await runner.process(s),passed=queued.complete&&!pending.complete&&pending.pending.includes(type===1?'GP1':'GP2')&&before===JSON.stringify(s);
    report.boundaries.push({id:'type'+type,kind:'archive-reader',passed});compare('type'+type,'reader-retains-state',passed,true);
  }
}finally{await executor.release();}
report.passed=report.mismatches===0&&report.boundaries.every(x=>x.passed);const text=JSON.stringify(report,null,2)+'\n';if(option('--out'))await writeFile(option('--out'),text);console.log(text);if(!report.passed)process.exitCode=1;

