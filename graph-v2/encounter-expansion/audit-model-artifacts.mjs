// Validate actual protobuf tensors, not merely the generator's JSON values.
// This is a creation-time gate; it neither folds nor modifies a graph.
import {readOnnx} from '../../poc-v2/graph-runtime.mjs';
export function auditModelBytes(bytes,{name='unnamed'}={}){
  const graph=readOnnx(bytes),tensors=[...graph.initializers,...graph.nodes.filter(n=>n.op==='Constant').map(n=>n.attributes.value)],counts={tensors:0,elements:0,float32:0,int32:0,int64Index:0,bool:0};
  for(const t of tensors){
    if(!t||!Array.isArray(t.shape)||!Array.isArray(t.data))throw Error(name+': malformed constant tensor');
    if(t.shape.some(d=>!Number.isSafeInteger(d)||d<0))throw Error(name+': invalid constant shape '+t.name);
    const size=t.shape.reduce((a,b)=>a*b,1);if(!Number.isSafeInteger(size)||size!==t.data.length)throw Error(name+': tensor shape/data length differs '+t.name);
    if(![1,6,7,9].includes(t.dtype))throw Error(name+': unsupported constant dtype '+t.name);
    for(const v of t.data){
      if(t.dtype===1){if(typeof v!=='number'||!Number.isFinite(v)||!Object.is(Math.fround(v),v))throw Error(name+': nonfinite/nonbinary32 constant '+t.name);counts.float32++;}
      else if(t.dtype===9){if(typeof v!=='boolean')throw Error(name+': noncanonical boolean constant '+t.name);counts.bool++;}
      else{if(!Number.isInteger(v)||v< -2147483648||v>2147483647)throw Error(name+': invalid32-bit index constant '+t.name);counts[t.dtype===6?'int32':'int64Index']++;}
    }
    counts.tensors++;counts.elements+=size;
  }
  return{name,graphName:graph.name,...counts};
}
