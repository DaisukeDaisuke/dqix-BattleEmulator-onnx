import {validateModelInput} from './input-validation.mjs';
import {NativeGraphWasmSession} from '../poc-v2/native-graph-wasm-prototype.mjs';

const constructors={float32:Float32Array,float64:Float64Array,int32:Int32Array,uint32:Uint32Array,bool:Uint8Array,int64:BigInt64Array,uint64:BigUint64Array};
const decode=value=>typeof value==='string'?Uint8Array.from(atob(value),char=>char.charCodeAt(0)):value;
const ortRuntimes=new Map();

async function loadOrt(version,onProgress,provider='wasm'){
  if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('ONNX Runtimeの固定バージョンがありません。');
  const key=version+'/'+provider;
  if(!ortRuntimes.has(key))ortRuntimes.set(key,(async()=>{
    const base=`https://cdn.jsdelivr.net/npm/onnxruntime-web@${version}/dist/`;
    let adapter=null,adapterInfo=null;
    if(provider==='webgpu'){
      if(!globalThis.navigator?.gpu)throw Error('このブラウザーではWebGPUを使用できません。WASMを選択してください。');
      adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
      if(!adapter)throw Error('WebGPUアダプターを取得できません。WASMを選択してください。');
      const info=adapter.info??{};
      adapterInfo={vendor:info.vendor??'',architecture:info.architecture??'',device:info.device??'',description:info.description??'',isFallbackAdapter:info.isFallbackAdapter??null};
    }
    onProgress?.({kind:'runtime',name:`ONNX Runtime Web ${version} / ${provider==='webgpu'?'WebGPU':'WASM'}`});
    const ort=await import(base+(provider==='webgpu'?'ort.webgpu.min.mjs':'ort.wasm.min.mjs'));
    ort.env.wasm.numThreads=1;
    ort.env.wasm.proxy=false;
    ort.env.wasm.wasmPaths=base;
    if(adapter)ort.env.webgpu.adapter=adapter;
    return{ort,adapterInfo};
  })().catch(error=>{ortRuntimes.delete(key);throw error;}));
  return ortRuntimes.get(key);
}

function feedsFor(model,rows){
  return Object.fromEntries(model.ir.inputs.map(input=>{
    const width=input.shape.slice(1).reduce((a,b)=>a*b,1),Type=constructors[input.dtype];
    if(!Type||!Number.isInteger(width)||width<1)throw Error(`未対応のテンソル形状: ${model.name}.${input.name}`);
    const data=new Type(rows.length*width);
    rows.forEach((row,lane)=>data.set(row[input.name],lane*width));
    return[input.name,{type:input.dtype,data,dims:[rows.length,...input.shape.slice(1)]}];
  }));
}

function outputRows(output,count){
  return Array.from({length:count},(_,lane)=>Object.fromEntries(Object.entries(output).map(([name,tensor])=>{
    if(!tensor?.data||tensor.data.length%count)throw Error('出力テンソルの入力数が一致しません: '+name);
    const width=tensor.data.length/count;
    return[name,Array.from(tensor.data.subarray(lane*width,(lane+1)*width))];
  })));
}

// The common battle runner owns control flow. This adapter only executes the
// named, shared ONNX modules; it has no monster ID or action dispatch logic.
export function createGraphExecutor({models,backend='onnxruntime-wasm',ortVersion='1.31.1',ortRuntime,onProgress,shouldStop}){
  if(!['onnxruntime-wasm','onnxruntime-webgpu','native-wasm'].includes(backend))throw Error('未知の実行方式: '+backend);
  const byName=models instanceof Map?models:new Map(models.map(model=>[model.name,model]));
  const sessions=new Map(),counts={ortCalls:0,wasmCalls:0,webgpuCalls:0,nativeCalls:0,rows:0},explicitOrtModels=new Set(),explicitCpuModels=new Set(),executedModelProviders=new Map();
  let released=false,runTail=Promise.resolve(),gpuAdapterInfo=null;
  const getModel=name=>{const model=byName.get(name);if(!model)throw Error('共通モジュールがありません: '+name);return model;};
  async function getSession(name){
    if(released)throw Error('解放済みの実行器です。');
    if(!sessions.has(name))sessions.set(name,(async()=>{
      const model=getModel(name);
      // The optional scalar compiler does not implement these operations.
      // This explicit declaration is shown in the run record and comparison.
      const needsOrt=model.executionProvider==='wasm-explicit-cpu'||model.ir.nodes.some(node=>node.op==='GatherElements');
      const useOrt=backend!=='native-wasm'||needsOrt;
      const useGpu=backend==='onnxruntime-webgpu'&&model.executionProvider!=='wasm-explicit-cpu';
      if(useGpu&&Object.values(model.ir.values).some(value=>value.dtype==='float64'))throw Error('倍精度モジュールの明示CPU宣言がありません: '+name);
      if(backend==='native-wasm'&&needsOrt)explicitOrtModels.add(name);
      onProgress?.({kind:'model',name,provider:useGpu?'onnxruntime-webgpu':useOrt?'onnxruntime-wasm':'native-wasm'});
      if(useOrt){
        // The WebGPU distribution's embedded CPU kernels omit DOUBLE. Load
        // the standalone WASM distribution for explicitly declared CPU models.
        const loaded=ortRuntime&&!useGpu?{ort:ortRuntime,adapterInfo:null}:await loadOrt(ortVersion,onProgress,useGpu?'webgpu':'wasm');
        if(loaded.adapterInfo)gpuAdapterInfo=loaded.adapterInfo;
        const ort=loaded.ort,session=await ort.InferenceSession.create(decode(model.onnx),{executionProviders:[useGpu?'webgpu':'wasm'],graphOptimizationLevel:'disabled',...(useGpu?{extra:{session:{disable_cpu_ep_fallback:'1'}}}:{})});
        return{session,ort,provider:useGpu?'onnxruntime-webgpu':'onnxruntime-wasm'};
      }
      return{session:await NativeGraphWasmSession.create(model),provider:'native-wasm'};
    })());
    return sessions.get(name);
  }
  async function executeGraph(name,rows){
    // A common-battle caller supplies cancellation to its controller instead:
    // finish an already submitted transition so partial state remains valid.
    // Standalone graph/camera callers may still stop at this adapter boundary.
    if(shouldStop?.())throw Error('停止しました。');
    if(!Array.isArray(rows))throw Error('グラフ入力は配列で指定してください。');
    if(!rows.length)return[];
    const model=getModel(name);
    rows.forEach((row,lane)=>{
      const failures=validateModelInput(model.ir,row);
      if(failures.length)throw Error(`${name} 入力${lane}: ${failures.join('; ')}`);
    });
    const entry=await getSession(name),feeds=feedsFor(model,rows);
    let output,inputs;
    try{
      if(entry.ort){
        inputs=Object.fromEntries(Object.entries(feeds).map(([key,tensor])=>[key,new entry.ort.Tensor(tensor.type,tensor.data,tensor.dims)]));
        output=await entry.session.run(inputs);counts.ortCalls++;counts[entry.provider==='onnxruntime-webgpu'?'webgpuCalls':'wasmCalls']++;
      }else{output=await entry.session.run(feeds);counts.nativeCalls++;}
      executedModelProviders.set(name,entry.provider);
      if(backend==='onnxruntime-webgpu'&&entry.provider==='onnxruntime-wasm')explicitCpuModels.add(name);
      counts.rows+=rows.length;
      return outputRows(output,rows.length);
    }finally{
      for(const tensor of Object.values(output??{}))tensor.dispose?.();
      for(const tensor of Object.values(inputs??{}))tensor.dispose?.();
    }
  }
  function runGraph(name,rows){
    // Independent battle lanes may reach this adapter concurrently. The WASM
    // backend shares one Emscripten runtime; overlap of two session.run calls
    // can leave both promises pending. Keep N-lane graph batches intact while
    // serializing their backend invocations through output-copy/disposal.
    const pending=runTail.then(()=>executeGraph(name,rows));
    runTail=pending.then(()=>{},()=>{});return pending;
  }
  return{runGraph,getSession,getModel,counts,explicitOrtModels,explicitCpuModels,executedModelProviders,get gpuAdapterInfo(){return gpuAdapterInfo;},async release(){
    await runTail;
    released=true;
    for(const pending of sessions.values())try{const {session}=await pending;await session.release?.();}catch{}
    sessions.clear();
  }};
}
