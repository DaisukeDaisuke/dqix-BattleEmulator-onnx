// A browser-compatible call scheduler for the actual goal dispatcher. The
// host binds initial object/list fields and follows graph-returned operations.
// Arithmetic, branch predicates, IDs/classes, map writes and goals are ONNX.
import {validateGraphInputs} from './input-domains.mjs';
import {createCameraOccupancyRunner} from './camera-occupancy-runner.mjs';
import {createCameraMemberWideRunner,CAMERA_MEMBER_WIDE_MODELS} from './camera-member-wide-runner.mjs';
import {createCameraNonmemberGoalRunner,CAMERA_NONMEMBER_MODELS} from './camera-nonmember-goal-runner.mjs';
export const CAMERA_DISPATCH_MODELS=[...new Set(['rom-camera-goal-dispatch-init4','rom-camera-goal-dispatch-decision4','rom-camera-goal-dispatch-commit4','rom-camera-fallback-goal','rom-camera-occupancy-step',...CAMERA_MEMBER_WIDE_MODELS,...CAMERA_NONMEMBER_MODELS])];
const array=x=>Array.isArray(x)?[...x]:[x],pad=(a,n,v=0)=>[...a,...Array(n-a.length).fill(v)],clone=x=>structuredClone(x);
function byteWords(words){if(!Array.isArray(words)||words.length!==4||words.some(x=>!Number.isInteger(x)||x<0||x>4294967295))throw Error('Four exact initial raw row+4 words required');return words.flatMap(x=>[x&255,(x>>>8)&255,(x>>>16)&255,(x>>>24)&255]);}
function initialize(row,lane){
 if(!Array.isArray(row.roster)||row.roster.length>4)throw Error(`lane${lane}: observed compact roster0..4 required`);
 if(!Array.isArray(row.commands)||row.commands.length>60)throw Error(`lane${lane}: actual command list0..60 required`);
 const ids=row.roster.map(r=>r.id);if(new Set(ids).size!==ids.length||ids.some(x=>!Number.isInteger(x)||!(x>=0&&x<=3||x>=192&&x<=199)))throw Error(`lane${lane}: unique valid party/enemy IDs required`);
 let enemy=false,last=191;for(const id of ids){if(id>=192){enemy=true;if(id<=last)throw Error(`lane${lane}: enemy list order`);last=id;}else if(enemy)throw Error(`lane${lane}: party list must precede enemies`);}
 if(!Number.isInteger(row.currentActionIndex)||row.currentActionIndex<0||row.currentActionIndex>=Math.max(1,row.commands.length))throw Error(`lane${lane}: current record index`);
 for(const r of row.roster)if(!Array.isArray(r.position)||r.position.length!==3)throw Error(`lane${lane}: initial worldXYZ required`);
 for(const c of row.commands)if(c.participants!==null&&(!Array.isArray(c.participants)||c.participants.length>12))throw Error(`lane${lane}: explicit participant list or null`);
 const actors=row.roster.flatMap(r=>[r.start,r.goal,r.auxiliaryNode,r.expansionDepth,r.preferredTarget,r.secondaryTarget,r.faceNode,r.movementPresence]),flags=row.roster.flatMap(r=>[+!!r.flag400,+!!r.descriptorPresent,+!!r.flag80,+!!r.flag100,+!!r.partyStatePresent,+!!r.partyDisabled]);
 return{initial:clone(row),ids:pad(ids,4),rosterCount:[ids.length],actors:pad(actors,32),flags:pad(flags,24),classes:[],observedRow4Bytes:byteWords(row.row4Words),occupancy:Array(81).fill(0),processed:Array(12).fill(0),innerFlag:[!!row.priorInnerFlag],active:[false],supported:[true],returnValue:[0]};
}
export async function createCameraGoalDispatcher({runGraph,getModel,onTrace}={}){
 if(typeof runGraph!=='function'||typeof getModel!=='function')throw Error('runGraph/getModel required');const models=Object.fromEntries(await Promise.all(CAMERA_DISPATCH_MODELS.map(async n=>[n,await getModel(n)])));let graphCalls=0;
 const runtime={getModel:async n=>models[n],runGraph:async(name,rows,metadata)=>{graphCalls++;return runGraph(name,rows,metadata);},onTrace},occupancy=await createCameraOccupancyRunner(runtime),member=await createCameraMemberWideRunner(runtime),nonmember=await createCameraNonmemberGoalRunner(runtime);
 async function call(name,rows,phase){const ir=models[name],inputs=rows.map((r,lane)=>{const row=Object.fromEntries(ir.inputs.map(d=>[d.name,array(r[d.name]??ir.contract.defaults[d.name])])),errors=validateGraphInputs(ir.contract,row);if(errors.length)throw Error(`${name} lane${lane}: ${errors.join('; ')}`);for(const d of ir.inputs)if(row[d.name].length!==d.shape[1])throw Error(`${name}.${d.name}: wrong width`);return row;});const outputs=await runtime.runGraph(name,inputs,{phase});if(outputs.length!==rows.length)throw Error('Dispatcher changed lane count');if(onTrace)await onTrace({phase,model:name,inputs,outputs});return outputs;}
 const fields=s=>({ids:s.ids,rosterCount:s.rosterCount,actors:s.actors,flags:s.flags});
 const actualRoster=s=>Array.from({length:s.rosterCount[0]},(_,i)=>({actor:[s.classes[i],s.actors[i*8],s.actors[i*8+1],s.actors[i*8+2],s.actors[i*8+3]],flag400:[!!s.flags[i*6]],descriptorPresent:[!!s.flags[i*6+1]]}));
 const rosterTriples=s=>Array.from({length:12},(_,i)=>i<s.rosterCount[0]?[s.ids[i],s.actors[i*8],s.actors[i*8+2]]:[255,0,255]).flat();
 const dummyMember={occupancy:Array(81).fill(0),actor:[242,0,0,255,0,255],target:[192,246,40,40,255,0],flags:[false,false,false,false],sourceId:[0],targetWorldPosition:[0,0,0],targetObjectPresent:[false],roster:[0,0,255,192,40,255,...Array.from({length:10},()=>[255,0,255]).flat()],rosterCount:[2],observedRow4Bytes:Array(16).fill(0),categories:[0,0],lookupRecordPresent:[false],priorInnerFlag:[false],enabled:[false]};
 async function run({rows}={}){
  if(!Array.isArray(rows)||!rows.length)throw Error('Nonempty dispatcher batch required');graphCalls=0;const states=rows.map(initialize),trace=[],nearest=states.map(()=>Array(4).fill(0));
  for(let i=0;i<Math.max(1,...states.map(s=>s.rosterCount[0]));i++){
   const out=await call('rom-camera-nearest-node',states.map(s=>({worldPosition:s.initial.roster[i]?.position??[0,0,0],objectPresent:[!!s.initial.roster[i]]})),`camera:dispatch:initial-nearest${i}`);out.forEach((r,lane)=>{nearest[lane][i]=r.nearestNode[0];});
  }
  const init=await call('rom-camera-goal-dispatch-init4',states.map((s,lane)=>{const c=s.initial.commands[s.initial.currentActionIndex];return{...fields(s),nearestNodes:nearest[lane],currentActionId:[c?.actionId??0],currentSourceId:[c?.participants?.[0]??0],currentTargetId:[c?.targetId??-1],currentSourcePresent:[!!c?.participants?.length],currentTargetPresent:[!!c&&c.targetPresent!==false],currentCommandPresent:[!!c],enabled:[s.initial.enabled!==false]};}),'camera:dispatch:init');
  init.forEach((r,i)=>{Object.assign(states[i],{actors:r.nextActors,classes:r.classes,active:r.active,returnValue:r.returnValue,categories:r.categories,lookupRecordPresent:r.lookupRecordPresent,currentTargetId:r.resolvedCurrentTargetId});});
  const schedules=states.map(s=>{const commands=s.initial.commands,index=s.initial.currentActionIndex;return [...commands.map((c,i)=>({c,index:i,mode:i===index?0:1})).slice(index),...commands.slice(0,index).map((c,i)=>({c,index:i,mode:2}))];});
  for(let step=0;step<Math.max(0,...schedules.map(x=>x.length));step++){
   const records=schedules.map(s=>s[step]),rebuilt=await occupancy.rebuild({rows:states.map((s,i)=>({occupancy:s.occupancy,actors:actualRoster(s),enabled:[!!s.active[0]&&!!s.supported[0]&&!!records[i]]}))});rebuilt.occupancy.forEach((m,i)=>{states[i].occupancy=m;});
   const iterations=Math.max(1,...records.map(r=>r?.mode===2?r.c.participants?.length??0:1));
   for(let participant=0;participant<iterations;participant++){
    const decisions=await call('rom-camera-goal-dispatch-decision4',states.map((s,i)=>{const r=records[i],c=r?.c,original=s.initial.commands[s.initial.currentActionIndex],ids=original?.participants??[],available=!!r&&(r.mode===2?participant<(c.participants?.length??0):participant===0);return {...fields(s),occupancy:s.occupancy,observedRow4Bytes:s.observedRow4Bytes,processed:s.processed,sourceId:[c?.participants?.[r.mode===2?participant:0]??0],recordTargetId:[c?.targetId??-1],currentTargetId:s.currentTargetId,currentMembers:pad(ids,12),currentMemberCount:[ids.length],actionId:[c?.actionId??0],mode:[r?.mode??0],participantPresent:[!!c?.participants?.length],targetPresent:[!!c&&c.targetPresent!==false],enabled:[available&&!!s.active[0]&&!!s.supported[0]]};}),`camera:dispatch:${step}:participant${participant}:decision`);
    decisions.forEach((d,i)=>{states[i].processed=d.nextProcessed;if(!d.supported[0])states[i].supported=[false];});
    const helpers=states.map((s,i)=>({nextGoal:[s.actors[Math.max(decisions[i].sourceRow[0],0)*8+1]],nextAuxiliary:[s.actors[Math.max(decisions[i].sourceRow[0],0)*8+2]],nextCachedTarget:[s.actors[Math.max(decisions[i].sourceRow[0],0)*8+4]],rosterAuxiliary:Array.from({length:4},(_,j)=>s.actors[j*8+2])}));
    if(decisions.some(d=>d.operation[0]===1)){
     const result=await member.run({rows:states.map((s,i)=>{const d=decisions[i];if(d.operation[0]!==1)return clone(dummyMember);const t=s.initial.roster[d.targetRow[0]];return{occupancy:s.occupancy,actor:d.actor,target:d.target,flags:d.helperFlags.map(Boolean),sourceId:d.sourceId,targetWorldPosition:t.position,targetObjectPresent:[t.lookupPresent!==false],roster:rosterTriples(s),rosterCount:s.rosterCount,observedRow4Bytes:s.observedRow4Bytes,categories:s.categories,lookupRecordPresent:s.lookupRecordPresent,priorInnerFlag:s.innerFlag,enabled:[true]};})});
     result.output.forEach((out,i)=>{if(decisions[i].operation[0]===1){helpers[i]=out;states[i].occupancy=out.nextOccupancy;states[i].observedRow4Bytes=out.nextObservedRow4Bytes;states[i].innerFlag=out.nextInnerFlag;}});
    }
    if(decisions.some(d=>d.operation[0]===2)){
     const result=await nonmember.run({rows:states.map((s,i)=>{const d=decisions[i];return d.operation[0]===2?{occupancy:s.occupancy,actor:d.actor,target:d.target,flags:d.helperFlags.map(Boolean),enabled:[true]}:{occupancy:Array(81).fill(0),actor:[242,0,0,255,0,255],target:[192,246,40,40,255,0],flags:[false,false,false,false],enabled:[false]};})});
     result.output.forEach((out,i)=>{if(decisions[i].operation[0]===2){helpers[i]={...helpers[i],...out};states[i].occupancy=out.nextOccupancy;}});
    }
    if(decisions.some(d=>d.operation[0]===3)){
     const result=await call('rom-camera-fallback-goal',states.map((s,i)=>{const d=decisions[i],a=d.actor;return d.operation[0]===3?{occupancy:s.occupancy,actor:[a[0],a[1],a[3],a[2],a[4]],rosterRow:d.sourceRow,observedRow4Bytes:s.observedRow4Bytes,flag400:[!!d.helperFlags[0]],descriptorPresent:[!!d.helperFlags[1]],enabled:[true]}:{...models['rom-camera-fallback-goal'].contract.defaults,enabled:[false]};}),`camera:dispatch:${step}:participant${participant}:fallback`);
     result.forEach((out,i)=>{if(decisions[i].operation[0]===3){helpers[i]={...helpers[i],...out};states[i].occupancy=out.nextOccupancy;}});
    }
    const committed=await call('rom-camera-goal-dispatch-commit4',states.map((s,i)=>({ ...fields(s),sourceRow:decisions[i].sourceRow,targetRow:decisions[i].targetRow,operation:decisions[i].operation,mode:[records[i]?.mode??0],helperGoal:helpers[i].nextGoal,helperAuxiliary:helpers[i].nextAuxiliary,helperCachedTarget:helpers[i].nextCachedTarget,memberRosterAuxiliary:helpers[i].rosterAuxiliary.slice(0,4),faceAfter:decisions[i].faceAfter})),`camera:dispatch:${step}:participant${participant}:commit`);
    committed.forEach((out,i)=>{states[i].actors=out.nextActors;});trace.push({step,participant,recordIndices:records.map(r=>r?.index??-1),decisions,helpers:clone(helpers),states:states.map(s=>({actors:[...s.actors],processed:[...s.processed],observedRow4Bytes:[...s.observedRow4Bytes]}))});
   }
  }
  return{states,trace,initial:init,graphCalls,complete:states.every(s=>!!s.supported[0]),wholeCameraComplete:false,scope:'Complete projection of JPN021e08bc goal-dispatch writes only for the declared four-row initial-object domain and without the flagged action9..11 corridor branch. Actual command order/membership, ROM record weights, ID-derived classes, nearest start correction, processed-source deduplication, member/nonmember/fallback goals and prefix auxiliary handling are computed. World positions and the correlated initial raw row+4 words are observed inputs. Roster allocation, upstream presentation, route planning, RNG and the final rendering geometry are not claimed by this entry point.'};
 }
 return{run,models:CAMERA_DISPATCH_MODELS};
}
