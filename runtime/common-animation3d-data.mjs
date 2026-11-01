// Original Animation3D::CreateData. The host reads actual backing records and
// raw archive structures; shared graphs compute every state-changing value.
import {inspectOriginalNSBXX} from './common-chr-data.mjs';
import {createCommonNsbxxInitializerRunner,COMMON_NSBXX_INITIALIZE_MODELS} from './common-nsbxx-initialize.mjs';

export const COMMON_ANIMATION3D_DATA_MODELS=['rom-common-animation3d-data','rom-common-chr-allocation',...COMMON_NSBXX_INITIALIZE_MODELS];
const scalar=(o,k)=>Number(o[k]?.[0]),word=p=>p[0]+65536*p[1],pair=n=>[n%65536,Math.floor(n/65536)],clone=x=>structuredClone(x);

export function createCommonAnimation3DDataRunner({getModel,runGraph,onTrace,read,write,allocate,boundary}={}){
  async function call(name,input){
    const ir=await getModel(name);if(!ir)boundary('The shared original Animation3D producer is missing: '+name);
    const values={...ir.contract.defaults,...input},feeds=Object.fromEntries(ir.inputs.map(d=>[d.name,Array.isArray(values[d.name])?values[d.name]:[values[d.name]]]));
    const out=(await runGraph(name,[feeds]))[0];await onTrace?.({model:name,inputs:[clone(feeds)],outputs:[clone(out)]});
    if(!scalar(out,'supported'))boundary('Original Animation3D data needs an additional producer: '+name);
    return out;
  }
  const half=(bytes,i)=>bytes[i]+256*bytes[i+1],uint=(bytes,i)=>half(bytes,i)+65536*half(bytes,i+2);
  function materialDictionary(pointer,header){
    const relative=uint(header,8);if(!relative)return{count:0,treeBytes:[0,0,0,0],names:[]};
    const at=word(pointer)+relative+4,dict=read(pair(at),8,{known:true}),count=dict[1],dataOffset=half(dict,6),start=at+dataOffset,entryHeader=read(pair(start),4,{known:true}),names=read(pair(start+half(entryHeader,2)),count*16,{known:true});
    if(dataOffset<12)boundary('Original NSBXX dictionary has no represented root node');
    return{count,treeBytes:read(pair(at+8),dataOffset-8,{known:true}),names:Array.from({length:count},(_,i)=>names.slice(16*i,16*i+16))};
  }
  return{
    models:COMMON_ANIMATION3D_DATA_MODELS,
    async createData({animationPointerU16,modelPointerU16,allocatorPresent,member}){
      const attachedModelPresent=modelPointerU16.some(Boolean),modelBytes=attachedModelPresent?read(modelPointerU16,172):Array(172).fill(0),animationBytes=read(animationPointerU16,16);
      if(attachedModelPresent){read(pair(word(modelPointerU16)+0x54),8,{known:true});read(pair(word(modelPointerU16)+0xa8),1,{known:true});}
      const base={animationBytes,modelBytes,attachedModelPresent,allocatorPresent};
      let r=await call('rom-common-animation3d-data',{...base,operation:0});if(!scalar(r,'requestInnerAnimation'))return{complete:true,returnValue:false};
      const decoded=inspectOriginalNSBXX(member.bytes),animation=decoded.animation,innerAnimationPresent=!!animation;
      r=await call('rom-common-animation3d-data',{...base,operation:1,innerAnimationPresent});if(!scalar(r,'requestAllocation'))return{complete:true,returnValue:false};
      const modelHeader=read(r.internalModelPointerU16,64,{known:true}),a=animation,request=await call('rom-common-chr-allocation',{operation:4,modelHeaderBytes:modelHeader.slice(0,26),rawAnimationPresent:true,internalModelPresent:true,signatureInitial:a.signatureInitial});
      const allocation=await allocate(request.requestBytesU16),dataLength=word(request.requestBytesU16);if(!allocation.returnedNonNull)return{complete:true,returnValue:false};
      if(dataLength<26||dataLength>536)boundary('Original AnimationData lies outside the uint8 model-entry backing domain');
      const initializer=createCommonNsbxxInitializerRunner({getModel,runGraph,onTrace,onWrite:(bytes,mask)=>write(allocation.returnPointerU16,bytes,mask)});
      const initialized=await initializer.initialize({animation:a,modelBoneCount:modelHeader[23],modelMaterialCount:modelHeader[24],rawAnimationPointerU16:pair(word(member.pointerU16)+a.byteOffset),texturePointerU16:r.texturePointerU16,animationBytes:read(allocation.returnPointerU16,dataLength),materialDictionary:a.trackNames?materialDictionary(r.internalModelPointerU16,modelHeader):undefined});
      if(!initialized.complete)boundary(initialized.pending);
      const committed=await call('rom-common-animation3d-data',{...base,operation:2,innerAnimationPresent,allocationPointerU16:allocation.returnPointerU16,initializationCompleted:true});write(animationPointerU16,committed.nextAnimationBytes,committed.writtenMaskBytes);
      return{complete:true,returnValue:!!scalar(committed,'returnValue'),animationDataPointerU16:allocation.returnPointerU16};
    }
  };
}
