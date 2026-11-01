import {fileURLToPath} from 'node:url';
import {Graph} from './graph-builder.mjs';

export function buildCommonChrAllocation(){
 const g=new Graph('rom-common-chr-allocation',{
  inputContractVersion:1,authority:{matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10',sources:['src/World/Object3D.cpp','src/Graphics/Animation3D.cpp','src/NitroSDK/Main/func_020b2a6c.cpp','src/Resource/BCFG.cpp'],originals:{chr:'JPN02035e6c',animationBytes:'JPN020b4538',animationAllocate:'JPN020b8964'}},
  scope:'Original shared CHR allocation request leaves. Model172, type0 package44, reference8 and four Animation3D records64 are exact class sizes. AnimationData size is computed from the raw inner signature and the actual model header bytes17/18, including the original align-down expression. BCFG array lengths multiply raw32-bit counts modulo2^32; string allocation adds one terminator. All returned pointers must come from the shared live HMRF transition. This model neither infers successful parsing from allocations nor accepts observed allocation lengths.',
  operations:{0:'Model3D',1:'type0 AnimationPackage',2:'type0 reference',3:'four Animation3D records',4:'AnimationData',5:'BCFG animation records',6:'BCFG sizeC/alt records',7:'BCFG root string'},
  defaults:{operation:0,modelHeaderBytes:Array(26).fill(0),rawAnimationPresent:false,internalModelPresent:false,signatureInitial:0,countOrLengthU16:[0,0],enabled:true},
  inputDomains:{operation:{width:1,min:0,max:7,integer:true},modelHeaderBytes:{width:26,min:0,max:255,integer:true},signatureInitial:{width:1,min:0,max:255,integer:true},countOrLengthU16:{width:2,min:0,max:65535,integer:true}}
 });
 const op=g.input('operation'),raw=g.split(g.input('modelHeaderBytes',['N',26]),26),signature=g.input('signatureInitial'),count=g.split(g.input('countOrLengthU16',['N',2]),2),present=g.and(g.input('rawAnimationPresent',['N',1],'bool'),g.input('internalModelPresent',['N',1],'bool')),enabled=g.input('enabled',['N',1],'bool'),zero=g.mul(op,0),mod=(v,n)=>g.sub(v,g.mul(g.floor(g.mul(v,1/n)),n)),multiply=n=>{const low=g.mul(count[0],n);return[mod(low,65536),mod(g.add(g.mul(count[1],n),g.floor(g.mul(low,1/65536))),65536)];},array36=multiply(36),array12=multiply(12),stringLow=g.add(count[0],1),string=[mod(stringLow,65536),mod(g.add(count[1],g.floor(g.mul(stringLow,1/65536))),65536)],material=g.eq(signature,77),joint=g.or(g.eq(signature,74),g.eq(signature,86)),entries=g.where(material,raw[24],raw[23]),animationBytes=g.where(g.and(present,g.or(material,joint)),g.mul(g.floor(g.mul(g.add(g.mul(entries,2),28),.25)),4),0);
 let size=[zero,zero];for(const[code,n]of[[0,172],[1,44],[2,8],[3,64]])size[0]=g.where(g.eq(op,code),n,size[0]);size[0]=g.where(g.eq(op,4),animationBytes,size[0]);for(const[code,v]of[[5,array36],[6,array12],[7,string]])size=size.map((x,i)=>g.where(g.eq(op,code),v[i],x));
 g.output(g.or(g.not(enabled),g.and(g.ge(op,0),g.le(op,7))),'supported');g.output(enabled,'requestAllocation');g.output(g.cat(size.map(v=>g.where(enabled,v,zero))),'requestBytesU16');g.output(g.and(enabled,g.eq(op,4)),'allocatorUnionCall');g.output(g.where(g.and(present,g.or(material,joint)),entries,0),'animationEntryCount');g.output(zero,'consumed');return g;
}

if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildCommonChrAllocation().save(),null,2));
