#!/usr/bin/env node
// The public initial input drives both numeric turns and the first natural
// presentation. Original scene bytes are read only by comparisons below.
import {openAsBlob} from 'node:fs';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {BATTLE_DEFINITIONS,seedBytes} from '../data/common-battle.mjs';
import {COMMON_FUNCTIONAL_FRAME_EXAMPLE} from '../data/common-functional-frame-example.mjs';
import {createCommonBattleRunner} from '../runtime/common-battle.mjs';
import {createCommonFunctionalPresentationRunner} from '../runtime/common-functional-presentation.mjs';
import {createCommonPresentationRunner} from '../runtime/common-presentation.mjs';
import {computedPresentationCommands,createCommonPresentationFrameRunner} from '../runtime/common-presentation-frame.mjs';
import {createCommonPresentationEntryRunner,PRESENTATION_ENTRY_BOUNDARIES} from '../runtime/common-presentation-entry.mjs';
import {extractCommonPresentationAssets} from '../runtime/common-rom-assets.mjs';
import {buildCommonPresentationEntry,buildCommonPresentationEntryControl,buildCommonPresentationEntryGlobals,buildCommonPresentationEntryStack} from '../graph-v2/build-common-presentation-entry.mjs';
import {buildCommonScriptCleanup} from '../graph-v2/build-common-presentation-finish.mjs';
import {buildCommonResourceLoader} from '../graph-v2/build-common-resource-loader.mjs';
import {buildCommonAnimationNode} from '../graph-v2/build-common-animation-node.mjs';
import {buildCommonPresentationResource} from '../graph-v2/build-common-presentation-resource.mjs';
import {buildCommonPresentationNarcStack} from '../graph-v2/build-common-presentation-narc-stack.mjs';
import {buildCommonPresentationAdmissionStack} from '../graph-v2/build-common-presentation-stack-stores.mjs';
import {buildCommonPresentationProgram} from '../graph-v2/build-common-presentation-program.mjs';
import {buildCameraProgramAdmission} from '../graph-v2/build-camera-admission.mjs';
import {buildCommonMessageFormatterStack} from '../graph-v2/build-common-message-stack.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';

const args=process.argv.slice(2),option=n=>{const i=args.indexOf(n);return i<0?undefined:args[i+1];},root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=x=>createHash('sha256').update(x).digest('hex'),clone=x=>structuredClone(x),hex=x=>'0x'+[...x].reverse().map(v=>v.toString(16).padStart(2,'0')).join('');
if(!option('--source')||!option('--rom'))throw Error('Use --source original-next-entry-response.json --rom local-ROM --ort-dir ORT_DIR --out REPORT');
const sourceBytes=await readFile(option('--source')),source=JSON.parse(sourceBytes),programPath=resolve(root,'graph-v2/common-battle-program.json'),programBytes=await readFile(programPath),program=JSON.parse(programBytes),models=new Map();
if(!source.executionComplete||!source.programUnmodified||source.romSHA256!==BATTLE_DEFINITIONS.romSha256)throw Error('Complete unchanged original ROM evidence is required');
for(const m of program.modules){const onnx=await readFile(resolve(dirname(programPath),m.onnx)),ir=JSON.parse(await readFile(resolve(dirname(programPath),m.ir)));if(hash(onnx)!==m.sha256)throw Error('Coherent model closure required: '+m.name);models.set(m.name,{name:m.name,onnx,ir,executionProvider:ir.schema==='dq9-cpu-double-graph-ir-v1'?'wasm-explicit-cpu':undefined});}
const extraHashes={};for(const build of[buildCommonPresentationEntry,buildCommonPresentationEntryControl,buildCommonPresentationEntryGlobals,buildCommonPresentationEntryStack,buildCommonScriptCleanup,buildCommonResourceLoader,buildCommonAnimationNode,buildCommonPresentationResource,buildCommonPresentationNarcStack,buildCommonPresentationAdmissionStack,buildCommonPresentationProgram,buildCameraProgramAdmission,buildCommonMessageFormatterStack]){const g=await build(),sha=hash(g.model()),released=models.get(g.name);if(!released||hash(released.onnx)!==sha)throw Error('Release model differs from its source builder: '+g.name);extraHashes[g.name]=sha;}
const sourceHashes=Object.fromEntries(await Promise.all(['runtime/common-presentation-entry.mjs','runtime/common-presentation-frame.mjs','runtime/common-functional-presentation.mjs','data/common-functional-frame-example.mjs','graph-v2/build-common-presentation-entry.mjs','scripts/verify-common-presentation-retained-entry.mjs'].map(async name=>[name,hash(await readFile(resolve(root,name)))])));
let sourceOverlay=null;try{const bytes=await readFile(resolve(root,'proof-source-manifest.json'));sourceOverlay={sha256:hash(bytes),...JSON.parse(bytes)};}catch(error){if(error.code!=='ENOENT')throw error;}
console.log(JSON.stringify({stage:'model-snapshot-loaded',programHash:hash(programBytes),modules:models.size,entryModels:extraHashes}));
const ort=await loadLocalOrt(option('--ort-dir')),executor=createGraphExecutor({models,ortRuntime:ort}),getModel=name=>models.get(name)?.ir,runGraph=executor.runGraph,frameResources=await extractCommonPresentationAssets(await openAsBlob(option('--rom')),{includeAnimationArchives:true}),presentationRunner=createCommonFunctionalPresentationRunner({definitions:BATTLE_DEFINITIONS,frameResources}),runner=await createCommonBattleRunner({program,definitions:BATTLE_DEFINITIONS,getModel,runGraph,presentationRunner}),entry=await createCommonPresentationEntryRunner({runGraph,getModel}),produce=createCommonPresentationRunner({definitions:BATTLE_DEFINITIONS});
const report={schema:'dq9-common-retained-presentation-entry-v3',sourceSHA256:hash(sourceBytes),romSHA256:source.romSHA256,programHash:runner.programHash,entryModels:extraHashes,sourceHashes,sourceOverlay,runtimeVersion:ort.env.versions.web,fieldsCompared:0,mismatches:0,examples:[],cases:[],scope:'Computed public initial input -> first numeric turn -> natural component frames -> explicit accepted command boundary -> second numeric turn -> computed ordinary/periodic arena -> explicit original overlay reload and completed-loader boundary -> fullframe header -> exact initializer -> retained nested stack -> bounded next functional component frames. Where supplied, the original filesystem manifest changes only initial scratch base/capacity and actual local-ROM files. Every frame compares represented camera, UI, loader, script cursor and correlated stack state at the actual component boundary. Original observations never enter production. A complete second presentation is not yet claimed.'};
function compare(id,key,a,b){if(Array.isArray(b)){if(!Array.isArray(a)||a.length!==b.length){report.mismatches++;if(report.examples.length<80)report.examples.push({id,key,actualLength:a?.length,expectedLength:b.length});return;}b.forEach((v,i)=>compare(id,key+'['+i+']',a[i],v));return;}report.fieldsCompared++;if(a!==b){report.mismatches++;if(report.examples.length<80)report.examples.push({id,key,actual:a,expected:b});}}
function compareInitialized(id,s,expected){
  const raw=Buffer.from(expected.scheduler.sceneHex,'hex'),u=(at,width=1,signed=false)=>width===1?raw.readUInt8(at):width===2?(signed?raw.readInt16LE(at):raw.readUInt16LE(at)):(signed?raw.readInt32LE(at):raw.readUInt32LE(at)),q=0x80c;
  for(const[key,value]of Object.entries({mainState:s.mainState,presentationState:s.row.presentationState,commandIndex:s.row.currentActionIndex,scriptFlags:s.row.programFlags3e8,scriptEnabled:+s.message.scriptEnabled,delay:s.scriptDelay,controllerActive:s.message.queue.active,controllerWait:s.message.phase,controllerHoldTimer:s.message.holdTimer,messageWindowActive:+s.message.window.windowActive,messageWindowState:s.message.window.windowState,messageTokenCount:s.message.window.produced,messageTokenIndex:s.message.window.index,seed:hex(s.row.seed)}))compare(id,key,value,expected.scheduler[key]);
  compare(id,'cameraU16',s.row.cameraU16,Array.from({length:320},(_,i)=>u(0xb94+2*i,2)));compare(id,'cameraState',s.row.cameraState,expected.outer.cameraState);
  compare(id,'markerCount',s.markerCount,u(0x5e2a));compare(id,'markerOrigin',s.markerGeometry.origin,[0,1,2].map(i=>u(0x5ca0+0x164+4*i,4,true)));compare(id,'feedbackSelector',s.feedbackSelector,u(0x224+0x5c8,2));compare(id,'feedbackCount',s.feedbackCount,u(0x224+0x53c));compare(id,'tailOwnerPresent',s.tailOwnerPresent,!!u(0x224+0x224,4));
  compare(id,'sceneBytes',s.sceneBytes,[0x703b,0x703c,0x70ee,0x7937,0x71c4,0x71c8,0x71d8,0x71e8,0x71e9].map(at=>u(at)));compare(id,'sceneShort70ec',s.sceneShort70ec,u(0x70ec,2,true));compare(id,'sceneVector71ccU16',s.sceneVector71ccU16,Array.from({length:6},(_,i)=>u(0x71cc+2*i,2)));
  for(const[key,offset,width,signed]of[['messageIds',0,2,false],['targets',0x20,2,true],['extraSources',0x40,2,true],['serials',0x60,2,true],['holds',0x80,2,false],['types',0xa0,1,false],['contextsU16',0xb0,2,false]])compare(id,'queue.'+key,s.message.queue[key],Array.from({length:key==='contextsU16'?32:16},(_,i)=>u(q+offset+width*i,width,signed)));
  for(const[key,offset,width,signed]of[['active',0x150,1,false],['serialCounter',0x152,2,true],['cursor',0x154,2,true]])compare(id,'queue.'+key,s.message.queue[key],u(q+offset,width,signed));
  compare(id,'contextU16',s.message.contextU16,[u(q+0x158,2),u(q+0x15a,2)]);for(const[key,at,signed]of[['savedSource',0x15c,true],['phase',0x15e,false],['holdTimer',0x160,false],['defaultHold',0x162,false]])compare(id,'message.'+key,s.message[key],u(q+at,2,signed));
  compare(id,'resource4100',s.resource4100U16[0]+65536*s.resource4100U16[1],expected.resource4100);for(const key of['ui17ee','context8e49','battle35'])compare(id,key,s[key],expected[key]);compare(id,'scriptGlobal',s.scriptGlobalU16[0]+65536*s.scriptGlobalU16[1],expected.scriptGlobal);
  const objects=new Map([...s.row.roster,...s.row.lookupObjects??[]].map(a=>[a.id,a]));for(const[index,actorId]of[0,192].entries()){const original=Buffer.from(expected.actorObjectHex[index],'hex'),visual=expected.outer.rows.find(a=>a.id===actorId);compare(id,'actor'+actorId+'.behavior',objects.get(actorId).behaviorBE,original[0xbe]);compare(id,'actor'+actorId+'.previous',s.actors[actorId].behaviorPrevious,original[0xbf]);compare(id,'actor'+actorId+'.preferredTarget',objects.get(actorId).preferredTarget,visual.preferredTarget);}
}
function compareGlobals(id,s,expected){
  for(const[key,field]of[['waitFlagU16','waitFlag'],['eventFlagsU16','eventFlags'],['scriptGlobalU16','scriptGlobal'],['scriptOwnerGlobalU16','scriptOwnerGlobal'],['presentationGlobal48U16','presentationGlobal48']])if(expected[field]!==undefined)compare(id,key,s[key][0]+65536*s[key][1],expected[field]);
  for(const key of['pendingFacingMode','movementTimer'])if(expected[key]!==undefined)compare(id,key,s[key],expected[key]);
  // The old row4Words observer addresses the direct outer-call stack. These
  // composed frames execute at the real nested SP and require its own reading.
  if(expected.nestedRow4Words!==undefined)compare(id,'retainedNestedRow4',s.row.row4Words,expected.nestedRow4Words);
  if(expected.firstCameraFlag!==undefined)compare(id,'firstCameraFlag',s.row.cameraGeometry.firstCameraFlag,expected.firstCameraFlag);
}
function compareFrame(id,s,expected){
  const actual={mainState:s.mainState,presentationState:s.row.presentationState,commandIndex:s.row.currentActionIndex,scriptFlags:s.row.programFlags3e8,scriptEnabled:+s.message.scriptEnabled,delay:s.scriptDelay,controllerActive:s.message.queue.active,controllerWait:s.message.phase,controllerHoldTimer:s.message.holdTimer,messageWindowActive:+s.message.window.windowActive,messageWindowState:s.message.window.windowState,messageTokenCount:s.message.window.produced,messageTokenIndex:s.message.window.index,cameraInitialized:s.row.cameraGeometry.initialized,cameraReady:s.row.cameraGeometry.camera261,cameraFollowCountdown:s.row.cameraGeometry.globals7[1],seed:hex(s.row.seed)};
  for(const [key,value]of Object.entries(actual))compare(id,key,value,expected.scheduler[key]);
  compare(id,'camera160',Array.from({length:160},(_,i)=>s.row.cameraU16[2*i]+65536*s.row.cameraU16[2*i+1]),expected.outer.cameraWords160);compare(id,'cameraState',s.row.cameraState,expected.outer.cameraState);compareGlobals(id,s,expected);
  const raw=Buffer.from(expected.scheduler.sceneHex,'hex');compare(id,'markerCount',s.markerCount,raw.readUInt8(0x5e2a));
  if(s.message.loader&&expected.scheduler.loaderTasks){
    const loader=s.message.loader;compare(id,'loader.count',loader.taskCount,expected.scheduler.loaderTaskCount);
    for(const[key,field]of[['rightmostAllocationByte','loaderRightmostAllocationByte'],['scratchBytes','loaderScratchCapacity'],['scratchRightArenaUsage','loaderRightArenaUsage']])compare(id,'loader.'+key,loader[key],expected.scheduler[field]);
    compare(id,'loader.scratchBase',loader.scratchBaseU16[0]+65536*loader.scratchBaseU16[1],expected.scheduler.loaderScratchBase);
    for(let i=0;i<expected.scheduler.loaderTasks.length;i++){const actual=loader.slots[i],want=expected.scheduler.loaderTasks[i];compare(id,'loader.'+i+'.id',loader.taskIds[i],want.id);compare(id,'loader.'+i+'.statusType',loader.taskStatuses[i]+16*loader.taskTypes[i],want.statusType);compare(id,'loader.'+i+'.outerName',actual?.outerFilename,want.outerName);compare(id,'loader.'+i+'.directory',actual?.directory,want.directory);compare(id,'loader.'+i+'.length',loader.fileLengthsU16[2*i]+65536*loader.fileLengthsU16[2*i+1],want.length);compare(id,'loader.'+i+'.scratchFirstWord',loader.scratchFirstWords[i],want.scratchFirstWord);compare(id,'loader.'+i+'.scratchNumWords',loader.scratchNumWords[i],want.scratchNumWords);compare(id,'loader.'+i+'.dataPointer',loader.scratchNumWords[i]?loader.scratchBaseU16[0]+65536*loader.scratchBaseU16[1]+4*loader.scratchFirstWords[i]:0,want.dataPointer);}
    compare(id,'primaryTextTask',s.message.primaryTaskId,expected.scheduler.primaryTextTask);
  }
  if(expected.scheduler.scriptCursor!==undefined)compare(id,'scriptCursorPresent',s.scriptState?.cursorIndex!==undefined&&s.scriptState?.cursorIndex!==null,expected.scheduler.scriptCursor!==0);
  for(const[key,field]of[['resourceTaskIdU16','resourceTaskId'],['fallbackGlobal8U16','fallbackGlobal8'],['fallbackGlobal10U16','fallbackGlobal10']])if(expected.scheduler[field]!==undefined){const raw=(s[key]??(key==='resourceTaskIdU16'?[65535,65535]:[0,0]));let value=raw[0]+65536*raw[1];if(field==='resourceTaskId'&&value>=0x80000000)value-=0x100000000;compare(id,field,value,expected.scheduler[field]);}
}
try{
  const offset=Number(option('--case-offset')??0);
  for(const original of source.results.slice(offset,offset+Number(option('--max-cases')??source.results.length))){
    if(!original.ok||!original.strictInitializedMemory||!original.nextPresentationFirstFrameComplete||!original.nextPresentationInitializerAfter)throw Error('Complete original retained entry required');
    const c=original.case,id=c.id,start=report.mismatches,input=clone(COMMON_FUNCTIONAL_FRAME_EXAMPLE.inputs);input.seed=seedBytes(c.seed);
    if(c.filesystemManifest){const manifest=c.filesystemManifest;if(!manifest.initialInputsOnly||manifest.sourceROM!==source.romSHA256)throw Error('Original filesystem initial input manifest is required');const address=Number.parseInt(manifest.scratchBase);input.camera.frameInput.resourceLoader={...input.camera.frameInput.resourceLoader,scratchBaseU16:[address%65536,Math.floor(address/65536)],scratchBytes:manifest.scratchCapacity};}
    const first=await runner.run({rows:[input],maxTurns:1,maxTransitions:100000}),presented=first.rows[0];compare(id,'first.complete',first.complete,true);compare(id,'first.frames',presented.camera.frameState.frameNumber,original.naturalFrames);
    const accepted=await entry.acceptCommand({state:presented.camera.frameState,boundary:{contract:PRESENTATION_ENTRY_BOUNDARIES.acceptedCommand}}),continuation=clone(presented);continuation.camera.frameState=accepted.state;continuation.actors.find(a=>a.actorId===0).commands.push({actionId:c.secondMenu.actionId,targets:[c.secondMenu.targetId],parameter:c.secondMenu.parameter,targetGroup:0});
    const second=await runner.runNumericTurn({rows:[continuation],maxTransitions:100000}),numeric=second.rows[0];compare(id,'second.complete',second.complete,true);compare(id,'second.seed',hex(numeric.seed),original.secondNumericTurnFinal.seed);compare(id,'second.position',numeric.position,original.secondNumericTurnFinal.positionFromInitial);
    const handoff=await produce({state:numeric,records:numeric.turnRecords,runGraph,getModel});compare(id,'handoff.complete',handoff.complete,true);compare(id,'handoff.seedPreserved',hex(handoff.seed),hex(numeric.seed));
    const reloaded=await entry.reloadOverlay({state:numeric.camera.frameState,numericState:numeric,event:{contract:PRESENTATION_ENTRY_BOUNDARIES.overlayReload}});compareGlobals(id+'/reload',reloaded.state,original.nextPresentationAfterOriginalOverlayReload);
    const loaded=await entry.loaderCompleted({state:reloaded.state,event:{contract:PRESENTATION_ENTRY_BOUNDARIES.loadedOverlay}}),windowBefore=JSON.stringify(loaded.state.message.window),cameraBefore=JSON.stringify(loaded.state.row.cameraU16),header=await entry.header({state:loaded.state});compare(id,'normalAdmissionSupported',header.normalAdmissionSupported,true);compareGlobals(id+'/header',header.state,original.nextPresentationInitializerBefore);
    const initialized=await entry.initialize({state:header.state,cameraRow:handoff.camera.projectionInitial,commands:computedPresentationCommands(handoff.camera),numericState:numeric,partyTacticsById:{0:c.partyTactic??5}});
    compareInitialized(id,initialized.state,original.nextPresentationInitializerAfter);compareGlobals(id+'/initializer',initialized.state,original.nextPresentationInitializerAfter);compare(id,'windowRetainedExactly',JSON.stringify(initialized.state.message.window),windowBefore);compare(id,'cameraRetainedExactly',JSON.stringify(initialized.state.row.cameraU16),cameraBefore);compare(id,'frameNotYetReady',initialized.readyForFrame,false);compare(id,'fullSceneState',initialized.state.entryProjection.fullSceneState,false);
    const ready=await entry.retainStack({state:initialized.state});compare(id,'stackReady',ready.readyForFrame,true);compare(id,'stackRetainsComputedWords',ready.state.row.nestedRow4U16,initialized.state.row.nestedRow4U16);
    let framesCompared=0,componentsCompared=0;const count=Number(option('--second-frames')??1),frame=await createCommonPresentationFrameRunner({runGraph,runDoubleGraph:runGraph,getModel,onPhase:async({name,state})=>{
      const i=state.frameNumber-ready.state.frameNumber;let expected,phaseName;
      if(name==='presentation'&&i===0){expected=original.nextPresentationFirstFrame;phaseName='next_presentation:original_first_frame';}
      else{phaseName=({presentation:'second_natural_presentation_frame_',resource:'second_original_background_file_process_','world-camera':'second_original_world_camera_',font:'second_original_font_frame_'})[name];if(!phaseName||name==='resource'&&i===0)return;phaseName+=i;const p=original.phases.find(p=>p.name===phaseName);if(!p)return;expected={outer:p.outerState,scheduler:p.schedulerState,...p.schedulerState};}
      const nested=original.secondPresentationNestedStackBoundaries?.find(p=>p.phase===phaseName+':return');if(nested)expected={...expected,nestedRow4Words:nested.row4Words};compareFrame(id+'/'+phaseName,state,expected);componentsCompared++;if(name==='presentation')framesCompared++;
    }});
    // The runtime receives only an explicit failure bound. The observed frame
    // count is used after execution solely to compare actual completion.
    const originalComplete=original.secondNaturalTurnPresentationComplete===true,available=original.secondNaturalFrames??1;
    if(count>available&&!originalComplete)throw Error('Original observation does not cover the requested frame budget');
    const next=await frame.run({state:ready.state,maxFrames:count}),expectedFrames=Math.min(count,available);compare(id,'nextFullframesCompared',framesCompared,expectedFrames);compare(id,'nextComponentFramesExecuted',next.state.frameNumber-ready.state.frameNumber,expectedFrames);
    if(count>=available)compare(id,'nextPresentationComplete',next.complete,originalComplete);
    report.cases.push({id,firstFrames:presented.camera.frameState.frameNumber,nextMenu:c.secondMenu,secondSeed:hex(numeric.seed),secondPosition:numeric.position,projection:initialized.state.entryProjection,frameBudget:count,originalSecondFrames:available,nextFullframesCompared:framesCompared,nextComponentsCompared:componentsCompared,nextComponentFrames:next.state.frameNumber-ready.state.frameNumber,nextPresentationComplete:next.complete,pending:next.pending??null,mismatches:report.mismatches-start});
    console.log(JSON.stringify({stage:'case-complete',...report.cases.at(-1)}));
  }
}finally{await executor.release();}
report.scope=report.scope.replace('A complete second presentation is not yet claimed.','Second-presentation completion is claimed only for cases whose original caller and computed frame controller both reach the terminal boundary within the independent failure budget.');
report.passed=report.mismatches===0;const text=JSON.stringify(report,null,2)+'\n';if(option('--out'))await writeFile(option('--out'),text);console.log(text);if(!report.passed)process.exitCode=1;
