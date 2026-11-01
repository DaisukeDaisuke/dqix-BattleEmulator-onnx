#!/usr/bin/env node
// Actual public wrapper, actual packaged ONNX modules, and unchanged original
// component observations. No observed endpoint is supplied to the runtime.
import {openAsBlob} from 'node:fs';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {BATTLE_DEFINITIONS,seedBytes} from '../data/common-battle.mjs';
import {COMMON_FUNCTIONAL_FRAME_EXAMPLE} from '../data/common-functional-frame-example.mjs';
import {createCommonBattleRunner} from '../runtime/common-battle.mjs';
import {createCommonFunctionalPresentationRunner,FUNCTIONAL_PRESENTATION_CONTINUATION,PRESENTATION_ENTRY_BOUNDARIES} from '../runtime/common-functional-presentation.mjs';
import {extractCommonPresentationAssets} from '../runtime/common-rom-assets.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';

const args=process.argv.slice(2),option=n=>{const i=args.indexOf(n);return i<0?undefined:args[i+1];},root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=x=>createHash('sha256').update(x).digest('hex'),clone=x=>structuredClone(x),hex=x=>'0x'+[...x].reverse().map(v=>v.toString(16).padStart(2,'0')).join(''),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
if(!option('--source')||!option('--rom'))throw Error('Use --source ORIGINAL_COMPLETE_SECOND_PRESENTATION --rom LOCAL_ROM --ort-dir ORT --out REPORT');
const sourceBytes=await readFile(option('--source')),source=JSON.parse(sourceBytes),original=source.results[Number(option('--case-index')??0)];
if(!source.executionComplete||!source.programUnmodified||source.romSHA256!==BATTLE_DEFINITIONS.romSha256||!original.ok||!original.secondNaturalTurnPresentationComplete)throw Error('A complete unchanged original second presentation is required');
const programPath=resolve(root,'graph-v2/common-battle-program.json'),programBytes=await readFile(programPath),program=JSON.parse(programBytes),models=new Map();
for(const m of program.modules){const onnx=await readFile(resolve(dirname(programPath),m.onnx)),irBytes=await readFile(resolve(dirname(programPath),m.ir)),ir=JSON.parse(irBytes);if(hash(onnx)!==m.sha256)throw Error('Coherent packaged model required: '+m.name);models.set(m.name,{name:m.name,onnx,ir,executionProvider:ir.schema==='dq9-cpu-double-graph-ir-v1'?'wasm-explicit-cpu':undefined});}
console.log(JSON.stringify({stage:'model-snapshot-loaded',fileSHA256:hash(programBytes),modules:models.size}));
const report={schema:'dq9-common-functional-continuation-v1',sourceSHA256:hash(sourceBytes),programFileSHA256:hash(programBytes),moduleHashes:Object.fromEntries(program.modules.map(m=>[m.name,m.sha256])),sourceHashes:Object.fromEntries(await Promise.all(['runtime/common-functional-presentation.mjs','scripts/verify-common-functional-continuation.mjs'].map(async p=>[p,hash(await readFile(resolve(root,p)))]))),fieldsCompared:0,mismatches:0,examples:[],checks:[],componentBoundaries:0,scope:'Public initial input and explicit accepted-command/reloaded-overlay/load-completed events drive the same packaged ONNX modules. A complete original second presentation is compared at actual component boundaries. Stop/resume uses JSON-serialized computed state; no original endpoint enters the runtime. Physical loader/render timing and nonempty animation execution are not claimed.'};
function check(name,passed,detail){report.checks.push({name,passed:!!passed,...detail===undefined?{}:{detail}});}
function compare(key,actual,expected){if(Array.isArray(expected)){if(!Array.isArray(actual)||actual.length!==expected.length){report.mismatches++;if(report.examples.length<30)report.examples.push({key,actualLength:actual?.length,expectedLength:expected.length});return;}expected.forEach((v,i)=>compare(key+'['+i+']',actual[i],v));return;}report.fieldsCompared++;if(actual!==expected){report.mismatches++;if(report.examples.length<30)report.examples.push({key,actual,expected});}}
function compareFrame(key,s,e){
  const want=e.scheduler,actual={mainState:s.mainState,presentationState:s.row.presentationState,commandIndex:s.row.currentActionIndex,scriptFlags:s.row.programFlags3e8,scriptEnabled:+s.message.scriptEnabled,delay:s.scriptDelay,controllerActive:s.message.queue.active,controllerWait:s.message.phase,controllerHoldTimer:s.message.holdTimer,messageWindowActive:+s.message.window.windowActive,messageWindowState:s.message.window.windowState,messageTokenCount:s.message.window.produced,messageTokenIndex:s.message.window.index,cameraInitialized:s.row.cameraGeometry.initialized,cameraReady:s.row.cameraGeometry.camera261,cameraFollowCountdown:s.row.cameraGeometry.globals7[1],seed:hex(s.row.seed)};
  for(const [field,value]of Object.entries(actual))compare(key+'.'+field,value,want[field]);
  compare(key+'.cameraWords',Array.from({length:160},(_,i)=>s.row.cameraU16[2*i]+65536*s.row.cameraU16[2*i+1]),e.outer.cameraWords160);compare(key+'.cameraState',s.row.cameraState,e.outer.cameraState);
  if(e.nestedRow4Words)compare(key+'.row4',s.row.row4Words,e.nestedRow4Words);
  for(const[field,wantField]of[['waitFlagU16','waitFlag'],['eventFlagsU16','eventFlags'],['scriptGlobalU16','scriptGlobal'],['scriptOwnerGlobalU16','scriptOwnerGlobal'],['presentationGlobal48U16','presentationGlobal48']])if(e[wantField]!==undefined)compare(key+'.'+field,s[field][0]+65536*s[field][1],e[wantField]);
  for(const field of['pendingFacingMode','movementTimer'])if(e[field]!==undefined)compare(key+'.'+field,s[field],e[field]);
  if(e.firstCameraFlag!==undefined)compare(key+'.firstCameraFlag',s.row.cameraGeometry.firstCameraFlag,e.firstCameraFlag);
  if(want.scriptCursor!==undefined)compare(key+'.cursorPresent',s.scriptState?.cursorIndex!==undefined&&s.scriptState?.cursorIndex!==null,want.scriptCursor!==0);
  const loader=s.message.loader;if(loader&&want.loaderTasks){compare(key+'.loaderCount',loader.taskCount,want.loaderTaskCount);compare(key+'.loaderScratchBase',loader.scratchBaseU16[0]+65536*loader.scratchBaseU16[1],want.loaderScratchBase);for(const[field,wantField]of[['rightmostAllocationByte','loaderRightmostAllocationByte'],['scratchBytes','loaderScratchCapacity'],['scratchRightArenaUsage','loaderRightArenaUsage']])compare(key+'.'+field,loader[field],want[wantField]);
    for(let i=0;i<want.loaderTasks.length;i++){const task=want.loaderTasks[i],slot=loader.slots[i];for(const[field,value]of Object.entries({id:loader.taskIds[i],statusType:loader.taskStatuses[i]+16*loader.taskTypes[i],outerName:slot?.outerFilename,directory:slot?.directory,length:loader.fileLengthsU16[2*i]+65536*loader.fileLengthsU16[2*i+1],scratchFirstWord:loader.scratchFirstWords[i],scratchNumWords:loader.scratchNumWords[i],dataPointer:loader.scratchNumWords[i]?loader.scratchBaseU16[0]+65536*loader.scratchBaseU16[1]+4*loader.scratchFirstWords[i]:0}))compare(key+'.task'+i+'.'+field,value,task[field]);}
    compare(key+'.primaryTask',s.message.primaryTaskId,want.primaryTextTask);
  }
}
const ort=await loadLocalOrt(option('--ort-dir')),executor=createGraphExecutor({models,ortRuntime:ort}),runGraph=executor.runGraph,getModel=name=>models.get(name)?.ir,resources=await extractCommonPresentationAssets(await openAsBlob(option('--rom')),{includeAnimationArchives:true});
let compareSecond=false,stopRequested=false,interruptAtPresentation=false;const seen=new Set();
const presentation=createCommonFunctionalPresentationRunner({definitions:BATTLE_DEFINITIONS,frameResources:resources,shouldStop:()=>stopRequested,onPhase:async({name,state})=>{
  if(!compareSecond)return;const index=state.frameNumber-state.entryBoundary.previousCompletedFrame;let phaseName,expected;
  if(name==='presentation'&&index===0){phaseName='next_presentation:original_first_frame';expected=original.nextPresentationFirstFrame;}
  else{const prefix={presentation:'second_natural_presentation_frame_',resource:'second_original_background_file_process_','world-camera':'second_original_world_camera_',font:'second_original_font_frame_'}[name];if(prefix&&!(name==='resource'&&index===0)){phaseName=prefix+index;const phase=original.phases.find(p=>p.name===phaseName);if(phase)expected={outer:phase.outerState,scheduler:phase.schedulerState,...phase.schedulerState};}}
  if(expected){const nested=original.secondPresentationNestedStackBoundaries?.find(x=>x.phase===phaseName+':return');if(nested)expected={...expected,nestedRow4Words:nested.row4Words};compareFrame(phaseName,state,expected);seen.add(phaseName);}
  if(interruptAtPresentation&&name==='presentation'){interruptAtPresentation=false;stopRequested=true;}
}});
try{
  const runner=await createCommonBattleRunner({program,definitions:BATTLE_DEFINITIONS,runGraph,getModel,presentationRunner:presentation});report.programHash=runner.programHash;report.runtimeVersion=ort.env.versions.web;
  const input=clone(COMMON_FUNCTIONAL_FRAME_EXAMPLE.inputs),c=original.case;input.seed=seedBytes(c.seed);
  if(c.filesystemManifest){const fs=c.filesystemManifest;if(!fs.initialInputsOnly||fs.sourceROM!==source.romSHA256)throw Error('Original initial filesystem manifest required');const base=Number.parseInt(fs.scratchBase);input.camera.frameInput.resourceLoader={...input.camera.frameInput.resourceLoader,scratchBaseU16:[base%65536,Math.floor(base/65536)],scratchBytes:fs.scratchCapacity};}
  const first=await runner.run({rows:[input],maxTurns:1,maxTransitions:100000}),before=first.rows[0];check('initial-presentation-complete',first.complete&&before.camera.frameState.frameNumber===original.naturalFrames);
  for(const boundary of['turn','numeric-turn']){
    const calls=executor.counts.ortCalls,blocked=boundary==='turn'?await runner.run({rows:[clone(before)],maxTurns:1,maxTransitions:100000}):await runner.runNumericTurn({rows:[clone(before)],maxTransitions:100000}),row=blocked.rows[0];
    check('unaccepted-'+boundary+'-rejected-before-graphs',!blocked.complete&&blocked.graphCalls===0&&executor.counts.ortCalls===calls&&row.unresolvedEffects.some(x=>x.reason==='functional-command-input')&&equal(row.seed,before.seed)&&row.position===before.position&&equal(row.actors,before.actors)&&equal(row.camera,before.camera)&&row.completedTurns===before.completedTurns);
  }
  const beforeJSON=JSON.stringify(before),callsBefore=executor.counts.ortCalls;
  try{await presentation.prepareAcceptedCommand({state:before,boundary:{},runGraph,getModel});check('missing-accepted-event-rejected',false);}catch(error){check('missing-accepted-event-rejected',executor.counts.ortCalls===callsBefore&&JSON.stringify(before)===beforeJSON,error.message);}
  const prepared=await presentation.prepareAcceptedCommand({state:before,boundary:{contract:PRESENTATION_ENTRY_BOUNDARIES.acceptedCommand},runGraph,getModel}),numericInput=prepared.state;
  check('accepted-boundary-preserves-camera-window-seed',prepared.requestTurnBegin&&equal(numericInput.seed,before.seed)&&equal(numericInput.camera.frameState.row.cameraU16,before.camera.frameState.row.cameraU16)&&equal(numericInput.camera.frameState.message,before.camera.frameState.message)&&numericInput.camera.frameState.row.currentActionIndex===0);
  numericInput.actors.find(a=>a.actorId===0).commands=[{actionId:c.secondMenu.actionId,targets:[c.secondMenu.targetId],parameter:c.secondMenu.parameter,targetGroup:0}];
  const numerical=await runner.runNumericTurn({rows:[numericInput],maxTransitions:100000}),numeric=numerical.rows[0];compare('numeric.seed',hex(numeric.seed),original.secondNumericTurnFinal.seed);compare('numeric.position',numeric.position,original.secondNumericTurnFinal.positionFromInitial);check('second-numeric-stops-before-presentation',numerical.complete&&numeric.camera.numericTurnPending&&!numeric.camera.nextNumericTurnReady&&numeric.completedTurns===2);
  const numericJSON=JSON.stringify(numeric),countBeforeMissing=executor.counts.ortCalls;
  try{await presentation.continuePresentation({state:numeric,runGraph,getModel});check('missing-overlay-events-rejected',false);}catch(error){check('missing-overlay-events-rejected',executor.counts.ortCalls===countBeforeMissing&&JSON.stringify(numeric)===numericJSON,error.message);}
  const events={contract:FUNCTIONAL_PRESENTATION_CONTINUATION,overlayReload:{contract:PRESENTATION_ENTRY_BOUNDARIES.overlayReload},loaderCompleted:{contract:PRESENTATION_ENTRY_BOUNDARIES.loadedOverlay}};
  const entered=await presentation.continuePresentation({state:numeric,events,runGraph,getModel,maxFrames:0,maxTransitions:100000});
  check('zero-frame-budget-does-not-imply-completion',entered.budgetExhausted&&entered.state.supported&&!entered.state.camera.nextNumericTurnReady&&entered.state.camera.frameState.entryBoundary.stage==='ready-for-admission'&&entered.state.camera.frameState.frameNumber===before.camera.frameState.frameNumber);
  compareSecond=true;interruptAtPresentation=true;
  const stopped=await presentation.continuePresentation({state:JSON.parse(JSON.stringify(entered.state)),events,runGraph,getModel,maxFrames:300,maxTransitions:100000});
  check('mid-frame-stop-retains-last-complete-frame',stopped.budgetExhausted&&stopped.state.supported&&stopped.graphCalls>0&&equal(stopped.state.camera.frameState,entered.state.camera.frameState)&&equal(stopped.state.seed,entered.state.seed)&&stopped.state.position===entered.state.position&&!stopped.state.camera.nextNumericTurnReady);
  stopRequested=false;
  const eight=await presentation.continuePresentation({state:JSON.parse(JSON.stringify(stopped.state)),events,runGraph,getModel,maxFrames:8,maxTransitions:100000});
  check('eight-frame-budget-retains-computed-progress',eight.budgetExhausted&&eight.state.supported&&eight.state.camera.frameState.frameNumber===before.camera.frameState.frameNumber+8&&!eight.state.camera.nextNumericTurnReady&&eight.state.completedTurns===2);
  const finished=await presentation.continuePresentation({state:JSON.parse(JSON.stringify(eight.state)),events,runGraph,getModel,maxFrames:300,maxTransitions:100000}),row=finished.state;
  check('serialized-resume-reaches-actual-next-command-state',finished.complete&&row.supported&&!row.budgetExhausted&&row.phase==='ready'&&row.requestedTurnsComplete&&row.camera.frameState.mainState===7&&row.camera.nextNumericTurnReady&&!row.camera.numericTurnPending);
  compare('complete.secondFrames',row.camera.frameSummary.presentationFrames,original.secondNaturalFrames);compare('complete.totalFrames',row.camera.frameState.frameNumber,original.naturalFrames+original.secondNaturalFrames);compare('complete.numericTurns',row.completedTurns,2);
  const countBeforeRetained=executor.counts.ortCalls,again=await presentation.continuePresentation({state:JSON.parse(JSON.stringify(row)),runGraph,getModel});check('completed-lane-retained-without-replay',again.retainedComplete&&again.graphCalls===0&&executor.counts.ortCalls===countBeforeRetained&&equal(again.state,row));
  report.componentBoundaries=seen.size;report.summary={initialFrames:original.naturalFrames,secondFrames:row.camera.frameSummary.presentationFrames,totalFrames:row.camera.frameState.frameNumber,finalSeed:hex(row.seed),position:row.position,mainState:row.camera.frameState.mainState,loaderTasks:row.camera.frameState.message.loader?.taskCount,computedNumericTurns:row.completedTurns};
  check('all-original-second-component-boundaries-compared',seen.size===4*original.secondNaturalFrames-1);
}catch(error){report.error={message:error.message,stack:error.stack};}
finally{await executor.release();}
report.passed=report.mismatches===0&&report.checks.every(c=>c.passed)&&!report.error;
if(option('--out'))await writeFile(resolve(option('--out')),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,moduleHashes:undefined},null,2));if(!report.passed)process.exitCode=1;
