// The same numeric producer and the same frame graph serve every input row.
// This adapter joins the proved functional component schedule; it does not
// emulate the command menu, overlay loading or physical renderer timing.
import {createCommonPresentationRunner} from './common-presentation.mjs';
import {createCommonPresentationFrameRunner,computedPresentationCommands} from './common-presentation-frame.mjs';
import {createCommonPresentationEntryRunner,PRESENTATION_ENTRY_BOUNDARIES} from './common-presentation-entry.mjs';
const clone=x=>structuredClone(x);
const requireData=(condition,message)=>{if(!condition)throw Error(message);};

// These events declare the functional boundary being supplied by the caller.
// No frame count, elapsed time or task count manufactures a loader event.
export const FUNCTIONAL_PRESENTATION_CONTINUATION='dq9-functional-presentation-continuation-v1';
export {PRESENTATION_ENTRY_BOUNDARIES};

export function createCommonFunctionalPresentationRunner({definitions,cpuDoubleProvider='onnxruntime-wasm',frameResources,shouldStop=()=>false,onPhase,onTrace}={}){
  const produce=createCommonPresentationRunner({definitions,cpuDoubleProvider});
  function commitFrame(handoff,result,input){
    const state=result.state,unresolvedEffects=result.complete||result.budgetExhausted?[]:[{reason:'functional-frame-producer',message:result.pending,completedFrames:state.frameNumber}],startFrame=state.entryBoundary?.previousCompletedFrame??0;
    const camera={...handoff.camera,
      state:{world:clone(state.row),geometry:clone(state.row.cameraGeometry),cameraU16:clone(state.row.cameraU16),row4Words:clone(state.row.row4Words)},
      row4Words:clone(state.row.row4Words),frameState:state,frameSummary:{frames:state.frameNumber,presentationStartFrame:startFrame,presentationFrames:state.frameNumber-startFrame,commands:state.commands.length,mainState:state.mainState,presentationState:state.row.presentationState,currentActionIndex:state.row.currentActionIndex,complete:result.complete},
      functionalFramePending:!result.complete,functionalFrameComplete:result.complete,complete:result.complete,projectionComplete:false,wholeCameraComplete:result.complete,nextNumericTurnReady:!!result.nextNumericTurnReady,
      nextCommandInputRequired:result.complete&&!!result.nextNumericTurnReady,commandMenuComplete:false,wholePhysicalWorldComplete:false,
      explicitCpuDoubleProvider:cpuDoubleProvider,assetManifest:clone(input.assetManifest??null),unresolvedEffects,
      frameHandoffPeriodicComplete:handoff.periodicComplete??handoff.camera.frameHandoffPeriodicComplete??false,scope:result.scope??state.scope};
    if(result.complete)camera.numericTurnPending=false;
    return{complete:result.complete,periodicComplete:camera.frameHandoffPeriodicComplete,budgetExhausted:!!result.budgetExhausted,stopReason:result.reason,seed:[...state.row.seed],position:state.row.position[0],camera,unresolvedEffects};
  }
  const present=async function present(args){
    if(args.state.camera.mode!=='functional-frame')return produce(args);
    const prior=args.state.camera;
    const failed=(reason,details={})=>({complete:false,seed:[...args.state.seed],position:args.state.position,camera:{...clone(prior),complete:false,wholeCameraComplete:false,nextNumericTurnReady:false,unresolvedEffects:[{reason,...details}]},unresolvedEffects:[{reason,...details}]});
    if(prior.frameState)return failed('next-turn-frame-initialization',{message:'A completed functional frame is retained. The next command-input boundary and next-turn camera admission must be supplied and qualified before another presentation begins.'});
    if(prior.frameInput?.contract!=='dq9-empty-script-static-font-functional-frame-v1')return failed('functional-frame-input',{message:'Supply camera.frameInput with the explicit initial mutable, resource, font and component schedule contract.'});
    const handoff=await produce(args);if(!handoff.complete)return handoff;
    const input={...clone(frameResources??{}),...clone(prior.frameInput),outcome:args.state.outcome};
    if(!input.assets?.['actmsg.nat']||!Array.isArray(input.fontTables))return failed('functional-frame-assets',{message:'Read the actual local ROM message and static-font bytes, or supply those bytes explicitly.'});
    const runner=await createCommonPresentationFrameRunner({runGraph:args.runGraph,runDoubleGraph:args.runGraph,getModel:args.getModel,onPhase,onTrace});
    const result=await runner.run({camera:handoff.camera,frameInput:input,maxFrames:prior.maxFrames??256,shouldStop});
    return commitFrame(handoff,result,input);
  };
  present.prepareAcceptedCommand=async({state,boundary,runGraph,getModel}={})=>{
    requireData(state?.camera?.mode==='functional-frame'&&state.camera.nextNumericTurnReady===true&&!state.camera.numericTurnPending,'A completed functional presentation is required before accepting a new command');
    requireData(state.supported!==false&&!state.budgetExhausted&&!state.finished,'The retained numeric state must be ready for another command');
    const entry=await createCommonPresentationEntryRunner({runGraph,getModel,onTrace}),accepted=await entry.acceptCommand({state:state.camera.frameState,boundary}),next=clone(state);
    next.camera.frameState=accepted.state;next.camera.acceptedCommandBoundary=clone(boundary);
    return{state:next,requestTurnBegin:accepted.requestTurnBegin,commandMenuComplete:false};
  };
  present.continuePresentation=async({state,events,runGraph,getModel,maxFrames=256,maxTransitions=100000}={})=>{
    requireData(state?.camera?.mode==='functional-frame'&&state.camera.frameState,'A retained functional frame state is required');
    requireData(Number.isInteger(maxFrames)&&maxFrames>=0&&Number.isInteger(maxTransitions)&&maxTransitions>0,'Explicit finite frame and graph-transition budgets are required');
    const original=clone(state),prior=original.camera,initialFrame=prior.frameState;
    if(initialFrame.complete&&prior.nextNumericTurnReady===true&&!prior.numericTurnPending)return{state:original,complete:true,retainedComplete:true,transitions:0,graphCalls:0,batchRows:0};
    const nextEntry=initialFrame.entryBoundary?.stage==='accepted-command'&&prior.numericTurnPending===true&&original.phase==='numeric-turn-complete';
    const resuming=!initialFrame.complete&&prior.functionalFramePending===true;
    requireData(nextEntry||resuming,'The retained state must be a completed numeric turn or a pending functional presentation');
    if(nextEntry){
      requireData(events?.contract===FUNCTIONAL_PRESENTATION_CONTINUATION,'Supply the explicit functional presentation continuation contract');
      requireData(events.overlayReload?.contract===PRESENTATION_ENTRY_BOUNDARIES.overlayReload,'Supply the original overlay25 image/BSS reload event');
      requireData(events.loaderCompleted?.contract===PRESENTATION_ENTRY_BOUNDARIES.loadedOverlay,'Supply the original overlay25 load-completed event');
    }else if(events&&prior.continuationEvents)requireData(JSON.stringify(events)===JSON.stringify(prior.continuationEvents),'Resuming a frame cannot replace the already applied overlay events');
    let transitions=0,graphCalls=0,batchRows=0;
    const boundedGraph=async(name,rows)=>{
      const reason=shouldStop()?'User stopped before the next presentation graph':transitions+rows.length>maxTransitions?'Transition budget exhausted':null;
      if(reason){const error=Error(reason);error.code='DQ9_BUDGET';throw error;}
      const result=await runGraph(name,rows);transitions+=rows.length;graphCalls++;batchRows+=rows.length;return result;
    };
    let handoff={camera:clone(prior),periodicComplete:prior.frameHandoffPeriodicComplete},ready=clone(initialFrame),result;
    try{
      if(nextEntry){
        handoff=await produce({state:original,records:original.turnRecords,runGraph:boundedGraph,getModel});
        if(!handoff.complete){const next=clone(original);next.camera=clone(handoff.camera);next.supported=false;next.requestedTurnsComplete=false;next.unresolvedEffects=[{phase:'presentation-entry',reason:'presentation',details:clone(handoff.unresolvedEffects??[])}];return{state:next,complete:false,transitions,graphCalls,batchRows};}
        const entry=await createCommonPresentationEntryRunner({runGraph:boundedGraph,getModel,onTrace});
        const reloaded=await entry.reloadOverlay({state:ready,numericState:original,event:events.overlayReload}),loaded=await entry.loaderCompleted({state:reloaded.state,event:events.loaderCompleted}),header=await entry.header({state:loaded.state});
        requireData(header.normalAdmissionSupported,header.reason??'The original special-message entry producer is required');
        const initialized=await entry.initialize({state:header.state,cameraRow:handoff.camera.projectionInitial,commands:computedPresentationCommands(handoff.camera),numericState:original}),stack=await entry.retainStack({state:initialized.state});
        requireData(stack.readyForFrame,'The retained original entry stack must complete');ready=stack.state;
        handoff.camera.continuationEvents=clone(events);
      }
      const runner=await createCommonPresentationFrameRunner({runGraph:boundedGraph,runDoubleGraph:boundedGraph,getModel,onPhase,onTrace});
      result=await runner.run({state:ready,maxFrames,shouldStop});
    }catch(error){
      if(error?.code!=='DQ9_BUDGET')throw error;
      // No partial entry is committed. Retain the numeric boundary so its
      // deterministic entry can be retried; frames commit only at full steps.
      const next=clone(original);next.budgetExhausted=true;next.requestedTurnsComplete=false;next.stopReason=error.message;
      return{state:next,complete:false,budgetExhausted:true,transitions,graphCalls,batchRows};
    }
    const output=commitFrame(handoff,result,ready.input),next=clone(original);
    next.seed=[...output.seed];next.position=output.position;next.camera=output.camera;next.phase=output.complete?'ready':'presentation';next.requestedTurnsComplete=output.complete;next.budgetExhausted=output.budgetExhausted;
    next.supported=output.complete||output.budgetExhausted;next.unresolvedEffects=output.unresolvedEffects.map(value=>({phase:'presentation',...clone(value)}));
    if(output.stopReason)next.stopReason=output.stopReason;else delete next.stopReason;
    return{state:next,complete:output.complete,budgetExhausted:output.budgetExhausted,transitions,graphCalls,batchRows};
  };
  return present;
}
