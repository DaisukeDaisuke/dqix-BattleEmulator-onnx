// Additive CPU-only DOUBLE serializer. The delivered f32 builder is unchanged.
import {Graph} from './graph-builder.mjs';
import {concat,integer,string,message,node as protobufNode,valueInfo,intAttribute} from '../research/onnx-protobuf.mjs';
export const CPU_TYPES=Object.freeze({float32:1,int32:6,bool:9,float64:11});
function rawConstant(values,dtype){
 const bytes=dtype==='bool'?1:dtype==='float64'?8:4,b=new Uint8Array(values.length*bytes),v=new DataView(b.buffer);
 values.forEach((x,i)=>{if(dtype==='float64')v.setFloat64(i*8,x,true);else if(dtype==='float32')v.setFloat32(i*4,x,true);else if(dtype==='int32')v.setInt32(i*4,x,true);else if(dtype==='bool')v.setUint8(i,x?1:0);else throw Error(`Unsupported CPU dtype ${dtype}`);});return b;
}
export class Float64Graph extends Graph{
 constant(value,dtype='float64',shape=[1]){
  const values=Array.isArray(value)?value:[value],raw=rawConstant(values,dtype),key=JSON.stringify([dtype,shape,Array.from(raw)]);
  if(this.cache.has(key))return this.cache.get(key);const name=`c${this.cache.size}`;this.cache.set(key,name);this.initializers.push({name,shape,dtype,values});this.values[name]={name,shape,dtype};return name;
 }
 op(op,inputs,attributes={},options={}){
  const symbols=inputs.filter(x=>typeof x==='string'),types=symbols.map(x=>this.values[x]?.dtype),arithmeticType=types.includes('float64')?'float64':types.find(x=>x!=='bool')??'float64';
  inputs=inputs.map(x=>typeof x==='number'?this.constant(x,arithmeticType):x);
  if(op==='Cast')options={...options,dtype:Object.entries(CPU_TYPES).find(([,v])=>v===attributes.to)?.[0]};
  const out=super.op(op,inputs,attributes,options);if(this.values[out].dtype==='float64')this.nodes.at(-1).roundingSite=['Add','Sub','Mul','Div','Sqrt'].includes(op);return out;
 }
 cast(a,type){if(!(type in CPU_TYPES))throw Error(`Unknown dtype ${type}`);return this.op('Cast',[a],{to:CPU_TYPES[type]});}
 neg(a){return this.op('Neg',[a]);}abs(a){return this.op('Abs',[a]);}div(a,b){return this.op('Div',[a,b]);}
 json(){return{schema:'dq9-cpu-double-graph-ir-v1',name:this.name,irVersion:8,opset:18,contract:this.contract,inputs:this.inputs,outputs:this.outputs,initializers:this.initializers,nodes:this.nodes,values:this.values};}
 model(){
  const nodes=this.nodes.map(n=>protobufNode(n.op,n.inputs,n.outputs,Object.entries(n.attributes).map(([k,v])=>intAttribute(k,v)))),constants=this.initializers.map(t=>concat(t.shape.map(x=>integer(1,x)),integer(2,CPU_TYPES[t.dtype]),string(8,t.name),message(9,rawConstant(t.values,t.dtype)))),graph=concat(nodes.map(x=>message(1,x)),string(2,this.name),constants.map(x=>message(5,x)),this.inputs.map(x=>message(11,valueInfo(x.name,x.shape,CPU_TYPES[x.dtype]))),this.outputs.map(x=>message(12,valueInfo(x.name,x.shape,CPU_TYPES[x.dtype]))));
  return concat(integer(1,8),string(2,'DQ9 original binary64 math CPU graph'),string(3,'1'),string(6,JSON.stringify(this.contract)),message(7,graph),message(8,concat(string(1,''),integer(2,18))));
 }
}
