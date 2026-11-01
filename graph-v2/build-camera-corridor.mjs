// Exact shared calculations for the flag0x80 / action9..11 camera corridor.
// Runtime inputs are positions and computed roster state, never ROM or traces.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {Graph} from './graph-builder.mjs';
import cameraConstants from '../data/camera-constants.mjs';
import {sourceSHA256} from '../data/source-authority.mjs';
import {exactRoundedDistance} from './build-camera-geometry.mjs';
import {exactPositiveFixDivide,exactMultiplyQ12,signedWordFromBytes} from './build-camera-fixed-math.mjs';
import {unsignedBytes,multiplyBytes,normalizeByteCoefficients} from './build-camera-facing-math.mjs';
const F=(g,x)=>g.cast(x,'float32'),I=(g,x)=>g.cast(x,'int32'),integer=(min,max,width=1)=>({min,max,integer:true,width});
const authority={matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10',sources:[
 {path:'src/Graphics/func_02031468.cpp',sha256:'af248ee6fd2cb34a3b1d9e0d3f9d5b3f7f6dd9510710b3278b15b6ae825eb065'},
 {path:'src/NitroSDK/Main/func_020c2df8.cpp',sha256:'a56254deaa6b6ec56eeee8428d570a1a0e565b59c912ec7461d4c4e488369d44'},
 ...['src/Combat/Overlay_25/func_ov025_021dffac.cpp','src/Combat/Overlay_25/func_ov025_021e1ff4.cpp','src/Graphics/ExtendedVectorMath.cpp'].map(path=>({path,sha256:sourceSHA256(path)}))]};

function exactDotQ12(g,a,b){
 const products=a.map((x,i)=>{const y=b[i],negative=g.not(g.eq(g.lt(x,0),g.lt(y,0))),magnitude=multiplyBytes(g,unsignedBytes(g,g.max(x,g.sub(0,x)),4),unsignedBytes(g,g.max(y,g.sub(0,y)),4),8),opposite=normalizeByteCoefficients(g,magnitude.map((v,j)=>g.add(g.sub(255,v),j===0?1:0)),8);return magnitude.map((v,j)=>g.where(negative,opposite[j],v));});
 const sum=normalizeByteCoefficients(g,Array.from({length:8},(_,j)=>products.reduce((v,p)=>g.add(v,p[j]),j===1?8:0)),8);
 const shifted=Array.from({length:4},(_,j)=>g.add(g.floor(g.mul(sum[j+1],1/16)),g.mul(g.sub(sum[j+2],g.mul(g.floor(g.mul(sum[j+2],1/16)),16)),16)));
 return signedWordFromBytes(g,shifted);
}

export async function buildCameraCorridorDistances(){
 const g=new Graph('rom-camera-corridor-distance81',{authority,scope:'Original fixed-point point-to-segment distance from source/target XYZ to all81 camera nodes. Exact rounded integer distances, rounded reciprocal scale, one rounded signed64 inner-product sum, clamped segment projection and final rounded distance. Valid nodes with distance<6144 form the corridor. No approximate floating-point line-distance replacement, RNG, renderer or resource state.',scopeJa:'元の固定小数点線分距離を81カメラnodeへ並列適用し、距離6144未満のnodeを共通計算します。',defaults:{sourcePosition:[-42566,0,-36864],targetPosition:[0,0,0]},inputDomains:{sourcePosition:integer(-4194303,4194303,3),targetPosition:integer(-4194303,4194303,3)},feedback:{},defaultSteps:1,
 proof:'Initial |XYZ|<=4194303 gives |AB delta|<=8388606 and rounded AB length<2^24. Each reciprocal-scaled vector component has magnitude<8192. Dot products are summed in signed64 byte limbs before a single +2048>>12. Projection is kept int32 and only cast to float after restricting to0..AB length. The rounded segment point can overshoot an endpoint by at most(2L)*(sqrt(3)*2L+1)/2^25+(sqrt(3)*2L+1)/8192+1; at L4194303 each final point-to-node delta stays below8388606. Thus all distance squares fit48bits; every packed FLOAT integer remains exact.'});
 const start=g.nodes.length,a=g.split(g.input('sourcePosition',['N',3]),3),b=g.split(g.input('targetPosition',['N',3]),3),coords=cameraConstants.coordinates.coords.slice(0,81),x=g.constant(coords.map(p=>p[0]),'float32',[1,81]),z=g.constant(coords.map(p=>p[1]),'float32',[1,81]),zero=g.mul(x,0),c=[x,zero,z];
 const ab=exactRoundedDistance(g,a,b).distance,ac=exactRoundedDistance(g,a,c).distance,qa=exactPositiveFixDivide(g,g.constant(4096),ab).result,qc=exactPositiveFixDivide(g,g.constant(4096),ac).result;
 const u=a.map((v,i)=>F(g,exactMultiplyQ12(g,g.sub(b[i],v),qa).value)),v=a.map((value,i)=>F(g,exactMultiplyQ12(g,g.sub(c[i],value),qc).value)),dot=exactDotQ12(g,u,v),projection=exactMultiplyQ12(g,ac,F(g,dot)).value;
 const behind=g.le(dot,g.constant(0,'int32')),beyond=g.lt(I(g,ab),projection),interior=g.and(g.not(behind),g.not(beyond)),safeProjection=F(g,g.where(interior,projection,g.constant(0,'int32')));
 const point=a.map((value,i)=>g.add(value,F(g,exactMultiplyQ12(g,u[i],safeProjection).value))),toPoint=exactRoundedDistance(g,c,point).distance,toEnd=exactRoundedDistance(g,c,b).distance;
 const distance=g.where(g.eq(ab,0),ac,g.where(g.eq(ac,0),0,g.where(behind,ac,g.where(beyond,toEnd,toPoint)))),valid=g.constant(Array.from({length:81},(_,i)=>i%18!==17),'bool',[1,81]);
 g.output(distance,'distances');g.output(g.and(valid,g.lt(distance,6144)),'selectedMask');g.output(dot,'dotQ12');g.output(projection,'projectionQ12');
 for(const node of g.nodes.slice(start))if(node.roundingSite&&!node.exactArithmetic){node.exactArithmetic=true;node.exactArithmeticReason='Coordinate and vector bounds in the corridor contract keep all FLOAT sums/differences below2^24. Signed products, dot sums and shifts use base256 limbs with coefficients below2^20; uint32 packing uses INT32. No cast of the potentially large unclamped projection to FLOAT is used for the segment point.';}
 return g;
}

export async function buildCameraCorridorConflict(){
 const g=new Graph('rom-camera-corridor-conflict12',{authority,scope:'Apply the computed81-node corridor mask to occupancy and the actual twelve-row roster. Selected cells become255; a nonexcluded actor whose initial auxiliary-or-start node is selected receives row+4=uint32(1) and auxiliary255. All other input bits remain unchanged.',defaults:{occupancy:Array(81).fill(0),selectedMask:Array(81).fill(false),roster:Array.from({length:12},()=>[255,0,255]).flat(),rosterCount:0,excludedIds:[0,192],row4Bytes:Array(48).fill(0),enabled:false},inputDomains:{occupancy:integer(0,255,81),roster:integer(0,255,36),rosterCount:integer(0,12),excludedIds:integer(0,255,2),row4Bytes:integer(0,255,48)},feedback:{},defaultSteps:1,equivalence:'The first matching selected node already writes1/255. Repeated later matches cannot change that final result. A row whose initial effective node never matches is unchanged. Therefore per-row mask membership equals the original ordered writes.'});
 const map=g.input('occupancy',['N',81]),mask=g.input('selectedMask',['N',81],'bool'),rows=g.split(g.input('roster',['N',36]),36),count=g.input('rosterCount'),excluded=g.split(g.input('excludedIds',['N',2]),2),raw=g.split(g.input('row4Bytes',['N',48]),48),enabled=g.input('enabled',['N',1],'bool'),changed=[],aux=[];
 for(let i=0;i<12;i++){const[id,start,oldAux]=rows.slice(i*3,i*3+3),occupied=g.where(g.lt(oldAux,81),oldAux,start),selected=g.op('GatherElements',[mask,I(g,g.min(occupied,80))],{axis:1},{shape:['N',1],dtype:'bool'}),write=g.and(enabled,g.gt(count,i),g.lt(occupied,81),selected,g.not(g.eq(id,excluded[0])),g.not(g.eq(id,excluded[1])));changed.push(write);aux.push(g.where(write,255,oldAux));}
 g.output(g.where(g.and(enabled,mask),255,map),'nextOccupancy');g.output(g.cat(aux),'nextAuxiliary');g.output(g.cat(changed),'writeRow4One');g.output(g.cat(raw.map((v,i)=>g.where(changed[Math.floor(i/4)],i%4===0?1:0,v))),'nextRow4Bytes');return g;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){const directory=process.argv[2]?pathToFileURL(resolve(process.argv[2])+'/'):new URL('./',import.meta.url);await mkdir(directory,{recursive:true});for(const graph of[await buildCameraCorridorDistances(),await buildCameraCorridorConflict()]){const result=await graph.save(directory);console.log(JSON.stringify({name:result.name,nodes:result.nodes,bytes:result.bytes}));}}
