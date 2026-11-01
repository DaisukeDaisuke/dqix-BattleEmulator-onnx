import {createCameraAdmissionEventRunner,CAMERA_ADMISSION_EVENT_MODELS} from './camera-admission-event-runner.mjs';
import {validateGraphInputs} from './input-domains.mjs';
import {cameraAdmissionInitial} from './camera-admission-initial.mjs';
import {seedBytes} from './reference.mjs';
const clone=x=>structuredClone(x),bytes=x=>Array.from({length:4},(_,i)=>(x>>>(8*i))&255),word=b=>b.reduce((s,x,i)=>s+x*2**(8*i),0);
export const CAMERA_WORLD_PREFIX_MODELS=[...CAMERA_ADMISSION_EVENT_MODELS,'rom-camera-world-prefix1'];
export function cameraWorldInitial(c){
 const row=cameraAdmissionInitial(c);
 function complete(r){return{...r,rotation:r.rotation??r.rotationXYZ??[0,0,0],orientationAE:r.orientationAE??0,pendingFacingTarget:r.pendingFacingTarget??0,objectIndex:r.objectIndex??r.id,behaviorBE:r.behaviorBE??0};}
 return{...row,roster:row.roster.map(complete),lookupObjects:row.lookupObjects.map(complete),seed:seedBytes(BigInt(c.seed)),position:[1],cameraState:[c.counter??0,c.sample100??77,c.appliedMode??3,c.heightQ12??12345,c.angleQ12??-23456],resourceFlags04:c.resourceFlags04??0,sceneByte71c5:c.sceneByte71c5??0,programFlags3e8:c.programFlags3e8??0,enabled:true};
}
export async function createCameraWorldPrefixRunner({runGraph,getModel,onTrace,admissionFactory}={}){
 let graphCalls=0;const runtime={getModel,onTrace,admissionFactory,runGraph:async(...args)=>{graphCalls++;return runGraph(...args);}},previous=await createCameraAdmissionEventRunner(runtime),ir=await getModel('rom-camera-world-prefix1');
 async function run({rows,maxRouteAttempts=10861}={}){
  graphCalls=0;const prior=await previous.run({rows:clone(rows),maxRouteAttempts});if(!prior.complete)return{...prior,graphCalls,wholeCameraComplete:false};
  const input=[],bindings=[];
  for(const[lane,state]of prior.states.entries()){
   const decision=prior.event.decisions[lane],forced=!!decision.forced[0]&&!!decision.callFreeCamera[0],snap=!!decision.callFreeCamera[0],command=state.commands[state.currentActionIndex],source=command?.participants?.[0]??-1,target=command?.targets?.[0]??-1,members=new Set(state.activeRosterIds??state.roster.map(r=>r.id));
   for(const [population,list]of [['roster',state.roster],['lookupObjects',state.lookupObjects??[]]])for(const[index,object]of list.entries()){
    const exists=object.lookupPresent!==false;
    const value={start:[object.start??0],goal:[object.goal??255],auxiliaryNode:[object.auxiliaryNode??255],routeCount:[object.routeCount??0],routeStep:[object.routeStep??0],routeTime:[object.routeTime??0],visualPosition:[...object.routePositionXYZ],resetPosition:[...object.resetPositionXYZ],worldPosition:[...object.position],rotation:[...object.rotation],orientationAE:[object.orientationAE],flagsBytes:bytes(object.visualFlags??0),visualPresent:[object.visualPresent!==false],restoreActor:[forced&&exists&&members.has(object.id)],restoreSource:[forced&&exists&&object.id===source],isTarget:[object.id===target],snapActor:[snap&&exists&&(object.id>=192&&object.id<=199||object.id<=3&&object.partyStatePresent!==false)],enabled:[state.enabled!==false&&state.selectorReached]};
    const errors=validateGraphInputs(ir.contract,value);for(const d of ir.inputs)if(!Array.isArray(value[d.name])||value[d.name].length!==d.shape[1])errors.push(`${d.name}:width`);if(errors.length)throw Error(`world lane${lane} actor${object.id}: ${errors.join('; ')}`);
    input.push(value);bindings.push({lane,population,index,id:object.id});
   }
  }
  const output=input.length?await runtime.runGraph(ir.name,input,{phase:'camera:world-prefix'}):[];
  if(onTrace&&input.length)await onTrace({phase:'camera:world-prefix',model:ir.name,inputs:clone(input),outputs:clone(output)});
  const states=clone(prior.states);
  bindings.forEach(({lane,population,index},j)=>{const o=output[j],a=states[lane][population][index];Object.assign(a,{start:o.nextStart[0],goal:o.nextGoal[0],auxiliaryNode:o.nextAuxiliaryNode[0],routeCount:o.nextRouteCount[0],routeStep:o.nextRouteStep[0],routeTime:o.nextRouteTime[0],routePositionXYZ:o.nextVisualPosition,resetPositionXYZ:o.nextResetPosition,position:o.nextWorldPosition,rotation:o.nextRotation,orientationAE:o.nextOrientationAE[0],visualFlags:word(o.nextFlagsBytes)});});
  return{states,prior,worldInputs:input,worldOutputs:output,worldBindings:bindings,graphCalls,complete:true,wholeCameraComplete:false,scope:'Initial outer inputs through the already verified admission/selector/RNG projection, extended with forced per-object node restoration and the world-snap projection. Desired facing after the later pending-target suffix, route finalize, scene final-mode dispatch, resource flag changes, full polar camera geometry and animation buffers remain separate; these states are explicitly before that tail, not final whole-camera states. The original four-word row+4 observation remains initial-only and correlated.'};
 }
 return{run,runRows:(rows,options={})=>run({rows,...options}),models:CAMERA_WORLD_PREFIX_MODELS};
}
