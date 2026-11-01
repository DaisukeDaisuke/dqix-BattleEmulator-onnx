// Structural scheduling for the original type0 CHR installer. Every numeric
// allocation, record update, texture binding and staging decision is ONNX.
import {validateGraphInputs} from '../graph-v2/input-domains.mjs';
import {createCommonHmrfRunner} from './common-hmrf.mjs';
import {createCommonBCFGRunner} from './common-bcfg.mjs';
import {inspectOriginalChrArchive} from './common-chr-data.mjs';

export const COMMON_ANIMATION_INSTALL_MODELS=[
 'rom-common-hmrf-allocator',
 'rom-common-animation-install','rom-common-character-registration','rom-common-character-initialize',
 'rom-common-chr-allocation','rom-common-chr-records','rom-common-bcfg','rom-common-model3d',
 'rom-common-nsbxx-name-match','rom-common-nsbxx-animation','rom-common-vram-allocator',
 'rom-common-vram-context','rom-common-texture-header','rom-common-texture-binding','rom-common-vram-staging'
];
const clone=x=>structuredClone(x),scalar=(o,k)=>Number(o[k]?.[0]),pair=n=>[n%65536,Math.floor(n/65536)],word=p=>p[0]+65536*p[1],bytesOf=p=>p.flatMap(n=>[n&255,n>>>8]),same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
class PendingInstallation extends Error{constructor(message,detail){super(message);this.detail=detail;}}
const pending=(message,detail)=>{throw new PendingInstallation(message,detail);};

/** All backing bytes and graphics state are explicit initial inputs or retained
 * computed state. This function does not manufacture a live allocator, memory,
 * VRAM cursor, resource context, or completed transfer. */
export function createCommonAnimationInstallState(input){
 const state={schema:'dq9-computed-animation-install-state-v1',...clone(input)};
 if(!Array.isArray(state.safeAllocators)||!state.safeAllocators.length)throw Error('Explicit retained SafeAllocator states are required');
 for(const a of state.safeAllocators)if(a.state?.schema!=='dq9-computed-hmrf-state-v1'||!Array.isArray(a.pointerU16)||a.pointerU16.length!==2)throw Error('Each SafeAllocator requires its actual identity and computed HMRF state');
 if(!Array.isArray(state.backingRegions)||!state.backingRegions.length)throw Error('Explicit backing memory is required');
 for(const r of state.backingRegions){if(!Array.isArray(r.baseU16)||r.baseU16.length!==2||!Array.isArray(r.bytes)||r.bytes.some(x=>!Number.isInteger(x)||x<0||x>255))throw Error('Invalid backing region');if(!r.knownMaskBytes)r.knownMaskBytes=Array(r.bytes.length).fill(255);if(r.knownMaskBytes.length!==r.bytes.length)throw Error('Backing knowledge mask has the wrong length');}
 for(const k of['ownerHeadU16','registryHeadU16','registryCountU16','resourceCounterU16'])if(!Array.isArray(state[k])||state[k].length!==2)throw Error('Explicit initial '+k+' is required');
 if(!Array.isArray(state.resourceContextsBytes)||state.resourceContextsBytes.length!==4||state.resourceContextsBytes.some(x=>x.length!==112))throw Error('Four explicit resource contexts are required');
 if(!state.vram||!Array.isArray(state.stagingManagerBytes)||state.stagingManagerBytes.length!==68||!Array.isArray(state.stagingTaskBytes)||state.stagingTaskBytes.length!==256||state.stagingTaskBytes.some(x=>x.length!==16))throw Error('Explicit computed VRAM and staging state is required');
 if(state.hardware?.masterBrightness?.length!==2||state.hardware?.displayControlLow16?.length!==2)throw Error('Both actual display/brightness register inputs are required');
 return state;
}

export async function createCommonAnimationInstallRunner({runGraph,getModel,onTrace,onAllocation}={}){
 const allocator=await createCommonHmrfRunner({runGraph,getModel,onTrace});
 async function call(name,input){
  const ir=await getModel(name);if(!ir)pending('Missing shared installer model '+name);
  const v={...ir.contract.defaults,...input},feeds=Object.fromEntries(ir.inputs.map(d=>[d.name,Array.isArray(v[d.name])?v[d.name]:[v[d.name]]])),errors=validateGraphInputs(ir.contract,feeds);
  if(errors.length)throw Error(name+': '+errors.join('; '));
  const result=(await runGraph(name,[feeds]))[0];await onTrace?.({model:name,inputs:[clone(feeds)],outputs:[clone(result)]});
  if(!scalar(result,'supported'))pending('Original installer reached a producer outside '+name+' admitted inputs',{model:name,input:clone(input),output:clone(result)});
  return result;
 }
 async function install({state:prior,fileDataReady,archiveBytes,archivePointerU16,resourceIdByte,allocatorIndex,safeAllocatorPointerU16}){
  if(prior?.schema!=='dq9-computed-animation-install-state-v1')throw Error('Retained computed installer state is required');
  const state=clone(prior),archive=Uint8Array.from(archiveBytes??[]),allocations=[],installed=[];
  let phase='loaded-file',copyPointerU16=[0,0],ownerPointerU16=[0,0],characterPointerU16=[0,0];
  const slot=state.safeAllocators.find(x=>same(x.pointerU16,safeAllocatorPointerU16));
  if(!slot)throw Error('Selected SafeAllocator identity is absent from retained state');
  function locate(pointer,length){const p=word(pointer),r=state.backingRegions.find(r=>p>=word(r.baseU16)&&p+length<=word(r.baseU16)+r.bytes.length);if(!r)pending('Computed installer memory access lacks explicit backing bytes',{pointerU16:clone(pointer),length,phase});return{r,at:p-word(r.baseU16)};}
  function read(pointer,length){const{r,at}=locate(pointer,length);return r.bytes.slice(at,at+length);}
  function write(pointer,bytes,mask,unknown){const{r,at}=locate(pointer,bytes.length);for(let i=0;i<bytes.length;i++){const m=mask?.[i]??255;r.bytes[at+i]=(r.bytes[at+i]&~m)|(bytes[i]&m);r.knownMaskBytes[at+i]=(r.knownMaskBytes[at+i]|m)&~(unknown?.[i]??0);}}
  function pointerAt(pointer,at){const{r,at:base}=locate(pointer,at+4);if(r.knownMaskBytes.slice(base+at,base+at+4).some(x=>x!==255))pending('Original linked pointer requires fully known computed bytes',{pointerU16:pointer,at});return pair(new DataView(Uint8Array.from(r.bytes.slice(base+at,base+at+4)).buffer).getUint32(0,true));}
  async function allocate(request,direct=false){
   const before=clone(slot.state),result=await allocator.step({state:slot.state,operation:0,requestBytesU16:request});if(!result.complete)pending(result.pending,result.output);slot.state=result.state;
   // Only the actual HMRF cursor fields are scattered. Tree/list header bytes
   // are not inferred from the allocator-layout projection.
   if(slot.state.initialized)for(const[at,key]of[[0x24,'frontU16'],[0x28,'backU16'],[0x2c,'newestStateU16']])write(pair(word(slot.state.signedAllocatorPointerU16)+at),bytesOf(slot.state[key]));
   const record={phase,direct,requestBytesU16:[...request],before,...clone(result)};allocations.push(record);await onAllocation?.(record);return result;
  }
  async function chrAllocate(operation,extra={}){const request=await call('rom-common-chr-allocation',{operation,...extra});return allocate(request.requestBytesU16,!!scalar(request,'allocatorUnionCall'));}
  async function vramCall(operation,extra={}){const r=await call('rom-common-vram-allocator',{...state.vram,operation,...extra});state.vram={...state.vram,fronts:r.nextFronts,backs:r.nextBacks,bankEnabled:r.nextBankEnabled,priority:r.nextPriority,paletteFront:scalar(r,'nextPaletteFront'),paletteBack:scalar(r,'nextPaletteBack')};return r;}
  async function contextCall(operation){const r=await call('rom-common-vram-context',{...state.vram,operation,contextBytes:state.resourceContextsBytes[allocatorIndex]});state.resourceContextsBytes[allocatorIndex]=r.nextContextBytes;state.vram={...state.vram,fronts:r.nextFronts,backs:r.nextBacks,paletteFront:scalar(r,'nextPaletteFront'),paletteBack:scalar(r,'nextPaletteBack')};return r;}
  async function stageTexture(request){
   const operands={subregion:scalar(request,'stagingSubregion'),sourcePointerU16:request.stagingSourceU16,byteOffset:scalar(request,'stagingByteOffset'),byteLength:scalar(request,'stagingByteLength'),...state.hardware};
   let scanIndex=state.stagingManagerBytes[0]+256*state.stagingManagerBytes[1],scanVisited=0;if(scanIndex>255)pending('Original staging queue front is outside its256-record backing');
   for(;;){const r=await call('rom-common-vram-staging',{...operands,operation:0,managerBytes:state.stagingManagerBytes,taskBytes:state.stagingTaskBytes[scanIndex],scanIndex,scanVisited});if(scalar(r,'taskWritten'))state.stagingTaskBytes[scanIndex]=r.nextTaskBytes;if(!scalar(r,'scanContinue'))break;scanIndex=scalar(r,'nextScanIndex');scanVisited=scalar(r,'nextScanVisited');}
   const queueEnd=state.stagingManagerBytes[2]+256*state.stagingManagerBytes[3];if(queueEnd>255)pending('Original staging queue end is outside its256-record backing');
   const r=await call('rom-common-vram-staging',{...operands,operation:1,managerBytes:state.stagingManagerBytes,taskBytes:state.stagingTaskBytes[queueEnd]});state.stagingManagerBytes=r.nextManagerBytes;if(scalar(r,'taskWritten'))state.stagingTaskBytes[queueEnd]=r.nextTaskBytes;return scalar(r,'integerResult')&65535;
  }
  async function processModel(member,modelPointer){
   const model=member.nsbxx.model,texture=member.nsbxx.texture,texturePointer=pair(word(copyPointerU16)+member.byteOffset+member.nsbxx.textureOffset);
   if(!model||!texture)pending('Original model requires an additional absent-model or absent-TEX producer');
   const operands={internalModelHeaderBytes:model.headerBytes,rawFilePointerU16:pair(word(copyPointerU16)+member.byteOffset),rawFileLengthU16:pair(member.byteLength),internalModelPointerU16:pair(word(copyPointerU16)+member.byteOffset+model.byteOffset),texturePointerU16:texturePointer};
   let modelBytes=read(modelPointer,172);
   for(const operation of[0,1]){const r=await call('rom-common-model3d',{...operands,operation,modelBytes});modelBytes=r.nextModelBytes;write(modelPointer,modelBytes,r.writtenMaskBytes);}
   let header=read(texturePointer,60),requests=await call('rom-common-texture-header',{operation:0,textureHeaderBytes:header,texturePointerU16:texturePointer}),keys=Array(6).fill(0);
   for(let i=0;i<3;i++)if(requests.requestActive[i]){const r=await vramCall(i===2?3:1,{requestBytes:requests.requestBytes[i],compressed:i===1,smallPalette:!!scalar(requests,'smallPalette')});keys.splice(i*2,2,...r.returnKeyU16);}
   const committed=await call('rom-common-texture-header',{operation:1,textureHeaderBytes:header,texturePointerU16:texturePointer,allocationKeysU16:keys});header=committed.nextTextureHeaderBytes;write(texturePointer,header,committed.writtenMaskBytes);
   if(scalar(committed,'requestMaterialLink'))for(const internal of member.nsbxx.models)for(const[kind,pairings,resources]of[[0,internal.texturePairings,texture.textures],[1,internal.palettePairings,texture.palettes]])for(const pairing of pairings){
    if(resources.length>15)pending('Original long NSBXX texture dictionary needs its Patricia-tree producer');
    const match=await call('rom-common-nsbxx-name-match',{nameCount:resources.length,namesBytes:Array.from({length:240},(_,i)=>resources[Math.floor(i/16)]?.nameBytes[i%16]??0),targetBytes:pairing.nameBytes}),index=scalar(match,'index'),pointer=pair(word(copyPointerU16)+member.byteOffset+pairing.byteOffset),input={kind,resourceFound:index>=0,pairingBytes:read(pointer,4),textureKeysU16:keys,textureEntryBytes:kind===0&&index>=0?resources[index].bytes:Array(8).fill(0),paletteEntryBytes:kind===1&&index>=0?resources[index].bytes:Array(4).fill(0)},admission=await call('rom-common-texture-binding',{...input,phase:0});
    if(scalar(admission,'bindingNeeded')){for(const index of pairing.materialIndices){const record=internal.materialRecords[index];if(!record)pending('Original material index lacks a decoded record');const p=pair(word(copyPointerU16)+member.byteOffset+record.byteOffset),r=await call('rom-common-texture-binding',{...input,phase:1,materialBytes:read(p,44)});write(p,r.nextMaterialBytes,r.materialWrittenMaskBytes);}const r=await call('rom-common-texture-binding',{...input,phase:2});write(pointer,r.nextPairingBytes);}
   }
   const ids=[];for(const operation of[2,3]){const r=await call('rom-common-texture-header',{operation,textureHeaderBytes:header,texturePointerU16:texturePointer});header=r.nextTextureHeaderBytes;write(texturePointer,header,r.writtenMaskBytes);ids.push(await stageTexture(r));}
   for(const operation of[2,3]){const r=await call('rom-common-model3d',{...operands,operation,modelBytes,paletteStagingTaskId:ids[0],imageStagingTaskId:ids[1]});modelBytes=r.nextModelBytes;write(modelPointer,modelBytes,r.writtenMaskBytes);}
   return{model,texturePointer};
  }
  async function initializeCharacter(character,resourceIdU16,decoded){
   let characterBytes=(await call('rom-common-character-initialize',{characterBytes:read(character,496),resourceIdU16,safeAllocatorPointerU16})).nextCharacterBytes;write(character,characterBytes);
   let packagePointer=[0,0],referencePointer=[0,0],arrayPointer=[0,0],modelPointer=[0,0],packageBytes=Array(44).fill(0),referenceBytes=Array(8).fill(0),animationBytes=Array(64).fill(0),bcfgRecords=[],packageCreated=false;
   async function records(operation,extra={}){const r=await call('rom-common-chr-records',{operation,characterBytes,packageBytes,referenceBytes,animationBytes,packagePointerU16:packagePointer,referencePointerU16:referencePointer,arrayPointerU16:arrayPointer,modelPointerU16:modelPointer,...extra});characterBytes=r.nextCharacterBytes;packageBytes=r.nextPackageBytes;referenceBytes=r.nextReferenceBytes;animationBytes=r.nextAnimationBytes;write(character,characterBytes,r.characterWrittenMaskBytes);if(word(packagePointer))write(packagePointer,packageBytes,r.packageWrittenMaskBytes);if(word(referencePointer))write(referencePointer,referenceBytes,r.referenceWrittenMaskBytes);if(word(arrayPointer))write(arrayPointer,animationBytes,r.animationWrittenMaskBytes);return r;}
   const member=decoded.members.find(m=>m.path.includes('.nsbmd'));
   if(!member?.nsbxx?.model)pending('Type0 CHR without the modeled NSBMD producer remains unsupported');
   if(decoded.members.some(m=>!['.nsbmd','.bcfg','.nsbca','.nsbma','.nsbtp','.nsbta'].some(s=>m.path.includes(s))))pending('Additional character auxiliary archive members need their original initializer producer');
   phase='model-allocation';const model=await chrAllocate(0);modelPointer=model.returnPointerU16;await records(6);
   if(model.returnedNonNull){
    phase='model-processing';const metadata=await processModel(member,modelPointer);phase='package-allocation';const pack=await chrAllocate(1);packagePointer=pack.returnPointerU16;
    if(pack.returnedNonNull){
     packageBytes=read(packagePointer,44);await records(0);const reset=await call('rom-common-bcfg',{phase:0,bcfgBytes:packageBytes.slice(4,36)});packageBytes.splice(4,32,...reset.nextBCFGBytes);write(pair(word(packagePointer)+4),reset.nextBCFGBytes,reset.writtenMaskBytes);
     const ref=await chrAllocate(2);referencePointer=ref.returnPointerU16;if(ref.returnedNonNull)referenceBytes=read(referencePointer,8);await records(1);
     if(ref.returnedNonNull){const array=await chrAllocate(3);arrayPointer=array.returnPointerU16;if(array.returnedNonNull)animationBytes=read(arrayPointer,64);await records(2);
      if(array.returnedNonNull){
       packageCreated=true;const bcfg=createCommonBCFGRunner({runGraph,getModel,onTrace,allocate:request=>allocate(request),write});
       for(const m of decoded.members){
        if(m.script){phase='BCFG';const r=await bcfg.load({script:m.script,bcfgBytes:packageBytes.slice(4,36)});if(!r.complete)pending(r.pending,r);packageBytes.splice(4,32,...r.bcfgBytes);write(pair(word(packagePointer)+4),r.bcfgBytes);bcfgRecords=r.records;}
        else if(m.nsbxx?.animation){
         const slot=m.path.includes('.nsbca')?0:m.path.includes('.nsbma')?1:m.path.includes('.nsbtp')?2:m.path.includes('.nsbta')?3:-1;if(slot<0)pending('CHR animation file lacks a shared type0 slot');phase='animation-data';await records(3,{slot,rawFilePointerU16:pair(word(copyPointerU16)+m.byteOffset)});
         const a=m.nsbxx.animation,data=await chrAllocate(4,{modelHeaderBytes:metadata.model.headerBytes.slice(0,26),rawAnimationPresent:true,internalModelPresent:true,signatureInitial:a.signatureInitial});if(!data.returnedNonNull){packageCreated=false;break;}
         const operands={signatureInitial:a.signatureInitial,signatureEnd:a.signatureEnd,modelBoneCount:metadata.model.headerBytes[23],modelMaterialCount:metadata.model.headerBytes[24],rawAnimationPointerU16:pair(word(copyPointerU16)+m.byteOffset+a.byteOffset),texturePointerU16:metadata.texturePointer};
         // The fixed graph buffer contains only retained backing bytes. The
         // actual allocator-produced length controls the committed slice.
         const dataLength=word(data.requestBytesU16);if(dataLength>156)pending('AnimationData exceeds the shared64-entry buffer');
         let bytes=(await call('rom-common-nsbxx-animation',{...operands,operation:0,animationBytes:[...read(data.returnPointerU16,dataLength),...Array(156-dataLength).fill(0)]})).nextAnimationBytes;
         if(a.jointTrackTargetBytes)for(const[trackIndex,targetBone]of a.jointTrackTargetBytes.entries())bytes=(await call('rom-common-nsbxx-animation',{...operands,operation:1,trackIndex,targetBone,animationBytes:bytes})).nextAnimationBytes;
         if(a.trackNames)for(const[trackIndex,targetBytes]of a.trackNames.entries()){const names=metadata.model.materialNames;if(names.length>15)pending('Original long animation material dictionary needs its Patricia-tree producer');const match=await call('rom-common-nsbxx-name-match',{nameCount:names.length,namesBytes:Array.from({length:240},(_,i)=>names[Math.floor(i/16)]?.[i%16]??0),targetBytes});bytes=(await call('rom-common-nsbxx-animation',{...operands,operation:2,trackIndex,materialIndex:scalar(match,'index'),animationBytes:bytes})).nextAnimationBytes;}
         write(data.returnPointerU16,bytes.slice(0,dataLength));await records(4,{slot,animationDataPointerU16:data.returnPointerU16});
        }
       }
       if(packageCreated){await records(5);const p=pointerAt(packagePointer,4),valid=packageBytes[8]+256*packageBytes[9]>0;await records(7,{recordValid:valid,recordPointerU16:p,recordBytes:valid?read(p,36):Array(36).fill(0)});}
      }
     }
    }
   }
   installed.push({characterPointerU16:clone(character),modelPointerU16:modelPointer,packagePointerU16:packagePointer,referencePointerU16:referencePointer,arrayPointerU16:arrayPointer,packageCreated,bcfgRecords});
   // The original character initializer returns1 even when its internal CHR
   // load exits on a real allocation failure. Pending producers never get here.
   return{completed:true,returnNonzero:true};
  }
  try{
   const input={fileDataReady,archiveLengthU16:pair(archive.length),archivePointerU16,resourceIdByte,resourceCounterU16:state.resourceCounterU16,allocatorIndex,ownerHeadU16:state.ownerHeadU16};
   let stage=await call('rom-common-animation-install',{...input,phase:0});
   if(scalar(stage,'requestAllocation')){
    phase='archive-allocation';const copy=await allocate(stage.requestBytesU16);copyPointerU16=copy.returnPointerU16;stage=await call('rom-common-animation-install',{...input,phase:1,allocationPointerU16:copyPointerU16});
    if(scalar(stage,'requestArchiveCopy'))write(copyPointerU16,archive);
    if(scalar(stage,'requestAllocation')){
     phase='owner-allocation';const owner=await allocate(stage.requestBytesU16);ownerPointerU16=owner.returnPointerU16;stage=await call('rom-common-animation-install',{...input,phase:2,allocationPointerU16:ownerPointerU16,ownerBytes:owner.returnedNonNull?read(ownerPointerU16,12):Array(12).fill(0)});
     if(scalar(stage,'ownerWritten')){write(ownerPointerU16,stage.nextOwnerBytes,stage.ownerWrittenMask.map(x=>x?255:0));state.ownerHeadU16=stage.nextOwnerHeadU16;}
     if(scalar(stage,'requestCharacterRegistration')){
      phase='context-enter';await contextCall(2);phase='character-allocation';let registration=await call('rom-common-character-registration',{phase:0});const character=await allocate(registration.requestBytesU16);characterPointerU16=character.returnPointerU16;registration=await call('rom-common-character-registration',{phase:1,allocatedPointerU16:characterPointerU16});
      if(scalar(registration,'requestInitializer')){
       const initialized=await initializeCharacter(characterPointerU16,stage.registrationResourceIdU16,inspectOriginalChrArchive(archive));
       let tail=[0,0],next=state.registryHeadU16;const seen=new Set();while(word(next)){const key=word(next);if(seen.has(key))pending('Original character registry is cyclic');seen.add(key);tail=next;next=pointerAt(next,0x1ec);}
       registration=await call('rom-common-character-registration',{phase:2,allocatedPointerU16:characterPointerU16,registryHeadU16:state.registryHeadU16,registryTailU16:tail,registryCountU16:state.registryCountU16,initializerCompleted:initialized.completed,initializerReturnNonzero:initialized.returnNonzero});
       if(scalar(registration,'writePriorTailNext'))write(pair(word(registration.priorTailPointerU16)+0x1ec),bytesOf(characterPointerU16));state.registryHeadU16=registration.nextRegistryHeadU16;state.registryCountU16=registration.nextRegistryCountU16;
      }
      phase='context-leave';await contextCall(3);stage=await call('rom-common-animation-install',{...input,phase:3,registrationCompleted:!!scalar(registration,'registrationCompleted')});state.resourceCounterU16=stage.nextResourceCounterU16;
     }
    }
   }
   return{complete:!!scalar(stage,'installationCallerCompleted'),state,allocations,installed,copyPointerU16,ownerPointerU16,characterPointerU16,physicalVRAMTransferCompleted:false,scope:'Original type0 CHR installation and queued VRAM state; actual hardware transfer is a separate producer'};
  }catch(error){if(!(error instanceof PendingInstallation))throw error;return{complete:false,pending:error.message,pendingDetail:error.detail,phase,state,allocations,installed,copyPointerU16,ownerPointerU16,characterPointerU16,physicalVRAMTransferCompleted:false};}
 }
 return{install,models:COMMON_ANIMATION_INSTALL_MODELS};
}
