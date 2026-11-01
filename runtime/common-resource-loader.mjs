// Functional file I/O with the original queue/allocator state in shared ONNX.
// Script owner handles are separate from the loader: forgetting a handle never
// removes its task. Actual archive bytes remain local, serializable inputs.
const CAPACITY=24,clone=x=>structuredClone(x),scalar=(o,k)=>Number(o[k]?.[0]),suffix=k=>k[0].toUpperCase()+k.slice(1),fields={taskIds:24,taskStatuses:24,taskTypes:24,fileLengthsU16:48,scratchFirstWords:24,scratchNumWords:24};
const requireData=(condition,message)=>{if(!condition)throw Error(message);};
const bytes=x=>x instanceof Uint8Array?x:typeof x==='string'?Uint8Array.from(x.match(/../g)??[],v=>Number.parseInt(v,16)):Uint8Array.from(x??[]);
export const COMMON_RESOURCE_LOADER_MODELS=['rom-common-resource-loader'];

export function initialCommonResourceLoader(input){
  requireData(input?.contract==='dq9-functional-original-file-loader-v1'&&input.initialLayout==='empty-v1','An explicit empty original loader and scratch-capacity input is required');
  const size=input.scratchBytes,right=input.scratchRightArenaUsage??0,counter=input.taskCounter??0,base=input.scratchBaseU16;
  requireData(Number.isInteger(size)&&size>=0&&size<=262140&&Number.isInteger(right)&&right>=0&&right<=size,'Original scratch size/right-arena input is required');
  requireData(Array.isArray(base)&&base.length===2&&base.every(x=>Number.isInteger(x)&&x>=0&&x<65536)&&base[0]%4===0,'Original aligned scratch pointer limbs are required');
  requireData(Number.isInteger(counter)&&counter>=0&&counter<1024,'Original10-bit initial task counter is required');
  return{schema:'dq9-functional-original-file-loader-state-v1',taskCount:0,taskCounter:counter,scratchBytes:size,scratchRightArenaUsage:right,scratchBaseU16:[...base],rightmostAllocationByte:0,slots:Array(CAPACITY).fill(null),...Object.fromEntries(Object.entries(fields).map(([name,width])=>[name,Array(width).fill(0)]))};
}

export function createCommonResourceLoaderRunner({runGraph,getModel,assets,onTrace}={}){
  async function call(s,operation,input={}){
    const name='rom-common-resource-loader',model=await getModel(name);requireData(model,'Missing shared original resource-loader graph');
    const values={...model.contract.defaults,...Object.fromEntries(Object.keys(fields).map(k=>[k,s[k]])),taskCount:s.taskCount,taskCounter:s.taskCounter,scratchBytes:s.scratchBytes,scratchRightArenaUsage:s.scratchRightArenaUsage,priorRightmostAllocationByte:s.rightmostAllocationByte,externalAllocatorPresent:Array(24).fill(false),operation,...input},feeds=Object.fromEntries(model.inputs.map(d=>[d.name,Array.isArray(values[d.name])?values[d.name]:[values[d.name]]]));
    const out=(await runGraph(name,[feeds]))[0];await onTrace?.({name,feeds:clone(feeds),result:clone(out)});return out;
  }
  function commit(s,o){for(const key of Object.keys(fields))s[key]=[...o['next'+suffix(key)]];s.taskCount=scalar(o,'nextTaskCount');s.taskCounter=scalar(o,'nextTaskCounter');s.rightmostAllocationByte=scalar(o,'rightmostAllocationByte');}
  function task(s,id){const index=s.taskIds.findIndex((v,i)=>i<s.taskCount&&v===id);if(index<0)return null;const value=s.slots[index];requireData(value,'Active original loader task payload is absent');return{...value,index,id,status:s.taskStatuses[index],type:s.taskTypes[index],byteLength:s.fileLengthsU16[2*index]+65536*s.fileLengthsU16[2*index+1],scratchFirstWord:s.scratchFirstWords[index],scratchNumWords:s.scratchNumWords[index],dataPointerU16:(()=>{const address=s.scratchBaseU16[0]+65536*s.scratchBaseU16[1]+4*s.scratchFirstWords[index];return s.scratchNumWords[index]?[address%65536,Math.floor(address/65536)]:[0,0];})()};}
  return{
    task,
    async queue(s,request){
      const valid=request?.innerFilename===''&&((request.directory===20&&request.outerFilename==='actmsg.nat')||(request.directory===22&&['actetc.nsarc','actskl.nsarc','actspl.nsarc'].includes(request.outerFilename)));
      requireData(valid,'An actual supported original file request is required');
      const o=await call(s,0,{requestValid:true});if(!scalar(o,'supported'))return{pending:scalar(o,'queueFull')?'Original background-loader queue is full':'Original background-loader task/allocator state is unsupported'};
      const slot=scalar(o,'queuedSlot'),id=scalar(o,'queuedTaskId');requireData(slot>=0&&slot===s.taskCount,'Original loader append result is invalid');s.slots[slot]={...clone(request),bytes:null,readComplete:false};commit(s,o);return{complete:true,id};
    },
    async remove(s,id){
      const o=await call(s,2,{queryTaskId:id});requireData(!!scalar(o,'supported'),'Original loader removal needs an unsupported task/fence producer');const at=scalar(o,'removedSlot');if(at>=0){for(let i=at;i<s.taskCount-1;i++)s.slots[i]=s.slots[i+1];s.slots[s.taskCount-1]=null;}commit(s,o);return{complete:true,removed:at>=0};
    },
    async status(s,id){const o=await call(s,3,{queryTaskId:id});requireData(!!scalar(o,'supported'),'Original loader status query needs an unsupported task/fence producer');return scalar(o,'taskStatus');},
    async process(s){
      // The original default-file process repeats in queue order until no
      // unallocated task remains. A missing input or allocation is a real
      // pending boundary, never a successful zero-length resource.
      let completed=0;
      for(let i=0;i<CAPACITY;i++){
        const inspect=await call(s,3),slot=scalar(inspect,'selectedSlot');if(!scalar(inspect,'supported'))return{pending:'Original loader task/allocator state is unsupported',completed};
        if(slot<0)return{complete:true,completed};const target=s.slots[slot];requireData(target,'Original pending task metadata is required');
        const supplied=assets?.[target.outerFilename];if(supplied===undefined)return{pending:'Original resource input is unavailable: '+target.outerFilename,completed};
        const exists=supplied?.exists!==false,buffer=exists?bytes(supplied.bytes??supplied.hex??supplied):new Uint8Array(0),length=exists?(supplied.byteLength??buffer.length):0;
        requireData(Number.isSafeInteger(length)&&length>=0&&length<=262140,'Resource length exceeds the admitted original scratch domain');
        if(exists&&buffer.length!==length)return{pending:'Original resource input has not reached its declared length: '+target.outerFilename,completed};
        const o=await call(s,1,{readComplete:true,fileExists:exists,readByteLengthU16:[length%65536,Math.floor(length/65536)]});
        if(!scalar(o,'supported'))return{pending:'Original file-read result is outside the supported allocator state',completed};
        if(scalar(o,'allocationPending'))return{pending:'Original scratch allocation is pending for '+target.outerFilename,completed,allocationPending:true,requiredBytes:Math.ceil(length/4)*4,scratchBytes:s.scratchBytes};
        requireData(!!scalar(o,'readCommitted'),'Original functional file operation did not commit');target.bytes=exists?Array.from(buffer):null;target.readComplete=exists;commit(s,o);completed++;
      }
      return{complete:true,completed};
    }
  };
}
