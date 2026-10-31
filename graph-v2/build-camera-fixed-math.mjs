// Small integer SDK operations needed by actual free-camera geometry.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {Graph} from './graph-builder.mjs';
import cameraConstants from '../data/camera-constants.mjs';
import {sourceSHA256} from '../data/source-authority.mjs';
import {unsignedBytes,multiplyBytes,normalizeByteCoefficients} from './build-camera-facing-math.mjs';
const root=new URL('../',import.meta.url),dir=new URL('./',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex');
async function authority(){return ['restored/dqix-decomp-decomp-matching/src/Graphics/ExtendedVectorMath.cpp','restored/dqix-decomp-decomp-matching/src/NitroSDK/Main/func_020c2cf0.cpp','restored/dqix-decomp-decomp-matching/src/NitroSDK/Main/func_020c2c5c.cpp','evidence-v2/ghidra/camera-fixed-divide-complete-defined/response.json'].map(path=>({path,sha256:sourceSHA256(path)}));}
const abs=(g,x)=>g.where(g.lt(x,0),g.sub(0,x),x);
function annotate(g,first,why){for(const n of g.nodes.slice(first))if(n.roundingSite){n.exactArithmetic=true;n.exactArithmeticReason=why;}}
export function exactPositiveFixDivide(g,numerator,denominator){
 const first=g.nodes.length,divisor=g.max(denominator,1),raw=g.mul(numerator,4096);let q=g.sub(numerator,numerator),r=q;
 for(let bit=24;bit>=0;bit--){const inputBit=g.sub(g.floor(g.mul(raw,2**-bit)),g.mul(g.floor(g.mul(raw,2**(-bit-1))),2)),next=g.add(g.mul(r,2),inputBit),take=g.ge(next,divisor);r=g.where(take,g.sub(next,divisor),next);q=g.add(q,g.where(take,2**bit,0));}
 const halfUp=g.floor(g.mul(g.add(divisor,1),.5)),rounded=g.add(q,g.cast(g.ge(r,halfUp),'float32'));
 const result=g.where(g.eq(denominator,0),0,rounded);
 annotate(g,first,'0<=numerator<=4096 gives integer numerator*4096<=2^24. Every partial restoring numerator/remainder is no larger than that full numerator. Divisor<=2^24-1; ceil(divisor/2) uses exact(divisor+1)/2. Rounded quotient<=2^24. All Add/Sub/Mul and power-of-two rescaling are exact binary32; zero denominator returns the actual SDK rounded signedDIV(-1) result0.');
 return{result,remainder:g.where(g.eq(denominator,0),0,r),unrounded:g.where(g.eq(denominator,0),0,q)};
}
export function signedWordFromBytes(g,b){
 const low=g.add(g.add(b[0],g.mul(b[1],256)),g.mul(b[2],65536)),high=g.where(g.ge(b[3],128),g.sub(b[3],256),b[3]);
 return g.add(g.cast(low,'int32'),g.mul(g.cast(high,'int32'),g.constant(16777216,'int32')));
}
export function exactMultiplyQ12(g,a,b,round=true){
 const first=g.nodes.length,negative=g.not(g.eq(g.lt(a,0),g.lt(b,0))),aa=unsignedBytes(g,abs(g,a),4),bb=unsignedBytes(g,abs(g,b),4),product=multiplyBytes(g,aa,bb,8);
 // Positive nearest: +2048. Negative nearest before negation: +2047.
 // Floor variant uses positive+0, negative+4095 before negation.
 const adjusted=normalizeByteCoefficients(g,product.map((v,i)=>i===0?g.add(v,g.where(negative,255,0)):i===1?g.add(v,round?g.where(negative,7,8):g.where(negative,15,0)):v),8);
 const shifted=Array.from({length:4},(_,i)=>g.add(g.floor(g.mul(adjusted[i+1],1/16)),g.mul(g.sub(adjusted[i+2],g.mul(g.floor(g.mul(adjusted[i+2],1/16)),16)),16)));
 const complement=normalizeByteCoefficients(g,shifted.map((v,i)=>g.add(g.sub(255,v),i===0?1:0)),4),bytes=shifted.map((v,i)=>g.where(negative,complement[i],v)),value=signedWordFromBytes(g,bytes);
 annotate(g,first,'Each admitted signed operand is converted losslessly to FLOAT only within±2^24. All products live in byte limbs, coefficients/carry<2^20. Q12 rounding is an exact unsigned limb add then shift; negative tie behavior uses+2047 before negation. Four result bytes are packed with integer32 multiply/add, deliberately retaining the original signed32 cast/wrap. No FLOAT packs a32-bit word.');
 return{value,bytes};
}
export async function buildPositiveFixDivide(){
 const g=new Graph('rom-sdk-positive-fix-divide',{authority:await authority(),address:'JPN ARM9 0x020c46c0',scope:'Exact positive SDK fix32_Divide on camera-domain numerator0..4096 and denominator0..2^24-1. The actual signed64 device quotient then SDK rounding is reproduced by equivalent integer ratio rounding. Denominator0 returns0 after the original(-1+0x80000)>>20.',scopeJa:'カメラで使う正の固定小数点除算を整数の余りまで保って計算します。',inputDomains:{numerator:{width:1,min:0,max:4096,integer:true},denominator:{width:1,min:0,max:16777215,integer:true}},defaults:{numerator:4096,denominator:16384},inputContractVersion:1,feedback:{},defaultSteps:1});
 const n=g.cast(g.input('numerator',['N',1],'int32'),'float32'),d=g.cast(g.input('denominator',['N',1],'int32'),'float32'),r=exactPositiveFixDivide(g,n,d);g.output(g.cast(r.result,'int32'),'result');g.output(g.cast(r.unrounded,'int32'),'unroundedQuotient');g.output(g.cast(r.remainder,'int32'),'remainder');return g;
}
export async function buildVectorScale3(){
 const g=new Graph('rom-sdk-vector-scale3',{authority:await authority(),address:'JPN ARM9 0x02030964',scope:'Exact Vector3fixMultiplyScalar: three original signed64 products+0x800, arithmetic>>12, signed32 cast. Arbitrary valid positive/negative Q12 ties and resulting32-bit wrap are preserved through byte limbs. This model does not change its input vector in place.',scopeJa:'Q12の符号付きベクトル積と丸めを再現します。大きな積はbyteに分け、最終32bit変換も保持します。',inputDomains:{vector:{width:3,min:-8388606,max:8388606,integer:true},scalar:{width:1,min:-16777216,max:16777216,integer:true}},defaults:{vector:[3,-4,5],scalar:2048},inputContractVersion:1,feedback:{},defaultSteps:1});
 const v=g.split(g.cast(g.input('vector',['N',3],'int32'),'float32'),3),s=g.cast(g.input('scalar',['N',1],'int32'),'float32'),r=v.map(x=>exactMultiplyQ12(g,x,s));g.output(g.cat(r.map(x=>x.value)),'scaled');g.output(g.cat(r.flatMap(x=>x.bytes)),'resultBytes');return g;
}
export async function actualSinCosTable(){
 const table=structuredClone(cameraConstants.sincos),bytes=Buffer.alloc(16384);
 if(table.values.length!==8192)throw Error('Unexpected sine/cosine table length');
 table.values.forEach((value,index)=>bytes.writeInt16LE(value,index*2));
 if(hash(bytes)!==table.authority.tableSHA256)throw Error('Sine/cosine constants changed');
 return table;
}
export function exactSinCos(g,angle,table){
 const first=g.nodes.length;
 // ARM LSL16 discards the original high16 bits before signed division.
 const low16=g.sub(angle,g.mul(g.floor(g.mul(angle,1/65536)),65536)),signed16=g.where(g.ge(low16,32768),g.sub(low16,65536),low16),magnitude=abs(g,signed16);
 let quotient=g.sub(angle,angle),remainder=quotient;
 for(let bit=31;bit>=0;bit--){
  const inputBit=bit>=16?g.sub(g.floor(g.mul(magnitude,2**(16-bit))),g.mul(g.floor(g.mul(magnitude,2**(15-bit))),2)):g.mul(magnitude,0),next=g.add(g.mul(remainder,2),inputBit),take=g.ge(next,25736);
  remainder=g.where(take,g.sub(next,25736),next);quotient=g.add(quotient,g.where(take,2**bit,0));
 }
 const signedQuotient=g.where(g.lt(signed16,0),g.sub(0,quotient),quotient),u16=g.sub(signedQuotient,g.mul(g.floor(g.mul(signedQuotient,1/65536)),65536)),index=g.floor(g.mul(u16,1/16)),tableTensor=g.constant(table,'float32',[8192]),base=g.mul(index,2);
 const sine=g.op('Gather',[tableTensor,g.cast(base,'int32')],{axis:0},{shape:['N',1],dtype:'float32'}),cosine=g.op('Gather',[tableTensor,g.cast(g.add(base,1),'int32')],{axis:0},{shape:['N',1],dtype:'float32'});
 annotate(g,first,'Input integer angle lies within±2^22. Removing high16 bits and signed reinterpretation are exact. Restoring division processes signed16 magnitude shifted16 without storing its32-bit numerator in FLOAT; remainder<25736 and next<51472, quotient<=83443. Every Add/Sub/Mul is integer/power-of-two exact; the final u16 quotient and4096-pair table index reproduce ARM LSL16, signed truncating division, UXTH and LSR4.');
 return{sine,cosine,index,normalizedAngle:u16,signedQuotient};
}
export async function buildSinCos(){
 const table=await actualSinCosTable(),g=new Graph('rom-sdk-sincos',{authority:[...await authority(),table.authority],address:'JPN ARM9 sin0x020307a0 / cos0x020307d4',scope:'Exact original sin/cos fixed-point lookup. ARM32 LSL16 truncation occurs before signed division by25736; then the quotient is cast to u16 and shifted4 to address the actual4096 sin/cos pairs. High input angles deliberately retain the original overflow behavior, not mathematical angle modulo.',scopeJa:'ROMのsin/cos表と、32bit左シフト・符号付き整数除算・u16変換をその順序で再現します。',inputDomains:{angle:{width:1,min:-4194304,max:4194304,integer:true}},defaults:{angle:12868},inputContractVersion:1,feedback:{},defaultSteps:1});
 const a=g.cast(g.input('angle',['N',1],'int32'),'float32'),r=exactSinCos(g,a,table.values);g.output(g.cast(r.sine,'int32'),'sine');g.output(g.cast(r.cosine,'int32'),'cosine');g.output(g.cast(r.index,'int32'),'tableIndex');g.output(g.cast(r.normalizedAngle,'int32'),'normalizedAngle');return g;
}
export async function saveFixedGraph(g){const b=g.model(),j=JSON.stringify(g.json(),null,2)+'\n';for(const[ext,v]of[['onnx',b],['json',j]]){const p=new URL(`${g.name}.${ext}`,dir),t=new URL(`${g.name}.${ext}.pending-${process.pid}`,dir);await writeFile(t,v);await rename(t,p);}return{name:g.name,nodes:g.nodes.length,bytes:b.length,sha256:hash(b),irSHA256:hash(j)};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const results=[];for(const build of[buildPositiveFixDivide,buildVectorScale3,buildSinCos])results.push(await saveFixedGraph(await build()));const p=new URL('camera-fixed-math-models.json',dir),t=new URL('camera-fixed-math-models.json.pending',dir);await writeFile(t,JSON.stringify(results,null,2)+'\n');await rename(t,p);console.log(JSON.stringify(results,null,2));}
