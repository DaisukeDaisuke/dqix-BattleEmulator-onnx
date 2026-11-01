// Generated resident native compiler prototype. Public GPU files unchanged.
import {emitNativeResidentGuards} from './native-resident-guards.mjs';
import {assertNativeContract} from './native-onnx-boundary.mjs';
// Experimental direct ONNX -> scalar WebAssembly compiler, without C++ or a
// toolchain install. Battle rules remain in the unchanged graph and weights.
// Reference only: no resident fault ABI or hardware/GPU performance claim.
// Scalar f32 instructions preserve individual rounding sites; no relaxed SIMD
// or fused multiply-add instructions are emitted. MatMul has explicit ordered
// accumulation and needs independent parity/proofs for each deployed model.
// Specification: https://webassembly.github.io/spec/core/binary/instructions.html
import {readOnnx} from './graph-runtime.mjs';
import {inferPureOnnxMetadata} from './onnx-pure-value-metadata.mjs';
import {readNativeOnnx,assertNativeGraphBoundary} from './native-onnx-boundary.mjs';

const typeName={1:'float32',6:'int32',9:'bool'},wasmType=t=>t===1?0x7d:0x7f;
const product=shape=>shape.reduce((n,x)=>n*(typeof x==='string'?1:x),1);
const uleb=value=>{let x=BigInt(value),a=[];if(x<0n)throw Error('Negative unsigned immediate');do{let byte=Number(x&127n);x>>=7n;if(x)byte|=128;a.push(byte);}while(x);return a;};
const sleb=value=>{let x=BigInt.asIntN(32,BigInt(value)),a=[];while(true){let byte=Number(x&127n);x>>=7n;const done=x===0n&&(byte&64)===0||x===-1n&&(byte&64)!==0;a.push(byte|(done?0:128));if(done)return a;}};
const f32bytes=value=>{const b=new Uint8Array(4);new DataView(b.buffer).setFloat32(0,value,true);return Array.from(b);};
const string=value=>{const bytes=Array.from(new TextEncoder().encode(value));return[...uleb(bytes.length),...bytes];};
const section=(id,body)=>[id,...uleb(body.length),...body];
function broadcastIndex(input,output,flat){const a=input.map(x=>typeof x==='string'?1:x),b=output.map(x=>typeof x==='string'?1:x),padding=b.length-a.length;let result=0,stride=1;for(let i=b.length-1;i>=0;i--){const c=flat%b[i];flat=Math.floor(flat/b[i]);if(i>=padding){const dim=a[i-padding];result+=(dim===1?0:c)*stride;stride*=dim;}}return result;}

export function compileNativeResidentGraphWasm(graph,resident){
  if(!Number.isInteger(resident?.stateWords)||resident.stateWords<resident.faultOffset+2||!Number.isInteger(resident.constantBase)||resident.constantBase<0||resident.constantBase%64)throw Error('Invalid native resident layout');
  assertNativeGraphBoundary(graph);
  assertNativeContract(graph,resident.contract);
  if(graph.initializers.some(t=>graph.inputs.some(v=>v.name===t.name)))throw Error('Overridable initializers are outside this prototype');
  if([...graph.inputs,...graph.outputs].some(v=>v.shape.length!==2||typeof v.shape[0]!=='string'||!Number.isInteger(v.shape[1])||v.shape[1]<1))throw Error('Native prototype requires independent [N,width] I/O');
  const metadata=inferPureOnnxMetadata(graph),code=[],localTypes=[],values=new Map(),constantBytes=[],constantOffsets=new Map(),inputs=[],outputs=[];
  const append=bytes=>{for(const byte of bytes)code.push(byte);},emit=(...bytes)=>code.push(...bytes),local=dtype=>{const item={kind:'local',index:4+localTypes.length,dtype};localTypes.push(wasmType(dtype));return item;};
  const constant=(value,dtype)=>({kind:'constant',value,dtype}),get=item=>{if(item.kind==='local')append([0x20,...uleb(item.index)]);else if(item.dtype===1)append([0x43,...f32bytes(item.value)]);else append([0x41,...sleb(item.dtype===9?Number(!!item.value):item.value)]);};
  const set=item=>append([0x21,...uleb(item.index)]),i32=value=>get(constant(value,6));
  const lane=local(6),inputBase=local(6),outputBase=local(6);
  let inputWords=0,outputWords=0;
  for(const v of graph.inputs){inputs.push({...v,offset:inputWords,width:v.shape[1]});inputWords+=v.shape[1];}
  for(const v of graph.outputs){outputs.push({...v,offset:outputWords,width:v.shape[1]});outputWords+=v.shape[1];}
  for(const t of graph.initializers){if(!typeName[t.dtype]||product(t.shape)!==t.data.length||t.data.some(x=>!Number.isFinite(Number(x))))throw Error('Unsupported constant tensor');constantOffsets.set(t.name,resident.constantBase+constantBytes.length);for(const x of t.data){const b=new Uint8Array(4),d=new DataView(b.buffer);if(t.dtype===1)d.setFloat32(0,x,true);else d.setInt32(0,t.dtype===9?Number(!!x):x,true);for(const byte of b)constantBytes.push(byte);}values.set(t.name,{...t,items:t.data.map(x=>constant(x,t.dtype)),constant:true});}
  i32(0);set(lane);emit(0x02,0x40,0x03,0x40);get(lane);emit(0x20,2,0x4f,0x0d,1);
  emit(0x20,0);get(lane);i32(resident.stateWords*4);emit(0x6c,0x6a);set(inputBase);
  get(inputBase);set(outputBase);emit(0x02,0x40);get(inputBase);append([0x28,2,...uleb(resident.faultOffset*4)]);emit(0x0d,0);
  for(const [inputIndex,v] of inputs.entries()){const items=[];for(let j=0;j<v.width;j++){const x=local(v.dtype);get(inputBase);emit(0x20,1);append([0x28,2,...uleb(inputIndex*4)]);i32(4);emit(0x6c,0x6a);append([v.dtype===1?0x2a:0x28,2,...uleb(j*4)]);set(x);items.push(x);}values.set(v.name,{...v,items});}
  const put=(name,items)=>{const info=metadata.get(name);if(!info||items.length!==product(info.shape)||items.some(x=>x.dtype!==info.dtype))throw Error('Native inferred result differs '+name);values.set(name,{...info,items});};
  const input=(value,shape,index)=>value.items[broadcastIndex(value.shape,shape,index)];
  const saveResult=(dtype,writer)=>{const result=local(dtype);writer();set(result);return result;};
  const arithmetic={Add:[0x92,0x6a],Sub:[0x93,0x6b],Mul:[0x94,0x6c]},comparison={Equal:[0x5b,0x46],Less:[0x5d,0x48],Greater:[0x5e,0x4a],LessOrEqual:[0x5f,0x4c],GreaterOrEqual:[0x60,0x4e]};
  const guardLabels=emitNativeResidentGuards({graph,contract:resident.contract??{},values,emit,get,i32,constant,inputBase,faultOffset:resident.faultOffset});
  for(const node of graph.nodes){
    const args=node.inputs.map(name=>{const v=values.get(name);if(!v)throw Error('Unknown native input '+name);return v;}),a=node.attributes??{},info=metadata.get(node.outputs[0]);
    if(node.op==='Identity'){put(node.outputs[0],args[0].items);continue;}
    if(node.op==='Split'){if(a.axis!==1||args[0].shape.length!==2)throw Error('Native Split must preserve lanes');let offset=0;for(const name of node.outputs){const width=product(metadata.get(name).shape);put(name,args[0].items.slice(offset,offset+width));offset+=width;}continue;}
    if(node.op==='Concat'){if(a.axis!==1||args.some(v=>v.shape.length!==2))throw Error('Native Concat must preserve lanes');put(node.outputs[0],args.flatMap(v=>v.items));continue;}
    if(node.op==='MatMul'){
      const [left,right]=args;if(left.shape.length!==2||right.shape.length!==2||!right.constant||left.dtype!==1||right.dtype!==1)throw Error('Native MatMul needs a constant float matrix on the right');const count=right.shape[0],columns=right.shape[1],items=[];
      for(let j=0;j<columns;j++)items.push(saveResult(1,()=>{get(constant(0,1));for(let k=0;k<count;k++){get(left.items[k]);get(right.items[k*columns+j]);emit(0x94,0x92);}}));put(node.outputs[0],items);continue;
    }
    if(node.op==='Gather'){
      const [data,indices]=args,axis=(a.axis??0)<0?(a.axis??0)+data.shape.length:(a.axis??0),dimension=data.shape[axis],items=[];
      if(!Number.isInteger(dimension)||indices.dtype!==6)throw Error('Native Gather requires static width and int32 indices');
      if(!data.constant){if(axis!==1||data.shape.length!==2||!indices.constant)throw Error('Native dynamic data Gather requires constant within-lane indices');for(const item of indices.items){let index=item.value;if(index<0)index+=dimension;if(!Number.isInteger(index)||index<0||index>=dimension)throw Error('Native constant Gather index out of bounds');items.push(data.items[index]);}}
      else{
        const outer=product(data.shape.slice(0,axis)),inner=product(data.shape.slice(axis+1));
        for(let prefix=0;prefix<outer;prefix++)for(const item of indices.items){
          if(item.kind==='constant'){let index=item.value;if(index<0)index+=dimension;if(index<0||index>=dimension||!Number.isInteger(index))throw Error('Native constant Gather index out of bounds');for(let j=0;j<inner;j++)items.push(data.items[(prefix*dimension+index)*inner+j]);continue;}
          const normalized=saveResult(6,()=>{get(item);i32(dimension);emit(0x6a);get(item);get(item);i32(0);emit(0x48,0x1b);});
          get(normalized);i32(dimension);emit(0x4f,0x04,0x40,0x00,0x0b);
          for(let j=0;j<inner;j++)items.push(saveResult(data.dtype,()=>{i32(constantOffsets.get(data.name)+(prefix*dimension*inner+j)*4);get(normalized);i32(inner*4);emit(0x6c,0x6a,data.dtype===1?0x2a:0x28,2,0);}));
        }
      }
      put(node.outputs[0],items);continue;
    }
    const items=[];
    for(let j=0;j<product(info.shape);j++){
      const x=args.map(v=>input(v,info.shape,j));items.push(saveResult(info.dtype,()=>{
        if(arithmetic[node.op]){get(x[0]);get(x[1]);emit(arithmetic[node.op][args[0].dtype===1?0:1]);}
        else if(node.op==='Div'){get(x[0]);get(x[1]);emit(0x95);}
        else if(comparison[node.op]){get(x[0]);get(x[1]);emit(comparison[node.op][args[0].dtype===1?0:1]);}
        else if(node.op==='Floor'){get(x[0]);emit(0x8e);}
        else if(node.op==='Where'){get(x[1]);get(x[2]);get(x[0]);emit(0x1b);}
        else if(node.op==='And'||node.op==='Or'){get(x[0]);get(x[1]);emit(node.op==='And'?0x71:0x72);}
        else if(node.op==='Not'){get(x[0]);emit(0x45);}
        else if(node.op==='Cast'){
          get(x[0]);if(args[0].dtype!==info.dtype){if(info.dtype===9){get(constant(0,args[0].dtype));emit(args[0].dtype===1?0x5c:0x47);}else if(info.dtype===1)emit(0xb2);else if(args[0].dtype===1)emit(0xa8);}
        }else if(node.op==='Min'||node.op==='Max'){
          if(info.dtype===1){let selected=x[0];for(let k=1;k<x.length;k++){const left=selected,right=x[k];selected=saveResult(1,()=>{get(left);get(right);get(left);get(right);emit(node.op==='Min'?0x5f:0x60,0x1b);});}get(selected);}
          else{if(x.length!==2)throw Error('Native int32 Min/Max currently requires two inputs');get(x[0]);get(x[1]);get(x[0]);get(x[1]);emit(node.op==='Min'?0x48:0x4a,0x1b);}
        }else throw Error('Unsupported native ONNX operator '+node.op);
      }));
    }
    put(node.outputs[0],items);
  }
  for(const [outputIndex,v] of outputs.entries())for(let j=0;j<v.width;j++){get(outputBase);emit(0x20,1);append([0x28,2,...uleb((graph.inputs.length+outputIndex)*4)]);i32(4);emit(0x6c,0x6a);get(values.get(v.name).items[j]);append([v.dtype===1?0x38:0x36,2,...uleb(j*4)]);}
  emit(0x0b);
  get(lane);i32(1);emit(0x6a);set(lane);emit(0x0c,0,0x0b,0x0b,0x0b);
  const groups=[];for(const type of localTypes){const last=groups.at(-1);if(last?.type===type)last.count++;else groups.push({type,count:1});}
  const body=[...uleb(groups.length),...groups.flatMap(g=>[...uleb(g.count),g.type]),...code],constantEnd=resident.constantBase+Math.ceil(constantBytes.length/64)*64,pages=Math.max(1,Math.ceil(constantEnd/65536));
  const binary=Uint8Array.from([0,97,115,109,1,0,0,0,...section(1,[1,0x60,4,0x7f,0x7f,0x7f,0x7f,0]),...section(2,[1,...string('env'),...string('memory'),2,0,...uleb(pages)]),...section(3,[1,0]),...section(7,[2,...string('memory'),2,0,...string('run'),0,0]),...section(10,[1,...uleb(body.length),...body]),...section(11,[1,0,0x41,...sleb(resident.constantBase),0x0b,...uleb(constantBytes.length),...constantBytes])]);
  if(!WebAssembly.validate(binary))throw Error('Generated native WebAssembly failed validation');
  return{binary,inputs,outputs,inputWords,outputWords,constantEnd,guardLabels,resident,localCount:localTypes.length,nodes:graph.nodes.length,scope:'Direct scalar graph reference; per-op f32 rounding, checked Gather, trapping out-of-range float-to-int Cast. MatMul order and signed-zero Min/Max must be validated against the deployed ONNX provider. No resident domain-fault ABI or public performance claim.'};
}
