const $=id=>document.getElementById(id);
const compressed=Uint8Array.from(atob($('dq9-release-assets').textContent.trim()),char=>char.charCodeAt(0));
const assets=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
if(assets.schema!=='dq9-source-release-html-v2'||!assets.commonProgram)throw Error('共通プログラムを含む公開データがありません。');
const models=new Map(assets.models.map(model=>[model.name,model]));
const modes=[
  ...assets.encounters.map(encounter=>({...encounter,kind:'battle',presets:[{id:'initial',labelJa:'編成と初期状態',inputs:encounter.inputs}]})),
  ...assets.cameras.map(mode=>({...mode,kind:'camera'})),
  ...assets.models.filter(model=>model.public).map(model=>({id:model.name,titleJa:model.titleJa,kind:'graph',model,presets:[{id:'initial',labelJa:'グラフの初期入力',inputs:model.defaultInput}],scopeJa:model.ir.contract?.scopeJa??model.ir.contract?.scope??''}))
];
const sourceUrls=new Map(),loadingSources=new Set(),MASK64=(1n<<64n)-1n;
const format=(value,digits=1)=>Number(value).toLocaleString('ja-JP',{maximumFractionDigits:digits});
const stringify=value=>JSON.stringify(value,(_,item)=>typeof item==='bigint'?item.toString():item,2);
const seedHex=value=>Array.from(value).reduce((seed,byte,index)=>seed+(BigInt(byte)<<BigInt(index*8)),0n).toString(16).padStart(16,'0');
const seedBytes=seed=>Array.from({length:8},(_,index)=>Number(seed>>BigInt(index*8)&255n));
const scalar=value=>Array.isArray(value)||ArrayBuffer.isView(value)?value[0]:value;
let current,busy=false,stopRequested=false,lastResult=null,localFrameResources=null;
const continuationEvents={contract:'dq9-functional-presentation-continuation-v1',overlayReload:{contract:'dq9-original-overlay25-image-reloaded-v1'},loaderCompleted:{contract:'dq9-original-overlay25-load-complete-v1'}};

function status(text,kind=''){$('status').textContent=text;$('status').className='status '+kind;}
function log(text){if($('log').textContent==='初期化待ち')$('log').textContent='';$('log').textContent+=text+'\n';$('log').scrollTop=$('log').scrollHeight;}
async function yieldUi(){await new Promise(resolve=>setTimeout(resolve,0));}
function canContinueNumeric(){return current?.kind==='battle'&&lastResult?.result?.rows?.length>0&&lastResult.result.rows.every(row=>row.supported&&row.requestedTurnsComplete&&!row.budgetExhausted&&!row.finished&&row.camera?.nextNumericTurnReady===true&&row.camera.frameState?.complete&&row.camera.frameState.mainState===7);}
function presentationPending(row){const c=row.camera,f=c?.frameState;return c?.mode==='functional-frame'&&f&&!row.stoppedBeforeExecution&&((c.numericTurnPending&&row.phase==='numeric-turn-complete'&&f.entryBoundary?.stage==='accepted-command')||(!f.complete&&c.functionalFramePending&&row.phase==='presentation'));}
function canContinuePresentation(){const rows=lastResult?.result?.rows;return current?.kind==='battle'&&rows?.length>0&&rows.some(presentationPending)&&rows.every(row=>presentationPending(row)||row.camera?.nextNumericTurnReady===true&&row.camera.frameState?.complete);}
function needsEntryEvents(){return lastResult?.result?.rows?.some(row=>row.camera?.numericTurnPending&&row.phase==='numeric-turn-complete')??false;}
function controls(running){
  busy=running;
  for(const id of ['mode','preset','scope-mode','rom-file','result-file','backend','seed','batch','chunk','limit','transitions','warmup','trace','row4','input-json','definitions-json','reset','reset-definitions','run','compare'])$(id).disabled=running;
  $('stop').disabled=!running;$('download').disabled=running||!lastResult;
  $('next-numeric').disabled=running||!canContinueNumeric();$('next-commands-json').disabled=running||!canContinueNumeric();
  for(const id of ['continue-presentation','continuation-events-json','frame-budget'])$(id).disabled=running||!canContinuePresentation();
  $('continuation-events-json').disabled=running||!canContinuePresentation()||!needsEntryEvents();
  if(!running&&current){
    $('seed').disabled=!Object.hasOwn(current.presets[0].inputs,'seed');
    for(const id of ['scope-mode','chunk','transitions','trace','definitions-json','reset-definitions'])$(id).disabled=current.kind!=='battle';
    $('row4').disabled=current.kind==='graph';
  }
}
async function moduleUrl(path){
  if(sourceUrls.has(path))return sourceUrls.get(path);
  if(loadingSources.has(path))throw Error('実行コードの循環依存: '+path);
  let source=assets.sources[path];if(typeof source!=='string')throw Error('実行コードがありません: '+path);
  loadingSources.add(path);
  for(const match of [...source.matchAll(/\bfrom\s*(['"])(\.[^'"]+)\1/g)]){
    const dependency=new URL(match[2],new URL(path,'https://dq9.invalid/')).pathname.slice(1);
    source=source.replace(match[0],'from '+JSON.stringify(await moduleUrl(dependency)));
  }
  const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
  sourceUrls.set(path,url);loadingSources.delete(path);return url;
}
const loadModule=async path=>import(await moduleUrl(path));

async function loadLocalRom(file){
  if(busy)throw Error('実行中はROMを変更できません。');
  if(!file)throw Error('ローカルのNDS ROMファイルを選択してください。');
  localFrameResources=null;controls(true);$('rom-assets-status').textContent='ROM内のメッセージと静的フォントを読み込んでいます。';
  try{
    const {extractCommonPresentationAssets}=await loadModule('runtime/common-rom-assets.mjs');
    const resources=await extractCommonPresentationAssets(file,{includeAnimationArchives:true});localFrameResources=resources;
    $('rom-assets-status').textContent='読込済み: '+resources.assetManifest.gameCode+' / メッセージ1件・静的フォント4件・演出アーカイブ3件。検証済みの原本ハッシュと一致しました。';
    return structuredClone(resources.assetManifest);
  }catch(error){$('rom-assets-status').textContent='読み込めません: '+String(error.message??error);throw error;}
  finally{controls(false);}
}

async function loadSavedResult(file){
  if(busy)throw Error('実行中は保存状態を復元できません。');
  if(!file||typeof file.text!=='function')throw Error('保存した全結果JSONを選択してください。');
  controls(true);
  try{
    const saved=JSON.parse(await file.text());
    if(saved.schema!=='dq9-common-battle-execution-v1'||saved.kind!=='battle'||saved.programHash!==assets.commonProgramHash)throw Error('この共通プログラムと同じSHA-256の全結果JSONが必要です。');
    if(!modes.some(mode=>mode.kind==='battle'&&mode.id===saved.mode)||!Array.isArray(saved.result?.rows)||!saved.result.rows.length||!Array.isArray(saved.conditions?.inputs)||saved.conditions.inputs.length!==saved.result.rows.length||!saved.conditions.definitions?.actions)throw Error('全入力・定義・保持した状態を含む結果JSONが必要です。');
    // The complete computed frame contains its own bytes and font state; a
    // restore never replaces them with newly selected ROM or initial values.
    controls(false);selectMode(saved.mode);
    for(const [id,value]of Object.entries({batch:saved.conditions.count,chunk:saved.conditions.chunkSize,limit:saved.conditions.maxTurns,transitions:saved.conditions.maxTransitions}))if(value!==undefined)$(id).value=String(value);
    $('warmup').checked=!!saved.conditions.warmup;$('trace').checked=!!saved.conditions.trace;$('definitions-json').value=stringify(saved.conditions.definitions);$('input-json').value=stringify(saved.conditions.inputs[0]);
    if(saved.conditions.continuationEvents)$('continuation-events-json').value=stringify(saved.conditions.continuationEvents);
    if(saved.conditions.maxFrames)$('frame-budget').value=String(saved.conditions.maxFrames);
    const request={mode:current,rows:saved.conditions.inputs,definitions:saved.conditions.definitions,count:saved.result.rows.length,chunkSize:saved.conditions.chunkSize??1,limit:saved.conditions.maxTurns??1,maxTransitions:saved.conditions.maxTransitions??100000,maxFrames:saved.conditions.maxFrames??undefined,trace:!!saved.conditions.trace,warmup:!!saved.conditions.warmup,boundary:saved.conditions.boundary,continuationFrom:saved.conditions.continuationFrom,commandInputs:saved.conditions.commandInputs,acceptedCommandBoundary:saved.conditions.acceptedCommandBoundary,continuationEvents:saved.conditions.continuationEvents,seeds:saved.conditions.inputs.map(row=>seedHex(row.seed))};
    render(request,saved.result,saved.comparison,saved.comparisonReference);
    status('保存した全入力と状態を復元しました。停止した演出は「演出を続行・再開」で続けられます。','good');return lastResult;
  }catch(error){status(String(error.message??error),'bad');throw error;}
  finally{controls(false);}
}

function applyPreset(){
  const preset=current.presets.find(item=>item.id===$('preset').value)??current.presets[0];
  $('input-json').value=stringify(preset.inputs);
  $('scope-mode').value=current.kind==='battle'&&['camera-projection','functional-frame'].includes(preset.inputs.camera?.mode)?preset.inputs.camera.mode:'numeric-only';
  $('seed').value=Array.isArray(preset.inputs.seed)&&preset.inputs.seed.length===8?seedHex(preset.inputs.seed):'0000000000000001';
  const row4=preset.inputs.camera?.row4Words??preset.inputs.row4Words;
  $('row4').value=Array.isArray(row4)&&row4.length===4?JSON.stringify(row4):'';
}
function selectMode(id){
  if(busy)throw Error('実行中は変更できません。');
  current=modes.find(mode=>mode.id===id);if(!current)throw Error('未知の入力定義です。');
  $('mode').value=id;$('preset').replaceChildren();
  for(const preset of current.presets){const option=document.createElement('option');option.value=preset.id;option.textContent=preset.labelJa??preset.id;$('preset').append(option);}
  $('limit-label').textContent=current.kind==='camera'?'経路探索の予算':current.kind==='graph'?'反復回数':'最大ターン数';
  $('limit').value=current.kind==='camera'?'10861':'1';$('batch').value='1';
  $('batch-label').textContent=Object.hasOwn(current.presets[0].inputs,'seed')?'連続seed数':'同じ初期値の入力数';
  $('scope').textContent=current.scopeJa||(current.kind==='battle'?'共通の戦闘処理へ、編成・能力値・行動表・初期状態を入力します。未実装の効果や制御は結果に記録します。':'');
  $('program-hash').textContent=assets.commonProgramHash;
  $('program-note').textContent=current.kind==='battle'?'この入力も同じ共通プログラムとモジュール集合で実行します。':'下記は共通戦闘プログラムのハッシュです。選択中の単体検査は戦闘全体を実行しません。';
  applyPreset();lastResult=null;window.DQ9Release.lastResult=null;$('continuation-events-json').value=stringify(continuationEvents);$('frame-budget').value='256';
  for(const id of ['count','elapsed','rate','differences'])$(id).textContent='—';
  $('input-progress').textContent='入力ごとの完了・未実装・予算到達・停止を実行後に表示します。';
  $('rows').replaceChildren();for(const id of ['details','trace-output','issues'])$(id).textContent='未実行';
  $('scope-result').textContent=current.kind!=='battle'?'単体検査の計算範囲を実行後に表示します。':$('scope-mode').value==='functional-frame'?'この初期入力は数値処理・メッセージ待機・カメラ・後片付けを共通グラフで進めます。ローカルROMを読み込んでください。':$('scope-mode').value==='camera-projection'?'この初期入力は数値処理とカメラ呼出しを接続します。演出の非同期完了と次ターン復帰は未完了として残します。':'既定は数値遷移のみです。カメラ乱数を適用した完全な戦闘結果にはなりません。';
  status('編成と初期状態を指定してください。');controls(false);
}
function positiveInteger(id,label,max=Number.MAX_SAFE_INTEGER){
  const value=Number($(id).value);
  if(!Number.isSafeInteger(value)||value<1||value>max)throw Error(label+'を1〜'+max+'の整数で指定してください。');
  return value;
}
function readRequest(){
  const input=JSON.parse($('input-json').value);
  if(!input||Array.isArray(input)||typeof input!=='object')throw Error('初期状態JSONは1件のobjectを指定してください。');
  const text=$('seed').value.trim().replace(/^0x/i,'');
  if(!/^[0-9a-f]{1,16}$/i.test(text))throw Error('開始seedは1〜16桁の16進数で入力してください。');
  const count=positiveInteger('batch','入力数',65536),chunkSize=current.kind==='battle'?positiveInteger('chunk','同時実行する入力数',65536):count,limit=positiveInteger('limit','実行上限'),maxTransitions=current.kind==='battle'?positiveInteger('transitions','状態遷移の予算'):1;
  const hasSeed=Object.hasOwn(input,'seed'),start=BigInt('0x'+text),row4Text=$('row4').value.trim();
  if(current.kind==='battle'&&$('scope-mode').value==='numeric-only'){input.camera??={};input.camera.mode='numeric-only';}
  if(current.kind==='battle'&&$('scope-mode').value==='camera-projection'){input.camera??={};input.camera.mode='camera-projection';}
  if(current.kind==='battle'&&$('scope-mode').value==='functional-frame'){input.camera??={};input.camera.mode='functional-frame';}
  let frameResources;
  if(current.kind==='battle'&&input.camera?.mode==='functional-frame'){
    if(limit!==1)throw Error('フレーム実行の初回は1ターンを指定してください。次のターンは保持した結果のコマンド確定と演出続行から進めます。');
    if(input.camera.frameInput?.contract!=='dq9-empty-script-static-font-functional-frame-v1')throw Error('フレーム実行の初期入力例を選ぶか、camera.frameInputの契約と初期状態を指定してください。');
    const inline=!!input.camera.frameInput.assets?.['actmsg.nat']&&Array.isArray(input.camera.frameInput.fontTables);
    if(!inline&&!localFrameResources)throw Error('フレーム実行にはローカルROMのメッセージ・静的フォントが必要です。ROMファイルを選択してください。');
    if(!inline){frameResources=localFrameResources;input.camera.frameInput.assetManifest=structuredClone(localFrameResources.assetManifest);}
  }
  if(row4Text&&current.kind!=='graph'){
    const words=JSON.parse(row4Text);
    if(!Array.isArray(words)||words.length!==4||words.some(word=>!Number.isSafeInteger(word)||word<0||word>4294967295))throw Error('row+4は4個のunsigned 32bit整数をJSON配列で指定してください。');
    if(current.kind==='battle'){input.camera??={};input.camera.row4Words=words;}else input.row4Words=words;
  }
  const definitions=current.kind==='battle'?JSON.parse($('definitions-json').value):null;
  if(current.kind==='battle'&&(!definitions||typeof definitions!=='object'||Array.isArray(definitions)))throw Error('定義JSONはobjectを指定してください。');
  const rows=Array.from({length:count},(_,lane)=>{const row=structuredClone(input);if(hasSeed)row.seed=seedBytes((start+BigInt(lane))&MASK64);return row;});
  return{mode:current,rows,definitions,frameResources,limit,maxTransitions,count,chunkSize,trace:$('trace').checked,warmup:$('warmup').checked,seeds:rows.map((row,lane)=>hasSeed?seedHex(row.seed):String(lane+1))};
}

function readNextNumericRequest(){
  if(!canContinueNumeric())throw Error('自然フレームの処理が完了し、次のコマンド入力を受け付ける状態が必要です。');
  if(lastResult.programHash!==assets.commonProgramHash)throw Error('前の結果と共通プログラムが異なります。');
  const edits=JSON.parse($('next-commands-json').value);
  if(!Array.isArray(edits)||!edits.length)throw Error('次のコマンドをactorIdとcommandsの配列で指定してください。');
  const ids=new Set();for(const edit of edits){if(!Number.isInteger(edit?.actorId)||ids.has(edit.actorId)||!Array.isArray(edit.commands)||Object.keys(edit).some(key=>!['actorId','commands'].includes(key)))throw Error('次の入力には重複のないactorIdとcommandsだけを指定してください。');ids.add(edit.actorId);}
  const rows=structuredClone(lastResult.result.rows);
  for(const row of rows)for(const edit of edits){const actor=row.actors.find(a=>a.actorId===edit.actorId);if(!actor||!actor.actor[assets.actorFields.indexOf('party')])throw Error('次のコマンド対象は、保持した編成にいる味方actorIdを指定してください。');actor.commands=structuredClone(edit.commands);}
  return{mode:current,rows,definitions:structuredClone(lastResult.conditions.definitions),boundary:'numeric-turn',acceptedCommandBoundary:{contract:'dq9-accepted-command-input-v1'},limit:1,maxTransitions:positiveInteger('transitions','状態遷移の予算'),count:rows.length,chunkSize:positiveInteger('chunk','同時実行する入力数',65536),trace:$('trace').checked,warmup:$('warmup').checked,seeds:rows.map(row=>seedHex(row.seed)),continuationFrom:{programHash:lastResult.programHash,inputHash:lastResult.result.inputHash,completedTurns:rows.map(row=>row.completedTurns)},commandInputs:edits};
}

function readPresentationRequest(){
  if(!canContinuePresentation())throw Error('演出開始を待つ数値ターン、または停止したフレーム状態が必要です。');
  if(lastResult.programHash!==assets.commonProgramHash)throw Error('前の結果と共通プログラムが異なります。');
  const events=needsEntryEvents()?JSON.parse($('continuation-events-json').value):lastResult.result.rows.find(row=>row.camera?.continuationEvents)?.camera.continuationEvents,rows=structuredClone(lastResult.result.rows);
  if(events&&(events.contract!==continuationEvents.contract||events.overlayReload?.contract!==continuationEvents.overlayReload.contract||events.loaderCompleted?.contract!==continuationEvents.loaderCompleted.contract))throw Error('機能的フレームの明示したオーバーレイ再読込・ロード完了イベントを指定してください。');
  return{mode:current,rows,definitions:structuredClone(lastResult.conditions.definitions),boundary:'presentation',continuationEvents:events,maxFrames:positiveInteger('frame-budget','今回のフレーム予算'),limit:1,maxTransitions:positiveInteger('transitions','状態遷移の予算'),count:rows.length,chunkSize:positiveInteger('chunk','同時実行する入力数',65536),trace:$('trace').checked,warmup:$('warmup').checked,seeds:rows.map(row=>seedHex(row.seed)),continuationFrom:{programHash:lastResult.programHash,inputHash:lastResult.result.inputHash,completedTurns:rows.map(row=>row.completedTurns)}};
}

async function executeBattleChunks(request,run){
  const rows=[],traces=[],chunks=[],unresolvedEffects=[];
  let first=null,attemptedInputs=0,retainedInputs=0,graphCalls=0,batchRows=0;
  for(let offset=0;offset<request.rows.length;offset+=request.chunkSize){
    if(stopRequested)break;
    const inputs=request.rows.slice(offset,offset+request.chunkSize),result=await run(inputs);
    if(result.rows?.length!==inputs.length)throw Error('共通実行の入力数が変わりました。');
    if(result.programHash!==assets.commonProgramHash)throw Error('実行した共通プログラムのハッシュが公開定義と異なります。');
    if(first&&result.programHash!==first.programHash)throw Error('入力バッチ間で共通プログラムが変わりました。');
    first??=result;rows.push(...result.rows);if(request.trace)traces.push(...result.traces);
    unresolvedEffects.push(...result.unresolvedEffects.map(entry=>({...entry,lane:entry.lane+offset})));
    const retained=result.rows.filter(row=>row.executionStatus==='retained-complete').length;
    retainedInputs+=retained;attemptedInputs+=inputs.length-retained;graphCalls+=result.graphCalls;batchRows+=result.batchRows;
    chunks.push({offset,count:inputs.length,inputHash:result.inputHash,complete:result.complete,graphCalls:result.graphCalls,batchRows:result.batchRows});
    status(format(attemptedInputs,0)+' / '+format(request.count,0)+'入力の処理を確認しました。');await yieldUi();
  }
  // Cancellation is the only reason not to attempt the remaining input lanes.
  // Keep their original states in the output and label them explicitly; these
  // rows are never counted as executed, completed, a win, or a loss.
  for(let lane=rows.length;lane<request.rows.length;lane++){
    rows.push({...structuredClone(request.rows[lane]),executionStatus:'not-started',stoppedBeforeExecution:true,requestedTurnsComplete:false,stopReason:'User stopped before this input was submitted'});
    if(request.trace)traces.push([]);
  }
  const completedInputs=rows.filter(row=>row.requestedTurnsComplete&&row.supported&&!row.budgetExhausted&&!row.stoppedBeforeExecution).length;
  const stoppedInputs=rows.filter(row=>row.stopReason?.startsWith('User stopped')).length;
  const numericOnly=rows.every(row=>row.camera?.mode==='numeric-only');
  const hashBytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({definitions:request.definitions,rows:request.rows})));
  return{...first,rows,traces:request.trace?traces:undefined,unresolvedEffects,graphCalls,batchRows,chunks,
    programHash:assets.commonProgramHash,moduleHashes:Object.fromEntries(assets.commonProgram.modules.map(module=>[module.name,module.sha256])),
    inputHash:Array.from(new Uint8Array(hashBytes),byte=>byte.toString(16).padStart(2,'0')).join(''),
    complete:completedInputs===request.count,wholeBattleComplete:completedInputs===request.count&&rows.every(row=>row.finished&&row.camera?.complete),numericOnly,
    budgetExhausted:rows.some(row=>row.budgetExhausted),userStopped:stoppedInputs>0,
    requestedInputs:request.count,attemptedInputs,retainedInputs,completedInputs,newlyCompletedInputs:completedInputs-retainedInputs,unstartedInputs:request.count-attemptedInputs-retainedInputs,
    unsupportedInputs:rows.filter(row=>row.supported===false&&!row.stoppedBeforeExecution).length,
    transitionBudgetInputs:rows.filter(row=>row.budgetExhausted&&row.stopReason==='Transition budget exhausted').length,
    stoppedInputs,allInputLanesAttempted:attemptedInputs+retainedInputs===request.count,allInputLanesCompleted:completedInputs===request.count};
}

async function executeBackend(request,backend){
  const initialized=performance.now(),{createGraphExecutor}=await loadModule('web/graph-executor.mjs');
  const executor=createGraphExecutor({models,backend,ortVersion:assets.ortVersion,onProgress:entry=>log('初期化: '+entry.name+(entry.provider?' / '+entry.provider:'')),shouldStop:request.mode.kind==='battle'?undefined:()=>stopRequested});
  let run;
  try{
    if(request.mode.kind==='battle'){
      const {createCommonBattleRunner}=await loadModule('runtime/common-battle.mjs');
      const {createCommonFunctionalPresentationRunner}=await loadModule('runtime/common-functional-presentation.mjs');
      const presentationRunner=createCommonFunctionalPresentationRunner({definitions:request.definitions,cpuDoubleProvider:'onnxruntime-wasm',frameResources:request.frameResources,shouldStop:()=>stopRequested,
        onPhase:async entry=>{if(entry.name==='font'){if(entry.frame%16===0)status('演出フレーム '+format(entry.frame+1,0)+' を計算しました。');await yieldUi();}}});
      const runner=await createCommonBattleRunner({program:assets.commonProgram,definitions:request.definitions,getModel:name=>models.get(name)?.ir,runGraph:executor.runGraph,presentationRunner});
      if(request.boundary==='presentation')run=async rows=>{
        const states=[],unresolvedEffects=[];let graphCalls=0,batchRows=0;
        for(const [lane,row]of rows.entries()){
          const output=await presentationRunner.continuePresentation({state:row,events:request.continuationEvents,runGraph:executor.runGraph,getModel:name=>models.get(name)?.ir,maxFrames:request.maxFrames,maxTransitions:request.maxTransitions});
          const state=output.state;if(output.retainedComplete)state.executionStatus='retained-complete';else delete state.executionStatus;
          states.push(state);graphCalls+=output.graphCalls;batchRows+=output.batchRows;unresolvedEffects.push(...(state.unresolvedEffects??[]).map(value=>({lane,...value})));
        }
        return{rows:states,traces:request.trace?states.map(()=>[]):undefined,unresolvedEffects,graphCalls,batchRows,programHash:runner.programHash,moduleHashes:runner.moduleHashes,boundary:'presentation',numericOnly:false,complete:states.every(row=>row.supported&&row.requestedTurnsComplete&&!row.budgetExhausted),budgetExhausted:states.some(row=>row.budgetExhausted)};
      };
      else run=async rows=>{
        let inputs=structuredClone(rows),entryCalls=0,entryRows=0;
        if(request.boundary==='numeric-turn'){
          const prepared=[];for(const row of inputs){const accepted=await presentationRunner.prepareAcceptedCommand({state:row,boundary:request.acceptedCommandBoundary,runGraph:async(name,batch)=>{const result=await executor.runGraph(name,batch);entryCalls++;entryRows+=batch.length;return result;},getModel:name=>models.get(name)?.ir});prepared.push(accepted.state);}inputs=prepared;
        }
        const result=await(request.boundary==='numeric-turn'?runner.runNumericTurn:runner.run)({rows:inputs,maxTurns:request.limit,maxTransitions:request.maxTransitions,trace:request.trace,shouldStop:()=>stopRequested,onProgress:async entry=>{if(entry?.message)log(entry.message);await yieldUi();}});
        return{...result,graphCalls:result.graphCalls+entryCalls,batchRows:result.batchRows+entryRows};
      };
    }else if(request.mode.kind==='camera'){
      const factory=(await loadModule(request.mode.runner.path))[request.mode.runner.export];
      const runner=await factory({getModel:name=>models.get(name)?.ir,runGraph:executor.runGraph,runDoubleGraph:executor.runGraph});
      run=async rows=>{const result=await runner.run({rows:structuredClone(rows),maxRouteAttempts:request.limit});return{...result,rows:result.states??result.rows};};
    }else{
      const model=request.mode.model,feedback=model.ir.contract?.feedback??{};
      if(request.limit>1&&!Object.keys(feedback).length)throw Error('この単体グラフには状態の引継ぎ定義がありません。反復回数1を指定してください。');
      run=async rows=>{
        let input=structuredClone(rows),output;
        for(let step=0;step<request.limit;step++){
          output=await executor.runGraph(model.name,input);
          if(step+1<request.limit)input=input.map((row,lane)=>({...row,...Object.fromEntries(Object.entries(feedback).map(([name,key])=>[name,output[lane][key]]))}));
        }
        return{rows:output,complete:true,iterations:request.limit};
      };
    }
    const numericOnly=request.mode.kind==='battle'&&(request.boundary==='numeric-turn'||request.rows.every(row=>row.camera?.mode==='numeric-only'));
    const required=request.mode.kind==='battle'?numericOnly?[...new Set(Object.values(assets.commonProgram.operations))]:assets.commonProgram.modules.map(module=>module.name):request.mode.kind==='camera'?request.mode.models:[request.mode.model.name];
    for(const name of required){if(stopRequested)break;await executor.getSession(name);await yieldUi();}
    const initializationMilliseconds=performance.now()-initialized;
    let warmupMilliseconds=0;
    if(request.warmup&&!stopRequested){status('同じ初期状態の1入力でウォームアップしています。');await yieldUi();const start=performance.now();await run(request.rows.slice(0,1));warmupMilliseconds=performance.now()-start;}
    status(format(request.count,0)+'入力を共通処理で実行しています。');await yieldUi();
    const countsBefore={...executor.counts},start=performance.now(),result=request.mode.kind==='battle'?await executeBattleChunks(request,run):await run(request.rows),elapsedMilliseconds=performance.now()-start;
    if(!Array.isArray(result.rows)||result.rows.length!==request.count)throw Error('実行結果の入力数が一致しません。');
    if(request.mode.kind==='battle'&&result.programHash!==undefined&&result.programHash!==assets.commonProgramHash)throw Error('実行した共通プログラムのハッシュが公開定義と異なります。');
    return{...result,backend,initializationMilliseconds,warmupMilliseconds,elapsedMilliseconds,graphExecutionCounts:Object.fromEntries(Object.keys(executor.counts).map(key=>[key,executor.counts[key]-countsBefore[key]])),explicitOrtModels:[...executor.explicitOrtModels],explicitCpuModels:[...executor.explicitCpuModels],executedModelProviders:Object.fromEntries(executor.executedModelProviders),gpuAdapterInfo:executor.gpuAdapterInfo,implicitCpuFallback:false,seedFiltering:false};
  }finally{await executor.release();}
}

function compareResults(a,b){
  let compared=0,differences=0;const examples=[];
  const fail=(path,want,got)=>{differences++;if(examples.length<20)examples.push({path,reference:want,actual:got});};
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
  visit(a.rows,b.rows,'rows');if(a.traces!==undefined||b.traces!==undefined)visit(a.traces,b.traces,'traces');
  return{compared,differences,examples,referenceBackend:a.backend,actualBackend:b.backend,exactNumericEquality:true,independentRomVerification:false,sharedOrtModels:b.explicitOrtModels,explicitCpuModels:b.explicitCpuModels};
}
function cell(row,text,mono=false){const element=document.createElement('td');element.textContent=String(text??'—');if(mono)element.className='mono';row.append(element);}
function actorSummary(row){
  if(!Array.isArray(row.actors))return'—';
  const hp=assets.actorFields.indexOf('hp'),mp=assets.actorFields.indexOf('mp');
  if(row.actors.length&&typeof row.actors[0]==='number'){
    const width=assets.actorFields.length;if(!width||hp<0||mp<0)return JSON.stringify(row.actors);
    return Array.from({length:row.actors.length/width},(_,i)=>`${i}: HP ${row.actors[i*width+hp]} / MP ${row.actors[i*width+mp]}`).join(' | ');
  }
  return row.actors.map(actor=>`${actor.actorId??actor.id}: HP ${actor.actor?.[hp]??actor.hp??'?'} / MP ${actor.actor?.[mp]??actor.mp??'?'}${actor.dead?' 死亡':''}`).join(' | ');
}
const finalValue=(row,name)=>row[name]??row['next'+name[0].toUpperCase()+name.slice(1)];
function outcome(row){
  if(row.stoppedBeforeExecution)return'停止により未実行';
  const value=row.outcome??row.result??row.reason??row.status;
  if(typeof value==='string')return value;
  if(row.budgetExhausted)return'予算到達・継続中';
  if(row.unresolvedEffects?.length||row.unsupported||row.supported===false)return'未実装の処理あり';
  if(row.finished===false||row.complete===false)return'継続中'+(value===undefined?'':`（結果コード ${value}）`);
  return value===undefined?'詳細を参照':JSON.stringify(value);
}
function render(request,result,comparison,other){
  const attempted=result.attemptedInputs??request.count,completed=result.completedInputs;
  $('count').textContent=format(attempted,0)+' / '+format(request.count,0);$('elapsed').textContent=format(result.elapsedMilliseconds)+' ms';
  const rate=(result.newlyCompletedInputs??completed??attempted)*1000/result.elapsedMilliseconds,rateText=rate>0&&rate<.001?rate.toExponential(2):format(rate,rate<1?3:rate<100?1:0);
  $('rate').textContent=completed===undefined||completed===request.count?rateText+' 入力/s':'未完了のため未算定';$('differences').textContent=comparison?format(comparison.differences,0):'未照合';
  $('input-progress').textContent=completed===undefined?'単体検査 '+format(attempted,0)+'入力':`指定範囲を完了 ${format(completed,0)}${result.retainedInputs?'（前回完了の保持 '+format(result.retainedInputs,0)+'）':''} ／ 未実装 ${format(result.unsupportedInputs,0)} ／ 遷移予算到達 ${format(result.transitionBudgetInputs,0)} ／ 停止 ${format(result.stoppedInputs,0)}（うち未実行 ${format(result.unstartedInputs,0)}）`;
  $('timings').textContent='初期化 '+format(result.initializationMilliseconds)+' ms ／ ウォームアップ '+format(result.warmupMilliseconds)+' ms'+(other?' ／ ORT実行 '+format(other.elapsedMilliseconds)+' ms':'');
  const adapter=result.gpuAdapterInfo,adapterLabel=adapter?[adapter.vendor,adapter.architecture,adapter.device,adapter.description].filter(Boolean).join(' / '):'';
  $('device').textContent=result.backend==='onnxruntime-wasm'?'ONNX Runtime Web '+assets.ortVersion+' / WASM / 1スレッド':result.backend==='onnxruntime-webgpu'?'ONNX Runtime Web '+assets.ortVersion+' / WebGPU'+(adapterLabel?' / '+adapterLabel:'')+(adapter?.isFallbackAdapter?' / ソフトウェアGPU（実機GPUの速度ではありません）':'')+(result.explicitCpuModels.length?' / 明示CPU '+result.explicitCpuModels.length+'モデル':''):'検証用スカラーWASM'+(result.explicitOrtModels.length?' ＋ 明示ORT併用 '+result.explicitOrtModels.length+'モデル':'');
  $('rows').replaceChildren();
  result.rows.slice(0,32).forEach((row,lane)=>{
    const tr=document.createElement('tr'),seed=finalValue(row,'seed');
    cell(tr,request.seeds[lane],true);cell(tr,seed?.length===8?seedHex(seed):'—',true);cell(tr,scalar(finalValue(row,'position')));cell(tr,actorSummary(row));cell(tr,JSON.stringify(finalValue(row,'combo')??finalValue(row,'nowstate')??finalValue(row,'nowState')??'—'));cell(tr,outcome(row));$('rows').append(tr);
  });
  const issues={complete:result.complete??null,wholeBattleComplete:result.wholeBattleComplete??null,numericOnly:result.numericOnly??null,budgetExhausted:result.budgetExhausted??null,userStopped:result.userStopped??false,unstartedInputs:result.unstartedInputs??0,unresolvedEffects:result.unresolvedEffects??[],reason:result.reason??null,unresolvedRows:result.rows.map((row,lane)=>({lane,supported:row.supported,unsupported:row.unsupported,unresolvedEffects:row.unresolvedEffects,budgetExhausted:row.budgetExhausted,stoppedBeforeExecution:row.stoppedBeforeExecution,stopReason:row.stopReason,reason:row.reason})).filter(row=>row.supported===false||row.unsupported||row.unresolvedEffects?.length||row.budgetExhausted||row.stoppedBeforeExecution||row.reason)};
  $('issues').textContent=stringify(issues);$('trace-output').textContent=stringify({turnHistory:result.rows.map((row,lane)=>({lane,nowstate:row.nowstate??row.trace??row.history??null})),cameraHistory:result.rows.map((row,lane)=>({lane,projection:row.camera?.projection??null,projectionComplete:row.camera?.projectionComplete??null,wholeCameraComplete:row.camera?.wholeCameraComplete??null,frameSummary:row.camera?.frameSummary??null,nextCommandInputRequired:row.camera?.nextCommandInputRequired??null,commandMenuComplete:row.camera?.commandMenuComplete??null})),graphTraces:result.traces??null});
  const functional=result.rows.some(row=>row.camera?.mode==='functional-frame');
  $('scope-result').textContent=request.mode.kind!=='battle'?'単体検査です。共通戦闘全体の完了は判定していません。':request.boundary==='numeric-turn'?'保持した状態でコマンド入力の境界を確定し、次の数値ターンを実行しました。次の演出開始前で停止し、カメラ・メッセージ・リソース状態と新しい数値結果を保持しています。':request.boundary==='presentation'?'明示したオーバーレイ再読込・ロード完了イベントから演出を続行しました。再開時は完了済みフレームから進め、数値ターンを再実行しません。次のコマンドは実際の終了状態に到達した場合だけ有効になります。実機のロード時間・描画時間は対象外です。':result.numericOnly?'数値遷移のみ。カメラ乱数は未適用です。completeは指定ターンの数値処理が完了したことを表し、完全な戦闘結果は意味しません。':functional?'入力した静的フォント・リソース状態と機能的フレーム順序を実行しました。完了時の制御状態をframeSummaryに記録します。メニュー、描画装置、実機のフレーム時間はこの範囲に含みません。':result.wholeBattleComplete?'指定された戦闘とカメラ範囲が完了しています。':'カメラ設定を含む実行です。wholeBattleComplete=falseの間は完全な戦闘結果として扱えません。';
  lastResult={schema:'dq9-common-battle-execution-v1',mode:request.mode.id,kind:request.mode.kind,programHash:request.mode.kind==='battle'?assets.commonProgramHash:null,moduleHashes:request.mode.kind==='battle'?Object.fromEntries(assets.commonProgram.modules.map(module=>[module.name,module.sha256])):null,conditions:{startSeed:request.seeds[0],count:request.count,chunkSize:request.chunkSize,maxTurns:request.limit,maxTransitions:request.maxTransitions,maxFrames:request.maxFrames??null,trace:request.trace,warmup:request.warmup,boundary:request.boundary??'turn',continuationFrom:request.continuationFrom??null,commandInputs:request.commandInputs??null,acceptedCommandBoundary:request.acceptedCommandBoundary??null,continuationEvents:request.continuationEvents??null,inputs:request.rows,definitions:request.definitions},result,comparison:comparison??null,comparisonReference:other??null,independentRomVerification:false,seedFiltering:false};
  window.DQ9Release.lastResult=lastResult;
  if(canContinueNumeric())$('next-commands-json').value=stringify(result.rows[0].actors.filter(actor=>actor.actor[assets.actorFields.indexOf('party')]).map(actor=>({actorId:actor.actorId,commands:actor.commands})));
  $('details').textContent=stringify({...lastResult,conditions:{...lastResult.conditions,inputs:'全結果JSONに収録',definitions:request.definitions?'全結果JSONに収録':null}});
  $('result-note').textContent='指定した全'+request.count+'入力と結果を保持し、先頭32件を表示します。停止で未実行の入力は明示し、処理数と速度に含めません。';
}
async function execute(compare=false,continuation=null){
  if(busy)throw Error('すでに実行中です。');
  let request;
  try{request=continuation==='presentation'?readPresentationRequest():continuation==='numeric-turn'?readNextNumericRequest():readRequest();}catch(error){status(String(error.message??error),'bad');throw error;}
  stopRequested=false;controls(true);status('共通モジュールを初期化しています。');
  try{
    let result,comparison,reference;
    if(compare){reference=await executeBackend(request,'onnxruntime-wasm');if(stopRequested){result=reference;reference=undefined;}else{result=await executeBackend(request,$('backend').value==='onnxruntime-webgpu'?'onnxruntime-webgpu':'native-wasm');if(!stopRequested)comparison=compareResults(reference,result);}}
    else result=await executeBackend(request,$('backend').value);
    render(request,result,comparison,reference);
    const unresolved=result.unresolvedEffects?.length||result.rows.some(row=>row.unresolvedEffects?.length||row.unsupported||row.supported===false),budget=result.budgetExhausted||result.rows.some(row=>row.budgetExhausted);
    status(comparison?.differences?'実行器間に不一致があります。':result.userStopped?'停止しました。処理済みの状態と未実行の入力を結果に保持しています。':unresolved?'未実装の効果・制御が結果に記録されています。':budget?'指定予算に達しました。継続中の状態を結果に保持しています。':result.complete===false?'実行を終えました。戦闘は継続中です。':'指定した実行が完了しました。',comparison?.differences||unresolved?'bad':'good');
    return lastResult;
  }catch(error){status(stopRequested?'停止しました。':String(error.message??error),'bad');throw error;}
  finally{controls(false);}
}
function stop(){if(!busy)return;stopRequested=true;$('stop').disabled=true;status('現在のグラフ呼出しが戻った時点で停止します。');}
for(const[kind,label]of [['battle','共通戦闘への入力'],['camera','カメラ単体検査'],['graph','数値グラフ単体検査']]){
  const group=document.createElement('optgroup');group.label=label;
  for(const mode of modes.filter(item=>item.kind===kind)){const option=document.createElement('option');option.value=mode.id;option.textContent=mode.titleJa??mode.id;group.append(option);}
  if(group.children.length)$('mode').append(group);
}
$('inventory').textContent=`共通戦闘プログラム1件 ／ 入力定義${assets.encounters.length}件 ／ 共有モジュール${assets.commonProgram.modules.length}件`;
$('definitions-json').value=stringify(assets.definitions);
$('action-coverage').textContent=stringify(assets.actionCoverage??{});
window.DQ9Release={ready:true,assets,modes,selectMode,loadLocalRom,loadSavedResult,run:()=>execute(false),continueNumeric:()=>execute(false,'numeric-turn'),continuePresentation:()=>execute(false,'presentation'),compare:()=>execute(true),stop,get busy(){return busy;},get localAssetManifest(){return structuredClone(localFrameResources?.assetManifest??null);},lastResult:null};
$('mode').addEventListener('change',()=>selectMode($('mode').value));$('preset').addEventListener('change',applyPreset);$('reset').addEventListener('click',applyPreset);
$('reset-definitions').addEventListener('click',()=>{$('definitions-json').value=stringify(assets.definitions);});
$('run').addEventListener('click',()=>execute(false).catch(()=>{}));$('compare').addEventListener('click',()=>execute(true).catch(()=>{}));$('stop').addEventListener('click',stop);
$('rom-file').addEventListener('change',()=>loadLocalRom($('rom-file').files[0]).catch(()=>{}));
$('next-numeric').addEventListener('click',()=>execute(false,'numeric-turn').catch(()=>{}));
$('continue-presentation').addEventListener('click',()=>execute(false,'presentation').catch(()=>{}));
$('result-file').addEventListener('change',event=>loadSavedResult(event.target.files?.[0]).catch(()=>{}));
$('download').addEventListener('click',()=>{if(!lastResult)return;const url=URL.createObjectURL(new Blob([stringify(lastResult)+'\n'],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='dq9-common-battle-result.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),0);});
if(!modes.length)throw Error('入力定義がありません。');selectMode(modes[0].id);
