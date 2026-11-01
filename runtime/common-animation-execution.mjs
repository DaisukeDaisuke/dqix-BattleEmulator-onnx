import {validateGraphInputs} from '../graph-v2/input-domains.mjs';
import {COMMON_ANIMATION_STATE_OFFSETS,COMMON_ANIMATION_STATE_OPCODES,COMMON_ANIMATION_RESET_BASE,COMMON_ANIMATION_RESET_WORDS,commonAnimationPayload} from '../graph-v2/common-animation-fields.mjs';

const clone=x=>structuredClone(x),scalar=(o,k)=>Number(o[k]?.[0]);
export const COMMON_ANIMATION_EXECUTION_MODELS=['rom-common-animation-dispatch','rom-common-animation-state','rom-common-animation-reset'];

// Only structural scheduling lives here. Opcode decisions, return handling and
// state stores execute in shared ONNX. Resource handlers use the same explicit
// producer callback as the enclosing frame; they must retain their real state.
export function createCommonAnimationExecutionRunner({runGraph,getModel,executeOpcode,onTrace}={}){
 async function call(name,values){
  const ir=await getModel(name);if(!ir)throw Error('Missing common animation model '+name);
  const merged={...ir.contract.defaults,...values},input=Object.fromEntries(ir.inputs.map(d=>[d.name,Array.isArray(merged[d.name])?merged[d.name]:[merged[d.name]]]));
  const errors=validateGraphInputs(ir.contract,input);if(errors.length)throw Error(name+': '+errors.join('; '));
  const output=(await runGraph(name,[input]))[0];await onTrace?.({model:name,inputs:[clone(input)],outputs:[clone(output)]});return output;
 }
 function current(state){
  const codes=state.program?.codes;if(!Array.isArray(codes)||codes.length>16777214)throw Error('Actual linked program nodes are required');
  const index=state.cursorIndex===null?-1:state.cursorIndex;
  if(!Number.isInteger(index)||index<-1||index>=codes.length)throw Error('Script cursor is outside the actual linked program');
  const code=index<0?null:codes[index];if(code?.next!==undefined)throw Error('Linked codes must preserve sequential constructor order');
  return{index,code,next:index<0||index+1===codes.length?-1:index+1};
 }
 function pending(state,message,transitions,extra={}){return{complete:false,pending:message,state,transitions,tailReached:false,...extra};}
 async function run({state:input,maxTransitions=4096,signal,shouldStop}={}){
  if(!Number.isInteger(maxTransitions)||maxTransitions<1)throw Error('A positive animation transition budget is required');
  let state=clone(input),transitions=0;
  if(!Array.isArray(state.scriptStateU16)||state.scriptStateU16.length!==COMMON_ANIMATION_STATE_OFFSETS.length)return pending(state,'The actual initialized script state fields are required',0);
  if(state.scriptOwnerPresent!==true)return pending(state,'The actual current script-owner global is required',0);
  while(transitions<maxTransitions){
   if(signal?.aborted||shouldStop?.())return pending(state,'User stopped the animation loop',transitions,{stopped:true});
   const cursor=current(state),work=state.pendingDispatch;
   if(work?.phase==='handler'){
    if(cursor.index!==work.index||cursor.code?.opcode!==work.opcode)throw Error('Retained opcode continuation no longer identifies the current node');
    if(COMMON_ANIMATION_STATE_OPCODES.includes(work.opcode)){
     const code=cursor.code;
     if(!Array.isArray(code.payloadU16)||!Array.isArray(code.payloadMaskU16))return pending(state,'Actual constructed payload bytes and written-bit masks are required',transitions);
     const o=await call('rom-common-animation-state',{opcode:work.opcode,stateU16:state.scriptStateU16,...commonAnimationPayload(code),scriptOwnerPresent:true,enabled:true});transitions++;
     if(!scalar(o,'supported')||!scalar(o,'handlerCompleted'))return pending(state,'Original opcode reads payload bits not yet produced by the constructor',transitions);
     state.scriptStateU16=[...o.nextStateU16];
     if(state.scriptResetU16)COMMON_ANIMATION_STATE_OFFSETS.forEach((at,i)=>{const slot=(at-COMMON_ANIMATION_RESET_BASE)/2;if(slot>=0&&slot<COMMON_ANIMATION_RESET_WORDS)state.scriptResetU16[slot]=state.scriptStateU16[i];});
     state.pendingDispatch={phase:'return',handlerReturnU16:[...o.handlerReturnU16]};
    }else if(work.opcode===61){
     if(!Array.isArray(state.scriptResetU16)||state.scriptResetU16.length!==COMMON_ANIMATION_RESET_WORDS||!Array.isArray(state.commandPointerU16)||state.commandPointerU16.length!==2)return pending(state,'Opcode61 requires its retained raw reset block and actual current command pointer',transitions);
     const o=await call('rom-common-animation-reset',{scriptBlockU16:state.scriptResetU16,commandPointerU16:state.commandPointerU16,scriptOwnerPresent:true,enabled:true});transitions++;
     if(!scalar(o,'supported')||!scalar(o,'handlerCompleted'))return pending(state,'Original reset helper did not complete',transitions);
     state.scriptResetU16=[...o.nextScriptBlockU16];
     COMMON_ANIMATION_STATE_OFFSETS.forEach((at,i)=>{const slot=(at-COMMON_ANIMATION_RESET_BASE)/2;if(slot>=0&&slot<COMMON_ANIMATION_RESET_WORDS)state.scriptStateU16[i]=state.scriptResetU16[slot];});
     state.pendingDispatch={phase:'return',handlerReturnU16:[...o.handlerReturnU16]};
    }else{
     if(!executeOpcode)return pending(state,'Original animation opcode'+work.opcode+' needs its common producer',transitions,{opcode:work.opcode});
     const result=await executeOpcode({state:clone(state),index:cursor.index,code:clone(cursor.code),continuation:clone(work.continuation??null),maxTransitions:maxTransitions-transitions,signal,shouldStop});
     transitions+=result?.transitions??0;
     if(result?.state)state=clone(result.state);
     if(!result?.complete){state.pendingDispatch={...work,continuation:clone(result?.continuation??work.continuation??null)};return pending(state,result?.pending??'Original opcode producer remains incomplete',transitions,{opcode:work.opcode,budgetExhausted:!!result?.budgetExhausted,stopped:!!result?.stopped});}
     if(!Array.isArray(result.handlerReturnU16)||result.handlerReturnU16.length!==2)throw Error('A completed original opcode producer must supply its computed return limbs');
     state.pendingDispatch={phase:'return',handlerReturnU16:[...result.handlerReturnU16]};
    }
    continue;
   }
   if(work&&work.phase!=='return')throw Error('Unknown retained animation dispatch phase');
   const o=await call('rom-common-animation-dispatch',{phase:work?1:0,cursorIndex:cursor.index,nextCursorIndex:cursor.next,opcode:cursor.code?.opcode??0,skipDepth:state.scriptStateU16[COMMON_ANIMATION_STATE_OFFSETS.indexOf(0x57c)],handlerReturnU16:work?.handlerReturnU16??[0,0],handlerCompleted:!!work,enabled:true});transitions++;
   if(!scalar(o,'supported'))return pending(state,'Original animation dispatch requires an implemented opcode or valid post-handler cursor',transitions);
   const next=scalar(o,'resultCursorIndex');state.cursorIndex=next<0?null:next;delete state.pendingDispatch;
   if(scalar(o,'requiresHandler'))state.pendingDispatch={phase:'handler',index:cursor.index,opcode:cursor.code.opcode};
   else if(scalar(o,'tailReached'))return{complete:true,state,transitions,tailReached:true,cursorExhausted:state.cursorIndex===null,scope:'Original opcode loop completed to its mandatory tail boundary. Feedback, timeline, resource prechecks and frame completion remain separate producers.'};
   else if(!scalar(o,'continueLoop'))throw Error('Original animation dispatch produced no valid continuation');
  }
  return pending(state,'Animation transition budget exhausted',transitions,{budgetExhausted:true});
 }
 return{run,models:COMMON_ANIMATION_EXECUTION_MODELS,stateOffsets:COMMON_ANIMATION_STATE_OFFSETS};
}
