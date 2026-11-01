import {fileURLToPath} from 'node:url';
import {Graph} from './graph-builder.mjs';

const directory=new URL('./',import.meta.url),COUNT=16;
const positions=g=>g.constant(Array.from({length:COUNT},(_,i)=>i),'float32',[1,COUNT]);
const s16=(g,x)=>{const u=g.sub(x,g.mul(g.floor(g.mul(x,1/65536)),65536));return g.where(g.ge(u,32768),g.sub(u,65536),u);};
const fields={messageIds:[16,0,65535],targets:[16,-32768,32767],extraSources:[16,-32768,32767],serials:[16,-32768,32767],holds:[16,0,65535],types:[16,0,255],contextsU16:[32,0,65535]};
const domains=Object.fromEntries(Object.entries(fields).map(([k,[width,min,max]])=>[k,{width,min,max,integer:true}]));
const defaults=Object.fromEntries(Object.entries(fields).map(([k,[width]])=>[k,Array(width).fill(0)]));
const inputs=g=>Object.fromEntries(Object.entries(fields).map(([k,[width]])=>[k,g.input(k,['N',width])]));
const suffix=k=>k[0].toUpperCase()+k.slice(1);
const resultFields=(g,values)=>Object.fromEntries(Object.entries(values).map(([k,v])=>[k,g.output(v,'next'+suffix(k))]));

/** Original finite message FIFO. It retains unused tail words after a pop. */
export function buildCommonMessageQueue(){
  const g=new Graph('rom-common-message-queue',{
    inputContractVersion:1,
    authority:[{path:'src/Combat/Overlay_25/func_ov025_021ed380.cpp',jpn:'original message queue push'},{path:'src/Combat/Overlay_25/func_ov025_021ed1f0.cpp',jpn:'original message queue pop'}],
    scope:'Original sixteen-slot message queue push/pop on valid queue counts. All unused tail data are retained; signed16 serial/cursor truncation is explicit. Operation0 is push,1 is pop and2 is original initialization, which preserves the hold-override array. Context pointers use exact u16 limbs. This graph neither formats messages nor invents message completion.',
    defaults:{...defaults,operation:0,active:0,serialCounter:0,cursor:0,messageId:0,target:0,extraSource:-1,hold:0,type:0,contextU16:[0,0]},
    inputDomains:{...domains,operation:{width:1,min:0,max:2,integer:true},active:{width:1,min:0,max:16,integer:true},serialCounter:{width:1,min:-32768,max:32767,integer:true},cursor:{width:1,min:-32768,max:32767,integer:true},messageId:{width:1,min:0,max:65535,integer:true},target:{width:1,min:-32768,max:32767,integer:true},extraSource:{width:1,min:-32768,max:32767,integer:true},hold:{width:1,min:0,max:65535,integer:true},type:{width:1,min:0,max:255,integer:true},contextU16:{width:2,min:0,max:65535,integer:true}}
  });
  const state=inputs(g),op=g.input('operation'),active=g.input('active'),serial=g.input('serialCounter'),cursor=g.input('cursor'),message=g.input('messageId'),target=g.input('target'),source=g.input('extraSource'),hold=g.input('hold'),type=g.input('type'),context=g.input('contextU16',['N',2]);
  const init=g.eq(op,2),push=g.and(g.eq(op,0),g.lt(type,6),g.gt(message,0),g.lt(active,16)),pop=g.and(g.eq(op,1),g.gt(active,0)),nextActive=g.where(init,0,g.where(push,g.add(active,1),g.where(pop,g.sub(active,1),active))),nextSerial=g.where(init,0,g.where(push,s16(g,g.add(g.where(g.eq(serial,32767),0,serial),1)),serial));
  const values={messageIds:message,targets:target,extraSources:source,serials:nextSerial,holds:hold,types:type},pos=positions(g),out={};
  for(const [key,input]of Object.entries(state)){
    if(key==='contextsU16'){
      const pieces=g.split(input,32),newContext=g.split(context,2);
      out[key]=g.cat(pieces.map((v,i)=>g.where(g.and(push,g.eq(active,Math.floor(i/2))),newContext[i%2],g.where(g.and(pop,g.gt(nextActive,Math.floor(i/2))),pieces[Math.min(i+2,31)],v))));
    }else{
      const shifted=g.op('Gather',[input,g.constant(Array.from({length:16},(_,i)=>Math.min(i+1,15)),'int32',[16])],{axis:1},{shape:['N',16]});
      out[key]=g.where(g.and(push,g.eq(pos,active)),values[key],g.where(g.and(pop,g.lt(pos,nextActive)),shifted,input));
    }
  }
  for(const key of Object.keys(out))if(key!=='holds')out[key]=g.where(init,0,out[key]);
  resultFields(g,out);g.output(nextActive,'nextActive');g.output(nextSerial,'nextSerialCounter');g.output(g.where(init,0,g.where(pop,g.max(s16(g,g.sub(cursor,1)),0),cursor)),'nextCursor');g.output(g.where(push,nextSerial,-1),'returnValue');g.output(push,'pushed');g.output(pop,'popped');
  return g;
}

/** The admitted controller init/phase0 show boundary and resource dispatch. */
export function buildCommonMessageController(){
  const g=new Graph('rom-common-message-controller',{
    inputContractVersion:1,
    authority:[{path:'src/Combat/Overlay_25/func_ov025_021ed124.cpp',jpn:'message-controller initialization'},{path:'src/Combat/Overlay_25/func_ov025_021ed634.cpp',jpn:'021edb38'},{path:'src/Combat/Overlay_25/func_ov025_021e9fc4.cpp',jpn:'021ea458'}],
    scope:'Exact scalar transitions for controller initialization, an already executed nonempty original message-show branch, and resource/controller branch selection. Resource bytes must first be read and decoded by the qualified producer. The graph returns requiresPrimaryDecode before enabled can change; a separate decode-commit operation changes it. It never infers readiness from a frame number or queued command count. Queue arrays are separately maintained by rom-common-message-queue.',
    operations:{0:'resource dispatch',1:'controller initialize',2:'nonempty show commit',3:'primary decode commit'},
    defaults:{operation:0,active:0,phase:0,holdTimer:0,defaultHold:750,savedSource:0,contextU16:[0,0],headSerial:0,headContextU16:[0,0],headHold:0,scriptEnabled:false,secondaryReady:false,secondaryTaskPresent:false,secondaryTaskDecoded:false,primaryTaskRead:false,primaryAllocatorPresent:false,primaryDecodeComplete:false,nonemptyTextShown:false},
    inputDomains:{operation:{width:1,min:0,max:3,integer:true},active:{width:1,min:0,max:16,integer:true},phase:{width:1,min:0,max:65535,integer:true},holdTimer:{width:1,min:0,max:65535,integer:true},defaultHold:{width:1,min:0,max:65535,integer:true},savedSource:{width:1,min:-32768,max:32767,integer:true},contextU16:{width:2,min:0,max:65535,integer:true},headSerial:{width:1,min:-32768,max:32767,integer:true},headContextU16:{width:2,min:0,max:65535,integer:true},headHold:{width:1,min:0,max:65535,integer:true}}
  });
  const op=g.input('operation'),active=g.input('active'),phase=g.input('phase'),timer=g.input('holdTimer'),normal=g.input('defaultHold'),saved=g.input('savedSource'),context=g.input('contextU16',['N',2]),headSerial=g.input('headSerial'),headContext=g.input('headContextU16',['N',2]),headHold=g.input('headHold');
  const b={};for(const key of['scriptEnabled','secondaryReady','secondaryTaskPresent','secondaryTaskDecoded','primaryTaskRead','primaryAllocatorPresent','primaryDecodeComplete','nonemptyTextShown'])b[key]=g.input(key,['N',1],'bool');
  const init=g.eq(op,1),show=g.and(g.eq(op,2),b.nonemptyTextShown),dispatch=g.eq(op,0),secondaryReady=g.or(b.secondaryReady,g.and(dispatch,g.or(g.not(b.secondaryTaskPresent),b.secondaryTaskDecoded))),decode=g.and(dispatch,g.not(b.scriptEnabled),b.primaryAllocatorPresent,b.primaryTaskRead),commit=g.and(g.eq(op,3),b.primaryDecodeComplete);
  g.output(g.where(init,0,active),'nextActive');g.output(g.where(init,0,g.where(show,1,phase)),'nextPhase');g.output(g.where(init,0,g.where(show,g.where(g.gt(headHold,0),headHold,normal),timer)),'nextHoldTimer');g.output(g.where(init,750,normal),'nextDefaultHold');g.output(g.where(init,0,g.where(show,headSerial,saved)),'nextSavedSource');g.output(g.where(init,0,g.where(show,headContext,context)),'nextContextU16');
  g.output(g.or(b.scriptEnabled,commit),'nextScriptEnabled');g.output(secondaryReady,'nextSecondaryReady');g.output(g.and(dispatch,b.scriptEnabled,secondaryReady),'requiresController');g.output(decode,'requiresPrimaryDecode');g.output(g.and(dispatch,g.not(b.secondaryReady),b.secondaryTaskPresent,b.secondaryTaskDecoded),'removeSecondaryTask');g.output(show,'clearsNestedRow4Word0');
  return g;
}

/** Start-message selection from the actual common command header/action data. */
export function buildCommonStartMessages(){
  const g=new Graph('rom-common-start-messages',{
    inputContractVersion:1,authority:[{path:'src/Combat/Overlay_25/func_ov025_021ea474.cpp',jpn:'original common start-message producer'}],
    scope:'Exact shared start-message choices from a computed command/header and raw action category. The returned ordered requests must pass through the finite queue, including the original special hold override of the last existing slot. Target override for cover actions is read from the supplied actual source status. The graph does not bypass resource/message processing.',
    defaults:{flagsLow:0,commandPresent:true,actionId:1,actionCategory:0,startMessage:0,extraMessage:0,targetPresent:true,targetId:0,coverSourcePresent:false,coverTargetId:0},
    inputDomains:{flagsLow:{width:1,min:0,max:65535,integer:true},actionId:{width:1,min:0,max:65535,integer:true},actionCategory:{width:1,min:0,max:15,integer:true},startMessage:{width:1,min:0,max:65535,integer:true},extraMessage:{width:1,min:0,max:65535,integer:true},targetId:{width:1,min:-32768,max:32767,integer:true},coverTargetId:{width:1,min:-32768,max:32767,integer:true}}
  });
  const flags=g.input('flagsLow'),present=g.input('commandPresent',['N',1],'bool'),action=g.input('actionId'),category=g.input('actionCategory'),start=g.input('startMessage'),extra=g.input('extraMessage'),targetPresent=g.input('targetPresent',['N',1],'bool'),target=g.input('targetId'),source=g.input('coverSourcePresent',['N',1],'bool'),cover=g.input('coverTargetId');
  const started=g.gt(g.sub(flags,g.mul(g.floor(g.mul(flags,1/2)),2)),0),apply=g.and(g.not(started),present),isCover=g.or(g.eq(action,146),g.eq(action,929)),special=g.and(apply,g.eq(start,250)),additional=g.and(apply,g.or(g.eq(category,2),...[92,103,160,191].map(id=>g.eq(action,id))));
  g.output(g.where(started,flags,g.add(flags,1)),'nextFlagsLow');g.output(g.cat([g.where(apply,start,0),g.where(special,480,0),g.where(additional,extra,0)]),'messageIds');g.output(g.cat([g.mul(start,0),g.where(special,100,0),g.mul(start,0)]),'holds');g.output(g.where(g.and(isCover,source),cover,g.where(targetPresent,target,0)),'selectedTargetId');g.output(special,'overridePreviousHold');g.output(g.where(special,4432,0),'previousHold');g.output(g.where(additional,0,extra),'nextExtraMessage');g.output(apply,'requiresQueueWrites');return g;
}

/** Scalar side effects of actual admitted program/outer initialization. */
export function buildCommonFrameAdmissionState(){
  const g=new Graph('rom-common-presentation-admission-state',{
    inputContractVersion:1,authority:[{path:'src/Combat/Overlay_25/func_ov025_021e8d20.cpp',jpn:'021e91c0'},{path:'src/Combat/Overlay_25/func_ov025_021dc220.cpp',jpn:'021dcb14'}],
    scope:'Additional scalar stores alongside the already executed original common outer/admission graphs. A real program initialization clears event flags/delay/resource state and initializes timeline/feedback; the actual mode helper sets its global camera wait word only when its computed target mode is6. The no-secondary-resource branch is qualified by the original input weapon/resource identifier, not by an observed readiness byte.',
    defaults:{waitFlagU16:[0,0],eventFlagsU16:[0,0],scriptDelay:0,feedbackSelector:0,tailOwnerPresent:false,secondaryReady:false,secondaryResourceIdentifier:0,actionId:1,presentationState:6,programInitialized:true,modeHelperExecuted:true},
    inputDomains:{waitFlagU16:{width:2,min:0,max:65535,integer:true},eventFlagsU16:{width:2,min:0,max:65535,integer:true},scriptDelay:{width:1,min:0,max:65535,integer:true},feedbackSelector:{width:1,min:0,max:65535,integer:true},secondaryResourceIdentifier:{width:1,min:-32768,max:32767,integer:true},actionId:{width:1,min:0,max:65535,integer:true},presentationState:{width:1,min:0,max:255,integer:true}}
  });
  const wait=g.input('waitFlagU16',['N',2]),events=g.input('eventFlagsU16',['N',2]),delay=g.input('scriptDelay'),feedback=g.input('feedbackSelector'),secondaryId=g.input('secondaryResourceIdentifier'),action=g.input('actionId'),state=g.input('presentationState'),owner=g.input('tailOwnerPresent',['N',1],'bool'),secondary=g.input('secondaryReady',['N',1],'bool'),init=g.input('programInitialized',['N',1],'bool'),mode=g.input('modeHelperExecuted',['N',1],'bool');
  g.output(g.where(g.and(mode,g.eq(state,6)),g.constant([1,0],'float32',[1,2]),wait),'nextWaitFlagU16');g.output(g.where(init,0,events),'nextEventFlagsU16');g.output(g.where(init,0,delay),'nextScriptDelay');g.output(g.where(init,255,feedback),'nextFeedbackSelector');g.output(g.gt(g.where(init,g.cast(g.or(g.eq(action,1),g.eq(action,2)),'float32'),g.cast(owner,'float32')),0),'nextTailOwnerPresent');g.output(g.or(secondary,g.and(init,g.le(secondaryId,0))),'nextSecondaryReady');g.output(g.or(g.not(init),g.le(secondaryId,0)),'supported');return g;
}

/** Original delay commit, including the actual quiet audio-engine predicate. */
export function buildCommonPresentationDelayCommit(){
  const g=new Graph('rom-common-presentation-delay-commit',{
    inputContractVersion:1,
    authority:[{path:'src/Combat/Overlay_25/func_ov025_021eb6fc.cpp',jpn:'021ebb84'},{path:'src/Combat/Overlay_0/func_ov000_02163690.cpp',jpn:'02164df4'},{path:'src/Combat/Main/func_0205eaa0.cpp',jpn:'0205fd8c'},{path:'src/Combat/Main/func_0203ac40.cpp',jpn:'0203a698'},{path:'src/Combat/Main/func_020d84ec.cpp',jpn:'020d9e50 literal return0'}],
    scope:'Original shared delay/audio commit. Actual classifier1/2/219/336 and raw action bytes decide whether cue7/8 is requested. In the admitted quiet audio state, original020d9e50 returns0 and sound-global021086a4+0==0 makes0203a698 return without stores or player calls. A live sound engine returns supported=false before state is committed. The existing script bit8 causes the original immediate return for argument0.',
    defaults:{scriptFlagsLow:0,actionId:1,actionRowPresent:true,actionByte9:0,actionWord18U16:[0,0],participantPresent:true,sourceId:0,soundGlobalWordU16:[0,0],argument:0},
    inputDomains:{scriptFlagsLow:{width:1,min:0,max:65535,integer:true},actionId:{width:1,min:0,max:65535,integer:true},actionByte9:{width:1,min:0,max:255,integer:true},actionWord18U16:{width:2,min:0,max:65535,integer:true},sourceId:{width:1,min:0,max:65535,integer:true},soundGlobalWordU16:{width:2,min:0,max:65535,integer:true},argument:{width:1,min:0,max:1,integer:true}}
  });
  const flags=g.input('scriptFlagsLow'),action=g.input('actionId'),present=g.input('actionRowPresent',['N',1],'bool'),byte=g.input('actionByte9'),word=g.split(g.input('actionWord18U16',['N',2]),2),participant=g.input('participantPresent',['N',1],'bool'),source=g.input('sourceId'),sound=g.split(g.input('soundGlobalWordU16',['N',2]),2),argument=g.input('argument');
  const bit8=g.gt(g.sub(g.floor(g.mul(flags,1/8)),g.mul(g.floor(g.mul(flags,1/16)),2)),0),early=g.and(bit8,g.eq(argument,0)),byteCategory=g.sub(byte,g.mul(g.floor(g.mul(byte,1/4)),4)),kind=g.sub(g.floor(g.mul(word[0],1/32)),g.mul(g.floor(g.mul(word[0],1/4096)),128)),category=g.floor(g.mul(word[0],1/4096)),cue=g.and(g.not(early),participant,g.or(g.gt(argument,0),...[1,2,219,336].map(id=>g.eq(action,id)),g.and(present,g.eq(byteCategory,1),g.eq(kind,1),g.not(g.eq(category,2))))),quiet=g.and(...sound.map(v=>g.eq(v,0))),supported=g.or(g.not(cue),quiet),next=g.where(g.and(supported,g.not(early)),g.add(flags,g.where(bit8,0,8)),flags);
  g.output(supported,'supported');g.output(next,'nextScriptFlagsLow');g.output(g.where(cue,g.where(g.le(source,3),7,8),0),'requestedCue');g.output(g.and(cue,quiet),'quietCueExecuted');g.output(early,'returnedEarly');return g;
}

export async function buildCommonMessageControllers(){const reports=[];for(const g of[buildCommonMessageQueue(),buildCommonMessageController(),buildCommonStartMessages(),buildCommonFrameAdmissionState(),buildCommonPresentationDelayCommit()])reports.push(await g.save(directory));return reports.map(({name,nodes,bytes})=>({name,nodes,bytes}));}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildCommonMessageControllers()));
