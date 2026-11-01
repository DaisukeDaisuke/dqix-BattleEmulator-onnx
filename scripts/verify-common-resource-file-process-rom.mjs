#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {buildCommonResourceLoader} from '../graph-v2/build-common-resource-loader.mjs';
import {buildCommonHmrfCreate} from '../graph-v2/build-common-hmrf-create.mjs';
import {buildCommonHmrfAllocator} from '../graph-v2/build-common-hmrf-allocator.mjs';
import {buildCommonCompressedFile,buildCommonDecompressionStep} from '../graph-v2/build-common-compressed-file.mjs';
import {buildCommonFilenameCRC,buildCommonGpcArchive,buildCommonGpcSearch} from '../graph-v2/build-common-gpc-archive.mjs';
import {createCommonHmrfRunner} from '../runtime/common-hmrf.mjs';
import {createCommonResourceLoaderRunner,initialCommonResourceLoader} from '../runtime/common-resource-loader.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';

const args=process.argv.slice(2),option=k=>{const i=args.indexOf(k);return i<0?undefined:args[i+1];},hash=x=>createHash('sha256').update(x).digest('hex'),pair=n=>[n%65536,Math.floor(n/65536)],word=p=>p[0]+65536*p[1],clone=x=>structuredClone(x);
if(!option('--source')||!option('--ort-dir')||!option('--out'))throw Error('Use --source original-process.json --ort-dir DIR --out FILE');
const supplied=await readFile(option('--source')),raw=option('--source').endsWith('.gz')?gunzipSync(supplied):supplied,source=JSON.parse(raw);if(!source.executionComplete||!source.programUnmodified||source.romSHA256!=='b7a7f82f9da6f5bd08b5ae436d67cbde020f15e79534e0d34853201cd24d775d')throw Error('Complete unmodified original ROM evidence is required');
const models=new Map();for(const build of[buildCommonResourceLoader,buildCommonHmrfCreate,buildCommonHmrfAllocator,buildCommonCompressedFile,buildCommonDecompressionStep,buildCommonFilenameCRC,buildCommonGpcArchive,buildCommonGpcSearch]){const g=build();models.set(g.name,{name:g.name,onnx:g.model(),ir:g.json()});}
const ort=await loadLocalOrt(option('--ort-dir')),executor=createGraphExecutor({models,ortRuntime:ort}),runtime={runGraph:executor.runGraph,getModel:name=>models.get(name)?.ir},creator=await createCommonHmrfRunner(runtime);
const fields=['taskIds','taskStatuses','taskTypes','fileLengthsU16','scratchFirstWords','scratchNumWords'],allocatorFields=['heapBeginU16','heapEndU16','frontU16','backU16','newestStateU16'];
const report={schema:'dq9-common-resource-file-process-rom-verification-v1',sourceSHA256:hash(raw),models:Object.fromEntries([...models].map(([name,m])=>[name,hash(m.onnx)])),fieldsCompared:0,mismatches:0,examples:[],cases:[],jsonResumes:0,unknownInitialAllocatorTreeBytesExcluded:0,scope:'Whole original background Process with actual memory filesystem and SafeAllocator instructions. Initial HMRF cursors are computed by the creation graph from the initial region, not copied from observed allocations. Compare every represented loader field, raw task pointer/name, allocation order/cursors and every known heap/scratch byte, including unchanged bytes. The20 global allocator-tree header bytes outside the layout graph are explicitly unknown; original file-process instructions are unchanged. Run whole and JSON-restored single-iteration modes without reallocation.'};
function compare(id,key,a,b){if(Array.isArray(b)){if(!Array.isArray(a)||a.length!==b.length)throw Error(id+' shape '+key);for(let i=0;i<b.length;i++)compare(id,key+'['+i+']',a[i],b[i]);return;}report.fieldsCompared++;if(a!==b){report.mismatches++;if(report.examples.length<40)report.examples.push({id,key,actual:a,expected:b});}}
function put(b,at,n,width=4){for(let i=0;i<width;i++)b[at+i]=Math.floor(n/2**(8*i))%256;}
async function initial(c){
 const created=await creator.create({regionStartU16:[0,0x23a],regionSizeU16:pair(c.heapCapacity)});if(!created.complete)throw Error(created.pending);
 const a=created.state,canonical={signedAllocatorU16:[...a.signedAllocatorPointerU16],signatureU16:[0x4d48,0x4652],clearFlagsLow16:a.clearFlagsLow16,...Object.fromEntries(allocatorFields.map(k=>[k,[...a[k]]]))};
 const heap=Array.from({length:c.heapCapacity},(_,i)=>(29*i+71)&255),known=Array(heap.length).fill(255);known.fill(0,4,24);put(heap,0,0x46524d48);put(heap,32,a.clearFlagsLow16);for(const[at,key]of[[24,'heapBeginU16'],[28,'heapEndU16'],[36,'frontU16'],[40,'backU16'],[44,'newestStateU16']])put(heap,at,word(a[key]));
 if(!Number.isInteger(c.initialScratchFillByte)||c.initialScratchFillByte<0||c.initialScratchFillByte>255)throw Error('Explicit initialized original scratch bytes are required');
 const scratch=Array(c.scratchBytes).fill(c.initialScratchFillByte),archive=Array.from(Buffer.from(c.archiveHex,'hex'));scratch.splice(0,archive.length,...archive);
 const loader=initialCommonResourceLoader({contract:'dq9-functional-original-file-loader-v1',initialLayout:'empty-v1',scratchBytes:c.scratchBytes,scratchBaseU16:[0x1000,0x238],taskCounter:c.taskCounter,scratchRightArenaUsage:c.scratchRightArenaUsage,loaderFlagsU16:c.loaderFlagsU16,processLockBitsU16:c.processLockBitsU16});
 for(const f of fields)loader[f]=[...c[f]];loader.taskCount=c.taskCount;loader.rightmostAllocationByte=c.priorRightmostAllocationByte;loader.externalAllocatorU16=c.externalPointers.flatMap(pair);loader.dataPointerU16=c.dataPointers.flatMap(pair);loader.slots=c.outerNames.map((outerFilename,i)=>({outerFilename,innerFilename:c.innerNames[i],directory:c.directoryIndices[i],bytes:null,readComplete:false}));
 return{loader,allocators:{[0x02370030]:canonical},installationState:{backingRegions:[{baseU16:[0,0x23a],bytes:heap,knownMaskBytes:known},{baseU16:[0x1000,0x238],bytes:scratch,knownMaskBytes:Array(scratch.length).fill(255)}]}};
}
try{for(const row of source.results){
 const c=row.case;if(!row.ok||!row.strictInitializedMemory||!row.completeFunctionExecuted||c.operation!=='process')throw Error('Strict whole Process evidence required '+c.id);
 for(const resumed of[false,true]){
  const id=c.id+(resumed?'/json':'/whole'),before=report.mismatches,allocations=[];let current=await initial(c);
  const runner=createCommonResourceLoaderRunner({...runtime,assets:{'actmsg.nat':{hex:c.memoryReadHex},'missing.nat':{exists:false}},onTrace:({model,inputs,outputs})=>{if(model==='rom-common-hmrf-allocator'&&inputs[0].operation[0]===0)allocations.push({input:clone(inputs[0]),output:clone(outputs[0])});}});
  let result;for(let step=0;step<26;step++){result=await runner.process(current.loader,{...current,maxTransitions:resumed?1:25});if(result.complete||!result.budgetExhausted)break;current=JSON.parse(JSON.stringify(current));report.jsonResumes++;}
  compare(id,'complete',result.complete,true);if(!result.complete){report.cases.push({id,pending:result.pending});continue;}
  for(const[k,expected]of Object.entries(row.loaderState))compare(id,'loader.'+k,current.loader[k],expected);
  compare(id,'externalAllocatorU16',current.loader.externalAllocatorU16,c.externalPointers.flatMap(pair));
  for(let i=0;i<24;i++){const actual=current.loader.slots[i],expected=row.taskNames[i];compare(id,'task'+i+'.outer',actual.outerFilename,expected.outer);compare(id,'task'+i+'.inner',actual.innerFilename,expected.inner);compare(id,'task'+i+'.directory',actual.directory,expected.directory);compare(id,'task'+i+'.dataPointer',word(current.loader.dataPointerU16.slice(i*2,i*2+2)),expected.dataPointer);}
  const a=current.allocators[0x02370030];compare(id,'allocator.signedAllocatorPointerU16',a.signedAllocatorU16,row.allocator.signedAllocatorPointerU16);for(const k of allocatorFields)compare(id,'allocator.'+k,a[k],row.allocator[k]);compare(id,'allocator.clearFlagsLow16',a.clearFlagsLow16,row.allocator.clearFlagsLow16);
  compare(id,'allocationCount',allocations.length,row.installAllocations.length);for(const[i,actual]of allocations.entries()){const expected=row.installAllocations[i];if(!expected)continue;compare(id,'allocation'+i+'.request',actual.input.requestBytesU16,expected.requestBytesU16);compare(id,'allocation'+i+'.pointer',actual.output.returnPointerU16,expected.returnPointerU16);for(const key of allocatorFields){compare(id,'allocation'+i+'.before.'+key,actual.input[key],expected.before[key]);compare(id,'allocation'+i+'.after.'+key,actual.output['next'+key[0].toUpperCase()+key.slice(1)]??actual.input[key],expected.after[key]);}}
  for(const[index,hex]of[row.externalHeapHex,row.scratchHex].entries()){const region=current.installationState.backingRegions[index],expected=Array.from(Buffer.from(hex,'hex'));compare(id,'region'+index+'.length',region.bytes.length,expected.length);for(let i=0;i<expected.length;i++){if(region.knownMaskBytes[i]===255)compare(id,'region'+index+'['+i+']',region.bytes[i],expected[i]);else report.unknownInitialAllocatorTreeBytesExcluded++;}}
  compare(id,'RNG',row.nextState,BigInt(c.seed).toString(16).padStart(16,'0').replace(/^/,'0x'));
  report.cases.push({id,originalCase:c.id,resumed,allocationCalls:allocations.length,mismatches:report.mismatches-before});
 }
}}finally{await executor.release();}
report.passed=report.mismatches===0&&report.cases.length===source.results.length*2;await writeFile(option('--out'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,fields:report.fieldsCompared,mismatches:report.mismatches,jsonResumes:report.jsonResumes,unknownInitialAllocatorTreeBytesExcluded:report.unknownInitialAllocatorTreeBytesExcluded,examples:report.examples}));if(!report.passed)process.exitCode=1;
