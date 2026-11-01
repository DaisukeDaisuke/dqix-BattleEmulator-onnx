// Development-time definition decoding. Runtime decisions remain ONNX work.
import {decodeOriginalAnimationScript} from '../runtime/common-animation-data.mjs';

function toU16(parameter){
 if(!parameter)throw Error('Missing original numeric parameter');
 const b=Buffer.alloc(4);b.writeUInt16LE(parameter.rawU16[0],0);b.writeUInt16LE(parameter.rawU16[1],2);
 const n=parameter.type===1?b.readInt32LE():parameter.type===2?Math.trunc(b.readFloatLE()):0;
 if(!Number.isFinite(n)||n<-2147483648||n>2147483647)throw Error('Unsupported original parameter conversion');
 return(n%65536+65536)%65536;
}

export function cameraProgramMetadata(bytes){
 const script=decodeOriginalAnimationScript(bytes),programs=[];let current=null;
 for(const instruction of script.instructions){
  if(instruction.opcode===1||instruction.opcode===16){
   const actions=instruction.opcode===16?[1,2,219]:instruction.parameters.map(toU16);
   if(instruction.opcode===1&&actions.includes(1))actions.push(2,219);
   if(actions.length>32)throw Error('Original root constructor exceeds its local action buffer');
   current={actions,codes:[],next:-1};if(programs.length)programs.at(-1).next=programs.length;programs.push(current);
  }else if([7,12,32,34,61].includes(instruction.opcode)&&current){
   current.codes.push({opcode:instruction.opcode,...instruction.opcode===12?{parameter:toU16(instruction.parameters[0])}:{}});
  }
 }
 return{programs,instructionCount:script.instructions.length};
}
