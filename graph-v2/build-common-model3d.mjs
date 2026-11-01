import {fileURLToPath} from 'node:url';
import {Graph} from './graph-builder.mjs';
import {exactMultiplyQ12} from './build-camera-fixed-math.mjs';
import {unsignedBytes,multiplyBytes,normalizeByteCoefficients,bytesGreaterEqual} from './build-camera-facing-math.mjs';
import {NSBXX_RENDER_CALLBACKS} from '../data/nsbxx-runtime.mjs';

// JPN020c4984: integer sqrt(4*(x*x+z*z)), then signed(root+1)>>1.
function exactLengthXZ(g,x,z){
 const zero=g.mul(x,0),absolute=v=>g.where(g.lt(v,0),g.sub(0,v),v),vectors=[x,z].map(v=>unsignedBytes(g,absolute(v),3)),squares=vectors.map(v=>multiplyBytes(g,v,v,6)),sum=normalizeByteCoefficients(g,Array.from({length:6},(_,i)=>g.add(squares[0][i],squares[1][i])),6),operand=normalizeByteCoefficients(g,sum.map(v=>g.mul(v,4)),7);let root=Array(4).fill(zero);
 for(let bit=24;bit>=0;bit--){const candidate=root.map((v,i)=>i===Math.floor(bit/8)?g.add(v,2**(bit%8)):v),square=multiplyBytes(g,candidate,candidate,7),take=bytesGreaterEqual(g,operand,square);root=root.map((v,i)=>g.where(take,candidate[i],v));}
 const plus=normalizeByteCoefficients(g,root.map((v,i)=>g.add(v,i===0?1:0)),4);return g.add(g.floor(g.mul(plus[0],.5)),g.add(g.mul(plus[1],128),g.add(g.mul(plus[2],32768),g.mul(plus[3],8388608))));
}

export function buildCommonModel3D(){
 const pointers=['rawFilePointerU16','rawFileLengthU16','internalModelPointerU16','texturePointerU16'];
 const g=new Graph('rom-common-model3d',{
  inputContractVersion:1,authority:{matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10',sources:['src/Graphics/Model3D.cpp','src/NitroSDK/NSBXX/Animation.cpp'],originals:{vectorLength:'JPN020c4984'},readonlyCallbacks:'data/nsbxx-runtime.mjs'},
  scope:'Original Model3D Clear, raw-file attachment and post-texture render-context/bounding-box stores. All six signed16 bounds and the signed32 scale are decoded from the original64-byte NSBXX model header. Rounded Q12 multiplication and the original wide integer vector-length square root use byte limbs. Admitted scale magnitude<=2^24 and each scaled bound magnitude<=8388606. Texture allocation/linking and staging are distinct producers; phase2 must only run after their computed completion. Phase3 records their computed staging IDs. No successful texture processing or VRAM transfer is inferred from a parsed model.',
  operations:{0:'Clear',1:'SetAndProcessRawFile attachment',2:'PopulateModelRenderContext and model geometry',3:'texture staging returned'},
  defaults:{operation:0,modelBytes:Array(172).fill(0),internalModelHeaderBytes:Array(64).fill(0),paletteStagingTaskId:65535,imageStagingTaskId:65535,...Object.fromEntries(pointers.map(k=>[k,[0,0]])),enabled:true},
  inputDomains:{operation:{width:1,min:0,max:3,integer:true},modelBytes:{width:172,min:0,max:255,integer:true},internalModelHeaderBytes:{width:64,min:0,max:255,integer:true},paletteStagingTaskId:{width:1,min:0,max:65535,integer:true},imageStagingTaskId:{width:1,min:0,max:65535,integer:true},...Object.fromEntries(pointers.map(k=>[k,{width:2,min:0,max:65535,integer:true}]))}
 });
 const op=g.input('operation'),raw=g.split(g.input('modelBytes',['N',172]),172),header=g.split(g.input('internalModelHeaderBytes',['N',64]),64),p=Object.fromEntries(pointers.map(k=>[k,g.split(g.input(k,['N',2]),2)])),palette=g.input('paletteStagingTaskId'),image=g.input('imageStagingTaskId'),enabled=g.input('enabled',['N',1],'bool'),zero=g.mul(op,0),mod=(v,n)=>g.sub(v,g.mul(g.floor(g.mul(v,1/n)),n)),half=at=>g.add(header[at],g.mul(header[at+1],256)),signedHalf=at=>{const v=half(at);return g.where(g.ge(v,32768),g.sub(v,65536),v);},scale=g.add(half(0x38),g.mul(signedHalf(0x3a),65536)),geometry=Array.from({length:6},(_,i)=>g.cast(exactMultiplyQ12(g,signedHalf(0x2c+2*i),scale).value,'float32')),qualified=g.or(g.not(g.eq(op,2)),g.and(g.ge(scale,-16777216),g.le(scale,16777216),...geometry.map(v=>g.and(g.ge(v,-8388606),g.le(v,8388606))))),active=g.and(enabled,qualified),stage=n=>g.and(active,g.eq(op,n)),next=[...raw],mask=raw.map(()=>zero),absolute=v=>g.where(g.lt(v,0),g.sub(0,v),v),truncHalf=v=>g.where(g.lt(v,0),g.sub(0,g.floor(g.mul(absolute(v),.5))),g.floor(g.mul(v,.5)));
 function byte(at,value,condition){next[at]=g.where(condition,typeof value==='number'?g.add(zero,value):value,next[at]);mask[at]=g.where(condition,255,mask[at]);}
 function u16(at,value,condition){byte(at,mod(value,256),condition);byte(at+1,g.floor(g.mul(mod(value,65536),1/256)),condition);}
 function word(at,value,condition){if(Array.isArray(value)){u16(at,value[0],condition);u16(at+2,value[1],condition);}else{u16(at,mod(value,65536),condition);u16(at+2,mod(g.floor(g.mul(value,1/65536)),65536),condition);}}
 const clear=stage(0);for(let i=0;i<0x54;i++)byte(i,0,clear);for(const at of[0x54,0x58,0x5c,0x90,0x94,0x98,0x9c])word(at,zero,clear);u16(0xa0,4096,clear);u16(0xa2,31,clear);u16(0xa4,65535,clear);u16(0xa6,65535,clear);byte(0xa8,g.sub(raw[0xa8],mod(raw[0xa8],8)),clear);for(let i=0x64;i<0x7c;i++)byte(i,0,clear);
 word(0x5c,p.rawFilePointerU16,stage(1));word(0x60,p.rawFileLengthU16,stage(1));
 const finish=stage(2);for(let i=0;i<0x54;i++)byte(i,0,finish);word(4,p.internalModelPointerU16,finish);word(0xc,[g.add(zero,NSBXX_RENDER_CALLBACKS.material&65535),g.add(zero,NSBXX_RENDER_CALLBACKS.material>>>16)],finish);word(0x14,[g.add(zero,NSBXX_RENDER_CALLBACKS.joint&65535),g.add(zero,NSBXX_RENDER_CALLBACKS.joint>>>16)],finish);word(0x1c,[g.add(zero,NSBXX_RENDER_CALLBACKS.visibility&65535),g.add(zero,NSBXX_RENDER_CALLBACKS.visibility>>>16)],finish);word(0x54,p.internalModelPointerU16,finish);word(0x58,p.texturePointerU16,finish);
 for(let i=0;i<3;i++){word(0x64+4*i,g.add(geometry[i],geometry[i+3]),finish);word(0x70+4*i,geometry[i],finish);}word(0x7c,g.add(geometry[0],truncHalf(geometry[3])),finish);word(0x80,geometry[1],finish);word(0x84,g.add(geometry[2],truncHalf(geometry[5])),finish);word(0x88,g.floor(g.mul(exactLengthXZ(g,geometry[3],geometry[5]),.5)),finish);word(0x8c,geometry[4],finish);byte(0xa8,g.add(g.sub(raw[0xa8],mod(raw[0xa8],2)),1),finish);
 u16(0xa4,image,stage(3));u16(0xa6,palette,stage(3));g.output(g.or(g.not(enabled),qualified),'supported');g.output(g.cat(next),'nextModelBytes');g.output(g.cat(mask),'writtenMaskBytes');g.output(zero,'consumed');return g;
}

if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildCommonModel3D().save(),null,2));
