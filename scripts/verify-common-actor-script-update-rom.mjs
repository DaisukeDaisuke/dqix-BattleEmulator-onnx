#!/usr/bin/env node
// Whole unchanged script-update callers are the oracle. Only their declared
// initial state drives production ONNX and the shared loader runtime.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
import {createCommonAnimationActorResourceRunner} from '../runtime/common-animation-actor-resource.mjs';
import {initialCommonResourceLoader} from '../runtime/common-resource-loader.mjs';

const args=process.argv.slice(2),option=n=>{const i=args.indexOf(n);return i<0?undefined:args[i+1];};
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),hash=x=>createHash('sha256').update(x).digest('hex'),scalar=(o,k)=>Number(o[k]?.[0]);
const sourceBytes=await readFile(option('--source')),source=JSON.parse(sourceBytes);
if(!source.executionComplete||!source.programUnmodified||source.romSHA256!=='b7a7f82f9da6f5bd08b5ae436d67cbde020f15e79534e0d34853201cd24d775d')throw Error('Unchanged original ROM evidence is required');
const models=new Map();
for(const name of['rom-common-animation-actor-resource','rom-common-resource-loader','rom-common-presentation-delay','rom-common-empty-script-tick']){
  const onnx=await readFile(resolve(root,'graph-v2',name+'.onnx')),irBytes=await readFile(resolve(root,'graph-v2',name+'.json'));
  models.set(name,{name,onnx,ir:JSON.parse(irBytes),sha256:hash(onnx)});
}
const ort=await loadLocalOrt(option('--ort-dir')),executor=createGraphExecutor({models,ortRuntime:ort});
const actor=createCommonAnimationActorResourceRunner({getModel:name=>models.get(name)?.ir,runGraph:executor.runGraph});
const report={schema:'dq9-original-actor-script-update-verification-v1',sourceSHA256:hash(sourceBytes),models:[...models.values()].map(({name,sha256})=>({name,sha256})),fieldsCompared:0,mismatches:0,examples:[],cases:[],scope:'Whole original021e9c0c delay/enabled/resource precheck ordering, including real loader queue/status/removal and actual empty-body event-bit updates. Initial operands only; no original returned value or final memory is fed to production. Nonempty animation installation is not claimed.'};
const fields=['taskIds','taskStatuses','taskTypes','fileLengthsU16','scratchFirstWords','scratchNumWords'];
function compare(id,key,actual,expected){
  if(Array.isArray(expected)){if(!Array.isArray(actual)||actual.length!==expected.length)throw Error(id+': shape mismatch '+key);expected.forEach((v,i)=>compare(id,key+'['+i+']',actual[i],v));return;}
  report.fieldsCompared++;if(actual!==expected){report.mismatches++;if(report.examples.length<40)report.examples.push({id,key,actual,expected});}
}
async function call(name,input){
  const ir=models.get(name).ir,values={...ir.contract.defaults,...input},feeds={};
  for(const d of ir.inputs){const v=values[d.name];if(v===undefined)throw Error('Missing original initial operand '+d.name);feeds[d.name]=Array.isArray(v)?v:[v];}
  return(await executor.runGraph(name,[feeds]))[0];
}
try{
  for(const original of source.results){
    if(!original.ok||!original.strictInitializedMemory||!original.completeFunctionExecuted||original.address!=='0x021e9c0c')throw Error('A strict whole original script update is required: '+original.case.id);
    const c=original.case,before=report.mismatches,state={scriptFlagsU16:[...c.scriptFlagsU16],resourceStateU16:[...c.resourceStateU16]};
    const loader=initialCommonResourceLoader({contract:'dq9-functional-original-file-loader-v1',initialLayout:'empty-v1',scratchBytes:c.scratchBytes,scratchRightArenaUsage:c.scratchRightArenaUsage??0,scratchBaseU16:[0x1000,0x238],taskCounter:c.taskCounter});
    for(const field of fields)loader[field]=[...c[field]];loader.taskCount=c.taskCount;loader.rightmostAllocationByte=c.priorRightmostAllocationByte??0;loader.slots.forEach(slot=>slot.directory=20);
    const delay=await call('rom-common-presentation-delay',{delay:c.scriptDelay,deltaU16:[c.deltaTicks,0],scriptEnabled:!!c.scriptEnabled});
    if(scalar(delay,'requiresDelayCommit'))throw Error('This cohort does not supply the independent delay-expiry sound inputs');
    let actorResult={returnValue:0};
    if(scalar(delay,'enabledAfterDelay')){
      actorResult=await actor.run({state,loaderState:loader,context:{...c,firstParticipantPresent:!!c.firstParticipantPresent,partyObjectPresent:!!c.actorObjectPresent,allocatorU16:c.allocatorPresent?[0x7000,0x239]:[0,0],globalScriptOwnerPresent:true,globalAllocatorIndex:c.allocatorIndex}});
      if(!actorResult.complete)throw Error(c.id+': unexpected producer boundary '+actorResult.pending);
    }
    const tick=await call('rom-common-empty-script-tick',{scriptBaseU16:[0x224,0x237],scriptEnabled:!!c.scriptEnabled,delayReturned:!!scalar(delay,'returnedForDelay'),actorResourceReturned:actorResult.returnValue!==0,cursorPresent:!!c.cursorPresent,scriptFlagsLow:state.scriptFlagsU16[0],resourceStates:[c.resourceJobByte,0,0,0],eventFlagsU16:c.eventFlagsU16});
    compare(c.id,'supported',scalar(tick,'supported'),1);compare(c.id,'delay',scalar(delay,'nextDelay'),original.scriptUpdate.delay);
    compare(c.id,'scriptFlagsU16',state.scriptFlagsU16,original.actorResource.scriptFlagsU16);compare(c.id,'resourceStateU16',state.resourceStateU16,original.actorResource.resourceStateU16);
    compare(c.id,'eventFlagsU16',tick.nextEventFlagsU16,original.scriptUpdate.eventFlagsU16);compare(c.id,'scriptOwnerU16',tick.scriptOwnerGlobalU16,original.scriptUpdate.ownerU16);
    compare(c.id,'cursorPresent',!!c.cursorPresent,original.scriptUpdate.cursorPresent);compare(c.id,'resourceJobByte',c.resourceJobByte,original.scriptUpdate.resourceJobByte);
    compare(c.id,'scriptEnabled',c.scriptEnabled,original.scriptUpdate.scriptEnabled);
    for(const field of fields)compare(c.id,'loader.'+field,loader[field],original.loaderState[field]);
    compare(c.id,'loader.taskCount',loader.taskCount,original.loaderState.taskCount);compare(c.id,'loader.taskCounter',loader.taskCounter,original.loaderState.taskCounter);
    report.cases.push({id:c.id,actorReturned:actorResult.returnValue,bodyExecuted:!!scalar(tick,'bodyExecuted'),mismatches:report.mismatches-before});
  }
}finally{await executor.release();}
report.passed=report.mismatches===0;await writeFile(option('--out'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,fields:report.fieldsCompared,mismatches:report.mismatches,examples:report.examples}));if(!report.passed)process.exitCode=1;
