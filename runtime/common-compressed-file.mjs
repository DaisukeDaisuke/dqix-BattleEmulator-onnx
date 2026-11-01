// File bytes, dictionary bytes and backing-memory lookup are structural work.
// Allocation lengths, codec transitions and mutable output bytes are ONNX.
const clone=x=>structuredClone(x),scalar=(o,k)=>Number(o[k]?.[0]),word=p=>p[0]+65536*p[1],pair=n=>[n%65536,Math.floor(n/65536)];
const requireData=(condition,message)=>{if(!condition)throw Error(message);};
export const COMMON_COMPRESSED_FILE_MODELS=['rom-common-compressed-file','rom-common-decompression-step'];
const fields=['phase','remainingOutput','outputOffset','inputOffset','flagByte','flagBits','matchCount','matchDistance','treeLength','treeLoaded','huffNode','huffPackedBits','huffBufferedInput','rleControl','rleRemaining'];
export function createCommonCompressedFileRunner({getModel,runGraph,onTrace}={}){
 async function call(name,input){const ir=await getModel(name);requireData(ir,'Missing shared compressed-file graph '+name);const values={...ir.contract.defaults,...input},feeds=Object.fromEntries(ir.inputs.map(d=>[d.name,Array.isArray(values[d.name])?values[d.name]:[values[d.name]]]));const out=(await runGraph(name,[feeds]))[0];await onTrace?.({model:name,inputs:[clone(feeds)],outputs:[clone(out)]});return out;}
 async function describe(fileBytes,{outputCapacity}={}){
  const bytes=Array.from(fileBytes);requireData(bytes.length<=262140&&bytes.every(x=>Number.isInteger(x)&&x>=0&&x<=255),'A bounded complete encoded file is required');
  const o=await call('rom-common-compressed-file',{prefixBytes:Array.from({length:4},(_,i)=>bytes[i]??0),fileByteLength:bytes.length,capacitySupplied:outputCapacity!==undefined,outputCapacity:outputCapacity??0});
  if(!scalar(o,'supported'))return{complete:false,pending:'The encoded file length or in-place staging extent is outside the represented original domain'};
  return{complete:true,...Object.fromEntries(Object.entries(o).map(([k,v])=>[k,v.length===1?Number(v[0]):[...v]]))};
 }
 async function decode({fileBytes,description,outputPointerU16,read,write,state:prior,maxTransitions=65536}={}){
  requireData(typeof read==='function'&&typeof write==='function'&&Number.isInteger(maxTransitions)&&maxTransitions>=0,'Actual readable/writable backing memory and a finite decoder budget are required');
  let state;
  if(prior){state=clone(prior);requireData(state.schema==='dq9-computed-compressed-file-state-v1','A retained original codec state is required');}
  else{
   const metadata=description??await describe(fileBytes);if(!metadata.complete)return metadata;
   requireData(Array.isArray(outputPointerU16)&&outputPointerU16.length===2&&word(outputPointerU16)>0,'Actual allocated output pointer is required');
   state={schema:'dq9-computed-compressed-file-state-v1',phase:metadata.decodeValid?'stage':'done',encodedBytes:Array.from(fileBytes),metadata:clone(metadata),outputPointerU16:[...outputPointerU16],chunkIndex:0,transitions:0,decoder:{compressionType:metadata.compressionType,phase:metadata.initialDecoderPhase,remainingOutput:metadata.declaredLength,outputOffset:0,inputOffset:0,flagByte:0,flagBits:0,matchCount:0,matchDistance:0,treeLength:0,treeLoaded:0,huffNode:1,huffPackedBits:0,huffBufferedInput:0,rleControl:0,rleRemaining:0,huffPackedBytes:Array(4).fill(0),treeBytes:Array(512).fill(0)}};
  }
  let transitions=0;
  const pointer=offset=>pair(word(state.outputPointerU16)+offset),pending=reason=>({complete:false,pending:reason,state,transitions});
  for(;;){
   const m=state.metadata;
   if(state.phase==='done')return{complete:true,state,transitions,byteLength:m.reportedLength,outputRemaining:state.decoder.remainingOutput,scope:'Original synchronous compressed-file data and padding; physical I/O/cache timing is not modeled'};
   if(state.phase==='padding'){if(m.paddingLength)write(pointer(m.paddingOffset),Array(m.paddingLength).fill(0));state.phase='done';continue;}
   if(state.phase==='stage'){
    if(state.chunkIndex>=2){state.phase='padding';continue;}
    const first=state.chunkIndex===0,length=first?m.firstReadLength:m.secondReadLength,start=first?4:4+m.firstReadLength;
    if(!length){state.chunkIndex++;continue;}
    if(first)write(pointer(m.firstReadDestinationOffset),state.encodedBytes.slice(start,start+length));
    state.chunk={first,length,encodedOffset:start,memoryOffset:m.firstReadDestinationOffset};state.decoder.inputOffset=0;state.phase='decode';
   }
   const d=state.decoder,c=state.chunk,available=Math.min(130,c.length-d.inputOffset),withoutInput=d.phase===8&&d.remainingOutput>0;
   if(available<=0&&!withoutInput){state.phase='stage';state.chunkIndex++;continue;}
   if(transitions>=maxTransitions)return{...pending('Original codec transition budget exhausted'),budgetExhausted:true};
   const source=available>0?(c.first?read(pointer(c.memoryOffset+d.inputOffset),available):state.encodedBytes.slice(c.encodedOffset+d.inputOffset,c.encodedOffset+d.inputOffset+available)):[],history=withoutInput?read(pointer(d.outputOffset-d.matchDistance),Math.min(d.matchDistance,d.matchCount)):[];
   const o=await call('rom-common-decompression-step',{...d,inputAvailable:Math.max(available,0),sourceBytes:[...source,...Array(130-source.length).fill(0)],historyBytes:[...history,...Array(18-history.length).fill(0)]});
   transitions++;state.transitions++;
   if(!scalar(o,'supported'))return pending(d.huffBufferedInput?'A partial original Huffman word requires the adjacent wide-load backing producer':'The original compressed token or tree references an unrepresented memory extent');
   const used=scalar(o,'sourceConsumed'),written=scalar(o,'outputWritten'),treeCount=scalar(o,'treeWriteCount');
   if(written)write(pointer(d.outputOffset),o.outputBytes.slice(0,written));
   if(treeCount)d.treeBytes.splice(scalar(o,'treeWriteOffset'),treeCount,...source.slice(0,treeCount));
   for(const key of fields)d[key]=scalar(o,'next'+key[0].toUpperCase()+key.slice(1));d.huffPackedBytes=[...o.nextHuffPackedBytes];
   if(!used&&!written&&!treeCount){state.phase='stage';state.chunkIndex++;}
  }
 }
 return{describe,decode,models:COMMON_COMPRESSED_FILE_MODELS};
}
