// Common component-frame orchestration. Every decision and state transition is
// delegated to a shared semantic ONNX module. Asset parsing, pointer lookup and
// structural scatter remain host work. Physical renderer/cartridge timing is
// outside the explicit functional component schedule.
import {createCommonCameraAdmissionRunner,COMMON_CAMERA_ADMISSION_MODELS} from './common-camera-admission.mjs';
import {createCommonCameraFrameRunner,COMMON_CAMERA_FRAME_MODELS} from './common-camera-frame.mjs';
import {createCommonMessageControllerRunner,initialCommonMessageController,COMMON_MESSAGE_MODELS} from './common-message-controller.mjs';
import {parseOriginalStaticFontTables} from './common-message-data.mjs';

const IDS=[0,1,2,3,192,193,194,195,196,197,198,199],clone=x=>structuredClone(x),scalar=(o,k)=>Number(o[k]?.[0]),words=x=>Array.from({length:x.length/2},(_,i)=>x[2*i]+65536*x[2*i+1]),limbs=x=>[x%65536,Math.floor(x/65536)],bool=(o,k)=>!!scalar(o,k),toBytes=x=>typeof x==='string'?Uint8Array.from(x.match(/../g)??[],v=>Number.parseInt(v,16)):Uint8Array.from(x);
export const COMMON_PRESENTATION_FRAME_MODELS=[...new Set([...COMMON_CAMERA_ADMISSION_MODELS,...COMMON_CAMERA_FRAME_MODELS,...COMMON_MESSAGE_MODELS,'rom-common-presentation-admission-state','rom-common-presentation-state6','rom-common-actor-facing','rom-common-presentation-delay-commit','rom-common-empty-script-tick','rom-common-presentation-completion','rom-common-presentation-delay','rom-common-world-camera-dispatch','rom-common-scene-finish','rom-common-script-cleanup','rom-common-turn-cleanup','rom-common-presentation-tail','rom-common-presentation-advance'])];
const requireData=(condition,message)=>{if(!condition)throw Error(message);};
const serializableInput=input=>JSON.parse(JSON.stringify(input,(_,value)=>ArrayBuffer.isView(value)?Array.from(value):value));

/** Scatter only bytes computed by common ordinary/periodic arena modules. */
export function computedPresentationCommands(camera){
  const arena=camera.arena;requireData(arena?.complete&&arena.schema==='dq9-computed-presentation-arena-v1','A complete computed presentation arena is required');
  const rows=[];
  for(const record of arena.records){
    requireData(record.commandBytes.length===40&&record.participantBytes.length===52,'Original command/participant sizes are required');
    const b=Uint8Array.from(record.commandBytes),d=new DataView(b.buffer),p=Uint8Array.from(record.participantBytes),pd=new DataView(p.buffer);
    const targetIds=record.targetIndices.flatMap((index,i)=>index<0?[]:[new DataView(Uint8Array.from(record.targetBytes.slice(36*i,36*i+36)).buffer).getInt16(14,true)]);
    rows[record.commandIndex]={commandIndex:record.commandIndex,actionId:d.getUint16(0,true),sourceId:pd.getUint16(32,true),targetIds,startMessage:d.getUint16(24,true),extraMessage:d.getUint16(34,true),flagsB:b[11],header:Array.from(b),record:clone(record)};
  }
  requireData(rows.length===camera.projectionInitial.commands.length&&rows.every(Boolean),'Computed arena commands must form the actual contiguous command array');
  for(let i=0;i<rows.length;i++){const expected=camera.projectionInitial.commands[i],actual=rows[i];requireData(expected.actionId===actual.actionId&&expected.participants[0]===actual.sourceId&&JSON.stringify(expected.targets)===JSON.stringify(actual.targetIds),'Computed command views disagree at '+i);}
  return rows;
}

/** Initial zero layout is an explicit input ABI, never a recovered endpoint. */
export function commonPresentationFrameInitial(camera,input){
  requireData(input?.contract==='dq9-empty-script-static-font-functional-frame-v1','The explicit functional-frame input contract is required');
  input=serializableInput(input);
  requireData(input.initialLayout==='zero-unless-supplied-v1','Declare the initial mutable zero layout explicitly');
  requireData(camera.projectionInitial&&input.stackAbi?.sameStack,'Computed pre-admission state and original stack ABI are required');
  requireData(camera.projectionInitial.residentPrograms.every(p=>p.codes.length===0),'This frame controller currently admits empty resident animation scripts');
  const row=clone(camera.projectionInitial),extra=input.actors??{},actors={};
  for(const id of IDS){const object=[...row.roster,...row.lookupObjects??[]].find(a=>a.id===id);actors[id]={id,present:!!object&&object.lookupPresent!==false,behaviorPrevious:0,animationKind:0,flagsC1:0,flagsE0:0,blendTicksU16:[0,0],playbackSpeed:0,targetPlaybackSpeed:0,playbackWait:0,animationPackagesPresent:false,inheritedAlpha:0,partyFlags180:0,partyByteC0:0,orientationB0:0,...clone(extra[id]??{})};}
  return{schema:'dq9-common-presentation-frame-state-v1',input:clone(input),row,commands:computedPresentationCommands(camera),actors,message:initialCommonMessageController(),frameNumber:0,firstAdmission:true,admitted:false,mainState:input.mainState??8,stateDirty:0,waitFlagU16:clone(input.waitFlagU16??[0,0]),movementTimer:input.movementTimer??0,markerCount:input.markerCount??0,pendingFacingMode:input.pendingFacingMode??0,scriptDelay:0,eventFlagsU16:clone(input.eventFlagsU16??[0,0]),sceneBytes:clone(input.sceneBytes??Array(9).fill(0)),sceneShort70ec:input.sceneShort70ec??0,sceneVector71ccU16:clone(input.sceneVector71ccU16??Array(6).fill(0)),resourceFlags00U16:clone(input.resourceFlags00U16??[0,0]),gameSpeedU16:[4096,0],lighting:clone(input.lighting??[0,0,0,0,0]),panelFlags:clone(input.panelFlags??[0,0,0,0]),panelCursor:clone(input.panelCursor??[0,0,0,0]),panelQueueBytes:clone(input.panelQueueBytes??Array(32).fill(0)),transientBytes:clone(input.transientBytes??Array(32).fill(0)),resource4100U16:clone(input.resource4100U16??[0,0]),panelFadeTimer:input.panelFadeTimer??0,sceneE0c:input.sceneE0c??0,sceneE10U16:clone(input.sceneE10U16??[0,0]),ui17ee:input.ui17ee??0,outcome:input.outcome??0,complete:false,nextNumericTurnReady:false,scope:'Functional original component ordering with supplied frame deltas, complete input message/static-font bytes, empty resident animation scripts and explicitly qualified quiet rendering/resource state. No physical renderer or device timing claim.'};
}

export async function createCommonPresentationFrameRunner(options){
  const {runGraph,getModel,onTrace,onPhase}=options,admission=await createCommonCameraAdmissionRunner(options),camera=await createCommonCameraFrameRunner(options);
  async function call(name,input){const ir=await getModel(name);if(!ir)throw Error('Missing shared frame model '+name);const values={...ir.contract.defaults,...input},feeds=Object.fromEntries(ir.inputs.map(v=>[v.name,Array.isArray(values[v.name])?values[v.name]:[values[v.name]]]));for(const [key,v]of Object.entries(feeds))if(v.some(x=>x===undefined))throw Error(name+' requires actual input '+key);const out=(await runGraph(name,[feeds]))[0];await onTrace?.({model:name,inputs:[clone(feeds)],outputs:[clone(out)]});return out;}
  const objects=s=>new Map([...s.row.roster,...s.row.lookupObjects??[]].map(o=>[o.id,o]));
  const command=s=>s.commands[s.row.currentActionIndex]??null;
  function rows12(s,key,otherwise=0){const map=objects(s);return IDS.map(id=>map.get(id)?.[key]??s.actors[id]?.[key]??otherwise);}
  function rawAction(s,id){const bytes=s.row.rawActions.map(toBytes).find(b=>(b[4]+256*b[5])%4096===id);requireData(bytes,'Missing original action '+id);return bytes;}
  function actionData(s,c){const raw=rawAction(s,c.actionId),d=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);return{raw,category:d.getUint32(24,true)>>>12&15,state6Category:d.getUint32(20,true)>>>28,definitionId:d.getUint32(4,true)&4095};}
  async function phase(s,name){await onPhase?.({name,frame:s.frameNumber,state:clone(s)});}
  function messageRunner(s){return createCommonMessageControllerRunner({runGraph,getModel,onTrace,fonts:parseOriginalStaticFontTables(s.input.fontTables),assets:s.input.assets,namesById:s.input.namesById,actionNamesById:s.input.actionNamesById});}
  async function admit(s,message){
    const c=command(s);requireData(c,'Admission requires the computed current command');
    const result=await admission.run({row:s.row,firstAdmission:s.firstAdmission,stackAbi:s.input.stackAbi,maxRouteAttempts:s.input.maxRouteAttempts??10861});if(!result.complete)return{pending:result.reason??'Camera admission producer is incomplete'};
    s.row=result.row;s.firstAdmission=false;s.admitted=true;
    // The original outer sets the wait global when it actually admits a camera
    // program. Its exact value is retained by the admitted input-driven output.
    if(!result.result?.states?.[0]?.selectorReached)return{pending:'The alternate no-program outer path needs a frame admission producer'};
    const outer=result.result;
    const initialized=await call('rom-common-presentation-admission-state',{waitFlagU16:s.waitFlagU16,eventFlagsU16:s.eventFlagsU16,scriptDelay:s.scriptDelay,feedbackSelector:s.feedbackSelector??s.input.feedbackSelector??0,tailOwnerPresent:s.tailOwnerPresent??false,secondaryReady:false,secondaryResourceIdentifier:s.input.secondaryResourceIdentifier??0,actionId:c.actionId,presentationState:s.row.presentationState,programInitialized:s.row.selectedProgramIndex>=0,modeHelperExecuted:!!outer.controls?.[0]?.clearParticipantFlag4?.[0]});
    if(!bool(initialized,'supported'))return{pending:'A secondary weapon/skill resource producer is required'};
    s.waitFlagU16=[...initialized.nextWaitFlagU16];s.eventFlagsU16=[...initialized.nextEventFlagsU16];s.scriptDelay=scalar(initialized,'nextScriptDelay');s.feedbackSelector=scalar(initialized,'nextFeedbackSelector');s.tailOwnerPresent=bool(initialized,'nextTailOwnerPresent');
    await message.initialize(s.message,{resourceRequests:s.row.resourceRequests,primaryAllocatorPresent:s.row.selectedProgramIndex>=0});
    s.message.secondaryReady=bool(initialized,'nextSecondaryReady');
    await phase(s,'admission');return{complete:true,outer};
  }
  function actorSceneInput(s){const map=objects(s);return{actorPresent:IDS.map(id=>s.row.roster.some(a=>a.id===id&&a.lookupPresent!==false)),actorBehavior:rows12(s,'behaviorBE'),actorPreviousBehavior:rows12(s,'behaviorPrevious'),actorAnimationKind:rows12(s,'animationKind'),actorFlagsC1:rows12(s,'flagsC1'),actorFlagsE0:rows12(s,'flagsE0'),actorObjectFlagsU16:rows12(s,'objectFlags').flatMap(limbs),actorAnimationPackagesPresent:rows12(s,'animationPackagesPresent',false),actorBlendTicksU16:rows12(s,'blendTicksU16',[0,0]).flat(),actorPlaybackSpeed:rows12(s,'playbackSpeed'),actorTargetPlaybackSpeed:rows12(s,'targetPlaybackSpeed'),actorPlaybackWait:rows12(s,'playbackWait'),actorVisualPresent:IDS.map(id=>!!map.get(id)&&map.get(id).visualPresent!==false),actorVisual68U16:rows12(s,'visual68U16',[0,0]).flat()};}
  function applyActorOutput(s,o){const map=objects(s),fields={nextActorBehavior:'behaviorBE',nextActorPreviousBehavior:'behaviorPrevious',nextActorFlagsC1:'flagsC1',nextActorFlagsE0:'flagsE0',nextActorPlaybackSpeed:'playbackSpeed',nextActorTargetPlaybackSpeed:'targetPlaybackSpeed',nextActorPlaybackWait:'playbackWait'};for(const [key,field]of Object.entries(fields))if(o[key])IDS.forEach((id,i)=>{s.actors[id][field]=o[key][i];if(map.has(id))map.get(id)[field]=o[key][i];});if(o.nextActorObjectFlagsU16)IDS.forEach((id,i)=>{const v=words(o.nextActorObjectFlagsU16.slice(2*i,2*i+2))[0];s.actors[id].objectFlags=v;if(map.has(id))map.get(id).objectFlags=v;});if(o.nextActorVisual68U16)IDS.forEach((id,i)=>s.actors[id].visual68U16=o.nextActorVisual68U16.slice(2*i,2*i+2));}
  async function sceneFinish(s){
    const c=command(s),initial=s.input;
    const o=await call('rom-common-scene-finish',{...actorSceneInput(s),sceneBytes:s.sceneBytes,sceneShort70ec:s.sceneShort70ec,sceneVector71ccU16:s.sceneVector71ccU16,resourceObjectPresent:initial.resourceObjectPresent??Array(16).fill(false),sharedQueueCountersU16:initial.sharedQueueCountersU16??[0,0,0,0],controllerActive:s.message.queue.active,controllerWait:s.message.phase,timelineCount:0,audioHandle:initial.audioHandle??-1,audioPending:initial.audioPending??0,uiOverlayByte:initial.uiOverlayByte??0,uiPendingObjectPresent:initial.uiPendingObjectPresent??false,uiWindowWordsU16:[+s.message.window.windowActive,0,s.message.window.windowState,0],commandPresent:!!c,participantPresent:!!c,sourceId:c?.sourceId??-1,commandFlagsB:c?.flagsB??0,panelActorIds:initial.panelActorIds??[0,0,0,0],panelFlags:s.panelFlags,panelCursor:s.panelCursor,panelQueueBytes:s.panelQueueBytes,transientBytes:s.transientBytes,currentIndex:s.row.currentActionIndex,commandCount:s.commands.length,outcome:s.outcome,enabled:true});
    if(!bool(o,'supported'))return{pending:'Scene cleanup needs an additional animation/audio/UI producer'};
    s.sceneBytes=[...o.nextSceneBytes];s.sceneShort70ec=scalar(o,'nextSceneShort70ec');s.sceneVector71ccU16=[...o.nextSceneVector71ccU16];applyActorOutput(s,o);s.panelFlags=[...o.nextPanelFlags];s.panelQueueBytes=[...o.nextPanelQueueBytes];s.transientBytes=[...o.nextTransientBytes];s.message.window.windowActive=!!o.nextUiWindowWordsU16[0];s.message.window.windowState=o.nextUiWindowWordsU16[2];
    if(!scalar(o,'returnValue'))return{waiting:true};
    if(bool(o,'requestCameraCleanup'))s.row=(await camera.cleanupRows([{...s.row,commandCleanup:true,turnCleanup:false}]))[0];
    const cleanup=await call('rom-common-script-cleanup',{...actorSceneInput(s),taskCount:0,backgroundTask:-1,loaderTaskCount:s.message.primaryTask?1:0,effectListPresent:initial.effectListPresent??false,resourceListPresent:initial.resourceListPresent??false,resourceObjectPresent:initial.resourceObjectPresent??Array(16).fill(false),specialObjectPresent:initial.specialObjectPresent??false,decorationPackagesPresent:initial.decorationPackagesPresent??[false,false],soundPlayerPresent:initial.soundPlayerPresent??false,scriptStateU16:limbs(s.row.programFlags3e8),globalResourceCount:0,participantMask:IDS.map(id=>c?.sourceId===id),lighting:s.lighting,enabled:true});
    if(!bool(cleanup,'completed'))return{pending:'Script cleanup requires its original external-resource producer'};
    s.row.programFlags3e8=words(cleanup.nextScriptStateU16)[0];s.lighting=[...cleanup.nextLighting];applyActorOutput(s,cleanup);
    const advance=await call('rom-common-presentation-advance',{queueCount:s.row.queuedPresentationRecords?.length??0,currentIndex:s.row.currentActionIndex,presentationState:s.row.presentationState,overridePresent:false,enabled:true});
    if(bool(advance,'requiresAuxiliaryProducer'))return{pending:'Auxiliary presentation FIFO producer required'};
    s.row.currentActionIndex=scalar(advance,'nextCurrentIndex');s.row.presentationState=scalar(advance,'nextPresentationState');s.admitted=false;return{complete:true};
  }
  async function tail(s){
    const o=await call('rom-common-presentation-tail',{currentIndex:s.row.currentActionIndex,commandCount:s.commands.length,outcome:s.outcome,mainState:s.mainState,presentationState:s.row.presentationState,stateDirty:s.stateDirty,resourceFlags00U16:s.resourceFlags00U16,gameSpeedU16:s.gameSpeedU16,enabled:true});
    if(!bool(o,'requestTurnCleanup'))return;
    const cleanup=await call('rom-common-turn-cleanup',{...actorSceneInput(s),panelFadeActive:s.input.panelFadeActive??0,panelFadeBase:s.input.panelFadeBase??0,panelFadeTimer:s.panelFadeTimer,resource4100U16:s.resource4100U16,ui17ee:s.ui17ee,sceneE0c:s.sceneE0c,sceneE10U16:s.sceneE10U16,enabled:true});
    requireData(bool(cleanup,'completed'),'Exact turn cleanup did not complete');applyActorOutput(s,cleanup);s.panelFadeTimer=scalar(cleanup,'nextPanelFadeTimer');s.resource4100U16=[...cleanup.nextResource4100U16];s.ui17ee=scalar(cleanup,'nextUi17ee');s.sceneE0c=scalar(cleanup,'nextSceneE0c');s.sceneE10U16=[...cleanup.nextSceneE10U16];
    s.row=(await camera.cleanupRows([{...s.row,commandCleanup:false,turnCleanup:bool(cleanup,'requestCameraTurnCleanup')}]))[0];s.mainState=scalar(o,'nextMainState');s.row.presentationState=scalar(o,'nextPresentationState');s.stateDirty=scalar(o,'nextStateDirty');s.resourceFlags00U16=[...o.nextResourceFlags00U16];s.gameSpeedU16=[...o.nextGameSpeedU16];s.complete=true;s.nextNumericTurnReady=bool(o,'numericTurnStateSelected');
  }
  async function worldCamera(s){
    const row=s.row,g=row.cameraGeometry,map=objects(s),src=map.get(g.sourceId),dst=map.get(g.targetId),pointer=words(row.cameraU16.slice(0x27c/2,0x280/2))[0],base=words(row.commandBaseU16)[0],index=(pointer-base)/40,record=Number.isInteger(index)?s.commands[index]:null;
    const dispatch=await call('rom-common-world-camera-dispatch',{cameraPresent:true,flagsByte:row.cameraU16[0]%256});
    if(scalar(dispatch,'selectedRoute')!==8)return{pending:'An alternate world camera component must execute'};
    const input={...row,worldDispatchStackAbi:s.input.worldDispatchStackAbi,nestedRow4U16:row.nestedRow4U16,sourcePosition:src?.position??[0,0,0],targetPosition:dst?.position??[0,0,0],sourceHeight:src?.height??0,targetHeight:dst?.height??0,sourcePresent:!!src&&src.lookupPresent!==false,targetPresent:!!dst&&dst.lookupPresent!==false,recordPresent:!!record,recordFirstU16:record?.actionId??0,fadeObjectPresent:IDS.map(id=>!!s.actors[id].present),fadeObjectVisible:IDS.map(id=>(map.get(id)?.objectFlags??s.actors[id].objectFlags??0)%2===0),fadeInheritedAlpha:IDS.map(id=>s.actors[id].inheritedAlpha)};
    const result=await camera.runRows([input]);if(!result.complete)return{pending:result.reason};s.row=result.states[0];s.row.row4Words=words(s.row.nestedRow4U16);const ng=s.row.cameraGeometry;s.row.cameraState=[ng.counter,ng.globals7[0],ng.globals7[1],ng.globals7[3],ng.globals7[4]];s.row.cameraInitialized=!!ng.initialized;return{complete:true};
  }
  async function commitDelay(s,c,a){
    const data=new DataView(a.raw.buffer,a.raw.byteOffset,a.raw.byteLength),out=await call('rom-common-presentation-delay-commit',{scriptFlagsLow:s.row.programFlags3e8%65536,actionId:c.actionId,actionRowPresent:true,actionByte9:a.raw[9],actionWord18U16:[data.getUint16(24,true),data.getUint16(26,true)],participantPresent:true,sourceId:c.sourceId,soundGlobalWordU16:s.input.soundGlobalWordU16??[0,0],argument:0});
    if(!bool(out,'supported'))return{pending:'The original sound engine is live and requires its cue producer'};
    s.row.programFlags3e8=Math.floor(s.row.programFlags3e8/65536)*65536+scalar(out,'nextScriptFlagsLow');return{complete:true};
  }
  async function gate(s,message,deltaU16){
    const c=command(s),map=objects(s),source=map.get(c.sourceId),target=map.get(c.targetIds[0]),a=actionData(s,c),targets=c.targetIds.map(id=>map.get(id)),tExtra=s.actors[c.targetIds[0]],g=s.row.cameraGeometry;
    const o=await call('rom-common-presentation-state6',{scriptEnabled:s.message.scriptEnabled,presentationState:s.row.presentationState,waitFlagU16:s.waitFlagU16,cameraInitialized:g.initialized,cameraReadyByte:g.camera261,actionId:c.actionId,actionRowPresent:true,actionRowCategory:a.state6Category,actionRowDefinitionId:a.definitionId,participantPresent:true,firstTargetPresent:c.targetIds.length>0,sourceId:c.sourceId,targetId:c.targetIds[0]??0,battleType:s.row.battleType,markerCount:s.markerCount,sourceXYZ:source?.position??[0,0,0],targetXYZ:target?.position??[0,0,0],sourceRadius:source?.radius??0,sourceObjectPresent:!!source,targetObjectPresent:!!target,targetFlags6cLow16:(target?.objectFlags??0)%65536,targetBehaviorC1:tExtra?.flagsC1??0,targetDescriptorPresent:!!target&&target.visualPresent!==false,targetDescriptorFlagsLow16:(target?.visualFlags??0)%65536,targetPartyStatePresent:!!target&&target.partyStatePresent!==false,targetPartyFlags180Low16:tExtra?.partyFlags180??0,targetPartyByteC0:tExtra?.partyByteC0??0,pendingFacingMode:s.pendingFacingMode,movementTimer:s.movementTimer,deltaU16,targetsPresent:Array.from({length:12},(_,i)=>!!targets[i]),targetsDescriptorPresent:Array.from({length:12},(_,i)=>!!targets[i]&&targets[i].visualPresent!==false),targetsFlagsLow16:Array.from({length:12},(_,i)=>(targets[i]?.visualFlags??0)%65536)});
    if(!bool(o,'supported'))return{pending:'State6 gate requires an additional action/object producer'};
    if(bool(o,'requestImmediateFace')||bool(o,'requestPendingFace')){
      const extra=s.actors[target.id],face=await call('rom-common-actor-facing',{selfId:target.id,sourceId:source?.id??c.sourceId,sourceObjectPresent:!!source,selfPosition:target.position,sourcePosition:source?.position??[0,0,0],rotationY:target.rotation[1],orientationAE:target.orientationAE,animationB0:extra.orientationB0,behaviorBE:target.behaviorBE,flagsC4:target.flagsC4%65536,objectFlagsU16:limbs(target.objectFlags),modelPresent:extra.modelPresent??false,animationPackageListPresent:extra.animationPackagesPresent,descriptorPresent:target.visualPresent!==false,pendingFacingTarget:target.pendingFacingTarget,pendingRequest:bool(o,'requestPendingFace'),immediateRequest:bool(o,'requestImmediateFace')});
      if(!bool(face,'supported'))return{pending:'The original turn-animation package requires its own producer'};
      target.rotation[1]=scalar(face,'nextRotationY');target.orientationAE=scalar(face,'nextOrientationAE');target.flagsC4=Math.floor(target.flagsC4/65536)*65536+scalar(face,'nextFlagsC4');target.pendingFacingTarget=scalar(face,'nextPendingFacingTarget');
    }
    if(bool(o,'queueStartMessages')){const started=await message.start(s.message,{scriptFlags:s.row.programFlags3e8,command:c,rawAction:a.raw,coverSourcePresent:!!source,coverTargetId:s.actors[c.sourceId].coverTargetId??0});s.row.programFlags3e8=started.scriptFlags;}
    if(bool(o,'delayCommit')){
      const commit=await commitDelay(s,c,a);if(!commit.complete)return commit;
    }
    if(bool(o,'setDelay750'))s.scriptDelay=750;
    s.row.presentationState=scalar(o,'nextPresentationState');s.waitFlagU16=[...o.nextWaitFlagU16];s.movementTimer=scalar(o,'nextMovementTimer');s.markerCount=scalar(o,'nextMarkerCount');
    if(bool(o,'markerCountWritten'))s.markerGeometry={origin:[...o.markerOrigin],direction:[...o.markerDirection],count:scalar(o,'nextMarkerCount')};return{complete:true};
  }
  async function presentation(s,message,deltaU16){
    if(s.row.presentationState===1){const result=await admit(s,message);if(result.pending)return result;}
    const messageResult=await message.dispatch(s.message,{command:command(s),deltaU16,stackAbi:s.input.worldDispatchStackAbi});if(messageResult.pending)return messageResult;
    if(messageResult.clearsNestedRow4Word0){s.row.nestedRow4U16[0]=0;s.row.nestedRow4U16[1]=0;s.row.row4Words=words(s.row.nestedRow4U16);}
    if(s.row.presentationState===6){const result=await gate(s,message,deltaU16);if(result.pending)return result;}
    if(s.row.presentationState===3){
      const delay=await call('rom-common-presentation-delay',{delay:s.scriptDelay,deltaU16,scriptEnabled:s.message.scriptEnabled,enabled:true});s.scriptDelay=scalar(delay,'nextDelay');if(bool(delay,'requiresDelayCommit')){const c=command(s),result=await commitDelay(s,c,actionData(s,c));if(!result.complete)return result;}
      const current=command(s),action=actionData(s,current),scriptBase=words(s.input.stackAbi.sceneBaseU16)[0]+0x224;
      const tick=await call('rom-common-empty-script-tick',{scriptBaseU16:limbs(scriptBase),scriptEnabled:s.message.scriptEnabled,delayReturned:bool(delay,'returnedForDelay'),cursorPresent:false,scriptFlagsLow:s.row.programFlags3e8%65536,resourceStates:s.input.scriptResourceStates??[0,0,0,0],feedbackSelector:s.feedbackSelector??s.input.feedbackSelector??0,feedbackCount:s.input.feedbackCount??0,timelinePointersPresent:s.input.timelinePointersPresent??Array(12).fill(false),timelineExtraByte:s.input.timelineExtraByte??0,tailOwnerPresent:s.tailOwnerPresent??false,actionRecordPresent:true,actionCategory:action.category,eventFlagsU16:s.eventFlagsU16,enabled:true});
      if(!bool(tick,'supported'))return{pending:'Empty-script update needs an additional resource/feedback/timeline producer'};s.eventFlagsU16=[...tick.nextEventFlagsU16];s.scriptOwnerGlobalU16=[...tick.scriptOwnerGlobalU16];
      const done=await call('rom-common-presentation-completion',{cursorPresent:false,controllerActive:s.message.queue.active,controllerWait:s.message.phase,timelineCount:0});
      if(bool(done,'scriptComplete')){const finished=await sceneFinish(s);if(finished.pending)return finished;}
    }
    await tail(s);return{complete:true};
  }
  async function step(s,{deltaTicks=s.input.deltaTicks,ticks=s.input.frameTicks}={}){
    requireData(Number.isInteger(deltaTicks)&&deltaTicks>=0&&deltaTicks<=0xffffffff&&Number.isInteger(ticks)&&ticks>=0&&ticks<=0xffffffff,'Explicit unsigned frame delta/ticks are required');
    const message=messageRunner(s);if(!s.admitted&&s.firstAdmission){const r=await admit(s,message);if(r.pending)return r;}
    message.processResource(s.message);await phase(s,'resource');
    if(s.message.window.windowActive)await message.consume(s.message,{ticks});await phase(s,'ui');
    const r=await presentation(s,message,limbs(deltaTicks));if(r.pending)return r;await phase(s,'presentation');
    const c=await worldCamera(s);if(c.pending)return c;await phase(s,'world-camera');
    await message.produceFonts(s.message,{argument:s.input.fontCallsPerFrame??16,ticks});await phase(s,'font');s.frameNumber++;return{complete:true};
  }
  async function run({camera:inputCamera,frameInput,state,maxFrames=256,frames,shouldStop=()=>false}={}){
    let s=state?clone(state):commonPresentationFrameInitial(inputCamera,frameInput);requireData(Number.isInteger(maxFrames)&&maxFrames>=0,'A finite frame budget is required');
    for(let i=0;i<maxFrames&&!s.complete;i++){
      if(shouldStop())return{complete:false,state:s,budgetExhausted:true,reason:'User stopped between complete component frames',nextNumericTurnReady:false};
      const before=clone(s);let result;
      try{result=await step(s,frames?.[i]);}catch(error){if(error?.code==='DQ9_PRESENTATION_BOUNDARY')return{complete:false,state:before,pending:error.message,nextNumericTurnReady:false};if(error?.code!=='DQ9_BUDGET')throw error;return{complete:false,state:before,budgetExhausted:true,reason:error.message,nextNumericTurnReady:false};}
      if(result.pending)return{complete:false,state:before,pending:result.pending,nextNumericTurnReady:false};
    }
    return{complete:s.complete,state:s,budgetExhausted:!s.complete,reason:s.complete?undefined:'Component frame budget exhausted',nextNumericTurnReady:s.complete&&s.nextNumericTurnReady,wholePhysicalWorldComplete:false,scope:s.scope};
  }
  return{run,step,models:COMMON_PRESENTATION_FRAME_MODELS};
}
