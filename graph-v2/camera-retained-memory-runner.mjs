// Additive continuation of the frozen geometry projection. Geometry uses the
// same immutable ONNX calls. Store composition begins from computed prior RAM.
import {createCameraEnclosingGeometryRunner,CAMERA_ENCLOSING_GEOMETRY_MODELS} from './camera-enclosing-geometry-runner.mjs';
import {validateGraphInputs} from './input-domains.mjs';
export const CAMERA_RETAINED_MEMORY_MODELS=CAMERA_ENCLOSING_GEOMETRY_MODELS;
const clone=x=>structuredClone(x);
function memoryInput(s,raw,operation){return{cameraU16:raw,operation:[operation],position:s.position,lookAt:s.lookAt,polar:s.polar,roll:[s.roll],rollScratch:s.rollScratch,range:[s.range],counter:[s.counter],mode:[s.mode],flagsIds:[s.initialized,s.camera261,s.sourceId,s.targetId]};}
function validateRetained(row,lane){
 if(row.retainedMemoryOrigin!=='computed-previous-outer-v1')throw Error(`lane${lane}: declared computed previous outer state required`);
 const raw=row.cameraU16,s=row.cameraGeometry;
 if(!Array.isArray(raw)||raw.length!==320||raw.some(x=>!Number.isInteger(x)||x<0||x>65535))throw Error('Retained camera memory must contain320 u16 limbs');
 const buffer=new ArrayBuffer(640),v=new DataView(buffer);raw.forEach((x,i)=>v.setUint16(i*2,x,true));
 const eq=(got,want,key)=>{if(!Object.is(got,want))throw Error(`lane${lane}: computed RAM/scalar ${key} disagree`);};
 for(let i=0;i<3;i++){eq(v.getInt32(4+i*4,true),s.position[i],`position${i}`);eq(v.getInt32(0x10+i*4,true),s.lookAt[i],`lookAt${i}`);eq(v.getInt32(0x70+i*4,true),s.polar[i],`polar${i}`);}
 eq(v.getInt16(0x7c,true),s.roll,'roll');eq(v.getInt16(0x1ec,true),s.rollScratch[0],'rollScratch0');eq(v.getInt16(0x1ee,true),s.rollScratch[1],'rollScratch1');
 eq(v.getInt32(0x224,true),-1,'resetMode');eq(v.getInt32(0x258,true),s.range,'range');eq(v.getInt32(0x25c,true),s.counter,'counter');eq(v.getUint8(0x220),s.mode,'mode');
 for(const[o,key]of[[0x260,'initialized'],[0x261,'camera261'],[0x262,'sourceId'],[0x263,'targetId']])eq(v.getUint8(o),s[key],key);
 const state=[s.counter,s.globals7[0],s.globals7[1],s.globals7[3],s.globals7[4]];state.forEach((x,i)=>eq(row.cameraState[i],x,`cameraState${i}`));eq(+!!row.cameraInitialized,s.initialized,'cameraInitialized');
 for(let i=0;i<2;i++)eq(v.getUint16(0x21c+2*i,true),row.cameraRngPointerU16[i],`RNGpointer${i}`);
}
export async function createCameraRetainedMemoryRunner({runGraph,runDoubleGraph,getModel,onTrace}={}){
 if(typeof runDoubleGraph!=='function')throw Error('Explicit CPU DOUBLE provider required');
 const geometry=await createCameraEnclosingGeometryRunner({runGraph,runDoubleGraph,getModel,onTrace});
 async function call(name,rows,phase){if(!rows.length)return[];const ir=await getModel(name);for(const[i,r]of rows.entries()){const errors=validateGraphInputs(ir.contract,r);if(errors.length)throw Error(`${name} lane${i}: ${errors.join('; ')}`);}const output=await runGraph(name,rows,{phase});if(onTrace)await onTrace({model:name,phase,inputs:clone(rows),outputs:clone(output)});return output;}
 async function run({rows,maxRouteAttempts=10861}){
  rows.forEach(validateRetained);
  // The frozen routine's scalar projection does not read its synthesized
  // zero-padding. Its raw-memory result is deliberately replaced below.
  const result=await geometry.run({rows:rows.map(r=>({...clone(r),initialGeometryLayout:'explicit-zero-camera-with-fields-v1'})),maxRouteAttempts});
  if(!result.complete)return result;
  const raw=rows.map(r=>[...r.cameraU16]),bindings=result.geometryBindings;
  const bind=(b,finish)=>({cameraU16:raw[b.i],commandBaseU16:rows[b.i].commandBaseU16,commandIndex:b.input.currentActionIndex,programFlagsByte0:[b.input.programFlagsBytes[0]],bindRecord:[!finish],finish:[finish]});
  const initialBind=await call('rom-camera-record-bind160',bindings.map(b=>bind(b,false)),'camera:retained:record');bindings.forEach((b,j)=>raw[b.i]=initialBind[j].nextCameraU16);
  const free=await call('rom-camera-memory-patch160',bindings.map(b=>memoryInput(result.nestedCamera[b.i].state,raw[b.i],0)),'camera:retained:free');bindings.forEach((b,j)=>raw[b.i]=free[j].nextCameraU16);
  const nested=result.nestedCamera.map((x,i)=>({...clone(x),cameraU16:[...raw[i]]}));
  for(const phase of result.following.phases){
   const patched=await call('rom-camera-memory-patch160',phase.indices.map((j,k)=>memoryInput(phase.states[k],raw[bindings[j].i],phase.name==='border_constraint'?2:1)),'camera:retained:'+phase.name);
   phase.indices.forEach((j,k)=>raw[bindings[j].i]=patched[k].nextCameraU16);
  }
  const finish=await call('rom-camera-record-bind160',bindings.map(b=>bind(b,true)),'camera:retained:finish');bindings.forEach((b,j)=>raw[b.i]=finish[j].nextCameraU16);
  return{...result,cameraU16:raw,nestedCamera:nested,retainedCameraMemory:true,wholeCameraComplete:false,scope:'Explicit later outer invocation, carrying previously computed640 camera bytes and world/scene/global state. Frozen scalar ONNX operations are unchanged; exact store graphs preserve every other byte. ResetMode−1, empty animation package lists, no async rendering, no nonempty auxiliary FIFO and the admitted caller ABI remain required. Runtime-generated resource requests are an append-only diagnostic ledger; no loader completion is invented.'};
 }
 return{run,runRows:(rows,options={})=>run({rows,...options}),models:CAMERA_RETAINED_MEMORY_MODELS};
}
