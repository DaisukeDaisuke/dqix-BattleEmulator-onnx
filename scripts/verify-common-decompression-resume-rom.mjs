#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildCommonCompressedFile,buildCommonDecompressionStep} from '../graph-v2/build-common-compressed-file.mjs';
import {buildCommonHmrfCreate} from '../graph-v2/build-common-hmrf-create.mjs';
import {buildCommonHmrfAllocator} from '../graph-v2/build-common-hmrf-allocator.mjs';
import {createCommonHmrfRunner} from '../runtime/common-hmrf.mjs';
import {createCommonCompressedFileRunner} from '../runtime/common-compressed-file.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';

const args=process.argv.slice(2),option=k=>{const i=args.indexOf(k);return i<0?undefined:args[i+1];},hash=b=>createHash('sha256').update(b).digest('hex'),pair=n=>[n%65536,Math.floor(n/65536)],word=p=>p[0]+65536*p[1];
if(!option('--source')||!option('--ort-dir')||!option('--out'))throw Error('Use --source original-gp1-process.json --ort-dir DIR --out FILE');
const sourceBytes=await readFile(option('--source')),source=JSON.parse(sourceBytes);
if(!source.executionComplete||!source.programUnmodified||source.romSHA256!=='b7a7f82f9da6f5bd08b5ae436d67cbde020f15e79534e0d34853201cd24d775d')throw Error('Unchanged original GP1 Process evidence required');
const models=new Map();for(const build of[buildCommonCompressedFile,buildCommonDecompressionStep,buildCommonHmrfCreate,buildCommonHmrfAllocator]){const g=build();models.set(g.name,{name:g.name,onnx:g.model(),ir:g.json()});}
const ort=await loadLocalOrt(option('--ort-dir')),executor=createGraphExecutor({models,ortRuntime:ort}),runtime={runGraph:executor.runGraph,getModel:n=>models.get(n)?.ir},hmrf=await createCommonHmrfRunner(runtime),decoder=createCommonCompressedFileRunner(runtime);
const report={schema:'dq9-common-decompression-resume-rom-verification-v1',sourceSHA256:hash(sourceBytes),models:Object.fromEntries([...models].map(([n,m])=>[n,hash(m.onnx)])),fieldsCompared:0,mismatches:0,jsonResumes:0,unknownInitialAllocatorTreeBytesExcluded:0,cases:[],examples:[],scope:'Every external one-file GP1 original case, with initial output pointer and allocation rounding computed from initial region by the HMRF graph. Serialize both decoder state and actual memory after each individual codec graph transition. Compare all known final heap bytes, including compressed-input staging and padding, to original whole Process. No original allocation result or decoded byte is used as an execution input. Only the20 unknown initial HMRF global-tree bytes per case are excluded.'};
function compare(id,key,a,b){report.fieldsCompared++;if(a!==b){report.mismatches++;if(report.examples.length<40)report.examples.push({id,key,actual:a,expected:b});}}
function put(bytes,offset,n){for(let i=0;i<4;i++)bytes[offset+i]=Math.floor(n/2**(8*i))%256;}
try{for(const row of source.results){
 const c=row.case;if(c.taskCount!==1||c.taskTypes[0]!==1||c.externalPointers[0]===0)continue;
 if(!row.ok||!row.strictInitializedMemory||!row.completeFunctionExecuted)throw Error('Incomplete original case '+c.id);
 const before=report.mismatches,fileBytes=Array.from(Buffer.from(c.memoryReadHex,'hex')),description=await decoder.describe(fileBytes);if(!description.complete)throw Error(description.pending);
 const initial=await hmrf.create({regionStartU16:[0,0x23a],regionSizeU16:pair(c.heapCapacity)});if(!initial.complete)throw Error(initial.pending);
 const allocation=await hmrf.step({state:initial.state,operation:0,requestBytesU16:description.allocationBytesU16});if(!allocation.complete||!allocation.returnedNonNull)throw Error('A completed nonNULL original allocation is required');
 let memory=Array.from({length:c.heapCapacity},(_,i)=>(29*i+71)&255),state;
 put(memory,0,0x46524d48);put(memory,32,allocation.state.clearFlagsLow16);for(const[at,key]of[[24,'heapBeginU16'],[28,'heapEndU16'],[36,'frontU16'],[40,'backU16'],[44,'newestStateU16']])put(memory,at,word(allocation.state[key]));
 function offset(pointer,n){const at=word(pointer)-0x023a0000;if(at<0||at+n>memory.length||at<24&&at+n>4)throw Error('Decoder requested unknown/outside original heap backing');return at;}
 const read=(p,n)=>{const at=offset(p,n);return memory.slice(at,at+n);},write=(p,bytes)=>{const at=offset(p,bytes.length);for(let i=0;i<bytes.length;i++)memory[at+i]=bytes[i];};
 let result;
 for(let step=0;step<65536;step++){
  result=await decoder.decode({fileBytes,description,outputPointerU16:allocation.returnPointerU16,read,write,state,maxTransitions:1});
  if(result.complete)break;if(!result.budgetExhausted)throw Error(c.id+': '+result.pending);
  ({memory,state}=JSON.parse(JSON.stringify({memory,state:result.state})));report.jsonResumes++;
 }
 compare(c.id,'complete',result.complete,true);compare(c.id,'reportedLength',result.byteLength,row.loaderState.fileLengthsU16[0]+65536*row.loaderState.fileLengthsU16[1]);
 const expected=Array.from(Buffer.from(row.externalHeapHex,'hex'));compare(c.id,'heap.length',memory.length,expected.length);
 for(let i=0;i<expected.length;i++){if(i>=4&&i<24){report.unknownInitialAllocatorTreeBytesExcluded++;continue;}compare(c.id,'heap['+i+']',memory[i],expected[i]);}
 report.cases.push({id:c.id,compressionType:description.compressionType,decodedBytes:description.reportedLength,transitions:result.state.transitions,mismatches:report.mismatches-before});
}}finally{await executor.release();}
report.passed=report.mismatches===0&&report.cases.length>0;await writeFile(option('--out'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,fields:report.fieldsCompared,mismatches:report.mismatches,jsonResumes:report.jsonResumes,unknownInitialAllocatorTreeBytesExcluded:report.unknownInitialAllocatorTreeBytesExcluded,examples:report.examples}));if(!report.passed)process.exitCode=1;
