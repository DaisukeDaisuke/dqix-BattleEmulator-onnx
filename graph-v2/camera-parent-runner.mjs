// New enclosing entry: initial fields -> preprocessing -> real goal dispatch
// -> conditional route planning. Existing delivered phase files are immutable.
import {validateGraphInputs} from './input-domains.mjs';
import {createCameraPreprocessRunner,cameraPreprocessModelNames} from './camera-preprocess-runner.mjs';
import {createCameraGoalDispatcher,cameraDispatchModelNames,cameraDispatchBoundaryInput} from './camera-goal-dispatcher.mjs';
import {createCameraRouteBytePlanner,cameraRouteByteModelNames} from './camera-route-byte-planner.mjs';
export const cameraParentModelNames=(capacity=12)=>[...new Set([capacity===4?'rom-camera-parent-control':'rom-camera-parent-control'+capacity,'rom-camera-route-post'+capacity,...cameraPreprocessModelNames(capacity),...cameraDispatchModelNames(capacity),...cameraRouteByteModelNames(capacity===4?60:72)])];
export const CAMERA_PARENT_MODELS=cameraParentModelNames(12);
const clone=x=>structuredClone(x),pad=(a,n,v=0)=>[...a,...Array(n-a.length).fill(v)];
function cameraParentControlInput(row,commit,dispatcherReturn,capacity){const c=row.commands[row.currentActionIndex];return {battleType:[row.battleType],sourceId:[c?.participants?.[0]??0],sourcePresent:[!!c?.participants?.length],sceneByte:[row.sceneByte],dispatcherReturn:[dispatcherReturn],commit:[commit],enabled:[row.enabled!==false],ids:pad(row.roster.map(r=>r.id),capacity),rosterCount:[row.roster.length],visualFlagsBytes:pad(row.roster.flatMap(r=>Array.from({length:4},(_,i)=>Math.floor(r.visualFlags/2**(i*8))%256)),capacity*4)};}

// Inspect the genuine consumption boundary without advancing any state.
// Preprocessing leaves the IDs, command definition and special-type gate used
// here unchanged. Only `includedRows`, `dispatchEnabled` and `active` are read.
export async function createCameraRow4BoundaryPlanner({runGraph,getModel,onTrace,capacity=12,fromOuterEntry=true}={}){
 if(![4,12].includes(capacity))throw Error('Camera boundary capacity must be4 or12');
 if(typeof runGraph!=='function'||typeof getModel!=='function')throw Error('runGraph/getModel required');
 const names=[capacity===4?'rom-camera-parent-control':'rom-camera-parent-control'+capacity,'rom-camera-goal-dispatch-init'+capacity,...(fromOuterEntry?['rom-camera-admission-entry4']:[])],models=await Promise.all(names.map(name=>getModel(name)));
 async function call(index,rows){const ir=models[index];for(const [lane,row]of rows.entries()){const errors=validateGraphInputs(ir.contract,row);for(const input of ir.inputs)if(!Array.isArray(row[input.name])||row[input.name].length!==input.shape[1])errors.push(input.name+' tensor width');if(errors.length)throw Error(`row+4 boundary lane${lane}: ${errors.join('; ')}`);}const out=await runGraph(names[index],rows,{phase:'camera:row4-boundary'});if(out.length!==rows.length)throw Error('Boundary planner changed batch lanes');if(onTrace)await onTrace({phase:'camera:row4-boundary',model:names[index],inputs:clone(rows),outputs:clone(out)});return out;}
 async function run({rows}={}){
  if(!Array.isArray(rows)||!rows.length)throw Error('Nonempty camera boundary batch required');
  const admitted=fromOuterEntry?await call(2,rows.map(r=>{const c=r.commands[r.currentActionIndex];return{commandPresent:[!!c],participantPresent:[!!c?.participants?.length],sceneByte:[r.sceneByte],enabled:[r.enabled!==false]};})):null;
  const effective=rows.map((r,i)=>({...r,enabled:admitted?!!admitted[i].parentEnabled[0]:r.enabled}));
  const population=await call(0,effective.map(r=>cameraParentControlInput(r,false,0,capacity)));
  const compact=rows.map((row,i)=>({...clone(row),roster:row.roster.filter((_,j)=>population[i].includedRows[j]).map(clone),enabled:!!population[i].dispatchEnabled[0]}));
  const init=await call(1,compact.map(row=>cameraDispatchBoundaryInput(row,{capacity})));
  return {boundaries:compact.map((row,i)=>{const required=!!init[i].active[0],ids=row.roster.map(a=>a.id);return{kind:'camera-row4',required,wordCount:required?ids.length:0,rowIds:required?ids:[],compactRowIds:ids,dispatchEnabled:!!population[i].dispatchEnabled[0]};}),graphCalls:fromOuterEntry?3:2};
 }
 return {run,models:names};
}

export async function createCameraParentRunner({runGraph,getModel,onTrace,capacity=12}={}){
 if(![4,12].includes(capacity))throw Error('Camera parent capacity must be4 or12');const modelNames=cameraParentModelNames(capacity),commandCapacity=capacity===4?60:72,targetCapacity=capacity===4?8:12;
 if(typeof runGraph!=='function'||typeof getModel!=='function')throw Error('runGraph/getModel required');
 let graphCalls=0;const runtime={getModel,onTrace,runGraph:async(...args)=>{graphCalls++;return runGraph(...args);}},preprocessor=await createCameraPreprocessRunner({...runtime,capacity}),dispatcher=await createCameraGoalDispatcher({...runtime,capacity}),planner=await createCameraRouteBytePlanner({...runtime,commandCapacity});
 const control=await getModel(capacity===4?'rom-camera-parent-control':'rom-camera-parent-control'+capacity),routeIr=await getModel('rom-camera-route-byte-prepare'+(commandCapacity===60?'':commandCapacity)),postIr=await getModel('rom-camera-route-post'+capacity);
 async function gate(rows,phase){for(const [lane,row]of rows.entries()){const errors=validateGraphInputs(control.contract,row);if(errors.length)throw Error(`camera parent lane${lane}: ${errors.join('; ')}`);}const out=await runtime.runGraph(control.name,rows,{phase});if(onTrace)await onTrace({phase,model:control.name,inputs:clone(rows),outputs:clone(out)});return out;}

 async function run({rows,maxRouteAttempts=181*commandCapacity+1}={}){
  if(!Array.isArray(rows)||!rows.length)throw Error('Nonempty initial camera-parent batch required');
  for(const [lane,row]of rows.entries()){
   for(const actor of row.roster)if(!Array.isArray(actor.storedRoute)||actor.storedRoute.length!==16)throw Error(`lane${lane}: initial storedRoute16 required`);
   for(const command of row.commands){if(command.participants===null)throw Error('Use an explicit empty participant list for missing records in this joined entry');if(!Array.isArray(command.targets))throw Error('Initial target list required');if(command.targets.length&&(command.targetId!==command.targets[0]||command.targetPresent===false))throw Error('Initial command first target/list fields disagree');if(!command.targets.length&&command.targetPresent!==false)throw Error('Empty initial target list must set targetPresent=false');}
  }
  graphCalls=0;const population=await gate(rows.map(r=>cameraParentControlInput(r,false,0,capacity)),'camera:parent:roster');
  const compactRows=rows.map((row,i)=>({...clone(row),roster:row.roster.filter((_,j)=>population[i].includedRows[j]).map(clone),lookupObjects:[...(row.lookupObjects??[]).map(clone),...row.roster.filter((_,j)=>!population[i].includedRows[j]).map(clone)]}));
  const prepared=await preprocessor.run({rows:compactRows}),pre=await gate(prepared.rows.map(r=>cameraParentControlInput(r,false,0,capacity)),'camera:parent:gate');
  const dispatchInputs=prepared.rows.map((r,i)=>({...clone(r),roster:r.roster.map((a,j)=>({...clone(a),flag80:!!pre[i].flag80[j],flag100:!!pre[i].flag100[j]})),enabled:!!pre[i].dispatchEnabled[0]})),goals=await dispatcher.run({rows:dispatchInputs});
  if(!goals.complete)return {preprocessing:prepared,goals,states:clone(prepared.rows),graphCalls,complete:false,wholeCameraComplete:false,reason:'An explicit unsupported goal-dispatch branch was reached; no route or presentation result is claimed.'};
  const post=await gate(prepared.rows.map((r,i)=>cameraParentControlInput(r,true,goals.states[i].returnValue[0],capacity)),'camera:parent:commit');
  const compactStates=prepared.rows.map((r,i)=>({...clone(r),sceneByte:post[i].nextSceneByte[0],roster:r.roster.map((a,j)=>{const s=goals.states[i];return {...clone(a),start:s.actors[j*8],goal:s.actors[j*8+1],auxiliaryNode:s.actors[j*8+2],expansionDepth:s.actors[j*8+3],preferredTarget:s.actors[j*8+4],secondaryTarget:s.actors[j*8+5],faceNode:s.actors[j*8+6]};}),row4Words:Array.from({length:r.row4Words.length},(_,j)=>goals.states[i].observedRow4Bytes.slice(j*4,j*4+4).reduce((n,b,k)=>n+b*2**(k*8),0))}));
  const merge=()=>compactStates.map((s,i)=>({...clone(rows[i]),sceneByte:s.sceneByte,row4Words:[...s.row4Words],roster:rows[i].roster.map(a=>clone(s.roster.find(b=>b.id===a.id)??a)),activeRosterIds:s.roster.map(a=>a.id)}));
  const defaults=Object.fromEntries(Object.entries(routeIr.contract.defaults).map(([k,v])=>[k,Array.isArray(v)?clone(v):[v]]));
  const routeInputs=compactStates.map((s,i)=>{
   if(!post[i].routeEnabled[0])return {...clone(defaults),rosterCount:[0],actionCount:[0],currentActionIndex:[0],enabled:[false]};
   return {...clone(defaults),roster:pad(s.roster.flatMap(a=>[a.id,a.start,a.goal]),36),rosterCount:[s.roster.length],actionActors:pad(s.commands.map(c=>c.participants[0]??65535),commandCapacity,65535),actionPresent:pad(s.commands.map(c=>!!c.participants.length),commandCapacity,false),actionCount:[s.commands.length],currentActionIndex:[s.currentActionIndex],storedRoutes:pad(s.roster.flatMap(a=>a.storedRoute),192),enabled:[true]};
  });
  const routes=await planner.run({rows:routeInputs,maxAttempts:maxRouteAttempts});
  if(!routes.complete)return {preprocessing:prepared,goals,states:merge(),control:post,routes,graphCalls,complete:false,wholeCameraComplete:false,reason:'Route attempt budget exhausted; no completed parent endpoint is claimed.'};
  compactStates.forEach((s,i)=>{if(post[i].routeEnabled[0])s.roster.forEach((a,j)=>{a.routeCount=routes.output[i].routeCounts[j];a.storedRoute=routes.output[i].routes.slice(j*16,j*16+16);});});
  const states=merge(),flagInputs=states.map((s,i)=>{const command=s.commands[s.currentActionIndex];return {ids:pad(s.roster.map(a=>a.id),capacity),objectCount:[s.roster.length],visualPresent:pad(s.roster.map(a=>a.visualPresent!==false),capacity,false),activeRoster:population[i].includedRows,visualFlagsBytes:pad(s.roster.flatMap(a=>Array.from({length:4},(_,j)=>Math.floor(a.visualFlags/2**(8*j))%256)),capacity*4),routeCounts:pad(s.roster.map(a=>a.routeCount),capacity),movementPresence:pad(s.roster.map(a=>a.movementPresence),capacity),partyMovementBlocked:pad(s.roster.map(a=>!!a.partyMovementBlocked),capacity,false),dead:pad(s.roster.map(a=>!!a.dead),capacity,false),sceneMovementEnabled:[!!s.sceneMovementEnabled],actionActors:pad(s.commands.map(c=>c.participants[0]??65535),commandCapacity,65535),actionPresent:pad(s.commands.map(c=>!!c.participants.length),commandCapacity,false),actionCount:[s.commands.length],currentParticipants:pad(command?.participants??[],capacity),participantCount:[command?.participants.length??0],currentTargets:pad(command?.targets??[],targetCapacity),targetCount:[command?.targets.length??0],enabled:post[i].routeEnabled};});
  for(const [lane,row]of flagInputs.entries()){const errors=validateGraphInputs(postIr.contract,row);if(errors.length)throw Error(`camera parent post lane${lane}: ${errors.join('; ')}`);}
  const flagResults=await runtime.runGraph(postIr.name,flagInputs,{phase:'camera:parent:route-post'});if(onTrace)await onTrace({phase:'camera:parent:route-post',model:postIr.name,inputs:clone(flagInputs),outputs:clone(flagResults)});
  states.forEach((s,i)=>s.roster.forEach((a,j)=>{a.visualFlags=flagResults[i].nextVisualFlagsBytes.slice(j*4,j*4+4).reduce((n,b,k)=>n+b*2**(k*8),0);}));
  return {preprocessing:prepared,goals,states,population,control:post,routes,routePost:flagResults,graphCalls,complete:true,wholeCameraComplete:false,consumed:states.map(()=>0),scope:'Initial-only projection of enclosing JPN021dc9cc: battle-type roster selection, mandatory preprocessing, special800/801+party0 early return, goal dispatcher, scene-bit2 commit, conditional route planner including invalid-byte path rejection, and ordered visual-flag suffix. Every actual compact row receives one external uint32 row+4 word; subsequent writes are retained. No font, resource loader, stack-residue generator or expected intermediate state is required. Outer BACT/presentation and final geometry remain separate. Excluded existing objects stay in the lookup population; actual suffix ID lookups may still update their represented flags. Skipped dispatcher/planner lanes keep initial or preprocessing-updated fields and RNG.'};
 }
 return {run,models:modelNames};
}
