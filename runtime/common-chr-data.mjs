// Structural decoding of supplied original CHR/NSBXX bytes only. Decisions,
// allocation sizes and mutable runtime fields are produced by shared graphs.
import {inspectOriginalNarc} from './common-rom-assets.mjs';
import {decodeOriginalAnimationScript} from './common-animation-data.mjs';
const required=(condition,message)=>{if(!condition)throw Error(message);};
const asBytes=x=>x instanceof Uint8Array?x:Uint8Array.from(x??[]);
const wordBytes=(data,at,n)=>Array.from(data.subarray(at,at+n));

export function inspectOriginalNSBXX(value){
 const bytes=asBytes(value),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),range=(at,n)=>required(Number.isInteger(at)&&at>=0&&n>=0&&at+n<=bytes.length,'Original NSBXX field exceeds its supplied file');
 range(0,16);const fileSize=view.getUint32(8,true),headerSize=view.getUint16(12,true),subfileCount=view.getUint16(14,true);required(fileSize<=bytes.length&&headerSize>=16&&subfileCount>0,'Original NSBXX header is invalid');range(headerSize,subfileCount*4);
 const subfileOffsets=Array.from({length:subfileCount},(_,i)=>view.getUint32(headerSize+4*i,true));for(const at of subfileOffsets)range(at,8);
 function names(at){range(at,8);const count=bytes[at+1],dataOffset=view.getUint16(at+6,true),start=at+dataOffset;range(start,4);const stride=view.getUint16(start,true),nameOffset=view.getUint16(start+2,true);range(start+4,count*stride);range(start+nameOffset,count*16);return{byteOffset:at,count,stride,dataByteOffset:start+4,names:Array.from({length:count},(_,i)=>wordBytes(bytes,start+nameOffset+i*16,16))};}
 const first=subfileOffsets[0],dictionary=names(first+8);let objectOffset=null;
 if(dictionary.count){range(dictionary.dataByteOffset,4);objectOffset=first+view.getUint32(dictionary.dataByteOffset,true);range(objectOffset,4);}
 const signature=String.fromCharCode(...bytes.subarray(0,4)),result={schema:'dq9-original-nsbxx-data-v1',byteLength:bytes.length,signature,fileSize,headerSize,subfileOffsets,firstObjectOffset:objectOffset};
 if(objectOffset===null)return result;
 if(signature==='BMD0'){
  range(objectOffset,64);const materialOffset=view.getUint32(objectOffset+8,true),materials=materialOffset?names(objectOffset+materialOffset+4):null;
  function internalModel(at){range(at,64);const relative=view.getUint32(at+8,true),materialBase=relative?at+relative:null,md=materialBase===null?null:names(materialBase+4),materialRecords=[];if(md)for(let i=0;i<md.count;i++){const offset=materialBase+view.getUint32(md.dataByteOffset+md.stride*i,true);range(offset,44);materialRecords.push({byteOffset:offset,headerBytes:wordBytes(bytes,offset,44)});}
   function pairings(relative){if(!materialBase||!relative)return[];const table=names(materialBase+relative);return table.names.map((nameBytes,i)=>{const offset=table.dataByteOffset+table.stride*i;range(offset,4);const indices=materialBase+view.getUint16(offset,true),count=bytes[offset+2];range(indices,count);return{byteOffset:offset,nameBytes,headerBytes:wordBytes(bytes,offset,4),materialIndices:wordBytes(bytes,indices,count)};});}
   return{byteOffset:at,headerBytes:wordBytes(bytes,at,64),materialNames:md?.names??[],materialDictionaryOffset:md?.byteOffset??null,materialRecords,texturePairings:materialBase===null?[]:pairings(view.getUint16(materialBase,true)),palettePairings:materialBase===null?[]:pairings(view.getUint16(materialBase+2,true))};
  }
  result.models=Array.from({length:dictionary.count},(_,i)=>{range(dictionary.dataByteOffset+dictionary.stride*i,4);return internalModel(first+view.getUint32(dictionary.dataByteOffset+dictionary.stride*i,true));});result.model=result.models[0];
  result.textureOffset=subfileOffsets.length>1?subfileOffsets[1]:null;
  if(result.textureOffset!==null){const at=result.textureOffset;range(at,60);const textureNames=names(at+60),paletteOffset=view.getUint16(at+52,true),paletteNames=paletteOffset?names(at+paletteOffset):null;result.texture={byteOffset:at,headerBytes:wordBytes(bytes,at,60),textures:textureNames.names.map((nameBytes,i)=>{const offset=textureNames.dataByteOffset+textureNames.stride*i;range(offset,8);return{nameBytes,byteOffset:offset,bytes:wordBytes(bytes,offset,8)};}),palettes:paletteNames?.names.map((nameBytes,i)=>{const offset=paletteNames.dataByteOffset+paletteNames.stride*i;range(offset,4);return{nameBytes,byteOffset:offset,bytes:wordBytes(bytes,offset,4)};})??[]};}
 }else{
  range(objectOffset,8);const firstLetter=bytes[objectOffset],end=view.getUint16(objectOffset+2,true),animation={byteOffset:objectOffset,signatureInitial:firstLetter,signatureEnd:end,headerBytes:wordBytes(bytes,objectOffset,8)};
  if(firstLetter===74&&end===0x4341){range(objectOffset,20);const count=view.getUint16(objectOffset+6,true);range(objectOffset+20,count*2);animation.jointTrackTargetBytes=Array.from({length:count},(_,i)=>{const track=objectOffset+view.getUint16(objectOffset+20+2*i,true);range(track,4);return bytes[track+3];});}
  else if(firstLetter===77&&(end===0x4d41||end===0x5450)){const tracks=names(objectOffset+(end===0x5450?12:8));animation.trackNames=tracks.names;}
  result.animation=animation;
 }
 return result;
}

export function inspectOriginalChrArchive(value){
 const bytes=asBytes(value),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),narc=inspectOriginalNarc(bytes);let at=view.getUint16(12,true),imageOffset=-1;
 for(let i=0;i<view.getUint16(14,true);i++){if(String.fromCharCode(...bytes.subarray(at,at+4))==='GMIF')imageOffset=at+8;at+=view.getUint32(at+4,true);}
 required(imageOffset>=0,'Original CHR has no NARC image');
 const members=narc.members.map(m=>{const result={path:m.path,index:m.index,byteOffset:imageOffset+m.byteOffset,byteLength:m.byteLength,bytes:m.bytes};if(/\.nsb(?:md|ca|ma|ta|tp|va)/.test(m.path))result.nsbxx=inspectOriginalNSBXX(m.bytes);if(m.path.includes('.bcfg'))result.script=decodeOriginalAnimationScript(m.bytes);return result;});
 return{schema:'dq9-original-chr-data-v1',byteLength:bytes.length,members};
}
