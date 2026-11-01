// Functional file I/O with original queue, pointer and allocator transitions in
// shared ONNX. A script forgetting a handle never removes the loader's task.
const CAPACITY=24,clone=x=>structuredClone(x),scalar=(o,k)=>Number(o[k]?.[0]),suffix=k=>k[0].toUpperCase()+k.slice(1);
const fields={taskIds:24,taskStatuses:24,taskTypes:24,fileLengthsU16:48,scratchFirstWords:24,scratchNumWords:24,externalAllocatorU16:48,dataPointerU16:48};
const requireData=(condition,message)=>{if(!condition)throw Error(message);};
const bytes=x=>x instanceof Uint8Array?x:typeof x==='string'?Uint8Array.from(x.match(/../g)??[],v=>Number.parseInt(v,16)):Uint8Array.from(x??[]);
const pair=x=>Array.isArray(x)&&x.length===2&&x.every(v=>Number.isInteger(v)&&v>=0&&v<65536);
const filename=x=>typeof x==='string'&&x.length<24&&/^[\x01-\x7f]*$/.test(x);
const clearedSlot=old=>({directory:old?.directory??0,outerFilename:'',innerFilename:'',bytes:null,readComplete:false});
const copiedSlot=slot=>slot?{...slot}:null;
export const COMMON_RESOURCE_LOADER_MODELS=['rom-common-resource-loader'];

export function initialCommonResourceLoader(input){
  requireData(input?.contract==='dq9-functional-original-file-loader-v1'&&input.initialLayout==='empty-v1','An explicit empty original loader and scratch-capacity input is required');
  const size=input.scratchBytes,right=input.scratchRightArenaUsage??0,counter=input.taskCounter??0,base=input.scratchBaseU16,flags=input.loaderFlagsU16??[1,0],locks=input.processLockBitsU16??[0,0];
  requireData(Number.isInteger(size)&&size>=0&&size<=262140&&Number.isInteger(right)&&right>=0&&right<=size,'Original scratch size/right-arena input is required');
  requireData(pair(base)&&base[0]%4===0,'Original aligned scratch pointer limbs are required');
  requireData(pair(flags)&&pair(locks),'Original loader flags and process-lock pointer limbs are required');
  requireData(Number.isInteger(counter)&&counter>=0&&counter<1024,'Original 10-bit initial task counter is required');
  return{schema:'dq9-functional-original-file-loader-state-v2',taskCount:0,taskCounter:counter,scratchBytes:size,scratchRightArenaUsage:right,scratchBaseU16:[...base],rightmostAllocationByte:0,loaderFlagsU16:[...flags],processLockBitsU16:[...locks],slots:Array.from({length:CAPACITY},()=>clearedSlot()),...Object.fromEntries(Object.entries(fields).map(([name,width])=>[name,Array(width).fill(name==='taskStatuses'?-1:0)]))};
}

export function createCommonResourceLoaderRunner({runGraph,getModel,assets,onTrace}={}){
  async function call(s,operation,input={}){
    const name='rom-common-resource-loader',model=await getModel(name);requireData(model,'Missing shared original resource-loader graph');
    const names=new Set(model.inputs.map(d=>d.name));requireData(['externalAllocatorU16','dataPointerU16','scratchBaseU16','loaderFlagsU16','processLockBitsU16'].every(k=>names.has(k)),'A coherent resource-loader graph with raw pointer fields is required');
    requireData(Object.entries(fields).every(([k,width])=>Array.isArray(s[k])&&s[k].length===width)&&pair(s.loaderFlagsU16)&&pair(s.processLockBitsU16),'Original retained loader pointer/flag state is required; it cannot be reconstructed from task status or scratch descriptors');
    const values={...model.contract.defaults,...Object.fromEntries(Object.keys(fields).map(k=>[k,s[k]])),taskCount:s.taskCount,taskCounter:s.taskCounter,scratchBytes:s.scratchBytes,scratchBaseU16:s.scratchBaseU16,scratchRightArenaUsage:s.scratchRightArenaUsage,priorRightmostAllocationByte:s.rightmostAllocationByte,loaderFlagsU16:s.loaderFlagsU16,processLockBitsU16:s.processLockBitsU16,externalAllocatorPresent:Array(24).fill(false),operation,...input};
    const feeds=Object.fromEntries(model.inputs.map(d=>[d.name,Array.isArray(values[d.name])?values[d.name]:[values[d.name]]])),out=(await runGraph(name,[feeds]))[0];
    await onTrace?.({name,feeds:clone(feeds),result:clone(out)});return out;
  }
  function commit(s,o){for(const key of Object.keys(fields))s[key]=[...o['next'+suffix(key)]];s.taskCount=scalar(o,'nextTaskCount');s.taskCounter=scalar(o,'nextTaskCounter');s.rightmostAllocationByte=scalar(o,'rightmostAllocationByte');s.loaderFlagsU16=[...o.nextLoaderFlagsU16];}
  function taskAt(s,index){
    const value=s.slots[index];requireData(value,'Active original loader task payload is absent');
    return{...value,index,id:s.taskIds[index],status:s.taskStatuses[index],type:s.taskTypes[index],byteLength:s.fileLengthsU16[2*index]+65536*s.fileLengthsU16[2*index+1],scratchFirstWord:s.scratchFirstWords[index],scratchNumWords:s.scratchNumWords[index],externalAllocatorU16:s.externalAllocatorU16.slice(2*index,2*index+2),dataPointerU16:s.dataPointerU16.slice(2*index,2*index+2)};
  }
  function task(s,id){if(id<0)return null;const index=s.taskIds.findIndex((v,i)=>i<s.taskCount&&v===id);return index<0?null:taskAt(s,index);}
  return{
    task,
    async queue(s,request){
      const type=request?.type??0,external=request?.externalAllocatorU16??[0,0],inner=request?.innerFilename;
      requireData(request&&Number.isInteger(request.directory)&&request.directory>=0&&request.directory<24&&filename(request.outerFilename)&&request.outerFilename.length>0&&(inner==null||filename(inner))&&Number.isInteger(type)&&type>=0&&type<=2&&pair(external),'A bounded original directory, filename, task type and allocator pointer are required');
      const o=await call(s,0,{requestValid:true,requestTaskType:type,requestExternalAllocatorU16:external});
      if(!scalar(o,'supported'))return{pending:scalar(o,'queueFull')?'Original background-loader queue is full; the original caller enters its panic/wait-for-interrupt path':'Original background-loader task/allocator state is unsupported',queueFull:!!scalar(o,'queueFull')};
      const slot=scalar(o,'queuedSlot'),id=scalar(o,'queuedTaskId');requireData(slot>=0&&slot===s.taskCount,'Original loader append result is invalid');
      // QueueFileTask writes the inner name only for a nonnull GP2 argument.
      // It clears pFileData while retaining the old length/scratch descriptor.
      s.slots[slot]={directory:request.directory,outerFilename:request.outerFilename.replace(/\\/g,'/'),innerFilename:type===2&&inner!=null?inner:(s.slots[slot]?.innerFilename??''),bytes:null,readComplete:false,...(request.assetKey?{assetKey:request.assetKey}:{})};
      commit(s,o);return{complete:true,id};
    },
    async addFence(s){
      const o=await call(s,4);if(!scalar(o,'supported'))return{pending:scalar(o,'queueFull')?'Original background-loader queue is full':'Original AddFence needs unsupported loader state'};
      const added=!!scalar(o,'fenceAdded'),slot=scalar(o,'fenceSlot');if(added)s.slots[slot]=clearedSlot(s.slots[slot]);commit(s,o);return{complete:true,added,slot};
    },
    async remove(s,id){
      const o=await call(s,2,{queryTaskId:id});requireData(!!scalar(o,'supported'),'Original loader removal needs an unsupported task/fence producer');
      const at=scalar(o,'removedSlot'),fences=scalar(o,'removedLeadingFences');
      if(at>=0){
        for(let i=at;i<s.taskCount-1;i++)s.slots[i]=copiedSlot(s.slots[i+1]);
        s.slots[s.taskCount-1]=clearedSlot(s.slots[s.taskCount-1]);
        // The original second compaction copies only the new live prefix. Its
        // inactive duplicates remain; copies must not share mutable metadata.
        if(fences)for(let i=0;i<scalar(o,'nextTaskCount');i++)s.slots[i]=copiedSlot(s.slots[i+fences]);
      }
      commit(s,o);return{complete:true,removed:at>=0,removedLeadingFences:fences};
    },
    async status(s,id){const o=await call(s,3,{queryTaskId:id});requireData(!!scalar(o,'supported'),'Original loader status query needs unsupported task state');return scalar(o,'taskStatus');},
    async process(s){
      let completed=0;
      // At most24 reads can commit, followed by the actual no-eligible-read
      // Process suffix. Completing this component does not declare readiness.
      for(let i=0;i<=CAPACITY;i++){
        const inspect=await call(s,3),slot=scalar(inspect,'selectedSlot');
        if(!scalar(inspect,'supported'))return{pending:'Original loader task/allocator state is unsupported',completed};
        if(slot<0){const done=await call(s,5);requireData(!!scalar(done,'supported')&&!!scalar(done,'completed'),'Original Process suffix did not complete');commit(s,done);return{complete:true,completed,blockedByFence:!!scalar(done,'processBlockedByFence'),blockedByLock:!!scalar(done,'processBlockedByLock')};}
        const target=taskAt(s,slot);
        if(target.externalAllocatorU16.some(Boolean))return{pending:'Original external-allocator file read/copy producer is required',completed,requiresExternalAllocator:true,taskId:target.id};
        if(target.type!==0)return{pending:'Original '+(target.type===1?'GP1':'GP2')+' file reader is required',completed,taskId:target.id};
        const supplied=assets?.[target.assetKey??target.outerFilename];if(supplied===undefined)return{pending:'Original resource input is unavailable: '+target.outerFilename,completed};
        const exists=supplied?.exists!==false,buffer=exists?bytes(supplied.bytes??supplied.hex??supplied):new Uint8Array(0),length=exists?(supplied.byteLength??buffer.length):0;
        requireData(Number.isSafeInteger(length)&&length>=0&&length<=262140,'Resource length exceeds the admitted original scratch domain');
        if(exists&&buffer.length!==length)return{pending:'Original resource input has not reached its declared length: '+target.outerFilename,completed};
        const o=await call(s,1,{readComplete:true,fileExists:exists,readByteLengthU16:[length%65536,Math.floor(length/65536)]});
        if(!scalar(o,'supported'))return{pending:'Original file-read result is outside the supported allocator state',completed};
        if(scalar(o,'allocationPending'))return{pending:'Original scratch allocation is pending for '+target.outerFilename,completed,allocationPending:true,requiredBytes:Math.ceil(length/4)*4,scratchBytes:s.scratchBytes};
        requireData(!!scalar(o,'readCommitted'),'Original functional file operation did not commit');
        s.slots[slot]={...s.slots[slot],bytes:exists?Array.from(buffer):null,readComplete:exists};commit(s,o);completed++;
      }
      throw Error('Original loader exceeded its fixed queue capacity');
    }
  };
}
