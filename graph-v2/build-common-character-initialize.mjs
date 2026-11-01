import {fileURLToPath} from 'node:url';
import {Graph} from './graph-builder.mjs';

/** Allocation-independent stores of the original visual character initializer. */
export function buildCommonCharacterInitialize(){
 const g=new Graph('rom-common-character-initialize',{
  inputContractVersion:1,
  authority:{matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10',originals:{constructor:'JPN02056724 / matching020553ac',initializer:'JPN02056764 / matching020553ec',object:'JPN02034620',auxiliary:'JPN020562f8',signedList:'JPN020b0994'},sources:['src/Combat/Main/func_020553ac.cpp','src/Combat/Main/func_020553ec.cpp','src/Combat/Main/func_02054f80.cpp','src/World/Object3D.cpp','src/NitroSDK/Memory/SignedAllocator.cpp']},
  scope:'Exact496-byte character constructor and pre-archive initializer stores, including the172-byte Object3D and24 signed allocator lists. Unwritten padding, normalized-time fields and partially assigned flag bits are preserved from computed backing memory. This model neither parses nor installs a CHR archive and does not claim a registered model, animation package or completed character registration. The archive producer follows these stores on the same allocated record.',
  defaults:{characterBytes:Array(496).fill(0),resourceIdU16:[0,0],safeAllocatorPointerU16:[0,0],enabled:true},
  inputDomains:{characterBytes:{width:496,min:0,max:255,integer:true},resourceIdU16:{width:2,min:0,max:65535,integer:true},safeAllocatorPointerU16:{width:2,min:0,max:65535,integer:true}}
 });
 const raw=g.split(g.input('characterBytes',['N',496]),496),resource=g.split(g.input('resourceIdU16',['N',2]),2),allocator=g.split(g.input('safeAllocatorPointerU16',['N',2]),2),enabled=g.input('enabled',['N',1],'bool'),next=[...raw],masks=Array(496).fill(0),mod=(v,n)=>g.sub(v,g.mul(g.floor(g.mul(v,1/n)),n));
 const byte=(offset,value,mask=255)=>{next[offset]=g.where(enabled,typeof value==='number'?g.constant(value):value,raw[offset]);masks[offset]|=mask;},short=(offset,value)=>{if(typeof value==='number'){byte(offset,value&255);byte(offset+1,(value>>>8)&255);}else{byte(offset,mod(value,256));byte(offset+1,g.floor(g.mul(value,1/256)));}},word=(offset,value)=>{if(typeof value==='number'){short(offset,value&65535);short(offset+2,(value>>>16)&65535);}else{short(offset,value[0]);short(offset+2,value[1]);}},zero=(offset,length)=>{for(let i=0;i<length;i++)byte(offset+i,0);},o=0x14;
 word(0,resource);word(4,allocator);for(const at of[8,12,16,0x1e8,0x1ec])word(at,0);
 short(o,1);for(const at of[2,4,6])short(o+at,65535);for(const at of[8,12,16,20])word(o+at,0);byte(o+0x18,255);byte(o+0x19,0);word(o+0x1c,0);word(o+0x20,0);zero(o+0x2c,0x10);word(o+0x3c,200);
 byte(o+0x40,g.add(248,g.mul(mod(g.floor(g.mul(raw[o+0x40],.25)),2),4)),251);byte(o+0x41,g.add(31,g.mul(g.floor(g.mul(raw[o+0x41],1/64)),64)),63);byte(o+0x42,0);
 zero(o+0x44,24);for(const at of[0x5c,0x5e,0x60])short(o+at,4096);word(o+0x64,4096);word(o+0x68,4096);word(o+0x6c,0);zero(o+0x70,8);short(o+0x78,65535);short(o+0x7a,65535);short(o+0x7c,4096);short(o+0x7e,4096);short(o+0x80,0);zero(o+0x84,12);short(o+0x90,65535);short(o+0x92,65535);word(o+0x94,0);word(o+0x98,0);short(o+0x9c,0);byte(o+0x9e,0);short(o+0xa0,4096);word(o+0xa4,0);word(o+0xa8,0);
 zero(0xc0,8);for(let i=0;i<24;i++){zero(0xc8+i*12,10);short(0xc8+i*12+10,4);}
 g.output(g.or(enabled,g.not(enabled)),'supported');g.output(enabled,'initializationCompleted');g.output(g.cat(next),'nextCharacterBytes');g.output(g.cat(masks.map(m=>g.where(enabled,m,0))),'writtenMaskBytes');g.output(g.mul(g.cast(enabled,'float32'),0),'consumed');return g;
}

if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildCommonCharacterInitialize().save(),null,2));
