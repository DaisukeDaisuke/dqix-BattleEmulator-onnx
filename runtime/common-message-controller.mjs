// Structural orchestration for the shared ONNX message state machines.
// Original asset bytes and names are input data. No observed frame/output is used.
import {compileStaticMessage,parseOriginalMessageCatalog} from './common-message-data.mjs';
import {createCommonMessageWindowRunner,initialCommonMessageWindow} from './common-message-window.mjs';
import {createCommonResourceLoaderRunner,initialCommonResourceLoader} from './common-resource-loader.mjs';

export const COMMON_MESSAGE_MODELS=['rom-common-message-queue','rom-common-message-controller','rom-common-message-formatter-stack','rom-common-start-messages','rom-common-message-window-begin','rom-common-message-font-step','rom-common-message-consume-step','rom-common-presentation-controller-wait'];
const clone=x=>structuredClone(x),scalar=(o,k)=>Number(o[k][0]),suffix=k=>k[0].toUpperCase()+k.slice(1);
const queueFields=['messageIds','targets','extraSources','serials','holds','types','contextsU16'];
const words=(n)=>[n%65536,Math.floor(n/65536)];
const toBytes=x=>x instanceof Uint8Array?x:typeof x==='string'?Uint8Array.from(x.match(/../g)??[],s=>Number.parseInt(s,16)):Uint8Array.from(x??[]);

export function initialCommonMessageController({resourceLoader}={}){
  return{queue:{messageIds:Array(16).fill(0),targets:Array(16).fill(0),extraSources:Array(16).fill(0),serials:Array(16).fill(0),holds:Array(16).fill(0),types:Array(16).fill(0),contextsU16:Array(32).fill(0),active:0,serialCounter:0,cursor:0},phase:0,holdTimer:0,defaultHold:750,savedSource:0,contextU16:[0,0],scriptEnabled:false,secondaryReady:false,secondaryTaskPresent:false,secondaryTaskDecoded:false,primaryAllocatorPresent:false,primaryTaskId:-1,primaryTask:null,loader:resourceLoader?initialCommonResourceLoader(resourceLoader):null,catalog:null,window:initialCommonMessageWindow()};
}

export function createCommonMessageControllerRunner({runGraph,getModel,fonts,assets,namesById={},actionNamesById={},onTrace}={}){
  const window=createCommonMessageWindowRunner({runGraph,fonts,onTrace});
  const loader=createCommonResourceLoaderRunner({runGraph,getModel,assets,onTrace});
  async function call(name,input){const model=await getModel(name),values={...model.contract.defaults,...input},feeds=Object.fromEntries(model.inputs.map(d=>[d.name,Array.isArray(values[d.name])?values[d.name]:[values[d.name]]])),out=(await runGraph(name,[feeds]))[0];await onTrace?.({name,feeds:clone(feeds),result:clone(out)});return out;}
  async function queue(state,operation,request={}){
    const q=state.queue,o=await call('rom-common-message-queue',{...q,operation,...request});
    state.queue={...Object.fromEntries(queueFields.map(k=>[k,[...o['next'+suffix(k)]]])),active:scalar(o,'nextActive'),serialCounter:scalar(o,'nextSerialCounter'),cursor:scalar(o,'nextCursor')};return o;
  }
  async function control(state,operation,input={}){
    const o=await call('rom-common-message-controller',{...state,active:state.queue.active,primaryTaskRead:!!state.primaryTask?.readComplete,operation,...input});
    for(const k of['phase','holdTimer','defaultHold','savedSource'])state[k]=scalar(o,'next'+suffix(k));state.contextU16=[...o.nextContextU16];state.queue.active=scalar(o,'nextActive');state.scriptEnabled=!!scalar(o,'nextScriptEnabled');state.secondaryReady=!!scalar(o,'nextSecondaryReady');return o;
  }
  function substitutions(text,command,head){
    const ascii=String.fromCharCode(...text),out={},source=head.extraSource<0?command.sourceId:head.extraSource;
    const named={ACTER:[namesById,source],TARGET:[namesById,head.target],ACTION:[actionNamesById,command.actionId]};
    for(const [key,[map,id]]of Object.entries(named))if(ascii.includes('['+key+']')){if(!Object.hasOwn(map,String(id)))throw Error(`Original ${key} name bytes for ID${id} are required`);out[key]=toBytes(map[String(id)]);}
    if(ascii.includes('[VAL]'))throw Error('This message needs the exact impact-value formatter producer');
    for(const key of['SEL','REFLEX'])if(ascii.includes('['+key+']'))throw Error(`This message requires the ${key} name producer`);
    return out;
  }
  return{
    window,queue,control,loader,
    async initialize(state,{resourceRequests,primaryAllocatorPresent,secondaryTaskPresent=false}={}){
      await queue(state,2);await control(state,1);state.scriptEnabled=false;state.secondaryReady=false;state.secondaryTaskPresent=secondaryTaskPresent;state.secondaryTaskDecoded=false;state.primaryAllocatorPresent=!!primaryAllocatorPresent;state.catalog=null;
      const primary=resourceRequests?.filter(r=>r.outerFilename==='actmsg.nat'&&r.directory===20&&r.innerFilename==='');
      if(!primary||primary.length!==1||resourceRequests.length!==1)throw Error('The admitted empty-script resource path requires one original actmsg.nat request');
      if(state.loader){const queued=await loader.queue(state.loader,primary[0]);if(!queued.complete)throw Object.assign(Error(queued.pending),{code:'DQ9_PRESENTATION_BOUNDARY'});state.primaryTaskId=queued.id;state.primaryTask=loader.task(state.loader,queued.id);}
      else state.primaryTask={...clone(primary[0]),readComplete:false,decodeComplete:false,bytes:null};return state;
    },
    // A functional memory-file operation. Incomplete input remains pending; no
    // elapsed frame or fixed delay can turn it into a completed resource.
    async processResource(state){
      if(state.loader){const result=state.loader.taskCount?await loader.process(state.loader):{complete:true,completed:0};state.primaryTask=loader.task(state.loader,state.primaryTaskId);return result;}
      if(!state.primaryTask||state.primaryTask.readComplete)return{processed:false};
      const supplied=assets?.['actmsg.nat'];if(!supplied)return{processed:false,pending:'actmsg.nat bytes are unavailable'};
      const data=toBytes(supplied.bytes??supplied.hex??supplied),length=supplied.byteLength??data.length;
      if(data.length!==length)return{processed:false,pending:'actmsg.nat input has not reached its declared byte length'};
      state.primaryTask.bytes=Array.from(data);state.primaryTask.readComplete=true;return{processed:true,byteLength:data.length};
    },
    async dispatch(state,{command,deltaU16,stackAbi}={}){
      const o=await control(state,0),result={resourceDecoded:false,messageShown:false,clearsNestedRow4Word0:false};
      if(scalar(o,'removeSecondaryTask'))state.secondaryTaskPresent=false;
      if(scalar(o,'requiresPrimaryDecode')){
        try{const catalog=parseOriginalMessageCatalog(state.primaryTask.bytes);state.catalog={kind:catalog.kind,count:catalog.count,records:Object.fromEntries([...catalog.records].map(([id,bytes])=>[id,Array.from(bytes)]))};}catch(error){return{...result,pending:'Original message catalog decode: '+error.message};}
        state.primaryTask.decodeComplete=true;await control(state,3,{primaryDecodeComplete:true});if(state.loader)await loader.remove(state.loader,state.primaryTaskId);state.primaryTaskId=-1;state.primaryTask=null;result.resourceDecoded=true;
      }else if(scalar(o,'requiresController')){
        const wait=await call('rom-common-presentation-controller-wait',{active:state.queue.active,phase:state.phase,commandPresent:!!command,messageWindowIdle:state.window.windowState===0,holdTimer:state.holdTimer,deltaU16,savedSource:state.savedSource,contextU16:state.contextU16});
        state.phase=scalar(wait,'nextPhase');state.holdTimer=scalar(wait,'nextHoldTimer');state.savedSource=scalar(wait,'nextSavedSource');state.contextU16=[...wait.nextContextU16];
        if(scalar(wait,'requiresMessageProcessing')){
          const q=state.queue,head={messageId:q.messageIds[0],target:q.targets[0],extraSource:q.extraSources[0],serial:q.serials[0],hold:q.holds[0],type:q.types[0],contextU16:q.contextsU16.slice(0,2)};
          if(head.type!==0||head.contextU16.some(Boolean))return{...result,pending:'Additional message-controller type/context formatter required'};
          const text=state.catalog?.records[String(head.messageId)];let compiled=null;
          try{compiled=text?.length?compileStaticMessage(text,{substitutions:substitutions(text,command,head)}):null;}catch(error){return{...result,pending:'Original message formatter: '+error.message};}
          if(compiled&&stackAbi!=='jpn-component-world-dispatch-v1')return{...result,pending:'Exact nested message formatter call-stack ABI is required'};
          if(compiled&&compiled.expandedBytes.length>255)return{...result,pending:'The original256-byte message formatter buffer requires a bounded produced string'};
          await queue(state,1);
          if(compiled){state.window=await window.begin(state.window,compiled);const shown=await control(state,2,{headSerial:head.serial,headContextU16:head.contextU16,headHold:head.hold,nonemptyTextShown:true});result.messageShown=true;result.clearsNestedRow4Word0=!!scalar(shown,'clearsNestedRow4Word0');result.formattedBytes=Array.from(compiled.expandedBytes);result.messageId=head.messageId;}
        }
      }
      return result;
    },
    async start(state,{scriptFlags,command,rawAction,coverSourcePresent=false,coverTargetId=0}={}){
      const raw=toBytes(rawAction);if(raw.length!==52)throw Error('Original action bytes are required for common start-message classification');const data=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);
      const o=await call('rom-common-start-messages',{flagsLow:scriptFlags&65535,commandPresent:!!command,actionId:command.actionId,actionCategory:data.getUint32(24,true)>>>12&15,startMessage:command.startMessage,extraMessage:command.extraMessage,targetPresent:command.targetIds.length>0,targetId:command.targetIds[0]??0,coverSourcePresent,coverTargetId});
      if(scalar(o,'requiresQueueWrites'))for(let i=0;i<3;i++){
        await queue(state,0,{messageId:o.messageIds[i],target:scalar(o,'selectedTargetId'),extraSource:-1,hold:o.holds[i],type:0,contextU16:[0,0]});
        if(i===0&&scalar(o,'overridePreviousHold')){if(state.queue.active===0)throw Error('Original special-message hold writes outside the admitted live queue');state.queue.holds[state.queue.active-1]=scalar(o,'previousHold');}
      }
      command.extraMessage=scalar(o,'nextExtraMessage');return{scriptFlags:Math.floor(scriptFlags/65536)*65536+scalar(o,'nextFlagsLow'),command};
    },
    async consume(state,{ticks}){state.window=await window.consume(state.window,{ticks,fastText:true});return state;},
    async produceFonts(state,{argument=16,ticks=1}={}){state.window=await window.font(state.window,{argument,tickCount:ticks});return state;},
    u32Limbs:words
  };
}
