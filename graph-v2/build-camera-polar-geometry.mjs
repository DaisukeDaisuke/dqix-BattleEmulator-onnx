import {sourceSHA256} from '../data/source-authority.mjs';
// Additive camera polar primitives. The five delivered camera phase packs stay frozen.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {Graph} from './graph-builder.mjs';
import {unsignedBytes,multiplyBytes,bytesGreaterEqual} from './build-camera-facing-math.mjs';
import {exactMultiplyQ12,exactSinCos,actualSinCosTable} from './build-camera-fixed-math.mjs';
const root=new URL('../',import.meta.url),dir=new URL('./',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex');
async function authorities(){return Promise.all(['restored/dqix-decomp-decomp-matching/src/NitroSDK/Main/func_020c2c04.cpp','restored/dqix-decomp-decomp-matching/src/NitroSDK/Main/func_020c2cc4.cpp','restored/dqix-decomp-decomp-matching/src/Combat/Main/func_0202e5d8.cpp','restored/dqix-decomp-decomp-matching/src/NitroSDK/Main/Mat4x3_WriteRotationY.cpp','restored/dqix-decomp-decomp-matching/src/NitroSDK/Main/func_020c2034.cpp','evidence-v2/ghidra/camera-presentation-order-defined/response.json'].map(path=>({path,sha256:sourceSHA256(path)})));}
function annotate(g,first,why){for(const n of g.nodes.slice(first))if(n.roundingSite){n.exactArithmetic=true;n.exactArithmeticReason=why;}}
export function exactSdkSqrt(g,value){
 const first=g.nodes.length,positive=g.max(value,0),source=[0,0,0,0,...unsignedBytes(g,positive,3),0];let result=g.sub(value,value);
 // SDK return is floor((isqrt(value<<32)+512)/1024). For y>=1,
 // this is >=y iff (1024*y-512)^2 <= value<<32. Search y directly.
 for(let bit=18;bit>=0;bit--){
  const candidate=g.add(result,2**bit),threshold=g.sub(g.mul(candidate,1024),512),b=unsignedBytes(g,threshold,4),square=multiplyBytes(g,b,b,8),take=bytesGreaterEqual(g,source,square);
  result=g.where(take,candidate,result);
 }
 annotate(g,first,'Input signed integer magnitude<=2^24-1. Positive input is held in three byte limbs and shifted32 as eight limbs. Candidate y<2^19; threshold1024*y-512 is an exact binary32 multiple of512 below2^29. Its squared product stays in byte limbs with coefficients/carries<2^20. Exact19-bit search computes the original rounded SDK sqrt without any approximate float sqrt.');
 return result;
}
export async function buildSdkSqrt(){
 const g=new Graph('rom-sdk-fixed-sqrt',{authority:await authorities(),scope:'SDK signed fixed-point square root for admitted integer input±(2^24-1). Nonpositive returns0; positive input is the hardware64-bit operand input<<32, then original(root+0x200)>>10. The19-bit threshold search is mathematically equivalent to the original integer root followed by rounding.',scopeJa:'整数平方根と、その後のQ12丸めをbyteの比較で正確に再現します。',inputDomains:{value:{width:1,min:-16777215,max:16777215,integer:true}},defaults:{value:8192},inputContractVersion:1,feedback:{},defaultSteps:1});
 const value=g.cast(g.input('value',['N',1],'int32'),'float32');g.output(g.cast(exactSdkSqrt(g,value),'int32'),'result');return g;
}
export async function buildCameraSetPolar(){
 const table=await actualSinCosTable(),angleModelPath='graph-v2/rom-camera-angle-reduce.json',angleBytes=await readFile(new URL(angleModelPath,root)),angleModel=JSON.parse(angleBytes),g=new Graph('rom-camera-set-polar3',{authority:[...await authorities(),table.authority,{path:angleModelPath,sha256:hash(angleBytes)}],scope:'Original set-camera-polar helper from initial lookAtXYZ,angle,height,distance. Stores reducedangle/height/distance, computes rounded Q12 squared distance minus height, exact SDKsqrt, exact original Y rotation table and signed64 arithmetic shift with NO extra0x800 during matrix application. Camera worldXYZ is lookAt plus the rotated vector. Other camera matrix/state fields are outside this primitive.',scopeJa:'初期注視点と極座標から、ROMの整数平方根・Y回転・行列積を通してカメラXYZを求めます。',inputDomains:{lookAt:{width:3,min:-4194303,max:4194303,integer:true},angle:{width:1,min:-4194304,max:4194304,integer:true},height:{width:1,min:-65536,max:65536,integer:true},distance:{width:1,min:-65536,max:65536,integer:true}},defaults:{lookAt:[0,204,0],angle:11580,height:2048,distance:20480},inputContractVersion:1,feedback:{},defaultSteps:1});
 const look=g.split(g.input('lookAt',['N',3],'int32'),3),angle=g.input('angle',['N',1],'int32'),height=g.input('height',['N',1],'int32'),distance=g.input('distance',['N',1],'int32'),h=g.cast(height,'float32'),d=g.cast(distance,'float32');
 const a=g.inline(angleModel,{angle,enabled:g.eq(angle,angle)},'polar_angle').nextAngle,angleFloat=g.cast(a,'float32'),trig=exactSinCos(g,angleFloat,table.values);
 const heightSquared=exactMultiplyQ12(g,h,h).value,distanceSquared=exactMultiplyQ12(g,d,d).value,squared=g.sub(distanceSquared,heightSquared),radius=exactSdkSqrt(g,g.cast(squared,'float32'));
 const offsetX=exactMultiplyQ12(g,radius,trig.sine,false).value,offsetZ=exactMultiplyQ12(g,radius,trig.cosine,false).value,offset=[offsetX,height,offsetZ],world=look.map((v,i)=>g.add(v,offset[i]));
 g.output(g.cat(world),'position');g.output(g.cat([a,height,distance]),'polar');g.output(g.cat(offset),'rotatedOffset');g.output(squared,'radialSquared');g.output(g.cast(radius,'int32'),'radius');return g;
}
export async function savePolarGraph(g){const binary=g.model(),ir=JSON.stringify(g.json(),null,2)+'\n';for(const[ext,b]of[['onnx',binary],['json',ir]]){const p=new URL(`${g.name}.${ext}`,dir),t=new URL(`${g.name}.${ext}.pending-${process.pid}`,dir);await writeFile(t,b);await rename(t,p);}return{name:g.name,sha256:hash(binary),irSHA256:hash(ir),nodes:g.nodes.length,bytes:binary.length};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const results=[];for(const build of[buildSdkSqrt,buildCameraSetPolar])results.push(await savePolarGraph(await build()));const p=new URL('camera-polar-geometry-models.json',dir),t=new URL('camera-polar-geometry-models.json.pending',dir);await writeFile(t,JSON.stringify(results,null,2)+'\n');await rename(t,p);console.log(JSON.stringify(results,null,2));}
