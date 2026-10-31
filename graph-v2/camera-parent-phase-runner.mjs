// Additive camera entry. The parent is proved through its real return; the
// following observed presentation occurrence has its own component proof.
import {createCameraParentRunner,CAMERA_PARENT_MODELS} from './camera-parent-runner.mjs';
import {createCameraEventRunner,CAMERA_EVENT_MODELS} from './camera-event-runner.mjs';
export const CAMERA_PARENT_PHASE_MODELS=[...new Set([...CAMERA_PARENT_MODELS,...CAMERA_EVENT_MODELS])];
const clone=x=>structuredClone(x);
export async function createCameraParentPhaseRunner({runGraph,getModel,onTrace}={}){
 let graphCalls=0;const runtime={getModel,onTrace,runGraph:async(...args)=>{graphCalls++;return runGraph(...args);}},parent=await createCameraParentRunner(runtime),event=await createCameraEventRunner(runtime);
 async function run({rows,maxRouteAttempts=10861}={}){
  if(!Array.isArray(rows)||!rows.length)throw Error('A nonempty initial parent camera batch is required');
  for(const [i,row]of rows.entries()){
   if(typeof row.programPresent!=='boolean')throw Error(`lane${i}: observed BACT/program presence is required`);
   if(!row.presentation||!row.geometry||!row.camera||!Array.isArray(row.seed)||row.seed.length!==8||!Array.isArray(row.position)||row.position.length!==1||!Array.isArray(row.cameraState)||row.cameraState.length!==5)throw Error(`lane${i}: explicit initial presentation, RNG and camera observations required`);
   if(!Array.isArray(row.presentationParticipantIds)||row.presentationParticipantIds.length>12)throw Error(`lane${i}: observed presentation participant-ID list0..12 required`);
  }
  graphCalls=0;const entry=await parent.run({rows:clone(rows),maxRouteAttempts});
  if(!entry.complete)return {...entry,graphCalls,wholeCameraComplete:false};
  const states=clone(entry.states),eventRows=[];
  for(let i=0;i<states.length;i++){
   const s=states[i],command=s.commands[s.currentActionIndex],sourceId=command?.participants[0]??-1,targetId=command?.targets[0]??-1;
   const source=s.roster.find(a=>a.id===sourceId),target=s.roster.find(a=>a.id===targetId),sourceIndex=s.roster.findIndex(a=>a.id===sourceId);
   // Parent handles cache lookups outside its compact roster. Full presentation
   // requires those objects' actual route/world state; do not fabricate it.
   if(s.programPresent&&((sourceId>=0&&!source)||(targetId>=0&&!target)||s.presentationParticipantIds.some(id=>!s.roster.some(a=>a.id===id))))return {states,parent:entry,graphCalls,complete:false,wholeCameraComplete:false,reason:'Observed presentation references an object outside the supplied full object roster; no presentation state is synthesized.'};
   // The older selector's actor-ID tensor is unsigned. A missing participant
   // is represented by the existence/snapshot flags and a canonical unused0;
   // it never becomes a fabricated source object or an enabled program.
   const history=[...s.presentation.history];history[0]=command?.actionId??0;history[1]=sourceId<0?0:sourceId;history[2]=targetId;history[7]=s.currentActionIndex;
   const participantCounts=s.presentationParticipantIds.map(id=>s.roster.find(a=>a.id===id)?.routeCount??0);
   eventRows.push({seed:s.seed,position:s.position,cameraState:s.cameraState,enabled:[s.enabled!==false&&s.programPresent],
    presentation:{...clone(s.presentation),history,actorPresent:[!!source&&source.lookupPresent!==false],targetPresent:[!!target&&target.lookupPresent!==false],actorFlag80:[sourceIndex>=0?!!entry.population[i].flag80[sourceIndex]:false],actorRouteCount:[source?.routeCount??0],participantRouteCounts:[...participantCounts,...Array(12-participantCounts.length).fill(0)],targetAuxiliaryNode:[target?.auxiliaryNode??255]},
    geometry:{...clone(s.geometry),sourcePosition:[...(source?.position??[0,0,0])],targetPosition:[...(target?.position??[0,0,0])]},
    camera:{...clone(s.camera),sourcePresent:[!!source&&source.lookupPresent!==false],targetPresent:[!!target&&target.lookupPresent!==false]}});
  }
  const presentation=await event.run({rows:eventRows});states.forEach((s,i)=>{s.seed=[...presentation.states[i].seed];s.position=[...presentation.states[i].position];s.cameraState=[...presentation.states[i].cameraState];});
  return {states,parent:entry,preprocessing:entry.preprocessing,goals:entry.goals,routes:entry.routes,presentation,graphCalls,complete:true,wholeCameraComplete:false,
   scope:'Actual-ROM-proved enclosing parent JPN021dc9cc (preprocess, special battle roster/gate, goal dispatcher, conditional byte-aware route planner and represented flag suffix), then an explicitly observed program/presentation occurrence through distance/selector/free-camera RNG graphs. Dispatcher return0 does not suppress this separately observed program gate. Program lookup, group-list producer, renderer/facing geometry and unknown initial row+4 writer remain external; no whole-camera completion claim.',
   proofBoundaries:{parent:'Actual uninterrupted parent through-return endpoints from initial inputs.',presentation:'Pinned-source wiring plus separately actual-proved selector->full-free-camera projection. No joined actual outer whole-camera proof.'}};
 }
 return {run,runRows:(rows,options={})=>run({rows,...options}),models:CAMERA_PARENT_PHASE_MODELS};
}
