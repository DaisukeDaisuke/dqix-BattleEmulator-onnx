// Exact, bounded SDK integer arithmetic. No former camera model is rebuilt.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {Graph} from './graph-builder.mjs';
import cameraConstants from '../data/camera-constants.mjs';
import {sourceSHA256} from '../data/source-authority.mjs';
const root=new URL('../',import.meta.url),dir=new URL('./',import.meta.url);
const hash=b=>createHash('sha256').update(b).digest('hex');
const queryPath='evidence-v2/ghidra/camera-facing-math-defined/response.json';
const sum=(g,values)=>values.reduce((a,b)=>g.add(a,b),0);
const zeroFor=(g,x)=>g.sub(x,x);
const select=(g,c,a,b)=>a.map((v,i)=>g.where(c,v,b[i]));

// Each coefficient is less than2^20; Floor divisions are powers of two.
// Negative coefficients use an exact Euclidean borrow, returning byte digits.
export function normalizeByteCoefficients(g,coefficients,width){
 let carry=0;const out=[];
 for(let i=0;i<width;i++){
  const total=g.add(coefficients[i]??0,carry);carry=g.floor(g.mul(total,1/256));
  out.push(g.sub(total,g.mul(carry,256)));
 }
 return out;
}
export function multiplyBytes(g,a,b,width){
 const coefficients=Array.from({length:width},(_,i)=>sum(g,a.flatMap((v,j)=>i-j>=0&&i-j<b.length?[g.mul(v,b[i-j])]:[])));
 return normalizeByteCoefficients(g,coefficients,width);
}
export function unsignedBytes(g,value,width){
 let remaining=value;const result=[];
 for(let i=0;i<width;i++){const next=g.floor(g.mul(remaining,1/256));result.push(g.sub(remaining,g.mul(next,256)));remaining=next;}
 return result;
}
function pack24(g,bytes,start){return sum(g,bytes.slice(start,start+3).map((v,i)=>g.mul(v,2**(8*i))));}
export function bytesGreaterEqual(g,a,b){
 const width=Math.max(a.length,b.length),aa=[...a],bb=[...b];while(aa.length<width)aa.push(0);while(bb.length<width)bb.push(0);
 let result=g.ge(pack24(g,aa,0),pack24(g,bb,0));
 for(let i=3;i<width;i+=3){const x=pack24(g,aa,i),y=pack24(g,bb,i);result=g.or(g.gt(x,y),g.and(g.eq(x,y),result));}
 return result;
}
function exactReason(g,start,reason){for(const n of g.nodes.slice(start))if(n.roundingSite){n.exactArithmetic=true;n.exactArithmeticReason=reason;}}

export function exactNormalize3(g,vector){
 const firstNode=g.nodes.length,zero=zeroFor(g,vector[0]);
 const absolute=vector.map(v=>g.where(g.lt(v,0),g.sub(0,v),v));
 const inputBytes=absolute.map(v=>unsignedBytes(g,v,3));
 const squareCoefficients=Array.from({length:6},(_,i)=>sum(g,inputBytes.flatMap(a=>a.flatMap((v,j)=>i-j>=0&&i-j<a.length?[g.mul(v,a[i-j])]:[]))));
 const squared=normalizeByteCoefficients(g,squareCoefficients,6),isZero=g.eq(sum(g,squared),0);
 const fourSquared=normalizeByteCoefficients(g,squared.map(v=>g.mul(v,4)),7);
 let root=Array(4).fill(zero);
 // sqrt(4S) is below2^25. Candidate itself is kept as four bytes.
 for(let bit=24;bit>=0;bit--){
  const candidate=root.map((v,i)=>i===Math.floor(bit/8)?g.add(v,2**(bit%8)):v);
  const square=multiplyBytes(g,candidate,candidate,7),take=bytesGreaterEqual(g,fourSquared,square);
  root=select(g,take,candidate,root);
 }
 // 57 numerator bits of2^56, seven-byte remainder, eight-byte quotient.
 // For S=0, use a safe divisor1 internally and restore the actual FF quotient;
 // sqrt=0 makes the resulting scale/output identically zero.
 const divisor=[...squared,zero].map((v,i)=>g.where(isZero,i===0?1:0,v));
 let remainder=Array(7).fill(zero),quotient=Array(8).fill(zero);
 for(let bit=56;bit>=0;bit--){
  const shifted=normalizeByteCoefficients(g,remainder.map((v,i)=>g.add(g.mul(v,2),bit===56&&i===0?1:0)),7);
  const take=bytesGreaterEqual(g,shifted,divisor),subtracted=normalizeByteCoefficients(g,shifted.map((v,i)=>g.sub(v,divisor[i])),7);
  remainder=select(g,take,subtracted,shifted);
  const index=Math.floor(bit/8);quotient[index]=g.add(quotient[index],g.where(take,2**(bit%8),0));
 }
 quotient=quotient.map(v=>g.where(isZero,255,v));
 const scale=multiplyBytes(g,quotient,root,8),normalized=vector.map((v,index)=>{
  const product=multiplyBytes(g,scale,inputBytes[index],8);
  const upperLow=g.floor(g.mul(product[5],1/32));
  const integral=g.add(g.add(upperLow,g.mul(product[6],8)),g.mul(product[7],2048));
  const fractionalHigh=g.sub(product[5],g.mul(upperLow,32));
  const aboveHalf=g.or(g.gt(fractionalHigh,16),g.and(g.eq(fractionalHigh,16),g.gt(sum(g,product.slice(0,5)),0)));
  const positive=g.add(integral,g.cast(g.ge(fractionalHigh,16),'float32'));
  const negative=g.sub(0,g.add(integral,g.cast(aboveHalf,'float32')));
  return g.where(g.lt(v,0),negative,positive);
 });
 exactReason(g,firstNode,'Admitted |vector component|<=8388606 gives S<2^48, sqrt(4S)<2^25 and q*r*abs(v)<=2^57. Large values are base256 digits. Each coefficient/carry is below2^20, packed comparison chunks<=2^24-1; all intermediate Add/Sub/Mul results are exact integer or power-of-two-scaled binary32. Signed Q45 rounding is performed by quotient/remainder comparison, not floating normalization.');
 return{normalized,squared,root,quotient,scale,isZero};
}

export async function actualAtanTable(){
 const table=structuredClone(cameraConstants.atan),bytes=Buffer.alloc(258);
 if(table.values.length!==129)throw Error('Invalid atan table length');
 table.values.forEach((value,index)=>bytes.writeInt16LE(value,index*2));
 if(hash(bytes)!==table.authority.tableSHA256)throw Error('Atan constants changed');
 return table;
}
export function exactAtan2(g,y,x,table){
 const firstNode=g.nodes.length,ay=g.where(g.lt(y,0),g.sub(0,y),y),ax=g.where(g.lt(x,0),g.sub(0,x),x),small=g.min(ay,ax),large=g.max(g.max(ay,ax),1),equal=g.eq(small,large);
 let quotient=g.where(equal,4096,0),remainder=g.where(equal,0,small);
 for(let bit=11;bit>=0;bit--){
  const twice=g.mul(remainder,2),take=g.ge(twice,large);remainder=g.where(take,g.sub(twice,large),twice);quotient=g.add(quotient,g.where(take,2**bit,0));
 }
 const rounded=g.add(quotient,g.cast(g.ge(g.mul(remainder,2),large),'float32')),index=g.floor(g.mul(rounded,1/32));
 const baseTable=g.op('Gather',[g.constant(table,'float32',[129]),g.cast(index,'int32')],{axis:0},{shape:['N',1],dtype:'float32'});
 const quarter=g.where(g.ge(ax,ay),baseTable,g.sub(6434,baseTable)),half=g.where(g.lt(x,0),g.sub(12868,quarter),quarter),angle=g.where(g.lt(y,0),g.sub(0,half),half);
 exactReason(g,firstNode,'Atan inputs are signed integers with magnitude<=8388606. Restoring ratio division keeps 0<=remainder<denominator<=8388606, so doubled remainder<2^24. Quotient<=4096 and original129-entry signed-short table values<=3217. SDK fixed divide round-half-up and quadrant arithmetic are exact binary32 integers.');
 return{angle,roundedRatio:rounded,index};
}

async function authorities(){
 const paths=[queryPath,'evidence-v2/ghidra/camera-fixed-divide-complete-defined/response.json','restored/dqix-decomp-decomp-matching/src/NitroSDK/Main/func_020c2f18.cpp','restored/dqix-decomp-decomp-matching/src/NitroSDK/Main/fix32_Atan2.cpp','restored/dqix-decomp-decomp-matching/src/Combat/Main/func_02032424.cpp'];
 return paths.map(path=>({path,sha256:sourceSHA256(path)}));
}
function finish(g){g.contract.inputContractVersion=1;return g;}
export async function buildSdkNormalize3(){
 const g=new Graph('rom-sdk-normalize3',{scope:'Exact bounded SDK Vector3fix_Normalize. Signed integer inputs, original64-bit squared sum, functional DIV2^56/S, integer sqrt4S, signed Q45 multiply/round. No GPU approximate normalization, no RNG, no physical MMIO timing.',scopeJa:'ROMの64bit固定小数点正規化をbyte演算で再現します。除算と平方根の整数丸めを保ち、通常の浮動小数点normalizeは使いません。',authority:await authorities(),address:'JPN ARM9 0x020c49e4',defaults:{vector:[3,4,0]},inputDomains:{vector:{width:3,min:-8388606,max:8388606,integer:true}},feedback:{},defaultSteps:1,proof:'S<2^48. For nonzero S, q=floor(2^56/S),r=isqrt(4S),P=q*r*abs(v)<=2^57. Positive result is floor(P/2^45)+[remainder>=2^44], negative result is -floor(P/2^45)-[remainder>2^44]. S0 restores functional DIV quotient allFF and normalized0. Every limb operation is exactly representable binary32; return vectors are int32.'});
 const vector=g.split(g.cast(g.input('vector',['N',3],'int32'),'float32'),3),r=exactNormalize3(g,vector);
 g.output(g.cast(g.cat(r.normalized),'int32'),'normalized');g.output(g.cat(r.squared),'squaredBytes');g.output(g.cat(r.root),'sqrtBytes');g.output(g.cat(r.quotient),'quotientBytes');g.output(g.cat(r.scale),'scaleBytes');g.output(r.isZero,'zeroVector');return finish(g);
}
export async function buildSdkAtan2(){
 const table=await actualAtanTable(),g=new Graph('rom-sdk-atan2',{scope:'Exact SDK Atan2 with the original129 signed-short table, fixed-divide round-half-up and original quadrant/tie rules. No RNG.',scopeJa:'実ROMの129要素テーブルと固定小数点除算の丸めから角度を求めます。',authority:[...await authorities(),table.authority],address:'JPN ARM9 0x020c4e58',defaults:{y:4096,x:8192},inputDomains:{y:{width:1,min:-8388606,max:8388606,integer:true},x:{width:1,min:-8388606,max:8388606,integer:true}},feedback:{},defaultSteps:1,proof:'For nonnegative min<=max, SDK fixedDivide equals floor(4096*min/max+1/2). Twelve exact restoring fractional-bit steps plus a remainder comparison compute this without floating division. Lookup index is quotient>>5. Explicit axis, diagonal and zero cases agree with the quadrant formula.'});
 const y=g.cast(g.input('y',['N',1],'int32'),'float32'),x=g.cast(g.input('x',['N',1],'int32'),'float32'),r=exactAtan2(g,y,x,table.values);
 g.output(g.cast(r.angle,'int32'),'angleResult');g.output(g.cast(r.roundedRatio,'int32'),'roundedRatioQ12');g.output(g.cast(r.index,'int32'),'tableIndex');return finish(g);
}
export async function buildCameraFacingDirection3(){
 const table=await actualAtanTable(),g=new Graph('rom-camera-facing-direction3',{scope:'Enclosing direction helper from initial self/targetXYZ through exact signed integer normalize, original Atan2 table and angle reduction. Intermediate expected normalized vectors are never inputs. No RNG or animation.',scopeJa:'自分と対象の初期XYZから、正規化・ROM角度テーブル・角度正規化を連鎖し、向きを計算します。',authority:[...await authorities(),table.authority],address:'JPN ARM9 0x02031f5c',defaults:{selfPosition:[0,204,0],targetPosition:[16384,204,8192]},inputDomains:{selfPosition:{width:3,min:-4194303,max:4194303,integer:true},targetPosition:{width:3,min:-4194303,max:4194303,integer:true}},feedback:{},defaultSteps:1,proof:'Each initial coordinate is within±4194303, so self-target delta fits the normalize±8388606 domain. Actual helper passes minus normalized X/Z to SDK Atan2. Its signed result lies[-12868,12868], so exact SDK reduction is a single addition25736 when negative.'});
 const self=g.split(g.cast(g.input('selfPosition',['N',3],'int32'),'float32'),3),target=g.split(g.cast(g.input('targetPosition',['N',3],'int32'),'float32'),3),delta=self.map((v,i)=>g.sub(v,target[i])),n=exactNormalize3(g,delta),a=exactAtan2(g,g.sub(0,n.normalized[0]),g.sub(0,n.normalized[2]),table.values),angle=g.where(g.lt(a.angle,0),g.add(a.angle,25736),a.angle);
 g.output(g.cast(g.cat(delta),'int32'),'delta');g.output(g.cast(g.cat(n.normalized),'int32'),'normalizedSelfMinusTarget');g.output(g.cast(a.angle,'int32'),'atan2SignedAngle');g.output(g.cast(angle,'int32'),'angleResult');return finish(g);
}
async function save(name,value){const p=new URL(name,dir),t=new URL(`${name}.pending-${process.pid}`,dir);await writeFile(t,value);await rename(t,p);}
export async function saveFacingGraph(g){const binary=g.model(),ir=JSON.stringify(g.json(),null,2)+'\n';await save(`${g.name}.onnx`,binary);await save(`${g.name}.json`,ir);return{name:g.name,sha256:hash(binary),irSHA256:hash(ir),nodes:g.nodes.length,bytes:binary.length};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const report=[];for(const build of[buildSdkNormalize3,buildSdkAtan2,buildCameraFacingDirection3])report.push(await saveFacingGraph(await build()));await save('camera-facing-math-models.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
