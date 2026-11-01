// Select raw memory windows and serialize shared-graph stages. Original header,
// entry values, names and tree branches are graph outputs. Each64-entry window
// is a slice of the full original uint8 entry domain, never a truncation.
import {createCommonNsbxxNameLookupRunner,COMMON_NSBXX_NAME_LOOKUP_MODELS} from './common-nsbxx-name-lookup.mjs';
const clone=x=>structuredClone(x),scalar=(o,k)=>Number(o[k]?.[0]),byteArray=a=>Array.isArray(a)&&a.every(x=>Number.isInteger(x)&&x>=0&&x<=255);
export const COMMON_NSBXX_INITIALIZE_MODELS=['rom-common-nsbxx-animation',...COMMON_NSBXX_NAME_LOOKUP_MODELS];

export function createCommonNsbxxInitializerRunner({getModel,runGraph,onTrace,onWrite}={}){
  const lookup=createCommonNsbxxNameLookupRunner({getModel,runGraph,onTrace});
  async function call(input){const name='rom-common-nsbxx-animation',ir=await getModel(name);if(!ir)throw Error('The original shared NSBXX initializer graph is required');const values={...ir.contract.defaults,...input},feeds=Object.fromEntries(ir.inputs.map(d=>[d.name,Array.isArray(values[d.name])?values[d.name]:[values[d.name]]]));const out=(await runGraph(name,[feeds]))[0];await onTrace?.({model:name,inputs:[clone(feeds)],outputs:[clone(out)]});return out;}
  return{
    models:COMMON_NSBXX_INITIALIZE_MODELS,
    async initialize({animation,modelBoneCount,modelMaterialCount,rawAnimationPointerU16,texturePointerU16,materialDictionary,animationBytes,state:prior,maxTransitions=65536}={}){
      if(!animation||!byteArray(animationBytes)||animationBytes.length<26)throw Error('Actual original animation metadata and destination backing bytes are required');
      if(!Number.isInteger(maxTransitions)||maxTransitions<1||maxTransitions>65536)throw Error('A bounded NSBXX initializer transition budget is required');
      const state=prior?clone(prior):{schema:'dq9-original-nsbxx-initializer-state-v1',phase:'initialize',entryBase:0,trackIndex:0,bytes:[...animationBytes],writtenMaskBytes:Array(animationBytes.length).fill(0),transitions:0};
      if(state.schema!=='dq9-original-nsbxx-initializer-state-v1'||!byteArray(state.bytes)||state.bytes.length!==animationBytes.length||state.writtenMaskBytes.length!==state.bytes.length)throw Error('Invalid original NSBXX initializer continuation');
      const pending=reason=>({complete:false,pending:reason,state,bytes:state.bytes,writtenMaskBytes:state.writtenMaskBytes});
      const operands={useEntryWindows:true,signatureInitial:animation.signatureInitial,signatureEnd:animation.signatureEnd,modelBoneCount,modelMaterialCount,rawAnimationPointerU16,texturePointerU16};
      function window(base){return[...state.bytes.slice(0,26),...Array.from({length:130},(_,i)=>state.bytes[26+2*base+i]??0)];}
      async function scatter(out,base){const mask=Array(state.bytes.length).fill(0);for(let i=0;i<156;i++){const m=out.writtenMaskBytes[i],at=i<26?i:i+2*base;if(m&&at>=state.bytes.length)return false;}
        for(let i=0;i<156;i++){const m=out.writtenMaskBytes[i],at=i<26?i:i+2*base;if(!m)continue;state.bytes[at]=(state.bytes[at]&~m)|(out.nextAnimationBytes[i]&m);state.writtenMaskBytes[at]|=m;mask[at]|=m;}await onWrite?.(state.bytes,mask);return true;}
      function selectTracks(){state.trackIndex=0;state.phase=animation.jointTrackTargetBytes?.length?'joint':animation.trackNames?.length?'lookup':'complete';}
      for(let iteration=0;iteration<maxTransitions;iteration++){
        if(state.phase==='complete')return{complete:true,state,bytes:state.bytes,writtenMaskBytes:state.writtenMaskBytes};
        if(state.phase==='lookup'){
          const match=await lookup.lookup({dictionary:materialDictionary,targetBytes:animation.trackNames[state.trackIndex],state:state.nameSearchState,maxTransitions:1});state.transitions++;
          if(!match.complete){state.nameSearchState=match.state;if(!match.budgetExhausted)return pending(match.pending);continue;}
          state.materialIndex=match.index;delete state.nameSearchState;state.phase='material';continue;
        }
        const initializing=state.phase==='initialize',joint=state.phase==='joint';if(!initializing&&!joint&&state.phase!=='material')throw Error('Invalid original NSBXX initializer phase');
        const entryBase=initializing?state.entryBase:Math.floor((joint?state.trackIndex:Math.max(0,state.materialIndex))/64)*64;
        const out=await call({...operands,operation:initializing?0:joint?1:2,entryBase,trackIndex:state.trackIndex,targetBone:joint?animation.jointTrackTargetBytes[state.trackIndex]:0,materialIndex:state.materialIndex??-1,animationBytes:window(entryBase)});state.transitions++;
        if(!scalar(out,'supported'))return pending('Original NSBXX track requires backing beyond the declared model entry range');
        if(!await scatter(out,entryBase))return pending('Original NSBXX entry store requires additional actual destination backing bytes');
        if(initializing){if(scalar(out,'moreEntryWindows'))state.entryBase=scalar(out,'nextEntryBase');else selectTracks();}
        else{state.trackIndex++;if(joint)state.phase=state.trackIndex<animation.jointTrackTargetBytes.length?'joint':'complete';else state.phase=state.trackIndex<animation.trackNames.length?'lookup':'complete';}
      }
      if(state.phase==='complete')return{complete:true,state,bytes:state.bytes,writtenMaskBytes:state.writtenMaskBytes};
      return{...pending('Original NSBXX initializer transition budget exhausted'),budgetExhausted:true};
    }
  };
}
