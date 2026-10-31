// Browser-compatible tensor wiring for one observed presentation occurrence.
// No coordinate/distance, selector, RNG or camera-counter arithmetic runs here.
// Program selection, goal/occupancy production and row+4 observations must have
// been supplied upstream; this is not a complete camera lifecycle emulator.
import {validateGraphInputs} from './input-domains.mjs';
export const CAMERA_EVENT_MODELS=['rom-camera-distance3','rom-free-camera-selector','rom-free-camera-rng-step'];
const clone=x=>Array.isArray(x)?x.map(clone):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,clone(v)])):x;
const array=x=>Array.isArray(x)?[...x]:[x];

export async function createCameraEventRunner({runGraph,getModel,onTrace}={}){
  if(typeof runGraph!=='function'||typeof getModel!=='function')throw Error('runGraph and getModel are required');
  const models=Object.fromEntries(await Promise.all(CAMERA_EVENT_MODELS.map(async name=>[name,await getModel(name)])));
  const defaults=name=>Object.fromEntries(Object.entries(models[name].contract.defaults??{}).map(([k,v])=>[k,array(v)]));
  async function call(name,rows,phase){
    const ir=models[name],base=defaults(name);
    const inputs=rows.map((row,lane)=>{
      const values=Object.fromEntries(ir.inputs.map(d=>{
        const value=row[d.name]??base[d.name];if(value===undefined)throw Error(`${name}.${d.name}: missing input`);
        const v=array(value);if(v.length!==d.shape[1])throw Error(`${name}.${d.name}: wrong width in lane${lane}`);
        for(const x of v){if(d.dtype==='bool'&&!([true,false,0,1].includes(x)))throw Error(`${name}.${d.name}: invalid Boolean`);if(d.dtype!=='bool'&&(typeof x!=='number'||!Number.isFinite(x)))throw Error(`${name}.${d.name}: nonfinite/nonnumeric input`);}
        return[d.name,v];
      }));
      const errors=validateGraphInputs(ir.contract,values);if(errors.length)throw Error(`${name} domain violation lane${lane}: ${errors.slice(0,4).join('; ')}`);
      return values;
    });
    const outputs=await runGraph(name,inputs,{phase});if(!Array.isArray(outputs)||outputs.length!==rows.length)throw Error(`${name}: batch lanes changed`);
    if(onTrace)await onTrace({phase,model:name,inputs:clone(inputs),outputs:clone(outputs)});
    return {inputs,outputs};
  }
  function makeRow(row={}){
    const rng=defaults('rom-free-camera-rng-step');
    return {seed:array(row.seed??rng.seed),position:array(row.position??rng.position),cameraState:array(row.cameraState??rng.cameraState),enabled:array(row.enabled??true),presentation:{...defaults('rom-free-camera-selector'),...clone(row.presentation??{})},geometry:{...defaults('rom-camera-distance3'),...clone(row.geometry??{})},camera:{...rng,...clone(row.camera??{})}};
  }
  async function run({rows}={}){
    if(!Array.isArray(rows)||!rows.length)throw Error('A nonempty batch is required');
    const states=rows.map(makeRow);
    const distance=await call('rom-camera-distance3',states.map(s=>s.geometry),'camera:distance');
    const selector=await call('rom-free-camera-selector',states.map((s,i)=>({...s.presentation,geometry:[...distance.outputs[i].distance,...distance.inputs[i].radii],enabled:s.enabled})),'camera:selector');
    const camera=await call('rom-free-camera-rng-step',states.map((s,i)=>({...s.camera,seed:s.seed,position:s.position,cameraState:s.cameraState,forced:selector.outputs[i].forced,enabled:selector.outputs[i].callFreeCamera})),'camera:rng');
    states.forEach((s,i)=>{s.seed=[...camera.outputs[i].nextSeed];s.position=[...camera.outputs[i].nextPosition];s.cameraState=[...camera.outputs[i].nextCameraState];});
    return {states,geometry:distance.outputs,decisions:selector.outputs,camera:camera.outputs,graphCalls:3,scope:'One presentation occurrence with explicit program/history/route/world/object observations. Distance→selector→camera RNG is performed by three ONNX graphs. Goal/occupancy/row+4 producers, tracking opcodes and camera geometry/state commit are not implemented by this runner.'};
  }
  return {run,models:CAMERA_EVENT_MODELS};
}
