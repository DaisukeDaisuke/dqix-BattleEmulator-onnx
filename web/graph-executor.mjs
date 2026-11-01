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
  const sessionCounts={created:0,failed:0,released:0};
  let closing=false,released=false,releasePromise=null,runTail=Promise.resolve(),gpuAdapterInfo=null;
  const getModel=name=>{const model=byName.get(name);if(!model)throw Error('共通モジュールがありません: '+name);return model;};
  async function sessionFor(name){
    if(released)throw Error('解放済みの実行器です。');
    if(!sessions.has(name)){
      const pending=(async()=>{
      const model=getModel(name);
      // The optional scalar compiler does not implement these operations.
      // This explicit declaration is shown in the run record and comparison.
      const needsOrt=model.executionProvider==='wasm-explicit-cpu'||model.ir.nodes.some(node=>node.op==='GatherElements');
      const useOrt=backend!=='native-wasm'||needsOrt;
      const useGpu=backend==='onnxruntime-webgpu'&&model.executionProvider!=='wasm-explicit-cpu';
      if(useGpu&&Object.values(model.ir.values).some(value=>value.dtype==='float64'))throw Error('倍精度モジュールの明示CPU宣言がありません: '+name);
      onProgress?.({kind:'model',name,provider:useGpu?'onnxruntime-webgpu':useOrt?'onnxruntime-wasm':'native-wasm'});
      if(useOrt){
        // The WebGPU distribution's embedded CPU kernels omit DOUBLE. Load
        // the standalone WASM distribution for explicitly declared CPU models.
        const loaded=ortRuntime&&!useGpu?{ort:ortRuntime,adapterInfo:null}:await loadOrt(ortVersion,onProgress,useGpu?'webgpu':'wasm');
        if(loaded.adapterInfo)gpuAdapterInfo=loaded.adapterInfo;
        const ort=loaded.ort,session=await ort.InferenceSession.create(decode(model.onnx),{executionProviders:[useGpu?'webgpu':'wasm'],graphOptimizationLevel:'disabled',...(useGpu?{extra:{session:{disable_cpu_ep_fallback:'1'}}}:{})});
        sessionCounts.created++;
        return{session,ort,provider:useGpu?'onnxruntime-webgpu':'onnxruntime-wasm'};
      }
      const session=await NativeGraphWasmSession.create(model);sessionCounts.created++;
      return{session,provider:'native-wasm'};
      })().catch(error=>{
        sessionCounts.failed++;
        // A rejected initialization is never a reusable session.
        if(sessions.get(name)===pending)sessions.delete(name);
        throw error;
      });
      sessions.set(name,pending);
    }
    return sessions.get(name);
  }
  function getSession(name){
    if(closing||released)return Promise.reject(Error('解放済みの実行器です。'));
    return sessionFor(name);
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
    // Work queued before release began still completes atomically. Public
    // submissions after that boundary are rejected by runGraph/getSession.
    const entry=await sessionFor(name),feeds=feedsFor(model,rows);
    let output,inputs;
    try{
      if(entry.ort){
        inputs=Object.fromEntries(Object.entries(feeds).map(([key,tensor])=>[key,new entry.ort.Tensor(tensor.type,tensor.data,tensor.dims)]));
        output=await entry.session.run(inputs);counts.ortCalls++;counts[entry.provider==='onnxruntime-webgpu'?'webgpuCalls':'wasmCalls']++;
      }else{output=await entry.session.run(feeds);counts.nativeCalls++;}
      executedModelProviders.set(name,entry.provider);
      if(backend==='native-wasm'&&entry.provider==='onnxruntime-wasm')explicitOrtModels.add(name);
      if(backend==='onnxruntime-webgpu'&&entry.provider==='onnxruntime-wasm')explicitCpuModels.add(name);
      counts.rows+=rows.length;
      return outputRows(output,rows.length);
    }finally{
      for(const tensor of Object.values(output??{}))tensor.dispose?.();
      for(const tensor of Object.values(inputs??{}))tensor.dispose?.();
    }
  }
  function runGraph(name,rows){
    if(closing||released)return Promise.reject(Error('解放済みの実行器です。'));
    // Independent battle lanes may reach this adapter concurrently. The WASM
    // backend shares one Emscripten runtime; overlap of two session.run calls
    // can leave both promises pending. Keep N-lane graph batches intact while
    // serializing their backend invocations through output-copy/disposal.
    const pending=runTail.then(()=>executeGraph(name,rows));
    runTail=pending.then(()=>{},()=>{});return pending;
  }
  return{runGraph,getSession,getModel,counts,explicitOrtModels,explicitCpuModels,executedModelProviders,
    get gpuAdapterInfo(){return gpuAdapterInfo;},
    get sessionStats(){return{...sessionCounts,loaded:sessions.size};},
    async resetMetrics(){
      if(closing||released)throw Error('解放済みの実行器です。');
      await runTail;
      if(closing||released)throw Error('解放済みの実行器です。');
      for(const name of Object.keys(counts))counts[name]=0;
      explicitOrtModels.clear();explicitCpuModels.clear();executedModelProviders.clear();
    },
    release(){
      if(!releasePromise){
        closing=true;
        releasePromise=(async()=>{
          await runTail;released=true;
          for(const pending of sessions.values())try{const {session}=await pending;await session.release?.();sessionCounts.released++;}catch{}
          sessions.clear();
        })();
      }
      return releasePromise;
    }
  };
}

// Release assets have already bound every ONNX byte string to its SHA-256.
// These immutable model identities, the shared program and the provider define
// session compatibility. Actor rows, definitions, RNG and resource state are
// deliberately absent: those remain fresh inputs to each operation.
async function executorIdentity({models,programHash,backend,ortVersion}){
  if(!/^[a-f0-9]{64}$/i.test(programHash??''))throw Error('実行器の共通プログラムSHA-256がありません。');
  const list=models instanceof Map?[...models.values()]:models;
  if(!Array.isArray(list)||!list.length)throw Error('実行器のモデル定義がありません。');
  const manifest=list.map(model=>{
    if(!model.name||model.ir?.name!==model.name||!/^[a-f0-9]{64}$/i.test(model.sha256??''))throw Error('実行器のモデルSHA-256がありません: '+model.name);
    return{name:model.name,sha256:model.sha256,executionProvider:model.executionProvider??null};
  }).sort((a,b)=>a.name.localeCompare(b.name));
  if(new Set(manifest.map(model=>model.name)).size!==manifest.length)throw Error('実行器のモデル名が重複しています。');
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({programHash,models:manifest,backend,ortVersion})));
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}

// One operation owns the executor at a time. Only immutable sessions survive
// the lease; cancellation/progress callbacks and graph counts are replaced or
// cleared before the next operation. No battle or presentation row is retained.
export function createGraphExecutorCache(){
  let current=null,operationTail=Promise.resolve(),callbacks=null;
  const lifetime={createdExecutors:0,releasedExecutors:0,releasedSessions:0};
  const snapshot=()=>({...lifetime,active:current?{identity:current.identity,executorId:current.executorId,backend:current.backend,sessionStats:current.executor.sessionStats}:null});
  async function releaseCurrent(){
    if(!current)return 0;
    const old=current;current=null;await old.executor.release();
    const released=old.executor.sessionStats.released;
    lifetime.releasedExecutors++;lifetime.releasedSessions+=released;return released;
  }
  function enqueue(operation){
    const pending=operationTail.then(operation);operationTail=pending.then(()=>{},()=>{});return pending;
  }
  return{
    snapshot,
    withExecutor(options,operation){
      return enqueue(async()=>{
        const backend=options.backend??'onnxruntime-wasm',ortVersion=options.ortVersion??'1.31.1';
        const identity=await executorIdentity({...options,backend,ortVersion});
        // A supplied ORT implementation is also an identity boundary, even if
        // the caller gives two implementations the same display version.
        const reused=current?.identity===identity&&current.ortRuntime===options.ortRuntime;
        const releasedPreviousSessions=reused?0:await releaseCurrent();
        callbacks={onProgress:options.onProgress,shouldStop:options.shouldStop};
        if(!reused){
          const executor=createGraphExecutor({...options,backend,ortVersion,onProgress:entry=>callbacks?.onProgress?.(entry),shouldStop:()=>callbacks?.shouldStop?.()});
          current={identity,backend,ortRuntime:options.ortRuntime,executor,executorId:++lifetime.createdExecutors};
        }
        const entry=current;
        try{
          await entry.executor.resetMetrics();
          return await operation(entry.executor,{identity,executorId:entry.executorId,reused:!!reused,releasedPreviousSessions,sessionStatsBefore:entry.executor.sessionStats});
        }catch(error){
          // Invalid input cannot silently leave a failed backend/session in
          // the next operation. Completed controller stops return normally.
          await releaseCurrent();throw error;
        }finally{callbacks=null;}
      });
    },
    release(){return enqueue(async()=>{await releaseCurrent();return snapshot();});}
  };
}
