// Actual Object3D animation records plus shared exact graph mutations.
import {validateGraphInputs} from '../graph-v2/input-domains.mjs';
export const COMMON_OBJECT_ANIMATION_MODELS=['rom-common-object-animation-control','rom-common-object-animation-timing'];
const clone=x=>structuredClone(x),word=p=>p[0]+65536*p[1],pair=n=>[n%65536,Math.floor(n/65536)],pointer=(b,i)=>[b[i]+256*b[i+1],b[i+2]+256*b[i+3]],scalar=(o,k)=>Number(o[k]?.[0]),requireData=(ok,message)=>{if(!ok)throw Error(message);};
export function createCommonObjectAnimationRunner({getModel,runGraph,onTrace,read,write}={}){
  async function call(name,input){const ir=await getModel(name);requireData(ir,'Missing shared Object3D animation graph '+name);const values={...ir.contract.defaults,...input},feeds=Object.fromEntries(ir.inputs.map(d=>[d.name,Array.isArray(values[d.name])?values[d.name]:[values[d.name]]]));const errors=validateGraphInputs(ir.contract,feeds);requireData(!errors.length,'Invalid original animation operands: '+errors.join('; '));const out=(await runGraph(name,[feeds]))[0];await onTrace?.({model:name,inputs:[clone(feeds)],outputs:[clone(out)]});requireData(scalar(out,'supported'),'Original Object3D animation graph requires an additional producer');return out;}
  return{
    models:COMMON_OBJECT_ANIMATION_MODELS,
    async run({objectPointerU16,deltaTimeU16,effectiveDeltaU16,state:prior,maxTransitions=32}={}){
      requireData(Number.isInteger(maxTransitions)&&maxTransitions>=0,'A nonnegative transition budget is required');const request={objectPointerU16:[...objectPointerU16],deltaTimeU16:[...deltaTimeU16],effectiveDeltaU16:[...effectiveDeltaU16]},state=prior?clone(prior):{schema:'dq9-common-object-animation-state-v1',request,phase:0,transitions:0};requireData(state.schema==='dq9-common-object-animation-state-v1'&&JSON.stringify(state.request)===JSON.stringify(request),'A resumed Object3D animation cannot replace its original inputs');let transitions=0;
      while(state.phase!==90&&transitions<maxTransitions){
        if(state.phase===80)return{complete:false,pending:'Original animation sound-list callbacks require their shared producer',requiresSoundEvents:true,state,transitions,soundListPointerU16:state.soundListPointerU16};
        const objectBytes=read(objectPointerU16,172,{known:true}),packagePointerU16=pointer(objectBytes,16),packageBytes=packagePointerU16.some(Boolean)?read(packagePointerU16,44,{known:true}):Array(44).fill(0);let input={objectBytes,packageBytes,effectiveDeltaU16},out;
        if(state.phase===0){out=await call(COMMON_OBJECT_ANIMATION_MODELS[0],{...input,operation:0});state.packageType=scalar(out,'packageType');state.referencePointerU16=[...out.referencePointerU16];state.recordPointerU16=[...out.recordPointerU16];}
        else if(state.phase===10){const referenceBytes=read(state.referencePointerU16,8,{known:true}),animationPointerU16=pointer(referenceBytes,4),animationBytes=animationPointerU16.some(Boolean)?read(animationPointerU16,16,{known:true}):Array(16).fill(0);state.animationPointerU16=animationPointerU16;state.dataPointerU16=pointer(animationBytes,4);out=await call(COMMON_OBJECT_ANIMATION_MODELS[0],{...input,operation:1,referenceBytes,animationBytes});state.recordPointerU16=[...out.recordPointerU16];}
        else if(state.phase===20){out=await call(COMMON_OBJECT_ANIMATION_MODELS[0],{...input,operation:2});state.shouldAdvance=!!scalar(out,'advanceWithoutName');state.activeNamePointerU16=[...out.activeNamePointerU16];state.nameIndex=0;}
        else if(state.phase===30)out=await call(COMMON_OBJECT_ANIMATION_MODELS[0],{...input,operation:3});
        else if(state.phase===40){const nameByte=read(pair(word(state.activeNamePointerU16)+state.nameIndex),1,{known:true})[0];out=await call(COMMON_OBJECT_ANIMATION_MODELS[0],{...input,operation:4,nameIndex:state.nameIndex,nameByte});state.nameIndex=scalar(out,'nextNameIndex');state.shouldAdvance=!!scalar(out,'nameMatches');}
        else if(state.phase===50)out=await call(COMMON_OBJECT_ANIMATION_MODELS[0],{...input,operation:5});
        else if(state.phase===60){const recordBytes=read(state.recordPointerU16,36);read(pair(word(state.recordPointerU16)+16),20,{known:true});let rawFrameCountBytes=[0,0];if(state.packageType===1){const raw=pointer(read(pair(word(state.dataPointerU16)+8),4,{known:true}),0);rawFrameCountBytes=read(pair(word(raw)+4),2,{known:true});}out=await call(COMMON_OBJECT_ANIMATION_MODELS[1],{objectBytes,recordBytes,packageType:state.packageType,deltaTimeU16,rawFrameCountBytes,shouldAdvance:state.shouldAdvance});out.nextStage=[70];}
        else if(state.phase===70){const recordBytes=read(state.recordPointerU16,36);read(pair(word(state.recordPointerU16)+32),4,{known:true});out=await call(COMMON_OBJECT_ANIMATION_MODELS[0],{...input,operation:6,recordBytes});state.soundListPointerU16=[...out.soundListPointerU16];}
        else throw Error('Unknown retained Object3D animation phase');
        write(objectPointerU16,out.nextObjectBytes,out.writtenMaskBytes);state.phase=scalar(out,'nextStage');state.transitions++;transitions++;
      }
      if(state.phase===80)return{complete:false,pending:'Original animation sound-list callbacks require their shared producer',requiresSoundEvents:true,state,transitions,soundListPointerU16:state.soundListPointerU16};
      return state.phase===90?{complete:true,state,transitions}:{complete:false,pending:'Object3D animation transition budget exhausted',budgetExhausted:true,state,transitions};
    }
  };
}
