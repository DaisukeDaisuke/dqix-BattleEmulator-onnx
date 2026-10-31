// Dependency-free, inspectable ONNX generation. No trained parameters.
import {writeFile} from 'node:fs/promises';
import {concat, integer, string, message, node as protobufNode, tensor, valueInfo, intAttribute} from '../research/onnx-protobuf.mjs';
import {analyzeExactArithmetic} from './exact-arithmetic-analysis.mjs';
export const TYPES={float32:1,int32:6,bool:9};
const broadcast=(a,b)=>a.length>b.length?a:b.length>a.length?b:a.map((x,i)=>x===1?b[i]:x);
export class Graph {
  constructor(name,contract={}){this.name=name;this.contract=contract;this.inputs=[];this.outputs=[];this.nodes=[];this.initializers=[];this.values={};this.index=0;this.cache=new Map();}
  input(name,shape=['N',1],dtype='float32'){const v={name,shape,dtype};this.inputs.push(v);this.values[name]=v;return name;}
  constant(value,dtype='float32',shape=[1]){
    const values=Array.isArray(value)?value:[value],key=JSON.stringify([dtype,shape,values]);
    if(this.cache.has(key))return this.cache.get(key);
    const name=`c${this.cache.size}`;this.cache.set(key,name);this.initializers.push({name,shape,dtype,values});this.values[name]={name,shape,dtype};return name;
  }
  op(op,inputs,attributes={},options={}){
    inputs=inputs.map(x=>typeof x==='number'?this.constant(x):x);
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
  json(){const ir={schema:'dq9-graph-ir-v2',name:this.name,irVersion:8,opset:18,contract:this.contract,inputs:this.inputs,outputs:this.outputs,initializers:this.initializers,nodes:this.nodes,values:this.values};analyzeExactArithmetic(ir);return ir;}
  model(){
    const nodes=this.nodes.map(n=>protobufNode(n.op,n.inputs,n.outputs,Object.entries(n.attributes).map(([k,v])=>intAttribute(k,v))));
    // TensorProto raw_data stores BOOL as one byte per element. The original
    // numeric research serializer writes four-byte FLOAT/INT32 values only.
    const constants=this.initializers.map(t=>t.dtype==='bool'
      ?concat(t.shape.map(x=>integer(1,x)),integer(2,TYPES.bool),string(8,t.name),message(9,Uint8Array.from(t.values,x=>x?1:0)))
      :tensor(t.name,t.shape,t.values,TYPES[t.dtype]));
    const graph=concat(nodes.map(x=>message(1,x)),string(2,this.name),constants.map(x=>message(5,x)),this.inputs.map(x=>message(11,valueInfo(x.name,x.shape,TYPES[x.dtype]))),this.outputs.map(x=>message(12,valueInfo(x.name,x.shape,TYPES[x.dtype]))));
    return concat(integer(1,8),string(2,'DQ9 exact-rule graph experiment'),string(3,'2'),string(6,JSON.stringify(this.contract)),message(7,graph),message(8,concat(string(1,''),integer(2,18))));
  }
  async save(directory=new URL('./',import.meta.url)){const data=this.model();await writeFile(new URL(`${this.name}.onnx`,directory),data);await writeFile(new URL(`${this.name}.json`,directory),JSON.stringify(this.json(),null,2)+'\n');return {name:this.name,bytes:data.length,nodes:this.nodes.length,ops:[...new Set(this.nodes.map(x=>x.op))],inputs:this.inputs,outputs:this.outputs};}
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
