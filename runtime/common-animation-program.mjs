// Typed Script bytes are parsed locally; every node-constructor decision and
// numeric payload store comes from the same shared ONNX model for every file.
import {decodeOriginalAnimationScript} from './common-animation-data.mjs';

const clone=x=>structuredClone(x),scalar=(o,k)=>Number(o[k]?.[0]);
export const COMMON_ANIMATION_PROGRAM_MODELS=['rom-common-animation-node'];
const PAC=[46,112,97,99],CHR=[46,99,104,114];
function originalCharacterSuffix(bytes){
 // JPN overlay0 021850f0='.pac',021850f5='.chr'. Original strstr/strcpy
 // replaces at the first match and terminates there, including any suffix.
 const at=bytes.findIndex((_,i)=>PAC.every((value,j)=>bytes[i+j]===value));
 return at<0?[...bytes]:[...bytes.slice(0,at),...CHR];
}

export function createCommonAnimationProgramBuilder({runGraph,getModel,onTrace}={}){
 async function build(value){
  let decoded;
  try{decoded=value?.schema==='dq9-original-animation-script-data-v1'?clone(value):decodeOriginalAnimationScript(value);}catch(error){return{complete:false,pending:'Original typed animation file: '+error.message};}
  if(decoded.instructions.some(i=>i.parameters.length>4))return{complete:false,pending:'An original animation constructor with more than four parameters requires its shared producer'};
  const model=await getModel('rom-common-animation-node');if(!model)throw Error('Missing shared typed animation-node graph');
  const inputs=decoded.instructions.map(instruction=>{
   const parameters=[...instruction.parameters];while(parameters.length<4)parameters.push({type:0,rawU16:[0,0]});
   const values={...model.contract.defaults,opcode:instruction.opcode,parameterCount:instruction.parameters.length,parameterTypes:parameters.map(p=>p.type),parameterRawU16:parameters.flatMap(p=>p.rawU16),stringPresent:parameters.map(p=>Array.isArray(p.stringBytes)),enabled:true};
   return Object.fromEntries(model.inputs.map(d=>[d.name,Array.isArray(values[d.name])?values[d.name]:[values[d.name]]]));
  });
  const outputs=inputs.length?await runGraph('rom-common-animation-node',inputs):[];
  await onTrace?.({model:'rom-common-animation-node',inputs:clone(inputs),outputs:clone(outputs)});
  const programs=[];let current=null;
  for(let index=0;index<outputs.length;index++){
   const output=outputs[index],instruction=decoded.instructions[index];
   if(!scalar(output,'supported'))return{complete:false,pending:`Original animation opcode${instruction.opcode} at instruction${index} needs an additional typed constructor`,unsupportedInstruction:index,opcode:instruction.opcode};
   if(scalar(output,'startProgram')){current={schema:'dq9-computed-linked-animation-program-v1',actionIds:output.rootActionIds.slice(0,scalar(output,'rootActionCount')),codes:[],pointerRepresentation:'sequential structural links; allocated addresses and uninitialized padding are not claimed'};programs.push(current);}
   if(scalar(output,'appendNode')){
    if(!current)return{complete:false,pending:'Original animation node precedes its root program'};
    const stringIndex=scalar(output,'stringParameterIndex'),stringPointerOffset=scalar(output,'stringPointerOffset');let stringBytes=null;
    if(stringIndex>=0){stringBytes=instruction.parameters[stringIndex]?.stringBytes;if(!Array.isArray(stringBytes))return{complete:false,pending:'Original animation string pointer is not valid'};stringBytes=scalar(output,'replaceCharacterSuffix')?originalCharacterSuffix(stringBytes):[...stringBytes];}
    current.codes.push({opcode:instruction.opcode,parameter:scalar(output,'parameter'),parameterKnown:!!scalar(output,'parameterKnown'),nodeByteLength:scalar(output,'nodeByteLength'),payloadBaseOffset:0,payloadU16:[...output.payloadU16],payloadMaskU16:[...output.payloadMaskU16],stringPointerOffset,stringBytes,sourceInstruction:index,rawParameters:clone(instruction.parameters)});
   }
  }
  return{complete:true,programs,program:programs[0]??null,decoded,linkedProgramBuilt:true,scope:'The actual typed node sequence, written payload bits and referenced string bytes are computed. Heap addresses, untouched allocator bytes, resource effects and execution of the nonempty program remain separate state producers.'};
 }
 return{build,models:COMMON_ANIMATION_PROGRAM_MODELS};
}
