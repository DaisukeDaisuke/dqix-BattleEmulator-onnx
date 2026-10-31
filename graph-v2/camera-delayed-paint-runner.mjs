import {validateGraphInputs} from './input-domains.mjs';
export const CAMERA_DELAYED_PAINT_MODEL='rom-camera-delayed-paint-step';
export async function createCameraDelayedPaintRunner({runGraph,getModel,onTrace}={}){
  const ir=await getModel(CAMERA_DELAYED_PAINT_MODEL);
  async function run({rows}={}){
    if(!Array.isArray(rows)||!rows.length)throw Error('Nonempty delayed-paint batch required');let state=rows.map(r=>({...r,occupancy:[...r.occupancy],cursor:[0]})),last,calls=0;
    for(let i=0;i<37;i++){
      const inputs=state.map((r,lane)=>{const input=Object.fromEntries(ir.inputs.map(d=>{const v=r[d.name]??ir.contract.defaults[d.name],a=Array.isArray(v)?[...v]:[v];if(a.length!==d.shape[1])throw Error(`Delayed-paint ${d.name} width`);return[d.name,a];})),errors=validateGraphInputs(ir.contract,input);if(errors.length)throw Error(`Delayed-paint lane${lane}: ${errors.join('; ')}`);return input;});
      last=await runGraph(CAMERA_DELAYED_PAINT_MODEL,inputs,{phase:`camera:delayed-paint:${i}`});calls++;if(last.length!==rows.length)throw Error('Delayed-paint changed lane count');if(onTrace)await onTrace({phase:`camera:delayed-paint:${i}`,model:CAMERA_DELAYED_PAINT_MODEL,inputs,outputs:last});state=state.map((r,j)=>({...r,occupancy:last[j].nextOccupancy,cursor:last[j].nextCursor}));if(last.every(r=>!!r.complete[0]))return {output:last,graphCalls:calls,complete:true};
    }
    throw Error('Fixed37 unique-origin proof bound violated');
  }
  return {run,model:CAMERA_DELAYED_PAINT_MODEL};
}
