// Read-only local ROM input. No game bytes are embedded in the published source.
// Archive decoding follows ExtendedNitroVM.cpp and NitroSDK DecompressA/B at
// matching revision e0d1df250bfc554efe2fd37513a4ad3867a77b10. The four static
// tables were independently compared with original ARM decompression.
const requireData=(condition,message)=>{if(!condition)throw Error(message);};
const asBytes=value=>value instanceof Uint8Array?value:new Uint8Array(value);
const view=bytes=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
const text=bytes=>String.fromCharCode(...bytes);
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const sha256=async bytes=>hex(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes)));
const EXPECTED={
  'data/prm/actmsg.nat':'52b3fded05879bebd6aca9fd5eca20c1c58987428e3f26dea1c1e216508474a6',
  'data/pack_lv5/font_lv5.gp2':'dd757e99a446cc01cb34c4c83891d79117afc55c7da5b916201b9ef80587dc25',
  'data/skill/actetc.nsarc':'1091841c87b293afdd12161cb4fef030998c498f9e9c781db973cb837f14242f',
  'data/skill/actskl.nsarc':'ac80a0c439ac5c905779e8ca95d42e8f644e3edcfbbe31bc08a6cde577195208',
  'data/skill/actspl.nsarc':'d983157f4e663c574ae8deef0861e63477b1bb060be714b5f55a2db95ddf9930',
  'f6.mes':'95f275d1656caf7f98cdad640823b65ab0ee81947ddbedd1761f9764d30457bb',
  'f8.mes':'1442225eb4a805fa8386467fa91af47840b39eba6307ab10fad1b8ba8b43e255',
  'f10.mes':'4ab76fce075e0470b301230fd77b12992e6304793808695e556b6aa046ee52d4',
  'f12.mes':'e26edf5be178c41946c8b4cb06a23e898d15f371ecb8a0297c47035d65824b8c'
};

export function decompressOriginalArchiveBlock(value,{maxBytes=16*1024*1024}={}){
  const bytes=asBytes(value);requireData(bytes.length>=4,'Compressed block has no complete header');
  const prefix=view(bytes).getUint32(0,true),type=prefix&7,length=prefix>>>3;
  requireData(length<=maxBytes,'Compressed block exceeds the explicit size limit');
  const out=new Uint8Array(length);let at=4,done=0;
  if(type===0){requireData(at+length<=bytes.length,'Truncated uncompressed block');out.set(bytes.subarray(at,at+length));return out;}
  if(type===1){while(done<length){requireData(at<bytes.length,'Truncated LZ flags');const flags=bytes[at++];for(let bit=7;bit>=0&&done<length;bit--){if(flags&(1<<bit)){requireData(at+2<=bytes.length,'Truncated LZ match');const first=bytes[at++],second=bytes[at++],count=(first>>>4)+3,distance=((first&15)<<8|second)+1;requireData(done>=distance&&done+count<=length,'Invalid LZ span');for(let i=0;i<count;i++){out[done]=out[done-distance];done++;}}else{requireData(at<bytes.length,'Truncated LZ literal');out[done++]=bytes[at++];}}}return out;}
  if(type===2||type===3){requireData(at<bytes.length,'Missing Huffman tree');const bits=1<<type,treeLength=(bytes[at]+1)*2;requireData(at+treeLength<=bytes.length,'Truncated Huffman tree');const tree=bytes.subarray(at,at+treeLength);at+=treeLength;let node=1,word=0,left=0,symbols=0,packed=0;while(done<length){if(left===0){requireData(at+4<=bytes.length,'Truncated Huffman word');word=view(bytes).getUint32(at,true);at+=4;left=32;}const branch=word>>>31,value=tree[node];requireData(value!==undefined,'Invalid Huffman tree index');word=(word<<1)>>>0;left--;node=(node&~1)+((value&63)+1)*2+branch;if(value&(branch?64:128)){const symbol=tree[node];requireData(symbol!==undefined&&symbol<(1<<bits),'Invalid Huffman symbol');packed|=symbol<<(symbols*bits);symbols++;node=1;if(symbols*bits>=8){out[done++]=packed;symbols=0;packed=0;}}}return out;}
  if(type===4){while(done<length){requireData(at<bytes.length,'Truncated RLE control');const control=bytes[at++],count=(control&127)+((control&128)?3:1);requireData(done+count<=length,'Invalid RLE span');if(control&128){requireData(at<bytes.length,'Truncated RLE fill');out.fill(bytes[at++],done,done+count);}else{requireData(at+count<=bytes.length,'Truncated RLE literal');out.set(bytes.subarray(at,at+count),done);at+=count;}done+=count;}return out;}
  throw Error('Unsupported original archive compression type '+type);
}

export function originalFilenameCRC32(name){
  let crc=0xffffffff;for(const char of name){const byte=char.charCodeAt(0);requireData(byte<128,'Archive names must be ASCII');crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;
}

export function readOriginalArchiveMember(value,name){
  const bytes=asBytes(value),data=view(bytes);requireData(bytes.length>=16&&text(bytes.subarray(0,4))==='GPC2','Expected an original GPC2 archive');
  const count=data.getUint16(4,true)&4095,infoOffset=data.getUint16(6,true)*4,infoEnd=data.getUint16(8,true)*4,dataOffset=data.getUint16(10,true)*4;
  requireData(infoOffset>=12&&infoOffset<=infoEnd&&infoEnd<=dataOffset&&dataOffset<=bytes.length,'Invalid GPC2 index bounds');
  const info=decompressOriginalArchiveBlock(bytes.subarray(infoOffset,infoEnd)),index=view(info),crc=originalFilenameCRC32(name);
  requireData(info.length===count*12,'Invalid GPC2 decoded index length');
  for(let i=0;i<count;i++)if(index.getUint32(i*12,true)===crc){const start=dataOffset+(index.getUint32(i*12+4,true)&0xffffff)*4,length=index.getUint32(i*12+8,true)&0xffffff;requireData(start>=dataOffset&&start+length<=bytes.length,'GPC2 member exceeds the archive');return decompressOriginalArchiveBlock(bytes.subarray(start,start+length));}
  throw Error('Original archive member is absent: '+name);
}

function nitroFileIds(bytes){
  const data=view(bytes);requireData(bytes.length>=8,'Missing NitroFS root directory');const count=data.getUint16(6,true);
  requireData(count>0&&count<=4096&&count*8<=bytes.length,'Invalid NitroFS directory table');
  const visited=new Set(),found=new Map();
  function visit(id,prefix){requireData(id>=0&&id<count&&!visited.has(id),'Invalid or repeated NitroFS directory');visited.add(id);let cursor=data.getUint32(id*8,true),fileId=data.getUint16(id*8+4,true);requireData(cursor>=count*8&&cursor<bytes.length,'Invalid NitroFS name table');
    while(true){requireData(cursor<bytes.length,'Truncated NitroFS directory');const entry=bytes[cursor++];if(entry===0)return;const size=entry&127;requireData(size>0&&cursor+size<=bytes.length,'Invalid NitroFS entry name');const name=text(bytes.subarray(cursor,cursor+size));cursor+=size;requireData(!name.includes('/')&&!name.includes('\0')&&name!=='.'&&name!=='..','Invalid NitroFS path component');const path=prefix+name;if(entry&128){requireData(cursor+2<=bytes.length,'Truncated NitroFS child directory');const child=data.getUint16(cursor,true);cursor+=2;requireData((child&0xf000)===0xf000,'Invalid NitroFS child ID');visit(child&4095,path+'/');}else{requireData(!found.has(path),'Duplicate NitroFS file path');found.set(path,fileId);fileId++;}}
  }visit(0,'');return found;
}

/** Original NARC filename/index lookup, matching FileIO.cpp GetFileInNarc.
 * This parses the supplied archive; it does not create an animation program. */
export function inspectOriginalNarc(value){
  const bytes=asBytes(value),data=view(bytes);
  requireData(bytes.length>=16&&text(bytes.subarray(0,4))==='NARC','Expected an original NARC archive');
  const length=data.getUint32(8,true),headerSize=data.getUint16(12,true),count=data.getUint16(14,true);
  requireData(data.getUint16(4,true)===0xfffe&&headerSize>=16&&headerSize<=length&&length<=bytes.length&&count>0,'Invalid NARC header');
  const sections=new Map();let cursor=headerSize;
  for(let i=0;i<count;i++){
    requireData(cursor+8<=length,'Truncated NARC section header');const tag=text(bytes.subarray(cursor,cursor+4)),size=data.getUint32(cursor+4,true);
    requireData(size>=8&&cursor+size<=length&&!sections.has(tag),'Invalid or repeated NARC section');sections.set(tag,bytes.subarray(cursor+8,cursor+size));cursor+=size;
  }
  requireData(cursor===length&&sections.has('BTAF')&&sections.has('BTNF')&&sections.has('GMIF'),'NARC index/data sections are incomplete');
  const fat=sections.get('BTAF'),names=nitroFileIds(sections.get('BTNF')),image=sections.get('GMIF');requireData(fat.length>=4,'Truncated NARC FAT');
  const table=view(fat),files=table.getUint16(0,true);requireData(4+files*8<=fat.length,'Invalid NARC FAT count');
  const result=[];
  for(const [path,index]of names){requireData(index<files,'NARC filename index exceeds FAT');const start=table.getUint32(4+index*8,true),end=table.getUint32(8+index*8,true);requireData(start<=end&&end<=image.length,'NARC member exceeds file image');result.push({path,index,byteOffset:start,byteLength:end-start,bytes:image.slice(start,end)});}
  return{fileCount:files,fatStartOffsets:Array.from({length:files},(_,i)=>table.getUint32(4+i*8,true)),members:result.sort((a,b)=>a.index-b.index)};
}

export function listOriginalNarcMembers(value){return inspectOriginalNarc(value).members;}

export function readOriginalNarcMember(value,name,{firstFileIndex=0}={}){
  requireData(typeof name==='string'&&Number.isInteger(firstFileIndex)&&firstFileIndex>=0,'An exact NARC member name/index is required');
  return listOriginalNarcMembers(value).find(file=>file.index>=firstFileIndex&&file.path===name)??null;
}

/** Accept a local File/Blob or Uint8Array. Only the header, FNT, FAT and two
 * required asset ranges are read. Optional animation archives are input data,
 * not proof that every animation instruction is implemented. */
export async function extractCommonPresentationAssets(input,{includeAnimationArchives=false}={}){
  const isBlob=typeof input?.slice==='function'&&typeof input?.arrayBuffer==='function',source=isBlob?input:asBytes(input),size=isBlob?source.size:source.byteLength;
  requireData(Number.isSafeInteger(size)&&size>=0x200,'A complete local NDS ROM is required');
  const read=async(offset,length)=>{requireData(Number.isSafeInteger(offset)&&Number.isSafeInteger(length)&&offset>=0&&length>=0&&offset+length<=size,'ROM read exceeds supplied file');return isBlob?new Uint8Array(await source.slice(offset,offset+length).arrayBuffer()):source.slice(offset,offset+length);};
  const header=await read(0,0x200),hd=view(header),gameCode=text(header.subarray(12,16));requireData(gameCode==='YDQJ','The currently proved presentation assets require the Japanese YDQJ ROM');
  const fntOffset=hd.getUint32(0x40,true),fntLength=hd.getUint32(0x44,true),fatOffset=hd.getUint32(0x48,true),fatLength=hd.getUint32(0x4c,true);requireData(fntLength>0&&fntLength<=4*1024*1024&&fatLength%8===0,'Invalid NDS filesystem header');
  const paths=['data/prm/actmsg.nat','data/pack_lv5/font_lv5.gp2',...(includeAnimationArchives?['data/skill/actetc.nsarc','data/skill/actskl.nsarc','data/skill/actspl.nsarc']:[])],ids=nitroFileIds(await read(fntOffset,fntLength)),files=new Map(),manifest={schema:'dq9-local-presentation-assets-v1',gameCode,romByteLength:size,matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10',files:[]};
  for(const path of paths){requireData(ids.has(path),'Required ROM asset is missing: '+path);const id=ids.get(path);requireData(id*8+8<=fatLength,'NitroFS file ID exceeds FAT');const entry=view(await read(fatOffset+id*8,8)),start=entry.getUint32(0,true),end=entry.getUint32(4,true);requireData(end>=start&&end-start<=16*1024*1024,'Invalid asset size in FAT');const bytes=await read(start,end-start),digest=await sha256(bytes);requireData(digest===EXPECTED[path],'ROM asset differs from the original independently verified data: '+path);files.set(path,bytes);manifest.files.push({path,fatId:id,byteLength:bytes.length,sha256:digest});}
  const fontTables=[];for(const size of [6,8,10,12]){const name='f'+size+'.mes',bytes=readOriginalArchiveMember(files.get(paths[1]),name),digest=await sha256(bytes);requireData(digest===EXPECTED[name],'Decoded font differs from original ARM evidence: '+name);fontTables.push({name,size,hex:hex(bytes)});manifest.files.push({path:paths[1]+'/'+name,byteLength:bytes.length,sha256:digest});}
  const assets={};for(const [path,bytes]of files)if(path!==paths[1])assets[path.slice(path.lastIndexOf('/')+1)]={hex:hex(bytes),byteLength:bytes.length};
  return{assets,fontTables,assetManifest:manifest};
}
