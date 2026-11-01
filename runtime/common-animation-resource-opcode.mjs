// Shared resource identity and structural opcode operands. All allocation and
// resource control decisions stay in the original semantic ONNX modules.
import {createCommonAnimationResourceRunner,COMMON_ANIMATION_RESOURCE_MODELS} from './common-animation-resource.mjs';
import {createCommonAnimationInstallState,COMMON_ANIMATION_INSTALL_MODELS} from './common-animation-install.mjs';
import {commonAnimationPayload} from '../graph-v2/common-animation-fields.mjs';

const clone=x=>structuredClone(x),word=x=>x[0]+65536*x[1],pair=x=>[x%65536,Math.floor(x/65536)];
const fields=['heapBeginU16','heapEndU16','frontU16','backU16','newestStateU16'];
const requireData=(x,message)=>{if(!x)throw Error(message);};
const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>v===b[i]);
export const COMMON_ANIMATION_RESOURCE_OPCODE_MODELS=[...new Set([...COMMON_ANIMATION_RESOURCE_MODELS,...COMMON_ANIMATION_INSTALL_MODELS])];

function canonicalState(legacy,prior){
 const signature=legacy.hmrfKind?[0x4d48,0x4652]:prior?.signatureU16;
 requireData(!legacy.initialized||signature,'A non-HMRF allocator requires its original signature');
 return{...clone(prior??{}),signedAllocatorU16:[...legacy.signedAllocatorPointerU16],signatureU16:clone(signature??[0,0]),clearFlagsLow16:legacy.clearFlagsLow16,...Object.fromEntries(fields.map(k=>[k,[...legacy[k]]]))};
}
function legacyState(canonical,prior){
 requireData(Array.isArray(canonical.signedAllocatorU16)&&canonical.signedAllocatorU16.length===2,'Actual signed allocator identity required');
 const initialized=canonical.signedAllocatorU16.some(Boolean);
 if(initialized)requireData(fields.every(k=>Array.isArray(canonical[k])&&canonical[k].length===2)&&Array.isArray(canonical.signatureU16),'Actual initialized allocator header required');
 return{...clone(prior??{}),schema:'dq9-computed-hmrf-state-v1',initialized,hmrfKind:!initialized||same(canonical.signatureU16,[0x4d48,0x4652]),signedAllocatorPointerU16:[...canonical.signedAllocatorU16],clearFlagsLow16:canonical.clearFlagsLow16??0,...Object.fromEntries(fields.map(k=>[k,[...(canonical[k]??[0,0])]]))};
}
export function mergeCommonResourceAllocators(input={},installation){
 const map=clone(input);
 for(const entry of installation?.safeAllocators??[]){
  const key=String(word(entry.pointerU16)),value=canonicalState(entry.state,map[key]);
  if(map[key])for(const field of['signedAllocatorU16','signatureU16','clearFlagsLow16',...fields])requireData(Array.isArray(value[field])?same(value[field],map[key][field]):value[field]===map[key][field],'Conflicting initial views of allocator '+key+' '+field);
  map[key]=value;
 }
 return map;
}
export function prepareCommonType0Installation(installation,allocators){
 if(!installation)return null;
 const prior=new Map((installation.safeAllocators??[]).map(x=>[String(word(x.pointerU16)),x.state]));
 const safeAllocators=Object.entries(allocators).map(([key,state])=>({pointerU16:pair(Number(key)),state:legacyState(state,prior.get(key))}));
 return createCommonAnimationInstallState({...clone(installation),safeAllocators});
}
export function commitCommonResourceAllocators(allocators,installation){
 const map=clone(allocators);
 for(const entry of installation?.safeAllocators??[]){const key=String(word(entry.pointerU16));map[key]=canonicalState(entry.state,map[key]);}
 return map;
}

export function createCommonAnimationResourceOpcodeRunner(options){
 const runner=createCommonAnimationResourceRunner(options);
 async function executeOpcode({state:prior,code,maxTransitions,signal,shouldStop}={}){
  const state=clone(prior),resources=state.animationResources;
  const pending=reason=>({complete:false,pending:reason,state,transitions:0});
  if(![18,19,20].includes(code.opcode))return pending('Original animation opcode'+code.opcode+' needs its common producer');
  if(!resources?.loader)return pending('Resource opcodes require the retained shared loader and tracker');
  let resourceName,resourceIdByte=255;
  if(code.opcode!==19){
   if(!Array.isArray(code.stringBytes)||code.stringPointerOffset!==(code.opcode===18?8:12))return pending('Actual constructed resource-name pointer and bytes are required');
   if(code.stringBytes.some(x=>!Number.isInteger(x)||x<=0||x>=128))return pending('The original resource path requires its exact ASCII bytes');
   resourceName=String.fromCharCode(...code.stringBytes);
  }
  if(code.opcode===20){const p=commonAnimationPayload(code);if((p.payloadMaskU16[0]&255)!==255)return pending('The original signed resource ID byte is not known');resourceIdByte=p.payloadU16[0]&255;}
  const allocators=resources.allocators??{},installer=code.opcode===20&&resources.installer?prepareCommonType0Installation(resources.installer,allocators):resources.installer;
  const input={...resources,installer,eventFlagsU16:[...state.eventFlagsU16]};
  const result=await runner.run({state:input,opcode:code.opcode,resourceName,resourceIdByte,allocatorIndex:resources.allocatorIndex,safeAllocatorPointerU16:resources.safeAllocatorPointerU16,scriptOwnerPresent:state.scriptOwnerPresent,maxTransitions,signal,shouldStop});
  state.animationResources=result.state;state.animationResources.allocators=commitCommonResourceAllocators(allocators,result.state.installer);state.eventFlagsU16=[...result.state.eventFlagsU16];
  if(result.installation)await options.onInstallation?.(clone(result.installation));
  return{...result,state,handlerReturnU16:result.complete?[result.returnValue,0]:undefined,installation:result.installation};
 }
 return{executeOpcode,models:COMMON_ANIMATION_RESOURCE_OPCODE_MODELS};
}
