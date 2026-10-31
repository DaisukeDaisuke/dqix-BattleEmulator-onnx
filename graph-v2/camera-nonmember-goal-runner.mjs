import {validateGraphInputs} from './input-domains.mjs';
export const CAMERA_NONMEMBER_MODELS=['rom-camera-nonmember-goal-prepare','rom-camera-ring-labels','rom-camera-class-paint','rom-camera-nonmember-goal-finalize'];
const array=x=>Array.isArray(x)?[...x]:[x];
export async function createCameraNonmemberGoalRunner({runGraph,getModel,onTrace}={}){
  if(typeof runGraph!=='function'||typeof getModel!=='function')throw Error('runGraph and getModel required');const models=Object.fromEntries(await Promise.all(CAMERA_NONMEMBER_MODELS.map(async n=>[n,await getModel(n)])));
  async function call(name,rows,phase){
    const ir=models[name],defaults=ir.contract.defaults;const inputs=rows.map((row,lane)=>{const values=Object.fromEntries(ir.inputs.map(d=>{const value=array(row[d.name]??defaults[d.name]);if(value.length!==d.shape[1])throw Error(`${name}.${d.name} width lane${lane}`);return [d.name,value];})),errors=validateGraphInputs(ir.contract,values);if(errors.length)throw Error(`${name} lane${lane}: ${errors.join('; ')}`);return values;});
    const outputs=await runGraph(name,inputs,{phase});if(outputs.length!==rows.length)throw Error('Nonmember graph changed batch lanes');if(onTrace)await onTrace({phase,model:name,inputs,outputs});return outputs;
  }
  async function run({rows}={}){
    if(!Array.isArray(rows)||!rows.length)throw Error('Nonempty lane batch required');
    const prepared=await call(CAMERA_NONMEMBER_MODELS[0],rows,'camera:nonmember:prepare');prepared.forEach((p,i)=>{if(!p.supported[0])throw Error(`lane${i}: selected target pivot outside0..80`);});
    const labels=await call('rom-camera-ring-labels',rows.map((r,i)=>({occupancy:prepared[i].clearedOccupancy,origin:prepared[i].origin,radius:prepared[i].radius,delay:prepared[i].delay,enabled:r.enabled??[true]})),'camera:nonmember:ring');
    const painted=await call('rom-camera-class-paint',rows.map((r,i)=>({occupancy:labels[i].nextOccupancy,origin:prepared[i].origin,actorClass:[r.actor[0]],maximumDepth:prepared[i].effectiveDepth,enabled:r.enabled??[true]})),'camera:nonmember:target-footprint');
    const chosen=await call('rom-camera-nonmember-goal-finalize',rows.map((r,i)=>({...r,distanceLabels:painted[i].nextOccupancy})),'camera:nonmember:choose');
    const restored=await call('rom-camera-class-paint',chosen.map(c=>({occupancy:c.occupancyBeforeRestorePaint,origin:c.restorePaintOrigin,actorClass:c.restorePaintValue,maximumDepth:c.restorePaintDepth,enabled:c.restorePaintEnabled})),'camera:nonmember:source-footprint');
    return {output:chosen.map((c,i)=>({...c,nextOccupancy:restored[i].nextOccupancy})),prepared,distanceLabels:painted.map(p=>p.nextOccupancy),graphCalls:5,scope:'Complete nonmember AssignGoal projection from only initial occupancy/source/target/flags. Fixed matrix ring and shared ordered class-paint graphs are reused; candidate scratch preserves the actual inner/outer12-byte alias. Current participant/member branch is not executed.'};
  }
  return {run,models:CAMERA_NONMEMBER_MODELS};
}
