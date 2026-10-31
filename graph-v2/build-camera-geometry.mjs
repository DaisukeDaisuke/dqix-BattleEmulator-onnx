import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Graph} from './graph-builder.mjs';
import {sourceSHA256} from '../data/source-authority.mjs';

// Scalar values are exact integers <=2^24. Large squared distances live in
// base-256 digits, so no 48-bit integer is rounded into a FLOAT tensor.
function bytes3(g,value){
  const high=g.floor(g.mul(value,1/256)),top=g.floor(g.mul(high,1/256));
  return [g.sub(value,g.mul(high,256)),g.sub(high,g.mul(top,256)),top];
}
function squareCoefficients(g,[a,b,c]){
  return [g.mul(a,a),g.mul(2,g.mul(a,b)),g.add(g.mul(b,b),g.mul(2,g.mul(a,c))),g.mul(2,g.mul(b,c)),g.mul(c,c)];
}
function normalize6(g,coefficients){
  let carry=0;const bytes=[];
  for(const coefficient of coefficients){const total=g.add(coefficient,carry);carry=g.floor(g.mul(total,1/256));bytes.push(g.sub(total,g.mul(carry,256)));}
  bytes.push(carry);return bytes;
}
function halves24(g,b){return [g.add(g.add(b[0],g.mul(b[1],256)),g.mul(b[2],65536)),g.add(g.add(b[3],g.mul(b[4],256)),g.mul(b[5],65536))];}

export function exactRoundedDistance(g,from,to){
  const start=g.nodes.length;
  const delta=from.map((x,i)=>g.sub(x,to[i]));
  const squares=delta.map(x=>squareCoefficients(g,bytes3(g,g.max(x,g.sub(0,x)))));
  const coefficients=Array.from({length:5},(_,i)=>g.add(g.add(squares[0][i],squares[1][i]),squares[2][i]));
  const squaredBytes=normalize6(g,coefficients),sum=halves24(g,squaredBytes);
  let root=g.constant(0);
  // For integer S>=0 and c>=1:
  // floor((isqrt(4*S)+1)/2) >= c iff S >= c*c-c+1.
  // Every root candidate is <=2^24-1; no approximate square root is used.
  for(let bit=23;bit>=0;bit--){
    const candidate=g.add(root,2**bit),digits=bytes3(g,candidate),square=squareCoefficients(g,digits);
    square[0]=g.add(g.sub(square[0],digits[0]),1);square[1]=g.sub(square[1],digits[1]);square[2]=g.sub(square[2],digits[2]);
    const threshold=halves24(g,normalize6(g,square));
    const accepts=g.or(g.gt(sum[1],threshold[1]),g.and(g.eq(sum[1],threshold[1]),g.ge(sum[0],threshold[0])));
    root=g.where(accepts,candidate,root);
  }
  const reason='Bounded coordinate domain: |delta|<=8388606. Base256 digits<=255; product/convolution coefficients and carries stay below2^20. Each packed half<=2^24-1; root candidates<=2^24-1. All integer operations are exactly representable binary32, and division uses exact power-of-two scaling.';
  for(const n of g.nodes.slice(start))if(n.roundingSite){n.exactArithmetic=true;n.exactArithmeticReason=reason;}
  return {distance:root,delta:g.cat(delta),squaredDistanceBytes:g.cat(squaredBytes)};
}

export async function buildCameraGeometry(){
  const file='src/NitroSDK/Main/func_020c3030.cpp';
  const g=new Graph('rom-camera-distance3',{
    authority:{matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10',source:file,sourceSHA256:sourceSHA256(file),address:'ram:0x020c4afc',sourceNameIsUSAAddress:true,hardwareReferences:[{url:'https://problemkaputt.de/gbatek.htm#dsmaths',section:'SQRTCNT / SQRT_RESULT / SQRT_PARAM'},{url:'https://github.com/melonDS-emu/melonDS/blob/master/src/NDS.cpp',function:'NDS::SqrtDone',retrieved:'2026-10-31',sha256:'d70456a70fb2d487baba7024e65abddb97fb94774ee5132c5e6ca53f7721b87e'}]},
    scope:'Bounded-domain exact Vector3fix_Distance arithmetic and the camera selector radius-overlap predicate. The ROM computes squared integer differences, unsigned64 left shift by2, unsigned integer hardware sqrt, then (result+1)>>1. This graph implements the equal integer threshold relation. It does not emulate peripheral timing or general overflowing32-bit coordinates.',
    scopeJa:'3次元座標の整数距離とカメラ半径の重なりを計算します。大きな平方和を6byteへ分解し、整数の丸め境界を正確に保ちます。',
    proof:'For integer S>=0, R=floor((isqrt(4*S)+1)/2). For c>=1, R>=c iff S>=c*c-c+1. Search all24 result bits with exact six-byte comparisons. |coordinates|<=4194303 implies |delta|<=8388606, S<=3*8388606^2<2^48 and R<2^24; neither the ROM64-bit shift nor signed result conversion overflows in this domain. Every byte convolution/carry remains below2^20, packed24-bit halves and root candidates remain<=2^24-1.',
    outputs:'distance is integer nearest Euclidean distance in the same fixed-point units as the inputs. squaredDistanceBytes are six little-endian base256 digits of S, not a floating approximation. overlap uses strict distance<floor((radiusA+radiusB)/2).',
    connection:'Feed distance with the unchanged input radii into rom-free-camera-selector.geometry. World positions/route commits and object existence are separate upstream state.',
    defaults:{sourcePosition:[0,0,0],targetPosition:[16384,0,8192],radii:[4096,8192]},
    defaultProfile:'Isolated numeric fixed-point coordinate example, not asserted to be a captured whole camera state.',
    labels:{sourcePosition:'行動者のworld座標XYZ',targetPosition:'対象のworld座標XYZ',radii:'行動者と対象のObject3D半径'},
    inputDomains:{sourcePosition:{min:-4194303,max:4194303,integer:true,width:3},targetPosition:{min:-4194303,max:4194303,integer:true,width:3},radii:{min:0,max:8388607,integer:true,width:2}},
    defaultSteps:1,feedback:{},verificationBoundary:'Source/hardware semantic proof and independent integer oracle. Actual ARM execution, when supplied, must declare its sqrt device model; a CPU Pcode run without the peripheral cannot prove the complete helper.'
  });
  const from=g.split(g.input('sourcePosition',['N',3]),3),to=g.split(g.input('targetPosition',['N',3]),3),radii=g.split(g.input('radii',['N',2]),2);
  const result=exactRoundedDistance(g,from,to),half=g.floor(g.mul(g.add(radii[0],radii[1]),.5));
  for(const [name,value]of Object.entries({...result,overlap:g.lt(result.distance,half)}))g.output(value,name);
  return g;
}

if(process.argv[1]&&new URL(`file://${process.argv[1]}`).href===import.meta.url){
  const graph=await buildCameraGeometry();
  for(const [extension,data]of [['onnx',graph.model()],['json',JSON.stringify(graph.json(),null,2)+'\n']]){
    const name=`${graph.name}.${extension}`,temp=new URL(`${name}.pending-${process.pid}`,import.meta.url);
    await writeFile(temp,data);await rename(temp,new URL(name,import.meta.url));
  }
  console.log(JSON.stringify({model:graph.name,nodes:graph.nodes.length,bytes:graph.model().length}));
}
