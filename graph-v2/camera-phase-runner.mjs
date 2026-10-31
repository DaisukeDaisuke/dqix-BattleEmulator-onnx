// Browser-compatible camera phase composition. Numeric decisions remain in
// ONNX; this layer copies actor fields and schedules already-identified calls.
// Full presentation/goal dispatch is not inferred from observed action IDs.
import {validateGraphInputs} from './input-domains.mjs';
import {createCameraOccupancyRunner,CAMERA_OCCUPANCY_MODEL} from './camera-occupancy-runner.mjs';
import {createCameraRoutePlanner,CAMERA_ROUTE_MODELS} from './camera-route-planner.mjs';
import {createCameraEventRunner,CAMERA_EVENT_MODELS} from './camera-event-runner.mjs';
import {createCameraNonmemberGoalRunner,CAMERA_NONMEMBER_MODELS} from './camera-nonmember-goal-runner.mjs';
export const CAMERA_PHASE_MODELS=[CAMERA_OCCUPANCY_MODEL,'rom-camera-fallback-goal',...CAMERA_ROUTE_MODELS,...CAMERA_EVENT_MODELS];
export const CAMERA_PHASE_OPTIONAL_MODELS=CAMERA_NONMEMBER_MODELS;
const array=x=>Array.isArray(x)?[...x]:[x],clone=x=>structuredClone(x);
export async function createCameraPhaseRunner({runGraph,getModel,onTrace}={}){
  if(typeof runGraph!=='function'||typeof getModel!=='function')throw Error('runGraph and getModel are required');
  const irs=Object.fromEntries(await Promise.all(CAMERA_PHASE_MODELS.map(async n=>[n,await getModel(n)]))),defaults=n=>Object.fromEntries(Object.entries(irs[n].contract.defaults).map(([k,v])=>[k,array(v)]));
  let graphCalls=0;
  const runtime={getModel,runGraph:async(name,rows,metadata)=>{graphCalls++;return runGraph(name,rows,metadata);},onTrace};
  const occupancy=await createCameraOccupancyRunner(runtime),planner=await createCameraRoutePlanner(runtime),event=await createCameraEventRunner(runtime);let nonmember;
  async function fallback(rows,phase){
    const name='rom-camera-fallback-goal',ir=irs[name];
    for(let lane=0;lane<rows.length;lane++){
      const errors=validateGraphInputs(ir.contract,rows[lane]);if(errors.length)throw Error(`${phase} lane${lane}: ${errors.join('; ')}`);
      for(const d of ir.inputs)if(!Array.isArray(rows[lane][d.name])||rows[lane][d.name].length!==d.shape[1])throw Error(`${phase}.${d.name}: width`);
    }
    const outputs=await runtime.runGraph(name,rows,{phase});if(outputs.length!==rows.length)throw Error('Fallback changed batch lanes');if(onTrace)await onTrace({phase,model:name,inputs:clone(rows),outputs:clone(outputs)});return outputs;
  }
  function initialize(row,lane){
    if(!Array.isArray(row.occupancy)||row.occupancy.length!==81)throw Error(`lane${lane}: explicit initial occupancy81 required`);
    if(!Array.isArray(row.actors)||row.actors.length>12)throw Error(`lane${lane}: ordered roster0..12 required`);
    if(!Array.isArray(row.observedRow4Bytes)||row.observedRow4Bytes.length!==16)throw Error(`lane${lane}: one correlated four-word row+4 observation required`);
    if(!Array.isArray(row.goalCalls)||row.goalCalls.length>60)throw Error(`lane${lane}: explicit0..60 goal call boundaries required`);
    const seen=new Set();let enemy=false,lastEnemy=191;
    for(const a of row.actors){
      if(seen.has(a.id)||!Number.isInteger(a.id))throw Error(`lane${lane}: duplicate/invalid actor ID`);seen.add(a.id);
      if(a.id>=192&&a.id<=199){enemy=true;if(a.id<=lastEnemy)throw Error(`lane${lane}: enemy roster must be ascending`);lastEnemy=a.id;}else if(a.id<0||a.id>3||enemy)throw Error(`lane${lane}: party-list then enemy-ascending roster required`);
      for(const k of ['class','start','goal','aux','depth'])if(!Number.isInteger(a[k]))throw Error(`lane${lane}: explicit actor.${k} required`);
      if(!Array.isArray(a.storedRoute)||a.storedRoute.length!==16)throw Error(`lane${lane}: explicit prior storedRoute16 required`);
    }
    for(const c of row.goalCalls){
      if(!['fallback','nonmember'].includes(c.kind))throw Error(`lane${lane}: goal dispatch ${c.kind} is not yet implemented; no result claimed`);
      if(!Number.isInteger(c.row)||c.row<0||c.row>=row.actors.length)throw Error(`lane${lane}: goal call requires a supplied actor row`);
      if(c.kind==='fallback'&&c.row>3)throw Error(`lane${lane}: fallback requires actual observed row0..3; no extrapolation`);
      if(c.kind==='nonmember'){
        if(!Number.isInteger(c.targetRow)||c.targetRow<0||c.targetRow>=row.actors.length)throw Error(`lane${lane}: nonmember target row missing`);
        const cached=row.actors[c.row].cachedTarget;if(!Number.isInteger(cached)||cached<0||cached>255)throw Error(`lane${lane}: nonmember source requires explicit prior cachedTarget byte`);
      }
    }
    if(!Array.isArray(row.actionActors)||row.actionActors.length>60||!Array.isArray(row.actionPresent)||row.actionPresent.length!==row.actionActors.length)throw Error(`lane${lane}: raw action IDs and actual record presence required`);
    if(!Number.isInteger(row.currentActionIndex)||row.currentActionIndex<0||row.currentActionIndex>row.actionActors.length)throw Error(`lane${lane}: raw currentActionIndex`);
    if(!row.presentation||!row.geometry||!row.camera||!Array.isArray(row.seed)||!Array.isArray(row.position)||!Array.isArray(row.cameraState))throw Error(`lane${lane}: explicit presentation occurrence inputs required`);
    return clone(row);
  }
  async function run({rows,maxRouteAttempts=10861}={}){
    if(!Array.isArray(rows)||!rows.length)throw Error('A nonempty lane batch is required');graphCalls=0;const states=rows.map(initialize),goalTrace=[];
    for(let slot=0;slot<Math.max(0,...states.map(s=>s.goalCalls.length));slot++){
      const rebuilt=await occupancy.rebuild({rows:states.map(s=>({occupancy:s.occupancy,actors:s.actors.map(a=>({actor:[a.class,a.start,a.goal,a.aux,a.depth],flag400:[!!a.flag400],descriptorPresent:[!!a.descriptorPresent]})),enabled:[slot<s.goalCalls.length]}))});
      const inputs=states.map((s,lane)=>{
        const c=s.goalCalls[slot],a=c?.kind==='fallback'?s.actors[c.row]:null;
        return {...defaults('rom-camera-fallback-goal'),occupancy:rebuilt.occupancy[lane],observedRow4Bytes:s.observedRow4Bytes,...(a?{actor:[a.class,a.start,a.aux,a.goal,a.depth],rosterRow:[c.row],flag400:[!!a.flag400],descriptorPresent:[!!a.descriptorPresent]}:{}),enabled:[!!a]};
      });
      const result=states.some(s=>s.goalCalls[slot]?.kind==='fallback')?await fallback(inputs,`camera:goal:${slot}`):null;let selected=null;
      if(states.some(s=>s.goalCalls[slot]?.kind==='nonmember')){
        nonmember??=await createCameraNonmemberGoalRunner(runtime);
        selected=await nonmember.run({rows:states.map((s,lane)=>{const c=s.goalCalls[slot],a=c?.kind==='nonmember'?s.actors[c.row]:null,t=a?s.actors[c.targetRow]:null;return {occupancy:rebuilt.occupancy[lane],actor:a?[a.class,a.start,a.goal,a.aux,a.depth,a.cachedTarget]:[242,0,0,255,0,0],target:t?[t.id,t.class,t.start,t.goal,t.aux,t.depth]:[192,243,0,0,255,0],flags:a?[!!a.flag400,!!a.descriptorPresent,!!t.flag400,!!t.descriptorPresent]:[false,false,false,false],enabled:[!!a]};})});
      }
      states.forEach((s,lane)=>{const c=s.goalCalls[slot];if(c){const out=c.kind==='fallback'?result[lane]:selected.output[lane];s.occupancy=[...out.nextOccupancy];s.actors[c.row].goal=out.nextGoal[0];if(c.kind==='nonmember'){s.actors[c.row].aux=out.nextAuxiliary[0];s.actors[c.row].cachedTarget=out.nextCachedTarget[0];}}});goalTrace.push({fallback:result,nonmember:selected?.output??null});
    }
    const routeInput=states.map((s,lane)=>{
      for(const a of s.actors)if(a.start<0||a.start>80||a.goal<0||a.goal>80)throw Error(`lane${lane}: resulting route endpoints outside0..80; no invented fallback goal`);
      return {...defaults('rom-camera-route-prepare'),roster:Array.from({length:12},(_,i)=>s.actors[i]?[s.actors[i].id,s.actors[i].start,s.actors[i].goal]:[255,0,0]).flat(),rosterCount:[s.actors.length],actionActors:[...s.actionActors,...Array(60-s.actionActors.length).fill(65535)],actionPresent:[...s.actionPresent,...Array(60-s.actionPresent.length).fill(false)],actionCount:[s.actionActors.length],currentActionIndex:[s.currentActionIndex],storedRoutes:Array.from({length:12},(_,i)=>s.actors[i]?.storedRoute??Array(16).fill(0)).flat()};
    });
    const routes=await planner.run({rows:routeInput,maxAttempts:maxRouteAttempts});
    if(!routes.complete)return {states,routes,goalTrace,graphCalls,complete:false,wholeCameraComplete:false,reason:'Route attempt budget exhausted; selector/RNG were not executed.'};
    const eventRows=states.map((s,lane)=>{
      const source=s.actors.findIndex(a=>a.id===s.presentation.history[1]),target=s.actors.findIndex(a=>a.id===s.presentation.history[2]),out=routes.output[lane];
      if(s.presentation.actorPresent[0]&&s.presentation.snapshotPresent[0]&&source<0)throw Error(`lane${lane}: source object outside supplied planner roster`);
      if(s.presentation.targetPresent[0]&&s.presentation.snapshotPresent[1]&&target<0)throw Error(`lane${lane}: target object outside supplied planner roster`);
      s.actors.forEach((a,i)=>{a.routeCount=out.routeCounts[i];a.storedRoute=out.routes.slice(i*16,i*16+16);});
      return {seed:s.seed,position:s.position,cameraState:s.cameraState,enabled:[true],presentation:{...s.presentation,actorRouteCount:[source<0?0:out.routeCounts[source]],participantRouteCounts:[...out.routeCounts],targetAuxiliaryNode:[target<0?255:s.actors[target].aux]},geometry:s.geometry,camera:s.camera};
    });
    const presentation=await event.run({rows:eventRows});states.forEach((s,i)=>{s.seed=[...presentation.states[i].seed];s.position=[...presentation.states[i].position];s.cameraState=[...presentation.states[i].cameraState];});
    return {states,routes,goalTrace,presentation,graphCalls,complete:true,wholeCameraComplete:false,scope:'Caller-supplied fallback/nonmember goal call boundaries, each with a fresh ordered roster occupancy rebuild, followed by complete compressed route planning and distance/selector/free-camera RNG graphs. Source USA021dffac rebuilds before each goal call. Current/member goal dispatch, BACT program selection, world-coordinate production, movement flags and final camera geometry commit remain explicit external boundaries. Row+4 is one correlated observed four-word input, never independently synthesized.'};
  }
  return {run,models:CAMERA_PHASE_MODELS};
}
