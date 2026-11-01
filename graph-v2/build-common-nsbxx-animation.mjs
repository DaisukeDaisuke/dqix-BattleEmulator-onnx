import {fileURLToPath} from 'node:url';
import {Graph} from './graph-builder.mjs';
import {NSBXX_ANIMATION_CALLBACKS} from '../data/nsbxx-runtime.mjs';
const authority={matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10'};

export function buildCommonNsbxxNameMatch(){
 const g=new Graph('rom-common-nsbxx-name-match',{
  inputContractVersion:1,authority:{...authority,source:'src/NitroSDK/NSBXX/NameList.cpp',original:'JPN020b8ff8'},
  scope:'Exact original short NSBXX dictionary lookup, with count below16. Compares all16 raw name bytes, including bytes after any NUL, and returns the first matching original index. A missing target pointer returns−1. Dictionary count16 or larger requires the separate original Patricia-tree path and is explicitly unsupported.',
  defaults:{nameCount:0,namesBytes:Array(240).fill(0),targetBytes:Array(16).fill(0),targetPresent:true,enabled:true},inputDomains:{nameCount:{width:1,min:0,max:255,integer:true},namesBytes:{width:240,min:0,max:255,integer:true},targetBytes:{width:16,min:0,max:255,integer:true}}
 });
 const count=g.input('nameCount'),names=g.split(g.input('namesBytes',['N',240]),240),target=g.split(g.input('targetBytes',['N',16]),16),present=g.input('targetPresent',['N',1],'bool'),enabled=g.input('enabled',['N',1],'bool'),supported=g.or(g.not(enabled),g.not(present),g.lt(count,16));let index=g.sub(g.mul(count,0),1);
 for(let i=0;i<15;i++){const equal=g.and(g.lt(i,count),...target.map((v,j)=>g.eq(v,names[16*i+j])));index=g.where(g.and(g.lt(index,0),equal),i,index);}
 g.output(supported,'supported');g.output(g.where(g.and(enabled,present,supported),index,-1),'index');g.output(g.mul(count,0),'consumed');return g;
}

export function buildCommonNsbxxAnimation(){
 const g=new Graph('rom-common-nsbxx-animation',{
  inputContractVersion:1,authority:{...authority,sources:['src/NitroSDK/NSBXX/Animation.cpp','src/NitroSDK/NSBXX/JAC.cpp','src/NitroSDK/NSBXX/MAM.cpp','src/NitroSDK/NSBXX/MPT.cpp','src/NitroSDK/NSBXX/MAT.cpp','src/NitroSDK/NSBXX/VAV.cpp'],originals:{JAC:'JPN020b930c',MAM:'JPN020bab80',MPT:'JPN020bb168',MAT:'JPN020bb050',VAV:'JPN020bb3f8'},readonlyCallbacks:'data/nsbxx-runtime.mjs'},
  scope:'Original AnimationData header/entry initialization and individual JAC or material-track stores, through64 entries. JAC uses entries[trackIndex]=targetBone|0x100 exactly as the original, retaining its reversed mapping convention. MAM/MPT/MAT material indices come from the actual NSBXX dictionary lookup; later duplicate tracks overwrite earlier entries. VAV initializes every bone entry to its own index|0x100. All five original callback addresses come from the verified read-only ROM table. Unwritten alignment padding is preserved. Oversized arrays and evaluation of animation samples are separate producers. Supplied pointers are structurally relocated from computed allocations and original archive offsets.',
  operations:{0:'InitializeModelAnimation header and known signature initializer',1:'one JAC track',2:'one matched MAM/MPT/MAT track'},
  defaults:{operation:0,signatureInitial:0,signatureEnd:0,modelBoneCount:0,modelMaterialCount:0,trackIndex:0,targetBone:0,materialIndex:-1,animationBytes:Array(156).fill(0),rawAnimationPointerU16:[0,0],texturePointerU16:[0,0],enabled:true},
  inputDomains:{operation:{width:1,min:0,max:2,integer:true},signatureInitial:{width:1,min:0,max:255,integer:true},signatureEnd:{width:1,min:0,max:65535,integer:true},modelBoneCount:{width:1,min:0,max:255,integer:true},modelMaterialCount:{width:1,min:0,max:255,integer:true},trackIndex:{width:1,min:0,max:255,integer:true},targetBone:{width:1,min:0,max:255,integer:true},materialIndex:{width:1,min:-1,max:255,integer:true},animationBytes:{width:156,min:0,max:255,integer:true},rawAnimationPointerU16:{width:2,min:0,max:65535,integer:true},texturePointerU16:{width:2,min:0,max:65535,integer:true}}
 });
 const op=g.input('operation'),initial=g.input('signatureInitial'),end=g.input('signatureEnd'),bones=g.input('modelBoneCount'),materials=g.input('modelMaterialCount'),track=g.input('trackIndex'),target=g.input('targetBone'),materialIndex=g.input('materialIndex'),raw=g.split(g.input('animationBytes',['N',156]),156),pointer=g.split(g.input('rawAnimationPointerU16',['N',2]),2),texture=g.split(g.input('texturePointerU16',['N',2]),2),enabled=g.input('enabled',['N',1],'bool'),zero=g.mul(op,0),mod=(v,n)=>g.sub(v,g.mul(g.floor(g.mul(v,1/n)),n)),jac=g.and(g.eq(initial,74),g.eq(end,0x4341)),mam=g.and(g.eq(initial,77),g.eq(end,0x4d41)),mpt=g.and(g.eq(initial,77),g.eq(end,0x5450)),mat=g.and(g.eq(initial,77),g.eq(end,0x5441)),vav=g.and(g.eq(initial,86),g.eq(end,0x5641)),material=g.or(mam,mpt,mat),known=g.or(jac,material,vav),entries=g.where(g.or(jac,vav),bones,g.where(material,materials,0)),qualified=g.and(g.or(g.not(g.eq(op,0)),g.le(entries,64)),g.or(g.not(g.eq(op,1)),g.and(jac,g.lt(track,64),g.lt(track,bones))),g.or(g.not(g.eq(op,2)),g.and(material,g.lt(materialIndex,64),g.lt(materialIndex,materials)))),active=g.and(enabled,qualified),reset=g.and(active,g.eq(op,0)),next=[...raw],mask=raw.map(()=>zero),callback=g.where(jac,NSBXX_ANIMATION_CALLBACKS.JAC&65535,g.where(mam,NSBXX_ANIMATION_CALLBACKS.MAM&65535,g.where(mpt,NSBXX_ANIMATION_CALLBACKS.MPT&65535,g.where(mat,NSBXX_ANIMATION_CALLBACKS.MAT&65535,g.where(vav,NSBXX_ANIMATION_CALLBACKS.VAV&65535,0))))),callbackHigh=g.where(known,NSBXX_ANIMATION_CALLBACKS.JAC>>>16,0);
 function byte(at,value,condition=reset){next[at]=g.where(condition,value,next[at]);mask[at]=g.where(condition,255,mask[at]);}
 function half(at,value,condition=reset){byte(at,mod(value,256),condition);byte(at+1,g.floor(g.mul(mod(value,65536),1/256)),condition);}
 function pair(at,value,condition=reset){half(at,value[0],condition);half(at+2,value[1],condition);}
 pair(0,[zero,zero]);pair(4,[g.add(zero,4096),zero]);pair(8,pointer);pair(12,[callback,callbackHigh]);pair(16,[zero,zero]);pair(20,texture);byte(24,127);byte(25,entries);
 for(let i=0;i<64;i++){half(26+i*2,g.where(vav,i+256,zero),g.and(reset,g.lt(i,entries)));const joint=g.and(active,g.eq(op,1),g.eq(track,i)),matched=g.and(active,g.eq(op,2),g.eq(materialIndex,i));half(26+i*2,g.add(target,256),joint);half(26+i*2,g.add(track,256),matched);}
 g.output(g.or(g.not(enabled),qualified),'supported');g.output(g.cat(next),'nextAnimationBytes');g.output(g.cat(mask),'writtenMaskBytes');g.output(entries,'entryCount');g.output(zero,'consumed');return g;
}

if(process.argv[1]===fileURLToPath(import.meta.url))for(const build of[buildCommonNsbxxNameMatch,buildCommonNsbxxAnimation])console.log(JSON.stringify(await build().save(),null,2));
