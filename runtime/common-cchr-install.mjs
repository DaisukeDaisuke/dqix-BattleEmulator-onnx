// Type1 CCHR/CMOT installation. Host work is archive/linked-memory lookup and
// scattering exact shared-graph outputs. No archive filename selects a program.
import {inspectOriginalNarc} from './common-rom-assets.mjs';
import {decodeOriginalAnimationScript} from './common-animation-data.mjs';
import {createCommonBCFGRunner} from './common-bcfg.mjs';
import {createCommonSafeAllocatorRunner} from './common-safe-allocator.mjs';
import {createCommonAnimation3DDataRunner,COMMON_ANIMATION3D_DATA_MODELS} from './common-animation3d-data.mjs';
import {createCommonModelFileRunner,COMMON_MODEL_FILE_MODELS} from './common-model-file.mjs';
import {validateGraphInputs} from '../graph-v2/input-domains.mjs';

export const COMMON_CCHR_INSTALL_MODELS=[...new Set(['rom-common-cchr-records','rom-common-bcfg','rom-common-hmrf-allocator',...COMMON_ANIMATION3D_DATA_MODELS,...COMMON_MODEL_FILE_MODELS])];
const clone=x=>structuredClone(x),scalar=(o,k)=>Number(o[k]?.[0]),word=p=>p[0]+65536*p[1],pair=n=>[n%65536,Math.floor(n/65536)],pointerBytes=p=>p.flatMap(v=>[v%256,Math.floor(v/256)]);
const requireData=(condition,message)=>{if(!condition)throw Error(message);};
class CchrBoundary extends Error{}
const boundary=message=>{throw new CchrBoundary(message);};

function archiveMembers(value,pointerU16){
  const bytes=Uint8Array.from(value),view=new DataView(bytes.buffer),narc=inspectOriginalNarc(bytes);let at=view.getUint16(12,true),image=-1;
  for(let i=0;i<view.getUint16(14,true);i++){if(String.fromCharCode(...bytes.subarray(at,at+4))==='GMIF')image=at+8;at+=view.getUint32(at+4,true);}
  requireData(image>=0&&word(pointerU16)+bytes.length<=0xffffffff,'Original archive pointer and image bounds are required');
  return{fileCount:narc.fileCount,members:narc.members.map(m=>({...m,pointerU16:pair(word(pointerU16)+image+m.byteOffset)}))};
}

export function createCommonCchrInstallRunner(options){
  const {getModel,runGraph,onTrace}=options,allocator=createCommonSafeAllocatorRunner(options);
  async function call(input){
    const name='rom-common-cchr-records',model=await getModel(name);requireData(model,'The shared type1 CCHR record graph is required');
    const values={...model.contract.defaults,...input},feeds=Object.fromEntries(model.inputs.map(d=>[d.name,Array.isArray(values[d.name])?values[d.name]:[values[d.name]]]));
    const errors=validateGraphInputs(model.contract,feeds);if(errors.length)boundary('CCHR record operands exceed the exact graph domain: '+errors.join('; '));
    const out=(await runGraph(name,[feeds]))[0];await onTrace?.({model:name,inputs:[clone(feeds)],outputs:[clone(out)]});requireData(!!scalar(out,'supported'),'Invalid type1 CCHR record input');return out;
  }
  return{
    models:COMMON_CCHR_INSTALL_MODELS,
    async installActor({state,allocatorState,objectPointerU16,archivePointerU16,archiveBytes,ownerNodePointerU16,actorId,allocatorIndex,packageId}={}){
      requireData(Array.isArray(state?.backingRegions)&&Array.isArray(state.ownerHeadU16),'Actual CCHR backing memory and resource-owner head are required');
      if(state.pendingCchr)return{complete:false,pending:state.pendingCchr.reason,state};
      const allocations=[];let phase='archive',packagePointerU16=[0,0],packageBytes=null;
      function locate(pointer,length){const p=word(pointer),region=state.backingRegions.find(r=>p>=word(r.baseU16)&&p+length<=word(r.baseU16)+r.bytes.length);if(!region)boundary('CCHR access requires explicit backing bytes at '+p.toString(16));requireData(Array.isArray(region.knownMaskBytes)&&region.knownMaskBytes.length===region.bytes.length,'CCHR backing knowledge masks are required');return{region,at:p-word(region.baseU16)};}
      function read(pointer,length,{known=false}={}){const{region,at}=locate(pointer,length);if(known&&region.knownMaskBytes.slice(at,at+length).some(v=>v!==255))boundary('CCHR pointer/name depends on unknown retained bytes');return region.bytes.slice(at,at+length);}
      function write(pointer,bytes,mask,unknown){const{region,at}=locate(pointer,bytes.length);for(let i=0;i<bytes.length;i++){const m=mask?.[i]??255;region.bytes[at+i]=(region.bytes[at+i]&~m)|(bytes[i]&m);region.knownMaskBytes[at+i]=(region.knownMaskBytes[at+i]|m)&~(unknown?.[i]??0);}}
      function pointerAt(pointer,offset){const b=read(pair(word(pointer)+offset),4,{known:true});return[b[0]+256*b[1],b[2]+256*b[3]];}
      function syncAllocator(){if(allocatorState.signedAllocatorU16.some(Boolean))for(const[at,key]of[[0x24,'frontU16'],[0x28,'backU16'],[0x2c,'newestStateU16']])write(pair(word(allocatorState.signedAllocatorU16)+at),pointerBytes(allocatorState[key]));}
      async function allocate(request){const result=await allocator.allocate(allocatorState,request);if(!result.complete)boundary(result.pending);syncAllocator();const record={phase,requestBytesU16:[...request],returnPointerU16:[...result.pointerU16],returnedNonNull:result.allocated};allocations.push(record);return{...result,...record};}
      async function packageStore(operation,extra={}){const result=await call({operation,packageBytes:packageBytes??Array(44).fill(0),packagePointerU16,packageId,...extra});if(packageBytes){packageBytes=[...result.nextPackageBytes];write(packagePointerU16,packageBytes,result.packageWrittenMaskBytes);}return result;}
      async function loadPackage(){
        const{members,fileCount}=archiveMembers(archiveBytes,archivePointerU16);
        const modelMember=members.find(m=>m.path.includes('.nsbmd'));
        if(modelMember){phase='model';const request=await packageStore(10),model=await allocate(request.requestBytesU16),stored=await packageStore(11,{objectBytes:read(objectPointerU16,172),allocationPointerU16:model.returnPointerU16});write(objectPointerU16,stored.nextObjectBytes,stored.objectWrittenMaskBytes);if(scalar(stored,'allocationFailed'))return false;const loader=createCommonModelFileRunner({getModel,runGraph,onTrace,read,write,boundary});await loader.process({state,member:modelMember,rawFilePointerU16:modelMember.pointerU16,modelPointerU16:model.returnPointerU16});}
        phase='package';const request=await packageStore(0),allocated=await allocate(request.requestBytesU16);
        if(!allocated.returnedNonNull)return false;
        packagePointerU16=[...allocated.returnPointerU16];packageBytes=read(packagePointerU16,44);
        await packageStore(1,{allocationPointerU16:packagePointerU16});
        const bcfg=createCommonBCFGRunner({runGraph,getModel,onTrace,allocate,write}),member=members.find(m=>m.path.includes('.bcfg'));
        phase='bcfg';const script=member?decodeOriginalAnimationScript(member.bytes):null,result=await bcfg.load({script,bcfgBytes:packageBytes.slice(4,36)});
        if(!result.complete)boundary(result.pending);packageBytes.splice(4,32,...result.bcfgBytes);write(pair(word(packagePointerU16)+4),result.bcfgBytes);
        phase='filename-lookup';const lookup=await packageStore(12,{archiveFileCount:fileCount,maximumFilePathBytes:members.reduce((n,m)=>Math.max(n,m.path.length),0),hasAllIndexedFilePaths:members.length===fileCount&&members.every((m,i)=>m.index===i)});
        if(!scalar(lookup,'filenameLookupFits'))boundary('Original CCHR truncated or unmapped filename lookup requires its actual path producer');
        // Both admitted original modes return the first case-sensitive exact
        // path match in file-ID order. The checksum cache only narrows candidates
        // before strcmp; the fallback scans those same names directly.
        const filenameLookupMode=scalar(lookup,'useChecksumLookup')?'checksum-cache':scalar(lookup,'requiresSequentialFileLookup')?'sequential':null;
        requireData(filenameLookupMode,'The original CCHR filename mode must come from its shared graph');
        phase='references';const refsRequest=await packageStore(2),referenceAllocation=await allocate(refsRequest.requestBytesU16);
        const refResult=await packageStore(3,{allocationPointerU16:referenceAllocation.returnPointerU16});
        if(scalar(refResult,'allocationFailed'))return false;
        const count=scalar(refResult,'animationCount');
        for(let i=0;i<count;i++){
          phase='reference-'+i;let r=await packageStore(4,{referenceIndex:i}),referencePointerU16=[...r.referencePointerU16];
          const initialReference=read(referencePointerU16,8);r=await packageStore(4,{referenceIndex:i,referenceBytes:initialReference});let referenceBytes=[...r.nextReferenceBytes];write(referencePointerU16,referenceBytes,r.referenceWrittenMaskBytes);
          if(!scalar(r,'recordValid'))continue;
          const recordNamePointer=r.recordPointerU16,chars=[];let terminated=false;
          for(let j=0;j<16;j++){const b=read(pair(word(recordNamePointer)+j),1,{known:true})[0];if(!b){terminated=true;break;}chars.push(b);}
          if(!terminated)boundary('Original CCHR animation name exceeds its represented16-byte record');
          const name=String.fromCharCode(...chars),files=['nsbca','nsbma','nsbtp','nsbta'].map(extension=>members.find(m=>m.path===name+'.'+extension)),matchingFiles=files.map(Boolean);
          r=await packageStore(5,{referenceIndex:i,referenceBytes,matchingFiles});
          if(!scalar(r,'requestAllocation'))continue;
          const group=await allocate(r.requestBytesU16);r=await packageStore(6,{referenceIndex:i,referenceBytes,matchingFiles,allocationPointerU16:group.returnPointerU16});referenceBytes=[...r.nextReferenceBytes];write(referencePointerU16,referenceBytes,r.referenceWrittenMaskBytes);
          if(!group.returnedNonNull)continue;
          const selected=files.filter(Boolean);
          for(let j=0;j<selected.length;j++){
            phase='animation-'+i+'-'+j;
            r=await packageStore(7,{referenceIndex:i,referenceBytes,matchingFiles,animationIndex:j,objectBytes:read(objectPointerU16,172),rawFilePointerU16:selected[j].pointerU16});
            write(r.animationPointerU16,r.nextAnimationBytes,r.animationWrittenMaskBytes);
            if(scalar(r,'requiresModelAnimationData')){
              const creator=createCommonAnimation3DDataRunner({getModel,runGraph,onTrace,read,write,allocate,boundary});
              await creator.createData({animationPointerU16:r.animationPointerU16,modelPointerU16:pointerAt(objectPointerU16,8),allocatorPresent:true,member:selected[j]});
            }
          }
        }
        phase='package-list';const objectBytes=read(objectPointerU16,172);let tailPointerU16=pointerAt(objectPointerU16,12),tailBytes=Array(44).fill(0);const seen=new Set();
        if(tailPointerU16.some(Boolean))for(;;){const key=word(tailPointerU16);if(seen.has(key))boundary('Original package list does not terminate');seen.add(key);tailBytes=read(tailPointerU16,44);const next=pointerAt(tailPointerU16,40);if(!next.some(Boolean))break;tailPointerU16=next;}
        const appended=await packageStore(8,{objectBytes,tailBytes});write(objectPointerU16,appended.nextObjectBytes,appended.objectWrittenMaskBytes);if(scalar(appended,'writePriorTail'))write(tailPointerU16,appended.nextTailBytes,appended.tailWrittenMaskBytes);
        return true;
      }
      try{
        syncAllocator();const installerReturned=await loadPackage();
        // The original actor caller ignores the installer boolean and appends
        // its allocated owner node even when package loading returned false.
        phase='owner';const owner=await call({operation:9,ownerBytes:read(ownerNodePointerU16,12),ownerHeadU16:state.ownerHeadU16,ownerNodePointerU16,actorId,allocatorIndex,packageId});
        write(ownerNodePointerU16,owner.nextOwnerBytes,owner.ownerWrittenMaskBytes);state.ownerHeadU16=[...owner.nextOwnerHeadU16];
        return{complete:true,state,installerReturned,allocations,packagePointerU16,ownerAppended:true,physicalRenderingComplete:false};
      }catch(error){
        if(!(error instanceof CchrBoundary))throw error;
        state.pendingCchr={reason:error.message,phase,packagePointerU16,ownerNodePointerU16,objectPointerU16,archivePointerU16,actorId,allocatorIndex,packageId};
        return{complete:false,pending:error.message,state,allocations};
      }
    }
  };
}
