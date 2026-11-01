import {fileURLToPath} from 'node:url';
import {Graph} from './graph-builder.mjs';

/** Animation3D::CreateData admission and its final pointer store. Archive
 * decoding, allocation and NSBXX initialization remain shared producers. */
export function buildCommonAnimation3DData(){
  const g=new Graph('rom-common-animation3d-data',{
    inputContractVersion:1,
    authority:{sources:['src/Graphics/Animation3D.cpp','src/Graphics/Model3D.cpp'],originals:{modelTexture:'JPN0207fa44'}},
    scope:'Exact original CreateData early returns from raw-file, attached-model, allocator, model-valid-bit, internal-model, inner-animation and allocation presence. Only successful completed initialization writes Animation3D+4; existing bytes remain untouched on every false return. The model byte fields are actual retained memory, not success flags invented from elapsed time.',
    operations:{0:'admit original inner-animation lookup',1:'admit original allocation',2:'commit completed AnimationData'},
    defaults:{operation:0,animationBytes:Array(16).fill(0),modelBytes:Array(172).fill(0),attachedModelPresent:false,allocatorPresent:false,innerAnimationPresent:false,initializationCompleted:false,allocationPointerU16:[0,0],enabled:true},
    inputDomains:{operation:{width:1,min:0,max:2,integer:true},animationBytes:{width:16,min:0,max:255,integer:true},modelBytes:{width:172,min:0,max:255,integer:true},allocationPointerU16:{width:2,min:0,max:65535,integer:true}}
  });
  const op=g.input('operation'),a=g.split(g.input('animationBytes',['N',16]),16),m=g.split(g.input('modelBytes',['N',172]),172),p=g.split(g.input('allocationPointerU16',['N',2]),2);
  const attached=g.input('attachedModelPresent',['N',1],'bool'),allocator=g.input('allocatorPresent',['N',1],'bool'),inner=g.input('innerAnimationPresent',['N',1],'bool'),initialized=g.input('initializationCompleted',['N',1],'bool'),enabled=g.input('enabled',['N',1],'bool');
  const zero=g.mul(op,0),mod=(v,n)=>g.sub(v,g.mul(g.floor(g.mul(v,1/n)),n)),half=(b,i)=>g.add(b[i],g.mul(b[i+1],256)),pair=(b,i)=>[half(b,i),half(b,i+2)],present=q=>g.or(g.gt(q[0],0),g.gt(q[1],0));
  const internal=pair(m,0x54),texture=pair(m,0x58),eligible=g.and(enabled,present(pair(a,0)),attached,allocator,g.eq(mod(m[0xa8],2),1),present(internal));
  const success=g.and(eligible,g.eq(op,2),inner,present(p),initialized),next=[...a],mask=a.map(()=>zero);
  for(let i=0;i<4;i++){const value=i%2?g.floor(g.mul(p[Math.floor(i/2)],1/256)):mod(p[Math.floor(i/2)],256);next[4+i]=g.where(success,value,a[4+i]);mask[4+i]=g.where(success,255,zero);}
  for(const[k,v]of Object.entries({supported:g.or(g.not(enabled),g.and(g.ge(op,0),g.le(op,2))),requestInnerAnimation:g.and(eligible,g.eq(op,0)),requestAllocation:g.and(eligible,g.eq(op,1),inner),returnValue:success,internalModelPointerU16:g.cat(internal),texturePointerU16:g.cat(texture),nextAnimationBytes:g.cat(next),writtenMaskBytes:g.cat(mask),consumed:zero}))g.output(v,k);
  return g;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const r=await buildCommonAnimation3DData().save();console.log(JSON.stringify({name:r.name,nodes:r.nodes,bytes:r.bytes}));}
