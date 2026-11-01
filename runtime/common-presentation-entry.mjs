// Structural projection of already computed frame fields into the exact
// original next-presentation initializer. Unknown scene bytes are not state:
// the adapter may read an output byte only if it was supplied from retained
// computed state or the graph declares that the initializer writes it.
const IDS=[0,1,2,3,192,193,194,195,196,197,198,199],SCENE_SIZE=0x8000,SCRIPT=0x224,QUEUE=SCRIPT+0x5e8;
const clone=x=>structuredClone(x),scalar=(o,k)=>Number(o[k]?.[0]),word=x=>x[0]+65536*x[1];
const requireData=(condition,message)=>{if(!condition)throw Error(message);};
export const COMMON_PRESENTATION_ENTRY_MODELS=['rom-common-presentation-entry-control','rom-common-presentation-entry','rom-common-presentation-entry-globals','rom-common-presentation-entry-stack'];
export const PRESENTATION_ENTRY_BOUNDARIES={acceptedCommand:'dq9-accepted-command-input-v1',overlayReload:'dq9-original-overlay25-image-reloaded-v1',loadedOverlay:'dq9-original-overlay25-load-complete-v1'};
const GLOBAL_FIELDS=['waitFlagU16','eventFlagsU16','scriptGlobalU16','presentationGlobal48U16','scriptOwnerGlobalU16','pendingFacingMode','movementTimer','resourceTaskIdU16','fallbackGlobal8U16','fallbackGlobal10U16'];

function sceneProjection(state){
  const data=Array(SCENE_SIZE).fill(0),known=new Set(),fields=[];
  function put(at,width,value){
    requireData(Number.isInteger(value)&&value>=-(2**(8*width-1))&&value<2**(8*width),'Invalid represented scene field at '+at.toString(16));
    let raw=value<0?value+2**(8*width):value;
    for(let i=0;i<width;i++){const b=Math.floor(raw/2**(8*i))%256;if(known.has(at+i))requireData(data[at+i]===b,'Conflicting retained scene aliases at '+(at+i).toString(16));data[at+i]=b;known.add(at+i);}
  }
  function field(at,width,value,set,{signed=false,boolean=false}={}){put(at,width,boolean?+!!value:value);fields.push({at,width,set,signed,boolean});}
  function vector(at,width,values,set,{signed=false}={}){requireData(Array.isArray(values),'Represented scene vector required');values.forEach((v,i)=>put(at+i*width,width,v));fields.push({at,width,count:values.length,set,signed});}
  const s=state,r=s.row,m=s.message,q=m.queue;
  put(0x218,4,word(s.input.stackAbi.contextU16??r.cameraRngPointerU16));
  if(s.input.stackAbi.battleDataU16)put(0x21c,4,word(s.input.stackAbi.battleDataU16));
  field(0xe24,4,s.mainState,(out,v)=>out.mainState=v);
  field(0xe28,4,r.presentationState,(out,v)=>out.row.presentationState=v);
  field(0x57c8,4,r.currentActionIndex,(out,v)=>out.row.currentActionIndex=v);
  field(0x5b41,1,r.sceneByte,(out,v)=>out.row.sceneByte=v);
  field(0x71c5,1,r.sceneByte71c5,(out,v)=>out.row.sceneByte71c5=v);
  field(SCRIPT+0x1c4,4,r.programFlags3e8,(out,v)=>out.row.programFlags3e8=v);
  if(s.actorResourceStateU16)vector(SCRIPT+0x1c8,2,s.actorResourceStateU16,(out,v)=>out.actorResourceStateU16=v);
  if(s.scriptAllocatorPointersU16)vector(SCRIPT+0x10,2,s.scriptAllocatorPointersU16,(out,v)=>out.scriptAllocatorPointersU16=v);
  if(s.scriptAllocatorIndex!==undefined)field(SCRIPT+0x30,1,s.scriptAllocatorIndex,(out,v)=>out.scriptAllocatorIndex=v);
  const reset=s.scriptState?.scriptResetU16??s.retainedScriptResetU16;
  if(reset)vector(SCRIPT+0x540,2,reset,(out,v)=>out.retainedScriptResetU16=v);
  if(s.scriptTaskCount!==undefined)field(SCRIPT+0x582,1,s.scriptTaskCount,(out,v)=>out.scriptTaskCount=v);
  if(s.scriptTaskIds)vector(SCRIPT+0x584,2,s.scriptTaskIds,(out,v)=>out.scriptTaskIds=v);
  field(SCRIPT+0x5ce,2,s.scriptDelay,(out,v)=>out.scriptDelay=v);
  field(0x5e2a,1,s.markerCount,(out,v)=>out.markerCount=v);
  field(SCRIPT+0x839,1,m.scriptEnabled,(out,v)=>out.message.scriptEnabled=v,{boolean:true});
  field(SCRIPT+0x87c,1,m.secondaryReady,(out,v)=>out.message.secondaryReady=v,{boolean:true});
  const sceneOffsets=[0x703b,0x703c,0x70ee,0x7937,0x71c4,0x71c8,0x71d8,0x71e8,0x71e9];
  requireData(s.sceneBytes.length===sceneOffsets.length,'The represented scene-finish fields are required');
  sceneOffsets.forEach((at,i)=>field(at,1,s.sceneBytes[i],(out,v)=>out.sceneBytes[i]=v));
  field(0x70ec,2,s.sceneShort70ec,(out,v)=>out.sceneShort70ec=v,{signed:true});
  vector(0x71cc,2,s.sceneVector71ccU16,(out,v)=>out.sceneVector71ccU16=v);
  requireData(r.cameraU16.length===320,'The retained640-byte camera state is required');
  vector(0xb94,2,r.cameraU16,(out,v)=>out.row.cameraU16=v);
  if(s.markerGeometry?.origin)vector(0x5ca0+0x164,4,s.markerGeometry.origin,(out,v)=>out.markerGeometry.origin=v,{signed:true});
  const queueFields=[['messageIds',0,2,false],['targets',0x20,2,true],['extraSources',0x40,2,true],['serials',0x60,2,true],['holds',0x80,2,false],['types',0xa0,1,false],['contextsU16',0xb0,2,false]];
  for(const[key,offset,width,signed]of queueFields)vector(QUEUE+offset,width,q[key],(out,v)=>out.message.queue[key]=v,{signed});
  for(const[key,offset,width,signed]of[['active',0x150,1,false],['serialCounter',0x152,2,true],['cursor',0x154,2,true]])field(QUEUE+offset,width,q[key],(out,v)=>out.message.queue[key]=v,{signed});
  vector(QUEUE+0x158,2,m.contextU16,(out,v)=>out.message.contextU16=v);
  for(const[key,offset,signed]of[['savedSource',0x15c,true],['phase',0x15e,false],['holdTimer',0x160,false],['defaultHold',0x162,false]])field(QUEUE+offset,2,m[key],(out,v)=>out.message[key]=v,{signed});
  // Optional represented fields are carried when available; the initializer
  // writes the values used below even when the earlier scope did not own them.
  if(s.feedbackSelector!==undefined)put(SCRIPT+0x5c8,2,s.feedbackSelector);
  if(s.feedbackCount!==undefined)put(SCRIPT+0x53c,1,s.feedbackCount);
  if(s.tailOwnerPresent===false)put(SCRIPT+0x224,4,0);
  return{data,known,fields};
}

function projectInitializedState(before,projection,output,contract){
  const s=clone(before),written=new Set(contract.rawSceneWrittenOffsets),known=new Set([...projection.known,...written]),data=output.nextSceneBytes,consumed=new Set();
  requireData(Array.isArray(data)&&data.length===SCENE_SIZE,'Original initializer output shape is required');
  function read(at,width,{signed=false,boolean=false}={}){
    let value=0;
    for(let i=0;i<width;i++){requireData(known.has(at+i),'Initializer output depends on an unrepresented prior byte at '+(at+i).toString(16));const b=data[at+i];requireData(Number.isInteger(b)&&b>=0&&b<=255,'Initializer output must retain exact byte values');value+=b*2**(8*i);consumed.add(at+i);}
    if(signed&&value>=2**(8*width-1))value-=2**(8*width);return boolean?!!value:value;
  }
  for(const f of projection.fields)f.set(s,f.count===undefined?read(f.at,f.width,f):Array.from({length:f.count},(_,i)=>read(f.at+i*f.width,f.width,f)));
  s.feedbackSelector=read(SCRIPT+0x5c8,2);s.feedbackCount=read(SCRIPT+0x53c,1);s.tailOwnerPresent=!!read(SCRIPT+0x224,4);
  // The gate's markerDirection is a pre-spacing diagnostic, not raw+158.
  // Keep only the computed real origin/count after the initializer clears the
  // original six words; a later gate may emit a new direction diagnostic.
  s.markerGeometry={origin:[0,1,2].map(i=>read(0x5ca0+0x164+4*i,4,{signed:true})),count:s.markerCount};
  s.scriptResourceStates=Array.from({length:4},(_,i)=>read(SCRIPT+0x59d+i*12,1));
  requireData(read(SCRIPT,4)===0&&read(SCRIPT+4,4)===0,'Original initializer did not clear its program/cursor pointers');s.scriptState=null;
  s.timelinePointersPresent=Array.from({length:12},(_,i)=>!!read(SCRIPT+0x22c+i*64,4));s.timelineExtraByte=read(SCRIPT+0x52d,1);
  const allocatorIndex=read(SCRIPT+0x30,1);requireData(allocatorIndex<4,'Original allocator index exceeds the represented pointer array');
  s.scriptAllocatorIndex=allocatorIndex;s.scriptAllocatorPointersU16=Array.from({length:16},(_,i)=>read(SCRIPT+0x10+2*i,2));
  if(s.actorResourceStateU16)s.actorResourceStateU16=Array.from({length:8},(_,i)=>read(SCRIPT+0x1c8+2*i,2));
  s.message.primaryAllocatorPresent=!!read(SCRIPT+0x10+allocatorIndex*4,4);
  requireData(read(SCRIPT+0x798,4,{signed:true})===-1&&read(SCRIPT+0x880,4,{signed:true})===-1,'Initializer left an external resource task handle live');
  // Original02171964 resets only the owner handle. The separate global loader
  // and every unfinished/orphaned task survive; only RemoveTask may delete one.
  s.message.primaryTaskId=-1;s.message.primaryTask=null;s.message.catalog=null;s.message.secondaryTaskPresent=false;s.message.secondaryTaskDecoded=false;
  s.resource4100U16=[...output.nextResource4100U16];s.ui17ee=scalar(output,'nextUi17ee');s.context8e49=scalar(output,'nextContext8e49');s.battle35=scalar(output,'nextBattle35');s.scriptGlobalU16=[...output.nextScriptGlobalU16];
  s.entryProjection={schema:'dq9-computed-scene-projection-v1',representedBytes:projection.known.size,initializerWrittenBytes:written.size,consumedBytes:consumed.size,fullSceneState:false};
  return s;
}

export async function createCommonPresentationEntryRunner({runGraph,getModel,onTrace}={}){
  requireData(typeof runGraph==='function'&&typeof getModel==='function','Actual shared ONNX execution is required');
  async function call(name,input){
    const model=await getModel(name);requireData(model,'Missing shared entry model '+name);const values={...model.contract.defaults,...input},feeds={};
    for(const field of model.inputs){const v=values[field.name];requireData(v!==undefined,'Missing computed entry input '+field.name);feeds[field.name]=Array.isArray(v)?v:[v];requireData(feeds[field.name].length===field.shape[1],'Entry input width '+field.name);}
    const result=(await runGraph(name,[feeds]))[0];await onTrace?.({model:name,inputs:[clone(feeds)],outputs:[clone(result)]});requireData(!!scalar(result,'supported'),'Unsupported original presentation-entry operands');return{result,model};
  }
  function commitControl(state,o){const s=clone(state);s.row.currentActionIndex=scalar(o,'nextCurrentIndex');s.mainState=scalar(o,'nextMainState');s.row.presentationState=scalar(o,'nextPresentationState');s.stateDirty=scalar(o,'nextStateDirty');s.overlayTaskId=scalar(o,'nextOverlayTaskId');return s;}
  async function globals(state,operation){
    const input={operation,cameraInitialized:state.row.cameraGeometry.initialized,context81fe:state.row.battleType,sceneFlagsU16:state.sceneFlags57e4U16??state.input.sceneFlags57e4U16??[0,0],enabled:true};
    for(const key of GLOBAL_FIELDS)input[key]=state[key]??(key.endsWith('U16')?[0,0]:0);
    const{result}=await call('rom-common-presentation-entry-globals',input),s=clone(state);
    for(const key of GLOBAL_FIELDS){const value=result['next'+key[0].toUpperCase()+key.slice(1)];s[key]=key.endsWith('U16')?[...value]:Number(value[0]);}
    s.sceneFlags57e4U16=[...input.sceneFlagsU16];return{state:s,normalAdmissionSupported:!!scalar(result,'normalAdmissionSupported'),storyMessageKind:scalar(result,'storyMessageKind'),specialMessageActive:!!scalar(result,'specialMessageActive')};
  }
  return{
    models:COMMON_PRESENTATION_ENTRY_MODELS,
    async acceptCommand({state,boundary}={}){
      requireData(boundary?.contract===PRESENTATION_ENTRY_BOUNDARIES.acceptedCommand,'An explicit accepted command-input boundary is required');
      requireData(state?.complete&&state.nextNumericTurnReady&&state.mainState===7,'The completed functional frame must select the next command input');
      const{result}=await call('rom-common-presentation-entry-control',{operation:0,currentIndex:state.row.currentActionIndex,mainState:state.mainState,presentationState:state.row.presentationState,stateDirty:state.stateDirty,overlayTaskId:state.overlayTaskId??-1,enabled:true});
      requireData(!!scalar(result,'requestTurnBegin'),'Accepted command boundary did not request the original turn begin');const s=commitControl(state,result);
      s.entryBoundary={schema:'dq9-retained-presentation-entry-v1',stage:'accepted-command',previousCompletedFrame:s.frameNumber,requestTurnBegin:true};
      return{state:s,requestTurnBegin:true,commandMenuComplete:false};
    },
    async reloadOverlay({state,numericState,event}={}){
      requireData(state?.entryBoundary?.stage==='accepted-command','Accepted command entry must precede the original overlay reload');
      requireData(numericState?.phase==='numeric-turn-complete'&&numericState.camera?.numericTurnPending,'A completed retained numeric turn is required before the overlay reload');
      requireData(event?.contract===PRESENTATION_ENTRY_BOUNDARIES.overlayReload,'The unchanged original overlay25 image/BSS reload must be an explicit input event');
      const before=clone(state);before.row.seed=[...numericState.seed];before.row.position=[numericState.position];before.outcome=numericState.outcome;
      const result=await globals(before,0);result.state.entryBoundary={...before.entryBoundary,stage:'overlay25-reloaded',requestTurnBegin:false};return result;
    },
    async loaderCompleted({state,event}={}){
      requireData(state?.entryBoundary?.stage==='overlay25-reloaded','The unchanged original overlay reload must precede its completed-loader tail');
      requireData(event?.contract===PRESENTATION_ENTRY_BOUNDARIES.loadedOverlay,'An explicit original overlay25 load-completed event is required');
      const{result}=await call('rom-common-presentation-entry-control',{operation:1,currentIndex:state.row.currentActionIndex,mainState:state.mainState,presentationState:state.row.presentationState,stateDirty:state.stateDirty,overlayTaskId:state.overlayTaskId??-1,enabled:true}),s=commitControl(state,result);
      s.entryBoundary={...s.entryBoundary,stage:'overlay25-loaded',requestTurnBegin:false};return{state:s};
    },
    async header({state}={}){
      const result=await globals(state,1),s=result.state;s.entryHeaderRequired=true;s.headerCompletedForFrame=true;
      if(state.entryBoundary?.stage==='overlay25-loaded')s.entryBoundary={...s.entryBoundary,stage:'header-complete'};
      if(!result.normalAdmissionSupported)return{...result,readyForFrame:false,reason:'The original story/special-message producer is required for context81fe or scene57e4.'};
      return result;
    },
    async initialize({state,cameraRow,commands,numericState,partyTacticsById}={}){
      requireData(state?.entryBoundary?.stage==='header-complete','The actual fullframe header must precede the initializer');
      requireData(numericState?.phase==='numeric-turn-complete'&&numericState.camera?.numericTurnPending,'The retained numerical turn must complete exactly once before its next presentation');
      requireData(cameraRow&&Array.isArray(commands)&&commands.length===cameraRow.commands.length,'New commands must come from the shared computed presentation arena');
      const before=clone(state),row=before.row,objects=new Map([...row.roster,...row.lookupObjects??[]].map(a=>[a.id,a])),numeric=new Map(numericState.actors.map(a=>[a.actorId,a]));
      for(const object of row.roster){requireData(numeric.has(object.id),'A retained visual object is missing from the current numeric roster');const actor=numeric.get(object.id);object.dead=!!actor.dead;object.stats18Low16=actor.rawFlags%65536;object.numericStatsPresent=true;}
      const activeNumeric=numericState.actors.filter(a=>!a.excluded&&!a.dead);requireData(activeNumeric.every(a=>row.roster.some(o=>o.id===a.actorId)),'A new numerical actor needs its original visual-object producer');
      const declaredTactics=partyTacticsById??before.input.partyTacticsById,tactics=IDS.slice(0,4).map(id=>{if(!objects.has(id)||objects.get(id).lookupPresent===false)return null;requireData(Object.hasOwn(declaredTactics??{},String(id)),'Explicit party tactics pointer/value required for actor '+id);const value=declaredTactics[id];requireData(value===null||Number.isInteger(value)&&value>=-128&&value<=127,'Original signed party tactics byte is required');return value;});
      const base=before.input.stackAbi.sceneBaseU16,globalBase=before.input.stackAbi.globalSceneBaseU16,context=before.input.stackAbi.contextU16??row.cameraRngPointerU16;
      requireData(Array.isArray(globalBase)&&globalBase.length===2,'The original global current-scene pointer must be declared');
      for(const [name,pointer]of Object.entries({sceneBaseU16:base,globalSceneBaseU16:globalBase,contextU16:context}))requireData(Array.isArray(pointer)&&pointer.length===2&&pointer.every(v=>Number.isInteger(v)&&v>=0&&v<=65535),'Original '+name+' pointer requires two uint16 limbs');
      requireData(Array.isArray(context)&&context.length===2&&word(row.commandBaseU16)===word(context)+0x821c,'The original context and command arena pointer identity are required');
      const actorTypes=IDS.map(id=>{if(!objects.has(id)||objects.get(id).lookupPresent===false)return 0;const value=objects.get(id).typeFlagsLow16??before.actors[id]?.typeFlagsLow16;requireData(Number.isInteger(value)&&value>=0&&value<=65535,'Original GameObject+0 type flags must be supplied for actor '+id);return value;});
      const records=cameraRow.commands.flatMap(c=>c.participants.map(id=>({source:id,target:c.targets[0]??-1,hasTarget:c.targets.length>0})));requireData(records.length<=72,'The original participant input capacity is72');
      const projection=sceneProjection(before),input={sceneBytes:projection.data,sceneBaseU16:base,globalSceneBaseU16:globalBase,contextU16:context,actorLookupPresent:IDS.map(id=>objects.has(id)&&objects.get(id).lookupPresent!==false),actorTypeFlagsLow16:actorTypes,actorDead:IDS.map(id=>!!numeric.get(id)?.dead),actorVisualPresent:IDS.map(id=>objects.has(id)&&objects.get(id).visualPresent!==false),actorBehavior:IDS.map(id=>objects.get(id)?.behaviorBE??before.actors[id]?.behaviorBE??0),actorPreviousBehavior:IDS.map(id=>objects.get(id)?.behaviorPrevious??before.actors[id]?.behaviorPrevious??0),actorPreferredTarget:IDS.map(id=>objects.get(id)?.preferredTarget??255),partyTacticsPresent:tactics.map(v=>v!==null),partyTactics:tactics.map(v=>v??5),recordCount:records.length,recordSourceIds:Array.from({length:72},(_,i)=>records[i]?.source??-1),recordFirstTargetIds:Array.from({length:72},(_,i)=>records[i]?.target??-1),recordHasTarget:Array.from({length:72},(_,i)=>records[i]?.hasTarget??false),resource4100U16:before.resource4100U16,ui17ee:before.ui17ee,context8e49:before.context8e49??0,battle35:before.battle35??0,scriptGlobalU16:before.scriptGlobalU16??[0,0],enabled:true};
      const{result,model}=await call('rom-common-presentation-entry',input);requireData(!!scalar(result,'completed'),'Original next-presentation initializer did not complete');
      const s=projectInitializedState(before,projection,result,model.contract),nextObjects=new Map([...s.row.roster,...s.row.lookupObjects??[]].map(a=>[a.id,a]));
      IDS.forEach((id,i)=>{for(const[key,values]of[['behaviorBE',result.nextActorBehavior],['behaviorPrevious',result.nextActorPreviousBehavior],['preferredTarget',result.nextActorPreferredTarget]]){if(s.actors[id])s.actors[id][key]=values[i];if(nextObjects.has(id))nextObjects.get(id)[key]=values[i];}});
      s.row.commands=clone(cameraRow.commands);s.row.rawActions=clone(cameraRow.rawActions);s.row.seed=[...numericState.seed];s.row.position=[numericState.position];s.commands=clone(commands);s.outcome=numericState.outcome;
      s.firstAdmission=false;s.admitted=false;s.complete=false;s.nextNumericTurnReady=false;s.entryBoundary={...s.entryBoundary,stage:'initialized-awaiting-stack',requestTurnBegin:false};
      return{state:s,readyForFrame:false,reason:'The actual reloaded-overlay header and retained call-stack producer must complete before a next frame executes.'};
    },
    async retainStack({state}={}){
      requireData(state?.entryBoundary?.stage==='initialized-awaiting-stack','The exact original initializer must precede next admission');
      const abi=state.input.stackAbi;requireData(abi.nextEntryStackAbi==='jpn-component-next-entry-disjoint-numeric-v1','The original next-entry disjoint-stack ABI must be declared');
      const{result}=await call('rom-common-presentation-entry-stack',{priorNestedU16:state.row.nestedRow4U16,componentSpU16:abi.componentSpU16,numericSpU16:abi.numericSpU16,enabled:true});
      requireData(!!scalar(result,'completed'),'Original next-entry stack producer is incomplete');const s=clone(state);
      s.row.nestedRow4U16=[...result.nextNestedU16];s.row.row4Words=Array.from({length:4},(_,i)=>word(result.nextNestedU16.slice(2*i,2*i+2)));
      s.entryBoundary={...s.entryBoundary,stage:'ready-for-admission',outerSpU16:[...result.nextOuterSpU16],rowBaseU16:[...result.nextRowBaseU16]};return{state:s,readyForFrame:true};
    }
  };
}
