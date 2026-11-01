// Dependency-free, inspectable ONNX generation. No trained parameters.
import {writeFile,rename,rm} from 'node:fs/promises';
import {concat, integer, string, message, node as protobufNode, tensor, valueInfo, intAttribute} from '../research/onnx-protobuf.mjs';
import {analyzeExactArithmetic} from './exact-arithmetic-analysis.mjs';
export const TYPES={float32:1,int32:6,bool:9};
const broadcast=(a,b)=>a.length>b.length?a:b.length>a.length?b:a.map((x,i)=>x===1?b[i]:x);
// Only identical deterministic expressions may share storage. Keep operand
// order and all proof/rounding metadata: this is not algebraic simplification.
const SHAREABLE_OPS=new Set(['Add','Sub','Mul','Div','MatMul','Floor','Min','Max','Less','LessOrEqual','Greater','GreaterOrEqual','Equal','And','Or','Not','Where','Cast','Split','Concat','Gather','GatherElements','Identity','Sqrt','Abs','Neg','Clip','Mod','Sign','Reshape','Transpose','Slice','ReduceSum','ReduceMin','ReduceMax']);
function expressionKey(value){
  if(typeof value==='number')return Object.is(value,-0)?['number','-0']:Number.isNaN(value)?['number','NaN']:value===Infinity?['number','Infinity']:value===-Infinity?['number','-Infinity']:value;
  if(Array.isArray(value))return value.map(expressionKey);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,expressionKey(value[key])]));
  return value;
}
const keyOf=value=>JSON.stringify(expressionKey(value));
export function finalizeGraph(ir){
  const publicOutputs=new Set(ir.outputs.map(value=>value.name)),aliases=new Map(),seen=new Map(),nodes=[];
  let sharedNodes=0,identityNodes=0;
  for(const node of ir.nodes){
    const inputs=node.inputs.map(name=>aliases.get(name)??name),isPublic=node.outputs.some(name=>publicOutputs.has(name));
    const outputTypes=node.outputs.map(name=>({...ir.values[name],name:undefined}));
    if(node.op==='Identity'&&!isPublic&&node.outputs.length===1&&keyOf({...ir.values[inputs[0]],name:undefined})===keyOf(outputTypes[0])){
      aliases.set(node.outputs[0],inputs[0]);identityNodes++;continue;
    }
    const details=Object.fromEntries(Object.entries(node).filter(([name])=>name!=='inputs'&&name!=='outputs'));
    const key=keyOf({details,inputs,outputTypes}),previous=SHAREABLE_OPS.has(node.op)&&!isPublic?seen.get(key):undefined;
    if(previous){node.outputs.forEach((name,index)=>aliases.set(name,previous.outputs[index]));sharedNodes++;continue;}
    const kept={...node,inputs,outputs:[...node.outputs],attributes:{...node.attributes}};
    nodes.push(kept);if(SHAREABLE_OPS.has(node.op))seen.set(key,kept);
  }
  const producers=new Map(nodes.flatMap((node,index)=>node.outputs.map(name=>[name,index]))),live=new Set(),pending=[...publicOutputs];
  // An unknown future/custom operator is neither deduplicated nor removed.
  for(const node of nodes)if(!SHAREABLE_OPS.has(node.op))pending.push(...node.outputs);
  const names=new Set(pending);
  while(pending.length){
    const index=producers.get(pending.pop());if(index===undefined||live.has(index))continue;
    live.add(index);for(const name of nodes[index].inputs)if(!names.has(name)){names.add(name);pending.push(name);}
  }
  const keptNodes=nodes.filter((_,index)=>live.has(index)),initializers=ir.initializers.filter(value=>names.has(value.name));
  // Never re-intern constants: their existing typed payload, including signed
  // zero and nonfinite bits, remains untouched. Public names are never aliases.
  for(const value of ir.inputs)names.add(value.name);
  for(const node of keptNodes)for(const name of node.outputs)names.add(name);
  const values=Object.fromEntries(Object.entries(ir.values).filter(([name])=>names.has(name)));
  return{...ir,inputs:ir.inputs,outputs:ir.outputs,initializers,nodes:keptNodes,values,
    optimization:{version:'exact-expression-sharing-v1',inputNodes:ir.nodes.length,outputNodes:keptNodes.length,sharedNodes,identityNodes,deadNodes:nodes.length-keptNodes.length,inputInitializers:ir.initializers.length,outputInitializers:initializers.length}};
}
export class Graph {
  constructor(name,contract={}){this.name=name;this.contract=contract;this.inputs=[];this.outputs=[];this.nodes=[];this.initializers=[];this.values={};this.index=0;this.cache=new Map();}
  input(name,shape=['N',1],dtype='float32'){const v={name,shape,dtype};this.inputs.push(v);this.values[name]=v;return name;}
  constant(value,dtype='float32',shape=[1]){
    const values=Array.isArray(value)?value:[value],key=keyOf([dtype,shape,values]);
    if(this.cache.has(key))return this.cache.get(key);
    const name=`c${this.cache.size}`;this.cache.set(key,name);this.initializers.push({name,shape,dtype,values});this.values[name]={name,shape,dtype};return name;
  }
  op(op,inputs,attributes={},options={}){
    inputs=inputs.map(x=>typeof x==='number'?this.constant(x):x);
    // ORT WebGPU does not implement Equal on BOOL tensors. Exact 0/1 casts
    // retain all four truth-table cases and avoid an implicit CPU partition.
    if(op==='Equal'&&inputs.every(name=>this.values[name].dtype==='bool'))inputs=inputs.map(name=>this.cast(name,'float32'));
    let shape=options.shape??inputs.reduce((s,x)=>broadcast(s,this.values[x].shape),[1]);
    let dtype=options.dtype??(op==='Cast'?Object.entries(TYPES).find(([,v])=>v===attributes.to)[0]:['Less','LessOrEqual','Greater','GreaterOrEqual','Equal','And','Or','Not'].includes(op)?'bool':op==='Where'?this.values[inputs[1]].dtype:this.values[inputs[0]].dtype);
    const name=options.name??`${op.toLowerCase()}_${this.index++}`;
    this.nodes.push({op,inputs,outputs:[name],attributes,roundingSite:dtype==='float32'&&['Add','Sub','Mul','Div','MatMul'].includes(op)});
    this.values[name]={name,shape,dtype};return name;
  }
  split(input,count){
    if(this.values[input].dtype==='bool')return this.split(this.cast(input,'float32'),count).map(x=>this.gt(x,0));
    if(count>8){const pieces=[];for(let start=0;start<count;start+=8){const width=Math.min(8,count-start),indices=this.constant(Array.from({length:width},(_,i)=>start+i),'int32',[width]),chunk=this.op('Gather',[input,indices],{axis:1},{shape:['N',width],dtype:this.values[input].dtype});pieces.push(...(width===1?[chunk]:this.split(chunk,width)));}return pieces;}
    const shape=[...this.values[input].shape];shape[1]=1;const outputs=Array.from({length:count},()=>`split_${this.index++}`);this.nodes.push({op:'Split',inputs:[input],outputs,attributes:{axis:1,num_outputs:count},roundingSite:false});for(const name of outputs)this.values[name]={name,shape,dtype:this.values[input].dtype};return outputs;
  }
  cat(inputs){if(this.values[inputs[0]].dtype==='bool')return this.gt(this.cat(inputs.map(x=>this.cast(x,'float32'))),0);if(inputs.length>8){const chunks=[];for(let i=0;i<inputs.length;i+=8)chunks.push(this.cat(inputs.slice(i,i+8)));return this.cat(chunks);}return this.op('Concat',inputs,{axis:1},{shape:['N',inputs.reduce((s,x)=>s+this.values[x].shape[1],0)]});}
  output(input,name){
    if(input!==name)input=this.values[input].dtype==='bool'
      ?this.op('Greater',[this.cast(input,'float32'),0],{},{name})
      :this.op('Identity',[input],{},{name});
    this.outputs.push(this.values[input]);return input;
  }
  inline(graph,feeds,prefix){
    const names={...feeds};
    for(const input of graph.inputs)if(!names[input.name])throw Error(`Missing ${graph.name} input ${input.name}`);
    for(const c of graph.initializers)names[c.name]=this.constant(c.values,c.dtype,c.shape);
    for(const n of graph.nodes){
      const outputs=n.outputs.map(name=>names[name]=`${prefix}_${name}`);
      this.nodes.push({...n,inputs:n.inputs.map(name=>names[name]),outputs,attributes:{...n.attributes}});
      n.outputs.forEach((old,i)=>this.values[outputs[i]]={...graph.values[old],name:outputs[i]});
    }
    return Object.fromEntries(graph.outputs.map(o=>[o.name,names[o.name]]));
  }
  add(a,b){return this.op('Add',[a,b]);} sub(a,b){return this.op('Sub',[a,b]);} mul(a,b){return this.op('Mul',[a,b]);}
  floor(a){return this.op('Floor',[a]);} min(a,b){return this.op('Min',[a,b]);} max(a,b){return this.op('Max',[a,b]);}
  eq(a,b){return this.op('Equal',[a,b]);} lt(a,b){return this.op('Less',[a,b]);} le(a,b){return this.op('LessOrEqual',[a,b]);} gt(a,b){return this.op('Greater',[a,b]);} ge(a,b){return this.op('GreaterOrEqual',[a,b]);}
  // WebGPU lacks And/Or kernels, while this WASM build lacks bool-valued Where.
  // A float32 0/1 selection has identical truth values on both providers.
  and(...xs){return xs.reduce((a,b)=>this.gt(this.where(a,this.cast(b,'float32'),0),0));}
  or(...xs){return xs.reduce((a,b)=>this.gt(this.where(a,1,this.cast(b,'float32')),0));}
  not(a){return this.eq(this.cast(a,'float32'),0);}
  where(c,a,b){return this.op('Where',[c,a,b]);} cast(a,type){return this.op('Cast',[a],{to:TYPES[type]});}
  finalized(){return finalizeGraph({schema:'dq9-graph-ir-v2',name:this.name,irVersion:8,opset:18,contract:this.contract,inputs:this.inputs,outputs:this.outputs,initializers:this.initializers,nodes:this.nodes,values:this.values});}
  json(){const ir=this.finalized();analyzeExactArithmetic(ir);return ir;}
  model(){
    const ir=this.finalized(),nodes=ir.nodes.map(n=>protobufNode(n.op,n.inputs,n.outputs,Object.entries(n.attributes).map(([k,v])=>intAttribute(k,v))));
    // TensorProto raw_data stores BOOL as one byte per element. The original
    // numeric research serializer writes four-byte FLOAT/INT32 values only.
    const constants=ir.initializers.map(t=>t.dtype==='bool'
      ?concat(t.shape.map(x=>integer(1,x)),integer(2,TYPES.bool),string(8,t.name),message(9,Uint8Array.from(t.values,x=>x?1:0)))
      :tensor(t.name,t.shape,t.values,TYPES[t.dtype]));
    const graph=concat(nodes.map(x=>message(1,x)),string(2,this.name),constants.map(x=>message(5,x)),this.inputs.map(x=>message(11,valueInfo(x.name,x.shape,TYPES[x.dtype]))),this.outputs.map(x=>message(12,valueInfo(x.name,x.shape,TYPES[x.dtype]))));
    return concat(integer(1,8),string(2,'DQ9 exact-rule graph experiment'),string(3,'2'),string(6,JSON.stringify(this.contract)),message(7,graph),message(8,concat(string(1,''),integer(2,18))));
  }
  async save(directory=new URL('./',import.meta.url)){
    const data=this.model(),ir=this.json(),staged=[];
    try{
      for(const[extension,contents]of[['onnx',data],['json',JSON.stringify(ir)+'\n']]){
        const final=new URL(`${this.name}.${extension}`,directory),temporary=new URL(`${this.name}.${extension}.pending-${process.pid}`,directory);
        staged.push({final,temporary});await writeFile(temporary,contents);
      }
      for(const file of staged)await rename(file.temporary,file.final);
    }finally{for(const file of staged)await rm(file.temporary,{force:true});}
    return {name:this.name,bytes:data.length,nodes:ir.nodes.length,ops:[...new Set(ir.nodes.map(x=>x.op))],inputs:this.inputs,outputs:this.outputs};
  }
}

export function lcg(g,seed){
  const firstNode=g.nodes.length;
  const a=[101,137,7,108,101,139,88,93],b=[195,158,38,0,0,0,0,0];
  const w=Array.from({length:64},(_,k)=>{const row=Math.floor(k/8),col=k%8;return col>=row?a[col-row]:0;});
  const products=g.op('MatMul',[seed,g.constant(w,'float32',[8,8])],{},{shape:['N',8]});
  const columns=g.split(g.add(products,g.constant(b,'float32',[8])),8);
  let carry=0;const result=[];
  for(const column of columns){const total=g.add(column,carry);carry=g.floor(g.mul(total,1/256));result.push(g.sub(total,g.mul(carry,256)));}
  const joined=g.cat(result);
  for(const n of g.nodes.slice(firstNode)){n.exactArithmetic=true;n.exactArithmeticReason='Input byte limbs are 0..255; every integer product and partial sum is bounded by 198050 < 2^18; power-of-two carry arithmetic is exact binary32.';}
  return {seed:joined,bytes:result,raw:result.slice(4)};
}

// Exact f32(raw / 4294967295) from four base-256 digits. A positive denominator
// correction changes integer-to-f32 midpoint ties to upward rounding. The
// original first rounds a DOUBLE division: two near-maximum values round to a
// binary64 midpoint then upward to binary32. They need explicit correction.
// The selected quotient is at most 2^24-1; no uint32 is put in one f32 scalar.
export function normalized(g,r){
  const firstNode=g.nodes.length;
  const high=g.add(g.add(r[1],g.mul(r[2],256)),g.mul(r[3],65536));
  let spacing=g.constant(1),reciprocal=g.constant(1);
  for(let shift=1;shift<=8;shift++){
    const selected=g.ge(high,2**(15+shift));
    spacing=g.where(selected,2**shift,spacing);
    reciprocal=g.where(selected,2**-shift,reciprocal);
  }
  const lowQuotient=g.floor(g.mul(r[0],reciprocal));
  const quotient=g.add(g.mul(high,g.mul(256,reciprocal)),lowQuotient);
  const remainder=g.sub(r[0],g.mul(lowQuotient,spacing));
  const doubleRounded=g.and(g.eq(r[0],127),g.or(g.eq(high,16777215),g.eq(high,16777213)));
  const rounded=g.add(quotient,g.cast(g.or(g.ge(remainder,g.mul(spacing,.5)),doubleRounded),'float32'));
  const result=g.mul(rounded,g.mul(spacing,2**-32));
  for(const n of g.nodes.slice(firstNode)){n.exactArithmetic=true;n.exactArithmeticReason='Four byte inputs; high24 <= 2^24-1; selected quotient <= 2^24-1 and rounded quotient <= 2^24; all arithmetic is representable integer or exact power-of-two scaling, including the two binary64 double-rounding corrections.';}
  return result;
}
export const bounded=(g,unit,maximum)=>g.min(g.floor(g.mul(unit,maximum)),g.sub(maximum,1));
export const between=(g,unit,minimum,maximum)=>g.add(g.mul(g.sub(maximum,minimum),unit),minimum);

export function physical(g,seed,position,attack,defense,enabled){
  const base=g.mul(g.sub(attack,g.mul(defense,.5)),.5),minimum=g.mul(attack,1/16);
  const active=g.and(enabled,g.gt(base,0)),normal=g.and(active,g.gt(base,minimum));
  const first=lcg(g,seed),second=lcg(g,first.seed),u1=normalized(g,first.raw),u2=normalized(g,second.raw);
  const width=g.mul(base,1/16),percent=between(g,u1,g.sub(0,width),width),flat=between(g,u2,-1,1);
  const normalValue=g.max(g.add(g.add(base,percent),flat),0);
  const minimumValue=between(g,u1,0,minimum);
  const damage=g.where(active,g.floor(g.where(normal,normalValue,minimumValue)),0);
  const consumed=g.add(g.cast(active,'int32'),g.cast(normal,'int32'));
  return {seed:g.where(normal,second.seed,g.where(active,first.seed,seed)),position:g.add(position,consumed),damage,consumed,base,unit1:u1,unit2:u2};
}
