// Browser-compatible ordered roster wiring. Occupancy reset, paints, barriers
// and all byte/coordinate arithmetic stay in the ONNX graph.
import {validateGraphInputs} from './input-domains.mjs';
export const CAMERA_OCCUPANCY_MODEL='rom-camera-occupancy-step';
const arr=x=>Array.isArray(x)?[...x]:[x];
export async function createCameraOccupancyRunner({runGraph,getModel,onTrace}={}){
  if(typeof runGraph!=='function'||typeof getModel!=='function')throw Error('runGraph and getModel are required');
  const ir=await getModel(CAMERA_OCCUPANCY_MODEL),defaults=Object.fromEntries(Object.entries(ir.contract.defaults).map(([k,v])=>[k,arr(v)]));
  async function rebuild({rows}={}){
    if(!Array.isArray(rows)||!rows.length)throw Error('A nonempty lane batch is required');
    const states=rows.map((row,i)=>{
      if(!Array.isArray(row.occupancy)||row.occupancy.length!==81)throw Error(`lane${i}: explicit81-cell initial occupancy required`);
      if(!Array.isArray(row.actors)||row.actors.length>12)throw Error(`lane${i}: actual ordered roster must contain0..12 actors`);
      return {occupancy:[...row.occupancy],actors:row.actors,enabled:arr(row.enabled??true)};
    });
    const steps=Math.max(1,...states.map(x=>x.actors.length));
    for(let slot=0;slot<steps;slot++){
      const inputs=states.map((state,lane)=>{
        const actor=state.actors[slot],supplied={...defaults,...actor,occupancy:state.occupancy,initialize:[slot===0],rowPresent:[!!actor],enabled:state.enabled};
        const values=Object.fromEntries(ir.inputs.map(d=>{
          const value=arr(supplied[d.name]);if(value.length!==d.shape[1])throw Error(`lane${lane}: invalid${d.name}width`);
          for(const x of value){if(d.dtype==='bool'&&![true,false,0,1].includes(x))throw Error(`lane${lane}: invalid${d.name}Boolean`);if(d.dtype!=='bool'&&(typeof x!=='number'||!Number.isFinite(x)))throw Error(`lane${lane}: invalid${d.name}number`);}
          return[d.name,value];
        }));
        const errors=validateGraphInputs(ir.contract,values);if(errors.length)throw Error(`lane${lane}: ${errors.join('; ')}`);
        return values;
      });
      const outputs=await runGraph(CAMERA_OCCUPANCY_MODEL,inputs,{phase:`camera:occupancy:row${slot}`});if(outputs.length!==states.length)throw Error('Occupancy graph changed batch lanes');
      outputs.forEach((out,lane)=>{states[lane].occupancy=[...out.nextOccupancy];});
      if(onTrace)await onTrace({phase:`camera:occupancy:row${slot}`,model:CAMERA_OCCUPANCY_MODEL,inputs,outputs});
    }
    return {occupancy:states.map(x=>x.occupancy),graphCalls:steps,scope:'Only actual-roster occupancy rebuild. Each call applies the same ONNX row rules in supplied order. No object/goal/row+4 production or full camera lifecycle is modeled.'};
  }
  return {rebuild,model:CAMERA_OCCUPANCY_MODEL};
}
