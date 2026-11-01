#!/usr/bin/env node
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,basename,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Uses an already installed Playwright and Chromium. Local ORT interception is
// optional and substitutes only the exact pinned distribution for browser QA.
// The published HTML itself always retains its pinned jsDelivr runtime URL.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const require=createRequire(import.meta.url);

export async function verifyHtml({htmlPath=resolve(root,'dist/dq9-battle-emulator.html'),browserPath,
  playwrightDirectory=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,ortDirectory,outputPath,screenshotPath}={}){
  if(!browserPath)throw Error('Supply --browser pointing to an existing Chromium executable. No browser is downloaded.');
  const {chromium}=require(playwrightDirectory?resolve(playwrightDirectory,'playwright'):'playwright');
  const browser=await chromium.launch({executablePath:resolve(browserPath),headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1280,height:1000},acceptDownloads:true});
  const page=await context.newPage(),errors=[],warnings=[],checks=[],runtimeFiles={};
  page.setDefaultTimeout(180000);page.on('pageerror',error=>errors.push({kind:'pageerror',message:error.message}));
  page.on('console',message=>{
    if(message.type()!=='error'&&message.type()!=='warning')return;
    const entry={kind:'console',message:message.text()};
    // ORT routes native stderr to console.error, including explicitly tagged
    // warnings about unused initializers. Preserve their actual severity.
    if(message.type()==='warning'||/\[W:onnxruntime[:\],]/.test(entry.message))warnings.push(entry);else errors.push(entry);
  });
  if(ortDirectory)await context.route('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/*',async route=>{
    const url=new URL(route.request().url()),name=basename(url.pathname);
    if(!['ort.wasm.min.mjs','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'].includes(name)){await route.abort();errors.push({kind:'runtime-path',message:url.href});return;}
    try{
      const bytes=await readFile(resolve(ortDirectory,name));runtimeFiles[name]=hash(bytes);
      await route.fulfill({status:200,contentType:extname(name)==='.wasm'?'application/wasm':'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:bytes});
    }catch(error){await route.abort();errors.push({kind:'runtime-read',message:error.message});}
  });
  const check=(name,passed,detail)=>checks.push({name,passed:!!passed,...(detail===undefined?{}:{detail})});
  let initial,execution,chunked,dataOnlyDefinition,editedDefinition,multiActor,stopped,budget,cameraBoundary,presentation,downloaded,mobile;
  try{
    await page.goto(pathToFileURL(resolve(htmlPath)).href);await page.waitForFunction(()=>window.DQ9Release?.ready===true);
    initial=await page.evaluate(()=>{
      const api=window.DQ9Release,encounters=api.modes.filter(mode=>mode.kind==='battle'),hashes=[],actors=[];
      for(const encounter of encounters){api.selectMode(encounter.id);hashes.push(document.getElementById('program-hash').textContent);actors.push(document.getElementById('input-json').value);}
      const selected=encounters.find(mode=>mode.id==='zilyadama_new_arugo__zilyadama_v6_tamahane')??encounters[0];api.selectMode(selected.id);
      return{programHash:api.assets.commonProgramHash,encounterCount:encounters.length,programCount:api.assets.programs?.length??1,
        sharedHash:hashes.every(value=>value===api.assets.commonProgramHash),differentInputs:new Set(actors).size>1,
        defaultScope:document.getElementById('scope-mode').value,selected:selected.id,ortVersion:api.assets.ortVersion,
        presentationBundled:typeof api.assets.sources['runtime/common-presentation.mjs']==='string',moduleCount:api.assets.commonProgram.modules.length};
    });
    check('all-encounters-share-program-hash',initial.sharedHash,initial.programHash);
    check('encounter-choice-changes-inputs',initial.differentInputs,initial.encounterCount);
    check('numeric-only-is-explicit-default',initial.defaultScope==='numeric-only');
    check('pinned-runtime-version',initial.ortVersion==='1.31.1');
    check('shared-presentation-runtime-is-bundled',initial.presentationBundled,initial.moduleCount);
    execution=await page.evaluate(async()=>{
      document.getElementById('batch').value='4';document.getElementById('chunk').value='4';document.getElementById('limit').value='1';
      document.getElementById('warmup').checked=false;document.getElementById('trace').checked=false;
      document.getElementById('row4').value='[0,1,4294967295,2147483648]';
      const result=await window.DQ9Release.run();
      window.__dq9BrowserReference=structuredClone(result.result.rows);
      return{programHash:result.programHash,backend:result.result.backend,complete:result.result.complete,
        numericOnly:result.result.numericOnly,wholeBattleComplete:result.result.wholeBattleComplete,
        rowCount:result.result.rows.length,graphExecutionCounts:result.result.graphExecutionCounts,
        row4:result.conditions.inputs[0].camera.row4Words,scopeText:document.getElementById('scope-result').textContent,
        renderedRows:document.querySelectorAll('#rows tr').length,downloadEnabled:!document.getElementById('download').disabled,
        states:result.result.rows.map(row=>({seed:row.seed,position:row.position,completedTurns:row.completedTurns,supported:row.supported})),
        unresolvedEffects:result.result.unresolvedEffects};
    });
    check('actual-ort-execution',execution.backend==='onnxruntime-wasm'&&execution.graphExecutionCounts.ortCalls>0&&execution.graphExecutionCounts.nativeCalls===0);
    check('four-seed-batch-is-retained',execution.rowCount===4&&execution.renderedRows===4);
    check('requested-numerical-scope-completed',execution.complete===true,execution.unresolvedEffects);
    check('numerical-scope-does-not-claim-complete-camera',execution.numericOnly===true&&execution.wholeBattleComplete===false&&execution.scopeText.includes('未適用'));
    check('runtime-program-hash-matches-published',execution.programHash===initial.programHash);
    check('row4-is-an-explicit-input',JSON.stringify(execution.row4)==='[0,1,4294967295,2147483648]');
    chunked=await page.evaluate(async()=>{
      document.getElementById('chunk').value='2';
      const record=await window.DQ9Release.run(),result=record.result;
      return{exactRows:JSON.stringify(result.rows)===JSON.stringify(window.__dq9BrowserReference),programHash:record.programHash,
        chunks:result.chunks,attemptedInputs:result.attemptedInputs,completedInputs:result.completedInputs,unstartedInputs:result.unstartedInputs,
        allInputLanesAttempted:result.allInputLanesAttempted,allInputLanesCompleted:result.allInputLanesCompleted,inputHash:result.inputHash};
    });
    check('bounded-batches-retain-exact-all-seed-results',chunked.exactRows&&chunked.chunks.length===2&&chunked.chunks[0].offset===0&&chunked.chunks[1].offset===2&&chunked.attemptedInputs===4&&chunked.completedInputs===4&&chunked.unstartedInputs===0&&chunked.allInputLanesAttempted&&chunked.allInputLanesCompleted&&chunked.programHash===initial.programHash,chunked);
    const downloadPromise=page.waitForEvent('download');await page.locator('#download').click();
    const download=await downloadPromise,content=JSON.parse(await readFile(await download.path(),'utf8'));
    downloaded={filename:download.suggestedFilename(),schema:content.schema,rows:content.result.rows.length,inputs:content.conditions.inputs.length,definitions:!!content.conditions.definitions?.monsters,programHash:content.programHash};
    check('download-retains-all-state-and-inputs',downloaded.rows===4&&downloaded.inputs===4&&downloaded.definitions&&downloaded.programHash===initial.programHash,downloaded);
    dataOnlyDefinition=await page.evaluate(async()=>{
      const input=JSON.parse(document.getElementById('input-json').value),definitions=JSON.parse(document.getElementById('definitions-json').value);
      const actor=input.actors.find(actor=>actor.definitionId!==null),old=actor.definitionId,added=65000;
      definitions.monsters[added]={...definitions.monsters[old],id:added,name:'HTMLで追加した同じ規則の定義'};actor.definitionId=added;
      document.getElementById('input-json').value=JSON.stringify(input);document.getElementById('definitions-json').value=JSON.stringify(definitions);document.getElementById('batch').value='1';
      const record=await window.DQ9Release.run(),expected=structuredClone(window.__dq9BrowserReference[0]);
      expected.actors.find(actor=>actor.definitionId===old).definitionId=added;
      const exactState=JSON.stringify(record.result.rows[0])===JSON.stringify(expected);
      document.getElementById('reset').click();document.getElementById('reset-definitions').click();
      return{exactState,programHash:record.programHash,definitionId:record.result.rows[0].actors.find(actor=>actor.definitionId===added)?.definitionId,complete:record.result.complete,graphCalls:record.result.graphExecutionCounts.ortCalls};
    });
    check('new-monster-definition-runs-without-program-change',dataOnlyDefinition.exactState&&dataOnlyDefinition.complete&&dataOnlyDefinition.definitionId===65000&&dataOnlyDefinition.programHash===initial.programHash&&dataOnlyDefinition.graphCalls>0,dataOnlyDefinition);
    editedDefinition=await page.evaluate(async()=>{
      const input=JSON.parse(document.getElementById('input-json').value),definitions=JSON.parse(document.getElementById('definitions-json').value);
      const enemy=input.actors.find(actor=>actor.definitionId!==null),original=definitions.monsters[enemy.definitionId],added=65001;
      definitions.monsters[added]={...structuredClone(original),id:added,name:'HTMLで追加した単発通常攻撃定義',scheme:3,judgment:0,actions:Array(6).fill(1),limitedSlots:0,extraActionMode:0};
      enemy.definitionId=added;enemy.originalMonsterId=added;
      document.getElementById('input-json').value=JSON.stringify(input);document.getElementById('definitions-json').value=JSON.stringify(definitions);
      const record=await window.DQ9Release.run(),row=record.result.rows[0],actor=row.actors.find(actor=>actor.actorId===enemy.actorId);
      const result={programHash:record.programHash,complete:record.result.complete,definitionId:actor.definitionId,originalMonsterId:actor.originalMonsterId,
        changedTable:JSON.stringify(original.actions)!==JSON.stringify(definitions.monsters[added].actions),changedExtraActionMode:original.extraActionMode!==0,
        commands:row.pendingCommands.filter(command=>command.sourceId===enemy.actorId).map(({sourceId,actionId,targetCount})=>({sourceId,actionId,targetCount})),
        ortCalls:record.result.graphExecutionCounts.ortCalls,unresolvedEffects:record.result.unresolvedEffects};
      document.getElementById('reset').click();document.getElementById('reset-definitions').click();return result;
    });
    check('edited-definition-data-controls-actions-and-count',editedDefinition.complete&&editedDefinition.programHash===initial.programHash&&editedDefinition.definitionId===65001&&editedDefinition.originalMonsterId===65001&&editedDefinition.changedTable&&editedDefinition.changedExtraActionMode&&editedDefinition.commands.length===1&&editedDefinition.commands[0].actionId===1&&editedDefinition.ortCalls>0,editedDefinition);
    multiActor=await page.evaluate(async()=>{
      const input=JSON.parse(document.getElementById('input-json').value),enemy=structuredClone(input.actors.find(actor=>actor.definitionId!==null));
      enemy.actorId=193;enemy.actor[window.DQ9Release.assets.actorFields.indexOf('id')]=193;input.actors.push(enemy);
      document.getElementById('input-json').value=JSON.stringify(input);document.getElementById('batch').value='1';
      const record=await window.DQ9Release.run(),row=record.result.rows[0];
      document.getElementById('reset').click();
      return{programHash:record.programHash,complete:record.result.complete,actors:row.actors.map(actor=>({id:actor.actorId,definitionId:actor.definitionId})),
        supported:row.supported,completedTurns:row.completedTurns,position:row.position,graphCalls:record.result.graphExecutionCounts.ortCalls,unresolvedEffects:record.result.unresolvedEffects};
    });
    check('multiple-enemies-use-common-actor-array',multiActor.programHash===initial.programHash&&multiActor.complete&&multiActor.supported&&multiActor.actors.length===3&&multiActor.actors.some(actor=>actor.id===193)&&multiActor.completedTurns===1&&multiActor.graphCalls>0,multiActor);
    stopped=await page.evaluate(async()=>{
      document.getElementById('batch').value='4';document.getElementById('chunk').value='1';
      const observer=new MutationObserver(()=>{if(/^1 \/ 4入力/.test(document.getElementById('status').textContent)){observer.disconnect();window.DQ9Release.stop();}});
      observer.observe(document.getElementById('status'),{childList:true});
      try{
        const record=await window.DQ9Release.run(),result=record.result;
        return{complete:result.complete,userStopped:result.userStopped,requestedInputs:result.requestedInputs,attemptedInputs:result.attemptedInputs,
          completedInputs:result.completedInputs,unstartedInputs:result.unstartedInputs,rows:result.rows.length,inputs:record.conditions.inputs.length,
          initialStatesRetained:result.rows.slice(1).every((row,i)=>row.stoppedBeforeExecution&&JSON.stringify(row.seed)===JSON.stringify(record.conditions.inputs[i+1].seed)),
          firstComplete:result.rows[0].requestedTurnsComplete,allInputLanesAttempted:result.allInputLanesAttempted,
          status:document.getElementById('status').textContent,rate:document.getElementById('rate').textContent,downloadEnabled:!document.getElementById('download').disabled};
      }finally{observer.disconnect();}
    });
    check('stop-preserves-completed-and-unstarted-inputs',stopped.complete===false&&stopped.userStopped&&stopped.requestedInputs===4&&stopped.attemptedInputs===1&&stopped.completedInputs===1&&stopped.unstartedInputs===3&&stopped.rows===4&&stopped.inputs===4&&stopped.initialStatesRetained&&stopped.firstComplete&&stopped.allInputLanesAttempted===false&&stopped.downloadEnabled,stopped);
    check('stop-does-not-count-unstarted-inputs-as-throughput',stopped.rate.includes('未算定')&&stopped.status.includes('未実行'));
    budget=await page.evaluate(async()=>{
      document.getElementById('transitions').value='1';document.getElementById('batch').value='1';
      const result=await window.DQ9Release.run();return{complete:result.result.complete,budgetExhausted:result.result.budgetExhausted,
        finished:result.result.rows[0].finished,outcome:result.result.rows[0].outcome,status:document.getElementById('status').textContent,
        issues:JSON.parse(document.getElementById('issues').textContent)};
    });
    check('budget-preserves-unfinished-result',budget.complete===false&&budget.budgetExhausted===true&&budget.finished===false&&budget.outcome===0,budget);
    check('budget-is-visible-in-ui',budget.status.includes('予算')&&budget.issues.budgetExhausted===true);
    cameraBoundary=await page.evaluate(async()=>{
      document.getElementById('transitions').value='100000';document.getElementById('scope-mode').value='camera-projection';
      const input=JSON.parse(document.getElementById('input-json').value);input.camera??={};delete input.camera.initial;
      document.getElementById('input-json').value=JSON.stringify(input);
      const record=await window.DQ9Release.run(),result=record.result;
      return{complete:result.complete,wholeBattleComplete:result.wholeBattleComplete,numericOnly:result.numericOnly,unresolvedEffects:result.unresolvedEffects,phase:result.rows[0].phase,cameraMode:record.conditions.inputs[0].camera.mode};
    });
    check('missing-camera-initial-state-is-explicit',cameraBoundary.complete===false&&cameraBoundary.wholeBattleComplete===false&&cameraBoundary.numericOnly===false&&cameraBoundary.cameraMode==='camera-projection'&&cameraBoundary.unresolvedEffects.some(entry=>entry.reason==='presentation'&&entry.details?.some(detail=>detail.reason==='camera-initial-state')),cameraBoundary);
    presentation=await page.evaluate(async()=>{
      window.DQ9Release.selectMode('common-presentation-example');
      document.getElementById('transitions').value='100000';document.getElementById('warmup').checked=false;document.getElementById('trace').checked=false;
      const record=await window.DQ9Release.run(),result=record.result,row=result.rows[0],camera=row.camera;
      return{programHash:record.programHash,scope:document.getElementById('scope-mode').value,complete:result.complete,wholeBattleComplete:result.wholeBattleComplete,numericOnly:result.numericOnly,
        projectionComplete:camera.projectionComplete,wholeCameraComplete:camera.wholeCameraComplete,outerCalls:camera.projection?.outputs?.length??0,commands:camera.projection?.commands,
        initialSeed:record.conditions.inputs[0].seed,finalSeed:row.seed,position:row.position,initialRow4:record.conditions.inputs[0].camera.row4Words,finalRow4:camera.state?.row4Words,
        graphExecutionCounts:result.graphExecutionCounts,unresolvedEffects:result.unresolvedEffects,cameraTraceVisible:document.getElementById('trace-output').textContent.includes('cameraHistory')};
    });
    check('camera-example-uses-same-program',presentation.programHash===initial.programHash&&presentation.scope==='camera-projection');
    check('actual-computed-records-drive-three-camera-calls',presentation.complete===true&&presentation.numericOnly===false&&presentation.projectionComplete===true&&presentation.outerCalls===3&&presentation.graphExecutionCounts.ortCalls>0&&presentation.graphExecutionCounts.nativeCalls===0&&presentation.cameraTraceVisible,presentation);
    check('camera-projection-does-not-claim-whole-battle',presentation.wholeBattleComplete===false&&presentation.wholeCameraComplete===false);
    await page.setViewportSize({width:390,height:844});
    mobile=await page.evaluate(()=>({width:innerWidth,bodyWidth:document.body.scrollWidth,documentWidth:document.documentElement.scrollWidth,runVisible:!!document.getElementById('run').getClientRects().length}));
    check('mobile-layout-does-not-overflow-document',mobile.bodyWidth<=mobile.width&&mobile.documentWidth<=mobile.width&&mobile.runVisible,mobile);
    if(screenshotPath)await page.screenshot({path:resolve(screenshotPath),fullPage:true});
  }catch(error){errors.push({kind:'execution',message:error.message,stack:error.stack});}
  finally{await context.close();await browser.close();}
  const result={schema:'dq9-common-html-verification-v1',passed:checks.every(item=>item.passed)&&errors.length===0,
    htmlPath:resolve(htmlPath),htmlSha256:hash(await readFile(htmlPath)),runtimeSource:ortDirectory?'existing local official distribution, intercepted at the pinned CDN URLs':'pinned CDN',
    runtimeFiles,initial,execution,chunked,dataOnlyDefinition,editedDefinition,multiActor,stopped,budget,cameraBoundary,presentation,downloaded,mobile,checks,errors,warnings,independentRomVerification:false};
  if(outputPath)await writeFile(resolve(outputPath),JSON.stringify(result,null,2)+'\n');return result;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const options={},mapping={'--html':'htmlPath','--browser':'browserPath','--playwright-dir':'playwrightDirectory','--ort-dir':'ortDirectory','--out':'outputPath','--screenshot':'screenshotPath'};
  try{
    const args=process.argv.slice(2);
    for(let i=0;i<args.length;i++){const key=mapping[args[i]];if(!key||!args[i+1]||args[i+1].startsWith('--'))throw Error('Use --html FILE --browser EXISTING_CHROMIUM [--playwright-dir EXISTING_NODE_MODULES] [--ort-dir EXISTING_ORT_DIST] [--out JSON] [--screenshot PNG]');options[key]=args[++i];}
    const result=await verifyHtml(options);console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;
  }catch(error){console.error(error.stack??String(error));process.exitCode=1;}
}
