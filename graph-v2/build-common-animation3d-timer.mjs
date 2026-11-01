import {fileURLToPath} from 'node:url';
import {Graph} from './graph-builder.mjs';
import {multiplyBytes,normalizeByteCoefficients,bytesGreaterEqual} from './build-camera-facing-math.mjs';

/** Original Animation3D time mutation, separate from animation evaluation. */
export function buildCommonAnimation3DTimer(){
  const g=new Graph('rom-common-animation3d-timer',{
    inputContractVersion:1,
    authority:{sources:['src/Graphics/Animation3D.cpp','src/World/Object3D.cpp','include/Graphics/Animation3D.h','include/NitroSDK/NSBXX/Animation.h'],originals:{advance:'JPN0207eee8',set:'JPN0207efac',frameCount:'JPN02034fa0'}},
    scope:'Exact signed32 dt*playbackSpeed through signed64,+0x800,ASR12 and signed32 cast; wrapped time addition; actual uint16 frame count shifted12; original non-loop clamp or positive-length loop remainder. Negative time that never enters the original boundary branch is retained. A zero-length looping animation with nonnegative updated time remains explicitly nonterminating. The helper writes the updated time before reading the live raw frame count. Valid separate Animation3D/AnimationData/raw-header storage is required; animation evaluation, rendering and CPU cycle equivalence are outside this graph.',
    operations:{0:'AdvanceTimer time addition',1:'AdvanceTimer original frame-boundary branch',2:'SetAnimationTime'},
    defaults:{operation:0,animationBytes:Array(16).fill(0),dataBytes:Array(26).fill(0),valueU16:[0,0],rawFrameCountBytes:[0,0],enabled:true},
    inputDomains:{operation:{width:1,min:0,max:2,integer:true},animationBytes:{width:16,min:0,max:255,integer:true},dataBytes:{width:26,min:0,max:255,integer:true},valueU16:{width:2,min:0,max:65535,integer:true},rawFrameCountBytes:{width:2,min:0,max:255,integer:true}},
    arithmetic:'All signed32 operands remain four bytes;4x4 byte convolution coefficients stay below2^19. Q12 sign and rounding are performed before packing the low32 bits. Boundary remainder uses20 exact restoring steps on the unsigned whole-frame portion<=1048575; only nonnegative times enter the original branch, where that portion<=524287. The original12 fractional bits are retained. No full signed32 word or64-bit product is rounded through FLOAT.'
  });
  const op=g.input('operation'),enabled=g.input('enabled',['N',1],'bool'),a=g.split(g.input('animationBytes',['N',16]),16),d=g.split(g.input('dataBytes',['N',26]),26),v=g.split(g.input('valueU16',['N',2]),2),f=g.split(g.input('rawFrameCountBytes',['N',2]),2),zero=g.mul(op,0),first=g.nodes.length;
  const mod=(x,n)=>g.sub(x,g.mul(g.floor(g.mul(x,1/n)),n)),half=(b,i)=>g.add(b[i],g.mul(b[i+1],256)),pair=b=>[half(b,0),half(b,2)],select=(condition,x,y)=>x.map((b,i)=>g.where(condition,b,y[i]));
  const value=v.flatMap(x=>[mod(x,256),g.floor(g.mul(x,1/256))]),negate=b=>normalizeByteCoefficients(g,b.map((x,i)=>g.add(g.sub(255,x),i===0?1:0)),b.length),speed=a.slice(8,12),speedNegative=g.ge(speed[3],128),valueNegative=g.ge(value[3],128),negative=g.not(g.eq(speedNegative,valueNegative));
  const product=multiplyBytes(g,select(speedNegative,negate(speed),speed),select(valueNegative,negate(value),value),8);
  // floor((-m+2048)/4096) = -floor((m+2047)/4096).
  const rounded=normalizeByteCoefficients(g,product.map((x,i)=>i===0?g.add(x,g.where(negative,255,0)):i===1?g.add(x,g.where(negative,7,8)):x),8);
  const shifted=Array.from({length:4},(_,i)=>g.add(g.floor(g.mul(rounded[i+1],1/16)),g.mul(mod(rounded[i+2],16),16))),increment=select(negative,negate(shifted),shifted),advanced=normalizeByteCoefficients(g,d.slice(0,4).map((x,i)=>g.add(x,increment[i])),4);
  const present=g.gt(a.slice(4,8).reduce((s,x)=>g.add(s,x),zero),0),active=g.and(enabled,present),stage=n=>g.and(active,g.eq(op,n)),frameCount=half(f,0),frameBytes=[zero,g.mul(mod(f[0],16),16),g.add(g.floor(g.mul(f[0],1/16)),g.mul(mod(f[1],16),16)),g.floor(g.mul(f[1],1/16))],time=d.slice(0,4);
  const atEnd=g.and(g.lt(time[3],128),bytesGreaterEqual(g,time,frameBytes)),noLoop=g.eq(mod(a[12],2),1),nonterminating=g.and(stage(1),atEnd,g.not(noLoop),g.eq(frameCount,0));
  const wholeFrames=g.add(g.add(g.floor(g.mul(time[1],1/16)),g.mul(time[2],16)),g.mul(time[3],4096)),divisor=g.max(frameCount,1);let remainder=zero;
  for(let bit=19;bit>=0;bit--){const incoming=mod(g.floor(g.mul(wholeFrames,2**-bit)),2),shifted=g.add(g.mul(remainder,2),incoming);remainder=g.where(g.ge(shifted,divisor),g.sub(shifted,divisor),shifted);}
  // Negative input times compute unused remainders internally. Including bit19
  // covers that full unsigned portion without changing the signed branch.
  const loopTime=[time[0],g.add(mod(time[1],16),g.mul(mod(remainder,16),16)),mod(g.floor(g.mul(remainder,1/16)),256),g.floor(g.mul(remainder,1/4096))];
  const boundaryWrite=g.and(stage(1),atEnd,g.not(nonterminating)),write=g.or(stage(0),stage(2),boundaryWrite),boundaryValue=select(noLoop,frameBytes,loopTime),result=select(stage(0),advanced,select(stage(2),value,boundaryValue)),next=d.map((b,i)=>i<4?g.where(write,result[i],b):b),mask=d.map((b,i)=>i<4?g.where(write,255,zero):zero),requiresBoundaryCheck=stage(0);
  const outputs={supported:g.or(g.not(enabled),g.and(g.ge(op,0),g.le(op,2))),dataPresent:present,requiresBoundaryCheck,nonterminating,complete:g.not(g.or(requiresBoundaryCheck,nonterminating)),nextDataBytes:g.cat(next),writtenMaskBytes:g.cat(mask),timeU16:g.cat(pair(next.slice(0,4))),incrementU16:g.cat(pair(increment)),frameCountU16:g.cat(pair(frameBytes)),nextPhase:g.where(requiresBoundaryCheck,1,g.where(nonterminating,3,2)),consumed:zero};
  for(const[k,x]of Object.entries(outputs))g.output(x,k);
  for(const node of g.nodes.slice(first))if(node.roundingSite){node.exactArithmetic=true;node.exactArithmeticReason='Byte convolution/Euclidean carries are bounded below2^20; comparison chunks are at most2^24-1; whole-frame restoring state is at most1048575 and twice-divisor remainder below131070. Every arithmetic operation is exact integer or power-of-two scaling in binary32. Full32/64-bit values remain bytes.';}
  return g;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const r=await buildCommonAnimation3DTimer().save();console.log(JSON.stringify({name:r.name,nodes:r.nodes,bytes:r.bytes}));}
