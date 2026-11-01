#!/usr/bin/env node
// Development-only extraction. Published execution imports the resulting
// metadata module; it never opens a ROM or decodes a resource archive.
import {open,readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {inspectOriginalNarc} from '../runtime/common-rom-assets.mjs';
import {cameraProgramMetadata as metadata} from './camera-program-metadata.mjs';

const args=process.argv.slice(2),option=k=>{const i=args.indexOf(k);return i<0?undefined:args[i+1];},hash=b=>createHash('sha256').update(b).digest('hex');
const romPath=option('--rom'),output=option('--out');
if(!romPath||!output)throw Error('Development use: --rom original.nds --out data/common-camera-program-data.mjs [--proof-input request.json]');
const rom=await open(romPath,'r');
async function read(at,length){const b=Buffer.alloc(length),r=await rom.read(b,0,length,at);if(r.bytesRead!==length)throw Error('Short original file read');return b;}
try{
 const header=await read(0,512);if(header.toString('ascii',12,16)!=='YDQJ')throw Error('Expected original YDQJ image');
 const romSHA256=hash(await readFile(romPath));if(romSHA256!=='b7a7f82f9da6f5bd08b5ae436d67cbde020f15e79534e0d34853201cd24d775d')throw Error('Original ROM identity differs');
 const fnt=await read(header.readUInt32LE(0x40),header.readUInt32LE(0x44)),fat=await read(header.readUInt32LE(0x48),header.readUInt32LE(0x4c)),files=[];
 function visit(id,prefix){let at=fnt.readUInt32LE(id*8),index=fnt.readUInt16LE(id*8+4);while(fnt[at]){const flags=fnt[at++],n=flags&127,name=fnt.toString('ascii',at,at+n);at+=n;if(flags&128){const child=fnt.readUInt16LE(at)&4095;at+=2;visit(child,prefix+name+'/');}else{files.push({path:prefix+name,index,start:fat.readUInt32LE(index*8),end:fat.readUInt32LE(index*8+4)});index++;}}}
 visit(0,'');const archives=[],cases=[];
 for(const name of ['data/bin/actdef.nsarc','data/skill/actetc.nsarc','data/skill/actskl.nsarc','data/skill/actspl.nsarc','data/bin/defaultaction.bact']){
  const file=files.find(f=>f.path===name);if(!file)throw Error('Missing original definition '+name);
  const bytes=await read(file.start,file.end-file.start),members=name.endsWith('.nsarc')?inspectOriginalNarc(bytes).members:[{path:'defaultaction.bact',bytes}];
  const entry={path:name,sha256:hash(bytes),byteLength:bytes.length,members:[]};
  for(const member of members){
   const parsed=metadata(member.bytes),data={path:member.path,sha256:hash(member.bytes),byteLength:member.bytes.length,...parsed};entry.members.push(data);
   cases.push({id:name+'/'+member.path,bytesHex:Buffer.from(member.bytes).toString('hex'),sha256:data.sha256});
  }
  archives.push(entry);
 }
 const value={schema:'dq9-common-camera-program-data-v1',romSHA256,matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10',
  scope:'Original shared BACT action memberships and selector-relevant linked nodes only. This is static definition data, never recorded battle outputs or a precomputed camera decision. Actor-specific resident programs remain distinct initial data.',
  relevantOpcodes:[7,12,32,34,61],archives};
 const text='// Generated from original definition data by scripts/extract-camera-program-data.mjs.\n// No executable ROM, drawing assets or observed battle state is included.\nexport const COMMON_CAMERA_PROGRAM_DATA='+JSON.stringify(value)+';\n';
 await mkdir(dirname(resolve(output)),{recursive:true});await writeFile(output,text);
 if(option('--proof-input')){await mkdir(dirname(resolve(option('--proof-input'))),{recursive:true});await writeFile(option('--proof-input'),JSON.stringify({schema:'dq9-camera-program-metadata-original-input-v1',initialInputsOnly:true,romSHA256,cases})+'\n');}
 console.log(JSON.stringify({files:cases.length,programs:archives.reduce((n,a)=>n+a.members.reduce((n,m)=>n+m.programs.length,0),0),bytes:Buffer.byteLength(text),sha256:hash(text)}));
}finally{await rom.close();}
