// Only structural Script iteration, retained graph state and byte scattering.
import {validateGraphInputs} from '../graph-v2/input-domains.mjs';
const scalar=(o,k)=>Number(o[k]?.[0]);
export function createCommonBCFGRunner({runGraph,getModel,allocate,write,onTrace}={}){
 async function call(input){const name='rom-common-bcfg',ir=await getModel(name);if(!ir)throw Error('Missing shared BCFG model');const values={...ir.contract.defaults,...input},feeds=Object.fromEntries(ir.inputs.map(v=>[v.name,Array.isArray(values[v.name])?values[v.name]:[values[v.name]]]));const errors=validateGraphInputs(ir.contract,feeds);if(errors.length)throw Error(name+': '+errors.join('; '));const out=(await runGraph(name,[feeds]))[0];await onTrace?.({model:name,inputs:[structuredClone(feeds)],outputs:[structuredClone(out)]});return out;}
 async function load({script,bcfgBytes,allocatorPresent=true}){
  const calls=[],records=[];let current=[...bcfgBytes];
  async function perform(input){const output=await call({...input,bcfgBytes:current,allocatorPresent,enabled:true});if(!scalar(output,'supported'))return{complete:false,pending:'Original BCFG instruction requires a parameter or linked-record producer outside this module',output};current=[...output.nextBCFGBytes];
   if(scalar(output,'recordWritten')){await write(output.recordPointerU16,output.recordBytes,output.recordWrittenMaskBytes,output.recordUnknownMaskBytes);records.push({pointerU16:[...output.recordPointerU16],bytes:[...output.recordBytes],knownMask:[...output.recordWrittenMaskBytes]});}
   if(scalar(output,'requestStringCopy'))await write(output.stringDestinationU16,output.stringBytes.slice(0,scalar(output,'stringLength')));
   if(scalar(output,'requestAllocation')){const allocation=await allocate(output.requestBytesU16);calls.push(allocation);if(!allocation.complete)return allocation;const continuation=await perform({...input,phase:scalar(output,'requestDefaultRoot')?4:2,allocationPointerU16:allocation.returnPointerU16});if(!continuation.complete)return continuation;}
   return{complete:true,output};
  }
  let result=await perform({phase:0});if(!result.complete)return{...result,bcfgBytes:current,calls,records};
  if(script?.byteLength>0){for(const instruction of script.instructions){if(instruction.parameters.length>4)return{complete:false,pending:'BCFG instruction has more than four represented parameters',bcfgBytes:current,calls,records};const parameters=Array.from({length:4},(_,i)=>instruction.parameters[i]??{type:0,rawU16:[0,0],stringBytes:null}),name=parameters[0].stringBytes,resultInput={phase:1,opcode:instruction.opcode,parameterCount:instruction.parameters.length,parameterTypes:parameters.map(p=>p.type),parameterRawU16:parameters.flatMap(p=>p.rawU16),firstStringPresent:Array.isArray(name),firstStringLength:name?.length??0,firstStringBytes:Array.from({length:16},(_,i)=>name?.[i]??0)};result=await perform(resultInput);if(!result.complete)return{...result,bcfgBytes:current,calls,records};}
   result=await perform({phase:3,scriptPresent:true});if(!result.complete)return{...result,bcfgBytes:current,calls,records};
  }
  return{complete:true,bcfgBytes:current,calls,records};
 }
 return{load,model:'rom-common-bcfg'};
}
