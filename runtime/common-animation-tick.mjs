import {createCommonAnimationExecutionRunner,COMMON_ANIMATION_EXECUTION_MODELS} from './common-animation-execution.mjs';
import {COMMON_ANIMATION_STATE_OFFSETS} from '../graph-v2/common-animation-fields.mjs';
import {validateGraphInputs} from '../graph-v2/input-domains.mjs';

const clone=x=>structuredClone(x),scalar=(o,k)=>Number(o[k]?.[0]);
export const COMMON_ANIMATION_TICK_MODELS=[...COMMON_ANIMATION_EXECUTION_MODELS,'rom-common-animation-initialize','rom-common-animation-tick'];

export function createCommonAnimationTickRunner(options){
 const {runGraph,getModel,onTrace}=options,execution=createCommonAnimationExecutionRunner(options);
 async function call(input){
  const name='rom-common-animation-tick',ir=await getModel(name);if(!ir)throw Error('Missing shared animation tick model');
  const values={...ir.contract.defaults,...input},feeds=Object.fromEntries(ir.inputs.map(v=>[v.name,Array.isArray(values[v.name])?values[v.name]:[values[v.name]]]));
  const errors=validateGraphInputs(ir.contract,feeds);if(errors.length)throw Error(errors.join('; '));
  const out=(await runGraph(name,[feeds]))[0];await onTrace?.({model:name,inputs:[clone(feeds)],outputs:[clone(out)]});return out;
 }
 async function run({state:original,input,maxTransitions=4096,signal,shouldStop}={}){
  if(!Number.isInteger(maxTransitions)||maxTransitions<1)throw Error('A positive script-body transition budget is required');
  let state=clone(original),transitions=0,context=input??state.pendingTick?.input;
  if(!context)throw Error('Actual script-body inputs are required');
  if(state.pendingTick&&JSON.stringify(context)!==JSON.stringify(state.pendingTick.input))throw Error('A retained script tick cannot replace its original inputs');
  const stopped=()=>signal?.aborted||shouldStop?.(),pending=(reason,extra={})=>({complete:false,state,transitions,pending:reason,...extra});
  if(!state.pendingTick){
   if(stopped())return pending('User stopped before script body',{stopped:true,budgetExhausted:true});
   const prefix=await call({...context,phase:0});transitions++;
   if(!scalar(prefix,'supported'))return pending(scalar(prefix,'requiresActorResourcePrecheck')?'The actual actor-resource precheck must execute':'Original script resource jobs require their shared producer');
   state.scriptOwnerGlobalU16=[...prefix.nextScriptOwnerGlobalU16];state.eventFlagsU16=[...prefix.nextEventFlagsU16];
   if(scalar(prefix,'returnedBeforeLoop'))return{complete:true,state,transitions,returnedBeforeLoop:true,loopExecuted:false,tailExecuted:false};
   state.scriptOwnerPresent=true;state.pendingTick={phase:'loop',input:clone(context)};
  }
  if(state.pendingTick.phase==='loop'){
   if(transitions>=maxTransitions)return pending('Script-body transition budget exhausted',{budgetExhausted:true});
   const loop=await execution.run({state,maxTransitions:maxTransitions-transitions,signal,shouldStop});state=loop.state;transitions+=loop.transitions;
   if(!loop.complete)return pending(loop.pending,{budgetExhausted:loop.budgetExhausted??loop.stopped??false,stopped:loop.stopped??false,opcode:loop.opcode});
   state.pendingTick={phase:'tail',input:clone(context)};
  }
  if(state.pendingTick.phase!=='tail')throw Error('Unknown retained script-body boundary');
  if(transitions>=maxTransitions||stopped())return pending('Script-body transition budget exhausted before mandatory tail',{budgetExhausted:true});
  const fields=state.scriptStateU16;if(!Array.isArray(fields)||fields.length!==COMMON_ANIMATION_STATE_OFFSETS.length)return pending('Actual initialized script-state fields are required');
  const index=COMMON_ANIMATION_STATE_OFFSETS.indexOf(0x224),tail=await call({...context,phase:1,loopReachedTail:true,scriptOwnerGlobalU16:state.scriptOwnerGlobalU16,eventFlagsU16:state.eventFlagsU16,tailOwnerU16:fields.slice(index,index+2)});transitions++;
  if(!scalar(tail,'supported'))return pending(scalar(tail,'requiresFeedback')?'Original animation feedback needs its shared producer':scalar(tail,'requiresTimeline')?'Original timeline update needs its shared producer':'Original animation tail effect needs its shared producer');
  if(!scalar(tail,'tailExecuted'))throw Error('The actual mandatory script tail did not execute');
  state.eventFlagsU16=[...tail.nextEventFlagsU16];state.scriptOwnerGlobalU16=[...tail.nextScriptOwnerGlobalU16];state.tailOwnerPresent=!!scalar(tail,'tailOwnerPresent');delete state.pendingTick;
  return{complete:true,state,transitions,returnedBeforeLoop:false,loopExecuted:true,tailExecuted:true,scope:'The original opcode loop and its qualified quiet mandatory tail executed; outer UI/camera/scene completion is separate.'};
 }
 return{run,models:COMMON_ANIMATION_TICK_MODELS};
}
