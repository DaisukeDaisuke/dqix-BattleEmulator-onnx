// The shared actor-resource graph owns the original control flow. This adapter
// passes retained loader state and formats graph-selected filenames; it never
// substitutes elapsed time for a task result or invents a loaded archive.
import {createCommonResourceLoaderRunner,COMMON_RESOURCE_LOADER_MODELS} from './common-resource-loader.mjs';
import {createCommonSafeAllocatorRunner,COMMON_SAFE_ALLOCATOR_MODELS} from './common-safe-allocator.mjs';

const clone=x=>structuredClone(x),scalar=(o,k)=>Number(o[k]?.[0]);
const requireData=(condition,message)=>{if(!condition)throw Error(message);};
const limbs=(x,n)=>Array.isArray(x)&&x.length===n&&x.every(v=>Number.isInteger(v)&&v>=0&&v<65536);
const signedWord=x=>{const n=x[0]+65536*x[1];return n>=0x80000000?n-0x100000000:n;};
export const COMMON_ANIMATION_ACTOR_RESOURCE_MODELS=['rom-common-animation-actor-resource',...COMMON_RESOURCE_LOADER_MODELS,...COMMON_SAFE_ALLOCATOR_MODELS];

export function createCommonAnimationActorResourceRunner(options){
  const {getModel,runGraph,onTrace}=options,loader=createCommonResourceLoaderRunner(options),allocator=createCommonSafeAllocatorRunner(options);
  async function call(input){
    const name='rom-common-animation-actor-resource',model=await getModel(name);
    requireData(model,'The original actor-resource graph is required');
    const values={...model.contract.defaults,...input},feeds={};
    for(const d of model.inputs){const v=values[d.name];requireData(v!==undefined,'Missing actor-resource operand '+d.name);feeds[d.name]=Array.isArray(v)?v:[v];}
    const out=(await runGraph(name,[feeds]))[0];
    await onTrace?.({model:name,inputs:[clone(feeds)],outputs:[clone(out)]});return out;
  }
  return{
    models:COMMON_ANIMATION_ACTOR_RESOURCE_MODELS,
    async run({state,loaderState,context,allocators}={}){
      requireData(limbs(state?.scriptFlagsU16,2)&&limbs(state?.resourceStateU16,8),'Retained script flags and all16 actor-resource state bytes are required');
      requireData(Number.isInteger(context?.participantCount)&&context.participantCount>=0&&context.participantCount<256&&typeof context.firstParticipantPresent==='boolean'&&Number.isInteger(context.sourceId)&&typeof context.partyObjectPresent==='boolean','The actual current command and actor lookup are required');
      requireData(limbs(context.allocatorU16,2),'The current original allocator pointer is required');
      if(state.boundary)return{complete:false,pending:state.boundary.reason,boundary:clone(state.boundary)};
      const input={...context,scriptFlagsU16:state.scriptFlagsU16,resourceStateU16:state.resourceStateU16,allocatorPresent:context.allocatorU16.some(Boolean),stage:0,enabled:true};
      const stop=(reason,extra={})=>({complete:false,pending:reason,...extra});
      for(let transitions=0;transitions<8;transitions++){
        const out=await call(input);
        state.scriptFlagsU16=[...out.nextScriptFlagsU16];state.resourceStateU16=[...out.nextResourceStateU16];
        input.scriptFlagsU16=state.scriptFlagsU16;input.resourceStateU16=state.resourceStateU16;
        if(!scalar(out,'supported'))return stop('Original archive installation requires its retained global script owner');
        if(scalar(out,'callCompleted'))return{complete:true,returnValue:scalar(out,'returnValue'),waiting:!!scalar(out,'waiting')};
        if(scalar(out,'requiresNameProducer'))return stop('Original actor appearance/equipment records are required to produce the archive filename');
        requireData(loaderState,'Actor resource requests require the retained shared loader');
        if(scalar(out,'requestQueue')){
          const kind=scalar(out,'requestPathKind');
          const request={directory:scalar(out,'requestDirectory'),type:scalar(out,'requestTaskType'),externalAllocatorU16:[...context.allocatorU16],outerFilename:kind===0?'s019bm.chr':'chara_mp.gp2'};
          if(kind===1)request.innerFilename='mp'+String(scalar(out,'requestBodyNumber')).padStart(2,'0')+String(scalar(out,'requestWeaponNumber')).padStart(2,'0')+'bm.chr';
          const queued=await loader.queue(loaderState,request);
          if(!queued.complete){
            if(queued.queueFull)state.boundary={kind:'original-queue-full-panic',reason:queued.pending,callCompleted:false};
            return stop(queued.pending,{boundary:clone(state.boundary??null),request});
          }
          input.stage=1;input.queueReturned=true;input.queuedTaskId=queued.id;
        }else if(scalar(out,'requestTaskStatus')){
          input.taskStatus=await loader.status(loaderState,signedWord(out.requestTaskIdU16));input.taskStatusReturned=true;
        }else if(scalar(out,'requestLoadedFile')){
          const task=loader.task(loaderState,signedWord(out.requestTaskIdU16));
          input.loadedFilePresent=!!task?.dataPointerU16.some(Boolean);input.loadedFileReturned=true;
        }else if(scalar(out,'requestAllocate12')){
          const pointer=context.allocatorU16[0]+65536*context.allocatorU16[1],allocatorState=allocators?.[String(pointer)];
          if(!pointer||!allocatorState)return stop('The actual original resource allocator state is required',{requiresAllocatorState:true,taskId:signedWord(out.requestTaskIdU16)});
          const allocated=await allocator.allocate(allocatorState,[12,0]);
          if(!allocated.complete)return allocated;
          input.stage=2;input.allocationReturned=true;input.allocationPresent=allocated.allocated;
          state.allocatedNodeU16=[...allocated.pointerU16];
        }else if(scalar(out,'requestArchiveInstall')){
          state.boundary={kind:'original-archive-installation',reason:'The original CCHR/CMOT installer and resource-list append are required',callCompleted:false,taskId:signedWord(out.requestTaskIdU16),sourceId:context.sourceId,allocatedNodeU16:[...state.allocatedNodeU16]};
          return stop(state.boundary.reason,{requiresArchiveInstaller:true,boundary:clone(state.boundary)});
        }else if(scalar(out,'requestRemoveTask')){
          const removed=await loader.remove(loaderState,signedWord(out.requestTaskIdU16));
          requireData(removed.complete,'The original task removal must return before clearing script state');input.stage=4;input.removeReturned=true;
        }else throw Error('Unresolved actor-resource graph transition');
      }
      throw Error('The actor-resource call exceeded its finite transition budget');
    }
  };
}
