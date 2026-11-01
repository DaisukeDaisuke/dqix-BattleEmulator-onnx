// UI projection for the separately proved enclosing numeric camera runner.
// The prior five phase runners are imported transitively without modification.
import {createCameraEnclosingGeometryRunner,CAMERA_ENCLOSING_GEOMETRY_MODELS} from './camera-enclosing-geometry-runner.mjs';
export const CAMERA_ENCLOSING_PHASE_MODELS=CAMERA_ENCLOSING_GEOMETRY_MODELS;
export const CAMERA_EXPLICIT_CPU_MODELS=['rom-camera-reverse-polar-values-cpu3'];
const integer=(value,min,max,label)=>{if(!Number.isInteger(value)||value<min||value>max)throw Error(`Initial ${label} must be an integer in [${min},${max}]`);};
function vector(values,width,min,max,label){if(!Array.isArray(values)||values.length!==width)throw Error(`Initial ${label} width must be ${width}`);values.forEach((x,i)=>integer(x,min,max,`${label}[${i}]`));}
function validateInitial(row,lane){
 const g=row.cameraGeometry;if(!g||row.initialGeometryLayout!=='explicit-zero-camera-with-fields-v1')throw Error(`Lane ${lane}: explicit initial camera layout required`);
 for(const name of['position','lookAt'])vector(g[name],3,-4194303,4194303,`cameraGeometry.${name}`);
 vector(g.polar,3,-4194304,4194304,'cameraGeometry.polar');
 integer(g.polar[1],-262143,262143,'cameraGeometry.polar.height');integer(g.polar[2],-262143,262143,'cameraGeometry.polar.distance');
 integer(g.roll,-32768,32767,'cameraGeometry.roll');vector(g.rollScratch,2,-32768,32767,'cameraGeometry.rollScratch');
 vector(g.globals7,7,-2147483648,2147483647,'cameraGeometry.globals7');integer(g.range,-2147483648,2147483647,'cameraGeometry.range');
 integer(g.counter,0,5,'cameraGeometry.counter');integer(g.mode,0,255,'cameraGeometry.mode');
 for(const name of['initialized','camera261','firstCameraFlag'])integer(g[name],0,1,`cameraGeometry.${name}`);
 for(const name of['sourceId','targetId'])integer(g[name],0,255,`cameraGeometry.${name}`);
 if(row.initialCameraFlagsU16!==undefined)vector(row.initialCameraFlagsU16,2,0,65535,'initialCameraFlagsU16');
 vector(row.commandBaseU16,2,0,65535,'commandBaseU16');vector(row.cameraRngPointerU16,2,0,65535,'cameraRngPointerU16');
 const state=[g.counter,g.globals7[0],g.globals7[1],g.globals7[3],g.globals7[4]];
 if(!Array.isArray(row.cameraState)||state.some((x,i)=>!Object.is(x,row.cameraState[i]))||g.initialized!==+!!row.cameraInitialized)throw Error(`Lane ${lane}: camera scalar and raw-memory initial fields disagree`);
}
function memoryView(g,limbs){return{words160:Array.from({length:160},(_,j)=>limbs[j*2]+65536*limbs[j*2+1]),position:g.position,lookAt:g.lookAt,polar:g.polar,roll:g.roll,rollScratch:g.rollScratch,range:g.range,mode:g.mode,counter:g.counter,initialized:g.initialized,camera261:g.camera261,sourceId:g.sourceId,targetId:g.targetId};}
export async function createCameraEnclosingPhaseRunner(options){
 if(typeof options?.runDoubleGraph!=='function')throw Error('Explicit CPU DOUBLE provider runDoubleGraph is required; implicit GPU fallback is forbidden');
 const runner=await createCameraEnclosingGeometryRunner(options);
 async function run({rows,...rest}){
  rows.forEach(validateInitial);
  const result=await runner.run({rows,...rest});if(!result.complete)return result;
  const presentation=result.world.prior.event;
  return{...result,presentation,states:result.states.map((state,i)=>({...state,cameraMemory:memoryView(result.cameraGeometry[i],result.cameraU16[i])})),explicitCpuModels:CAMERA_EXPLICIT_CPU_MODELS,wholeCameraComplete:false};
 }
 return{run,runRows:(rows,options={})=>run({rows,...options}),models:CAMERA_ENCLOSING_PHASE_MODELS};
}
