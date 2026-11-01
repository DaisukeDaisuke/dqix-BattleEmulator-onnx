// Shared numeric-record -> presentation join. Encounter IDs never select code.
import {createCameraEnclosingPhaseRunner,CAMERA_ENCLOSING_PHASE_MODELS} from '../graph-v2/camera-enclosing-phase-runner.mjs';
import {cameraEnclosingGeometryInitial} from '../graph-v2/camera-enclosing-geometry-runner.mjs';
import {createCameraRetainedMemoryRunner} from '../graph-v2/camera-retained-memory-runner.mjs';

export const COMMON_PRESENTATION_MODELS=[...new Set([...CAMERA_ENCLOSING_PHASE_MODELS,'rom-common-presentation-command','rom-common-periodic-presentation','rom-common-presentation-stack','rom-common-presentation-advance'])];
const clone=x=>structuredClone(x),one=x=>Array.isArray(x)?x:[x];
const seedHex=seed=>'0x'+[...seed].reverse().map(x=>x.toString(16).padStart(2,'0')).join('');
const limbs=words=>words.flatMap(x=>[x%65536,Math.floor(x/65536)]);
const words=raw=>Array.from({length:raw.length/2},(_,i)=>raw[i*2]+65536*raw[i*2+1]);

export function createCommonPresentationRunner({definitions,cpuDoubleProvider='onnxruntime-wasm'}={}){
  if(!definitions?.actions)throw Error('Common presentation requires the shared action definition table');
  if(cpuDoubleProvider!=='onnxruntime-wasm')throw Error('Camera reverse polar requires explicitly selected ONNX Runtime WASM DOUBLE execution');
  return async function present({state,records,runGraph,getModel}){
    const camera=clone(state.camera),initial=camera.initial,rawActions=Object.values(definitions.actions).map(x=>x.raw),outputs=[];
    let periodicComplete=false;
    const failed=(reason,details={})=>({complete:false,periodicComplete,seed:[...state.seed],position:state.position,camera:{...camera,complete:false,wholeCameraComplete:false,nextNumericTurnReady:false,unresolvedEffects:[{reason,...details}]},unresolvedEffects:[{reason,...details}]});
    if(camera.mode!=='camera-projection')return failed('presentation-mode',{message:'Select numeric-only or camera-projection explicitly.'});
    if(!initial||typeof initial!=='object')return failed('camera-initial-state',{required:'camera.initial contains visual roster, program/resource state and initial camera fields; camera.row4Words is the correlated external four-word observation.'});
    if(Object.hasOwn(initial,'commands'))return failed('observed-command-input',{message:'Presentation commands are generated from this numerical run, never accepted as initial observations.'});
    if((initial.queuedPresentationRecords??[]).length||state.presentationExtraEvents)return failed('auxiliary-presentation-producer',{message:'An auxiliary/periodic event needs its common record producer and real event schedule.'});
    const row4=camera.row4Words;
    if(!Array.isArray(row4)||row4.length!==4||row4.some(x=>!Number.isInteger(x)||x<0||x>4294967295))return failed('correlated-row4-input',{required:'Four exact uint32 words in camera.row4Words.'});
    const abi=initial.stackAbi;
    if(!abi||abi.sameStack!==true||!abi.objectAddressU16||!Array.isArray(abi.gameStateSingletonU16))return failed('camera-stack-abi',{required:'Initial stackAbi.sameStack=true, objectAddressU16 by actual object ID, and gameStateSingletonU16. These are pointer identities, not intermediate observed results.'});
    if(!Array.isArray(initial.roster)||initial.roster.length<1||initial.roster.length>4)return failed('camera-roster-capacity',{capacity:4,message:'Current shared planner tensor supports four visual objects. Numerical population supports the full ROM roster; a larger visual roster is rejected explicitly.'});
    if(records.length>72)return failed('camera-command-capacity',{count:records.length,capacity:72,authority:'Original command arena: 72 records of 40 bytes, counter battle+0x8e24.'});
    const call=async(name,input)=>{
      const ir=await getModel(name),feed={};for(const field of ir.inputs){const v=input[field.name]??ir.contract?.defaults?.[field.name];if(v===undefined)throw Error(name+'.'+field.name+': missing computed presentation operand');feed[field.name]=one(v);}
      return(await runGraph(name,[feed]))[0];
    };
    const commands=[];
    for(const [index,record]of records.entries()){
      if(!record.presentationBefore||!record.presentationAfter)return failed('numerical-presentation-operands',{index});
      if(record.impacts.length!==record.targets.length||record.impacts.length===0)return failed('presentation-target-records',{index,actionId:record.actionId});
      let command=null;
      for(const [targetIndex,impact]of record.impacts.entries()){
        const input={actionId:record.actionId,operation:definitions.actions[record.actionId]?.operation??-1,sourceId:record.sourceId,targetId:impact.targetId,participantCount:record.participants.length,targetCount:record.impacts.length,damage:impact.damage,comboCount:impact.comboCount??record.comboCount??0,comboEnabled:!!definitions.actions[record.actionId]?.combo,critical:!!impact.critical,dodged:!!impact.dodged,guarded:!!impact.guarded,operationHit:!!impact.operationHit,effectApplied:!!impact.effectApplied,auxiliaryEvent:!!record.auxiliaryEvent,terminal:state.outcome!==0,partyWeaponMessage:!!initial.partyWeaponMessage,enabled:true};
        for(const [when,snap]of [['before',impact.presentationBefore??record.presentationBefore],['after',impact.presentationAfter??record.presentationAfter]])for(const who of ['Source','Target'])for(const type of ['Actor','Aux','Status','WakeSkip','Tension'])input[when+who+type]=snap[who.toLowerCase()]?.[type[0].toLowerCase()+type.slice(1)];
        const output=await call('rom-common-presentation-command',input);
        if(!output.supported[0]||!output.wrote[0])return failed('presentation-command-producer',{index,targetIndex,actionId:record.actionId,sourceId:record.sourceId,message:'The computed impact is outside the shared semantic record producer.'});
        const [actionId,messageId,sourceId,targetId,flagsA,flagsB]=output.command;
        if(command===null)command={actionId,messageId,participants:[sourceId],targets:[],flagsA:0,flagsB:8};
        command.targets.push(targetId);command.flagsA|=flagsA;
        if(!(flagsB&8))command.flagsB&=~8;
        if(flagsB&224)command.flagsB=(command.flagsB&31)|(flagsB&224);
      }
      commands.push(command);
    }
    const periodicGroups=new Map();
    let periodicScratchFlags=Array(32).fill(0);
    const messageWord=(id,offset)=>{const raw=definitions.actions[id]?.raw;if(typeof raw!=='string'||raw.length!==104)throw Error('Missing periodic action definition '+id);const bytes=Uint8Array.from(raw.match(/../g),x=>parseInt(x,16));return new DataView(bytes.buffer).getUint32(offset,true);};
    const periodicMessageData=[930,931,932,933].map(id=>messageWord(id,32)&1023);
    periodicMessageData.push(messageWord(934,32)&1023,messageWord(934,32)>>>20&1023,messageWord(934,40)&1023);
    for(const record of state.periodicPresentationRecords??[]){
      if(record.operation===0)continue;
      if(!['party-hp','party-mp','party-poison','enemy-mp','enemy-poison'].includes(record.groupKey)||![1,2,3].includes(record.operation))return failed('periodic-presentation-group',{group:record.groupKey,operation:record.operation});
      if(!periodicGroups.has(record.groupKey))periodicGroups.set(record.groupKey,[]);
      periodicGroups.get(record.groupKey).push(record);
    }
    for(const [groupKey,group]of periodicGroups){
      if(group.length>8)return failed('periodic-presentation-capacity',{groupKey,count:group.length,capacity:8});
      const first=group[0],requestKey=['','hpRequested','mpRequested','poisonRequested'][first.operation],input={operation:first.operation,partyGroup:first.side==='party',present:Array.from({length:8},(_,i)=>i<group.length),enabled:true,
        scratchFlagsU16:periodicScratchFlags,messageData:periodicMessageData,metadataInputsComplete:group.every(r=>Array.isArray(r.output?.[requestKey])),
        requestedAmounts:Array.from({length:8},(_,i)=>group[i]?.output?.[requestKey]?.[0]??0),
        rawStatusU16:Array.from({length:8},(_,i)=>{const raw=group[i]?.after?.rawStatus??0;return[raw%65536,Math.floor(raw/65536)];}).flat(),
        statusKinds:Array.from({length:8},(_,i)=>group[i]?.after?.statusKinds??0)};
      if(group.some(r=>r.operation!==first.operation||r.side!==first.side))return failed('periodic-presentation-group',{groupKey,message:'A semantic group cannot mix sides or operations.'});
      for(const when of ['before','after'])for(const [field,width]of [['Actors',33],['Status',7]]){
        const key=field==='Actors'?'actor':'status';
        if(group.some(r=>!Array.isArray(r[when]?.[key])||r[when][key].length!==width))return failed('periodic-presentation-operands',{groupKey,when,field});
        input[when+field]=[...group.flatMap(r=>r[when][key]),...Array((8-group.length)*width).fill(0)];
      }
      const out=await call('rom-common-periodic-presentation',input);
      if(!out.supported[0])return failed('periodic-presentation-producer',{groupKey,message:'This periodic group needs an additional shared snapshot producer.'});
      periodicScratchFlags=out.nextScratchFlagsU16;
      if(out.wrote[0]){
        const [actionId,messageId,sourceId,,flagsA,flagsB]=out.command;
        commands.push({actionId,messageId,participants:[sourceId],targets:out.targets.slice(0,out.targetCount[0]),flagsA,flagsB,periodicGroup:groupKey,amounts:out.amounts.slice(0,out.targetCount[0]),
          periodicMetadataComplete:!!out.metadataSupported[0],startMessage:out.startMessage[0],periodicImpacts:out.metadataSupported[0]?Array.from({length:out.targetCount[0]},(_,i)=>({targetId:out.targets[i],payloadBytes:out.impactPayloadBytes.slice(i*36,i*36+36),messageIds:out.impactMessageIds.slice(0,out.impactMessageCount[0]),originalImpactSlots:2})):[]});
      }
    }
    periodicComplete=true;
    if(commands.length>72)return failed('camera-command-capacity',{count:commands.length,capacity:72});
    if(commands.length===0)return failed('empty-presentation-queue');
    const initialRow=cameraEnclosingGeometryInitial({...clone(initial),commands,row4Words:[...row4],rawActions,seed:seedHex(state.seed),currentActionIndex:0});
    initialRow.seed=[...state.seed];initialRow.position=[state.position];
    const actorMap=new Map(state.actors.map(a=>[a.actorId,a]));
    for(const a of initialRow.roster){const numeric=actorMap.get(a.id);if(!numeric)return failed('visual-numeric-object-lookup',{objectId:a.id});a.dead=!!numeric.dead;}
    const providers={runGraph,runDoubleGraph:runGraph,getModel},first=await createCameraEnclosingPhaseRunner(providers),retained=await createCameraRetainedMemoryRunner(providers);
    let row=initialRow,priorWords=[...row4],final=null;
    for(let index=0;index<commands.length;index++){
      if(row.currentActionIndex!==index)return failed('presentation-advance-order',{outerIndex:index,currentActionIndex:row.currentActionIndex});
      const result=await(index===0?first:retained).run({rows:[row],maxRouteAttempts:camera.maxRouteAttempts??10861});
      if(!result.complete)return failed('camera-projection',{index,details:result.reason??result.scope});
      const current=result.states[0],planning=result.world.prior.admission.planning,before=result.world.prior.states[0],decision=result.world.prior.event.decisions[0],activeIds=planning.states[0].activeRosterIds,
        command=before.commands[before.currentActionIndex],source=[...before.roster,...before.lookupObjects??[]].find(a=>a.id===command?.participants[0]),second=activeIds[1],address=abi.objectAddressU16[String(second)],
        stack=await call('rom-common-presentation-stack',{priorU16:limbs(priorWords),programProjection:before.programProjection,currentActionIndex:before.currentActionIndex,sourceAuxiliaryNode:source?.auxiliaryNode??255,sourcePresent:!!source&&source.lookupPresent!==false,sourceVisualPresent:!!source&&source.visualPresent!==false,programPresent:before.selectedProgramIndex>=0,selectorReached:before.selectorReached,callFreeCamera:decision.callFreeCamera,forced:decision.forced,freeCameraSelected:result.world.prior.event.camera[0].selected,plannerReached:!!planning.control[0].routeEnabled[0],plannerSecondPresent:activeIds.length>=2&&Array.isArray(address)&&address.length===2,plannerSecondAddressU16:address??[0,0],gameStateSingletonU16:abi.gameStateSingletonU16,enabled:true});
      priorWords=words(stack.nextU16);final={world:clone(current),geometry:clone(result.cameraGeometry[0]),cameraU16:[...result.cameraU16[0]],row4Words:[...priorWords]};
      state.seed=[...current.seed];state.position=current.position[0];
      outputs.push({commandIndex:index,actionId:commands[index].actionId,seed:[...state.seed],position:state.position,row4Words:[...priorWords],world:clone(current),geometry:clone(final.geometry),cameraU16:[...final.cameraU16]});
      camera.projection={commands:clone(commands),outputs:clone(outputs),final:clone(final)};
      if(!stack.supported[0])return failed('selector-stack-producer',{index,message:'This branch needs a producer for the next correlated row+4; no fixed replacement is used.'});
      if(index+1<commands.length){
        const advance=await call('rom-common-presentation-advance',{queueCount:0,currentIndex:current.currentActionIndex,presentationState:current.presentationState,overridePresent:false,enabled:true});
        if(advance.requiresAuxiliaryProducer[0])return failed('auxiliary-presentation-producer',{index});
        const g=final.geometry;
        row={...clone(current),currentActionIndex:advance.nextCurrentIndex[0],presentationState:advance.nextPresentationState[0],row4Words:[...priorWords],cameraGeometry:clone(g),cameraState:[g.counter,g.globals7[0],g.globals7[1],g.globals7[3],g.globals7[4]],cameraInitialized:!!g.initialized,cameraU16:[...final.cameraU16],commandBaseU16:[...initialRow.commandBaseU16],cameraRngPointerU16:[...initialRow.cameraRngPointerU16],retainedMemoryOrigin:'computed-previous-outer-v1'};
      }
    }
    return{complete:true,periodicComplete,seed:[...state.seed],position:state.position,camera:{...camera,state:final,complete:false,projectionComplete:true,wholeCameraComplete:false,nextNumericTurnReady:false,explicitCpuDoubleProvider:cpuDoubleProvider,
      scope:'Computed numerical and grouped periodic command headers, followed by each explicitly scheduled enclosing camera call and real advance, carrying exact RNG, world, camera memory and derived same-stack row+4. There is no fixed three-command loop. Impact/message buffers, asynchronous script/resource readiness, other auxiliary event producers and return to the next numerical turn are unresolved; this result is a declared projection, not a complete battle.'}};
  };
}
