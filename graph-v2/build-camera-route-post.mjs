import {sourceSHA256} from '../data/source-authority.mjs';
// Visual-flag projection of the real planner suffix, separate from geometry.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Graph} from './graph-builder.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),integer=(min,max,width=1)=>({min,max,integer:true,width});
export async function buildCameraRoutePost({capacity=4}={}){
 if(![4,12].includes(capacity))throw Error("Camera route-post capacity must be4 or12");const commandCapacity=capacity===4?60:72,participantCapacity=capacity,targetCapacity=capacity===4?8:12;
 const source='src/Combat/Overlay_25/func_ov025_021e0638.cpp';
 const contract={authority:{source,sourceSHA256:sourceSHA256(source),matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10',address:'JPN021e0f48 suffix; USA02049a74/49ae4/494f8/4950c'},scope:'After route storage, compact roster flags are cleared/set in the original order; every recorded action source with a nonzero route sets0x40, then current participants and targets clear0x4/0x40. Existing objects outside the compact special-battle roster can still be touched by those later ID lookups. Other bits are preserved. Camera vectors, facing/orientation and animation are outside this projection.',scopeJa:'経路保存後のvisualフラグ更新です。行動順のsourceを処理した後、現在の参加者と対象のbit4/64を解除します。',
 defaults:{ids:[0,192,...Array(capacity-2).fill(0)],objectCount:2,visualPresent:[true,true,...Array(capacity-2).fill(false)],activeRoster:[true,true,...Array(capacity-2).fill(false)],visualFlagsBytes:Array(capacity*4).fill(0),routeCounts:[2,2,...Array(capacity-2).fill(0)],movementPresence:[1,1,...Array(capacity-2).fill(0)],partyMovementBlocked:Array(capacity).fill(false),dead:Array(capacity).fill(false),sceneMovementEnabled:false,actionActors:[0,192,...Array(commandCapacity-2).fill(65535)],actionPresent:[true,true,...Array(commandCapacity-2).fill(false)],actionCount:2,currentParticipants:Array(participantCapacity).fill(0),participantCount:1,currentTargets:[192,...Array(targetCapacity-1).fill(0)],targetCount:1,enabled:true},
 inputDomains:{ids:integer(0,255,capacity),objectCount:integer(0,capacity),visualFlagsBytes:integer(0,255,capacity*4),routeCounts:integer(0,255,capacity),movementPresence:integer(0,255,capacity),actionActors:integer(0,65535,commandCapacity),actionCount:integer(0,commandCapacity),currentParticipants:integer(0,65535,participantCapacity),participantCount:integer(0,participantCapacity),currentTargets:integer(-32768,32767,targetCapacity),targetCount:integer(0,targetCapacity)},feedback:{},defaultSteps:1,
 stateContract:'Flags are four little-endian bytes per existing object. activeRoster comes from the initial battle-type/object roster rule. partyMovementBlocked is party state+0x180 bit0, distinct from the movement eligibility bit1 input. All inputs are initial state or outputs of the route/preprocessing graph, never actual expected endpoints.'};
 const g=new Graph('rom-camera-route-post'+capacity,contract),ids=g.split(g.input('ids',['N',capacity]),capacity),count=g.input('objectCount'),vp=g.split(g.input('visualPresent',['N',capacity],'bool'),capacity),active=g.split(g.input('activeRoster',['N',capacity],'bool'),capacity),flags=g.split(g.input('visualFlagsBytes',['N',capacity*4]),capacity*4),routes=g.split(g.input('routeCounts',['N',capacity]),capacity),movement=g.split(g.input('movementPresence',['N',capacity]),capacity),blocked=g.split(g.input('partyMovementBlocked',['N',capacity],'bool'),capacity),dead=g.split(g.input('dead',['N',capacity],'bool'),capacity),scene=g.input('sceneMovementEnabled',['N',1],'bool'),actors=g.input('actionActors',['N',commandCapacity]),present=g.input('actionPresent',['N',commandCapacity],'bool'),actionCount=g.input('actionCount'),participants=g.input('currentParticipants',['N',participantCapacity]),pc=g.input('participantCount'),targets=g.input('currentTargets',['N',targetCapacity]),tc=g.input('targetCount'),enabled=g.input('enabled',['N',1],'bool');
 const bit=(v,n)=>g.sub(g.floor(g.mul(v,1/n)),g.mul(g.floor(g.mul(v,1/(n*2))),2));
 const remove=(v,n)=>g.sub(v,g.mul(bit(v,n),n)),set=(v,n)=>g.add(remove(v,n),n);
 const any=(values,n,limit,id,presence)=>{const indices=g.constant(Array.from({length:n},(_,i)=>i),'float32',[1,n]);let match=g.and(g.lt(indices,limit),g.eq(values,id));if(presence)match=g.and(match,presence);return g.gt(g.op('MatMul',[g.cast(match,'float32'),g.constant(Array(n).fill(1),'float32',[n,1])],{},{shape:['N',1]}),0);};
 const out=[];
 for(let i=0;i<capacity;i++){
  const original=flags[i*4],valid=g.and(g.lt(i,count),vp[i]),inRoster=g.and(valid,active[i]);
  const callSet=g.and(g.gt(movement[i],0),g.not(blocked[i]),scene),allowed=g.and(g.lt(original,128),g.eq(bit(flags[i*4+1],1),0),g.gt(movement[i],0),g.not(dead[i]));
  const after4=g.where(callSet,g.where(allowed,set(original,4),original),remove(original,4));
  let value=g.where(inRoster,remove(after4,64),original);
  const actionSource=g.and(valid,g.gt(routes[i],0),any(actors,commandCapacity,actionCount,ids[i],present));value=g.where(actionSource,set(remove(value,4),64),value);
  const current=g.and(valid,g.or(any(participants,participantCapacity,pc,ids[i]),any(targets,targetCapacity,tc,ids[i])));value=g.where(current,remove(remove(value,4),64),value);
  out.push(g.where(enabled,value,original),flags[i*4+1],flags[i*4+2],flags[i*4+3]);
 }
 g.output(g.cat(out),'nextVisualFlagsBytes');return g;
}
if(process.argv[1]&&new URL(`file://${process.argv[1]}`).href===import.meta.url){const g=await buildCameraRoutePost(),model=g.model();for(const[ext,value]of [['onnx',model],['json',JSON.stringify(g.json(),null,2)+'\n']]){const p=new URL(`${g.name}.${ext}`,import.meta.url),t=new URL(`${g.name}.${ext}.pending-${process.pid}`,import.meta.url);await writeFile(t,value);await rename(t,p);}console.log(JSON.stringify({name:g.name,nodes:g.nodes.length,bytes:model.length,sha256:sha(model)}));}
