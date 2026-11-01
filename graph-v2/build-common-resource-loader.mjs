import {fileURLToPath} from 'node:url';
import {Graph} from './graph-builder.mjs';

const CAPACITY=24,fields={taskIds:[24,-32768,32767],taskStatuses:[24,-1,5],taskTypes:[24,0,4],fileLengthsU16:[48,0,65535],scratchFirstWords:[24,0,65535],scratchNumWords:[24,0,65535],externalAllocatorU16:[48,0,65535],dataPointerU16:[48,0,65535]};
const suffix=k=>k[0].toUpperCase()+k.slice(1),fold=(g,op,values)=>values.reduce((a,b)=>g[op](a,b));

/** Original task queue plus default-file scratch allocation. Filesystem bytes
 * are external input; no elapsed frame can make an incomplete read complete. */
export function buildCommonResourceLoader(){
  const defaults=Object.fromEntries(Object.entries(fields).map(([name,[width]])=>[name,Array(width).fill(0)]));
  const g=new Graph('rom-common-resource-loader',{
    inputContractVersion:2,
    authority:{matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10',sources:['src/Filesystem/BackgroundLoader.cpp','src/Filesystem/Overlay_33/Ov33BackgroundLoader.cpp'],originals:{queueFileTask:'JPN0202f5a8',getTaskStatus:'JPN0202f908',getLoadedFileById:'JPN0202fa00'}},
    scope:'Original24-slot queue identities/statuses,1024-wrap task counter, default-file first-fit scratch allocation, actual fence records and exact removal compaction. Raw external allocator pointer limbs are preserved by queue/query/remove/fence metadata operations. The supplied functional read must be complete before status changes. Every live task, including a task whose script owner has forgotten its handle, remains until an actual remove request. AddFence creates no record for an empty queue. Removing a task also removes leading fences, clears flagbit1 and the rightmost counter, and preserves the original untouched inactive tail. Queue construction supports file types0/1/2; actual read completion remains limited to default-file type0 with a null external allocator. Nonnull-allocator read/copy, overlapping descriptors, GP2 decoding and cartridge/worker timing remain explicit boundaries.',
    externalAllocatorPresence:'Raw externalAllocatorU16 pairs are authoritative. A legacy true externalAllocatorPresent additionally requires a nonzero raw pointer; false makes no assertion and preserves additive compatibility.',
    operations:{0:'queue a validated original file request',1:'complete one actual functional default-file read before a fence',2:'remove the first matching task ID and resulting leading fences',3:'inspect status without changing state',4:'actual AddFence',5:'finish the original Process iteration after all eligible functional reads'},
    defaults:{...defaults,operation:3,taskCount:0,taskCounter:0,queryTaskId:-1,requestValid:false,requestTaskType:0,requestExternalAllocatorU16:[0,0],readComplete:false,fileExists:true,readByteLengthU16:[0,0],scratchBaseU16:[0,0],scratchBytes:65536,scratchRightArenaUsage:0,priorRightmostAllocationByte:0,loaderFlagsU16:[1,0],processLockBitsU16:[0,0],externalAllocatorPresent:Array(24).fill(false),enabled:true},
    inputDomains:{...Object.fromEntries(Object.entries(fields).map(([name,[width,min,max]])=>[name,{width,min,max,integer:true}])),operation:{width:1,min:0,max:5,integer:true},taskCount:{width:1,min:0,max:24,integer:true},taskCounter:{width:1,min:0,max:1023,integer:true},queryTaskId:{width:1,min:-32768,max:32767,integer:true},requestTaskType:{width:1,min:0,max:2,integer:true},requestExternalAllocatorU16:{width:2,min:0,max:65535,integer:true},scratchBaseU16:{width:2,min:0,max:65535,integer:true},loaderFlagsU16:{width:2,min:0,max:65535,integer:true},processLockBitsU16:{width:2,min:0,max:65535,integer:true},readByteLengthU16:{width:2,min:0,max:65535,integer:true},scratchBytes:{width:1,min:0,max:262140,integer:true},scratchRightArenaUsage:{width:1,min:0,max:262140,integer:true},priorRightmostAllocationByte:{width:1,min:0,max:262140,integer:true}}
  });
  const state=Object.fromEntries(Object.entries(fields).map(([name,[width]])=>[name,g.input(name,['N',width])]));
  const parts=Object.fromEntries(Object.entries(fields).map(([name,[width]])=>[name,g.split(state[name],width)]));
  const scratchBase=g.split(g.input('scratchBaseU16',['N',2]),2);
  const op=g.input('operation'),count=g.input('taskCount'),counter=g.input('taskCounter'),query=g.input('queryTaskId'),requestType=g.input('requestTaskType'),requestExternal=g.split(g.input('requestExternalAllocatorU16',['N',2]),2),sizeParts=g.split(g.input('readByteLengthU16',['N',2]),2),size=g.add(sizeParts[0],g.mul(sizeParts[1],65536)),scratch=g.input('scratchBytes'),right=g.input('scratchRightArenaUsage'),priorRightmost=g.input('priorRightmostAllocationByte'),loaderFlags=g.split(g.input('loaderFlagsU16',['N',2]),2),locks=g.split(g.input('processLockBitsU16',['N',2]),2),legacyExternal=g.split(g.input('externalAllocatorPresent',['N',24],'bool'),24),external=Array.from({length:24},(_,i)=>g.or(g.gt(parts.externalAllocatorU16[2*i],0),g.gt(parts.externalAllocatorU16[2*i+1],0))),flag=name=>g.input(name,['N',1],'bool'),enabled=flag('enabled'),validRequest=flag('requestValid'),readComplete=flag('readComplete'),exists=flag('fileExists');
  const live=Array.from({length:24},(_,i)=>g.gt(count,i)),isQueue=g.and(enabled,g.eq(op,0)),isRead=g.and(enabled,g.eq(op,1)),isRemove=g.and(enabled,g.eq(op,2)),isFence=g.and(enabled,g.eq(op,4)),isFinish=g.and(enabled,g.eq(op,5)),mod=(x,n)=>g.sub(x,g.mul(g.floor(g.mul(x,1/n)),n)),clearBit=(x,bit)=>g.sub(x,g.mul(mod(g.floor(g.mul(x,1/bit)),2),bit));
  let selected=g.constant(-1),found=g.constant(-1),firstFence=g.constant(-1),layout=g.le(right,scratch);
  const ends=parts.scratchFirstWords.map((start,i)=>g.add(start,parts.scratchNumWords[i])),used=live.map((v,i)=>g.and(v,g.gt(parts.scratchNumWords[i],0)));
  for(let i=23;i>=0;i--){
    selected=g.where(g.and(live[i],g.eq(parts.taskStatuses[i],0)),i,selected);
    firstFence=g.where(g.and(live[i],g.eq(parts.taskStatuses[i],5)),i,firstFence);
    found=g.where(g.and(live[i],g.eq(parts.taskIds[i],query),g.ge(query,0)),i,found);
    layout=g.and(layout,g.or(g.not(live[i]),g.and(g.ge(parts.taskTypes[i],0),g.le(parts.taskTypes[i],2),g.or(g.not(legacyExternal[i]),external[i]),g.or(...[-1,0,1,2,3,4,5].map(s=>g.eq(parts.taskStatuses[i],s))))));
    layout=g.and(layout,g.or(g.not(used[i]),g.le(ends[i],g.floor(g.mul(g.sub(scratch,right),.25)))));
    for(let j=i+1;j<24;j++)layout=g.and(layout,g.or(g.not(g.and(used[i],used[j])),g.le(ends[i],parts.scratchFirstWords[j]),g.le(ends[j],parts.scratchFirstWords[i])));
  }
  const blockedLock=g.and(g.gt(count,0),g.or(g.gt(locks[0],0),g.gt(locks[1],0))),blockedFence=g.and(g.ge(firstFence,0),g.or(g.lt(selected,0),g.lt(firstFence,selected)));selected=g.where(g.or(blockedLock,blockedFence),-1,selected);
  let selectedType=g.constant(0),selectedExternalWords=[g.constant(0),g.constant(0)];for(let i=0;i<24;i++){selectedType=g.where(g.eq(selected,i),parts.taskTypes[i],selectedType);selectedExternalWords=selectedExternalWords.map((value,j)=>g.where(g.eq(selected,i),parts.externalAllocatorU16[2*i+j],value));}
  const selectedExternal=g.or(g.gt(selectedExternalWords[0],0),g.gt(selectedExternalWords[1],0));
  const required=g.floor(g.mul(g.add(size,3),.25)),capacity=g.floor(g.mul(g.sub(scratch,right),.25)),candidates=[g.constant(0),...ends];
  const fits=candidates.map(position=>g.and(g.le(g.add(position,required),capacity),...used.map((v,i)=>g.or(g.not(v),g.le(g.add(position,required),parts.scratchFirstWords[i]),g.ge(position,ends[i])))));
  const allocation=fold(g,'min',candidates.map((p,i)=>g.where(fits[i],p,65536))),allocationPossible=g.and(g.gt(size,0),g.le(size,262140),g.lt(allocation,65536));
  const pointerLow=g.add(scratchBase[0],g.mul(allocation,4)),allocatedPointer=[mod(pointerLow,65536),mod(g.add(scratchBase[1],g.floor(g.mul(pointerLow,1/65536))),65536)];
  const supported=g.and(layout,g.or(g.not(isQueue),g.not(validRequest),g.and(g.lt(count,24),g.ge(requestType,0),g.le(requestType,2))),g.or(g.not(isFence),g.eq(count,0),g.lt(count,24)),g.or(g.not(isRead),g.lt(selected,0),g.and(g.eq(selectedType,0),g.not(selectedExternal),g.or(g.not(readComplete),g.not(exists),g.le(size,262140)))));
  const queue=g.and(isQueue,supported,validRequest),hasPending=g.ge(selected,0),read=g.and(isRead,supported,hasPending,readComplete),success=g.and(read,exists,allocationPossible),failed=g.and(read,g.not(exists)),remove=g.and(isRemove,supported,g.ge(found,0));
  const addFence=g.and(isFence,supported,g.gt(count,0)),firstCount=g.where(g.or(queue,addFence),g.add(count,1),g.where(remove,g.sub(count,1),count)),stage={},next={};
  for(const[name,[width]]of Object.entries(fields)){
    const grouped=width===48?2:1,values=parts[name];
    stage[name]=g.cat(values.map((value,index)=>{
      const slot=Math.floor(index/grouped),zero=name==='taskStatuses'?-1:0,source=values[Math.min(index+grouped,width-1)];
      let result=g.where(g.and(remove,g.ge(slot,found),g.lt(slot,g.sub(count,1))),source,g.where(g.and(remove,g.eq(slot,g.sub(count,1))),zero,value));
      if(['taskIds','taskStatuses','taskTypes'].includes(name)){const initial=name==='taskIds'?counter:name==='taskTypes'?requestType:0;result=g.where(g.and(queue,g.eq(count,slot)),initial,result);}
      if(name==='externalAllocatorU16')result=g.where(g.and(queue,g.eq(count,slot)),requestExternal[index%2],result);
      if(name==='dataPointerU16')result=g.where(g.and(queue,g.eq(count,slot)),0,result);
      const fenceValue=name==='taskIds'?-1:name==='taskStatuses'?5:0;result=g.where(g.and(addFence,g.eq(count,slot)),fenceValue,result);
      if(name==='taskStatuses')result=g.where(g.and(success,g.eq(selected,slot)),2,g.where(g.and(failed,g.eq(selected,slot)),4,result));
      if(name==='fileLengthsU16')result=g.where(g.and(success,g.eq(selected,slot)),sizeParts[index%2],g.where(g.and(failed,g.eq(selected,slot)),0,result));
      if(name==='dataPointerU16')result=g.where(g.and(success,g.eq(selected,slot)),allocatedPointer[index%2],g.where(g.and(failed,g.eq(selected,slot)),0,result));
      if(name==='scratchFirstWords')result=g.where(g.and(success,g.eq(selected,slot)),allocation,result);
      if(name==='scratchNumWords')result=g.where(g.and(success,g.eq(selected,slot)),required,result);
      return result;
    }));
  }
  const stagedStatuses=g.split(stage.taskStatuses,24);let leading=g.mul(count,0),prefix=g.constant(true,'bool');for(let i=0;i<24;i++){prefix=g.and(prefix,g.lt(i,firstCount),g.eq(stagedStatuses[i],5));leading=g.add(leading,g.cast(prefix,'float32'));}const removedFences=g.where(remove,leading,0),nextCount=g.sub(firstCount,removedFences);
  for(const[name,[width]]of Object.entries(fields)){const grouped=width===48?2:1,values=g.split(stage[name],width);next[name]=g.cat(values.map((value,index)=>{const slot=Math.floor(index/grouped),source=g.min(g.add(index,g.mul(removedFences,grouped)),width-1),shifted=g.op('GatherElements',[stage[name],g.cast(source,'int32')],{axis:1},{shape:['N',1]});return g.where(g.and(g.gt(removedFences,0),g.lt(slot,nextCount)),shifted,value);}));g.output(next[name],'next'+suffix(name));}
  const nextStarts=g.split(next.scratchFirstWords,24),nextSizes=g.split(next.scratchNumWords,24),nextMaximum=fold(g,'max',nextStarts.map((start,i)=>g.where(g.and(g.gt(nextCount,i),g.gt(nextSizes[i],0)),g.mul(g.add(start,nextSizes[i]),4),0))),oldMaximum=fold(g,'max',ends.map((end,i)=>g.where(used[i],g.mul(end,4),0)));
  // Process allocates into its local inFlightTask and RefreshCounters runs
  // BEFORE that task is copied back into queuedTasks. Queue/status do not
  // refresh, and RemoveTask refreshes only if it actually frees a span.
  const removedAllocation=g.or(...used.map((v,i)=>g.and(v,g.eq(found,i)))),hasCompletedInternalTask=g.or(...live.map((v,i)=>g.and(v,g.eq(parts.taskStatuses[i],2),g.not(external[i])))),processRightmost=g.where(hasCompletedInternalTask,priorRightmost,0),rightmost=g.where(g.gt(removedFences,0),0,g.where(g.or(success,failed),oldMaximum,g.where(g.and(remove,removedAllocation),nextMaximum,g.where(isFinish,processRightmost,priorRightmost))));
  let status=g.constant(-1),selectedId=g.constant(-1);for(let i=23;i>=0;i--){status=g.where(g.eq(found,i),g.where(g.eq(parts.taskStatuses[i],2),1,g.where(g.or(g.eq(parts.taskStatuses[i],3),g.eq(parts.taskStatuses[i],4)),-1,0)),status);selectedId=g.where(g.eq(selected,i),parts.taskIds[i],selectedId);}
  const finished=g.and(isFinish,supported,g.not(hasPending)),clearZero=g.or(queue,addFence,success,failed),lowFlags=g.where(g.gt(removedFences,0),clearBit(loaderFlags[0],2),loaderFlags[0]),nextLowFlags=g.where(finished,g.add(clearBit(lowFlags,1),g.cast(g.not(g.or(blockedLock,blockedFence)),'float32')),g.where(clearZero,clearBit(lowFlags,1),lowFlags));
  const outputs={supported,nextTaskCount:nextCount,nextTaskCounter:g.where(queue,g.where(g.eq(counter,1023),0,g.add(counter,1)),counter),nextLoaderFlagsU16:g.cat([nextLowFlags,loaderFlags[1]]),queuedTaskId:g.where(queue,counter,-1),queuedSlot:g.where(queue,count,-1),removedSlot:g.where(remove,found,-1),removedLeadingFences:removedFences,fenceAdded:addFence,fenceSlot:g.where(addFence,count,-1),processBlockedByFence:blockedFence,processBlockedByLock:blockedLock,selectedSlot:selected,selectedTaskId:selectedId,selectedExternalAllocatorU16:g.cat(selectedExternalWords),requiresExternalAllocator:g.and(g.or(isRead,isFinish),hasPending,selectedExternal),taskStatus:status,allocationPossible:g.and(layout,allocationPossible),allocationFirstWord:g.where(allocationPossible,allocation,0),allocationNumWords:g.where(allocationPossible,required,0),readCommitted:g.or(success,failed),readSucceeded:success,requiresFileRead:g.and(g.or(isRead,isFinish),supported,hasPending,g.not(readComplete)),allocationPending:g.and(read,exists,g.not(allocationPossible)),queueFull:g.or(g.and(isQueue,validRequest,g.ge(count,24)),g.and(isFence,g.ge(count,24))),rightmostAllocationByte:rightmost,completed:g.and(supported,g.or(g.and(g.not(isRead),g.not(isFinish)),g.and(isRead,g.or(g.not(hasPending),success,failed)),finished)),consumed:g.mul(count,0)};
  for(const[name,value]of Object.entries(outputs))g.output(value,name);return g;
}

if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildCommonResourceLoader().save(),null,2));
