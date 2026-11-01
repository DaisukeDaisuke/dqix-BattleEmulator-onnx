import {fileURLToPath} from 'node:url';
import {Graph} from './graph-builder.mjs';

/** Type1 CCHR/CMOT package, reference and owner stores. Original archive lookup,
 * BCFG execution and live allocations are separately shared producers. */
export function buildCommonCchrRecords(){
  const pointers=['packagePointerU16','allocationPointerU16','rawFilePointerU16','ownerHeadU16','ownerNodePointerU16'];
  const buffers={package:44,reference:8,animation:16,object:172,owner:12,tail:44};
  const g=new Graph('rom-common-cchr-records',{
    inputContractVersion:1,
    authority:{sources:['src/World/Object3D.cpp','src/Graphics/Animation3D.cpp','src/Resource/BCFG.cpp','src/Combat/Overlay_25/func_ov025_021eb46c.cpp','src/Combat/Overlay_25/func_ov025_021e8bac.cpp'],originals:{load:'JPN02036260',packageReset:'JPN02035ddc',listAppend:'JPN02037260',actorPrecheck:'JPN021eb8f4'}},
    scope:'Exact type1 package flags and pointer stores, actual BCFG-count allocation requests, per-record reference initialization, compact animation-array lengths and Animation3D defaults/raw pointers, original list append and12-byte actor owner-node append. Existing object model/animation-data production is an explicit separate request. Unknown padding is retained. A package may be linked even when CreateData returned false for a null object model; no visual animation or complete rendering is inferred.',
    operations:{0:'request44-byte package',1:'package allocation returned and Reset/type1/id stores',2:'request8*actual BCFG count references',3:'reference allocation returned',4:'initialize reference and resolve BCFG record',5:'request16*actual matched files',6:'animation-array allocation returned',7:'initialize one Animation3D/raw file',8:'append package to actual object list tail',9:'append actor resource owner',10:'request172-byte SetModelFromFile allocation',11:'store returned object model pointer including null',12:'filename-cache admission and original sequential-search fallback'},
    defaults:{operation:0,packageId:0,allocatorIndex:0,actorId:0,referenceIndex:0,animationIndex:0,archiveFileCount:0,maximumFilePathBytes:0,hasAllIndexedFilePaths:true,matchingFiles:[false,false,false,false],...Object.fromEntries(pointers.map(k=>[k,[0,0]])),...Object.fromEntries(Object.entries(buffers).map(([k,n])=>[k+'Bytes',Array(n).fill(0)])),enabled:true},
    inputDomains:{operation:{width:1,min:0,max:12,integer:true},archiveFileCount:{width:1,min:0,max:65535,integer:true},maximumFilePathBytes:{width:1,min:0,max:65535,integer:true},packageId:{width:1,min:0,max:65535,integer:true},allocatorIndex:{width:1,min:0,max:255,integer:true},actorId:{width:1,min:0,max:65535,integer:true},referenceIndex:{width:1,min:0,max:65535,integer:true},animationIndex:{width:1,min:0,max:3,integer:true},...Object.fromEntries(pointers.map(k=>[k,{width:2,min:0,max:65535,integer:true}])),...Object.fromEntries(Object.entries(buffers).map(([k,n])=>[k+'Bytes',{width:n,min:0,max:255,integer:true}]))}
  });
  const op=g.input('operation'),id=g.input('packageId'),allocatorIndex=g.input('allocatorIndex'),actorId=g.input('actorId'),index=g.input('referenceIndex'),animationIndex=g.input('animationIndex'),enabled=g.input('enabled',['N',1],'bool');
  const fileCount=g.input('archiveFileCount'),pathLength=g.input('maximumFilePathBytes'),allFilePaths=g.input('hasAllIndexedFilePaths',['N',1],'bool');
  const p=Object.fromEntries(pointers.map(k=>[k,g.split(g.input(k,['N',2]),2)])),input=Object.fromEntries(Object.entries(buffers).map(([k,n])=>[k,g.split(g.input(k+'Bytes',['N',n]),n)])),matches=g.split(g.input('matchingFiles',['N',4],'bool'),4);
  const zero=g.mul(op,0),mod=(x,n)=>g.sub(x,g.mul(g.floor(g.mul(x,1/n)),n)),nonzero=x=>g.or(g.gt(x[0],0),g.gt(x[1],0));
  const half=(x,at)=>g.add(x[at],g.mul(x[at+1],256)),pair=(x,at)=>[half(x,at),half(x,at+2)],toPair=x=>[mod(x,65536),mod(g.floor(g.mul(x,1/65536)),65536)];
  const add=(a,b)=>{const lo=g.add(a[0],b[0]);return[mod(lo,65536),mod(g.add(g.add(a[1],b[1]),g.floor(g.mul(lo,1/65536))),65536)];};
  const stage=n=>g.and(enabled,g.eq(op,n)),allocated=nonzero(p.allocationPointerU16),count=half(input.package,8),matched=matches.reduce((sum,v)=>g.add(sum,g.cast(v,'float32')),zero),validRecord=g.lt(index,count),objectHead=pair(input.object,12),emptyList=g.not(nonzero(objectHead));
  const next=Object.fromEntries(Object.entries(input).map(([k,v])=>[k,[...v]])),masks=Object.fromEntries(Object.entries(input).map(([k,v])=>[k,v.map(()=>zero)]));
  function byte(k,at,v,condition){next[k][at]=g.where(condition,typeof v==='number'?g.add(zero,v):v,next[k][at]);masks[k][at]=g.where(condition,255,masks[k][at]);}
  function putHalf(k,at,v,condition){byte(k,at,mod(v,256),condition);byte(k,at+1,g.floor(g.mul(mod(v,65536),1/256)),condition);}
  function putPointer(k,at,v,condition){putHalf(k,at,v[0],condition);putHalf(k,at+2,v[1],condition);}
  const reset=g.and(stage(1),allocated),idByte=mod(id,256);
  byte('package',0,g.add(1,mod(g.mul(idByte,2),256)),reset);
  byte('package',1,g.add(g.mul(g.floor(g.mul(input.package[1],.5)),2),g.floor(g.mul(idByte,1/128))),reset);
  putPointer('package',36,[zero,zero],reset);putPointer('package',40,[zero,zero],reset);
  putPointer('package',36,p.allocationPointerU16,stage(3));
  for(let i=0;i<8;i++)byte('reference',i,0,g.and(stage(4),validRecord));
  const group=g.and(stage(6),allocated);putPointer('reference',0,[matched,zero],group);putPointer('reference',4,p.allocationPointerU16,group);
  for(let i=0;i<16;i++)byte('animation',i,i===9?16:0,stage(7));putPointer('animation',0,p.rawFilePointerU16,stage(7));
  putPointer('object',12,p.packagePointerU16,g.and(stage(8),emptyList));putPointer('tail',40,p.packagePointerU16,g.and(stage(8),g.not(emptyList)));putPointer('package',40,[zero,zero],stage(8));
  byte('owner',0,0,stage(9));byte('owner',1,allocatorIndex,stage(9));putHalf('owner',2,actorId,stage(9));putHalf('owner',4,id,stage(9));putPointer('owner',8,p.ownerHeadU16,stage(9));
  putPointer('object',8,p.allocationPointerU16,stage(11));
  const request=g.or(stage(0),stage(2),g.and(stage(5),g.gt(matched,0)),stage(10)),size=g.where(stage(0),44,g.where(stage(2),g.mul(count,8),g.where(stage(5),g.mul(matched,16),g.where(stage(10),172,0))));
  // The original80-entry checksum cache admits at most80 indexed names. Its
  // invalidation on the81st file selects GetFileInNarc, whose final strcmp is
  // the same first exact match. ARC:/ plus the terminating NUL must fit80 bytes;
  // truncated/unmapped paths need their actual stack-path producer instead.
  const filenameLookupFits=g.and(allFilePaths,g.lt(g.add(pathLength,5),80));
  const outputs={supported:g.or(g.not(enabled),g.and(g.ge(op,0),g.le(op,12))),filenameLookupFits,useChecksumLookup:g.and(stage(12),filenameLookupFits,g.le(fileCount,80)),requiresSequentialFileLookup:g.and(stage(12),filenameLookupFits,g.gt(fileCount,80)),requestAllocation:request,requestBytesU16:g.cat(toPair(size)),allocationFailed:g.and(g.or(stage(1),stage(3),stage(11)),g.not(allocated)),requiresModelFile:g.and(stage(11),allocated),animationCount:count,matchedCount:matched,recordValid:validRecord,referencePointerU16:g.cat(add(pair(input.package,36),toPair(g.mul(index,8)))),recordPointerU16:g.cat(add(pair(input.package,4),toPair(g.mul(index,36)))),animationPointerU16:g.cat(add(pair(input.reference,4),toPair(g.mul(animationIndex,16)))),requiresModelAnimationData:g.and(stage(7),nonzero(p.rawFilePointerU16),nonzero(pair(input.object,8))),writePriorTail:g.and(stage(8),g.not(emptyList)),nextOwnerHeadU16:g.cat(p.ownerHeadU16.map((v,i)=>g.where(stage(9),p.ownerNodePointerU16[i],v))),consumed:zero};
  for(const[name,value]of Object.entries(outputs))g.output(value,name);
  for(const k of Object.keys(buffers)){const cap=k[0].toUpperCase()+k.slice(1);g.output(g.cat(next[k]),'next'+cap+'Bytes');g.output(g.cat(masks[k]),k+'WrittenMaskBytes');}
  return g;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const r=await buildCommonCchrRecords().save();console.log(JSON.stringify({name:r.name,nodes:r.nodes,bytes:r.bytes}));}
