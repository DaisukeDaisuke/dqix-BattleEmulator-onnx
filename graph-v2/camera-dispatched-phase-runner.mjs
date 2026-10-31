// New composition entry point: the initial command lists choose the goals.
// The previously delivered phase and all eight frozen dependencies are reused
// byte-for-byte. No actual-ROM intermediate observation is an input here.
import {createCameraGoalDispatcher,CAMERA_DISPATCH_MODELS} from './camera-goal-dispatcher.mjs';
import {createCameraPhaseRunner,CAMERA_PHASE_MODELS,CAMERA_PHASE_OPTIONAL_MODELS} from './camera-phase-runner.mjs';
export const CAMERA_DISPATCHED_PHASE_MODELS=[...new Set([...CAMERA_DISPATCH_MODELS,...CAMERA_PHASE_MODELS,...CAMERA_PHASE_OPTIONAL_MODELS])];
export async function createCameraDispatchedPhaseRunner({runGraph,getModel,onTrace}={}){
 let graphCalls=0;const runtime={getModel,onTrace,runGraph:async(...args)=>{graphCalls++;return runGraph(...args);}},dispatcher=await createCameraGoalDispatcher(runtime),phase=await createCameraPhaseRunner(runtime);
 async function run({rows,maxRouteAttempts=10861}={}){
  if(!Array.isArray(rows)||!rows.length)throw Error('A nonempty batch is required');
  for(let i=0;i<rows.length;i++){
   const row=rows[i];if(row.goalCalls!==undefined)throw Error('Explicit goalCalls are not inputs to this dispatcher-driven phase');
   for(const a of row.roster)if(!Array.isArray(a.storedRoute)||a.storedRoute.length!==16)throw Error(`lane${i}: initial storedRoute16 required`);
   if(!row.presentation||!row.geometry||!row.camera||!Array.isArray(row.seed)||!Array.isArray(row.position)||!Array.isArray(row.cameraState))throw Error(`lane${i}: observed initial presentation/camera/radius and RNG state required`);
  }
  graphCalls=0;const goals=await dispatcher.run({rows});
  if(!goals.complete||goals.states.some(s=>!s.returnValue[0]))return {goals,states:structuredClone(rows),graphCalls,complete:false,wholeCameraComplete:false,reason:!goals.complete?'An explicit unsupported dispatcher branch was reached; route/selector/RNG were not executed.':'Dispatcher returned0 in at least one lane. The enclosing presentation bypass path is not connected; route/selector/RNG were not executed.'};
  const phaseRows=rows.map((row,i)=>{
   const s=goals.states[i],init=goals.initial[i],sourceRow=init.sourceRow[0],targetRow=init.targetRow[0],current=row.commands[row.currentActionIndex],history=[...row.presentation.history];
   history[0]=current.actionId;history[1]=init.resolvedCurrentSourceId[0];history[2]=init.resolvedCurrentTargetId[0];history[7]=row.currentActionIndex;
   const actors=row.roster.map((a,j)=>({id:a.id,class:s.classes[j],start:s.actors[j*8],goal:s.actors[j*8+1],aux:s.actors[j*8+2],depth:s.actors[j*8+3],cachedTarget:s.actors[j*8+4],faceNode:s.actors[j*8+6],flag400:!!a.flag400,descriptorPresent:!!a.descriptorPresent,storedRoute:[...a.storedRoute]}));
   return {occupancy:s.occupancy,actors,observedRow4Bytes:s.observedRow4Bytes,goalCalls:[],actionActors:row.commands.map(c=>c.participants?.[0]??65535),actionPresent:row.commands.map(c=>!!c.participants?.length),currentActionIndex:row.currentActionIndex,seed:row.seed,position:row.position,cameraState:row.cameraState,presentation:{...structuredClone(row.presentation),history},geometry:{...structuredClone(row.geometry),sourcePosition:[...row.roster[sourceRow].position],targetPosition:[...row.roster[targetRow].position]},camera:structuredClone(row.camera)};
  });
  if(phaseRows.some(s=>s.actors.some(a=>a.start>80||a.goal>80)))return {goals,states:structuredClone(rows),graphCalls,complete:false,wholeCameraComplete:false,reason:'A dispatcher endpoint is outside the connected route model domain0..80; route/selector/RNG were not executed.'};
  const output=await phase.run({rows:phaseRows,maxRouteAttempts});return {...output,goals,graphCalls,wholeCameraComplete:false,scope:'Initial command lists and the observed compact roster now drive ROM-weighted goal dispatch, ordered occupancy, nearest correction, member/nonmember/fallback assignment, compressed path planning and distance/selector/free-camera RNG. Explicit goalCalls and expected selected goals are not supplied. Four correlated row+4 words, initial world coordinates/radii, presentation program/history and the free-camera record/height observations remain external. The flagged action9..11 corridor, dispatcher-return0 presentation bypass, upstream allocation/BACT selection and final renderer geometry are outside this entry point. Each component has separately scoped actual-ROM proof; this composition is not an additional enclosing whole-camera execution.'};
 }
 return {run,models:CAMERA_DISPATCHED_PHASE_MODELS};
}
