// Shared original Model3D Clear/SetAndProcessRawFile path. Memory selection is
// structural; exact model/TEX/VRAM/material/staging changes use shared graphs.
import {inspectOriginalNSBXX} from './common-chr-data.mjs';
import {validateGraphInputs} from '../graph-v2/input-domains.mjs';
import {createCommonNsbxxNameLookupRunner,COMMON_NSBXX_NAME_LOOKUP_MODELS} from './common-nsbxx-name-lookup.mjs';
export const COMMON_MODEL_FILE_MODELS=['rom-common-model3d','rom-common-vram-allocator','rom-common-texture-header','rom-common-texture-binding','rom-common-vram-staging',...COMMON_NSBXX_NAME_LOOKUP_MODELS];
const scalar=(o,k)=>Number(o[k]?.[0]),word=p=>p[0]+65536*p[1],pair=n=>[n%65536,Math.floor(n/65536)],clone=x=>structuredClone(x);

export function createCommonModelFileRunner({getModel,runGraph,onTrace,read,write,boundary}={}){
  const lookup=createCommonNsbxxNameLookupRunner({getModel,runGraph,onTrace});
  async function call(name,input){const ir=await getModel(name);if(!ir)boundary('Missing original model-file producer '+name);const values={...ir.contract.defaults,...input},feeds=Object.fromEntries(ir.inputs.map(d=>[d.name,Array.isArray(values[d.name])?values[d.name]:[values[d.name]]]));const errors=validateGraphInputs(ir.contract,feeds);if(errors.length)boundary('Original model-file operands exceed the exact '+name+' domain: '+errors.join('; '));const out=(await runGraph(name,[feeds]))[0];await onTrace?.({model:name,inputs:[clone(feeds)],outputs:[clone(out)]});if(!scalar(out,'supported'))boundary('Original model-file path requires an additional producer: '+name);return out;}
  return{
    models:COMMON_MODEL_FILE_MODELS,
    async process({state,member,rawFilePointerU16,modelPointerU16}={}){
      const metadata=member.nsbxx??inspectOriginalNSBXX(member.bytes),model=metadata.model,texture=metadata.texture,raw=word(rawFilePointerU16);
      if(metadata.signature!=='BMD0'||!model)boundary('Original model-file signature/model pointer needs its separate producer');
      const internalModelPointerU16=pair(raw+model.byteOffset),texturePointerU16=texture?pair(raw+metadata.textureOffset):[0,0],operands={internalModelHeaderBytes:read(internalModelPointerU16,64,{known:true}),rawFilePointerU16,rawFileLengthU16:pair(member.byteLength??member.bytes.length),internalModelPointerU16,texturePointerU16};
      let modelBytes=read(modelPointerU16,172);for(const operation of[0,1]){const out=await call('rom-common-model3d',{...operands,operation,modelBytes});modelBytes=out.nextModelBytes;write(modelPointerU16,modelBytes,out.writtenMaskBytes);}
      async function vramCall(operation,extra){const out=await call('rom-common-vram-allocator',{...state.vram,operation,...extra});state.vram={...state.vram,fronts:out.nextFronts,backs:out.nextBacks,bankEnabled:out.nextBankEnabled,priority:out.nextPriority,paletteFront:scalar(out,'nextPaletteFront'),paletteBack:scalar(out,'nextPaletteBack')};return out;}
      async function stage(request){const input={subregion:scalar(request,'stagingSubregion'),sourcePointerU16:request.stagingSourceU16,byteOffset:scalar(request,'stagingByteOffset'),byteLength:scalar(request,'stagingByteLength'),...state.hardware};let scanIndex=state.stagingManagerBytes[0]+256*state.stagingManagerBytes[1],scanVisited=0;if(scanIndex>255)boundary('Original VRAM staging queue front exceeds its supplied backing');
        for(;;){const out=await call('rom-common-vram-staging',{...input,operation:0,managerBytes:state.stagingManagerBytes,taskBytes:state.stagingTaskBytes[scanIndex],scanIndex,scanVisited});if(scalar(out,'taskWritten'))state.stagingTaskBytes[scanIndex]=out.nextTaskBytes;if(!scalar(out,'scanContinue'))break;scanIndex=scalar(out,'nextScanIndex');scanVisited=scalar(out,'nextScanVisited');}
        const queueEnd=state.stagingManagerBytes[2]+256*state.stagingManagerBytes[3];if(queueEnd>255)boundary('Original VRAM staging queue end exceeds its supplied backing');const out=await call('rom-common-vram-staging',{...input,operation:1,managerBytes:state.stagingManagerBytes,taskBytes:state.stagingTaskBytes[queueEnd]});state.stagingManagerBytes=out.nextManagerBytes;if(scalar(out,'taskWritten'))state.stagingTaskBytes[queueEnd]=out.nextTaskBytes;return scalar(out,'integerResult')&65535;
      }
      const ids=[65535,65535];
      if(texture){
        if(!state.vram||state.stagingManagerBytes?.length!==68||state.stagingTaskBytes?.length!==256||state.stagingTaskBytes.some(x=>x?.length!==16)||state.hardware?.masterBrightness?.length!==2||state.hardware?.displayControlLow16?.length!==2)boundary('Original texture processing requires actual retained VRAM allocator, full staging queue and hardware register inputs');
        let header=read(texturePointerU16,60,{known:true}),request=await call('rom-common-texture-header',{operation:0,textureHeaderBytes:header,texturePointerU16}),keys=Array(6).fill(0);
        for(let i=0;i<3;i++)if(request.requestActive[i]){const out=await vramCall(i===2?3:1,{requestBytes:request.requestBytes[i],compressed:i===1,smallPalette:!!scalar(request,'smallPalette')});keys.splice(i*2,2,...out.returnKeyU16);}
        const committed=await call('rom-common-texture-header',{operation:1,textureHeaderBytes:header,texturePointerU16,allocationKeysU16:keys});header=committed.nextTextureHeaderBytes;write(texturePointerU16,header,committed.writtenMaskBytes);
        // Both original free-key callbacks are no-ops; allocation-failure key
        // stores/linking remain skipped by the header graph, with cursors kept.
        if(scalar(committed,'requestMaterialLink'))for(const internal of metadata.models)for(const[kind,pairings,resources,dictionary]of[[0,internal.texturePairings,texture.textures,texture.textureDictionary],[1,internal.palettePairings,texture.palettes,texture.paletteDictionary]])for(const pairing of pairings){
          if(!dictionary)boundary('Original texture pairing requires its actual raw name dictionary');const match=await lookup.lookup({dictionary,targetBytes:pairing.nameBytes});if(!match.complete)boundary(match.pending);const index=match.index,pointer=pair(raw+pairing.byteOffset),resource=index>=0?resources[index]:null;if(index>=0&&!resource)boundary('Original texture name index has no represented data record');
          const input={kind,resourceFound:index>=0,pairingBytes:read(pointer,4,{known:true}),textureKeysU16:keys,textureEntryBytes:kind===0&&resource?read(pair(raw+resource.byteOffset),8,{known:true}):Array(8).fill(0),paletteEntryBytes:kind===1&&resource?read(pair(raw+resource.byteOffset),4,{known:true}):Array(4).fill(0)},admission=await call('rom-common-texture-binding',{...input,phase:0});
          if(scalar(admission,'bindingNeeded')){for(const id of pairing.materialIndices){const record=internal.materialRecords[id];if(!record)boundary('Original pairing material index has no supplied record');const p=pair(raw+record.byteOffset),out=await call('rom-common-texture-binding',{...input,phase:1,materialBytes:read(p,44)});write(p,out.nextMaterialBytes,out.materialWrittenMaskBytes);}const out=await call('rom-common-texture-binding',{...input,phase:2});write(pointer,out.nextPairingBytes);}
        }
        for(const operation of[2,3]){const out=await call('rom-common-texture-header',{operation,textureHeaderBytes:header,texturePointerU16});header=out.nextTextureHeaderBytes;write(texturePointerU16,header,out.writtenMaskBytes);ids[operation-2]=await stage(out);}
      }
      for(const operation of[2,3]){const out=await call('rom-common-model3d',{...operands,operation,modelBytes,paletteStagingTaskId:ids[0],imageStagingTaskId:ids[1]});modelBytes=out.nextModelBytes;write(modelPointerU16,modelBytes,out.writtenMaskBytes);}
      return{complete:true,model,texturePointer:texturePointerU16,physicalVRAMTransferCompleted:false};
    }
  };
}
