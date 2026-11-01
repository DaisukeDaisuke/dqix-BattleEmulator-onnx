// Archive bytes and backing-memory windows are structural inputs. Original
// CRC, header allocation, entry search and decompression are shared ONNX.
import {createCommonCompressedFileRunner,COMMON_COMPRESSED_FILE_MODELS} from './common-compressed-file.mjs';
const clone=x=>structuredClone(x),scalar=(o,k)=>Number(o[k]?.[0]),word=p=>p[0]+65536*p[1],pair=n=>[n%65536,Math.floor(n/65536)];
const requireData=(c,m)=>{if(!c)throw Error(m);};
export const COMMON_GPC_ARCHIVE_MODELS=['rom-common-filename-crc','rom-common-gpc-archive','rom-common-gpc-search',...COMMON_COMPRESSED_FILE_MODELS];

export function createCommonGpcArchiveRunner({getModel,runGraph,onTrace}={}){
 const compressed=createCommonCompressedFileRunner({getModel,runGraph,onTrace}),computedCRCs=new Map();
 async function call(name,input){const ir=await getModel(name);requireData(ir,'Missing common GPC model '+name);const values={...ir.contract.defaults,...input},feeds=Object.fromEntries(ir.inputs.map(d=>[d.name,Array.isArray(values[d.name])?values[d.name]:[values[d.name]]]));const out=(await runGraph(name,[feeds]))[0];await onTrace?.({model:name,inputs:[clone(feeds)],outputs:[clone(out)]});return out;}
 async function crc(name){requireData(typeof name==='string'&&name.length<24&&/^[\x01-\x7f]*$/.test(name),'An original bounded ASCII loader filename is required');if(computedCRCs.has(name))return[...computedCRCs.get(name)];const o=await call('rom-common-filename-crc',{nameBytes:[...Array.from(name,c=>c.charCodeAt(0)),...Array(24-name.length).fill(0)]});requireData(!!scalar(o,'supported'),'Original filename requires its terminating NUL');computedCRCs.set(name,[...o.crcU16]);return[...o.crcU16];}
 return{
  models:COMMON_GPC_ARCHIVE_MODELS,crc,
  async loadHeader({fileBytes,loader,outerFilename,read,write,maxDecoderTransitions=65536}={}){
   const bytes=Array.from(fileBytes);if(bytes.length<20)return{complete:false,retryable:true,pending:'Original partial GPC header read requires its retained file-read state'};
   const header=bytes.slice(0,20),out=await call('rom-common-gpc-archive',{operation:0,headerBytes:header,fileByteLength:bytes.length,scratchBaseU16:loader.scratchBaseU16,scratchBytes:loader.scratchBytes,rightmostAllocationByte:loader.rightmostAllocationByte,scratchRightArenaUsage:loader.scratchRightArenaUsage});
   if(!scalar(out,'supported'))return{complete:false,retryable:true,pending:'Original GPC header/index extent is outside the represented backing domain'};
   if(!scalar(out,'headerAccepted'))return{complete:false,retryable:true,pending:scalar(out,'signatureValid')?'Original GPC header is waiting for enough scratch space':'Original GPC header signature causes a retryable load failure'};
   const pointer=[...out.headerOutputPointerU16],encoded=bytes.slice(scalar(out,'indexEncodedOffset'),scalar(out,'indexEncodedOffset')+scalar(out,'indexEncodedLength')),description=await compressed.describe(encoded,{outputCapacity:scalar(out,'indexOutputCapacity')});
   if(!description.complete)return description;
   write(pointer,out.headerBeforeDecompressionBytes);
   if(!description.decodeValid)return{complete:false,retryable:true,pending:'Original GPC index compression header causes a retryable load failure'};
   const decoded=await compressed.decode({fileBytes:encoded,description,outputPointerU16:out.indexOutputPointerU16,read,write,maxTransitions:maxDecoderTransitions});if(!decoded.complete)return decoded;
   write(pointer,out.headerAfterDecompressionBytes);
   return{complete:true,scratchRightArenaUsage:scalar(out,'nextScratchRightArenaUsage'),cache:{schema:'dq9-computed-gpc-cache-v1',pointerU16:pointer,outerCRCU16:await crc(outerFilename),headerAllocationBytes:scalar(out,'headerAllocationBytes')}};
  },
  async lookup({cache,filename,read,state:prior,maxTransitions=32}={}){
   requireData(cache?.schema==='dq9-computed-gpc-cache-v1'&&Number.isInteger(maxTransitions)&&maxTransitions>=0,'Retained original GPC cache and bounded search budget are required');
   let state=prior?clone(prior):null;
   if(!state){const header=read(cache.pointerU16,20),targetCRCU16=await crc(filename),out=await call('rom-common-gpc-search',{phase:0,headerBytes:header,gpcPointerU16:cache.pointerU16,targetCRCU16});state={schema:'dq9-computed-gpc-search-state-v1',headerBytes:header,gpcPointerU16:[...cache.pointerU16],targetCRCU16,output:out};}
   requireData(state.schema==='dq9-computed-gpc-search-state-v1','Original GPC search continuation is invalid');
   for(let i=0;;i++){
    const o=state.output;if(!scalar(o,'supported'))return{complete:false,pending:'Original GPC candidate bytes are absent',state};
    if(scalar(o,'complete'))return{complete:true,state,entryPointerU16:[...o.returnPointerU16],entryPresent:!!scalar(o,'returnNonNull'),matched:!!scalar(o,'matched'),index:scalar(o,'returnIndex')};
    if(i>=maxTransitions)return{complete:false,budgetExhausted:true,pending:'Original GPC search transition budget exhausted',state};
    const needed=!!scalar(o,'candidateEntryRequired'),b=needed?read(o.candidateEntryPointerU16,4):[0,0,0,0];
    state.output=await call('rom-common-gpc-search',{phase:1,headerBytes:state.headerBytes,gpcPointerU16:state.gpcPointerU16,targetCRCU16:state.targetCRCU16,currentIndex:scalar(o,'nextCurrentIndex'),foundIndex:scalar(o,'nextFoundIndex'),rightAddition:scalar(o,'nextRightAddition'),entryPresent:needed,entryCRCU16:[b[0]+256*b[1],b[2]+256*b[3]]});
   }
  },
  async entry({cache,lookup,fileBytes,read}={}){
   if(!lookup.entryPresent)return{complete:true,entryPresent:false,byteLength:0,allocationBytes:4,encodedBytes:[],decodeValid:false};
   const headerBytes=read(cache.pointerU16,20),entryBytes=read(lookup.entryPointerU16,12),out=await call('rom-common-gpc-archive',{operation:1,headerBytes,entryBytes});
   if(!scalar(out,'supported'))return{complete:false,pending:'Original GPC file entry exceeds the represented file backing domain'};
   const offset=word(out.fileOffsetU16),size=scalar(out,'storedFileBytes'),bytes=Array.from(fileBytes);
   if(offset>bytes.length||offset+size>bytes.length)return{complete:false,pending:'Original GPC short/failed file read requires its retained I/O state'};
   const encoded=bytes.slice(offset,offset+size),uncompressed=!!scalar(out,'isUncompressed');
   if(uncompressed)return{complete:true,entryPresent:true,uncompressed:true,byteLength:size,allocationBytes:scalar(out,'uncompressedAllocationBytes'),encodedBytes:encoded,decodeValid:true,readSucceeded:!!scalar(out,'uncompressedReadSucceeded')};
   const description=await compressed.describe(encoded);if(!description.complete)return description;
   return{complete:true,entryPresent:true,uncompressed:false,byteLength:description.reportedLength,allocationBytes:description.allocationBytes,encodedBytes:encoded,description,decodeValid:!!description.decodeValid};
  },
  async decode({entry,outputPointerU16,read,write,maxTransitions=65536}={}){
   if(!entry.entryPresent||!entry.decodeValid)return{complete:true,success:false,byteLength:0};
   if(entry.uncompressed){write(outputPointerU16,entry.encodedBytes);return{complete:true,success:entry.readSucceeded,byteLength:entry.byteLength};}
   const decoded=await compressed.decode({fileBytes:entry.encodedBytes,description:entry.description,outputPointerU16,read,write,maxTransitions});return{...decoded,success:decoded.complete};
  }
 };
}
