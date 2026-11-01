import {fileURLToPath} from 'node:url';
import {Graph} from './graph-builder.mjs';

/** Original resource opcodes. The loader queue and archive installer are
 * separately reusable state transitions, invoked at the explicit call sites. */
export function buildCommonAnimationResource(){
 const g=new Graph('rom-common-animation-resource',{
  inputContractVersion:1,
  authority:{matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10',handlers:{18:'JPN021e45d4 / matching021e40e4',19:'JPN021e462c / matching021e413c',20:'JPN021e4658 / matching021e4168'},helpers:{queue:'JPN021e2abc / matching021e25a4',install:'JPN021e2ce0 / matching021e27c8',track:'JPN021eb4e4 / matching021eb05c',untrack:'JPN021eb50c / matching021eb084',ready:'JPN021eb57c / matching021eb0f4'}},
  scope:'Shared numeric decisions for original resource opcodes18/19/20. Opcode18 phase0 requests actual AddFence then QueueFileTask and sets event bit0x2000; phase1 tracks only the computed queue return. Opcode19 uses raw loader flag0 and the first matching status of each of the original8 tracked IDs. Opcode20 chooses the first supplied structural filename match in the actual24-task order; absent/not-ready data or a null SafeAllocator produce the real RemoveTask/untrack/return1 path. A nonnull loaded file with an initialized allocator explicitly requests the separate actual allocation/CHR installation producer. It never treats return1, missing files, failed allocation, a timer or task count as successful resource installation. Loader requests must complete before committing tracker outputs. The original duplicate-ID compaction decrements count once and preserves unwritten tail entries.',
  phases:{0:'original opcode entry through its first external producer boundary',1:'opcode18 after the actual queue graph returns',2:'opcode20 after the computed original installation caller returns'},
  defaults:{opcode:19,phase:0,scriptTaskCount:0,scriptTaskIds:Array(8).fill(0),eventFlagsU16:[0,0],resourceCounterU16:[0,0],loaderTaskCount:0,loaderTaskIds:Array(24).fill(0),loaderTaskStatuses:Array(24).fill(-1),loaderFlagsU16:[1,0],filenameMatches:Array(24).fill(false),fileDataPresent:Array(24).fill(false),allocatorInitialized:false,installationCallerCompleted:false,queuedTaskId:-1,scriptOwnerPresent:true,enabled:true},
  inputDomains:{opcode:{width:1,min:18,max:20,integer:true},phase:{width:1,min:0,max:2,integer:true},scriptTaskCount:{width:1,min:0,max:8,integer:true},scriptTaskIds:{width:8,min:0,max:65535,integer:true},eventFlagsU16:{width:2,min:0,max:65535,integer:true},resourceCounterU16:{width:2,min:0,max:65535,integer:true},loaderTaskCount:{width:1,min:0,max:24,integer:true},loaderTaskIds:{width:24,min:-32768,max:32767,integer:true},loaderTaskStatuses:{width:24,min:-1,max:5,integer:true},loaderFlagsU16:{width:2,min:0,max:65535,integer:true},queuedTaskId:{width:1,min:-1,max:1023,integer:true}}
 });
 const op=g.input('opcode'),phase=g.input('phase'),count=g.input('scriptTaskCount'),ids=g.split(g.input('scriptTaskIds',['N',8]),8),event=g.split(g.input('eventFlagsU16',['N',2]),2),resource=g.input('resourceCounterU16',['N',2]),loaderCount=g.input('loaderTaskCount'),loaderIds=g.split(g.input('loaderTaskIds',['N',24]),24),statuses=g.split(g.input('loaderTaskStatuses',['N',24]),24),loaderFlags=g.split(g.input('loaderFlagsU16',['N',2]),2),matches=g.split(g.input('filenameMatches',['N',24],'bool'),24),data=g.split(g.input('fileDataPresent',['N',24],'bool'),24),queued=g.input('queuedTaskId'),flag=name=>g.input(name,['N',1],'bool'),owner=flag('scriptOwnerPresent'),enabled=flag('enabled'),allocator=flag('allocatorInitialized'),mod=(x,n)=>g.sub(x,g.mul(g.floor(g.mul(x,1/n)),n)),hasEvent=g.gt(mod(g.floor(g.mul(event[0],1/8192)),2),0),entry=g.eq(phase,0),is18=g.eq(op,18),is19=g.eq(op,19),is20=g.eq(op,20),live=Array.from({length:24},(_,i)=>g.lt(i,loaderCount));
 const installationCompleted=flag('installationCallerCompleted'),returnedInstall=g.and(is20,g.eq(phase,2),installationCompleted),fenceNeeded=g.and(is18,entry,g.not(hasEvent)),appendFence=g.and(fenceNeeded,g.gt(loaderCount,0)),queueCapacity=g.lt(g.add(loaderCount,g.cast(appendFence,'float32')),24),supported=g.or(g.not(enabled),g.and(owner,g.or(g.and(is18,g.le(phase,1)),g.and(entry,g.or(is19,is20)),returnedInstall),g.or(g.not(g.and(is18,entry)),queueCapacity))),run=g.and(enabled,supported,owner);
 let selected=g.constant(-1),selectedId=g.constant(-1),selectedReady=g.constant(false,'bool');
 for(let i=23;i>=0;i--){const yes=g.and(live[i],matches[i]);selected=g.where(yes,i,selected);selectedId=g.where(yes,loaderIds[i],selectedId);selectedReady=g.or(g.and(yes,g.eq(statuses[i],2),data[i]),g.and(g.not(yes),selectedReady));}
 let ready=g.gt(mod(loaderFlags[0],2),0);
 for(let i=0;i<8;i++){
  let status=g.constant(-1);for(let j=23;j>=0;j--)status=g.where(g.and(live[j],g.eq(ids[i],loaderIds[j])),g.where(g.eq(statuses[j],2),1,g.where(g.or(g.eq(statuses[j],3),g.eq(statuses[j],4)),-1,0)),status);
  ready=g.and(ready,g.or(g.ge(i,count),g.not(g.eq(status,0))));
 }
 const needsInstall=g.and(run,is20,entry,selectedReady,allocator),finish20=g.and(run,is20,g.or(g.and(entry,g.not(needsInstall)),returnedInstall)),remove=g.and(finish20,g.ge(selectedId,0)),track=g.and(run,is18,g.eq(phase,1),g.ge(queued,0),g.lt(count,8));
 const nextIds=[...ids];let kept=g.mul(count,0),found=g.constant(false,'bool');
 for(let i=0;i<8;i++){
  const current=g.lt(i,count),same=g.eq(ids[i],selectedId),keep=g.and(current,g.not(same));found=g.or(found,g.and(current,same));
  for(let j=0;j<8;j++)nextIds[j]=g.where(g.and(remove,keep,g.eq(kept,j)),ids[i],nextIds[j]);
  kept=g.add(kept,g.cast(keep,'float32'));
 }
 for(let i=0;i<8;i++)nextIds[i]=g.where(g.and(track,g.eq(count,i)),queued,nextIds[i]);
 const finished=g.and(run,g.or(g.and(is18,g.eq(phase,1)),is19,finish20)),result=g.where(g.and(run,is19),g.cast(ready,'float32'),g.cast(finished,'float32'));
 const out={supported,nextScriptTaskCount:g.where(track,g.add(count,1),g.where(g.and(remove,found),g.sub(count,1),count)),nextScriptTaskIds:g.cat(nextIds),nextEventFlagsU16:g.cat([g.where(g.and(run,fenceNeeded),g.add(event[0],8192),event[0]),event[1]]),nextResourceCounterU16:resource,requestFence:g.and(run,fenceNeeded),requestQueue:g.and(run,is18,entry),requestRemove:remove,requiresArchiveInstallation:needsInstall,selectedSlot:g.where(g.and(run,is20),selected,-1),selectedTaskId:g.where(g.and(run,is20),selectedId,-1),loadedDataReady:g.and(run,is20,selectedReady),allTrackedReady:g.and(run,is19,ready),handlerCompleted:finished,handlerReturnU16:g.cat([result,g.mul(op,0)]),consumed:g.mul(op,0)};
 for(const[name,value]of Object.entries(out))g.output(value,name);return g;
}

if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildCommonAnimationResource().save(),null,2));
