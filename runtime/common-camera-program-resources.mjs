// The packaged metadata replaces resource transport, not camera computation.
// Missing resident programs still follow the original archive/first-root and
// fallback branches. The already computed planning state is never repeated.
import {COMMON_CAMERA_PROGRAM_DATA} from '../data/common-camera-program-data.mjs';
import {createCameraProgramRunner,CAMERA_PROGRAM_MODELS} from '../graph-v2/camera-program-runner.mjs';
import {createCameraRetainedMemoryRunner} from '../graph-v2/camera-retained-memory-runner.mjs';
import {createCommonProgramAdmissionRunner,COMMON_PROGRAM_ADMISSION_MODELS} from './common-program-admission.mjs';
import {validateGraphInputs} from '../graph-v2/input-domains.mjs';

export const COMMON_CAMERA_RESOURCE_MODELS=[...new Set([...CAMERA_PROGRAM_MODELS,...COMMON_PROGRAM_ADMISSION_MODELS,'rom-common-presentation-resource'])];
export {COMMON_CAMERA_PROGRAM_DATA};
const clone=x=>structuredClone(x),limbs=x=>[x%65536,Math.floor(x/65536)];

export function withPackagedCameraPrograms(initial){
 const next=clone(initial);
 // An explicit pointer, including -1, describes the caller's initial state.
 // Omission uses the actual shared default loaded by the original scene setup.
 if(next.fallbackProgram===undefined){
  const member=COMMON_CAMERA_PROGRAM_DATA.archives.find(a=>a.path==='data/bin/actdef.nsarc')?.members.find(m=>m.path==='default.bact');
  if(!member)throw Error('Packaged scene default definitions are absent');
  const programs=next.residentPrograms??[],offset=programs.length;
  next.residentPrograms=[...programs,...member.programs.map(p=>({...clone(p),next:p.next<0?-1:offset+p.next}))];
  next.fallbackProgram=member.programs.length?offset:-1;
  next.fallbackProgramSource={archive:'data/bin/actdef.nsarc',member:member.path,sha256:member.sha256};
 }
 return next;
}

export function retainCameraResult(result,row){
 const g=clone(result.cameraGeometry[0]),current=clone(result.states[0]);
 return{...current,cameraGeometry:g,cameraU16:[...result.cameraU16[0]],cameraState:[g.counter,g.globals7[0],g.globals7[1],g.globals7[3],g.globals7[4]],cameraInitialized:!!g.initialized,commandBaseU16:[...row.commandBaseU16],cameraRngPointerU16:[...row.cameraRngPointerU16],retainedMemoryOrigin:'computed-previous-outer-v1'};
}

export async function createCameraProgramResourceRunner({runGraph,runDoubleGraph,getModel,onTrace}={}){
 const search=await createCameraProgramRunner({runGraph,getModel,onTrace}),initialize=await createCameraRetainedMemoryRunner({runGraph,runDoubleGraph,getModel,onTrace,admissionFactory:createCommonProgramAdmissionRunner});
 async function call(values){
  const ir=await getModel('rom-common-presentation-resource'),input=Object.fromEntries(ir.inputs.map(f=>{const value=values[f.name]??ir.contract.defaults[f.name];return[f.name,Array.isArray(value)?value:[value]];})),errors=validateGraphInputs(ir.contract,input);
  if(errors.length)throw Error('Camera program resource transition: '+errors.join('; '));
  const out=(await runGraph(ir.name,[input],{phase:'camera:packaged-program:control'}))[0];await onTrace?.({phase:'camera:packaged-program:control',model:ir.name,inputs:[clone(input)],outputs:[clone(out)]});return out;
 }
 async function run({row,maxRouteAttempts=10861}){
  let state=clone(row);if(state.presentationState!==4)return{complete:true,row:state,initializations:0};
  const current=state.commands[state.currentActionIndex],record=state.rawActions.map(h=>Uint8Array.from(h.match(/../g),x=>parseInt(x,16))).find(b=>(b[4]+256*b[5])%4096===current?.actionId);
  if(!record)return{complete:false,row:state,reason:'Missing original action definition for camera program continuation'};
  const requests=(state.resourceRequests??[]).filter(r=>r.directory===22);if(requests.length!==1)return{complete:false,row:state,reason:'Required camera program archive request is absent or ambiguous'};
  const archive=COMMON_CAMERA_PROGRAM_DATA.archives.find(a=>a.path==='data/skill/'+requests[0].outerFilename);
  if(!archive)return{complete:false,row:state,reason:'Required camera program archive metadata is not packaged'};
  const definition=(record[4]+256*record[5])%4096,operation=Math.floor(record[24]/32)+8*(record[25]%16),member=archive.members.find(m=>m.path==='sp'+String(definition).padStart(3,'0')+'.bact'),primary=member?.programs[0]??null;
  // These are facts about packaged immutable definitions. No elapsed-frame or
  // loader result is guessed, and no expected intermediate state is supplied.
  const values={phase:0,presentationState:state.presentationState,taskStatus:1,loadedFilePresent:true,loadedFileSizeU16:limbs(archive.byteLength),archiveLookupComplete:true,actionMemberPresent:!!member,programParseComplete:true,parsedProgramPresent:!!primary,actionRecordPresent:true,actionDefinitionId:definition,actionOperation:operation,taskIdU16:[0,0],fallbackGlobal8U16:state.fallbackGlobal8U16??[0,0],fallbackGlobal10U16:state.fallbackGlobal10U16??[0,0],enabled:state.enabled!==false};
  let control=await call(values),initializations=0;const history=[];
  const apply=async(program,origin)=>{
   const result=await initialize.run({rows:[{...clone(state),loadedProgram:clone(program)}],maxRouteAttempts});
   if(!result.complete)return{complete:false,row:state,reason:result.reason??'Packaged camera program initialization is unsupported'};
   state=retainCameraResult(result,state);initializations++;history.push({...origin,computedPosition:state.position[0],computedSeed:[...state.seed]});return null;
  };
  if(!control.supported[0])return{complete:false,row:state,reason:'Packaged camera program metadata is incomplete'};
  if(control.requestPrimaryInitialize[0]){const failure=await apply(primary,{kind:'archive-first-root',archive:archive.path,member:member.path,sha256:member.sha256});if(failure)return failure;}
  control=await call({...values,phase:1,presentationState:state.presentationState});
  if(control.requestFallbackLookup[0]){
   const match=(await search.search({requests:[{programs:state.residentPrograms,head:state.fallbackProgram??-1,action:control.fallbackActionId[0]}]}))[0],fallback=state.residentPrograms[match[1]]??null;
   const last={...values,phase:2,presentationState:state.presentationState,fallbackProgramPresent:!!fallback,fallbackInitialized:false};
   control=await call(last);
   if(control.requestFallbackInitialize[0]){const failure=await apply(fallback,{kind:'scene-fallback',actionId:control.fallbackActionId[0],programIndex:match[1]});if(failure)return failure;control=await call({...last,presentationState:state.presentationState,fallbackInitialized:true});}
  }
  if(!control.supported[0]||!control.removeTask[0])return{complete:false,row:state,reason:'Camera program continuation did not reach the original completion branch'};
  state.presentationState=control.nextPresentationState[0];state.fallbackGlobal8U16=[...control.nextFallbackGlobal8U16];state.fallbackGlobal10U16=[...control.nextFallbackGlobal10U16];
  state.cameraProgramHistory=[...(state.cameraProgramHistory??[]),...history];
  state.resourceRequests=(state.resourceRequests??[]).filter(r=>r.directory!==22);
  return{complete:true,row:state,initializations,history,outerPlanningRepeated:false,row4Consumed:false};
 }
 return{run,models:COMMON_CAMERA_RESOURCE_MODELS};
}
