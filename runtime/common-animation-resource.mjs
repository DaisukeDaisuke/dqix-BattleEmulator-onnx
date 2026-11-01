// Real opcode18/19/20 helper boundaries. Host code only performs pathname
// parsing, structural scatter and scheduling of the shared graphs.
import {validateGraphInputs} from '../graph-v2/input-domains.mjs';
import {ORIGINAL_RESOURCE_DIRECTORIES,ORIGINAL_RESOURCE_ARCHIVE_PATHS} from '../data/resource-paths.mjs';
import {createCommonResourceLoaderRunner} from './common-resource-loader.mjs';
import {createCommonAnimationInstallRunner} from './common-animation-install.mjs';

export const COMMON_ANIMATION_RESOURCE_MODELS=['rom-common-animation-resource','rom-common-resource-loader'];
const clone=x=>structuredClone(x),scalar=(o,k)=>Number(o[k]?.[0]),validPair=p=>Array.isArray(p)&&p.length===2&&p.every(x=>Number.isInteger(x)&&x>=0&&x<=65535),same=(a,b)=>a?.[0]===b?.[0]&&a?.[1]===b?.[1];

export function originalAnimationResourcePath(name){
 if(typeof name!=='string'||!name.length||!/^[\x01-\x7f]+$/.test(name)||name.length+5>=80)throw Error('Original resource name exceeds its declared80-byte formatter domain');
 const requested='data/'+name;let path=requested,innerFilename='',type=0;
 // The two backslash strstr calls in the original discard their results.
 // Normalization belongs to QueueFileTask after this archive decision.
 for(const r of ORIGINAL_RESOURCE_ARCHIVE_PATHS){const at=requested.indexOf(r.needle);if(at>=0){path=r.outer;innerFilename=requested.slice(at+r.prefix.length);type=2;break;}}
 const normalized=path.replace(/\\/g,'/'),start=normalized.indexOf('data/'),relative=normalized.slice(start+5),directory=ORIGINAL_RESOURCE_DIRECTORIES.findIndex(x=>relative.startsWith(x));
 if(start<0||directory<0)throw Error('Resource path has no original directory-table match');
 const outerFilename=relative.slice(ORIGINAL_RESOURCE_DIRECTORIES[directory].length);if(!outerFilename.length||outerFilename.length>=24||innerFilename.length>=24)throw Error('Original resource filename exceeds its24-byte task field');
 return{requested,path,type,directory,outerFilename,innerFilename,externalAllocatorU16:[0,0]};
}

export function createCommonAnimationResourceRunner({runGraph,getModel,onTrace,assets}={}){
 async function run({state:input,opcode,resourceName,resourceIdByte=255,allocatorIndex=0,safeAllocatorPointerU16,scriptOwnerPresent=true,maxTransitions=32,signal,shouldStop}={}){
  const state=clone(input);let transitions=0;
  if(!Number.isInteger(maxTransitions)||maxTransitions<1)throw Error('A positive resource transition budget is required');
  if(!state.loader||!Array.isArray(state.scriptTaskIds)||state.scriptTaskIds.length!==8||!validPair(state.eventFlagsU16)||!validPair(state.resourceCounterU16))throw Error('Actual retained loader, tracker and resource globals are required');
  if(!state.resourceOpcodeCall)state.resourceOpcodeCall={step:'decision',phase:0,opcode,resourceName,resourceIdByte,allocatorIndex,safeAllocatorPointerU16:clone(safeAllocatorPointerU16),scriptOwnerPresent,path:opcode===19?null:originalAnimationResourcePath(resourceName),returns:{}};
  const pending=(reason,extra={})=>({complete:false,pending:reason,state,transitions,...extra});
  function budget(){if(signal?.aborted||shouldStop?.())throw Object.assign(Error('User stopped the resource opcode'),{code:'DQ9_RESOURCE_BUDGET',stopped:true});if(transitions>=maxTransitions)throw Object.assign(Error('Resource opcode transition budget exhausted'),{code:'DQ9_RESOURCE_BUDGET'});}
  const boundedRun=async(name,rows)=>{budget();const out=await runGraph(name,rows);transitions++;return out;};
  const loader=createCommonResourceLoaderRunner({runGraph:boundedRun,getModel,onTrace,assets});
  function matchSlots(work){return state.loader.slots.map(slot=>!!slot&&'data/'+ORIGINAL_RESOURCE_DIRECTORIES[slot.directory]+slot.outerFilename===work.path?.path&&(work.path?.type!==2||slot.innerFilename===work.path.innerFilename));}
  function commit(o){state.scriptTaskCount=scalar(o,'nextScriptTaskCount');state.scriptTaskIds=[...o.nextScriptTaskIds];state.eventFlagsU16=[...o.nextEventFlagsU16];state.resourceCounterU16=[...o.nextResourceCounterU16];}
  async function decision(){
   const name='rom-common-animation-resource',ir=await getModel(name);if(!ir)throw Error('Missing shared animation resource graph');const w=state.resourceOpcodeCall,available=!!state.installer?.safeAllocators?.some(x=>same(x.pointerU16,w.safeAllocatorPointerU16));
   const values={...ir.contract.defaults,opcode:w.opcode,phase:w.phase,scriptTaskCount:state.scriptTaskCount,scriptTaskIds:state.scriptTaskIds,eventFlagsU16:state.eventFlagsU16,resourceCounterU16:state.resourceCounterU16,loaderTaskCount:state.loader.taskCount,loaderTaskIds:state.loader.taskIds,loaderTaskStatuses:state.loader.taskStatuses,loaderFlagsU16:state.loader.loaderFlagsU16,filenameMatches:matchSlots(w),fileDataPresent:Array.from({length:24},(_,i)=>state.loader.dataPointerU16.slice(2*i,2*i+2).some(Boolean)),allocatorInitialized:available,scriptOwnerPresent:w.scriptOwnerPresent,...w.returns};
   const feeds=Object.fromEntries(ir.inputs.map(d=>[d.name,Array.isArray(values[d.name])?values[d.name]:[values[d.name]]])),errors=validateGraphInputs(ir.contract,feeds);if(errors.length)throw Error(name+': '+errors.join('; '));const o=(await boundedRun(name,[feeds]))[0];await onTrace?.({model:name,inputs:[clone(feeds)],outputs:[clone(o)]});
   // A ready raw file cannot be silently skipped just because its allocator
   // producer is not yet attached. A null internal handle is an explicit HMRF
   // state and is handled by the real allocator graph, unlike null this.
   if(w.opcode===20&&w.phase===0&&scalar(o,'loadedDataReady')&&!available)return{pending:'The original resource20 allocation branch requires its actual nonnull SafeAllocator object and computed state'};
   return{o};
  }
  try{
   for(;;){budget();const w=state.resourceOpcodeCall;
    if(w.step==='decision'){
     const d=await decision();if(d.pending)return pending(d.pending);const o=d.o;if(!scalar(o,'supported'))return pending('Original resource opcode state is outside the admitted shared boundary');w.result=clone(o);
     if(scalar(o,'requestFence'))w.step='fence';
     else if(scalar(o,'requestQueue')){commit(o);w.step='queue';}
     else if(scalar(o,'requiresArchiveInstallation'))w.step='install';
     else if(scalar(o,'requestRemove'))w.step='remove';
     else{commit(o);if(!scalar(o,'handlerCompleted'))return pending('Original resource handler has another pending producer');const returned=scalar(o,'handlerReturnU16'),installation=w.installation;delete state.resourceOpcodeCall;return{complete:true,state,transitions,returnValue:returned,installation,scope:'Original resource opcode and its computed loader/installation state; enclosing script loop and physical VRAM transfers remain separate'};}
    }else if(w.step==='fence'){
     const r=await loader.addFence(state.loader);if(!r.complete)return pending(r.pending);commit(w.result);w.step='queue';
    }else if(w.step==='queue'){
     const r=await loader.queue(state.loader,w.path);if(!r.complete)return pending(r.pending);w.phase=1;w.returns={queuedTaskId:r.id};w.step='decision';
    }else if(w.step==='install'){
     const index=scalar(w.result,'selectedSlot'),slot=state.loader.slots[index],length=state.loader.fileLengthsU16[2*index]+65536*state.loader.fileLengthsU16[2*index+1];
     if(!slot?.bytes||slot.bytes.length!==length)return pending('The original loaded resource pointer needs its exact current file bytes');
     const installer=await createCommonAnimationInstallRunner({runGraph,getModel,onTrace});state.installer.resourceCounterU16=[...state.resourceCounterU16];
     // This original installation helper is atomic with respect to the outer
     // stop budget. Each completed helper return is retained before proceeding;
     // a pending internal producer is never replayed as a new installation.
     const r=await installer.install({state:state.installer,fileDataReady:true,archiveBytes:slot.bytes,archivePointerU16:state.loader.dataPointerU16.slice(2*index,2*index+2),resourceIdByte:w.resourceIdByte,allocatorIndex:w.allocatorIndex,safeAllocatorPointerU16:w.safeAllocatorPointerU16});transitions++;state.installer=r.state;state.resourceCounterU16=[...r.state.resourceCounterU16];w.installation=clone({...r,state:undefined});
     if(!r.complete){w.step='installation-pending';return pending(r.pending,{installationPending:true,phase:r.phase});}
     w.phase=2;w.returns={installationCallerCompleted:true};w.step='decision';
    }else if(w.step==='installation-pending')return pending('The retained original installation requires its missing internal producer',{installationPending:true,phase:w.installation.phase});
    else if(w.step==='remove'){
     await loader.remove(state.loader,scalar(w.result,'selectedTaskId'));commit(w.result);const returned=scalar(w.result,'handlerReturnU16'),installation=w.installation;delete state.resourceOpcodeCall;return{complete:true,state,transitions,returnValue:returned,installation,scope:'Original resource opcode and computed task removal; VRAM transfer remains separately queued'};
    }else throw Error('Unknown retained resource opcode boundary '+w.step);
   }
  }catch(error){if(error.code==='DQ9_RESOURCE_BUDGET'||error.code==='DQ9_BUDGET')return pending(error.message,{budgetExhausted:true,stopped:!!error.stopped});throw error;}
 }
 return{run,models:COMMON_ANIMATION_RESOURCE_MODELS};
}
