import {fileURLToPath} from 'node:url';
import {Graph} from './graph-builder.mjs';

const directory=new URL('./',import.meta.url);
const authority=(name,sha256,jpn)=>({path:`src/Combat/Overlay_25/func_ov025_${name}.cpp`,sha256,jpn});

/** Exact leaf predicates. Their truth is not a natural frame-completion proof. */
export function buildCommonPresentationCompletion(){
  const g=new Graph('rom-common-presentation-completion',{
    inputContractVersion:1,
    authority:[
      authority('021e9528','e7d966ad9ffe9907f4caf485006e84e633290354121cc46008b7beb132b87e34','021e99b8'),
      authority('021ed2f4','ec35e7c73d35b4bf2efa0b1394e94b5803ed525be7c9dd2ef51a55b136d5bc23','021ed7f8'),
      authority('021ed0fc','eb50389293869e4428df0e5e24a4348c8871b411a5281771e40e787d1cf2c416','021ed57c')
    ],
    scope:'Exact script, controller and timeline completion leaf predicates. These do not execute script update, wait for asynchronous resource work, finalize a scene, remove effects, advance commands or authorize a next numeric turn. The full caller invokes the scheduler only after its presentation-state gate.',
    defaults:{cursorPresent:false,controllerActive:0,controllerWait:0,timelineCount:0},
    inputDomains:{controllerActive:{width:1,min:0,max:255,integer:true},controllerWait:{width:1,min:0,max:65535,integer:true},timelineCount:{width:1,min:0,max:255,integer:true}}
  });
  const cursor=g.input('cursorPresent',['N',1],'bool'),active=g.input('controllerActive'),wait=g.input('controllerWait'),count=g.input('timelineCount');
  const controllerComplete=g.and(g.eq(active,0),g.eq(wait,0));
  g.output(controllerComplete,'controllerComplete');
  g.output(g.and(g.not(cursor),controllerComplete),'scriptComplete');
  g.output(g.eq(count,0),'timelineComplete');
  return g;
}

/** Exact timer prefix of script update, stopping before the sound/event helper. */
export function buildCommonPresentationDelay(){
  const g=new Graph('rom-common-presentation-delay',{
    inputContractVersion:1,
    authority:[authority('021e9778','9467787abf897a1f9f8283779dbd6ee6e710c0340c1eeffb7092ae937866b110','021e9c0c')],
    scope:'Exact unsigned16 delay subtraction against unsigned32 GameState effective delta time, carried as two u16 limbs. Expiry requests the original delay-commit helper021ebb84 before the enabled/resource checks. No expiry side effects or asynchronous resource completion are inferred. A caller must dispatch the requested helper before continuing.',
    defaults:{delay:0,deltaU16:[17,0],scriptEnabled:false,enabled:true},
    inputDomains:{delay:{width:1,min:0,max:65535,integer:true},deltaU16:{width:2,min:0,max:65535,integer:true}},
    feedback:{delay:'nextDelay'}
  });
  const delay=g.input('delay'),delta=g.split(g.input('deltaU16',['N',2]),2),scriptEnabled=g.input('scriptEnabled',['N',1],'bool'),enabled=g.input('enabled',['N',1],'bool');
  const pending=g.and(enabled,g.gt(delay,0)),wait=g.and(pending,g.eq(delta[1],0),g.lt(delta[0],delay)),expired=g.and(pending,g.not(wait));
  g.output(g.where(pending,g.where(wait,g.sub(delay,delta[0]),0),delay),'nextDelay');
  g.output(wait,'returnedForDelay');
  g.output(expired,'requiresDelayCommit');
  g.output(g.and(enabled,g.not(wait),scriptEnabled),'enabledAfterDelay');
  return g;
}

/** The original camera readiness getter returns its byte, not a timeout guess. */
export function buildCommonCameraReadiness(){
  const g=new Graph('rom-common-camera-readiness',{
    inputContractVersion:1,
    authority:[{path:'src/Combat/Overlay_0/func_ov000_0216f0bc.cpp',sha256:'b249a25e978e5758f65809c1db161deb1797c90dff372109bf12098b523c7901',jpn:'021707e8'}],
    scope:'Complete original readiness getter: uninitialized cameras return1, otherwise return the current completion byte. The byte must be produced by the original camera update or its verified graph. This helper never advances time or produces completion.',
    defaults:{initialized:0,completionByte:0},inputDomains:{initialized:{width:1,min:0,max:255,integer:true},completionByte:{width:1,min:0,max:255,integer:true}}
  });
  const initialized=g.input('initialized'),completion=g.input('completionByte'),value=g.where(g.eq(initialized,0),1,completion);
  g.output(value,'returnByte');g.output(g.gt(value,0),'ready');return g;
}

/** Exact original world-frame choice; the selected update remains mandatory. */
export function buildCommonWorldCameraDispatch(){
  const g=new Graph('rom-common-world-camera-dispatch',{
    inputContractVersion:1,
    authority:[{path:'src/Combat/Overlay_17/func_ov017_0218cbd4.cpp',sha256:'229b02c6797dc7453922faa33071d87cb2c9d3a511bdfe6040f360e3512efdbd',jpn:'0218d97c..0218d9d0'},
      {path:'src/Combat/Main/func_020100bc.cpp',sha256:'32736ef2c5918069c3120faffcd898149a15347a75be0e565f7f7b615eb1c61a',jpn:'0200ff18'},
      {path:'src/Combat/Main/func_0202e09c.cpp',sha256:'8b73ec49115ac4feb85fa006e70168a110f1c9fbb9eadcd4cbc265bed85db173',jpn:'0202dc0c'}],
    scope:'Exact original world camera dispatch from0218d97c to a selected callee entry or no-call join0218d9d0. Current camera flags have priority4, then8, then16. Only the low byte affects this decision. The selected full update must execute; this graph does not perform it, execute the rest of the world frame, or authorize a numeric turn.',
    defaults:{cameraPresent:true,flagsByte:8},inputDomains:{flagsByte:{width:1,min:0,max:255,integer:true}},routes:{0:'no-call',4:'020a3e50',8:'0216eb90',16:'0204af90'}
  });
  const present=g.input('cameraPresent',['N',1],'bool'),flags=g.input('flagsByte'),bit=mask=>g.gt(g.sub(g.floor(g.mul(flags,1/mask)),g.mul(g.floor(g.mul(flags,1/(mask*2))),2)),0);
  const route=g.where(present,g.where(bit(4),4,g.where(bit(8),8,g.where(bit(16),16,0))),0);
  g.output(route,'selectedRoute');g.output(g.eq(route,8),'requiresBattleCameraUpdate');return g;
}

/** Exact message-controller wait branch, including the external window gate. */
export function buildCommonPresentationControllerWait(){
  const g=new Graph('rom-common-presentation-controller-wait',{
    inputContractVersion:1,
    authority:[authority('021ed634','1efca1299008898ca0467444c3d686efbd90651ffa77f9c0678c7d7454967410','021edb38')],
    scope:'Exact phase1 wait branch of the original message controller. It subtracts the unsigned32 effective delta only when the command exists and the actual message-window state is0. Expiry clears phase, hold timer, saved source and context pointer. Phase0 active messages require original formatting/queue processing before these outputs may be committed. No message-window completion is inferred.',
    defaults:{active:0,phase:1,commandPresent:true,messageWindowIdle:false,holdTimer:750,deltaU16:[17,0],savedSource:-1234,contextU16:[0x6600,0x0236]},
    inputDomains:{active:{width:1,min:0,max:255,integer:true},phase:{width:1,min:0,max:65535,integer:true},holdTimer:{width:1,min:0,max:65535,integer:true},deltaU16:{width:2,min:0,max:65535,integer:true},savedSource:{width:1,min:-32768,max:32767,integer:true},contextU16:{width:2,min:0,max:65535,integer:true}},
    feedback:{phase:'nextPhase',holdTimer:'nextHoldTimer',savedSource:'nextSavedSource',contextU16:'nextContextU16'}
  });
  const active=g.input('active'),phase=g.input('phase'),present=g.input('commandPresent',['N',1],'bool'),idle=g.input('messageWindowIdle',['N',1],'bool'),timer=g.input('holdTimer'),delta=g.split(g.input('deltaU16',['N',2]),2),source=g.input('savedSource'),context=g.input('contextU16',['N',2]);
  const applies=g.and(present,g.eq(phase,1),idle),waiting=g.and(g.eq(delta[1],0),g.lt(delta[0],timer)),expired=g.and(applies,g.not(waiting));
  const processing=g.and(present,g.eq(phase,0),g.gt(active,0));
  g.output(g.where(applies,g.where(waiting,g.sub(timer,delta[0]),0),timer),'nextHoldTimer');
  g.output(g.where(expired,0,phase),'nextPhase');g.output(g.where(expired,0,source),'nextSavedSource');g.output(g.where(expired,0,context),'nextContextU16');
  g.output(processing,'requiresMessageProcessing');g.output(g.not(processing),'waitBranchSupported');return g;
}

/** Complete empty-script body under explicit original producer-state gates. */
export function buildCommonEmptyScriptTick(){
  const g=new Graph('rom-common-empty-script-tick',{
    inputContractVersion:2,
    authority:[authority('021e9778','9467787abf897a1f9f8283779dbd6ee6e710c0340c1eeffb7092ae937866b110','021e9c0c'),{path:'src/Combat/Overlay_25/func_ov025_021eb46c.cpp',jpn:'021eb8f4'},{path:'src/Combat/Overlay_25/func_ov025_021eb204.cpp',jpn:'021eb68c'},{path:'src/Combat/Overlay_25/func_ov025_021e9b2c.cpp',jpn:'021e9fc0'},{path:'src/Combat/Overlay_25/func_ov025_021ebb90.cpp',jpn:'021ec018'},{path:'src/Combat/Overlay_25/func_ov025_021e9a94.cpp',jpn:'021e9f28'}],
    scope:'Original script update after its separately executed delay prefix. The admitted empty-script path checks actual resource-job bytes, archive flag, all12 timeline pointers, feedback/tail state and optional extra-effect conditions. It writes the actual script-owner global and clears event bits4/8 only when the enabled body executes. Missing resource/script/animation producers return supported=false; no completion is inferred from cursor alone.',
    defaults:{scriptBaseU16:[0x224,0x237],scriptEnabled:false,delayReturned:false,actorResourceReturned:false,cursorPresent:false,scriptFlagsLow:0,resourceStates:[0,0,0,0],feedbackSelector:0,feedbackCount:0,timelinePointersPresent:Array(12).fill(false),timelineExtraByte:0,tailOwnerPresent:false,actionRecordPresent:false,actionCategory:0,eventFlagsU16:[0,0],enabled:true},
    inputDomains:{scriptBaseU16:{width:2,min:0,max:65535,integer:true},scriptFlagsLow:{width:1,min:0,max:65535,integer:true},resourceStates:{width:4,min:0,max:255,integer:true},feedbackSelector:{width:1,min:0,max:65535,integer:true},feedbackCount:{width:1,min:0,max:255,integer:true},timelineExtraByte:{width:1,min:0,max:255,integer:true},actionCategory:{width:1,min:0,max:15,integer:true},eventFlagsU16:{width:2,min:0,max:65535,integer:true}}
  });
  const script=g.input('scriptBaseU16',['N',2]),flags=g.input('scriptFlagsLow'),resource=g.split(g.input('resourceStates',['N',4]),4),selector=g.input('feedbackSelector'),count=g.input('feedbackCount'),timeline=g.split(g.input('timelinePointersPresent',['N',12],'bool'),12),extra=g.input('timelineExtraByte'),category=g.input('actionCategory'),event=g.split(g.input('eventFlagsU16',['N',2]),2);
  const b={};for(const key of['scriptEnabled','delayReturned','actorResourceReturned','cursorPresent','tailOwnerPresent','actionRecordPresent','enabled'])b[key]=g.input(key,['N',1],'bool');
  const bit=(x,n)=>g.gt(g.sub(g.floor(g.mul(x,1/n)),g.mul(g.floor(g.mul(x,1/(2*n))),2)),0),body=g.and(b.enabled,b.scriptEnabled,g.not(b.delayReturned),g.not(b.actorResourceReturned));
  const quiet=g.and(g.not(b.cursorPresent),g.not(bit(flags,2)),...resource.map(x=>g.eq(x,0)),g.not(bit(event[0],8)),g.not(bit(flags,16)),g.or(g.ge(selector,255),g.eq(count,0)),...timeline.map(x=>g.not(x)),g.eq(extra,0),g.or(g.not(b.tailOwnerPresent),g.and(g.not(bit(event[0],1)),g.not(bit(event[0],2)))),g.or(g.not(b.actionRecordPresent),g.not(g.eq(category,2)),g.not(bit(event[0],512)),bit(event[0],1024)));
  const execute=g.and(body,quiet),clear=g.sub(g.sub(event[0],g.mul(g.cast(bit(event[0],4),'float32'),4)),g.mul(g.cast(bit(event[0],8),'float32'),8));
  g.output(g.or(g.not(body),quiet),'supported');g.output(execute,'bodyExecuted');g.output(g.cat([g.where(execute,clear,event[0]),event[1]]),'nextEventFlagsU16');g.output(script,'scriptOwnerGlobalU16');return g;
}

export async function buildCommonPresentationScheduler(){
  const reports=[];
  for(const graph of[buildCommonPresentationCompletion(),buildCommonPresentationDelay(),buildCommonCameraReadiness(),buildCommonWorldCameraDispatch(),buildCommonPresentationControllerWait(),buildCommonEmptyScriptTick()])reports.push(await graph.save(directory));
  return reports.map(({name,nodes,bytes})=>({name,nodes,bytes}));
}

if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildCommonPresentationScheduler()));
