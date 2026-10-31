import {readOnnx,compileWgsl,compileStagedWgsl} from './graph-runtime.mjs';

// A data-defined schedule of pure ONNX calls. All permanent slots, temporary
// model values and diagnostic captures stay on the device until the schedule
// ends. This module contains tensor plumbing, not battle rules.
const typeId={float32:1,int32:6,bool:9};
const typeArray=t=>t==='float32'?Float32Array:t==='int32'?Int32Array:Uint8Array;
const typeName=t=>t===1?'f32':t===6?'i32':'bool';
const widthOf=v=>v.shape.slice(1).reduce((a,b)=>a*b,1);
const numeric=(v,t)=>t===9?`select(0.0f,1.0f,${v})`:t===6?`f32(${v})`:v;
const literal=x=>{if(!Number.isFinite(Number(x)))throw Error('Nonfinite domain constant');return `${Number(x)}${Number.isInteger(Number(x))?'.0':''}f`;};
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const pathGet=(row,path)=>row[path.join('.')]??path.reduce((v,k)=>v?.[k],row);

function guardFor(graph,contract,stateWords,faultOffset){
  const rules=[],indexByName=new Map(graph.inputs.map((v,i)=>[v.name,i]));
  const inputValue=(name,index)=>{
    const i=indexByName.get(name),v=graph.inputs[i];if(!v||index<0||index>=widthOf(v))throw Error('Invalid domain input '+name+'['+index+']');
    const raw=`state[lane*${stateWords}u+bindings[params.pad1+${i}u]+${index}u]`;
    return {raw,dtype:v.dtype,expression:v.dtype===9?`(${raw}!=0u)`:`bitcast<${typeName(v.dtype)}>(${raw})`};
  };
  for(const v of graph.inputs)for(let j=0;j<widthOf(v);j++){
    const x=inputValue(v.name,j),z=numeric(x.expression,x.dtype),checks=[];
    if(v.dtype===1)checks.push(`((${x.raw}&0x7f800000u)!=0x7f800000u)`,`((${x.raw}&0x7fffffffu)==0u||(${x.raw}&0x7f800000u)!=0u)`);
    if(v.dtype===9)checks.push(`(${x.raw}<=1u)`);
    for(const rule of [contract.inputDomains?.[v.name],contract.fieldDomains?.[v.name]?.[j]])if(rule){
      for(const key of Object.keys(rule))if(!['name','width','integer','min','max','values'].includes(key))throw Error('Unsupported domain property '+key);
      if(rule.integer&&v.dtype===1)checks.push(`(floor(${z})==${z})`);
      if(v.dtype===6){
        // Compare int32 as int32. Converting 16777217 to f32 would otherwise
        // incorrectly satisfy an exact bound of 16777216.
        if(rule.min!==undefined){const bound=Math.ceil(rule.min);checks.push(bound<=-2147483648?'true':bound>2147483647?'false':`(${x.expression}>=${bound}i)`);}
        if(rule.max!==undefined){const bound=Math.floor(rule.max);checks.push(bound>=2147483647?'true':bound< -2147483648?'false':`(${x.expression}<=${bound}i)`);}
        if(rule.values){const values=[...new Set(rule.values.map(Number))].filter(value=>Number.isInteger(value)&&value>=-2147483648&&value<=2147483647);checks.push(values.length?'('+values.map(value=>`(${x.expression}==${value}i)`).join('||')+')':'false');}
      }else{
        for(const bound of [rule.min,rule.max,...rule.values||[]])if(bound!==undefined&&Math.fround(Number(bound))!==Number(bound))throw Error('Domain constant is not exactly representable as float32: '+v.name);
        if(rule.min!==undefined)checks.push(`(${z}>=${literal(rule.min)})`);
        if(rule.max!==undefined)checks.push(`(${z}<=${literal(rule.max)})`);
        if(rule.values)checks.push('('+[...new Set(rule.values.map(Number))].map(value=>`(${z}==${literal(value)})`).join('||')+')');
      }
    }
    if(checks.length)rules.push({label:`${v.name}[${j}]`,check:checks.join('&&')});
  }
  const relationValue=r=>{
    if(!r.input)return literal(r.value);
    if(r.reduce){if(r.reduce!=='sum')throw Error('Unsupported domain reduction '+r.reduce);return '('+Array.from({length:widthOf(graph.inputs[indexByName.get(r.input)])},(_,j)=>{const x=inputValue(r.input,j);return numeric(x.expression,x.dtype);}).join('+')+')';}
    const x=inputValue(r.input,r.index??0);return numeric(x.expression,x.dtype);
  };
  for(const r of contract.relations||[]){if(!['<','<=','>','>=','==','!='].includes(r.op))throw Error('Unsupported domain relation');const intLeft=r.left.input&&graph.inputs[indexByName.get(r.left.input)]?.dtype===6,intRight=r.right.input&&graph.inputs[indexByName.get(r.right.input)]?.dtype===6;let check;
    if(intLeft||intRight){if(!intLeft||!intRight||r.left.reduce||r.right.reduce)throw Error('Integer relation needs two scalar int32 inputs');check=`(${inputValue(r.left.input,r.left.index??0).expression}${r.op}${inputValue(r.right.input,r.right.index??0).expression})`;}
    else check=`(${relationValue(r.left)}${r.op}${relationValue(r.right)})`;rules.push({label:JSON.stringify(r),check});}
  const initialization=contract.initialization;
  if(initialization){if(initialization.counter.input&&graph.inputs[indexByName.get(initialization.counter.input)]?.dtype===6)throw Error('Integer initialization counter needs an explicit lowering');const condition=`(${relationValue(initialization.counter)}==${literal(initialization.equals)})`;
    for(const name of initialization.zeroInputs)for(let j=0;j<widthOf(graph.inputs[indexByName.get(name)]);j++){const x=inputValue(name,j);rules.push({label:`initialization:${name}[${j}]`,check:`(!${condition}||${numeric(x.expression,x.dtype)}==0.0f)`});}}
  const code=rules.map((r,i)=>`if(!(${r.check})){state[lane*${stateWords}u+${faultOffset}u]=${i+1}u;state[lane*${stateWords}u+${faultOffset+1}u]=params.repeats;return;}`).join('\n');
  return {code,labels:rules.map(r=>r.label)};
}

export function compileResidentProgram(program,models,{stageNodeLimit=384,stageThreshold=1500,memoizeModels=[]}={}){
  if(program.schema!=='dq9-resident-onnx-program-v1')throw Error('Unsupported resident program schema');
  const slots=new Map();let permanentWords=0;
  for(const slot of program.slots){if(slots.has(slot.name)||!typeId[slot.dtype]||!Number.isInteger(slot.width)||slot.width<1)throw Error('Invalid or duplicate program slot '+slot.name);slots.set(slot.name,{...slot,offset:permanentWords});permanentWords+=slot.width;}
  const plans=new Map();let scratchWords=0;
  for(const module of program.modules){
    const m=models.get(module.name);if(!m)throw Error('Program model absent: '+module.name);
    // Every call receives fresh guarded inputs; one-call interval proofs are
    // therefore applicable even when the same pipeline is reused later.
    const options={strictFloat:true,feedback:{},fixedPointExit:false,stageNodeLimit:m.graph.nodes.length>stageThreshold?stageNodeLimit:Math.max(1,m.graph.nodes.length),exactOutputs:m.ir.nodes.filter(n=>n.exactArithmetic).flatMap(n=>n.outputs)};
    const plan=compileStagedWgsl(m.graph,options);plans.set(module.name,{...m,plan,options});scratchWords=Math.max(scratchWords,plan.stateWords);
  }
  const faultOffset=permanentWords+scratchWords,compiledModels=new Map(),memoLayouts=new Map();let stateWords=faultOffset+2;
  for(const name of memoizeModels){const m=plans.get(name);if(!m||memoLayouts.has(name))throw Error('Invalid or duplicate memo model '+name);const inputWords=m.plan.inputWords,outputWords=m.plan.outputWords,validOffset=stateWords,hitOffset=stateWords+1,inputOffset=stateWords+2,outputOffset=inputOffset+inputWords,hitsOffset=outputOffset+outputWords;memoLayouts.set(name,{name,validOffset,hitOffset,inputOffset,outputOffset,hitsOffset,inputWords,outputWords,words:inputWords+outputWords+3});stateWords=hitsOffset+1;}
  for(const [name,m] of plans){
    const layouts=Object.fromEntries(Object.entries(m.plan.stateLayouts).map(([k,v])=>[k,{...v,offset:v.offset+permanentWords}]));
    m.graph.inputs.forEach((v,i)=>layouts[v.name]={...layouts[v.name],offsetExpression:`bindings[params.pad1+${i}u]`});
    const guards=guardFor(m.graph,m.ir.contract||{},stateWords,faultOffset);
    const stages=m.plan.stageGraphs.map((graph,index)=>compileWgsl(graph,{...m.options,staged:{layouts,stateWords,index,last:index===m.plan.stageGraphs.length-1,rootFeedback:{},rootOutputs:m.plan.outputLayouts,rootStorageOutputWords:m.plan.storageOutputWords,progressOffset:0,activeOffset:0,resident:{faultOffset,inputCount:m.graph.inputs.length,guardCode:guards.code,rootInputs:m.plan.inputLayouts,memo:memoLayouts.get(name)}}}));
    compiledModels.set(name,{name,graph:m.graph,ir:m.ir,stages,guardLabels:guards.labels,inputLayouts:m.plan.inputLayouts,outputLayouts:m.plan.outputLayouts});
  }
  const slotFor=(name,definition)=>{const slot=slots.get(name);if(!slot)throw Error('Unknown program slot '+name);if(definition&&(typeId[slot.dtype]!==definition.dtype||slot.width!==widthOf(definition)))throw Error('Program binding type/shape mismatch '+name+' -> '+definition.name);return slot;};
  const bindingWords=[],bindings=new Map(),captureLayouts=new Map();
  function inspect(steps){for(const s of steps){if(s.op==='repeat'){inspect(s.body);continue;}if(s.op==='capture'){for(const name of Object.values(s.tensors))slotFor(name);const layout=JSON.stringify(s.tensors);if(captureLayouts.has(s.id)&&captureLayouts.get(s.id)!==layout)throw Error('Capture id has inconsistent layouts: '+s.id);captureLayouts.set(s.id,layout);continue;}if(s.op!=='call')throw Error('Unsupported schedule instruction '+s.op);const m=compiledModels.get(s.model);if(!m)throw Error('Unknown call model '+s.model);for(const [defs,map] of [[m.graph.inputs,s.inputs],[m.graph.outputs,s.outputs]])if(Object.keys(map).length!==defs.length||defs.some(v=>!Object.hasOwn(map,v.name)))throw Error('Incomplete program binding '+s.id);const offsets=[...m.graph.inputs.map(v=>slotFor(s.inputs[v.name],v).offset),...m.graph.outputs.map(v=>slotFor(s.outputs[v.name],v).offset)],key=JSON.stringify([s.model,offsets]);if(!bindings.has(key)){bindings.set(key,bindingWords.length);bindingWords.push(...offsets);}s.residentBindingOffset=bindings.get(key);}}
  // Work on our own schedule; callers may retain an immutable evidence copy.
  const steps=structuredClone(program.steps);inspect(steps);
  for(const name of Object.values(program.inputs))slotFor(name);
  const outputLayouts=[];let outputWords=0;
  for(const [name,slotName] of Object.entries(program.outputs)){const slot=slotFor(slotName);outputLayouts.push({...slot,name,slotName,resultOffset:outputWords});outputWords+=slot.width;}
  return {program,steps,slots,models:compiledModels,stateWords,permanentWords,scratchWords,faultOffset,memoLayouts,bindings:new Uint32Array(bindingWords),outputLayouts,outputWords,storageOutputWords:outputWords+2+memoLayouts.size};
}

function scheduleFor(compiled,parameters,capture){
  const values={};for(const [name,rule] of Object.entries(compiled.program.parameters)){const x=parameters[name]??rule.default;if(!Number.isInteger(x)||x<rule.min||x>rule.max)throw Error(`Program parameter ${name} must be ${rule.min}..${rule.max}`);values[name]=x;}
  for(const name of Object.keys(parameters))if(!Object.hasOwn(values,name))throw Error('Unknown program parameter '+name);
  const out=[];function expand(steps,path){for(const s of steps){if(s.op==='repeat'){const count=typeof s.count==='number'?s.count:values[s.count.parameter];if(!Number.isInteger(count)||count<0||count>4096)throw Error('Invalid program repeat');for(let i=0;i<count;i++)expand(s.body,[...path,{id:s.id,index:i}]);}else if(s.op==='call'||capture===true||capture==='all'||Array.isArray(capture)&&capture.includes(s.id)||capture===s.id)out.push({...s,path});}}
  expand(compiled.steps,[]);let callIndex=0;for(const s of out)if(s.op==='call')s.callIndex=++callIndex;
  return {steps:out,parameters:values,callCount:callIndex};
}

async function pipelineFor(device,code,hasWeights=false,{copy=false}={}){
  const module=device.createShaderModule({code}),info=await module.getCompilationInfo(),errors=info.messages.filter(m=>m.type==='error');if(errors.length)throw Error(errors.map(m=>`${m.lineNum}:${m.linePos} ${m.message}`).join('\n'));
  const entries=[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:copy?'read-only-storage':'storage'}},{binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform',hasDynamicOffset:true}}];
  if(copy)entries.push({binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}});else entries.push({binding:4,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}});
  if(hasWeights)entries.push({binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}});
  const bindLayout=device.createBindGroupLayout({entries}),layout=device.createPipelineLayout({bindGroupLayouts:[bindLayout]});
  device.pushErrorScope('validation');const pipeline=await device.createComputePipelineAsync({layout,compute:{module,entryPoint:'main'}}),error=await device.popErrorScope();if(error)throw Error(error.message);return pipeline;
}

function copyCode(stateWords,layouts){
  const width=layouts.reduce((n,v)=>n+v.width,0);let offset=0;const lines=[];
  for(const v of layouts){lines.push(`for(var k=0u;k<min(${v.width}u,params.loopLimit);k=k+1u){result[params.start+lane*${width}u+${offset}u+k]=state[lane*${stateWords}u+${v.offset}u+k];}`);offset+=v.width;}
  return `struct Parameters {count:u32,captureCount:u32,loopLimit:u32,start:u32};\n@group(0) @binding(0) var<storage,read> state:array<u32>;\n@group(0) @binding(1) var<storage,read_write> result:array<u32>;\n@group(0) @binding(2) var<uniform> params:Parameters;\n@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3<u32>){let lane=id.x;if(lane>=params.captureCount){return;}\n${lines.join('\n')}\n}`;
}

export class ResidentProgramSession {
  static async create(program,{getModel,adapter,device,onProgress,stageNodeLimit,stageThreshold,memoizeModels=[],maxBatchSize=Infinity}={}){
    if(!navigator.gpu)throw Error('WebGPU is unavailable');adapter=adapter||await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw Error('No WebGPU adapter');const ownsDevice=!device;device=device||await adapter.requestDevice();
    const models=new Map();for(const m of program.modules){const data=await getModel(m.name);if(!data)throw Error('Missing resident model '+m.name);let graph=data.graph;
      if(data.onnx){const bytes=typeof data.onnx==='string'?Uint8Array.from(atob(data.onnx),c=>c.charCodeAt(0)):data.onnx;if(await hash(bytes)!==m.sha256)throw Error('Resident model SHA mismatch '+m.name);graph=readOnnx(bytes);}if(!graph)throw Error('Missing ONNX graph '+m.name);models.set(m.name,{...data,graph});}
    const compiled=compileResidentProgram(program,models,{stageNodeLimit,stageThreshold,memoizeModels}),pipelines=new Map(),weights=[];
    for(const [name,m] of compiled.models){onProgress?.({kind:'compile',name,stages:m.stages.length});const stages=[];for(const stage of m.stages){const pipeline=await pipelineFor(device,stage.code,stage.weightWords.length>0);let weightBuffer=null;if(stage.weightWords.length){weightBuffer=device.createBuffer({size:stage.weightWords.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(weightBuffer,0,stage.weightWords);weights.push(weightBuffer);}stages.push({pipeline,weightBuffer});}pipelines.set(name,stages);}
    const bindingBuffer=device.createBuffer({size:Math.max(4,compiled.bindings.byteLength),usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(bindingBuffer,0,compiled.bindings);
    const finalLayouts=[...compiled.outputLayouts,{name:'__fault',dtype:'int32',width:2,offset:compiled.faultOffset},...[...compiled.memoLayouts.values()].map(m=>({name:'__memo_'+m.name,dtype:'int32',width:1,offset:m.hitsOffset}))],finalPipeline=await pipelineFor(device,copyCode(compiled.stateWords,finalLayouts),false,{copy:true});
    return new ResidentProgramSession({compiled,adapter,device,ownsDevice,maxBatchSize,pipelines,weights,bindingBuffer,finalPipeline});
  }
  constructor(values){Object.assign(this,values);this.capturePipelines=new Map();this.buffers=[];this.info={vendor:this.adapter.info?.vendor,architecture:this.adapter.info?.architecture,description:this.adapter.info?.description,isFallbackAdapter:this.adapter.info?.isFallbackAdapter};}
  rowsToFeeds(rows){if(!rows.length)throw Error('Empty resident batch');const feeds={};for(const [name,slotName] of Object.entries(this.compiled.program.inputs)){const slot=this.compiled.slots.get(slotName),data=new(typeArray(slot.dtype))(rows.length*slot.width);rows.forEach((row,i)=>{let value=pathGet(row,slot.initial.path);if(value===undefined)value=slot.initial.default;if(!Array.isArray(value)&&!ArrayBuffer.isView(value))value=[value];this.checkValues(slot,value);data.set(value,i*slot.width);});feeds[name]={type:slot.dtype,dims:[rows.length,slot.width],data};}return feeds;}
  checkValues(slot,values){if(values.length!==slot.width)throw Error('Invalid initial slot width '+slot.name);for(const x of values)if(!Number.isFinite(Number(x))||slot.dtype==='int32'&&(!Number.isInteger(x)||x< -2147483648||x>2147483647)||slot.dtype==='bool'&&![0,1,false,true].includes(x))throw Error('Invalid initial slot value '+slot.name);}
  async runRows(rows,options={}){return this.run(this.rowsToFeeds(rows),options);}
  async run(feeds,{parameters={},capture=false,captureLanes,throwOnFault=true}={}){
    if(this.running)throw Error('Concurrent use of one resident session is unsupported');this.running=true;
    try{return await this.runImpl(feeds,{parameters,capture,captureLanes,throwOnFault});}finally{this.running=false;}
  }
  async runImpl(feeds,{parameters,capture,captureLanes,throwOnFault}){
    const c=this.compiled,d=this.device,first=Object.values(feeds)[0],n=first?.dims?.[0];if(!Number.isInteger(n)||n<1)throw Error('Invalid resident batch');
    for(const [name,x] of Object.entries(feeds)){const slot=c.slots.get(c.program.inputs[name]);if(!slot||x.type!==slot.dtype||x.dims.length!==2||x.dims[0]!==n||x.dims[1]!==slot.width||x.data.length!==n*slot.width||!(x.data instanceof typeArray(slot.dtype)))throw Error('Invalid resident feed '+name);if(slot.dtype==='bool'&&x.data.some(value=>value!==0&&value!==1))throw Error('Noncanonical boolean resident feed '+name);}
    const schedule=scheduleFor(c,parameters,capture),capN=capture?Math.min(n,captureLanes??n):0;if(!Number.isInteger(capN)||capN<0)throw Error('Invalid capture lane count');
    let captureWords=0;for(const s of schedule.steps)if(s.op==='capture'){s.captureLayouts=Object.entries(s.tensors).map(([name,slotName])=>({...c.slots.get(slotName),name,slotName}));s.captureWidth=s.captureLayouts.reduce((a,b)=>a+b.width,0);s.captureOffset=captureWords;captureWords+=s.captureWidth;}
    const maximum=Math.floor(Math.min(this.maxBatchSize,d.limits.maxComputeWorkgroupsPerDimension*64,d.limits.maxStorageBufferBindingSize/(4*Math.max(c.stateWords,c.storageOutputWords+captureWords))));if(maximum<1)throw Error('Resident state exceeds GPU buffer limits');
    if(n>maximum){
      const combined={},allCaptures=[],allFaults=[],memoHits={};let gpuDispatches=0,inputBatches=0,readbacks=0,skippedLaneStages=0;
      for(let start=0;start<n;start+=maximum){const count=Math.min(maximum,n-start),part=Object.fromEntries(Object.entries(feeds).map(([name,x])=>{const width=x.dims[1];return[name,{...x,dims:[count,width],data:x.data.subarray(start*width,(start+count)*width)}];})),got=await this.runImpl(part,{parameters,capture:capture&&start<capN?capture:false,captureLanes:Math.max(0,Math.min(count,capN-start)),throwOnFault:false});
        for(const [name,t] of Object.entries(got)){if(!combined[name])combined[name]={type:t.type,dims:[n,t.dims[1]],data:new t.data.constructor(n*t.dims[1])};combined[name].data.set(t.data,start*t.dims[1]);}
        const r=got.dq9Resident;allFaults.push(...r.faults.map(f=>({...f,lane:f.lane+start})));allCaptures.push(...r.captures.map(x=>({...x,laneOffset:start+x.laneOffset})));gpuDispatches+=r.gpuDispatches;inputBatches+=r.inputBatches;readbacks+=r.readbacks;skippedLaneStages+=r.skippedLaneStages||0;for(const [name,hits] of Object.entries(r.memoHits||{}))memoHits[name]=(memoHits[name]||0)+hits;
      }
      Object.defineProperty(combined,'dq9Resident',{value:{parameters:schedule.parameters,captures:allCaptures,faults:allFaults,gpuDispatches,inputBatches,readbacks,memoHits,skippedLaneStages,intermediateCpuReadbacks:0,allInputLanesExecuted:true,scheduledModelCalls:schedule.callCount,seedFiltering:false},enumerable:false});if(throwOnFault&&allFaults.length)throw Error('Resident GPU input domain violation '+JSON.stringify(allFaults[0]));return combined;
    }
    const initial=new ArrayBuffer(n*c.stateWords*4),iv=new DataView(initial);
    for(const slot of c.slots.values()){
      const publicName=Object.keys(c.program.inputs).find(name=>c.program.inputs[name]===slot.name),feed=publicName?feeds[publicName]:null;
      let defaults=slot.initial.kind==='constant'?slot.initial.values:slot.initial.kind==='input'?slot.initial.default:Array(slot.width).fill(0);if(!Array.isArray(defaults))defaults=[defaults];this.checkValues(slot,defaults);
      for(let i=0;i<n;i++)for(let j=0;j<slot.width;j++){const x=feed?feed.data[i*slot.width+j]:defaults[j],offset=(i*c.stateWords+slot.offset+j)*4;if(!Number.isFinite(Number(x)))throw Error('Nonfinite resident input '+publicName);if(slot.dtype==='float32')iv.setFloat32(offset,x,true);else if(slot.dtype==='int32')iv.setInt32(offset,x,true);else iv.setUint32(offset,x?1:0,true);}
    }
    for(const s of schedule.steps)if(s.op==='capture'&&!this.capturePipelines.has(s.id)){this.capturePipelines.set(s.id,await pipelineFor(d,copyCode(c.stateWords,s.captureLayouts),false,{copy:true}));}
    const uniformStride=Math.max(16,d.limits.minUniformBufferOffsetAlignment),uniformBytes=(schedule.steps.length+1)*uniformStride,uniforms=new ArrayBuffer(uniformBytes),uv=new DataView(uniforms),outWords=n*c.storageOutputWords+capN*captureWords;
    for(const b of this.buffers)b.destroy();const sb=d.createBuffer({size:initial.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),ob=d.createBuffer({size:outWords*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),pb=d.createBuffer({size:uniformBytes,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),rb=d.createBuffer({size:outWords*4,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});this.buffers=[sb,ob,pb,rb];
    const groups=new Map(),copyGroups=new Map();
    for(const [name,stages] of this.pipelines)groups.set(name,stages.map(s=>{const entries=[{binding:0,resource:{buffer:sb}},{binding:2,resource:{buffer:pb,size:16}},{binding:4,resource:{buffer:this.bindingBuffer}}];if(s.weightBuffer)entries.push({binding:3,resource:{buffer:s.weightBuffer}});return d.createBindGroup({layout:s.pipeline.getBindGroupLayout(0),entries});}));
    const copyGroup=pipeline=>d.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:sb}},{binding:1,resource:{buffer:ob}},{binding:2,resource:{buffer:pb,size:16}}]});
    for(const [id,pipeline] of this.capturePipelines)copyGroups.set(id,copyGroup(pipeline));const finalGroup=copyGroup(this.finalPipeline);
    function uniform(i,a,b){const off=i*uniformStride;uv.setUint32(off,n,true);uv.setUint32(off+4,a,true);uv.setUint32(off+8,0xffffffff,true);uv.setUint32(off+12,b,true);}
    schedule.steps.forEach((s,i)=>uniform(i,s.op==='call'?s.callIndex:capN,s.op==='call'?s.residentBindingOffset:n*c.storageOutputWords+capN*s.captureOffset));uniform(schedule.steps.length,n,0);
    d.queue.writeBuffer(sb,0,initial);d.queue.writeBuffer(pb,0,uniforms);const encoder=d.createCommandEncoder(),pass=encoder.beginComputePass();let gpuDispatches=0;
    schedule.steps.forEach((s,i)=>{if(s.op==='call'){this.pipelines.get(s.model).forEach((stage,j)=>{pass.setPipeline(stage.pipeline);pass.setBindGroup(0,groups.get(s.model)[j],[i*uniformStride]);pass.dispatchWorkgroups(Math.ceil(n/64));gpuDispatches++;});}else if(capN){pass.setPipeline(this.capturePipelines.get(s.id));pass.setBindGroup(0,copyGroups.get(s.id),[i*uniformStride]);pass.dispatchWorkgroups(Math.ceil(capN/64));gpuDispatches++;}});
    pass.setPipeline(this.finalPipeline);pass.setBindGroup(0,finalGroup,[schedule.steps.length*uniformStride]);pass.dispatchWorkgroups(Math.ceil(n/64));gpuDispatches++;pass.end();encoder.copyBufferToBuffer(ob,0,rb,0,outWords*4);d.queue.submit([encoder.finish()]);await rb.mapAsync(GPUMapMode.READ);
    const dv=new DataView(rb.getMappedRange()),out={};
    const read=(layouts,count,stride,start=0)=>{const result={};let offset=0;for(const v of layouts){const data=new(typeArray(v.dtype))(count*v.width);for(let i=0;i<count;i++)for(let j=0;j<v.width;j++){const address=(start+i*stride+offset+j)*4;data[i*v.width+j]=v.dtype==='float32'?dv.getFloat32(address,true):v.dtype==='int32'?dv.getInt32(address,true):dv.getUint32(address,true)?1:0;}result[v.name]={type:v.dtype,dims:[count,v.width],data};offset+=v.width;}return result;};
    Object.assign(out,read(c.outputLayouts,n,c.storageOutputWords));const faults=[],calls=schedule.steps.filter(s=>s.op==='call');for(let lane=0;lane<n;lane++){const at=(lane*c.storageOutputWords+c.outputWords)*4,code=dv.getUint32(at,true),call=dv.getUint32(at+4,true);if(code){const step=calls[call-1],model=c.models.get(step?.model);faults.push({lane,code,call,step:step?.id,path:step?.path,model:step?.model,field:model?.guardLabels[code-1]});}}
    const captures=schedule.steps.filter(s=>s.op==='capture'&&capN).map(s=>({id:s.id,path:s.path,laneOffset:0,tensors:read(s.captureLayouts,capN,s.captureWidth,n*c.storageOutputWords+capN*s.captureOffset)})),memoHits={};let skippedLaneStages=0,memoIndex=0;for(const name of c.memoLayouts.keys()){let hits=0;for(let lane=0;lane<n;lane++)hits+=dv.getUint32((lane*c.storageOutputWords+c.outputWords+2+memoIndex)*4,true);memoHits[name]=hits;skippedLaneStages+=hits*(c.models.get(name).stages.length-1);memoIndex++;}rb.unmap();
    Object.defineProperty(out,'dq9Resident',{value:{parameters:schedule.parameters,captures,faults,gpuDispatches,inputBatches:1,readbacks:1,memoHits,skippedLaneStages,intermediateCpuReadbacks:0,allInputLanesExecuted:true,scheduledModelCalls:schedule.callCount,seedFiltering:false,stateWords:c.stateWords,permanentWords:c.permanentWords,scratchWords:c.scratchWords,memoWords:[...c.memoLayouts.values()].reduce((n,m)=>n+m.words,0),floatInputDomain:'Finite normal binary32 and signed zero; subnormal inputs are rejected before bitcast.'},enumerable:false});if(throwOnFault&&faults.length)throw Error('Resident GPU input domain violation '+JSON.stringify(faults[0]));return out;
  }
  async release(){for(const b of this.buffers)b.destroy();for(const b of this.weights)b.destroy();this.bindingBuffer.destroy();this.buffers=[];if(this.ownsDevice)this.device.destroy();}
}
