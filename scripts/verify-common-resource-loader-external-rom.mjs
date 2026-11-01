#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildCommonResourceLoader} from '../graph-v2/build-common-resource-loader.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';

const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
if(!option('--source')||!option('--ort-dir'))throw Error('Use --source original-external-loader.json --ort-dir EXISTING_ORT_DIRECTORY --out JSON');
const hash=x=>createHash('sha256').update(x).digest('hex'),sourceBytes=await readFile(option('--source')),source=JSON.parse(sourceBytes);
if(!source.executionComplete||!source.programUnmodified||source.romSHA256!=='b7a7f82f9da6f5bd08b5ae436d67cbde020f15e79534e0d34853201cd24d775d')throw Error('Complete unchanged original ROM evidence is required');
const graph=buildCommonResourceLoader(),model={name:graph.name,onnx:graph.model(),ir:graph.json()},ort=await loadLocalOrt(option('--ort-dir')),executor=createGraphExecutor({models:[model],ortRuntime:ort});
const report={schema:'dq9-common-external-loader-rom-verification-v1',sourceSHA256:hash(sourceBytes),modelSHA256:hash(model.onnx),runtime:ort.env.versions.web,fieldsCompared:0,mismatches:0,examples:[],cases:[],unimplementedReadGuards:[],scope:'Complete actual queue/status/remove/fence calls and Process iterations with no eligible file read. All24 external allocator pointer pairs, existing scalar arrays, flags and counters are compared. Nonnull allocator pointers are independent initial operands and copied by actual ARM instructions; no allocator or file-read function is bypassed. Separate negative graph checks ensure an unimplemented external allocation/read does not commit.'};
function compare(id,key,actual,expected){
  if(Array.isArray(expected)){if(!Array.isArray(actual)||actual.length!==expected.length)throw Error('Shape mismatch '+key);expected.forEach((v,i)=>compare(id,key+'['+i+']',actual[i],v));return;}
  report.fieldsCompared++;if(actual!==expected){report.mismatches++;if(report.examples.length<40)report.examples.push({id,key,actual,expected});}
}
const fields=['taskIds','taskStatuses','taskTypes','fileLengthsU16','scratchFirstWords','scratchNumWords','externalAllocatorU16','dataPointerU16'];
async function run(values){const row={...model.ir.contract.defaults,...values},feeds=Object.fromEntries(model.ir.inputs.map(input=>[input.name,Array.isArray(row[input.name])?row[input.name]:[row[input.name]]]));return(await executor.runGraph(graph.name,[feeds]))[0];}
try{
  for(const original of source.results){
    if(!original.ok||!original.strictInitializedMemory||!original.completeFunctionExecuted)throw Error('Strict complete original call required: '+original.case.id);
    const c={...original.case,dataPointerU16:original.case.dataPointers.flatMap(pointer=>[pointer%65536,Math.floor(pointer/65536)]),scratchBaseU16:[0x1000,0x0238]},operation={queue:0,remove:2,status:3,fence:4,process:5}[c.operation];if(operation===undefined)throw Error('Unsupported original call kind');
    const before=report.mismatches,o=await run({...c,operation,requestValid:c.operation==='queue'});
    compare(c.id,'supported',!!o.supported[0],true);
    for(const name of fields)compare(c.id,name,o['next'+name[0].toUpperCase()+name.slice(1)],name==='dataPointerU16'?original.taskNames.flatMap(task=>[task.dataPointer%65536,Math.floor(task.dataPointer/65536)]):original.loaderState[name]);
    for(const name of ['taskCount','taskCounter'])compare(c.id,name,o['next'+name[0].toUpperCase()+name.slice(1)][0],original.loaderState[name]);
    compare(c.id,'loaderFlagsU16',o.nextLoaderFlagsU16,original.loaderState.loaderFlagsU16);
    compare(c.id,'rightmostAllocationByte',o.rightmostAllocationByte[0],original.loaderState.rightmostAllocationByte);
    compare(c.id,'processLockBitsU16',c.processLockBitsU16,original.loaderState.processLockBitsU16);
    compare(c.id,'scratchRightArenaUsage',c.scratchRightArenaUsage,original.loaderState.scratchRightArenaUsage);
    if(c.operation==='queue')compare(c.id,'integerResult',o.queuedTaskId[0],original.integerResult);
    if(c.operation==='status')compare(c.id,'integerResult',o.taskStatus[0],original.integerResult);
    compare(c.id,'RNG',original.nextState,BigInt(c.seed).toString(16).padStart(16,'0').replace(/^/,'0x'));
    report.cases.push({id:c.id,operation:c.operation,mismatches:report.mismatches-before});
    if(c.taskCount&&c.taskStatuses[0]===0&&(c.externalAllocatorU16[0]||c.externalAllocatorU16[1])){
      const blocked=await run({...c,operation:1,readComplete:true,fileExists:true,readByteLengthU16:[32,0]});
      const unchanged=fields.every(name=>JSON.stringify(blocked['next'+name[0].toUpperCase()+name.slice(1)])===JSON.stringify(c[name]))&&blocked.nextTaskCount[0]===c.taskCount&&blocked.nextTaskCounter[0]===c.taskCounter&&blocked.rightmostAllocationByte[0]===c.priorRightmostAllocationByte;
      report.unimplementedReadGuards.push({id:c.id,passed:!blocked.supported[0]&&!!blocked.requiresExternalAllocator[0]&&!blocked.readCommitted[0]&&unchanged});
    }
  }
}finally{await executor.release();}
report.passed=report.mismatches===0&&report.unimplementedReadGuards.length>0&&report.unimplementedReadGuards.every(row=>row.passed);
const text=JSON.stringify(report,null,2)+'\n';if(option('--out'))await writeFile(option('--out'),text);console.log(text);if(!report.passed)process.exitCode=1;
