// An opt-in compiler adapter for constant Gather, not a battle rule.
// Original ONNX hashes are checked before exact constant evaluation. The
// published compiler/runtime and original ONNX binaries remain unchanged.
import {readOnnx} from './graph-runtime.mjs';
import {ResidentProgramSession} from './resident-runtime.mjs';
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
export function foldSingleRowConstantGather(graph){
  const inputNames=new Set(graph.inputs.map(v=>v.name)),initializerNames=new Set(graph.initializers.map(v=>v.name));
  // ONNX initializers that also appear in graph.inputs are runtime-overridable.
  const result={...graph,nodes:[],initializers:[...graph.initializers]},constants=new Map(graph.initializers.filter(v=>!inputNames.has(v.name)).map(v=>[v.name,v])),folds=[];
  for(const node of graph.nodes){
    const data=constants.get(node.inputs[0]),indices=constants.get(node.inputs[1]);
    if(node.op==='Gather'&&(node.attributes.axis??0)===1&&node.outputs.length===1&&data?.shape.length===2&&data.shape[0]===1&&indices&&[6,7].includes(indices.dtype)){
      const width=data.shape[1];if(!Number.isInteger(width)||width<1||data.data.length!==width)throw Error('Invalid constant Gather source shape');
      if(indices.shape.reduce((a,b)=>a*b,1)!==indices.data.length)throw Error('Invalid constant Gather index shape');
      const selected=indices.data.map(index=>{if(!Number.isInteger(index)||index< -width||index>=width)throw Error('Constant Gather index outside ONNX domain');return data.data[index<0?width+index:index];});
      const value={name:node.outputs[0],dtype:data.dtype,shape:[1,...indices.shape],data:selected};
      if(initializerNames.has(value.name)||inputNames.has(value.name))throw Error('Constant Gather output aliases an initializer or input');
      initializerNames.add(value.name);
      constants.set(value.name,value);result.initializers.push(value);folds.push({node:node.name??null,output:value.name,source:node.inputs[0],indices:node.inputs[1],shape:value.shape,elements:selected.length});
    }else result.nodes.push(node);
  }
  return{graph:result,folds};
}
export class ConstantGatherResidentSession{
  static async create(program,options={}){
    if(typeof options.getModel!=='function')throw Error('Binary model loader is required');
    const expected=new Map(program.modules.map(m=>[m.name,m.sha256])),models=new Map(),folds=[];
    for(const[name,hash]of expected){
      const data=await options.getModel(name);if(!data?.onnx)throw Error('Constant-folding adapter requires original ONNX bytes: '+name);
      const bytes=typeof data.onnx==='string'?Uint8Array.from(atob(data.onnx),c=>c.charCodeAt(0)):data.onnx instanceof Uint8Array?data.onnx:new Uint8Array(data.onnx);
      if(await sha(bytes)!==hash)throw Error('Constant-folding adapter ONNX SHA mismatch: '+name);
      const folded=foldSingleRowConstantGather(readOnnx(bytes));models.set(name,{...data,onnx:undefined,graph:folded.graph});if(folded.folds.length)folds.push({model:name,sha256:hash,folds:folded.folds});
    }
    const session=await ResidentProgramSession.create(program,{...options,getModel:name=>models.get(name)});
    session.constantGatherFolds=folds;session.constantGatherOriginalSHA256Verified=true;return session;
  }
}
