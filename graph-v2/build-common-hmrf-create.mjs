import {fileURLToPath} from 'node:url';
import {Graph} from './graph-builder.mjs';

export function buildCommonHmrfCreate(){
 const g=new Graph('rom-common-hmrf-create',{
  inputContractVersion:1,
  authority:{matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10',sources:['src/Memory/SafeAllocator.cpp','src/NitroSDK/Memory/HMRFAllocator.cpp'],originals:{safeCreateTypeA:'JPN02032028',hmrfCreateAtLocation:'JPN020b1440',hmrfCreateInRegion:'JPN020b1304'}},
  scope:'Initial HMRF TypeA arena layout from the explicitly supplied region start/capacity. The original aligns its start upward and end downward to4bytes, requires at least48 header bytes, and initializes front=header+48,back=end,newest=NULL,clearFlags=0. Too-small or unsigned-wrapped ranges yield a null signed-allocator pointer. Only this layout projection is represented; global allocator tree links/live count and backing bytes are retained by their distinct producers. No observed allocation endpoint is an input.',
  defaults:{regionStartU16:[0,0],regionSizeU16:[0,0],enabled:true},inputDomains:{regionStartU16:{width:2,min:0,max:65535,integer:true},regionSizeU16:{width:2,min:0,max:65535,integer:true}}
 });
 const start=g.split(g.input('regionStartU16',['N',2]),2),size=g.split(g.input('regionSizeU16',['N',2]),2),enabled=g.input('enabled',['N',1],'bool'),mod=(x,n)=>g.sub(x,g.mul(g.floor(g.mul(x,1/n)),n)),add=(a,b)=>{const low=g.add(a[0],b[0]);return[mod(low,65536),mod(g.add(g.add(a[1],b[1]),g.floor(g.mul(low,1/65536))),65536)];},sub=(a,b)=>{const low=g.sub(a[0],b[0]);return[mod(low,65536),mod(g.add(g.sub(a[1],b[1]),g.floor(g.mul(low,1/65536))),65536)];},down=a=>[g.sub(a[0],mod(a[0],4)),a[1]],begin=down(add(start,[g.constant(3),g.constant(0)])),end=down(add(start,size)),span=sub(end,begin),ordered=g.or(g.lt(begin[1],end[1]),g.and(g.eq(begin[1],end[1]),g.le(begin[0],end[0]))),enough=g.or(g.gt(span[1],0),g.ge(span[0],48)),supported=g.or(g.not(enabled),g.gt(start[1],0),g.ge(start[0],4096)),created=g.and(enabled,supported,ordered,enough),allocationBegin=add(begin,[g.constant(48),g.constant(0)]),zero=g.mul(start[0],0),emit=(name,a)=>g.output(g.cat(a.map(v=>g.where(created,v,zero))),name);
 g.output(supported,'supported');g.output(g.and(enabled,supported),'operationCompleted');g.output(created,'initialized');emit('signedAllocatorPointerU16',begin);emit('heapBeginU16',allocationBegin);emit('heapEndU16',end);emit('frontU16',allocationBegin);emit('backU16',end);g.output(g.cat([zero,zero]),'newestStateU16');g.output(zero,'clearFlagsLow16');g.output(zero,'consumed');return g;
}

if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildCommonHmrfCreate().save(),null,2));
