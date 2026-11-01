const $=id=>document.getElementById(id),copy=x=>structuredClone(x),json=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?v.toString():v,2);
const packed=Uint8Array.from(atob($('dq9-release-assets').textContent.trim()),c=>c.charCodeAt(0));
const assets=await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
if(assets.schema!=='dq9-source-release-html-v2'||!assets.commonProgram)throw Error('共通プログラムがありません。');
const models=new Map(assets.models.map(m=>[m.name,m])),urls=new Map(),loading=new Set(),MASK64=(1n<<64n)-1n;
const seedBytes=x=>Array.from({length:8},(_,i)=>Number(x>>BigInt(i*8)&255n)),seedHex=a=>a?Array.from(a).reduce((n,x,i)=>n+(BigInt(x)<<BigInt(i*8)),0n).toString(16).padStart(16,'0'):'—',fmt=(n,d=1)=>Number(n).toLocaleString('ja-JP',{maximumFractionDigits:d});
let selected,busy=false,stopRequested=false,lastResult=null,cache=null;
const sleepUi=()=>new Promise(r=>setTimeout(r,0));
function status(text,kind=''){$('status').textContent=text;$('status').className='status '+kind;}
function log(text){$('log').textContent+=text+'\n';$('log').scrollTop=$('log').scrollHeight;}
async function moduleUrl(path){
  if(urls.has(path))return urls.get(path);if(loading.has(path))throw Error('循環依存: '+path);
  let source=assets.sources[path];if(typeof source!=='string')throw Error('実行コードがありません: '+path);loading.add(path);
  for(const m of [...source.matchAll(/\bfrom\s*(['"])(\.[^'"]+)\1/g)]){const dep=new URL(m[2],new URL(path,'https://dq9.invalid/')).pathname.slice(1);source=source.replace(m[0],'from '+JSON.stringify(await moduleUrl(dep)));}
  const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));urls.set(path,url);loading.delete(path);return url;
}
const loadModule=async path=>import(await moduleUrl(path));
function controls(value){busy=value;for(const e of document.querySelectorAll('[data-input]'))e.disabled=value;$('stop').disabled=!value;$('download').disabled=value||!lastResult;$('resume').disabled=value||!lastResult?.searchState||lastResult.searchState.complete;}
function selectMode(id){
  if(busy)throw Error('実行中は初期条件を変更できません。');selected=assets.encounters.find(x=>x.id===id);if(!selected)throw Error('未知の入力定義です。');
  $('mode').value=id;$('input-json').value=json(selected.inputs);$('seed').value=seedHex(selected.inputs.seed);$('scope-mode').value=selected.inputs.camera?.initial?'battle-camera':'numeric-only';$('scope').textContent=selected.scopeJa||'同じ共通プログラムへ戦闘条件を入力します。';
  lastResult=null;window.DQ9Release.lastResult=null;render(null);controls(false);status('初期条件・探索条件・実測情報を指定してください。');
}
function positive(id,label,max=Number.MAX_SAFE_INTEGER){const n=Number($(id).value);if(!Number.isSafeInteger(n)||n<1||n>max)throw Error(label+'は1〜'+max+'の整数です。');return n;}
function request(){
  const input=JSON.parse($('input-json').value),definitions=JSON.parse($('definitions-json').value),text=$('seed').value.trim().replace(/^0x/i,'');
  if(!/^[0-9a-f]{1,16}$/i.test(text))throw Error('開始seedは1〜16桁の16進数です。');
  if(input?.schema!=='dq9-common-battle-state-v1'||!definitions?.actions||!definitions?.monsters)throw Error('共通戦闘の初期状態と定義が必要です。');
  const start=BigInt('0x'+text),count=positive('seed-count','seed数',65536),end=start+BigInt(count)-1n;if(end>MASK64)throw Error('指定seed範囲がuint64を越えます。');
  const scope=$('scope-mode').value;input.seed=seedBytes(start);
  if(scope==='battle-camera'&&!input.camera?.initial)throw Error('この数値入力には初期カメラ条件がありません。カメラ付きの初期条件を選ぶか、camera.initialを入力してください。');
  if(scope==='numeric-only'){input.camera??={};input.camera.mode='numeric-only';}
  return{input,definitions,scope,startSeed:'0x'+start.toString(16),endSeed:'0x'+end.toString(16),count,maxTurns:positive('turns','ターン数'),domains:JSON.parse($('domains-json').value),observations:JSON.parse($('observations-json').value),mode:selected.id};
}
function budgets(){return{batchSize:positive('batch-size','同時入力数',65536),maxCandidates:positive('candidates','今回の候補採用上限'),maxAdapterCalls:positive('adapter-calls','今回の境界処理上限'),maxTransitions:positive('transitions','状態遷移上限')};}
async function withRuntime(definitions,operation){
  const {createGraphExecutorCache}=await loadModule('web/graph-executor.mjs');cache??=createGraphExecutorCache();const backend=$('backend').value,start=performance.now();
  return cache.withExecutor({models,programHash:assets.commonProgramHash,backend,ortVersion:assets.ortVersion,onProgress:e=>log('初期化 '+e.name+(e.provider?' / '+e.provider:''))},async executor=>{
    for(const[i,m]of assets.commonProgram.modules.entries()){if(stopRequested)break;await executor.getSession(m.name);if(i%8===0){status('モデルを準備しています '+(i+1)+' / '+assets.commonProgram.modules.length);await sleepUi();}}
    const initializationMs=performance.now()-start;await executor.resetMetrics();let calls=0;
    const runGraph=async(...args)=>{const out=await executor.runGraph(...args);if(++calls%32===0)await sleepUi();return out;};
    const began=performance.now(),result=await operation({definitions,getModel:name=>models.get(name)?.ir,runGraph});
    return{...result,performance:{backend,initializationMs,executionMs:performance.now()-began,graphExecutionCounts:{...executor.counts},executedModelProviders:Object.fromEntries(executor.executedModelProviders),explicitCpuModels:[...executor.explicitCpuModels],gpuAdapterInfo:executor.gpuAdapterInfo,implicitCpuFallback:false}};
  });
}
async function runSearch(conditions,prior){
  const options=budgets();let cameraObservations=0;
  const result=await withRuntime(conditions.definitions,async runtime=>{
    const {createCommonBattleCameraAdapter,createInitialBattleCameraState}=await loadModule('runtime/common-battle-camera.mjs'),{createCommonBattleSearch,createBattleSearchState}=await loadModule('runtime/common-battle-search.mjs');
    const adapter=await createCommonBattleCameraAdapter({program:assets.commonProgram,...runtime}),advanceBatch=async(...args)=>{const rows=await adapter.advanceBatch(...args);cameraObservations+=rows.filter(r=>r.status==='observation'&&r.observationId?.includes('/camera:')).length;return rows;};
    const state=prior??createBattleSearchState({adapterId:adapter.adapterId,initialState:createInitialBattleCameraState({input:conditions.input,maxTurns:conditions.maxTurns}),seedPath:['battle','seed'],seedRange:{min:conditions.startSeed,max:conditions.endSeed,step:1},domains:conditions.domains,observations:conditions.observations});
    const search=createCommonBattleSearch({adapterId:adapter.adapterId,advanceBatch}),computed=await search.run({state,...options,shouldStop:()=>stopRequested,onProgress:async p=>{status('カメラ候補計算 '+fmt(cameraObservations,0)+'件 / 残存枝 '+p.survivors+' / 保留 '+p.blockedBranches);$('input-progress').textContent='未列挙候補（判明した境界）: '+p.pendingAssignmentsAtKnownBoundaries;await sleepUi();}});
    return{searchState:computed.state,search:computed,adapterId:adapter.adapterId};
  });
  result.performance.completedCameraCandidates=cameraObservations;result.performance.cameraCandidatesPerSecond=cameraObservations/(result.performance.executionMs/1000);
  return{schema:'dq9-common-battle-search-execution-v1',programHash:assets.commonProgramHash,createdAt:new Date().toISOString(),conditions:copy(conditions),budgets:options,...result};
}
async function runNumeric(conditions){
  const options=budgets(),result=await withRuntime(conditions.definitions,async runtime=>{
    const {createCommonBattleRunner}=await loadModule('runtime/common-battle.mjs'),runner=await createCommonBattleRunner({program:assets.commonProgram,...runtime});const rows=[];let completed=0;
    for(let begin=0;begin<conditions.count;begin+=options.batchSize){
      if(stopRequested)break;const n=Math.min(options.batchSize,conditions.count-begin),inputs=Array.from({length:n},(_,i)=>({...copy(conditions.input),seed:seedBytes(BigInt(conditions.startSeed)+BigInt(begin+i))})),out=await runner.run({rows:inputs,maxTurns:conditions.maxTurns,maxTransitions:options.maxTransitions,trace:false,shouldStop:()=>stopRequested});
      rows.push(...out.rows);completed+=out.rows.filter(r=>r.supported&&r.requestedTurnsComplete&&!r.budgetExhausted).length;status('数値入力 '+rows.length+' / '+conditions.count);await sleepUi();
    }
    return{numeric:{rows,completed,requested:conditions.count,complete:completed===conditions.count,unstarted:conditions.count-rows.length,initialTemplate:copy(conditions.input),unstartedSeedStart:'0x'+(BigInt(conditions.startSeed)+BigInt(rows.length)).toString(16),cameraIncluded:false}};
  });return{schema:'dq9-common-battle-numeric-execution-v1',programHash:assets.commonProgramHash,createdAt:new Date().toISOString(),conditions:copy(conditions),budgets:options,...result};
}
async function execute(resume=false){
  if(busy)throw Error('既に実行中です。');stopRequested=false;controls(true);window.DQ9Release.lastError=null;
  try{
    const conditions=resume?copy(lastResult.conditions):request();
    if(resume&&(!lastResult.searchState||lastResult.searchState.complete))throw Error('未完了の保存探索がありません。');
    const output=conditions.scope==='battle-camera'?await runSearch(conditions,resume?copy(lastResult.searchState):null):await runNumeric(conditions);
    lastResult=output;window.DQ9Release.lastResult=output;render(output);
    const s=output.search;if(s?.error)status('状態を保存して停止しました: '+s.error,'bad');else if(s?.complete)status('指定候補領域を全て検証しました。残った枝: '+s.state.survivors.length,'good');else if(s)status(s.state.blocked.length?'未対応・未計算の枝を保留しています。列挙済み状態と残り候補は保存されています。':'今回の計算を停止しました。候補領域は狭めず、保存位置から再開できます。');else status(output.numeric.complete?'指定した数値遷移が完了しました。カメラ乱数は適用していません。':'数値遷移の未完了状態を保存しました。',output.numeric.complete?'good':'');
    return output;
  }catch(e){window.DQ9Release.lastError=String(e.message??e);status(window.DQ9Release.lastError,'bad');throw e;}finally{controls(false);}
}
function visibleBranches(result){
  if(result?.numeric)return result.numeric.rows.map((battle,i)=>({id:String(i),state:{battle},label:'数値のみ'}));
  const s=result?.searchState;if(!s)return[];return[...s.survivors.map(b=>({...b,label:'残存枝'})),...s.ready.map(t=>({...t.branch,label:'続行待ち'})),...s.blocked.map(b=>({...b.branch,label:'保留: '+b.reason})),...s.expansions.filter(e=>e.parent).map(e=>({...e.parent,label:'候補列挙待ち'}))];
}
function render(result){
  $('rows').replaceChildren();for(const id of ['count','elapsed','rate','branches'])$(id).textContent='—';
  if(!result){for(const id of ['issues','details','camera-output','trace-output','device'])$(id).textContent='未実行';$('timings').textContent='計算後に、準備時間と実行時間を表示します。';$('input-progress').textContent='探索は未実行です。';$('scope-result').textContent='実行する範囲と条件を指定してください。';return;}
  const p=result.performance,s=result.searchState;$('elapsed').textContent=fmt(p.executionMs/1000,3)+' 秒';$('timings').textContent='モデル準備 '+fmt(p.initializationMs/1000,3)+' 秒。実行時間は計算と出力の読出しを含みます。';
  $('device').textContent=json({backend:p.backend,gpuAdapterInfo:p.gpuAdapterInfo,explicitCpuModels:p.explicitCpuModels,executedModelProviders:p.executedModelProviders,implicitCpuFallback:false});
  if(s){$('count').textContent=fmt(p.completedCameraCandidates,0);$('rate').textContent=fmt(p.cameraCandidatesPerSecond,2)+' 候補/秒';$('branches').textContent=String(s.survivors.length);$('input-progress').textContent='未列挙候補（判明した境界） '+result.search.progress.pendingAssignmentsAtKnownBoundaries+' / 続行待ち '+s.ready.length+' / 保留 '+s.blocked.length;$('scope-result').textContent='共通戦闘とカメラを計算。実測は照合にだけ使用し、全ての残存枝と計算した状態を保持します。';$('issues').textContent=json({complete:s.complete,stopReason:result.search.stopReason,error:result.search.error??null,blocked:s.blocked.map(b=>({id:b.branch.id,reason:b.reason,detail:b.detail??null})),progress:result.search.progress});}
  else{$('count').textContent=result.numeric.completed+' / '+result.numeric.requested;$('rate').textContent=fmt(result.numeric.completed/(p.executionMs/1000),2)+' 入力/秒';$('branches').textContent='数値のみ';$('input-progress').textContent='未開始 '+result.numeric.unstarted+'件。全初期seed範囲と入力テンプレートを保存しています。';$('scope-result').textContent='数値遷移のみ。カメラによる乱数消費を含む戦闘結果ではありません。';$('issues').textContent=json(result.numeric.rows.flatMap((r,i)=>r.supported&&!r.budgetExhausted?[]:[{lane:i,phase:r.phase,reason:r.stopReason,unresolved:r.unresolvedEffects}]).slice(0,32));}
  const rows=visibleBranches(result),hp=assets.actorFields.indexOf('hp'),mp=assets.actorFields.indexOf('mp');
  for(const branch of rows.slice(0,32)){const b=branch.state.battle??branch.state,tr=document.createElement('tr'),values=[branch.id,seedHex(b.seed),b.position,b.completedTurns,b.actors?.map(a=>a.actorId+': '+a.actor[hp]+' / '+a.actor[mp]).join('\n'),json(b.combo),branch.label];for(const value of values){const td=document.createElement('td');td.textContent=String(value??'—');tr.append(td);}$('rows').append(tr);}
  $('camera-output').textContent=rows[0]?json({branchId:rows[0].id,world:rows[0].state.world,row4History:rows[0].state.row4History}):'表示する計算済み枝はありません。';$('trace-output').textContent=rows[0]?json(rows[0].state.battle?.nowstate??[]):'記録なし';
  $('details').textContent=json({schema:result.schema,programHash:result.programHash,adapterId:result.adapterId,performance:result.performance,budgets:result.budgets,searchStats:s?.stats,fullState:'全ての枝・候補カーソル・定義・初期条件は全結果JSONに保存されます。'});
}
async function loadSavedResult(file){
  if(busy)throw Error('実行中は復元できません。');const saved=JSON.parse(await file.text());
  if(saved.schema!=='dq9-common-battle-search-execution-v1'||saved.programHash!==assets.commonProgramHash||saved.searchState?.schema!=='dq9-common-battle-search-v1'||!saved.conditions?.definitions?.actions)throw Error('同じ共通プログラムの全探索JSONが必要です。');
  lastResult=saved;window.DQ9Release.lastResult=saved;$('scope-mode').value='battle-camera';$('input-json').value=json(saved.conditions.input);$('definitions-json').value=json(saved.conditions.definitions);$('domains-json').value=json(saved.conditions.domains);$('observations-json').value=json(saved.conditions.observations);render(saved);controls(false);status('全ての枝と候補カーソルを復元しました。再開時は保存済みの条件を使用します。','good');return saved;
}
function download(){if(!lastResult)return;const blob=new Blob([json(lastResult)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='dq9-battle-search-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
window.DQ9Release={assets,models,ready:false,lastResult:null,lastError:null,run:()=>execute(false),resume:()=>execute(true),loadSavedResult,selectMode,releaseExecutor:()=>cache?.release(),loadModule};
for(const e of assets.encounters){const option=document.createElement('option');option.value=e.id;option.textContent=e.titleJa+(e.inputs.camera?.initial?'':'（数値初期条件）');$('mode').append(option);}
$('definitions-json').value=json(assets.definitions);$('action-coverage').textContent=json(assets.actionCoverage);$('program-hash').textContent=assets.commonProgramHash;$('inventory').textContent='共通プログラム 1個 / ONNX '+assets.models.length+'個 / 初期条件 '+assets.encounters.length+'件 / ROM不要';
$('mode').onchange=()=>selectMode($('mode').value);$('reset').onclick=()=>selectMode(selected.id);$('reset-definitions').onclick=()=>{$('definitions-json').value=json(assets.definitions);};$('run').onclick=()=>execute(false).catch(()=>{});$('resume').onclick=()=>execute(true).catch(()=>{});$('stop').onclick=()=>{stopRequested=true;status('現在の計算境界を保存して停止します。');};$('download').onclick=download;
$('result-file').onchange=()=>loadSavedResult($('result-file').files[0]).catch(e=>status(String(e.message??e),'bad'));
$('full-domain').onclick=()=>{$('domains-json').value='{}';};
selectMode(assets.encounters.find(e=>e.inputs.camera?.mode==='battle-camera')?.id??assets.encounters[0].id);window.DQ9Release.ready=true;
