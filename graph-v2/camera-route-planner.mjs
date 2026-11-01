// Browser-compatible control flow. All path, movement, blocking, compression,
// record-order and route-count arithmetic is evaluated by ONNX models.
import {validateGraphInputs} from './input-domains.mjs';
export const CAMERA_ROUTE_MODELS=['rom-camera-route-prepare','rom-camera-route-step','rom-camera-route-accept','rom-camera-route-finalize'];
const stateFields=['positions','passStart','rawRoutes','rawCounts','skip','meta'],array=x=>Array.isArray(x)?[...x]:[x];
const nextName=x=>`next${x[0].toUpperCase()+x.slice(1)}`;
export async function createCameraRoutePlanner({runGraph,getModel,onTrace}={}){
  if(typeof runGraph!=='function'||typeof getModel!=='function')throw Error('runGraph and getModel required');
  const models=Object.fromEntries(await Promise.all(CAMERA_ROUTE_MODELS.map(async name=>[name,await getModel(name)])));
  // Each of12 actors can accept at most15 moves. A final no-change pass
  // consumes at most one full command traversal, plus the terminating check.
  const commandCapacity=models['rom-camera-route-prepare'].inputs.find(x=>x.name==='actionActors').shape[1],maximumAttempts=181*commandCapacity+1;
  const defaults=name=>Object.fromEntries(Object.entries(models[name].contract.defaults).map(([k,v])=>[k,array(v)]));
  let graphCalls=0,pathMicrosteps=0;
  async function call(name,rows,phase){
    const ir=models[name],base=defaults(name),contract=structuredClone(ir.contract);
    // The older path model predates vector-width contract metadata. Derive
    // those widths from its actual schema; still enforce its<=12 block bound.
    for(const [key,rule]of Object.entries(contract.inputDomains??{}))if(rule.width===undefined){const input=ir.inputs.find(x=>x.name===key);if(input&&input.shape[1]>1)rule.width=input.shape[1];}
    const reductions=(contract.relations??[]).filter(x=>x.left.reduce);contract.relations=(contract.relations??[]).filter(x=>!x.left.reduce);
    const inputs=rows.map((row,lane)=>{
      const values=Object.fromEntries(ir.inputs.map(d=>{const v=array(row[d.name]??base[d.name]);if(v.length!==d.shape[1])throw Error(`${name}.${d.name} width lane${lane}`);for(const x of v){if(d.dtype==='bool'&&![true,false,0,1].includes(x))throw Error(`${name}.${d.name} Boolean lane${lane}`);if(d.dtype!=='bool'&&(typeof x!=='number'||!Number.isFinite(x)))throw Error(`${name}.${d.name} number lane${lane}`);}return[d.name,v];}));
      const errors=validateGraphInputs(contract,values);for(const r of reductions){if(r.left.reduce!=='sum'||r.op!=='<='||r.right.value===undefined)throw Error('Unknown path reduction contract');if(values[r.left.input].reduce((a,b)=>a+b,0)>r.right.value)errors.push(`${r.left.input} sum exceeds ${r.right.value}`);}
      if(errors.length)throw Error(`${name} lane${lane}: ${errors.slice(0,4).join('; ')}`);return values;
    });
    const outputs=await runGraph(name,inputs,{phase});graphCalls++;if(outputs.length!==rows.length)throw Error(`${name} changed batch lanes`);if(onTrace)await onTrace({phase,model:name,inputs,outputs});return outputs;
  }
  async function run({rows,maxAttempts=maximumAttempts}={}){
    if(!Array.isArray(rows)||!rows.length)throw Error('A nonempty lane batch is required');if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>maximumAttempts)throw Error(`maxAttempts must be1..${maximumAttempts}`);
    graphCalls=0;pathMicrosteps=0;const initial=defaults(CAMERA_ROUTE_MODELS[0]),states=rows.map(row=>({...structuredClone(initial),...Object.fromEntries(Object.entries(row).map(([k,v])=>[k,array(v)]))}));let complete=false,attempts=0;
    for(;attempts<maxAttempts;attempts++){
      const prep=await call('rom-camera-route-prepare',states,`camera:route:prepare${attempts}`);
      prep.forEach((p,i)=>{if(!p.supported[0])throw Error(`Camera route input outside supported roster contract lane${i}`);for(const field of stateFields)states[i][field]=[...p[nextName(field)]];});
      if(prep.every(x=>x.finished[0])){complete=true;break;}
      if(!prep.some(x=>x.needPath[0]))continue;
      let pathRows=prep.map(p=>({start:p.pathStart,goal:p.pathGoal,blocked:p.pathBlocked,maxRoute:[16],states:Array(324).fill(0),meta:[0,0,0]})),paths;
      for(let step=0;step<81;step++){
        paths=await call('rom-camera-route-step',pathRows,`camera:route:path${attempts}:${step}`);pathMicrosteps++;
        if(paths.every(x=>x.finished[0]))break;
        pathRows=pathRows.map((row,i)=>({...row,states:paths[i].nextStates,meta:paths[i].nextMeta}));
      }
      if(paths.some(x=>!x.finished[0]))throw Error('Path graph did not terminate within81node pops');
      const accepted=await call('rom-camera-route-accept',states.map((state,i)=>({...state,path:paths[i].route,pathCount:paths[i].count})),`camera:route:accept${attempts}`);
      accepted.forEach((out,i)=>{if(!out.supported[0])throw Error(`Camera route accept unsupported lane${i}`);for(const field of stateFields)states[i][field]=[...out[nextName(field)]];});
    }
    const output=await call('rom-camera-route-finalize',states,'camera:route:finalize');
    return {states,output,complete,attempts,graphCalls,pathMicrosteps,scope:'Ordered complete roster route planning only when complete=true. Initial record presence/order and start/goal/prior route buffers are explicit. No goal producer, actor-object creation, movement flag side effects or camera geometry commit.'};
  }
  return {run,models:CAMERA_ROUTE_MODELS};
}
