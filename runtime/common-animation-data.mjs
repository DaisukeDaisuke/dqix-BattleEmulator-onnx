// Original Script file decoding only. Runtime animation decisions belong to
// shared ONNX modules. Data parsing never replaces a nonempty program by an
// empty resident program or marks a resource operation complete.
const requireData=(condition,message)=>{if(!condition)throw Error(message);};
const asBytes=value=>value instanceof Uint8Array?value:Uint8Array.from(value??[]);

/** Matching Resource/Script.cpp Load/ExecuteSingleInstruction and
 * GetInstructionParamsOffset. ARM parameter conversion is left to the graph;
 * raw32-bit values and string bytes are retained exactly. */
export function decodeOriginalAnimationScript(value){
  const bytes=asBytes(value);requireData(bytes.length>=16,'Original Script header is incomplete');
  const data=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),count=data.getInt32(0,true),dataOffset=data.getUint32(4,true),dataLength=data.getInt32(8,true),maybeNumStrings=data.getUint32(12,true);
  requireData(count>=0&&count<=65535&&dataLength>=0&&dataOffset>=16&&dataOffset+dataLength<=bytes.length,'Original Script section bounds are invalid');
  const instructions=[];let cursor=16;
  for(let index=0;index<count;index++){
    requireData(cursor+3<=dataOffset,'Original Script instruction prefix is incomplete');
    const opcode=data.getUint16(cursor,true),parameterCount=bytes[cursor+2],paramsOffset=Math.ceil((3+Math.ceil(parameterCount/4))/4)*4;
    requireData(parameterCount<=128&&cursor+paramsOffset+parameterCount*4<=dataOffset,'Original Script parameter area is incomplete or unsupported');
    const parameters=[];
    for(let i=0;i<parameterCount;i++){
      const type=bytes[cursor+3+Math.floor(i/4)]>>((i%4)*2)&3,at=cursor+paramsOffset+i*4,rawU32=data.getUint32(at,true),rawI32=data.getInt32(at,true);
      requireData(type!==3,'Original Script parameter type3 retains prior parser memory and needs its own input state');
      const parameter={type,rawU16:[rawU32%65536,Math.floor(rawU32/65536)]};
      if(type===0){
        if(rawI32===-1)parameter.stringBytes=[];
        else if(rawI32<0||rawI32>=dataLength)parameter.stringBytes=null;
        else{let end=dataOffset+rawI32;while(end<dataOffset+dataLength&&bytes[end]!==0)end++;requireData(end<dataOffset+dataLength,'Original Script string has no terminator inside its data section');parameter.stringBytes=Array.from(bytes.subarray(dataOffset+rawI32,end));}
      }
      parameters.push(parameter);
    }
    instructions.push({index,byteOffset:cursor,opcode,parameters});cursor+=paramsOffset+parameterCount*4;
  }
  return{schema:'dq9-original-animation-script-data-v1',byteLength:bytes.length,header:{instructionCount:count,dataOffset,dataLength,maybeNumStrings},instructions,decoded:true,linkedProgramBuilt:false};
}
