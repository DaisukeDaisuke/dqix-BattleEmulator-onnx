// Experimental scalar WebAssembly executor for the existing declarative ONNX
// program. Each graph reads/writes named slots in one linear-memory arena.
// This is tensor/schedule plumbing, not an imperative battle implementation.
import {readNativeOnnx} from './native-onnx-boundary.mjs';
import {compileNativeResidentGraphWasm} from './native-resident-compiler-prototype.mjs';

const typeId={float32:1,int32:6,bool:9};
const typeArray=t=>t==='float32'?Float32Array:t==='int32'?Int32Array:Uint8Array;
const widthOf=v=>v.shape.slice(1).reduce((a,b)=>a*b,1);
const aligned=x=>Math.ceil(x/64)*64;
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
const pathGet=(row,path)=>row[path.join('.')]??path.reduce((value,key)=>value?.[key],row);

export function compileNativeResidentProgram(program,models){
  if(program?.schema!=='dq9-resident-onnx-program-v1')throw Error('Unsupported native resident program');
  const slots=new Map();let permanentWords=0;
  for(const slot of program.slots){
    if(slots.has(slot.name)||!typeId[slot.dtype]||!Number.isInteger(slot.width)||slot.width<1||!['input','constant','zero'].includes(slot.initial?.kind))throw Error('Invalid native program slot '+slot.name);
    slots.set(slot.name,{...slot,offset:permanentWords});permanentWords+=slot.width;
  }
  const faultOffset=permanentWords,stateWords=permanentWords+2,compiledModels=new Map();let constantEnd=0;
  for(const module of program.modules){
    const model=models.get(module.name);if(!model||compiledModels.has(module.name))throw Error('Missing or duplicate native module '+module.name);
    const compiled=compileNativeResidentGraphWasm(model.graph,{constantBase:constantEnd,stateWords,faultOffset,contract:model.ir.contract??{}});
    constantEnd=aligned(compiled.constantEnd);compiledModels.set(module.name,{...model,...compiled});
  }
  const slotFor=(name,definition)=>{const slot=slots.get(name);if(!slot)throw Error('Unknown native program slot '+name);if(definition&&(typeId[slot.dtype]!==definition.dtype||slot.width!==widthOf(definition)))throw Error('Native binding type/shape mismatch '+name);return slot;};
  const bindingWords=[],bindingKeys=new Map(),captureLayouts=new Map(),steps=structuredClone(program.steps);
  function inspect(list){for(const step of list){
    if(step.op==='repeat'){inspect(step.body);continue;}
    if(step.op==='capture'){for(const slotName of Object.values(step.tensors))slotFor(slotName);const layout=JSON.stringify(step.tensors);if(captureLayouts.has(step.id)&&captureLayouts.get(step.id)!==layout)throw Error('Native capture layout changed '+step.id);captureLayouts.set(step.id,layout);continue;}
    if(step.op!=='call')throw Error('Unsupported native schedule operation '+step.op);
    const model=compiledModels.get(step.model);if(!model)throw Error('Missing native call model '+step.model);
    for(const [defs,map]of [[model.graph.inputs,step.inputs],[model.graph.outputs,step.outputs]])if(!map||Object.keys(map).length!==defs.length||defs.some(v=>!Object.hasOwn(map,v.name)))throw Error('Incomplete native model binding '+step.id);
    if(new Set(Object.values(step.outputs)).size!==Object.keys(step.outputs).length)throw Error('Multiple native outputs alias one destination '+step.id);
    const offsets=[...model.graph.inputs.map(v=>slotFor(step.inputs[v.name],v).offset),...model.graph.outputs.map(v=>slotFor(step.outputs[v.name],v).offset)],key=JSON.stringify([step.model,offsets]);
    if(!bindingKeys.has(key)){bindingKeys.set(key,bindingWords.length);bindingWords.push(...offsets);}step.bindingWordOffset=bindingKeys.get(key);
  }}
  inspect(steps);
  const inputSlots=new Map();for(const [name,slotName]of Object.entries(program.inputs)){const slot=slotFor(slotName);if(slot.initial.kind!=='input'||inputSlots.has(slotName))throw Error('Native public input binding is ambiguous '+name);inputSlots.set(slotName,name);}
  for(const slot of slots.values())if(slot.initial.kind==='input'&&!inputSlots.has(slot.name))throw Error('Native input slot is not exposed '+slot.name);
  const outputLayouts=Object.entries(program.outputs).map(([name,slotName])=>({...slotFor(slotName),name,slotName}));
  const bindings=new Uint32Array(bindingWords),bindingBase=constantEnd,stateBase=aligned(bindingBase+bindings.byteLength);
  return{program,steps,slots,models:compiledModels,permanentWords,faultOffset,stateWords,bindings,bindingBase,stateBase,inputSlots,outputLayouts,constantEnd};
}

function scheduleFor(compiled,parameters,capture){
  const values={};for(const [name,rule]of Object.entries(compiled.program.parameters)){const x=parameters[name]??rule.default;if(!Number.isInteger(x)||x<rule.min||x>rule.max)throw Error('Invalid native parameter '+name);values[name]=x;}
  for(const name of Object.keys(parameters))if(!Object.hasOwn(values,name))throw Error('Unknown native parameter '+name);
  const steps=[];function expand(list,path){for(const step of list){if(step.op==='repeat'){const count=typeof step.count==='number'?step.count:values[step.count.parameter];if(!Number.isInteger(count)||count<0||count>4096)throw Error('Invalid native repeat');for(let index=0;index<count;index++)expand(step.body,[...path,{id:step.id,index}]);}else if(step.op==='call'||capture===true||capture==='all'||Array.isArray(capture)&&capture.includes(step.id)||capture===step.id)steps.push({...step,path});}}
  expand(compiled.steps,[]);let callCount=0;for(const step of steps)if(step.op==='call')step.callIndex=++callCount;return{steps,parameters:values,callCount};
}

export class NativeResidentProgramSession {
  static async create(program,{getModel,maxBatchSize=Infinity,onProgress}={}){
    if(!(maxBatchSize===Infinity||Number.isInteger(maxBatchSize)&&maxBatchSize>0))throw Error('Invalid native maximum batch');
    const models=new Map();for(const entry of program.modules){
      const data=await getModel(entry.name);if(!data?.onnx||!data.ir)throw Error('Native resident execution requires actual ONNX bytes and IR '+entry.name);
      const onnx=typeof data.onnx==='string'?Uint8Array.from(atob(data.onnx),c=>c.charCodeAt(0)):data.onnx;if(await hash(onnx)!==entry.sha256)throw Error('Native resident ONNX SHA differs '+entry.name);
      const graph=readNativeOnnx(onnx);if(data.ir.name!==entry.name)throw Error('Native IR identity differs '+entry.name);models.set(entry.name,{ir:data.ir,graph,onnxSHA256:entry.sha256});
    }
    const compiled=compileNativeResidentProgram(program,models),memory=new WebAssembly.Memory({initial:Math.max(1,Math.ceil(compiled.stateBase/65536)),maximum:16384}),instances=new Map();
    for(const[name,model]of compiled.models){onProgress?.({name,nodes:model.nodes,wasmBytes:model.binary.length});const module=await WebAssembly.compile(model.binary),instance=await WebAssembly.instantiate(module,{env:{memory}});instances.set(name,instance);}
    new Uint32Array(memory.buffer,compiled.bindingBase,compiled.bindings.length).set(compiled.bindings);
    return new NativeResidentProgramSession({compiled,memory,instances,maxBatchSize});
  }
  constructor(values){Object.assign(this,values);this.running=false;}
  checkValues(slot,values){if(values.length!==slot.width)throw Error('Invalid native initial width '+slot.name);for(const value of values)if(!Number.isFinite(Number(value))||slot.dtype==='int32'&&(!Number.isInteger(value)||value< -2147483648||value>2147483647)||slot.dtype==='bool'&&![0,1,false,true].includes(value))throw Error('Invalid native initial value '+slot.name);}
  rowsToFeeds(rows){
    if(!Array.isArray(rows)||!rows.length)throw Error('Native rows must be a nonempty batch');const feeds={};
    for(const[name,slotName]of Object.entries(this.compiled.program.inputs)){const slot=this.compiled.slots.get(slotName),data=new(typeArray(slot.dtype))(rows.length*slot.width);rows.forEach((row,lane)=>{let value=pathGet(row,slot.initial.path)??slot.initial.default;if(!Array.isArray(value)&&!ArrayBuffer.isView(value))value=[value];this.checkValues(slot,value);data.set(value,lane*slot.width);});feeds[name]={type:slot.dtype,dims:[rows.length,slot.width],data};}return feeds;
  }
  async runRows(rows,options={}){return this.run(this.rowsToFeeds(rows),options);}
  async run(feeds,{parameters={},capture=false,captureLanes,throwOnFault=true,onCall}={}){
    if(this.running)throw Error('Concurrent native resident session use is unsupported');if(!this.memory)throw Error('Native session released');this.running=true;
    try{return await this.runImpl(feeds,{parameters,capture,captureLanes,throwOnFault,onCall});}finally{this.running=false;}
  }
  async runImpl(feeds,{parameters,capture,captureLanes,throwOnFault,onCall}){
    const c=this.compiled,n=Object.values(feeds)[0]?.dims?.[0];if(!Number.isInteger(n)||n<1||n>1048576)throw Error('Invalid native resident batch');
    for(const tensor of Object.values(feeds))if(tensor?.data?.buffer===this.memory.buffer)throw Error('Native resident input aliases execution memory');
    for(const[name,tensor]of Object.entries(feeds)){const slot=c.slots.get(c.program.inputs[name]);if(!slot||tensor.type!==slot.dtype||tensor.dims.length!==2||tensor.dims[0]!==n||tensor.dims[1]!==slot.width||tensor.data.length!==n*slot.width||!(tensor.data instanceof typeArray(slot.dtype)))throw Error('Invalid native resident feed '+name);if(slot.dtype==='float32'&&tensor.data.some(x=>!Number.isFinite(x))||slot.dtype==='bool'&&tensor.data.some(x=>x!==0&&x!==1))throw Error('Invalid native resident feed value '+name);}
    const schedule=scheduleFor(c,parameters,capture),capN=capture?Math.min(n,captureLanes??n):0;if(!Number.isInteger(capN)||capN<0)throw Error('Invalid native capture count');
    const maximum=Math.min(this.maxBatchSize,Math.floor((1073741824-c.stateBase)/(c.stateWords*4)));if(maximum<1)throw Error('Native resident state exceeds memory budget');
    if(n>maximum){
      const combined={},captures=[],faults=[];let inputBatches=0;
      for(let start=0;start<n;start+=maximum){const count=Math.min(maximum,n-start),part=Object.fromEntries(Object.entries(feeds).map(([name,t])=>[name,{...t,dims:[count,t.dims[1]],data:t.data.subarray(start*t.dims[1],(start+count)*t.dims[1])}]));
        const got=await this.runImpl(part,{parameters,capture:capture&&start<capN?capture:false,captureLanes:Math.max(0,Math.min(count,capN-start)),throwOnFault:false,onCall:onCall?event=>onCall({...event,laneOffset:start}):undefined});
        for(const[name,t]of Object.entries(got)){combined[name]??={type:t.type,dims:[n,t.dims[1]],data:new t.data.constructor(n*t.dims[1])};combined[name].data.set(t.data,start*t.dims[1]);}
        inputBatches+=got.dq9Resident.inputBatches;captures.push(...got.dq9Resident.captures.map(x=>({...x,laneOffset:x.laneOffset+start})));faults.push(...got.dq9Resident.faults.map(x=>({...x,lane:x.lane+start})));
      }
      Object.defineProperty(combined,'dq9Resident',{value:this.metadata(schedule,{captures,faults,inputBatches}),enumerable:false});if(throwOnFault&&faults.length)throw Error('Native resident input domain violation '+JSON.stringify(faults[0]));return combined;
    }
    const total=c.stateBase+n*c.stateWords*4,pages=Math.ceil(total/65536);if(this.memory.buffer.byteLength<pages*65536)this.memory.grow(pages-this.memory.buffer.byteLength/65536);
    const arena=new Uint32Array(this.memory.buffer,c.stateBase,n*c.stateWords);arena.fill(0);
    const scalar=new ArrayBuffer(4),scalarFloat=new Float32Array(scalar),scalarInt=new Int32Array(scalar),scalarRaw=new Uint32Array(scalar);
    for(const slot of c.slots.values()){
      const name=c.inputSlots.get(slot.name),feed=name?feeds[name]:null;let defaults=slot.initial.kind==='constant'?slot.initial.values:slot.initial.kind==='input'?slot.initial.default:Array(slot.width).fill(0);if(!Array.isArray(defaults))defaults=[defaults];this.checkValues(slot,defaults);
      const defaultWords=defaults.map(value=>{if(slot.dtype==='bool')return Number(!!value);if(slot.dtype==='float32')scalarFloat[0]=value;else scalarInt[0]=value;return scalarRaw[0];});
      const raw=feed?(slot.dtype==='bool'?feed.data:new Uint32Array(feed.data.buffer,feed.data.byteOffset,feed.data.length)):null;
      for(let lane=0;lane<n;lane++)for(let j=0;j<slot.width;j++)arena[lane*c.stateWords+slot.offset+j]=raw?raw[lane*slot.width+j]:defaultWords[j];
    }
    const read=(layouts,count)=>Object.fromEntries(layouts.map(layout=>{const data=new(typeArray(layout.dtype))(count*layout.width),raw=layout.dtype==='bool'?data:new Uint32Array(data.buffer);for(let lane=0;lane<count;lane++)for(let j=0;j<layout.width;j++)raw[lane*layout.width+j]=arena[lane*c.stateWords+layout.offset+j];return[layout.name,{type:layout.dtype,dims:[count,layout.width],data}];}));
    const captures=[];
    for(const step of schedule.steps){
      if(step.op==='capture'){if(capN)captures.push({id:step.id,path:step.path,laneOffset:0,tensors:read(Object.entries(step.tensors).map(([name,slotName])=>({...c.slots.get(slotName),name})),capN)});continue;}
      this.instances.get(step.model).exports.run(c.stateBase,c.bindingBase+step.bindingWordOffset*4,n,step.callIndex);
      if(onCall)await onCall({id:step.id,model:step.model,path:step.path,callIndex:step.callIndex,laneOffset:0,outputs:read(Object.entries(step.outputs).map(([name,slotName])=>({...c.slots.get(slotName),name})),n)});
    }
    const calls=schedule.steps.filter(s=>s.op==='call'),faults=[];for(let lane=0;lane<n;lane++){const code=arena[lane*c.stateWords+c.faultOffset],call=arena[lane*c.stateWords+c.faultOffset+1];if(code){const step=calls[call-1],model=c.models.get(step?.model);faults.push({lane,code,call,step:step?.id,path:step?.path,model:step?.model,field:model?.guardLabels[code-1]});}}
    const out=read(c.outputLayouts,n);Object.defineProperty(out,'dq9Resident',{value:this.metadata(schedule,{captures,faults,inputBatches:1}),enumerable:false});if(throwOnFault&&faults.length)throw Error('Native resident input domain violation '+JSON.stringify(faults[0]));return out;
  }
  metadata(schedule,extra){const c=this.compiled;return{backend:'native-wasm-prototype',parameters:schedule.parameters,scheduledModelCalls:schedule.callCount,allInputLanesExecuted:true,seedFiltering:false,stateResident:true,stateWords:c.stateWords,permanentWords:c.permanentWords,scratchWords:0,gpuDispatches:0,readbacks:0,intermediateCpuReadbacks:0,memoHits:{},publicBackend:false,...extra};}
  async release(){this.instances.clear();this.memory=null;}
}
