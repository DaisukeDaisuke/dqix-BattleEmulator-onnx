// Infer the exact type and shape of the pure operator subset from ONNX itself.
// Duplicated IR metadata is not an authority for removing Cast/Where nodes.
const types=new Map([[1,'float32'],[6,'int32'],[9,'bool']]);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function broadcast(shapes){
  const rank=Math.max(...shapes.map(s=>s.length)),out=Array(rank).fill(1);
  for(const shape of shapes)for(let i=0;i<shape.length;i++){const axis=rank-shape.length+i,a=out[axis],b=shape[i];if(a===b||b===1)continue;if(a===1)out[axis]=b;else throw Error('Incompatible ONNX broadcast dimensions');}
  return out;
}
export function inferPureOnnxMetadata(graph){
  const values=new Map(),constants=new Map(graph.initializers.map(t=>[t.name,t]));
  const put=(name,dtype,shape)=>{if(values.has(name)||!types.has(dtype)||shape.some(n=>typeof n!=='string'&&(!Number.isInteger(n)||n<1)))throw Error('Invalid or duplicate ONNX value '+name);values.set(name,{name,dtype,shape:[...shape]});};
  for(const v of [...graph.inputs,...graph.initializers])put(v.name,v.dtype,v.shape);
  const sameTypes=items=>{if(items.some(v=>v.dtype!==items[0].dtype))throw Error('ONNX operand types differ');return items[0].dtype;};
  for(const node of graph.nodes){
    const a=node.attributes??{},inputs=node.inputs.map(name=>{const v=values.get(name);if(!v)throw Error('Unknown ONNX value '+name);return v;}),first=inputs[0],emit=(dtype,shape)=>{if(node.outputs.length!==1)throw Error('Unexpected multiple ONNX outputs');put(node.outputs[0],dtype,shape);};
    if(node.op==='Identity'){emit(first.dtype,first.shape);continue;}
    if(node.op==='Cast'){if(!types.has(a.to))throw Error('Unsupported pure Cast type');emit(a.to,first.shape);continue;}
    if(node.op==='Floor'){if(first.dtype!==1)throw Error('Floor requires float32');emit(first.dtype,first.shape);continue;}
    if(node.op==='Div'){
      // The battle graph needs true float32 division at the original critical
      // probability rounding site. Integer division has a separate trapping
      // boundary and is deliberately outside this scalar reference subset.
      if(inputs.length!==2||inputs.some(v=>v.dtype!==1))throw Error('Pure Div requires two float32 operands');
      emit(1,broadcast(inputs.map(v=>v.shape)));continue;
    }
    if(node.op==='Not'){if(first.dtype!==9)throw Error('Not requires bool');emit(9,first.shape);continue;}
    if(['Add','Sub','Mul','Min','Max','Equal','Less','LessOrEqual','Greater','GreaterOrEqual','And','Or'].includes(node.op)){
      const dtype=sameTypes(inputs),isBoolean=['And','Or'].includes(node.op),comparison=['Equal','Less','LessOrEqual','Greater','GreaterOrEqual'].includes(node.op);
      if(isBoolean&&dtype!==9||!isBoolean&&!comparison&&dtype===9)throw Error('Invalid pure arithmetic type');emit(isBoolean||comparison?9:dtype,broadcast(inputs.map(v=>v.shape)));continue;
    }
    if(node.op==='Where'){if(inputs.length!==3||first.dtype!==9||inputs[1].dtype!==inputs[2].dtype)throw Error('Invalid Where type');emit(inputs[1].dtype,broadcast(inputs.map(v=>v.shape)));continue;}
    if(node.op==='Concat'){
      const rank=first.shape.length,axis=(a.axis??0)<0?(a.axis??0)+rank:(a.axis??0),dtype=sameTypes(inputs);if(axis<0||axis>=rank||inputs.some(v=>v.shape.length!==rank||v.shape.some((n,j)=>j!==axis&&n!==first.shape[j]))||inputs.some(v=>!Number.isInteger(v.shape[axis])))throw Error('Unsupported Concat shape');const shape=[...first.shape];shape[axis]=inputs.reduce((n,v)=>n+v.shape[axis],0);emit(dtype,shape);continue;
    }
    if(node.op==='Split'){
      const rank=first.shape.length,axis=(a.axis??0)<0?(a.axis??0)+rank:(a.axis??0),dimension=first.shape[axis];if(axis<0||axis>=rank||!Number.isInteger(dimension))throw Error('Unsupported Split axis');let sizes;
      if(node.inputs.length===2){sizes=constants.get(node.inputs[1])?.data;if(!sizes)throw Error('Dynamic Split sizes are outside the pure subset');}
      else{if(dimension%node.outputs.length)throw Error('Unequal Split is outside the pure subset');sizes=Array(node.outputs.length).fill(dimension/node.outputs.length);}
      if(sizes.length!==node.outputs.length||sizes.some(n=>!Number.isInteger(n)||n<1)||sizes.reduce((n,v)=>n+v,0)!==dimension)throw Error('Invalid Split lengths');node.outputs.forEach((name,i)=>{const shape=[...first.shape];shape[axis]=sizes[i];put(name,first.dtype,shape);});continue;
    }
    if(node.op==='MatMul'){
      const right=inputs[1];if(inputs.length!==2||first.dtype!==1||right.dtype!==1||first.shape.length!==2||right.shape.length!==2||first.shape[1]!==right.shape[0])throw Error('Pure MatMul requires compatible float32 matrices');emit(1,[first.shape[0],right.shape[1]]);continue;
    }
    if(node.op==='Gather'){
      const indices=inputs[1],rank=first.shape.length,axis=(a.axis??0)<0?(a.axis??0)+rank:(a.axis??0);if(inputs.length!==2||indices.dtype!==6||axis<0||axis>=rank)throw Error('Unsupported Gather metadata');emit(first.dtype,[...first.shape.slice(0,axis),...indices.shape,...first.shape.slice(axis+1)]);continue;
    }
    throw Error('Operator outside the pure metadata subset: '+node.op);
  }
  for(const output of graph.outputs){const inferred=values.get(output.name);if(!inferred||inferred.dtype!==output.dtype||!equal(inferred.shape,output.shape))throw Error('Declared ONNX output metadata differs: '+output.name);}
  return values;
}

export function canonicalPureIrValueMetadata(graph,ir){
  const inferred=inferPureOnnxMetadata(graph);
  const values={},differences=[];
  for(const [name,value] of inferred){const actual={name,dtype:types.get(value.dtype),shape:[...value.shape]},entry=ir.values?.[name];values[name]=actual;if(!entry||entry.name!==name||entry.dtype!==actual.dtype||!equal(entry.shape,value.shape))differences.push({name,original:entry??null,derived:actual});}
  // Some inlined IRs retain a former symbolic batch shape after an input was
  // replaced by a constant. Rebuild every entry from ONNX instead of trusting
  // such duplicated metadata, even when its claimed dtype happens to match.
  return{values,differences};
}
