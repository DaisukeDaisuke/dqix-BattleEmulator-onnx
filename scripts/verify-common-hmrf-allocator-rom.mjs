#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildCommonHmrfAllocator} from '../graph-v2/build-common-hmrf-allocator.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';

const args=process.argv.slice(2),option=k=>{const i=args.indexOf(k);return i<0?undefined:args[i+1];},hash=b=>createHash('sha256').update(b).digest('hex');
if(!option('--source')||!option('--ort-dir'))throw Error('Use --source original-hmrf.json --ort-dir DIR --out FILE');
const sourceBytes=await readFile(option('--source')),source=JSON.parse(sourceBytes),graph=buildCommonHmrfAllocator(),onnx=graph.model(),ir=graph.json(),models=new Map([[graph.name,{name:graph.name,onnx,ir}]]),ort=await loadLocalOrt(option('--ort-dir')),executor=createGraphExecutor({models,ortRuntime:ort});
if(!source.executionComplete||!source.programUnmodified||source.romSHA256!=='b7a7f82f9da6f5bd08b5ae436d67cbde020f15e79534e0d34853201cd24d775d')throw Error('Complete unmodified original ROM cohort required');
const report={schema:'dq9-common-hmrf-allocator-rom-verification-v1',sourceSHA256:hash(sourceBytes),modelSHA256:hash(onnx),runtime:ort.env.versions.web,fieldsCompared:0,mismatches:0,cases:[],examples:[],scope:'Complete actual SafeAllocator forward/reversed allocation or reset following real AllocatorUnion TypeA setup. Compares raw32-bit return limbs, front/back/newest state and preserved header operands, covering null, zero, misalignment, exhaustion and32-bit rounding overflow. Initial raw allocator inputs are independent of all observations. This proves the shared allocation transition, not accumulated allocator state for a whole retained presentation or any archive/model installation.'};
function compare(id,k,a,b){if(Array.isArray(b)){if(!Array.isArray(a)||a.length!==b.length)throw Error('Shape mismatch '+k);b.forEach((v,i)=>compare(id,k+'['+i+']',a[i],v));return;}report.fieldsCompared++;if(a!==b){report.mismatches++;if(report.examples.length<40)report.examples.push({id,key:k,actual:a,expected:b});}}
try{
 for(const row of source.results){const c=row.case;if(!row.ok||!row.strictInitializedMemory||!row.completeFunctionExecuted||c.kind!=='hmrf_allocator')throw Error('Strict original allocator call required '+c.id);const values={...ir.contract.defaults,...c},feeds=Object.fromEntries(ir.inputs.map(d=>[d.name,Array.isArray(values[d.name])?values[d.name]:[values[d.name]]])),o=(await executor.runGraph(graph.name,[feeds]))[0],start=report.mismatches;
  compare(c.id,'supported',Boolean(o.supported[0]),true);compare(c.id,'operationCompleted',Boolean(o.operationCompleted[0]),true);
  for(const k of ['frontU16','backU16','newestStateU16'])compare(c.id,k,o['next'+k[0].toUpperCase()+k.slice(1)],row.allocator[k]);for(const k of ['heapBeginU16','heapEndU16','clearFlagsLow16'])compare(c.id,'preserved.'+k,c[k],row.allocator[k]);
  if(c.operation!==2){const returned=Number.parseInt(row.returnBits),limbs=[returned%65536,Math.floor(returned/65536)];compare(c.id,'returnPointerU16',o.returnPointerU16,limbs);compare(c.id,'returnedNonNull',Boolean(o.returnedNonNull[0]),returned!==0);}
  report.cases.push({id:c.id,operation:c.operation,originalInstructions:row.instructions,mismatches:report.mismatches-start});
 }
}finally{await executor.release();}
report.passed=report.mismatches===0;const text=JSON.stringify(report,null,2)+'\n';if(option('--out'))await writeFile(option('--out'),text);console.log(text);if(!report.passed)process.exitCode=1;
