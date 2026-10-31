// Initial-only host binding and finite scheduling; arithmetic is in graphs.
import {validateGraphInputs} from './input-domains.mjs';
export const CAMERA_PREPROCESS_MODELS=['rom-camera-preprocess-scan4','rom-camera-distance3','rom-camera-preprocess-commit4'];
const IDS=[0,1,2,3,192,193,194,195,196,197,198,199],pad=(a,n,v=0)=>[...a,...Array(n-a.length).fill(v)],clone=x=>structuredClone(x);
function bytes(word){if(!Number.isInteger(word)||word<0||word>4294967295)throw Error('Exact u32 visual flags required');return Array.from({length:4},(_,i)=>Math.floor(word/2**(i*8))%256);}
export function cameraPreprocessInitial(row){
 if(!Array.isArray(row.roster)||row.roster.length>4||!Array.isArray(row.commands)||row.commands.length>60)throw Error('Preprocess roster<=4/commands<=60 required');
 const ids=row.roster.map(r=>r.id);if(ids.some(x=>!IDS.includes(x))||new Set(ids).size!==ids.length)throw Error('Unique valid roster IDs required');
 for(const r of row.roster){for(const key of['position','routePositionXYZ','resetPositionXYZ'])if(!Array.isArray(r[key])||r[key].length!==3)throw Error(`Initial ${key}[3] required`);}
 for(const c of row.commands)if(!Array.isArray(c.participants)||c.participants.length>12||!Array.isArray(c.targets)||c.targets.length>12)throw Error('Raw command participant/target lists<=12 required');
 const objects=new Map(row.roster.map(r=>[r.id,r]));for(const object of row.lookupObjects??[]){if(!IDS.includes(object.id)||objects.has(object.id))throw Error('Distinct external lookup IDs required');objects.set(object.id,object);}
 const column=key=>pad(row.roster.map(r=>r[key]),4),vector=key=>pad(row.roster.flatMap(r=>r[key]),12),visual=r=>r.visualPresent!==false&&r.visualPresent!==0;
 return{ids:pad(ids,4),rosterCount:[ids.length],enabled:[row.enabled!==false],visualPresent:pad(row.roster.map(visual),4,false),movementPresence:column('movementPresence'),preferredTarget:column('preferredTarget'),secondaryTarget:column('secondaryTarget'),routeCount:column('routeCount'),routeStep:column('routeStep'),routeTime:column('routeTime'),visualFlagsBytes:pad(row.roster.flatMap(r=>bytes(r.visualFlags)),16),routePosition:vector('routePositionXYZ'),resetPosition:vector('resetPositionXYZ'),lookupPresent:IDS.map(id=>objects.has(id)),lookupMovement:IDS.map(id=>{const r=objects.get(id);return r&&visual(r)?r.movementPresence:0;}),currentActionIndex:[row.currentActionIndex],firstRecord:Array(4).fill(-1),firstTarget:Array(4).fill(255),firstTargetCount:Array(4).fill(0)};
}
export async function createCameraPreprocessRunner({runGraph,getModel,onTrace}={}){
 if(typeof runGraph!=='function'||typeof getModel!=='function')throw Error('runGraph/getModel required');const models=Object.fromEntries(await Promise.all(CAMERA_PREPROCESS_MODELS.map(async name=>[name,await getModel(name)])));
 async function call(name,rows,phase){const ir=models[name];for(const [lane,row]of rows.entries()){for(const input of ir.inputs)if(!Array.isArray(row[input.name])||row[input.name].length!==input.shape[1])throw Error(`${name}.${input.name} lane${lane}: tensor width`);const errors=validateGraphInputs(ir.contract,row);if(errors.length)throw Error(`${name} lane${lane}: ${errors.join('; ')}`);}const out=await runGraph(name,rows,{phase});if(out.length!==rows.length)throw Error('Preprocess lane count changed');if(onTrace)await onTrace({phase,model:name,inputs:clone(rows),outputs:clone(out)});return out;}
 async function run({rows}={}){
  if(!Array.isArray(rows)||!rows.length)throw Error('Nonempty initial batch required');const states=rows.map(cameraPreprocessInitial),micro=[];
  for(let index=0;index<Math.max(0,...rows.map(r=>r.commands.length));index++){
   const input=states.map((s,i)=>{const c=rows[i].commands[index];return{ids:s.ids,rosterCount:s.rosterCount,firstRecord:s.firstRecord,firstTarget:s.firstTarget,firstTargetCount:s.firstTargetCount,recordIndex:[index],participants:pad(c?.participants??[],12),participantCount:[c?.participants.length??0],recordTarget:[c?.targets[0]??255],recordTargetCount:[c?.targets.length??0],enabled:[!!c&&s.enabled[0]]};}),out=await call('rom-camera-preprocess-scan4',input,`camera:preprocess:record${index}`);
   out.forEach((o,i)=>{states[i].firstRecord=o.nextFirstRecord;states[i].firstTarget=o.nextFirstTarget;states[i].firstTargetCount=o.nextFirstTargetCount;});micro.push({model:'rom-camera-preprocess-scan4',inputs:input,outputs:out});
  }
  const distanceRows=rows.flatMap(r=>Array.from({length:16},(_,k)=>({sourcePosition:r.roster[Math.floor(k/4)]?.position??[0,0,0],targetPosition:r.roster[k%4]?.position??[0,0,0],radii:[0,0]}))),dist=await call('rom-camera-distance3',distanceRows,'camera:preprocess:world-distances');
  states.forEach((s,i)=>{s.distances=dist.slice(i*16,(i+1)*16).map(x=>x.distance[0]);});
  const output=await call('rom-camera-preprocess-commit4',states,'camera:preprocess:commit');micro.push({model:'rom-camera-preprocess-commit4',inputs:clone(states),outputs:output});
  const resultRows=rows.map((row,lane)=>({...clone(row),roster:row.roster.map((r,i)=>{const o=output[lane],b=o.nextVisualFlagsBytes.slice(i*4,i*4+4);return{...clone(r),preferredTarget:o.nextPreferredTarget[i],secondaryTarget:o.nextSecondaryTarget[i],routeCount:o.nextRouteCount[i],routeStep:o.nextRouteStep[i],routeTime:o.nextRouteTime[i],visualFlags:b.reduce((n,x,j)=>n+x*2**(j*8),0),resetPositionXYZ:o.nextResetPosition.slice(i*3,i*3+3)};})}));
  return{rows:resultRows,output,scan:states.map(s=>({firstRecord:s.firstRecord,firstTarget:s.firstTarget,firstTargetCount:s.firstTargetCount})),distanceOutputs:dist,micro,consumed:rows.map(()=>0),complete:true,wholeCameraComplete:false,scope:'Initial-only exact projection of preprocessing021e05f0. Calls frozen distance arithmetic from initial XYZ, validates cached lookups against all12 supplied GameState slots, scans initial linked record lists, and resets/commits visual fields. Graph-returned first targets/distances are not sourced from expected observations. No encompassing dispatcher/planner/presentation claim.'};
 }
 return{run,models:CAMERA_PREPROCESS_MODELS};
}
