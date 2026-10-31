// One lane is one independent state. This compiler accepts only its explicit
// ONNX subset; an unsupported operator or cross-lane operation is an error.
const decoder = new TextDecoder();
function fields(bytes) {
  const a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let p = 0;
  const v = () => { let n = 0n, s = 0n, b; do { if (p >= a.length) throw Error('Truncated protobuf'); b=a[p++]; n |= BigInt(b&127)<<s; s+=7n; if(s>70n)throw Error('Invalid varint'); } while(b&128); return n; };
  const out=[];
  while(p<a.length){const t=Number(v()),wire=t&7;let value;
    if(wire===0)value=v();
    else if(wire===2){const n=Number(v());if(p+n>a.length)throw Error('Truncated protobuf field');value=a.subarray(p,p+n);p+=n;}
    else if(wire===5){value=a.subarray(p,p+4);p+=4;}
    else if(wire===1){value=a.subarray(p,p+8);p+=8;}
    else throw Error('Unsupported protobuf wire '+wire);
    out.push({id:t>>3,wire,value});
  }
  return out;
}
const one=(f,id)=>f.find(x=>x.id===id)?.value;
const many=(f,id)=>f.filter(x=>x.id===id).map(x=>x.value);
const txt=x=>x?decoder.decode(x):'';
const signed=x=>Number(BigInt.asIntN(64,x??0n));
function packed(a){let p=0,out=[];while(p<a.length){let n=0n,s=0n,b;do{b=a[p++];n|=BigInt(b&127)<<s;s+=7n;}while(b&128);out.push(signed(n));}return out;}
function integers(f,id){return f.filter(x=>x.id===id).flatMap(x=>x.wire===2?packed(x.value):[signed(x.value)]);}
function tensor(bytes){
  const f=fields(bytes),shape=integers(f,1),dtype=Number(one(f,2)),raw=one(f,9),name=txt(one(f,8));let data=[];
  if(raw){const d=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),size=dtype===7?8:dtype===9?1:4;
    for(let p=0;p<raw.length;p+=size){let x;if(dtype===1)x=d.getFloat32(p,true);else if(dtype===6)x=d.getInt32(p,true);else if(dtype===7){const b=d.getBigInt64(p,true);if(b>2147483647n||b< -2147483648n)throw Error('INT64 constant exceeds supported index range');x=Number(b);}else if(dtype===9)x=!!d.getUint8(p);else throw Error('Unsupported tensor dtype '+dtype);data.push(x);}
  }else if(dtype===1){for(const x of f.filter(x=>x.id===4)){const d=new DataView(x.value.buffer,x.value.byteOffset,x.value.byteLength);for(let p=0;p<d.byteLength;p+=4)data.push(d.getFloat32(p,true));}}
  else data=integers(f,dtype===7?7:5);
  return {name,shape,dtype,data};
}
function valueInfo(bytes){const f=fields(bytes),tf=fields(one(fields(one(f,2)),1)),sf=fields(one(tf,2));return {name:txt(one(f,1)),dtype:Number(one(tf,1)),shape:many(sf,1).map(x=>{const d=fields(x);return one(d,1)!==undefined?Number(one(d,1)):txt(one(d,2));})};}
function attribute(bytes){const f=fields(bytes),type=Number(one(f,20));let value;
  if(type===2)value=signed(one(f,3));else if(type===7)value=integers(f,8);else if(type===1){const b=one(f,2);value=new DataView(b.buffer,b.byteOffset,b.byteLength).getFloat32(0,true);}else if(type===3)value=txt(one(f,4));else if(type===4)value=tensor(one(f,5));else throw Error('Unsupported attribute type '+type);
  return [txt(one(f,1)),value];
}
export function readOnnx(bytes){const mf=fields(bytes),gf=fields(one(mf,7));return {name:txt(one(gf,2)),doc:txt(one(mf,6)),
  nodes:many(gf,1).map(x=>{const f=fields(x);return {op:txt(one(f,4)),name:txt(one(f,3)),inputs:many(f,1).map(txt),outputs:many(f,2).map(txt),attributes:Object.fromEntries(many(f,5).map(attribute))};}),
  initializers:many(gf,5).map(tensor),inputs:many(gf,11).map(valueInfo),outputs:many(gf,12).map(valueInfo)};}

const typeName=t=>t===1?'f32':t===6||t===7?'i32':t===9?'bool':(()=>{throw Error('Unsupported dtype '+t)})();
const typeKey=t=>t===1?'float32':t===6?'int32':t===9?'bool':(()=>{throw Error('Unsupported I/O dtype '+t)})();
function literal(x,type){if(type===9)return x?'true':'false';if(type===6||type===7)return `${x}i`;if(!Number.isFinite(x))throw Error('Nonfinite graph constant');const a=Math.fround(x);return Object.is(a,-0)?'-0.0f':Number.isInteger(a)?`${a}.0f`:`${a}f`;}
const product=a=>a.reduce((p,x)=>p*x,1);
function laneWidth(v){if(v.shape.length<1||typeof v.shape[0]!=='string')throw Error(`Expected a symbolic batch dimension: ${v.name}`);if(v.shape.slice(1).some(x=>!Number.isInteger(x)||x<=0))throw Error('Nonstatic lane shape');return product(v.shape.slice(1));}

// WGSL permits flushing subnormal floating values, including intermediate
// bitcasts, to zero. The exact battle backend accepts finite normal f32 and
// signed zero. This is a backend restriction, not a change to the ONNX model.
export function validateGpuFloatInputs(feeds){
  for(const [name,tensor] of Object.entries(feeds))if(tensor.type==='float32'){
    const data=tensor.data instanceof Float32Array?tensor.data:Float32Array.from(tensor.data),bits=new Uint32Array(data.buffer,data.byteOffset,data.length);
    for(let i=0;i<bits.length;i++){const magnitude=bits[i]&0x7fffffff;if(magnitude>0x7f7fffff||magnitude!==0&&magnitude<0x00800000)throw Error(`GPU exact float input outside finite-normal/zero domain: ${name}[${i}]`);}
  }
}

export function compileWgsl(graph,{feedback={},strictFloat=false,exactOutputs=[],inlineVectors=true,fixedPointExit=true,staged=null}={}){
  if(strictFloat)for(const tensor of [...graph.initializers,...graph.nodes.filter(n=>n.op==='Constant').map(n=>n.attributes.value)])if(tensor?.dtype===1&&tensor.data.some(x=>Math.fround(x)!==0&&Math.abs(Math.fround(x))<2**-126))throw Error('Strict GPU compilation does not accept subnormal constants');
  const values=new Map(),lines=[],constants=[],inputLayouts=[],outputLayouts=[],weightPool=[];let serial=0,inputWords=0,outputWords=0,inlinedVectors=0;
  const pointwise=new Set(['Add','Sub','Mul','Div','Less','Greater','LessOrEqual','GreaterOrEqual','Equal','And','Or','Xor','Floor','Ceil','Abs','Sqrt','Exp','Log','Round','Neg','Not','Min','Max','Where','Cast','Clip','Relu','Mod']);
  const consumers=new Map();for(const node of graph.nodes)for(const name of node.inputs.filter(Boolean)){if(!consumers.has(name))consumers.set(name,[]);consumers.get(name).push(node);}
  const externallyUsed=new Set([...graph.outputs.map(v=>v.name),...Object.values(feedback)]);
  const emit=(expr,type)=>{const n=`v${serial++}`;lines.push(`let ${n}: ${typeName(type)} = ${expr};`);return n;};
  for(const t of graph.initializers){values.set(t.name,{type:t.dtype,shape:t.shape,items:t.data.map(x=>literal(x,t.dtype)),constant:t.data,uniform:t.data.length>1&&t.data.every(x=>Object.is(x,t.data[0]))?literal(t.data[0],t.dtype):null});}
  for(const v of graph.inputs){if(values.has(v.name))continue;const width=laneWidth(v),items=[],array=width>8?`input_array_${inputLayouts.length}`:null;typeKey(v.dtype);inputLayouts.push({...v,width,offset:inputWords,array});for(let j=0;j<width;j++)items.push(array?`${array}[${j}u]`:`in_${inputLayouts.length-1}_${j}`);inputWords+=width;values.set(v.name,{type:v.dtype,shape:v.shape,items,array});}
  const get=n=>{if(!values.has(n))throw Error('Unknown graph value '+n);return values.get(n);};
  const ensureArray=v=>{if(v.array)return v.array;const name=`array_${serial++}`;const line=`let ${name}=array<${typeName(v.type)},${v.items.length}>(${v.items.join(',')});`;(v.constant?constants:lines).push(line);v.array=name;return name;};
  const wordBuffer=new DataView(new ArrayBuffer(4));
  const weightAt=(v,index)=>{if(v.weightOffset===undefined){v.weightOffset=weightPool.length;for(const value of v.constant){if(v.type===1)wordBuffer.setFloat32(0,value,true);else if(v.type===9)wordBuffer.setUint32(0,value?1:0,true);else wordBuffer.setInt32(0,value,true);weightPool.push(wordBuffer.getUint32(0,true));}}const read=`weights[${v.weightOffset}u+${index}]`;return v.type===9?`(${read}!=0u)`:`bitcast<${typeName(v.type)}>(${read})`;};
  const at=(v,i)=>v.inline?v.inline.expression.split(v.inline.index).join(typeof i==='number'?`${i}u`:i):v.uniform|| (v.items.length===1?v.items[0]:typeof i==='number'?v.items[i]:v.constant&&v.items.length>64?weightAt(v,i):`${ensureArray(v)}[${i}]`);
  const shapeFor=w=>['N',w];
  const set=(name,items,type)=>values.set(name,{type,shape:shapeFor(items.length),items});
  const exact=new Set(exactOutputs);let currentExact=false;
  const floatOp=(op,a,b,type)=>strictFloat&&!currentExact&&type===1&&['+','-','*'].includes(op)?`${op==='*'?'sf_mul':'sf_add'}(${a}, ${op==='-'?`(-${b})`:b})`:`(${a} ${op} ${b})`;
  for(const n of graph.nodes){currentExact=exact.has(n.outputs[0]);const a=n.attributes||{},vs=n.inputs.filter(Boolean).map(get),outs=n.outputs;
    if(n.op==='Constant'){const t=a.value;if(!t)throw Error('Only tensor Constant supported');values.set(outs[0],{type:t.dtype,shape:t.shape,items:t.data.map(x=>literal(x,t.dtype)),constant:t.data});continue;}
    if(n.op==='Identity'){values.set(outs[0],vs[0]);continue;}
    if(n.op==='MatMul'){
      const [x,w]=vs;if(!w.constant||w.shape.length!==2||x.items.length!==w.shape[0]||x.type!==1||w.type!==1)throw Error('MatMul must be lane-vector times constant float matrix');
      const items=[];for(let j=0;j<w.shape[1];j++){
        if(w.shape[0]>8){const name=`sum_${serial++}`,k=`k_${serial++}`;lines.push(`var ${name}=0.0f; for(var ${k}=0u;${k}<min(${w.shape[0]}u,params.loopLimit);${k}=${k}+1u){${name}=${floatOp('+',name,floatOp('*',at(x,k),at(w,`${k}*${w.shape[1]}u+${j}u`),1),1)};}`);items.push(name);}
        else{let terms=[];for(let k=0;k<w.shape[0];k++){const c=w.constant[k*w.shape[1]+j];if(c!==0)terms.push(c===1?x.items[k]:emit(floatOp('*',x.items[k],literal(c,1),1),1));}let sum=terms.shift()||'0.0f';for(const t of terms)sum=emit(floatOp('+',sum,t,1),1);items.push(sum);}
      }set(outs[0],items,1);continue;
    }
    if(n.op==='Split'){if(a.axis!==1)throw Error('Split must preserve independent lanes');const x=vs[0];const sizes=vs[1]?.constant||Array(outs.length).fill(x.items.length/outs.length);let off=0;if(sizes.length!==outs.length||sizes.some(s=>!Number.isInteger(s))||sizes.reduce((p,c)=>p+c,0)!==x.items.length)throw Error('Invalid split');outs.forEach((name,i)=>{set(name,x.items.slice(off,off+sizes[i]),x.type);off+=sizes[i];});continue;}
    if(n.op==='Concat'){if(a.axis!==1)throw Error('Concat must preserve lanes');if(vs.some(v=>v.type!==vs[0].type))throw Error('Mixed concat types');set(outs[0],vs.flatMap(v=>v.items),vs[0].type);continue;}
    if(['Reshape','Flatten','Squeeze','Unsqueeze'].includes(n.op)){if(n.op==='Flatten'&&(a.axis??1)!==1)throw Error('Cross-lane flatten');set(outs[0],vs[0].items,vs[0].type);continue;}
    if(n.op==='GatherElements'){
      const [x,ix]=vs;if((a.axis??0)!==1||x.constant||!['N'].includes(x.shape[0])||ix.shape[0]!=='N')throw Error('GatherElements must select inside one lane');
      const arr=ensureArray(x),items=ix.items.map(index=>emit(`${arr}[u32(${index})]`,x.type));set(outs[0],items,x.type);continue;
    }
    if(n.op==='Gather'){
      const x=vs[0],ix=vs[1],axis=a.axis??0;let rows,cols;
      if(x.constant){if(axis!==0||x.shape.length>2)throw Error('Only constant rows can Gather axis0');rows=x.shape[0];cols=x.shape.length===2?x.shape[1]:1;}
      else {if(axis!==1||!ix.constant)throw Error('Gather axis1 needs constant indices; use GatherElements for per-lane indices');rows=x.items.length;cols=1;}
      const items=[];for(const index of ix.items)for(let j=0;j<cols;j++)items.push(emit(at(x,`(u32(${index}) * ${cols}u + ${j}u)`),x.type));set(outs[0],items,x.type);continue;
    }
    if(['ReduceSum','ReduceMin','ReduceMax','ReduceProd','ArgMax','ArgMin'].includes(n.op)){
      const axes=vs[1]?.constant||a.axes||(n.op.startsWith('Arg')?[a.axis??0]:[]);if(axes.length!==1||axes[0]!==1)throw Error('Reduction must be inside one lane');const x=vs[0];let acc=x.items[0],index='0i';
      for(let j=1;j<x.items.length;j++){const cur=x.items[j];if(n.op==='ReduceSum')acc=emit(floatOp('+',acc,cur,x.type),x.type);else if(n.op==='ReduceProd')acc=emit(floatOp('*',acc,cur,x.type),x.type);else if(n.op==='ReduceMin')acc=emit(`min(${acc},${cur})`,x.type);else if(n.op==='ReduceMax')acc=emit(`max(${acc},${cur})`,x.type);else{const compare=n.op==='ArgMax'?'>':'<',cond=emit(`(${cur} ${compare}${a.select_last_index?'=':''} ${acc})`,9);index=emit(`select(${index},${j}i,${cond})`,6);acc=emit(`select(${acc},${cur},${cond})`,x.type);}}
      set(outs[0],[n.op.startsWith('Arg')?index:acc],n.op.startsWith('Arg')?6:x.type);continue;
    }
    const width=Math.max(...vs.map(v=>v.items.length));if(vs.some(v=>v.items.length!==1&&v.items.length!==width))throw Error('Unsupported broadcast at '+n.name);
    let type=vs[0].type;const items=[];
    const expression=j=>{const x=vs.map(v=>at(v,j));let e;
      const infix={Add:'+',Sub:'-',Mul:'*',Div:'/',Less:'<',Greater:'>',LessOrEqual:'<=',GreaterOrEqual:'>=',Equal:'==',And:'&&',Or:'||',Xor:'!='};
      if(n.op in infix){const op=infix[n.op];if(['Less','Greater','LessOrEqual','GreaterOrEqual','Equal','And','Or','Xor'].includes(n.op))type=9;e=floatOp(op,x[0],x[1],vs[0].type);if(n.op==='Div'&&strictFloat&&vs[0].type===1)throw Error('Strict float division requires a proven lowering');}
      else if(['Floor','Ceil','Abs','Sqrt','Exp','Log','Round'].includes(n.op)){e=`${n.op.toLowerCase()}(${x[0]})`;if(strictFloat&&['Sqrt','Exp','Log'].includes(n.op))throw Error('Uncertified transcendental operator');}
      else if(n.op==='Neg')e=`(-${x[0]})`;
      else if(n.op==='Not'){e=`!${x[0]}`;type=9;}
      else if(n.op==='Min'||n.op==='Max'){e=x.slice(1).reduce((s,v)=>`${n.op.toLowerCase()}(${s},${v})`,x[0]);}
      else if(n.op==='Where'){type=vs[1].type;e=`select(${x[2]},${x[1]},${x[0]})`;}
      else if(n.op==='Cast'){type=a.to;if(type===9)e=vs[0].type===9?x[0]:`(${x[0]} != ${literal(0,vs[0].type)})`;else if(vs[0].type===9)e=`select(${literal(0,type)},${literal(1,type)},${x[0]})`;else e=`${typeName(type)}(${x[0]})`;}
      else if(n.op==='Clip'){e=`clamp(${x[0]},${x[1]||literal(a.min,vs[0].type)},${x[2]||literal(a.max,vs[0].type)})`;}
      else if(n.op==='Relu')e=`max(${x[0]},${literal(0,type)})`;
      else if(n.op==='Mod')e=a.fmod?`(${x[0]} % ${x[1]})`:`(${x[0]} - floor(${x[0]} / ${x[1]}) * ${x[1]})`;
      else throw Error(`Unsupported ONNX operator: ${n.op} (${n.name})`);
      return e;
    };
    if(width>8){const name=`vector_${serial++}`,index=`i_${serial++}`,e=expression(index),users=consumers.get(outs[0])||[];
      if(inlineVectors&&!externallyUsed.has(outs[0])&&users.length===1&&pointwise.has(users[0].op)&&e.length<=4096){
        for(let j=0;j<width;j++)items.push(e.split(index).join(`${j}u`));set(outs[0],items,type);get(outs[0]).inline={expression:e,index};inlinedVectors++;
      }else{lines.push(`var ${name}:array<${typeName(type)},${width}>; for(var ${index}=0u;${index}<min(${width}u,params.loopLimit);${index}=${index}+1u){${name}[${index}]=${e};}`);for(let j=0;j<width;j++)items.push(`${name}[${j}u]`);set(outs[0],items,type);get(outs[0]).array=name;}
    }
    else{for(let j=0;j<width;j++)items.push(emit(expression(j),type));set(outs[0],items,type);}
  }
  for(const v of graph.outputs){const actual=get(v.name),width=laneWidth(v);if(actual.items.length!==width||actual.type!==v.dtype)throw Error('Output layout mismatch '+v.name);outputLayouts.push({...v,width,offset:outputWords});outputWords+=width;}
  for(const [input,output] of Object.entries(feedback)){const x=get(input),y=get(output);if(!graph.inputs.some(v=>v.name===input)||x.type!==y.type||x.items.length!==y.items.length)throw Error('Invalid feedback mapping '+input);}
  const load=(t,s)=>t===1?`bitcast<f32>(${s})`:t===6?`bitcast<i32>(${s})`:`(${s} != 0u)`;
  const save=(t,s)=>t===9?`select(0u,1u,${s})`:`bitcast<u32>(${s})`;
  const stageOffset=name=>staged.layouts[name].offsetExpression??`${staged.layouts[name].offset}u`;
  const inputAddress=(v,j)=>staged?`state[lane * ${staged.stateWords}u + ${stageOffset(v.name)}+${j}]`:`inputs[lane * ${inputWords}u + ${v.offset}u+${j}]`;
  const decl=inputLayouts.flatMap((v,i)=>v.array?[`var ${v.array}:array<${typeName(v.dtype)},${v.width}>; for(var k=0u;k<min(${v.width}u,params.loopLimit);k=k+1u){${v.array}[k]=${load(v.dtype,inputAddress(v,'k'))};}`]:Array.from({length:v.width},(_,j)=>`var in_${i}_${j}: ${typeName(v.dtype)} = ${load(v.dtype,inputAddress(v,j+'u'))};`));
  const storageOutputWords=outputWords+1;
  const writes=outputLayouts.flatMap(v=>get(v.name).items.map((s,j)=>`outputs[lane * ${storageOutputWords}u + ${v.offset+j}u] = ${save(v.dtype,s)};`));
  writes.push(`outputs[lane * ${storageOutputWords}u + ${outputWords}u] = step+1u;`);
  const snapshots=[],updates=[],stableChecks=[];const same=(type,a,b)=>type===1?`(bitcast<u32>(${a}) == bitcast<u32>(${b}))`:`(${a} == ${b})`;
  for(const [input,output] of Object.entries(feedback)){const a=get(input),b=get(output),name=`feedback_${snapshots.length}`;
    if(a.array){snapshots.push(`let ${name}=array<${typeName(b.type)},${b.items.length}>(${b.items.join(',')});`);updates.push(`${a.array}=${name};`);stableChecks.push(`for(var k=0u;k<min(${a.items.length}u,params.loopLimit)&&state_fixed;k=k+1u){state_fixed=${same(a.type,`${a.array}[k]`,`${name}[k]`)};}`);}
    else{snapshots.push(...b.items.map((s,j)=>`let ${name}_${j}=${s};`));updates.push(...a.items.map((s,j)=>`${s}=${name}_${j};`));stableChecks.push(...a.items.map((s,j)=>`state_fixed=state_fixed&&${same(a.type,s,`${name}_${j}`)};`));}
  }
  // F(x)=y and feedback(y)=x means the next call has bit-identical inputs.
  // Every supported operator is pure. Its complete output is therefore y on
  // every remaining iteration. This uses all feedback fields, not a heuristic
  // win flag, and still evaluates every input lane at least once.
  const stability=fixedPointExit?`var state_fixed=true;\n${stableChecks.join('\n')}`:'let state_fixed=false;';
  let code=`${strictFloat?SOFTFLOAT:''}\n// loopLimit is supplied as 0xffffffff; a uniform loop bound prevents pathological compiler unrolling.\nstruct Parameters { count: u32, repeats: u32, loopLimit: u32, pad1: u32 };\n@group(0) @binding(0) var<storage, read> inputs: array<u32>;\n@group(0) @binding(1) var<storage, read_write> outputs: array<u32>;\n@group(0) @binding(2) var<uniform> params: Parameters;\n${weightPool.length?'@group(0) @binding(3) var<storage, read> weights: array<u32>;':''}\n@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3<u32>) {\nlet lane=id.x; if(lane >= params.count){return;}\n${constants.join('\n')}\n${decl.join('\n')}\nfor(var step=0u; step<params.repeats; step=step+1u){\n${lines.join('\n')}\n${snapshots.join('\n')}\n${stability}\nif(step+1u==params.repeats||state_fixed){${writes.join('\n')}break;}\n${updates.join('\n')}\n}\n}`;
  if(staged){
    const address=(name,j=0)=>`state[lane * ${staged.stateWords}u + ${stageOffset(name)}+${j}u]`;
    const progress=`state[lane * ${staged.stateWords}u + ${staged.progressOffset}u]`,active=`state[lane * ${staged.stateWords}u + ${staged.activeOffset}u]`;
    const store=outputLayouts.flatMap(v=>get(v.name).items.map((s,j)=>`${address(v.name,j)}=${save(v.dtype,s)};`));
    const tail=[];
    if(staged.last){
      const feedbackSnapshots=[],feedbackUpdates=[],checks=[];let index=0;
      for(const [input,output] of Object.entries(staged.rootFeedback))for(let j=0;j<staged.layouts[input].width;j++){
        const local=`staged_feedback_${index++}`;feedbackSnapshots.push(`let ${local}=${address(output,j)};`);checks.push(`state_fixed=state_fixed&&(${address(input,j)}==${local});`);feedbackUpdates.push(`${address(input,j)}=${local};`);
      }
      const finalWrites=staged.rootOutputs.flatMap(v=>Array.from({length:v.width},(_,j)=>`outputs[lane * ${staged.rootStorageOutputWords}u + ${v.offset+j}u]=${address(v.name,j)};`));
      finalWrites.push(`outputs[lane * ${staged.rootStorageOutputWords}u + ${staged.rootStorageOutputWords-1}u]=next_step;`);
      tail.push(...feedbackSnapshots,`var state_fixed=${fixedPointExit?'true':'false'};`,...(fixedPointExit?checks:[]),`let next_step=${progress}+1u;`,`${progress}=next_step;`,`if(next_step==params.repeats||state_fixed){`,...finalWrites,`${active}=0u;`,`}else{`,...feedbackUpdates,`}`);
    }
    code=`${strictFloat?SOFTFLOAT:''}\n// Stage ${staged.index}: all inter-stage values stay in GPU storage.\nstruct Parameters { count:u32, repeats:u32, loopLimit:u32, pad1:u32 };\n@group(0) @binding(0) var<storage,read_write> state:array<u32>;\n@group(0) @binding(1) var<storage,read_write> outputs:array<u32>;\n@group(0) @binding(2) var<uniform> params:Parameters;\n${weightPool.length?'@group(0) @binding(3) var<storage,read> weights:array<u32>;':''}\n@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3<u32>){\nlet lane=id.x;if(lane>=params.count){return;}if(${active}==0u){return;}\n${constants.join('\n')}\n${decl.join('\n')}\n${lines.join('\n')}\n${store.join('\n')}\n${tail.join('\n')}\n}`;
    if(staged.resident){
      // Public outputs are committed only after ALL model stages have read
      // their original input slots. Snapshot first: an output may overwrite
      // a slot still referenced by another output of this same call.
      const r=staged.resident,commitSnapshots=[],commits=[],memoStores=[];let outputWord=0;
      if(staged.last)for(const [outputIndex,v] of staged.rootOutputs.entries())for(let j=0;j<v.width;j++){
        const local=`resident_commit_${outputIndex}_${j}`;
        commitSnapshots.push(`let ${local}=${address(v.name,j)};`);
        commits.push(`state[lane * ${staged.stateWords}u + bindings[params.pad1+${r.inputCount+outputIndex}u]+${j}u]=${local};`);
        if(r.memo)memoStores.push(`state[lane*${staged.stateWords}u+${r.memo.outputOffset+outputWord}u]=${local};`);outputWord++;
      }
      let memoStart='',memoFinish='';
      if(r.memo){const m=r.memo,at=offset=>`state[lane*${staged.stateWords}u+${offset}u]`;
        if(staged.index===0){const comparisons=[],inputCopies=[],restores=[];let inputWord=0,cachedOutput=0;
          for(const [i,v] of r.rootInputs.entries()){
            // A uint XOR/OR reduction compares every bit without a long
            // chain of short-circuit control-flow blocks in the shader.
            if(v.width===1)comparisons.push(`memo_diff=memo_diff|(state[lane*${staged.stateWords}u+bindings[params.pad1+${i}u]]^${at(m.inputOffset+inputWord)});`);
            else comparisons.push(`for(var mk${i}=0u;mk${i}<min(${v.width}u,params.loopLimit);mk${i}=mk${i}+1u){memo_diff=memo_diff|(state[lane*${staged.stateWords}u+bindings[params.pad1+${i}u]+mk${i}]^state[lane*${staged.stateWords}u+${m.inputOffset+inputWord}u+mk${i}]);}`);
            for(let j=0;j<v.width;j++){const source=`state[lane*${staged.stateWords}u+bindings[params.pad1+${i}u]+${j}u]`,cached=at(m.inputOffset+inputWord++);inputCopies.push(`${cached}=${source};`);}
          }
          for(const [i,v] of staged.rootOutputs.entries())for(let j=0;j<v.width;j++)restores.push(`state[lane*${staged.stateWords}u+bindings[params.pad1+${r.inputCount+i}u]+${j}u]=${at(m.outputOffset+cachedOutput++)};`);
          // valid certifies a previous successful domain guard for this exact
          // complete raw input key and immutable model/contract. A hit may
          // reuse that predicate too. On a miss, validate before computing or
          // publishing a new entry; a fault always stops later calls first.
          memoStart=`let memo_valid=(${at(m.validOffset)}!=0u);var memo_diff=0u;\nif(memo_valid){${comparisons.join('\n')}}\nlet memo_same=memo_valid&&(memo_diff==0u);\n${at(m.hitOffset)}=select(0u,1u,memo_same);\nif(memo_same){\n${restores.join('\n')}\n${at(m.hitsOffset)}=${at(m.hitsOffset)}+1u;return;}\n${r.guardCode||''}\n${at(m.validOffset)}=0u;\n${inputCopies.join('\n')}`;
        }else memoStart=`if(${at(m.hitOffset)}!=0u){return;}`;
        if(staged.last)memoFinish=`${memoStores.join('\n')}\n${at(m.validOffset)}=1u;`;
      }
      code=`${strictFloat?SOFTFLOAT:''}\n// Resident ONNX call, stage ${staged.index}; only the final stage commits public slots.\nstruct Parameters {count:u32,repeats:u32,loopLimit:u32,pad1:u32};\n@group(0) @binding(0) var<storage,read_write> state:array<u32>;\n@group(0) @binding(2) var<uniform> params:Parameters;\n${weightPool.length?'@group(0) @binding(3) var<storage,read> weights:array<u32>;':''}\n@group(0) @binding(4) var<storage,read> bindings:array<u32>;\n@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3<u32>){\nlet lane=id.x;if(lane>=params.count){return;}if(state[lane*${staged.stateWords}u+${r.faultOffset}u]!=0u){return;}\n${staged.index===0&&!r.memo?r.guardCode||'':''}\n${memoStart}\n${constants.join('\n')}\n${decl.join('\n')}\n${lines.join('\n')}\n${store.join('\n')}\n${commitSnapshots.join('\n')}\n${memoFinish}\n${commits.join('\n')}\n}`;
    }
  }
  const valueInfos=Object.fromEntries([...values].filter(([,v])=>!v.constant).map(([name,v])=>[name,{name,dtype:v.type,shape:['N',v.items.length]}]));
  return {code,inputLayouts,outputLayouts,inputWords,outputWords,storageOutputWords,weightWords:new Uint32Array(weightPool),nodeCount:graph.nodes.length,scalarValues:serial,inlinedVectors,fixedPointExit,strictFloat,certifiedExactNodes:exact.size,feedback,valueInfos};
}

// Integer-only IEEE-754 binary32 operations. Finite normal values and zero are
// the supported graph domain. Under/overflow follows gradual IEEE rounding.
// These helpers prevent multiplication/addition fusion across rounding sites.
const SOFTFLOAT=`
fn shr_jam(a:u32,n:u32)->u32 {if(n==0u){return a;}if(n>=32u){return select(0u,1u,a!=0u);}return (a>>n)|select(0u,1u,(a<<(32u-n))!=0u);}
fn sf_pack(sign:u32,exponent:i32,mantissa:u32)->f32 {
 var e=exponent;var m=mantissa;
 if(m==0u){return bitcast<f32>(sign);}
 if(e<=0i){m=shr_jam(m,u32(1i-e));e=1i;}
 let tail=m&7u;var v=m>>3u;if(tail>4u||(tail==4u&&(v&1u)!=0u)){v=v+1u;}
 if(v>=0x1000000u){v=v>>1u;e=e+1i;}
 if(e>=255i){return bitcast<f32>(sign|0x7f800000u);}
 if(v<0x800000u){e=0i;}
 return bitcast<f32>(sign|(u32(e)<<23u)|(v&0x7fffffu));
}
fn sf_add(a:f32,b:f32)->f32 {
 var aa=bitcast<u32>(a);var bb=bitcast<u32>(b);
 if((aa&0x7fffffffu)<(bb&0x7fffffffu)){let tmp=aa;aa=bb;bb=tmp;}
 let sa=aa&0x80000000u;let sb=bb&0x80000000u;
 var ea=i32((aa>>23u)&255u);var eb=i32((bb>>23u)&255u);
 if(ea==255i){return bitcast<f32>(aa);}
 var ma=aa&0x7fffffu;var mb=bb&0x7fffffu;
 if(ea!=0i){ma=ma|0x800000u;}else{ea=1i;}
 if(eb!=0i){mb=mb|0x800000u;}else{eb=1i;}
 ma=ma<<3u;mb=shr_jam(mb<<3u,u32(ea-eb));
 var m=0u; if(sa==sb){m=ma+mb;if((m&0x8000000u)!=0u){m=shr_jam(m,1u);ea=ea+1i;}}
 else{m=ma-mb;if(m==0u){return 0.0f;}let shift=countLeadingZeros(m)-5u;m=m<<shift;ea=ea-i32(shift);}
 return sf_pack(sa,ea,m);
}
fn sf_mul(a:f32,b:f32)->f32 {
 let aa=bitcast<u32>(a);let bb=bitcast<u32>(b);let sign=(aa^bb)&0x80000000u;
 var ea=i32((aa>>23u)&255u);var eb=i32((bb>>23u)&255u);
 var ma=aa&0x7fffffu;var mb=bb&0x7fffffu;
 if((aa&0x7fffffffu)==0u||(bb&0x7fffffffu)==0u){return bitcast<f32>(sign);}
 if(ea==255i||eb==255i){return bitcast<f32>(sign|0x7f800000u);}
 if(ea==0i){let shift=countLeadingZeros(ma)-8u;ma=ma<<shift;ea=1i-i32(shift);}else{ma=ma|0x800000u;}
 if(eb==0i){let shift=countLeadingZeros(mb)-8u;mb=mb<<shift;eb=1i-i32(shift);}else{mb=mb|0x800000u;}
 let al=ma&4095u;let ah=ma>>12u;let bl=mb&4095u;let bh=mb>>12u;
 let l=al*bl;let cross=ah*bl+al*bh+(l>>12u);let hi=ah*bh+(cross>>12u);let lo=(cross&4095u)*4096u+(l&4095u);
 var e=ea+eb-127i;var m=0u;
 if((hi&0x800000u)!=0u){m=(hi<<3u)|(lo>>21u)|select(0u,1u,(lo&0x1fffffu)!=0u);e=e+1i;}
 else{m=(hi<<4u)|(lo>>20u)|select(0u,1u,(lo&0xfffffu)!=0u);}
 return sf_pack(sign,e,m);
}
`;

export class FusedGraphSession {
  static async create(graph,options={}){
    if(!globalThis.navigator?.gpu)throw Error('WebGPU is unavailable in this context');
    const adapter=options.adapter||await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw Error('No WebGPU adapter');
    const device=options.device||await adapter.requestDevice();
    if(graph.nodes.length>(options.stageThreshold??1500))return StagedGraphSession.create(graph,{...options,adapter,device,ownsDevice:options.device===undefined});
    const compiled=compileWgsl(graph,options);
    const module=device.createShaderModule({code:compiled.code});const info=await module.getCompilationInfo();const errors=info.messages.filter(x=>x.type==='error');if(errors.length)throw Error(errors.map(x=>`${x.lineNum}:${x.linePos} ${x.message}`).join('\n'));
    device.pushErrorScope('validation');const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}});const err=await device.popErrorScope();if(err)throw Error(err.message);
    return new FusedGraphSession(device,adapter,pipeline,compiled,options.device===undefined);
  }
  constructor(device,adapter,pipeline,compiled,ownsDevice){Object.assign(this,{device,adapter,pipeline,compiled,ownsDevice});this.buffers=[];if(compiled.weightWords.length){this.weightBuffer=device.createBuffer({size:compiled.weightWords.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(this.weightBuffer,0,compiled.weightWords);}this.info={...adapter.info,description:adapter.info?.description,vendor:adapter.info?.vendor,architecture:adapter.info?.architecture,device:adapter.info?.device,isFallbackAdapter:adapter.info?.isFallbackAdapter};}
  async run(feeds,{repeats=1}={}){
    if(!Number.isInteger(repeats)||repeats<1||repeats>4096)throw Error('repeats must be in 1..4096');const c=this.compiled,n=feeds[c.inputLayouts[0].name]?.dims?.[0];if(!Number.isInteger(n)||n<1)throw Error('Invalid batch');
    if(c.strictFloat)validateGpuFloatInputs(feeds);
    const input=new ArrayBuffer(n*c.inputWords*4),iv=new DataView(input);
    for(const v of c.inputLayouts){const x=feeds[v.name];if(!x||x.dims[0]!==n||x.data.length!==n*v.width||x.type!==typeKey(v.dtype))throw Error('Invalid feed '+v.name);for(let i=0;i<n;i++)for(let j=0;j<v.width;j++){const offset=(i*c.inputWords+v.offset+j)*4,z=x.data[i*v.width+j];if(v.dtype===1)iv.setFloat32(offset,z,true);else if(v.dtype===6)iv.setInt32(offset,z,true);else iv.setUint32(offset,z?1:0,true);}}
    const d=this.device,inSize=input.byteLength,outSize=n*c.storageOutputWords*4;if(inSize>d.limits.maxStorageBufferBindingSize||outSize>d.limits.maxStorageBufferBindingSize)throw Error('Batch exceeds WebGPU storage buffer limit');
    if(this.batch!==n){for(const b of this.buffers)b.destroy();this.ib=d.createBuffer({size:inSize,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});this.ob=d.createBuffer({size:outSize,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});this.pb=d.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.rb=d.createBuffer({size:outSize,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});this.buffers=[this.ib,this.ob,this.pb,this.rb];const entries=[{binding:0,resource:{buffer:this.ib}},{binding:1,resource:{buffer:this.ob}},{binding:2,resource:{buffer:this.pb}}];if(this.weightBuffer)entries.push({binding:3,resource:{buffer:this.weightBuffer}});this.group=d.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries});this.batch=n;}
    d.queue.writeBuffer(this.ib,0,input);d.queue.writeBuffer(this.pb,0,new Uint32Array([n,repeats,0xffffffff,0]));const encoder=d.createCommandEncoder();const pass=encoder.beginComputePass();pass.setPipeline(this.pipeline);pass.setBindGroup(0,this.group);pass.dispatchWorkgroups(Math.ceil(n/64));pass.end();encoder.copyBufferToBuffer(this.ob,0,this.rb,0,outSize);d.queue.submit([encoder.finish()]);await this.rb.mapAsync(GPUMapMode.READ);const data=this.rb.getMappedRange(),dv=new DataView(data),out={};
    for(const v of c.outputLayouts){const arr=v.dtype===1?new Float32Array(n*v.width):v.dtype===6?new Int32Array(n*v.width):new Uint8Array(n*v.width);for(let i=0;i<n;i++)for(let j=0;j<v.width;j++){const offset=(i*c.storageOutputWords+v.offset+j)*4;arr[i*v.width+j]=v.dtype===1?dv.getFloat32(offset,true):v.dtype===6?dv.getInt32(offset,true):dv.getUint32(offset,true)?1:0;}out[v.name]={type:typeKey(v.dtype),dims:[n,...v.shape.slice(1)],data:arr};}
    let executedSteps=0,stoppedAtFixedPoint=0,minimumSteps=repeats,maximumSteps=0;for(let i=0;i<n;i++){const count=dv.getUint32((i*c.storageOutputWords+c.outputWords)*4,true);executedSteps+=count;if(count<repeats)stoppedAtFixedPoint++;minimumSteps=Math.min(minimumSteps,count);maximumSteps=Math.max(maximumSteps,count);}
    Object.defineProperty(out,'dq9ExecutionStatistics',{value:{executedSteps,scheduledSteps:n*repeats,stoppedAtFixedPoint,minimumSteps,maximumSteps,allInputLanesExecuted:minimumSteps>=1},enumerable:false});
    this.rb.unmap();return out;
  }
  async release(){for(const b of this.buffers)b.destroy();this.buffers=[];this.weightBuffer?.destroy();if(this.ownsDevice)this.device.destroy();}
}

// Partition at ONNX value boundaries. Only values used by a later stage are
// stored. Nonoverlapping lifetimes share slots; root inputs and outputs remain
// live until the last stage has compared and simultaneously applied feedback.
export function compileStagedWgsl(graph,options={}){
  const limit=options.stageNodeLimit??384;if(!Number.isInteger(limit)||limit<1)throw Error('Invalid stage node limit');
  const normalized={...graph,nodes:[],initializers:[...graph.initializers]};
  for(const node of graph.nodes){if(node.op==='Constant'){if(!node.attributes.value)throw Error('Only tensor Constant supported');normalized.initializers.push({...node.attributes.value,name:node.outputs[0]});}else normalized.nodes.push(node);}
  const whole=compileWgsl(normalized,options),constants=new Set(normalized.initializers.map(v=>v.name)),rootOutputs=new Set([...graph.outputs.map(v=>v.name),...Object.values(options.feedback||{})]),groups=[];
  for(let start=0;start<normalized.nodes.length;start+=limit)groups.push(normalized.nodes.slice(start,start+limit));
  if(!groups.length)throw Error('Staged graph needs at least one node');
  const producers=new Map(),lastUse=new Map();groups.forEach((nodes,i)=>nodes.forEach(n=>n.outputs.forEach(name=>producers.set(name,i))));
  groups.forEach((nodes,i)=>nodes.forEach(n=>n.inputs.filter(Boolean).forEach(name=>lastUse.set(name,Math.max(lastUse.get(name)??-1,i)))));
  for(const name of rootOutputs)lastUse.set(name,groups.length-1);
  const info=name=>{const v=whole.valueInfos[name];if(!v)throw Error('Missing staged value shape: '+name);typeKey(v.dtype);return v;};
  const stages=groups.map((nodes,index)=>{
    const inputNames=new Set(),outputNames=new Set();for(const n of nodes){for(const name of n.inputs.filter(Boolean))if(!constants.has(name)&&producers.get(name)!==index)inputNames.add(name);for(const name of n.outputs)if(rootOutputs.has(name)||(lastUse.get(name)??-1)>index)outputNames.add(name);}
    return {index,graph:{name:graph.name+'-stage-'+index,inputs:[...inputNames].map(info),outputs:[...outputNames].map(info),initializers:normalized.initializers,nodes}};
  });
  const layouts={},allocated=[],free=[];let highWater=0;
  const allocate=(v,birth,death,pinned)=>{const width=laneWidth(v);free.sort((a,b)=>a.offset-b.offset);let slot=free.findIndex(x=>x.width>=width),offset;if(slot<0){offset=highWater;highWater+=width;}else{offset=free[slot].offset;free[slot].offset+=width;free[slot].width-=width;if(!free[slot].width)free.splice(slot,1);}const item={...v,width,offset,birth,death,pinned};layouts[v.name]=item;allocated.push(item);};
  for(const v of graph.inputs)allocate(v,-1,stages.length-1,true);
  for(const stage of stages){
    for(const item of allocated)if(!item.pinned&&!item.freed&&item.death<stage.index){free.push({offset:item.offset,width:item.width});item.freed=true;}
    free.sort((a,b)=>a.offset-b.offset);for(let i=free.length-2;i>=0;i--)if(free[i].offset+free[i].width===free[i+1].offset){free[i].width+=free[i+1].width;free.splice(i+1,1);}
    for(const v of stage.graph.outputs)if(!layouts[v.name])allocate(v,stage.index,lastUse.get(v.name)??stage.index,rootOutputs.has(v.name));
    for(const v of stage.graph.inputs)if(!layouts[v.name])throw Error('Unstored staged input: '+v.name);
  }
  const stateWords=highWater+2,progressOffset=highWater,activeOffset=highWater+1,rootFeedback=options.feedback||{};
  const compiledStages=stages.map(stage=>compileWgsl(stage.graph,{...options,feedback:{},staged:{layouts,stateWords,progressOffset,activeOffset,index:stage.index,last:stage.index===stages.length-1,rootFeedback,rootOutputs:whole.outputLayouts,rootStorageOutputWords:whole.storageOutputWords}}));
  return {...whole,code:compiledStages.map((s,i)=>'// ---- Separate pipeline '+i+' ----\n'+s.code).join('\n'),staged:true,stages:compiledStages,stageGraphs:stages.map(s=>s.graph),stateLayouts:layouts,stateWords,progressOffset,activeOffset,weightWords:new Uint32Array(0),weightBytes:compiledStages.reduce((n,s)=>n+s.weightWords.byteLength,0),stageNodeLimit:limit,feedback:rootFeedback};
}

export class StagedGraphSession {
  static async create(graph,options={}){
    const adapter=options.adapter||await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw Error('No WebGPU adapter');
    const device=options.device||await adapter.requestDevice(),compiled=compileStagedWgsl(graph,options),pipelines=[],weightBuffers=[];
    for(const stage of compiled.stages){
      const module=device.createShaderModule({code:stage.code}),info=await module.getCompilationInfo(),errors=info.messages.filter(x=>x.type==='error');if(errors.length)throw Error(errors.map(x=>`${x.lineNum}:${x.linePos} ${x.message}`).join('\n'));
      const entries=[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},{binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},{binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform'}}];
      if(stage.weightWords.length)entries.push({binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}});
      const bindLayout=device.createBindGroupLayout({entries}),layout=device.createPipelineLayout({bindGroupLayouts:[bindLayout]});
      device.pushErrorScope('validation');const pipeline=await device.createComputePipelineAsync({layout,compute:{module,entryPoint:'main'}}),error=await device.popErrorScope();if(error)throw Error(error.message);pipelines.push(pipeline);
      let weights=null;if(stage.weightWords.length){weights=device.createBuffer({size:stage.weightWords.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(weights,0,stage.weightWords);}weightBuffers.push(weights);
    }
    return new StagedGraphSession(device,adapter,compiled,pipelines,weightBuffers,options.ownsDevice??options.device===undefined,options.maxBatchSize);
  }
  constructor(device,adapter,compiled,pipelines,weightBuffers,ownsDevice,maxBatchSize=Infinity){Object.assign(this,{device,adapter,compiled,pipelines,weightBuffers,ownsDevice,maxBatchSize});this.buffers=[];this.info={vendor:adapter.info?.vendor,architecture:adapter.info?.architecture,description:adapter.info?.description,isFallbackAdapter:adapter.info?.isFallbackAdapter};}
  async run(feeds,{repeats=1}={}){
    if(!Number.isInteger(repeats)||repeats<1||repeats>4096)throw Error('repeats must be in 1..4096');const c=this.compiled,d=this.device,n=feeds[c.inputLayouts[0].name]?.dims?.[0];if(!Number.isInteger(n)||n<1)throw Error('Invalid batch');
    if(c.strictFloat)validateGpuFloatInputs(feeds);
    const maximumBatch=Math.min(this.maxBatchSize,Math.floor(d.limits.maxStorageBufferBindingSize/(4*Math.max(c.stateWords,c.storageOutputWords))));if(!Number.isInteger(maximumBatch)||maximumBatch<1)throw Error('Invalid staged GPU batch capacity');
    if(n>maximumBatch){
      for(const v of c.inputLayouts){const x=feeds[v.name];if(!x||x.dims[0]!==n||x.data.length!==n*v.width||x.type!==typeKey(v.dtype))throw Error('Invalid feed '+v.name);}
      const out={},statistics={executedSteps:0,scheduledSteps:n*repeats,stoppedAtFixedPoint:0,minimumSteps:repeats,maximumSteps:0,allInputLanesExecuted:true,stageCount:this.pipelines.length,gpuDispatches:0,intermediateCpuReadbacks:0,inputBatches:0};
      for(let start=0;start<n;start+=maximumBatch){const count=Math.min(maximumBatch,n-start),part=Object.fromEntries(c.inputLayouts.map(v=>[v.name,{type:feeds[v.name].type,dims:[count,...feeds[v.name].dims.slice(1)],data:feeds[v.name].data.subarray(start*v.width,(start+count)*v.width)}])),got=await this.run(part,{repeats});
        for(const [name,tensor] of Object.entries(got)){const width=tensor.data.length/count;if(!out[name])out[name]={type:tensor.type,dims:[n,...tensor.dims.slice(1)],data:new tensor.data.constructor(n*width)};out[name].data.set(tensor.data,start*width);}
        const s=got.dq9ExecutionStatistics;statistics.executedSteps+=s.executedSteps;statistics.stoppedAtFixedPoint+=s.stoppedAtFixedPoint;statistics.minimumSteps=Math.min(statistics.minimumSteps,s.minimumSteps);statistics.maximumSteps=Math.max(statistics.maximumSteps,s.maximumSteps);statistics.allInputLanesExecuted&&=s.allInputLanesExecuted;statistics.gpuDispatches+=s.gpuDispatches;statistics.inputBatches++;
      }
      Object.defineProperty(out,'dq9ExecutionStatistics',{value:statistics,enumerable:false});return out;
    }
    const stateSize=n*c.stateWords*4,outSize=n*c.storageOutputWords*4;
    const state=new ArrayBuffer(stateSize),view=new DataView(state);
    for(const v of c.inputLayouts){const x=feeds[v.name],target=c.stateLayouts[v.name];if(!x||x.dims[0]!==n||x.data.length!==n*v.width||x.type!==typeKey(v.dtype))throw Error('Invalid feed '+v.name);for(let i=0;i<n;i++)for(let j=0;j<v.width;j++){const offset=(i*c.stateWords+target.offset+j)*4,z=x.data[i*v.width+j];if(v.dtype===1)view.setFloat32(offset,z,true);else if(v.dtype===6)view.setInt32(offset,z,true);else view.setUint32(offset,z?1:0,true);}}
    for(let i=0;i<n;i++)view.setUint32((i*c.stateWords+c.activeOffset)*4,1,true);
    if(this.batch!==n){
      for(const b of this.buffers)b.destroy();this.sb=d.createBuffer({size:stateSize,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});this.ob=d.createBuffer({size:outSize,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});this.pb=d.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.rb=d.createBuffer({size:outSize,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});this.buffers=[this.sb,this.ob,this.pb,this.rb];this.groups=this.pipelines.map((pipeline,i)=>{const entries=[{binding:0,resource:{buffer:this.sb}},{binding:1,resource:{buffer:this.ob}},{binding:2,resource:{buffer:this.pb}}];if(this.weightBuffers[i])entries.push({binding:3,resource:{buffer:this.weightBuffers[i]}});return d.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries});});this.batch=n;
    }
    d.queue.writeBuffer(this.sb,0,state);d.queue.writeBuffer(this.pb,0,new Uint32Array([n,repeats,0xffffffff,0]));const encoder=d.createCommandEncoder(),pass=encoder.beginComputePass();
    for(let step=0;step<repeats;step++)for(let i=0;i<this.pipelines.length;i++){pass.setPipeline(this.pipelines[i]);pass.setBindGroup(0,this.groups[i]);pass.dispatchWorkgroups(Math.ceil(n/64));}pass.end();encoder.copyBufferToBuffer(this.ob,0,this.rb,0,outSize);d.queue.submit([encoder.finish()]);await this.rb.mapAsync(GPUMapMode.READ);
    const data=this.rb.getMappedRange(),dv=new DataView(data),out={};
    for(const v of c.outputLayouts){const arr=v.dtype===1?new Float32Array(n*v.width):v.dtype===6?new Int32Array(n*v.width):new Uint8Array(n*v.width);for(let i=0;i<n;i++)for(let j=0;j<v.width;j++){const offset=(i*c.storageOutputWords+v.offset+j)*4;arr[i*v.width+j]=v.dtype===1?dv.getFloat32(offset,true):v.dtype===6?dv.getInt32(offset,true):dv.getUint32(offset,true)?1:0;}out[v.name]={type:typeKey(v.dtype),dims:[n,...v.shape.slice(1)],data:arr};}
    let executedSteps=0,stoppedAtFixedPoint=0,minimumSteps=repeats,maximumSteps=0;for(let i=0;i<n;i++){const count=dv.getUint32((i*c.storageOutputWords+c.outputWords)*4,true);executedSteps+=count;if(count<repeats)stoppedAtFixedPoint++;minimumSteps=Math.min(minimumSteps,count);maximumSteps=Math.max(maximumSteps,count);}
    Object.defineProperty(out,'dq9ExecutionStatistics',{value:{executedSteps,scheduledSteps:n*repeats,stoppedAtFixedPoint,minimumSteps,maximumSteps,allInputLanesExecuted:minimumSteps>=1,stageCount:this.pipelines.length,gpuDispatches:repeats*this.pipelines.length,intermediateCpuReadbacks:0},enumerable:false});this.rb.unmap();return out;
  }
  async release(){for(const b of this.buffers)b.destroy();for(const b of this.weightBuffers)b?.destroy();this.buffers=[];if(this.ownsDevice)this.device.destroy();}
}
