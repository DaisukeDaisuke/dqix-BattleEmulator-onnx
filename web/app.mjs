const $=id=>document.getElementById(id);
const compressed=Uint8Array.from(atob($('dq9-release-assets').textContent.trim()),x=>x.charCodeAt(0));
const assets=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
const models=new Map(assets.models.map(model=>[model.name,model]));
const modes=[...assets.programs.map(mode=>({...mode,kind:'battle'})),...assets.cameras.map(mode=>({...mode,kind:'camera'})),...assets.models.filter(model=>model.public).map(model=>({id:model.name,titleJa:model.titleJa,kind:'graph',model,presets:[{id:'default',labelJa:'グラフの初期入力',inputs:model.defaultInput}],scopeJa:model.ir.contract?.scopeJa??model.ir.contract?.scope??''}))];
const sources=new Map(),loadingSources=new Set(),urls=[],MASK64=(1n<<64n)-1n;
const format=(value,digits=1)=>Number(value).toLocaleString('ja-JP',{maximumFractionDigits:digits});
const decode=value=>Uint8Array.from(atob(value),x=>x.charCodeAt(0));
const seedHex=value=>Array.from(value).reduce((seed,byte,index)=>seed+(BigInt(byte)<<BigInt(index*8)),0n).toString(16).padStart(16,'0');
const seedBytes=seed=>Array.from({length:8},(_,index)=>Number(seed>>BigInt(index*8)&255n));
const scalar=value=>Array.isArray(value)||ArrayBuffer.isView(value)?value[0]:value;
const typeArray=type=>({float32:Float32Array,float64:Float64Array,int32:Int32Array,bool:Uint8Array})[type]??(()=>{throw Error('未対応の入力型: '+type);})();
let current,busy=false,stopRequested=false,lastResult=null,activeResources=[];

function status(text,kind=''){$('status').textContent=text;$('status').className='status '+kind;}
function log(text){if($('log').textContent==='初期化待ち')$('log').textContent='';$('log').textContent+=text+'\n';$('log').scrollTop=$('log').scrollHeight;}
function controls(running){
  busy=running;
  for(const id of ['mode','preset','backend','seed','batch','limit','warmup','input-json','reset','run','compare'])$(id).disabled=running;
  $('stop').disabled=!running;$('download').disabled=running||!lastResult;
  if(!running&&current)$('seed').disabled=!Object.hasOwn(current.presets[0].inputs,'seed');
  if(!running&&!navigator.gpu){$('compare').disabled=true;$('backend').querySelector('[value="resident-gpu"]').disabled=true;}
}
function checkStop(){if(stopRequested)throw Error('停止しました。');}
async function yieldUi(){await new Promise(resolve=>setTimeout(resolve,0));checkStop();}

async function moduleUrl(path){
  if(sources.has(path))return sources.get(path);
  if(loadingSources.has(path))throw Error('循環する実行コード依存: '+path);
  let source=assets.sources[path];if(typeof source!=='string')throw Error('実行コードがありません: '+path);
  loadingSources.add(path);
  for(const match of [...source.matchAll(/\bfrom\s*(['"])(\.[^'"]+)\1/g)]){
    const dependency=new URL(match[2],new URL(path,'https://dq9.invalid/')).pathname.slice(1);
    source=source.replace(match[0],'from '+JSON.stringify(await moduleUrl(dependency)));
  }
  const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));urls.push(url);sources.set(path,url);loadingSources.delete(path);return url;
}
const loadModule=async path=>import(await moduleUrl(path));
const cpuOrtModels=mode=>(mode.kind==='graph'?[mode.model.name]:mode.kind==='camera'?mode.models:[]).filter(name=>models.get(name)?.cpuExecutionProvider==='onnxruntime-wasm');
const track=resource=>(activeResources.push(resource),resource);
async function releaseResources(){
  const resources=activeResources;activeResources=[];
  for(const resource of resources.reverse())try{await resource.release?.();}catch(error){log('解放: '+String(error.message??error));}
}

function applyPreset(){
  const preset=current.presets.find(preset=>preset.id===$('preset').value)??current.presets[0];
  $('input-json').value=JSON.stringify(preset.inputs,null,2);
  if(Array.isArray(preset.inputs.seed)&&preset.inputs.seed.length===8)$('seed').value=seedHex(preset.inputs.seed);
  else $('seed').value='0000000000000001';
}
function selectMode(id){
  if(busy)throw Error('実行中は変更できません。');
  current=modes.find(mode=>mode.id===id);if(!current)throw Error('未知の実行モードです。');
  $('mode').value=id;$('preset').replaceChildren();
  for(const preset of current.presets){const option=document.createElement('option');option.value=preset.id;option.textContent=preset.labelJa??preset.id;$('preset').append(option);}
  const isCamera=current.kind==='camera',isGraph=current.kind==='graph';
  const hasSeed=Object.hasOwn(current.presets[0].inputs,'seed');
  $('batch-label').textContent=hasSeed?'連続seed数':'同じ初期値の入力数';$('seed').disabled=!hasSeed;
  $('limit-label').textContent=isCamera?'経路探索の上限':isGraph?'反復回数':'最大ターン数';
  $('limit').max=isCamera?'10861':isGraph?'256':String(current.program.parameters?.turns?.max??32);
  $('limit').value=isCamera?'10861':'1';$('batch').value='1';
  $('scope').textContent=current.scopeJa;
  $('backend-policy').textContent=(current.explicitCpuModels?.length?'このカメラモードは、倍精度1モデルをCPUで明示実行します。GPU選択時もこの1モデルを併用します。':'GPU選択時にCPUへ自動切替はしません。')+(cpuOrtModels(current).length?' CPU選択では、宣言した一部のモデルをCDNから読み込むONNX Runtime WASMで実行します。':'')+(hasSeed?'':' このグラフにはseed入力がなく、同じ初期値を指定数だけ実行します。');
  applyPreset();lastResult=null;window.DQ9Release.lastResult=null;$('download').disabled=true;
  for(const id of ['count','elapsed','rate','differences'])$(id).textContent='—';
  $('rows').replaceChildren();$('details').textContent='未実行';status('初期条件と実行方式を選択してください。');
}

function readRequest(){
  const input=JSON.parse($('input-json').value);
  if(!input||Array.isArray(input)||typeof input!=='object')throw Error('初期状態JSONは1件のobjectを指定してください。');
  const text=$('seed').value.trim().replace(/^0x/i,'');
  if(!/^[0-9a-f]{1,16}$/i.test(text))throw Error('開始seedは1〜16桁の16進数で入力してください。');
  const count=Number($('batch').value),limit=Number($('limit').value),maximum=Number($('limit').max);
  if(!Number.isInteger(count)||count<1||count>65536)throw Error('入力数は1〜65536です。');
  if(!Number.isInteger(limit)||limit<1||limit>maximum)throw Error('実行上限は1〜'+maximum+'です。');
  const start=BigInt('0x'+text),hasSeed=Object.hasOwn(input,'seed');
  const rows=Array.from({length:count},(_,lane)=>{
    const row=structuredClone(input);
    if(hasSeed)row.seed=seedBytes((start+BigInt(lane))&MASK64);
    if(current.kind==='battle'&&Object.hasOwn(row,'maxTurns'))row.maxTurns=[limit];
    return row;
  });
  return{mode:current,rows,limit,count,warmup:$('warmup').checked,seeds:rows.map((row,lane)=>hasSeed?seedHex(row.seed):String(lane+1))};
}

async function gpuDevice(){
  if(!navigator.gpu)throw Error('このブラウザーではWebGPUを利用できません。');
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
  if(!adapter)throw Error('WebGPU adapterが見つかりません。');
  const device=await adapter.requestDevice();track({release:()=>device.destroy()});
  const info=adapter.info??{};
  const software=/swiftshader|llvmpipe|lavapipe|software/i.test([info.vendor,info.architecture,info.description].join(' '));
  return{adapter,device,info:{vendor:info.vendor??'',architecture:info.architecture??'',description:info.description??'',isFallbackAdapter:Boolean(adapter.isFallbackAdapter||info.isFallbackAdapter||software)}};
}
function tensorRows(output,count){
  return Array.from({length:count},(_,lane)=>Object.fromEntries(Object.entries(output).map(([name,tensor])=>{
    if(!tensor?.data||tensor.data.length%count)throw Error('出力テンソルの幅が一致しません: '+name);
    const width=tensor.data.length/count;
    return[name,Array.from(tensor.data.subarray(lane*width,(lane+1)*width))];
  })));
}
function feedsFor(model,rows){
  return Object.fromEntries(model.ir.inputs.map(input=>{
    const width=input.shape.slice(1).reduce((a,b)=>a*b,1),data=new(typeArray(input.dtype))(rows.length*width);
    rows.forEach((row,lane)=>{
      const value=row[input.name];
      if(!(Array.isArray(value)||ArrayBuffer.isView(value))||value.length!==width)throw Error(model.name+'.'+input.name+' の入力幅が異なります。');
      for(const item of value){
        if(input.dtype==='bool'?![false,true,0,1].includes(item):typeof item!=='number'||!Number.isFinite(item)||input.dtype==='int32'&&(!Number.isInteger(item)||item< -2147483648||item>2147483647))throw Error(model.name+'.'+input.name+' に型の範囲外の値があります。');
      }
      data.set(value,lane*width);
    });
    return[input.name,{type:input.dtype,data,dims:[rows.length,...input.shape.slice(1)]}];
  }));
}

let ortPromise;
async function cpuOrtRuntime(){
  if(!ortPromise)ortPromise=(async()=>{
    const base='https://cdn.jsdelivr.net/npm/onnxruntime-web@'+assets.ortVersion+'/dist/';
    log('宣言済みCPUモデル用のONNX Runtime '+assets.ortVersion+'を読み込みます。');
    const ort=await import(base+'ort.wasm.min.mjs');ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.wasmPaths=base;return ort;
  })();
  return ortPromise;
}
async function makeGraphExecutor(backend,mode,gpu){
  const sessions=new Map(),explicitCpu=new Set(mode.explicitCpuModels??[]),counts={gpuCalls:0,nativeCpuCalls:0,ortCpuCalls:0,explicitDoubleCpuCalls:0};
  const {validateModelInput}=await loadModule('web/input-validation.mjs');
  async function getSession(model){
    if(sessions.has(model.name))return sessions.get(model.name);
    log('グラフを初期化: '+model.name);await yieldUi();let session;
    if(explicitCpu.has(model.name)||backend==='native-wasm'&&model.cpuExecutionProvider==='onnxruntime-wasm'){
      if(explicitCpu.has(model.name)&&model.executionProvider!=='wasm-explicit-cpu')throw Error('倍精度CPUモデルの宣言がありません。');
      const ort=await cpuOrtRuntime();session=track(await ort.InferenceSession.create(decode(model.onnx),{executionProviders:['wasm'],graphOptimizationLevel:'disabled'}));
      session.dq9OrtRuntime=ort;
    }else if(backend==='native-wasm'){
      const {NativeGraphWasmSession}=await loadModule('poc-v2/native-graph-wasm-prototype.mjs');
      session=track(await NativeGraphWasmSession.create(model));
    }else{
      const {FusedGraphSession,readOnnx}=await loadModule('poc-v2/graph-runtime.mjs');
      session=track(await FusedGraphSession.create(readOnnx(decode(model.onnx)),{adapter:gpu.adapter,device:gpu.device,strictFloat:true,feedback:{},fixedPointExit:false,exactOutputs:model.ir.nodes.filter(node=>node.exactArithmetic).flatMap(node=>node.outputs)}));
    }
    sessions.set(model.name,session);return session;
  }
  async function run(name,rows,{double=false}={}){
    const model=models.get(name);if(!model)throw Error('未知のグラフ: '+name);
    if(double&&!explicitCpu.has(name))throw Error('未宣言の倍精度CPU要求: '+name);
    rows.forEach((row,lane)=>{const failures=validateModelInput(model.ir,row);if(failures.length)throw Error(model.name+' 入力'+lane+': '+failures.join('; '));});
    const session=await getSession(model),feeds=feedsFor(model,rows);let output;
    if(session.dq9OrtRuntime){
      const ort=session.dq9OrtRuntime,ortFeeds=Object.fromEntries(Object.entries(feeds).map(([key,tensor])=>[key,new ort.Tensor(tensor.type,tensor.data,tensor.dims)]));
      output=await session.run(ortFeeds);counts.ortCpuCalls++;if(explicitCpu.has(name))counts.explicitDoubleCpuCalls++;
    }else{output=await session.run(feeds);if(backend==='native-wasm')counts.nativeCpuCalls++;else counts.gpuCalls++;}
    checkStop();return{output,rows:tensorRows(output,rows.length)};
  }
  return{getSession,run,counts};
}

async function executeBackend(request,backend){
  const {mode,rows,limit}=request;checkStop();
  const initialized=performance.now(),gpu=backend==='resident-gpu'?await gpuDevice():null;
  let run,counts,session;
  if(mode.kind==='battle'){
    const getModel=name=>models.get(name),options={getModel,maxBatchSize:256,onProgress:entry=>log('戦闘グラフを初期化: '+entry.name)};
    if(backend==='native-wasm'){
      const {NativeResidentProgramSession}=await loadModule('poc-v2/native-resident-runtime-prototype.mjs');
      session=track(await NativeResidentProgramSession.create(mode.program,options));
    }else{
      const path=mode.runtimeAdapter==='constant-gather-wide-literal'?'poc-v2/wide-literal-constant-gather-resident.mjs':mode.runtimeAdapter==='constant-gather'?'poc-v2/constant-gather-resident-runtime.mjs':'poc-v2/resident-runtime.mjs';
      const module=await loadModule(path),Session=module.ConstantGatherResidentSession??module.ResidentProgramSession;
      session=track(await Session.create(mode.program,{...options,adapter:gpu.adapter,device:gpu.device,memoizeModels:[]}));
    }
    run=async batch=>{const output=await session.runRows(batch,{parameters:{turns:limit},throwOnFault:false});return{output,rows:tensorRows(output,batch.length),metadata:output.dq9Resident};};
  }else{
    const executor=await makeGraphExecutor(backend,mode,gpu);counts=executor.counts;
    if(mode.kind==='graph'){
      await executor.getSession(mode.model);
      const feedback=mode.model.ir.contract?.feedback??{};
      if(limit>1&&!Object.keys(feedback).length)throw Error('このグラフには連続実行の状態対応がありません。反復回数1を指定してください。');
      run=async batch=>{
        let input=structuredClone(batch),result;
        for(let step=0;step<limit;step++){
          result=await executor.run(mode.model.name,input);
          if(step+1<limit)input=input.map((row,lane)=>({...row,...Object.fromEntries(Object.entries(feedback).map(([name,output])=>[name,result.rows[lane][output]]))}));
        }
        return{...result,metadata:{allInputLanesExecuted:true,seedFiltering:false,iterations:limit}};
      };
    }else{
      for(const name of mode.models)await executor.getSession(models.get(name));
      const factory=(await loadModule(mode.runner.path))[mode.runner.export];if(typeof factory!=='function')throw Error('カメラ実行関数がありません。');
      const runner=await factory({getModel:name=>models.get(name)?.ir,runGraph:async(name,batch)=>(await executor.run(name,batch)).rows,runDoubleGraph:async(name,batch)=>(await executor.run(name,batch,{double:true})).rows});
      run=async batch=>{
        const result=await runner.run({rows:structuredClone(batch),maxRouteAttempts:limit});
        const finalRows=result.states??result.rows;
        if(!Array.isArray(finalRows)||finalRows.length!==batch.length)throw Error('カメラ出力の入力数が一致しません。');
        return{rows:finalRows,cameraResult:result,metadata:{complete:result.complete,wholeCameraComplete:result.wholeCameraComplete,reason:result.reason,graphCalls:result.graphCalls,allInputLanesExecuted:true,seedFiltering:false}};
      };
    }
  }
  const initializationMilliseconds=performance.now()-initialized;checkStop();
  let warmupMilliseconds=0;
  if(request.warmup){status('初期化が完了しました。1入力でウォームアップしています。');await yieldUi();const start=performance.now();await run(rows.slice(0,1));warmupMilliseconds=performance.now()-start;checkStop();}
  status(format(request.count,0)+'入力を'+(backend==='native-wasm'?'CPU':'GPU')+'で実行しています。');await yieldUi();
  const countsBefore=counts?{...counts}:null,start=performance.now(),result=await run(rows),elapsedMilliseconds=performance.now()-start;checkStop();
  const measuredCounts=counts?Object.fromEntries(Object.keys(counts).map(key=>[key,counts[key]-countsBefore[key]])):undefined;
  return{...result,backend,initializationMilliseconds,warmupMilliseconds,elapsedMilliseconds,adapter:gpu?.info??null,explicitCpuModels:[...mode.explicitCpuModels??[]],cpuOrtModels:backend==='native-wasm'?cpuOrtModels(mode):[...mode.explicitCpuModels??[]],graphCalls:measuredCounts,seedFiltering:false};
}

function compareResults(cpu,gpu){
  let compared=0,differences=0;const examples=[];
  const fail=(path,want,got)=>{differences++;if(examples.length<16)examples.push({path,cpu:want,gpu:got});};
  function visit(want,got,path){
    if(Array.isArray(want)){
      if(!Array.isArray(got)||want.length!==got.length){fail(path+'.length',want.length,got?.length);return;}
      want.forEach((value,index)=>visit(value,got[index],path+'['+index+']'));return;
    }
    if(want!==null&&typeof want==='object'){
      if(got===null||typeof got!=='object'||Array.isArray(got)){fail(path,want,got);return;}
      const keys=Object.keys(want).sort(),other=Object.keys(got).sort();
      if(JSON.stringify(keys)!==JSON.stringify(other))fail(path+'.keys',keys,other);
      for(const key of keys)visit(want[key],got[key],path+'.'+key);return;
    }
    compared++;if(!Object.is(want,got))fail(path,want,got);
  }
  visit(cpu.rows,gpu.rows,'rows');
  const cpuFaults=cpu.metadata?.faults??[],gpuFaults=gpu.metadata?.faults??[];
  visit(cpuFaults.map(fault=>({lane:fault.lane,field:fault.field,model:fault.model})),gpuFaults.map(fault=>({lane:fault.lane,field:fault.field,model:fault.model})),'faults');
  return{compared,differences,examples,exactNumericEquality:true,independentRomVerification:false};
}
function cell(row,text,mono=false){const element=document.createElement('td');element.textContent=String(text??'—');if(mono)element.className='mono';row.append(element);}
function finalValue(row,name){return row[name]??row['next'+name[0].toUpperCase()+name.slice(1)];}
function render(request,result,comparison,other){
  const fields=assets.actorFields,width=fields.length,hp=fields.indexOf('hp'),mp=fields.indexOf('mp');
  $('count').textContent=format(request.count,0);$('elapsed').textContent=format(result.elapsedMilliseconds)+' ms';
  $('rate').textContent=format(request.count*1000/result.elapsedMilliseconds,0)+' 入力/s';$('differences').textContent=comparison?format(comparison.differences,0):'未照合';
  $('timings').textContent='初期化 '+format(result.initializationMilliseconds)+' ms ／ ウォームアップ '+format(result.warmupMilliseconds)+' ms'+(other?' ／ CPU実行 '+format(other.elapsedMilliseconds)+' ms':'');
  $('device').textContent=result.backend==='native-wasm'?'CPU / WebAssembly（1スレッド'+(result.cpuOrtModels.length?'、宣言済みORTモデル '+result.cpuOrtModels.length+'件':'')+'）':`GPU: ${result.adapter.description||result.adapter.architecture||result.adapter.vendor||'名称非公開'}${result.adapter.isFallbackAdapter?'（ソフトウェア実装）':''}${result.explicitCpuModels.length?' ＋ 明示CPU倍精度モデル'+result.explicitCpuModels.length+'件':''}`;
  $('rows').replaceChildren();
  result.rows.slice(0,32).forEach((row,lane)=>{
    const tr=document.createElement('tr'),actors=finalValue(row,'actors'),seed=finalValue(row,'seed'),state=finalValue(row,'nowstate')??finalValue(row,'nowState')??finalValue(row,'combo')??finalValue(row,'comboPrefix')??finalValue(row,'status');
    cell(tr,request.seeds[lane],true);cell(tr,seed?.length===8?seedHex(seed):'—',true);cell(tr,scalar(finalValue(row,'position')));
    cell(tr,actors&&width&&hp>=0?actors[hp]+' / '+actors[mp]:'—');cell(tr,actors&&width&&hp>=0?actors[width+hp]+' / '+actors[width+mp]:'—');
    cell(tr,state?JSON.stringify(state):'—');cell(tr,scalar(finalValue(row,'outcome'))??(result.metadata?.complete===false?'上限・未対応':'完了'));$('rows').append(tr);
  });
  const timing=x=>({backend:x.backend,initializationMilliseconds:x.initializationMilliseconds,warmupMilliseconds:x.warmupMilliseconds,elapsedMilliseconds:x.elapsedMilliseconds,adapter:x.adapter,cpuOrtModels:x.cpuOrtModels,graphCalls:x.graphCalls,metadata:x.metadata});
  lastResult={schema:'dq9-source-release-result-v1',mode:request.mode.id,inputs:request.count,limit:request.limit,seedFiltering:false,sourceHashes:assets.sourceHashes,execution:timing(result),cpuComparison:other?timing(other):undefined,comparison,initialSeeds:request.seeds,rows:result.rows};
  window.DQ9Release.lastResult=lastResult;
  $('details').textContent=JSON.stringify({...lastResult,rows:result.rows.slice(0,2),displayedOutputRows:Math.min(2,result.rows.length)},null,2);
  $('result-note').textContent='全'+format(request.count,0)+'入力を保持しています。表示は先頭32件、JSON保存は全件です。'+(comparison?' CPU/GPUの一致確認は今回の同一入力に対する比較です。':'');
}

async function execute(compare=false){
  if(busy)throw Error('実行中です。');stopRequested=false;controls(true);$('log').textContent='';
  try{
    const request=readRequest();checkStop();let result,cpu,comparison;
    if(compare){
      cpu=await executeBackend(request,'native-wasm');await releaseResources();await yieldUi();
      result=await executeBackend(request,'resident-gpu');comparison=compareResults(cpu,result);
    }else result=await executeBackend(request,$('backend').value);
    checkStop();render(request,result,comparison,cpu);
    const faultCount=result.metadata?.faults?.length??0;
    status(comparison?.differences?'CPU/GPUに不一致があります。詳細を確認してください。':faultCount?'入力条件エラーを'+faultCount+'件含む結果です。':'実行が完了しました。',comparison?.differences||faultCount?'bad':'good');
    return lastResult;
  }catch(error){status(stopRequested?'停止しました。':String(error.message??error),'bad');throw error;}
  finally{await releaseResources();controls(false);}
}
function stop(){if(!busy)return;stopRequested=true;$('stop').disabled=true;status('停止待ちです。投入済みの計算が終了したら結果を表示せず停止します。');}

for(const [kind,label]of [['battle','戦闘'],['camera','カメラ'],['graph','単体グラフ']]){
  const entries=modes.filter(mode=>mode.kind===kind);if(!entries.length)continue;
  const group=document.createElement('optgroup');group.label=label;
  for(const mode of entries){const option=document.createElement('option');option.value=mode.id;option.textContent=mode.titleJa;group.append(option);}
  $('mode').append(group);
}
$('inventory').textContent=`${assets.programs.length}戦闘 ／ ${assets.cameras.length}カメラ処理 ／ ${assets.models.filter(model=>model.public).length}単体グラフ ／ 計${assets.models.length}モデル`;
window.DQ9Release={ready:true,assets,modes,selectMode,run:()=>execute(false),compare:()=>execute(true),stop,get busy(){return busy;},lastResult:null};
$('mode').addEventListener('change',()=>selectMode($('mode').value));$('preset').addEventListener('change',applyPreset);$('reset').addEventListener('click',applyPreset);
$('run').addEventListener('click',()=>execute(false).catch(()=>{}));$('compare').addEventListener('click',()=>execute(true).catch(()=>{}));$('stop').addEventListener('click',stop);
$('download').addEventListener('click',()=>{if(!lastResult)return;const url=URL.createObjectURL(new Blob([JSON.stringify(lastResult,null,2)+'\n'],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='dq9-'+lastResult.mode+'-result.json';link.click();URL.revokeObjectURL(url);});
if(!modes.length)throw Error('実行モードがありません。');selectMode(modes[0].id);controls(false);
