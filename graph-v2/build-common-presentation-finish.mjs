import {fileURLToPath} from 'node:url';
import {Graph} from './graph-builder.mjs';
import {PRESENTATION_FINISH_AUTHORITY} from './common-presentation-finish-authority.mjs';

const directory=new URL('./',import.meta.url);
export const SCENE_FINISH_BYTE_FIELDS=['phase703b','subphase703c','delay70ee','animationReset7937','flag71c4','flag71c8','flag71d8','flag71e8','flag71e9'];
const metadata=(scope,defaults={})=>({inputContractVersion:1,authority:PRESENTATION_FINISH_AUTHORITY,scope,defaults});
const helpers=g=>({
  input:(name,width=1,type='float32')=>g.input(name,['N',width],type),
  ne:(a,b)=>g.not(g.eq(a,b)),
  mod:(x,n)=>g.sub(x,g.mul(g.floor(g.mul(x,1/n)),n)),
  bit:(x,n)=>g.sub(g.floor(g.mul(x,1/n)),g.mul(g.floor(g.mul(x,1/(2*n))),2)),
});

/** Exact scene-completion branches, with an explicit quiet animation boundary. */
export function buildCommonSceneFinish(){
  const g=new Graph('rom-common-scene-finish',metadata(
    'Original JPN021dd238 scene completion. Raw phase, delay, roster actor state, effect-object presence, shared queue counters, controller, timeline and audio fields decide the ordered early returns. The animation loop resets actual playback fields and waits on visible actors with nonzero blend time. Quiet reset admits animationKind0 and absent animation packages; live animation packages and active audio/VRAM cleanup require their own producers. It emits exact scene, actor, party-panel and transient stores plus a camera-cleanup dispatch; it never infers renderer readiness from command counts.',
    {sceneBytes:Array(9).fill(0),sceneShort70ec:-1,sceneVector71ccU16:Array(6).fill(0),actorPresent:Array(12).fill(false),actorBehavior:Array(12).fill(0),actorPreviousBehavior:Array(12).fill(0),actorAnimationKind:Array(12).fill(0),actorFlagsC1:Array(12).fill(0),actorFlagsE0:Array(12).fill(0),actorObjectFlagsU16:Array(24).fill(0),actorAnimationPackagesPresent:Array(12).fill(false),actorBlendTicksU16:Array(24).fill(0),actorPlaybackSpeed:Array(12).fill(4096),actorTargetPlaybackSpeed:Array(12).fill(4096),actorPlaybackWait:Array(12).fill(0),resourceObjectPresent:Array(16).fill(false),sharedQueueCountersU16:[0,0,0,0],controllerActive:0,controllerWait:0,timelineCount:0,audioHandle:-1,audioPending:0,uiOverlayByte:0,uiPendingObjectPresent:false,uiWindowWordsU16:[0,0,0,0],commandPresent:false,participantPresent:false,sourceId:-1,commandFlagsB:0,panelActorIds:[-1,-1,-1,-1],panelFlags:Array(4).fill(0),panelCursor:Array(4).fill(0),panelQueueBytes:Array(32).fill(0),transientBytes:Array(32).fill(0),currentIndex:0,commandCount:1,outcome:0,enabled:true}));
  g.contract.sceneByteFields=SCENE_FINISH_BYTE_FIELDS;
  g.contract.actorOrder='party0..3, enemy192..199; actorPresent is membership in the computed battle roster AND actual GameState object presence';
  g.contract.supportedBoundary='Animation reset uses original behavior0/animationKind0 with no loaded packages; active audio, UI overlay cleanup and callback destruction are not silently skipped.';
  const {input,mod,bit,ne}=helpers(g),scene=g.split(input('sceneBytes',9),9),short=input('sceneShort70ec'),vector=input('sceneVector71ccU16',6);
  const present=g.split(input('actorPresent',12,'bool'),12),behavior=g.split(input('actorBehavior',12),12),previous=g.split(input('actorPreviousBehavior',12),12),kind=g.split(input('actorAnimationKind',12),12),c1=g.split(input('actorFlagsC1',12),12),e0=g.split(input('actorFlagsE0',12),12),flags=g.split(input('actorObjectFlagsU16',24),24),packages=g.split(input('actorAnimationPackagesPresent',12,'bool'),12),blend=g.split(input('actorBlendTicksU16',24),24),speed=g.split(input('actorPlaybackSpeed',12),12),targetSpeed=g.split(input('actorTargetPlaybackSpeed',12),12),speedWait=g.split(input('actorPlaybackWait',12),12);
  const resources=g.split(input('resourceObjectPresent',16,'bool'),16),queue=g.split(input('sharedQueueCountersU16',4),4),controller=input('controllerActive'),controllerWait=input('controllerWait'),timeline=input('timelineCount'),audio=input('audioHandle'),audioPending=input('audioPending');
  const uiOverlay=input('uiOverlayByte'),uiObject=input('uiPendingObjectPresent',1,'bool'),uiWords=input('uiWindowWordsU16',4),command=input('commandPresent',1,'bool'),participant=input('participantPresent',1,'bool'),source=input('sourceId'),headerFlags=input('commandFlagsB');
  const panelIds=g.split(input('panelActorIds',4),4),panelFlags=g.split(input('panelFlags',4),4),panelCursor=g.split(input('panelCursor',4),4),panelQueue=g.split(input('panelQueueBytes',32),32),transient=input('transientBytes',32),index=input('currentIndex'),count=input('commandCount'),outcome=input('outcome'),enabled=input('enabled',1,'bool');
  const phaseOpen=g.eq(scene[0],0),delayOpen=g.eq(scene[2],0),actorsOpen=g.and(...present.map((p,i)=>g.or(g.not(p),g.and(ne(behavior[i],3),ne(behavior[i],4))))),resourcesOpen=g.not(g.or(...resources)),queueOpen=g.and(g.eq(queue[0],queue[2]),g.eq(queue[1],queue[3])),controllerOpen=g.and(g.eq(controller,0),g.eq(controllerWait,0)),timelineOpen=g.eq(timeline,0);
  const beforeAudio=g.and(enabled,phaseOpen,delayOpen,actorsOpen,resourcesOpen,queueOpen,controllerOpen,timelineOpen),audioKnown=g.or(g.lt(audio,0),ne(audioPending,0)),audioOpen=g.lt(audio,0),enterLoop=g.and(beforeAudio,audioOpen);
  const reset=present.map((p,i)=>g.and(enterLoop,p,g.eq(scene[3],0),ne(behavior[i],6))),quietActors=g.and(...reset.map((r,i)=>g.or(g.not(r),g.and(g.not(packages[i]),g.eq(kind[i],0)))));
  const transition=g.or(...present.map((p,i)=>g.and(p,g.eq(bit(flags[2*i],1),0),g.or(ne(blend[2*i],0),ne(blend[2*i+1],0))))),candidate=g.and(enterLoop,g.not(transition));
  const partyPanel=g.and(command,participant,g.eq(bit(headerFlags,4),0),g.ge(source,0),g.le(source,3));
  let found=g.constant(false,'bool');const selected=[];
  for(let i=0;i<4;i++){const match=g.and(partyPanel,g.eq(panelIds[i],source),g.not(found));selected.push(match);found=g.or(found,match);}
  const panelKnown=g.and(...selected.map((p,i)=>g.or(g.not(p),g.and(g.ge(panelCursor[i],0),g.lt(panelCursor[i],8)))));
  const cleanupKnown=g.and(g.eq(uiOverlay,0),g.not(uiObject),panelKnown);
  const supported=g.and(g.or(g.not(beforeAudio),audioKnown),quietActors,g.or(g.not(candidate),cleanupKnown));
  const activeLoop=g.and(enterLoop,supported),complete=g.and(candidate,supported),phaseThree=g.and(enabled,g.eq(scene[0],3));
  const nextScene=[...scene];nextScene[0]=g.where(phaseThree,4,scene[0]);nextScene[1]=g.where(phaseThree,0,scene[1]);nextScene[3]=g.where(activeLoop,g.where(transition,1,0),scene[3]);for(const i of[4,5,6,7,8])nextScene[i]=g.where(complete,0,scene[i]);
  const nextBehavior=[],nextPrevious=[],nextFlags=[],nextSpeed=[],nextTargetSpeed=[],nextSpeedWait=[],resetMask=[];
  for(let i=0;i<12;i++){
    const r=g.and(reset[i],supported),loopActor=g.and(activeLoop,present[i]),setFlag=g.and(r,g.lt(g.floor(g.mul(c1[i],1/16)),7),ne(bit(e0[i],2),0));
    nextBehavior.push(g.where(r,0,behavior[i]));nextPrevious.push(g.where(r,behavior[i],previous[i]));resetMask.push(r);
    nextFlags.push(flags[2*i],g.where(setFlag,g.add(flags[2*i+1],g.mul(g.sub(1,bit(flags[2*i+1],4)),4)),flags[2*i+1]));
    nextSpeed.push(g.where(loopActor,4096,speed[i]));nextTargetSpeed.push(g.where(loopActor,4096,targetSpeed[i]));nextSpeedWait.push(g.where(loopActor,0,speedWait[i]));
  }
  const nextPanelFlags=[],nextPanelQueue=[];
  for(let i=0;i<4;i++){const p=g.and(complete,selected[i]);nextPanelFlags.push(g.where(p,g.add(panelFlags[i],g.mul(g.sub(1,bit(panelFlags[i],2)),2)),panelFlags[i]));for(let j=0;j<8;j++)nextPanelQueue.push(g.where(g.and(p,g.eq(panelCursor[i],j)),0x66,panelQueue[8*i+j]));}
  g.output(g.cat(nextScene),'nextSceneBytes');g.output(g.where(complete,-1,short),'nextSceneShort70ec');g.output(g.where(complete,0,vector),'nextSceneVector71ccU16');
  for(const[name,value]of Object.entries({nextActorBehavior:nextBehavior,nextActorPreviousBehavior:nextPrevious,nextActorObjectFlagsU16:nextFlags,nextActorPlaybackSpeed:nextSpeed,nextActorTargetPlaybackSpeed:nextTargetSpeed,nextActorPlaybackWait:nextSpeedWait,actorResetMask:resetMask,nextPanelFlags,nextPanelQueueBytes:nextPanelQueue}))g.output(g.cat(value),name);
  g.output(g.where(complete,0,uiWords),'nextUiWindowWordsU16');g.output(g.where(complete,0,transient),'nextTransientBytes');
  g.output(g.cast(complete,'float32'),'returnValue');g.output(complete,'requestCameraCleanup');g.output(g.and(complete,g.eq(index,g.sub(count,1)),ne(outcome,0)),'requestTerminalAudioCleanup');
  g.output(supported,'supported');g.output(g.and(enabled,supported,g.not(complete)),'waiting');g.output(activeLoop,'enteredAnimationLoop');return g;
}

/** The original cleanup body, admitting empty external resource producers. */
export function buildCommonScriptCleanup(){
  const g=new Graph('rom-common-script-cleanup',metadata(
    'Original JPN021e99e8 script cleanup with zero pending loader tasks, no temporary effect list/resources/special object200, absent decoration animation packages and no sound player. Task removal calls with an empty loader are exact no-ops; task counters, background task sentinel, resource count, participant flags, lighting fade and script state are updated. Nonempty external producers explicitly reject; the caller must not advance until they are implemented.',
    {taskCount:0,backgroundTask:-1,loaderTaskCount:0,effectListPresent:false,resourceListPresent:false,resourceObjectPresent:Array(16).fill(false),specialObjectPresent:false,decorationPackagesPresent:[false,false],soundPlayerPresent:false,scriptStateU16:[0,0],globalResourceCount:0,actorPresent:Array(12).fill(false),participantMask:Array(12).fill(false),actorObjectFlagsU16:Array(24).fill(0),actorFlagsE0:Array(12).fill(0),lighting:[4096,4096,4096,0,0],enabled:true}));
  const{input,bit,ne}=helpers(g),tasks=input('taskCount'),background=input('backgroundTask'),loader=input('loaderTaskCount'),effects=input('effectListPresent',1,'bool'),resourceList=input('resourceListPresent',1,'bool'),resources=g.split(input('resourceObjectPresent',16,'bool'),16),special=input('specialObjectPresent',1,'bool'),decor=g.split(input('decorationPackagesPresent',2,'bool'),2),sound=input('soundPlayerPresent',1,'bool'),state=input('scriptStateU16',2),resourceCount=input('globalResourceCount'),present=g.split(input('actorPresent',12,'bool'),12),participants=g.split(input('participantMask',12,'bool'),12),flags=g.split(input('actorObjectFlagsU16',24),24),e0=g.split(input('actorFlagsE0',12),12),lighting=g.split(input('lighting',5),5),enabled=input('enabled',1,'bool');
  const quiet=g.and(g.eq(loader,0),g.not(effects),g.not(resourceList),g.not(g.or(...resources)),g.not(special),g.not(g.or(...decor)),g.not(sound),g.ge(tasks,0),g.le(tasks,8)),supported=g.or(g.not(enabled),quiet),active=g.and(enabled,quiet),nextFlags=[],nextE0=[];
  for(let i=0;i<12;i++){const p=g.and(active,present[i],participants[i]);nextFlags.push(g.where(p,g.sub(flags[2*i],g.mul(bit(flags[2*i],2048),2048)),flags[2*i]),flags[2*i+1]);nextE0.push(g.where(p,g.sub(e0[i],g.mul(bit(e0[i],4),4)),e0[i]));}
  const nextLighting=[lighting[0],lighting[0],g.add(g.mul(lighting[0],0),4096),g.where(g.eq(lighting[0],4096),0,1000),g.mul(lighting[0],0)].map((x,i)=>g.where(active,x,lighting[i]));
  g.output(g.where(active,0,tasks),'nextTaskCount');g.output(g.where(g.and(active,g.ge(background,0)),-1,background),'nextBackgroundTask');g.output(g.where(active,0,resourceCount),'nextGlobalResourceCount');g.output(g.where(active,0,state),'nextScriptStateU16');g.output(g.cat(nextFlags),'nextActorObjectFlagsU16');g.output(g.cat(nextE0),'nextActorFlagsE0');g.output(g.cat(nextLighting),'nextLighting');g.output(supported,'supported');g.output(active,'completed');g.output(g.and(enabled,g.not(quiet)),'requiresExternalCleanup');return g;
}

/** Complete roster and scalar turn-cleanup stores. Camera stores stay separate. */
export function buildCommonTurnCleanup(){
  const g=new Graph('rom-common-turn-cleanup',metadata(
    'Original JPN021dc0f4 turn cleanup and exact leaf stores: roster C1 high-nibble1/6 removal, visual+68 reset when the object has a visual pointer, delayed panel fade, resource+4100=1, UI+17ee and scene+e0c/e10 reset. Actor presence comes from the computed roster. Emits the independent camera turn-cleanup dispatch; no numeric turn is authorized by this leaf alone.',
    {actorPresent:Array(12).fill(false),actorFlagsC1:Array(12).fill(0),actorVisualPresent:Array(12).fill(false),actorVisual68U16:Array(24).fill(0),panelFadeActive:0,panelFadeBase:0,panelFadeTimer:0,resource4100U16:[0,0],ui17ee:0,sceneE0c:0,sceneE10U16:[0,0],enabled:true}));
  const{input,mod,ne}=helpers(g),present=g.split(input('actorPresent',12,'bool'),12),c1=g.split(input('actorFlagsC1',12),12),visual=g.split(input('actorVisualPresent',12,'bool'),12),word=g.split(input('actorVisual68U16',24),24),fade=input('panelFadeActive'),base=input('panelFadeBase'),timer=input('panelFadeTimer'),resource=input('resource4100U16',2),ui=input('ui17ee'),sceneByte=input('sceneE0c'),sceneWord=input('sceneE10U16',2),enabled=input('enabled',1,'bool');
  const nextC1=[],nextVisual=[];
  for(let i=0;i<12;i++){const high=g.floor(g.mul(c1[i],1/16)),clear=g.and(enabled,present[i],g.or(g.eq(high,1),g.eq(high,6))),v=g.and(enabled,present[i],visual[i]);nextC1.push(g.where(clear,mod(c1[i],16),c1[i]));nextVisual.push(g.where(v,0,word[2*i]),g.where(v,0,word[2*i+1]));}
  const fadeSum=mod(g.add(base,5),65536),signedFade=g.where(g.ge(fadeSum,32768),g.sub(fadeSum,65536),fadeSum),setFade=g.and(enabled,ne(fade,0),g.eq(timer,0));
  g.output(g.cat(nextC1),'nextActorFlagsC1');g.output(g.cat(nextVisual),'nextActorVisual68U16');g.output(g.where(setFade,signedFade,timer),'nextPanelFadeTimer');g.output(g.where(enabled,g.constant([1,0],'float32',[2]),resource),'nextResource4100U16');g.output(g.where(enabled,0,ui),'nextUi17ee');g.output(g.where(enabled,0,sceneByte),'nextSceneE0c');g.output(g.where(enabled,0,sceneWord),'nextSceneE10U16');g.output(enabled,'requestCameraTurnCleanup');g.output(g.eq(g.cast(enabled,'float32'),g.cast(enabled,'float32')),'supported');g.output(enabled,'completed');return g;
}

/** Called only at the actual end of the original per-frame dispatch. */
export function buildCommonPresentationTail(){
  const g=new Graph('rom-common-presentation-tail',metadata(
    'Original JPN021dbcb4..021dbd30 terminal suffix, reached only after all selected UI/actor/camera/script/presentation/effect handlers in021db91c. Equality compares the actual queue cursor with the actual command count; it is not an external readiness signal. The requested turn cleanup must complete before committing the supplied mainstate7/9/10, presentation-state0, dirty flag1, resource bit800 and speed1000 stores. A middle-of-frame caller must not invoke this leaf.',
    {currentIndex:0,commandCount:1,outcome:0,mainState:8,presentationState:3,stateDirty:0,resourceFlags00U16:[0,0],gameSpeedU16:[4096,0],enabled:true}));
  const{input,bit,ne}=helpers(g),index=input('currentIndex'),count=input('commandCount'),outcome=input('outcome'),main=input('mainState'),presentation=input('presentationState'),dirty=input('stateDirty'),flags=g.split(input('resourceFlags00U16',2),2),speed=input('gameSpeedU16',2),enabled=input('enabled',1,'bool'),terminal=g.and(enabled,g.eq(index,count)),normal=g.and(ne(outcome,1),ne(outcome,2));
  const speedWords=g.split(speed,2);
  g.output(terminal,'requestTurnCleanup');g.output(g.where(terminal,g.where(g.eq(outcome,2),10,g.where(g.eq(outcome,1),9,7)),main),'nextMainState');g.output(g.where(terminal,0,presentation),'nextPresentationState');g.output(g.where(terminal,1,dirty),'nextStateDirty');g.output(g.cat([g.where(g.and(terminal,normal),g.add(flags[0],g.mul(g.sub(1,bit(flags[0],2048)),2048)),flags[0]),flags[1]]),'nextResourceFlags00U16');g.output(g.cat([g.where(terminal,4096,speedWords[0]),speedWords[1]]),'nextGameSpeedU16');g.output(g.and(terminal,normal),'numericTurnStateSelected');g.output(g.eq(g.cast(enabled,'float32'),g.cast(enabled,'float32')),'supported');return g;
}

export async function buildCommonPresentationFinish(){const results=[];for(const g of[buildCommonSceneFinish(),buildCommonScriptCleanup(),buildCommonTurnCleanup(),buildCommonPresentationTail()])results.push(await g.save(directory));return results.map(({name,nodes,bytes})=>({name,nodes,bytes}));}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildCommonPresentationFinish()));
