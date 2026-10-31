import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {Float64Graph} from './f64-graph-builder.mjs';
import cameraConstants from '../data/camera-constants.mjs';
import {sourceSHA256} from '../data/source-authority.mjs';
const root=new URL('../',import.meta.url),dir=new URL('./',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex');
async function authorities(){return ['restored/dqix-decomp-decomp-matching/src/MSL/Main/func_02008848.cpp','restored/dqix-decomp-decomp-matching/src/MSL/Main/func_02005ac4_02005ac4.cpp','restored/dqix-decomp-decomp-matching/src/Combat/Main/func_0202eab8.cpp','restored/dqix-decomp-decomp-matching/src/Runtime/Main/func_0200c9b4.cpp','evidence-v2/ghidra/camera-reverse-polar-fifo-defined/response.json'].map(path=>({path,sha256:sourceSHA256(path)}));}
export async function actualAtanDoubleTables(){
 const out=structuredClone(cameraConstants.atanDouble);
 for(const[key,count]of[['low',4],['high',4],['coefficients',11]]){const bytes=Buffer.from(out.tables[`${key}Bits`],'hex');if(bytes.length!==count*8||out.tables[key].some((v,i)=>!Object.is(v,bytes.readDoubleLE(i*8))))throw Error('Atan binary64 constants changed: '+key);}
 return out;
}
export function originalFiniteAtan(g,value,t){
 // All operations below are separate DOUBLE nodes, preserving original RN sites.
 // Admitted camera differences are zero or |v|>=2^-12; ratios are <=2^25.
 const a=g.abs(value),negative=g.lt(value,0),small=g.lt(a,.4375),r0=g.div(g.sub(g.mul(2,a),1),g.add(2,a)),r1=g.div(g.sub(a,1),g.add(a,1)),r2=g.div(g.sub(a,1.5),g.add(1,g.mul(1.5,a))),r3=g.div(-1,g.where(g.eq(a,0),1,a));
 const i0=g.lt(a,.6875),i1=g.lt(a,1.1875),i2=g.lt(a,2.4375),x=g.where(small,value,g.where(i0,r0,g.where(i1,r1,g.where(i2,r2,r3)))),z=g.mul(x,x),w=g.mul(z,z),c=t.coefficients;
 let even=g.constant(c[10]),odd=g.constant(c[9]);for(let i=8;i>=0;i-=2)even=g.add(c[i],g.mul(w,even));for(let i=7;i>=1;i-=2)odd=g.add(c[i],g.mul(w,odd));
 const s1=g.mul(z,even),s2=g.mul(w,odd),sum=g.add(s1,s2),direct=g.sub(x,g.mul(x,sum)),hi=g.where(i0,t.high[0],g.where(i1,t.high[1],g.where(i2,t.high[2],t.high[3]))),lo=g.where(i0,t.low[0],g.where(i1,t.low[1],g.where(i2,t.low[2],t.low[3]))),reduced=g.sub(hi,g.sub(g.sub(g.mul(x,sum),lo),x)),answer=g.where(small,direct,g.where(negative,g.neg(reduced),reduced));
 return g.where(g.lt(a,2**-29),value,answer);
}
export function originalCameraAtan2(g,y,x,t){
 const zeroY=g.eq(y,0),zeroX=g.eq(x,0),negativeY=g.lt(y,0),negativeX=g.lt(x,0),ratio=g.abs(g.div(y,g.where(zeroX,1,x))),a=originalFiniteAtan(g,ratio,t),pi=3.141592653589793116,piLow=1.2246467991473531772e-16,halfPi=1.570796326794896558;
 const positiveX=g.where(negativeY,g.neg(a),a),negativeResult=g.where(negativeY,g.sub(g.sub(a,piLow),pi),g.sub(pi,g.sub(a,piLow))),normal=g.where(negativeX,negativeResult,positiveX);
 // Initial integer positions cannot generate negative zero, NaN or infinity.
 // Their ratio exponent gap is <=25, so the original +/-60 shortcut is unreachable.
 return g.where(zeroY,g.where(negativeX,pi,y),g.where(zeroX,g.where(negativeY,-halfPi,halfPi),normal));
}
export async function buildReversePolarValues(){
 const tables=await actualAtanDoubleTables(),g=new Float64Graph('rom-camera-reverse-polar-values-cpu3',{authority:await authorities(),backend:{required:'WASM CPU with FLOAT64 support',gpuSupported:false,graphOptimizationLevel:'disabled',reason:'Original fdlibm binary64 atan/atan2 nodes and separate binary32 rounding sites; no silent GPU fallback.'},scope:'Computes original reverse-polar angle/height/distance and diagnostic f32/f64 values from initial integer cameraXYZ/lookAtXYZ. Original atan polynomial coefficients are actual ROM152bytes. This graph ends immediately before setCameraPolar; final setPolar geometry is a separate existing primitive with its own bounded domain. Initial integers are finite±4194303, so float differences are zero or magnitude>=2^-12 and ratio exponent gaps<=25; signed-zero/NaN/infinity general atan2 inputs are not this API.',scopeJa:'初期XYZからROMの倍精度atan2と単精度丸めで極座標を求める、明示的なCPU用ONNXです。GPUへ暗黙にフォールバックしません。',inputDomains:{position:{width:3,min:-4194303,max:4194303,integer:true},lookAt:{width:3,min:-4194303,max:4194303,integer:true}},defaults:{position:[20000,4096,30000],lookAt:[0,204,0]},feedback:{},defaultSteps:1,inputContractVersion:1});
 const p=g.split(g.cast(g.input('position',['N',3],'int32'),'float32'),3),l=g.split(g.cast(g.input('lookAt',['N',3],'int32'),'float32'),3),delta=p.map((v,i)=>g.sub(g.div(v,4096),g.div(l[i],4096))),angle64=originalCameraAtan2(g,g.cast(delta[0],'float64'),g.cast(delta[2],'float64'),tables.tables),angle32=g.cast(angle64,'float32'),positiveAngle=g.where(g.lt(angle32,0),g.add(angle32,Math.fround(6.2831855)),angle32),angle=g.cast(g.mul(4096,positiveAngle),'int32'),height=g.cast(g.mul(4096,delta[1]),'int32'),squared=g.add(g.mul(delta[2],delta[2]),g.add(g.mul(delta[0],delta[0]),g.mul(delta[1],delta[1]))),length=g.op('Sqrt',[squared]),distance=g.cast(g.mul(4096,length),'int32');
 for(const[name,v]of Object.entries({polar:g.cat([angle,height,distance]),delta:g.cat(delta),atan2Double:angle64,atan2Float:angle32,squaredLength:squared,squareRoot:length}))g.output(v,name);return g;
}
export async function buildFloatSqrt(){const g=new Float64Graph('rom-float-square-root-cpu',{authority:await authorities(),backend:{required:'WASM CPU',gpuSupported:false,graphOptimizationLevel:'disabled'},scope:'Original positive finite binary32 square-root return projection. Includes zero and subnormals, but excludes negative, NaN and infinity inputs/error side effects. Standard ONNX Sqrt is used only with explicit WASM CPU and bitwise actual-ROM verification.',scopeJa:'0を含む非負有限float32の平方根を、実ROM返値のビット単位で照合するCPU用グラフです。',inputDomains:{value:{width:1,min:0,max:3.4028234663852886e38}},defaults:{value:2},feedback:{},defaultSteps:1,inputContractVersion:1});g.output(g.op('Sqrt',[g.input('value',['N',1],'float32')]),'result');return g;}
async function save(g){const b=g.model(),j=JSON.stringify(g.json(),null,2)+'\n';for(const[ext,data]of[['onnx',b],['json',j]]){const t=new URL(`${g.name}.${ext}.pending-${process.pid}`,dir);await writeFile(t,data);await rename(t,new URL(`${g.name}.${ext}`,dir));}return{name:g.name,sha256:hash(b),irSHA256:hash(j),nodes:g.nodes.length,bytes:b.length};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const rows=[];for(const f of[buildReversePolarValues,buildFloatSqrt])rows.push(await save(await f()));const p=new URL('camera-double-math-models.json',dir),t=new URL('camera-double-math-models.json.pending',dir);await writeFile(t,JSON.stringify(rows,null,2)+'\n');await rename(t,p);console.log(JSON.stringify(rows,null,2));}
