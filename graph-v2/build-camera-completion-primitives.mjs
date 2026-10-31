// Additive completion helpers; no prior delivered camera graph is rewritten.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {Graph} from './graph-builder.mjs';
import cameraConstants from '../data/camera-constants.mjs';
import {sourceSHA256} from '../data/source-authority.mjs';
const root=new URL('../',import.meta.url),dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
const read=path=>readFile(new URL(path,root));
async function authority(path){return{path,sha256:sourceSHA256(path)};}
function finalize(g){for(const d of g.inputs)if(d.dtype==='bool')g.contract.inputDomains[d.name]={width:d.shape[1],values:[true,false,0,1]};g.contract.inputContractVersion=1;return g;}
export async function buildCameraAngleReduce(){
 const g=new Graph('rom-camera-angle-reduce',{scope:'Exact SDK Q12 angle reduction for signed integer input in[-4194304,4194304], including the rounded fixed-point divide and negative exact-period behavior. This is not ordinary modulo. No RNG.',scopeJa:'ROMの固定小数点角度正規化です。負の周期境界と除算の丸めを含み、−25735は25737になります。',authority:await Promise.all(['evidence-v2/ghidra/camera-angle-resources-defined/response.json','evidence-v2/ghidra/camera-coordinate-constants-defined/response.json','restored/dqix-decomp-decomp-matching/src/Graphics/ExtendedVectorMath.cpp'].map(authority)),address:'JPN ARM9 0x02030a68',formula:'For positive magnitude a, floor(round(a*4096/25736)/4096)=floor((a+3)/25736). Negative angle adds(q+1)*25736; positive angle>25736 subtracts q*25736; the closed interval[0,25736] is preserved. q is computed by eight exact integer threshold/subtraction steps, with no floating division. Returned values can be25737..25739 or-1..-3 near rounded period boundaries.',defaults:{angle:-25735,enabled:true},inputDomains:{angle:{width:1,min:-4194304,max:4194304,integer:true}},feedback:{angle:'nextAngle'},defaultSteps:1});
 const input=g.input('angle',['N',1],'int32'),enabled=g.input('enabled',['N',1],'bool'),angle=g.cast(input,'float32'),negative=g.lt(angle,0),a=g.where(negative,g.sub(0,angle),angle);
 let remainder=g.add(a,3),q=g.constant(0);
 for(const bit of[128,64,32,16,8,4,2,1]){const take=g.ge(remainder,25736*bit);q=g.add(q,g.where(take,bit,0));remainder=g.sub(remainder,g.where(take,25736*bit,0));}
 const reduced=g.where(negative,g.add(angle,g.mul(g.add(q,1),25736)),g.where(g.gt(angle,25736),g.sub(angle,g.mul(q,25736)),angle));
 g.output(g.where(enabled,g.cast(reduced,'int32'),input),'nextAngle');g.output(g.where(enabled,g.cast(q,'int32'),g.constant(0,'int32')),'divisionPeriods');g.output(g.and(enabled,g.not(g.eq(reduced,angle))),'changed');return finalize(g);
}
export async function actualNodeCoordinates(){
 const table=structuredClone(cameraConstants.coordinates);
 if(table.coords.length!==256||table.coords.some(x=>!Array.isArray(x)||x.length!==2||x.some(v=>!Number.isInteger(v)||v<-2147483648||v>2147483647)))throw Error('Invalid byte coordinate table');
 for(const source of table.sources)if(source.sha256!==sourceSHA256(source.path))throw Error('Coordinate provenance changed');
 return table;
}
export async function buildCameraRouteFinalize16(){
 const {coords,sources}=await actualNodeCoordinates(),g=new Graph('rom-camera-route-finalize16',{scope:'Actual route finalization helper JPN02049c4c: consecutive duplicate compression, already-reached next-node removal and movement bit0x10. All16raw route bytes, including unused tails, are retained exactly. Node0..255 coordinate weights are the256 actual ARM getter returns. No RNG, path allocation or route search.',scopeJa:'移動経路の連続重複を詰め、すでに到達した先頭の節点を除きます。未使用の経路バイトもROMと同じ書込み順で保持します。',authority:[await authority('restored/dqix-decomp-decomp-matching/src/Combat/Main/func_02048e2c.cpp'),...sources],address:'JPN ARM9 0x02049c4c',defaults:{route:[0,0,10,10,20,20,...Array(10).fill(77)],count:6,resetPosition:[-21283,22,-18432],flagsBytes:[0,0,0,0],visualPresent:true,enabled:true},inputDomains:{route:{width:16,min:0,max:255,integer:true},count:{width:1,min:0,max:16,integer:true},resetPosition:{width:3,min:-2147483648,max:2147483647,integer:true},flagsBytes:{width:4,min:0,max:255,integer:true}},feedback:{route:'nextRoute',count:'nextCount',flagsBytes:'nextFlagsBytes'},defaultSteps:1,notes:['count0 still reads a valid16byte input buffer but returns count0 with unchanged bytes.','When a reached next node reduces count2 tocount1, the function returns count0 without shifting that last node.','The helper does not clear a preexisting movement flag when count becomes0.'],coordinateSources:sources});
 const routeInput=g.input('route',['N',16]),countInput=g.input('count'),position=g.split(g.input('resetPosition',['N',3],'int32'),3),flags=g.split(g.input('flagsBytes',['N',4]),4),active=g.and(g.input('visualPresent',['N',1],'bool'),g.input('enabled',['N',1],'bool'));
 const original=g.split(routeInput,16);let route=[...original],last=original[0],count=g.constant(1);
 for(let i=1;i<16;i++){
  const append=g.and(g.lt(i,countInput),g.not(g.eq(original[i],last)));
  route=route.map((v,j)=>j===0?v:g.where(g.and(append,g.eq(count,j)),original[i],v));
  count=g.add(count,g.cast(append,'float32'));last=g.where(append,original[i],last);
 }
 count=g.where(active,g.where(g.le(count,1),0,count),countInput);route=route.map((v,i)=>g.where(active,v,original[i]));
 const xs=g.constant(coords.map(v=>v[0]),'int32',[256]),zs=g.constant(coords.map(v=>v[1]),'int32',[256]);let searching=g.and(active,g.gt(count,1)),markMovement=g.eq(countInput,-1);
 for(let step=0;step<15;step++){
  const node=g.cast(route[1],'int32'),x=g.op('Gather',[xs,node],{axis:0},{shape:['N',1],dtype:'int32'}),z=g.op('Gather',[zs,node],{axis:0},{shape:['N',1],dtype:'int32'}),reached=g.and(g.eq(x,position[0]),g.eq(z,position[2])),remove=g.and(searching,reached),after=g.sub(count,1),shift=g.and(remove,g.gt(after,1));
  markMovement=g.or(markMovement,g.and(searching,g.not(reached)));
  route=route.map((v,j)=>j===0||j===15?v:g.where(g.and(shift,g.lt(j,after)),route[j+1],v));
  count=g.where(remove,g.where(g.le(after,1),0,after),count);searching=g.and(remove,g.gt(count,1));
 }
 const low=flags[0],hasBit=g.ge(g.sub(low,g.mul(g.floor(g.mul(low,1/32)),32)),16),newLow=g.where(g.and(markMovement,g.not(hasBit)),g.add(low,16),low);
 g.output(g.cat(route),'nextRoute');g.output(count,'nextCount');g.output(g.cat([newLow,...flags.slice(1)]),'nextFlagsBytes');g.output(markMovement,'movementStarted');return finalize(g);
}
export async function saveCompletionGraph(g){const binary=g.model(),ir=JSON.stringify(g.json(),null,2)+'\n';for(const[ext,b]of[['onnx',binary],['json',ir]]){const path=new URL(`${g.name}.${ext}`,dir),t=new URL(`${g.name}.${ext}.pending-${process.pid}`,dir);await writeFile(t,b);await rename(t,path);}return{name:g.name,sha256:hash(binary),irSHA256:hash(ir),nodes:g.nodes.length,bytes:binary.length};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const report=[];for(const build of[buildCameraAngleReduce,buildCameraRouteFinalize16])report.push(await saveCompletionGraph(await build()));const p=new URL('camera-completion-primitive-models.json',dir),t=new URL('camera-completion-primitive-models.json.pending',dir);await writeFile(t,JSON.stringify(report,null,2)+'\n');await rename(t,p);console.log(JSON.stringify(report,null,2));}
