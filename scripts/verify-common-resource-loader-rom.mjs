#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildCommonResourceLoader} from '../graph-v2/build-common-resource-loader.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';

const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];},hash=value=>createHash('sha256').update(value).digest('hex');
if(!option('--source')||!option('--ort-dir'))throw Error('Use --source original-loader-leaves.json --ort-dir original-ORT-directory --out report.json');
const sourceBytes=await readFile(option('--source')),source=JSON.parse(sourceBytes),graph=buildCommonResourceLoader(),onnx=graph.model(),ir=graph.json(),models=new Map([[graph.name,{name:graph.name,onnx,ir}]]),ort=await loadLocalOrt(option('--ort-dir')),executor=createGraphExecutor({models,ortRuntime:ort});
if(!source.executionComplete||!source.programUnmodified||source.romSHA256!=='b7a7f82f9da6f5bd08b5ae436d67cbde020f15e79534e0d34853201cd24d775d')throw Error('Complete unchanged original ROM evidence is required');
const report={schema:'dq9-common-resource-loader-rom-verification-v1',sourceSHA256:hash(sourceBytes),modelSHA256:hash(onnx),runtime:ort.env.versions.web,fieldsCompared:0,mismatches:0,examples:[],cases:[],scope:'Actual original QueueFileTask/RemoveTask/GetTaskStatus complete calls compare all represented24-slot scalar state; AllocateInScratchSpace complete calls independently compare the graph allocation decision/local output descriptor. File-byte I/O and status copyback are separate from the allocation leaf and are not inferred by this proof.'};
function compare(id,key,a,b){if(Array.isArray(b)){if(!Array.isArray(a)||a.length!==b.length)throw Error('Shape mismatch '+key);b.forEach((v,i)=>compare(id,key+'['+i+']',a[i],v));return;}report.fieldsCompared++;if(a!==b){report.mismatches++;if(report.examples.length<30)report.examples.push({id,key,actual:a,expected:b});}}
const fieldNames=['taskIds','taskStatuses','taskTypes','fileLengthsU16','scratchFirstWords','scratchNumWords'];
try{
 for(const row of source.results){
  if(!row.ok||!row.strictInitializedMemory)throw Error('Strict complete original leaf required: '+row.case.id);
  const c=row.case,operation={queue:0,remove:2,status:3,allocate:3}[c.operation];if(operation===undefined)throw Error('Unknown original operation');
  const values={...ir.contract.defaults,...c,operation,requestValid:c.operation==='queue',readByteLengthU16:[c.readByteLength%65536,Math.floor(c.readByteLength/65536)]},feeds=Object.fromEntries(ir.inputs.map(d=>[d.name,Array.isArray(values[d.name])?values[d.name]:[values[d.name]]]));
  const output=(await executor.runGraph(graph.name,[feeds]))[0],id=c.id,start=report.mismatches;compare(id,'supported',Boolean(output.supported[0]),true);
  for(const key of fieldNames)compare(id,key,output['next'+key[0].toUpperCase()+key.slice(1)],row.loaderState[key]);
  compare(id,'taskCount',output.nextTaskCount[0],row.loaderState.taskCount);compare(id,'taskCounter',output.nextTaskCounter[0],row.loaderState.taskCounter);compare(id,'rightmostAllocationByte',output.rightmostAllocationByte[0],row.loaderState.rightmostAllocationByte);
  if(c.operation==='allocate'){
   compare(id,'allocationPossible',Boolean(output.allocationPossible[0]),row.integerResult!==0);compare(id,'allocationDescriptor',[output.allocationFirstWord[0],output.allocationNumWords[0]],row.allocationDescriptor);compare(id,'returnedPointer',output.allocationPossible[0]?0x02381000+4*output.allocationFirstWord[0]:0,Number.parseInt(row.returnBits));
  }else if(c.operation==='queue')compare(id,'queuedTaskId',output.queuedTaskId[0],row.integerResult);
  else if(c.operation==='status')compare(id,'taskStatus',output.taskStatus[0],row.integerResult);
  report.cases.push({id,operation:c.operation,mismatches:report.mismatches-start});
 }
}finally{await executor.release();}
report.passed=report.mismatches===0;const text=JSON.stringify(report,null,2)+'\n';if(option('--out'))await writeFile(option('--out'),text);console.log(text);if(!report.passed)process.exitCode=1;
