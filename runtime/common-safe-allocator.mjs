// Pointer lookup is structural host work. Allocation arithmetic, alignment,
// exhaustion and cursor writes are evaluated by the shared original graph.
const clone=x=>structuredClone(x),scalar=(o,k)=>Number(o[k]?.[0]);
const pair=x=>Array.isArray(x)&&x.length===2&&x.every(v=>Number.isInteger(v)&&v>=0&&v<65536);
const requireData=(condition,message)=>{if(!condition)throw Error(message);};
export const COMMON_SAFE_ALLOCATOR_MODELS=['rom-common-hmrf-allocator'];

export function createCommonSafeAllocatorRunner({getModel,runGraph,onTrace}={}){
  return{
    models:COMMON_SAFE_ALLOCATOR_MODELS,
    async allocate(state,requestBytesU16){
      requireData(pair(state?.signedAllocatorU16)&&pair(requestBytesU16),'Actual SafeAllocator signed-header pointer and request length are required');
      const name='rom-common-hmrf-allocator',model=await getModel(name);requireData(model,'The shared SafeAllocator/HMRF graph is required');
      const initialized=state.signedAllocatorU16.some(Boolean),fields=['heapBeginU16','heapEndU16','frontU16','backU16','newestStateU16'];
      if(initialized)requireData(pair(state.signatureU16)&&fields.every(k=>pair(state[k]))&&Number.isInteger(state.clearFlagsLow16),'The retained signed allocator header is required');
      const values={...model.contract.defaults,operation:0,initialized,hmrfKind:!initialized||(state.signatureU16[0]===0x4d48&&state.signatureU16[1]===0x4652),clearFlagsLow16:state.clearFlagsLow16??0,requestBytesU16,enabled:true};
      for(const field of fields)values[field]=state[field]??[0,0];
      const feeds=Object.fromEntries(model.inputs.map(d=>[d.name,Array.isArray(values[d.name])?values[d.name]:[values[d.name]]]));
      const out=(await runGraph(name,[feeds]))[0];await onTrace?.({model:name,inputs:[clone(feeds)],outputs:[clone(out)]});
      if(!scalar(out,'supported')||!scalar(out,'operationCompleted'))return{complete:false,pending:'The original allocator kind or clear-on-allocation byte producer is required'};
      if(initialized)for(const key of['frontU16','backU16','newestStateU16'])state[key]=[...out['next'+key[0].toUpperCase()+key.slice(1)]];
      return{complete:true,pointerU16:[...out.returnPointerU16],allocated:!!scalar(out,'returnedNonNull')};
    }
  };
}
