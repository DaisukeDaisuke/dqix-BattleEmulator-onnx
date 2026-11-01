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
const hash=x=>createHash('sha256').update(x).digest('hex'),clone=x=>structuredClone(x),word=x=>x[0]+65536*x[1],sourceBytes=await readFile(option('--source')),source=JSON.parse(sourceBytes);
if(!source.executionComplete||!source.programUnmodified||source.romSHA256!=='b7a7f82f9da6f5bd08b5ae436d67cbde020f15e79534e0d34853201cd24d775d')throw Error('Unchanged original ROM evidence is required');
const models=new Map();for(const name of COMMON_ANIMATION_ACTOR_RESOURCE_MODELS){const onnx=await readFile(resolve(root,'graph-v2',name+'.onnx')),ir=JSON.parse(await readFile(resolve(root,'graph-v2',name+'.json')));models.set(name,{name,onnx,ir,sha256:hash(onnx)});}
const ort=await loadLocalOrt(option('--ort-dir')),executor=createGraphExecutor({models,ortRuntime:ort});let allocations=[];
const runner=createCommonAnimationActorResourceRunner({getModel:name=>models.get(name)?.ir,runGraph:executor.runGraph,onTrace:({model,inputs,outputs})=>{
  if(model==='rom-common-hmrf-allocator'){const i=inputs[0],o=outputs[0];allocations.push({requestedBytes:word(i.requestBytesU16),frontBefore:word(i.frontU16),returnPointer:word(o.returnPointerU16),frontAfter:word(o.nextFrontU16)});}
}});
const report={schema:'dq9-common-cchr-actor-rom-verification-v1',sourceSHA256:hash(sourceBytes),models:[...models.values()].map(({name,sha256})=>({name,sha256})),runtimeHashes:Object.fromEntries(await Promise.all(['runtime/common-cchr-install.mjs','runtime/common-animation3d-data.mjs','runtime/common-chr-data.mjs','runtime/common-animation-actor-resource.mjs','runtime/common-safe-allocator.mjs','runtime/common-model-file.mjs','runtime/common-nsbxx-initialize.mjs','runtime/common-nsbxx-name-lookup.mjs'].map(async p=>[p,hash(await readFile(resolve(root,p)))]))),fieldsCompared:0,mismatches:0,examples:[],cases:[],jsonResumes:0,knownHeapBytesCompared:0,unknownHeapBytesExcluded:0,scope:'Whole original actor-resource and type1 CCHR installation with real supplied archive bytes, original TypeA allocator setup, allocation failures/successes, BCFG execution, raw/live Animation3D data, package-list and owner-list append and loader removal. Every represented actor field, allocator/header/cursor, supplied model/raw-model byte and known heap byte is compared. Cases with explicit graphics inputs additionally execute original NSBMD model replacement and compare every archive byte, actual VRAM allocator cursors and all256 staging tasks. JSON restoration after the computed12-byte allocation is checked without replaying allocation. BCFG name bytes after the terminating NUL are explicitly unknown stack tails and excluded; physical VRAM copying/rendering is outside this proof.'};
const fields=['taskIds','taskStatuses','taskTypes','fileLengthsU16','scratchFirstWords','scratchNumWords'];
// ORT exposes bool tensor elements as Uint8 0/1, while the original harness
// serializes this logical field as JSON false/true. No other integer is coerced.
const logical=v=>v===0?false:v===1?true:v;
report.representationNormalization={'vram.bankEnabled':'Decode only ORT bool-tensor values0/1 to JSON false/true; every other value remains an exact mismatch'};
function compare(id,key,actual,expected){if(Array.isArray(expected)){if(!Array.isArray(actual)||actual.length!==expected.length)throw Error(id+': shape mismatch '+key);expected.forEach((v,i)=>compare(id,key+'['+i+']',actual[i],v));return;}report.fieldsCompared++;if(actual!==expected){report.mismatches++;if(report.examples.length<60)report.examples.push({id,key,actual,expected});}}
function put(bytes,at,value,width=4){for(let i=0;i<width;i++)bytes[at+i]=Math.floor(value/2**(8*i))%256;}
async function initial(c){
  const archive=await readFile(c.archivePath);if(hash(archive)!==c.archiveSHA256)throw Error('Original archive input hash differs');
  const loader=initialCommonResourceLoader({contract:'dq9-functional-original-file-loader-v1',initialLayout:'empty-v1',scratchBytes:c.scratchBytes,scratchBaseU16:[0x1000,0x238],taskCounter:c.taskCounter,scratchRightArenaUsage:c.scratchRightArenaUsage??0});
  for(const field of fields)loader[field]=[...c[field]];loader.taskCount=c.taskCount;loader.rightmostAllocationByte=c.priorRightmostAllocationByte??0;loader.dataPointerU16=[...c.dataPointerU16];loader.slots.forEach(slot=>slot.directory=20);loader.slots[0].bytes=Array.from(archive);loader.slots[0].readComplete=true;
  const heap=Array(65536).fill(c.heapFillByte),a=c.allocator;put(heap,0,word(a.signatureU16));for(const[offset,key]of[[0x18,'heapBeginU16'],[0x1c,'heapEndU16'],[0x24,'frontU16'],[0x28,'backU16'],[0x2c,'newestStateU16']])put(heap,offset,word(a[key]));put(heap,0x20,a.clearFlagsLow16);
  for(let i=0;i<c.priorPackageCount;i++)put(heap,0xf000+i*0x40+40,i+1<c.priorPackageCount?0x023af000+(i+1)*0x40:0);
  const object=Array(172).fill(0);put(object,0,c.sourceId<4?0x180:0x680);put(object,12,c.priorPackageCount?0x023af000:0);if(c.model)put(object,8,word(c.model.pointerU16));
  const objectPointerU16=[c.sourceId*0x400,0x230],regions=[{baseU16:[0,0x23a],bytes:heap},{baseU16:objectPointerU16,bytes:object},{baseU16:[0,0x23b],bytes:Array.from(archive)}];
  if(c.model){const bytes=await readFile(c.model.rawFilePath);if(hash(bytes)!==c.model.rawFileSHA256)throw Error('Original model input hash differs');regions.push({baseU16:[...c.model.pointerU16],bytes:[...c.model.bytes]},{baseU16:[...c.model.rawFilePointerU16],bytes:Array.from(bytes)});}
  for(const r of regions)r.knownMaskBytes=Array(r.bytes.length).fill(255);
  const installationState={backingRegions:regions,ownerHeadU16:[...c.priorOwnerHeadU16]};
  if(c.graphics){let vram={fronts:Array(5).fill(0),backs:Array(5).fill(0),bankEnabled:Array(5).fill(false),priority:[4,3,0,2,1],paletteFront:0,paletteBack:0};for(const[operation,extra]of[[0,{bankCount:c.graphics.textureBankCount}],[2,{paletteSize:c.graphics.paletteRegionSize}]]){const name='rom-common-vram-allocator',ir=models.get(name).ir,values={...ir.contract.defaults,...vram,operation,...extra},feeds=Object.fromEntries(ir.inputs.map(d=>[d.name,Array.isArray(values[d.name])?values[d.name]:[values[d.name]]])),o=(await executor.runGraph(name,[feeds]))[0];if(!Number(o.supported[0]))throw Error('Original initial VRAM producer is unsupported');vram={...vram,fronts:o.nextFronts,backs:o.nextBacks,bankEnabled:o.nextBankEnabled,priority:o.nextPriority,paletteFront:Number(o.nextPaletteFront[0]),paletteBack:Number(o.nextPaletteBack[0])};}Object.assign(installationState,{vram,stagingManagerBytes:[...c.graphics.stagingManagerBytes],stagingTaskBytes:clone(c.graphics.stagingTaskBytes),hardware:{masterBrightness:[...c.graphics.masterBrightness],displayControlLow16:[...c.graphics.displayControlLow16]}});}
  return{state:{scriptFlagsU16:[...c.scriptFlagsU16],resourceStateU16:[...c.resourceStateU16]},loaderState:loader,allocators:{37318656:clone(a)},installationState,context:{...c,firstParticipantPresent:!!c.firstParticipantPresent,partyObjectPresent:!!c.actorObjectPresent,allocatorU16:[0x7000,0x239],globalScriptOwnerPresent:true,globalAllocatorIndex:c.allocatorIndex,scriptAllocatorIndex:c.allocatorIndex,objectPointerU16}};
}
try{
  const resumeIds=new Set(['s019bm-capacity-56','s019bm-live-model-capacity-712','mp0201bm.chr-live-model','original-nsbmd-replace-capacity-184','original-nsbmd-replace-capacity-4096']);
  const jobs=[...source.results.map(original=>({original,resume:false})),...source.results.filter(o=>resumeIds.has(o.case.id)).map(original=>({original,resume:true}))];
  for(const {original,resume} of jobs){
    const c=original.case;if(!original.ok||!original.strictInitializedMemory||!original.completeFunctionExecuted)throw Error('A strict complete original caller is required: '+c.id);
    let input=await initial(c);const before=report.mismatches;allocations=[];
    if(resume){const installation=input.installationState;delete input.installationState;const prefix=await runner.run(input);compare(c.id,'prefix.complete',prefix.complete,false);compare(c.id,'prefix.requiresArchiveInstaller',prefix.requiresArchiveInstaller,true);compare(c.id,'prefix.allocations',allocations.length,1);input.installationState=installation;input=JSON.parse(JSON.stringify(input));report.jsonResumes++;}
    const result=await runner.run(input);
    compare(c.id,'complete',result.complete,true);if(!result.complete){report.examples.push({id:c.id,pending:result.pending});continue;}
    compare(c.id,'returnValue',result.returnValue,original.integerResult);compare(c.id,'scriptFlagsU16',input.state.scriptFlagsU16,original.actorResource.scriptFlagsU16);compare(c.id,'resourceStateU16',input.state.resourceStateU16,original.actorResource.resourceStateU16);
    compare(c.id,'allocationCount',allocations.length,original.cchrAllocations.length);
    for(let i=0;i<Math.min(allocations.length,original.cchrAllocations.length);i++)for(const key of Object.keys(allocations[i]))compare(c.id,'allocation'+i+'.'+key,allocations[i][key],original.cchrAllocations[i][key]);
    for(const[key,want]of Object.entries(original.allocator))compare(c.id,'allocator.'+key,input.allocators[37318656][key],want);
    compare(c.id,'ownerHeadU16',input.installationState.ownerHeadU16,original.ownerHeadU16);
    compare(c.id,'objectBytes',input.installationState.backingRegions[1].bytes,original.objectBytes);
    if(c.graphics){compare(c.id,'archiveBytes',input.installationState.backingRegions[2].bytes,original.archiveBytes);compare(c.id,'stagingManagerBytes',input.installationState.stagingManagerBytes,original.stagingManagerBytes);compare(c.id,'stagingTaskBytes',input.installationState.stagingTaskBytes,original.stagingTaskBytes);for(const[key,want]of Object.entries(original.vram))compare(c.id,'vram.'+key,key==='bankEnabled'?input.installationState.vram[key].map(logical):input.installationState.vram[key],want);}
    if(c.model){compare(c.id,'modelBytes',input.installationState.backingRegions[3].bytes,original.modelBytes);compare(c.id,'rawModelBytes',input.installationState.backingRegions[4].bytes,original.rawModelBytes);}
    const heap=input.installationState.backingRegions[0];let unknown=0;
    for(let i=0;i<heap.bytes.length;i++){const mask=heap.knownMaskBytes[i];if(mask===255)report.knownHeapBytesCompared++;else{unknown++;report.unknownHeapBytesExcluded++;}if(mask)compare(c.id,'heap.'+i.toString(16),heap.bytes[i]&mask,original.heapBytes[i]&mask);}
    for(const field of fields)compare(c.id,'loader.'+field,input.loaderState[field],original.loaderState[field]);compare(c.id,'loader.taskCount',input.loaderState.taskCount,original.loaderState.taskCount);
    report.cases.push({id:c.id,jsonResumed:resume,allocations:allocations.length,unknownHeapBytes:unknown,mismatches:report.mismatches-before});
  }
}finally{await executor.release();}
report.inputArchiveDerivations=source.results.filter(r=>r.case.archiveDerivation).map(r=>({id:r.case.id,archiveSHA256:r.case.archiveSHA256,...r.case.archiveDerivation}));
report.originalInstructionCases=source.results.length;
report.passed=report.mismatches===0&&report.cases.length===source.results.length+report.jsonResumes;await writeFile(option('--out'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,jsonResumes:report.jsonResumes,fields:report.fieldsCompared,mismatches:report.mismatches,unknownHeapBytesExcluded:report.unknownHeapBytesExcluded,examples:report.examples}));if(!report.passed)process.exitCode=1;
