// The same numeric producer and the same frame graph serve every input row.
// This adapter joins the proved functional component schedule; it does not
// emulate the command menu, overlay loading or physical renderer timing.
import {createCommonPresentationRunner} from './common-presentation.mjs';
import {createCommonPresentationFrameRunner} from './common-presentation-frame.mjs';
const clone=x=>structuredClone(x);

export function createCommonFunctionalPresentationRunner({definitions,cpuDoubleProvider='onnxruntime-wasm',frameResources,shouldStop=()=>false,onPhase,onTrace}={}){
  const produce=createCommonPresentationRunner({definitions,cpuDoubleProvider});
  return async function present(args){
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
    const state=result.state,unresolvedEffects=result.complete||result.budgetExhausted?[]:[{reason:'functional-frame-producer',message:result.pending,completedFrames:state.frameNumber}],camera={...handoff.camera,
      state:{world:clone(state.row),geometry:clone(state.row.cameraGeometry),cameraU16:clone(state.row.cameraU16),row4Words:clone(state.row.row4Words)},
      row4Words:clone(state.row.row4Words),frameState:state,frameSummary:{frames:state.frameNumber,commands:state.commands.length,mainState:state.mainState,presentationState:state.row.presentationState,currentActionIndex:state.row.currentActionIndex,complete:result.complete},
      functionalFramePending:!result.complete,functionalFrameComplete:result.complete,complete:result.complete,projectionComplete:false,wholeCameraComplete:result.complete,nextNumericTurnReady:!!result.nextNumericTurnReady,
      nextCommandInputRequired:result.complete&&!!result.nextNumericTurnReady,commandMenuComplete:false,wholePhysicalWorldComplete:false,
      explicitCpuDoubleProvider:cpuDoubleProvider,assetManifest:clone(input.assetManifest??null),unresolvedEffects,
      scope:result.scope??state.scope};
    return{complete:result.complete,periodicComplete:handoff.periodicComplete,budgetExhausted:!!result.budgetExhausted,stopReason:result.reason,seed:[...state.row.seed],position:state.row.position[0],camera,unresolvedEffects};
  };
}
