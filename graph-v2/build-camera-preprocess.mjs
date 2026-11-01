import {sourceSHA256} from '../data/source-authority.mjs';
// Additional upstream preprocessing. Existing camera phase packs stay frozen.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Graph} from './graph-builder.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex'),integer=(min,max,width)=>({min,max,integer:true,...(width?{width}:{})});
export const CAMERA_LOOKUP_IDS=[0,1,2,3,192,193,194,195,196,197,198,199];
async function contract(stage,capacity,commandCapacity){
 const files=['src/Combat/Overlay_25/func_ov025_021dfce0.cpp','src/Combat/Overlay_0/func_ov000_02162864.cpp','src/Combat/Overlay_0/func_ov000_02162908.cpp','src/Combat/Main/func_02048c90.cpp','src/Combat/Main/func_02049468.cpp','src/Combat/Main/func_0204948c.cpp','src/Combat/Main/func_02049ee8.cpp'];
 return{authority:{address:'JPN overlay25:0x021e05f0',matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10',sources:files.map(path=>({path,sha256:sourceSHA256(path)}))},
  scope:`${stage} for real upstream camera preprocessing. At most${capacity} explicit compact roster rows and${commandCapacity} command records; all12 GameState lookup slots are distinct from compact roster membership. No RNG is consumed.`,
  scopeJa:'カメラ目標決定前に、経路状態を初期化し、対象cacheを検査して最初の行動recordまたは実座標の最寄り敵から対象を更新します。',
  lookupOrder:CAMERA_LOOKUP_IDS,defaults:{ids:[0,192,...Array(capacity-2).fill(0)],rosterCount:2,enabled:true},inputDomains:{ids:{...integer(0,255,capacity),values:CAMERA_LOOKUP_IDS},rosterCount:integer(0,capacity)},feedback:{},defaultSteps:1,
  bounds:'Active roster IDs must be distinct0..3/192..199 in actual party-list then enemy-order. WorldXYZ is an independent initial observation, bounded by the frozen exact distance helper to±4194303. Its pairwise results are graph-produced intermediates, never actual-ROM expected distances.',
  byteIntDistinction:'A first target-1 stores cached byte255 but retains local int-1, so nearest fallback is skipped. First target255 stores255 and does enter nearest fallback. The first participant occurrence over the entire command list is used; an earlier occurrence blocks a later future occurrence.',
  omissions:'This boundary does not generate or consume row+4, special battle earlyreturn gates, goal dispatcher, route planner or presentation program. Only its declared raw visual-state projection is represented.'};
}
export async function buildPreprocessScan({capacity=4,commandCapacity=60}={}){
 if(![4,12].includes(capacity)||![60,72].includes(commandCapacity))throw Error('Original camera tensor capacities are 4/12 actors and 60/72 commands');
 const c=await contract('Ordered first participant-record scan',capacity,commandCapacity);Object.assign(c.defaults,{firstRecord:Array(capacity).fill(-1),firstTarget:Array(capacity).fill(255),firstTargetCount:Array(capacity).fill(0),recordIndex:0,participants:[0,...Array(11).fill(0)],participantCount:1,recordTarget:192,recordTargetCount:1});
 Object.assign(c.inputDomains,{firstRecord:integer(-1,commandCapacity-1,capacity),firstTarget:integer(-32768,32767,capacity),firstTargetCount:integer(0,12,capacity),recordIndex:integer(0,commandCapacity-1),participants:integer(0,65535,12),participantCount:integer(0,12),recordTarget:integer(-32768,32767),recordTargetCount:integer(0,12)});
 c.feedback={firstRecord:'nextFirstRecord',firstTarget:'nextFirstTarget',firstTargetCount:'nextFirstTargetCount'};
 const g=new Graph(`rom-camera-preprocess-scan${capacity}`,c),ids=g.split(g.input('ids',['N',capacity]),capacity),count=g.input('rosterCount'),first=g.split(g.input('firstRecord',['N',capacity]),capacity),target=g.split(g.input('firstTarget',['N',capacity]),capacity),targetCount=g.split(g.input('firstTargetCount',['N',capacity]),capacity),index=g.input('recordIndex'),members=g.split(g.input('participants',['N',12]),12),n=g.input('participantCount'),recordTarget=g.input('recordTarget'),recordCount=g.input('recordTargetCount'),enabled=g.input('enabled',['N',1],'bool');
 const next=[],nextTarget=[],nextCount=[];
 for(let i=0;i<capacity;i++){
  let member=g.eq(0,1);for(let j=0;j<12;j++)member=g.or(member,g.and(g.lt(j,n),g.eq(ids[i],members[j])));
  const accept=g.and(enabled,g.lt(i,count),g.lt(first[i],0),member);next.push(g.where(accept,index,first[i]));nextTarget.push(g.where(accept,recordTarget,target[i]));nextCount.push(g.where(accept,recordCount,targetCount[i]));
 }
 g.output(g.cat(next),'nextFirstRecord');g.output(g.cat(nextTarget),'nextFirstTarget');g.output(g.cat(nextCount),'nextFirstTargetCount');return g;
}
export async function buildPreprocessCommit({capacity=4,commandCapacity=60}={}){
 if(![4,12].includes(capacity)||![60,72].includes(commandCapacity))throw Error('Original camera tensor capacities are 4/12 actors and 60/72 commands');
 const c=await contract('Route reset, cached lookup validation, future target and nearest opponent commit',capacity,commandCapacity),pad=(a,n)=>[...a,...Array(n-a.length).fill(0)];
 Object.assign(c.defaults,{visualPresent:[true,true,...Array(capacity-2).fill(false)],movementPresence:pad([1,1],capacity),preferredTarget:Array(capacity).fill(255),secondaryTarget:Array(capacity).fill(255),routeCount:pad([3,3],capacity),routeStep:pad([-7,-7],capacity),routeTime:pad([123,123],capacity),visualFlagsBytes:pad([80,1,0,0,80,1,0,0],capacity*4),routePosition:pad([11,22,33,44,55,66],capacity*3),resetPosition:pad([99,88,77,66,55,44],capacity*3),lookupPresent:[true,false,false,false,true,...Array(7).fill(false)],lookupMovement:[1,0,0,0,1,...Array(7).fill(0)],firstRecord:Array(capacity).fill(-1),firstTarget:Array(capacity).fill(255),firstTargetCount:Array(capacity).fill(0),currentActionIndex:0,distances:Array.from({length:capacity*capacity},(_,i)=>i===1||i===capacity?4096:0)});
 Object.assign(c.inputDomains,{movementPresence:integer(0,255,capacity),preferredTarget:integer(0,255,capacity),secondaryTarget:integer(0,255,capacity),routeCount:integer(0,255,capacity),routeStep:integer(-2147483648,2147483647,capacity),routeTime:integer(0,65535,capacity),visualFlagsBytes:integer(0,255,capacity*4),routePosition:integer(-2147483648,2147483647,capacity*3),resetPosition:integer(-2147483648,2147483647,capacity*3),lookupMovement:integer(0,255,12),firstRecord:integer(-1,commandCapacity-1,capacity),firstTarget:integer(-32768,32767,capacity),firstTargetCount:integer(0,12,capacity),currentActionIndex:integer(0,capacity===4&&commandCapacity===60?59:commandCapacity),distances:integer(0,16777215,capacity*capacity)});
 const g=new Graph(`rom-camera-preprocess-commit${capacity}`,c),col=(name,n,dtype='float32')=>g.split(g.input(name,['N',n],dtype),n),ids=col('ids',capacity),count=g.input('rosterCount'),visual=col('visualPresent',capacity,'bool'),movement=col('movementPresence',capacity),cached=col('preferredTarget',capacity),secondary=col('secondaryTarget',capacity),routeCount=col('routeCount',capacity),routeStep=col('routeStep',capacity,'int32'),routeTime=col('routeTime',capacity),flags=col('visualFlagsBytes',capacity*4),position=col('routePosition',capacity*3,'int32'),reset=col('resetPosition',capacity*3,'int32'),lookup=col('lookupPresent',12,'bool'),lookupMove=col('lookupMovement',12),first=col('firstRecord',capacity),firstTarget=col('firstTarget',capacity),firstCount=col('firstTargetCount',capacity),current=g.input('currentActionIndex'),dist=col('distances',capacity*capacity),enabled=g.input('enabled',['N',1],'bool');
 const zeroInt=g.constant(0,'int32'),byte=x=>g.sub(x,g.mul(g.floor(g.mul(x,1/256)),256));
 const valid=id=>{let result=g.eq(0,1);for(let i=0;i<12;i++)result=g.or(result,g.and(g.eq(id,CAMERA_LOOKUP_IDS[i]),lookup[i],g.gt(lookupMove[i],0)));return result;};
 const out={nextPreferredTarget:[],nextSecondaryTarget:[],nextRouteCount:[],nextRouteStep:[],nextRouteTime:[],nextVisualFlagsBytes:[],nextResetPosition:[],nearestTarget:[],distanceCallMask:[],futureTargetChosen:[]};
 for(let i=0;i<capacity;i++){
  const active=g.and(enabled,g.lt(i,count)),write=g.and(active,visual[i]),oldCache=g.where(visual[i],cached[i],255),cleanCache=g.where(g.or(g.eq(oldCache,255),valid(oldCache)),oldCache,255),oldSecondary=g.where(visual[i],secondary[i],255),cleanSecondary=g.where(g.or(g.eq(oldSecondary,255),valid(oldSecondary)),oldSecondary,255);
  const future=g.and(g.eq(cleanCache,255),g.le(current,first[i]),g.gt(firstCount[i],0)),localTarget=g.where(future,firstTarget[i],cleanCache),needsNearest=g.and(active,g.eq(localTarget,255));
  let best=g.constant(4194304),nearest=g.constant(255);
  for(let j=0;j<capacity;j++){
   const sameSide=g.or(g.and(g.le(ids[i],3),g.le(ids[j],3)),g.and(g.ge(ids[i],192),g.ge(ids[j],192))),eligible=g.and(needsNearest,g.lt(j,count),visual[j],g.gt(movement[j],0),g.not(sameSide)),improves=g.and(eligible,g.lt(dist[i*capacity+j],best));
   nearest=g.where(improves,ids[j],nearest);best=g.where(improves,dist[i*capacity+j],best);out.distanceCallMask.push(g.cast(eligible,'float32'));
  }
  out.nextPreferredTarget.push(g.where(write,g.where(future,byte(firstTarget[i]),cleanCache),cached[i]));out.nextSecondaryTarget.push(g.where(write,g.where(needsNearest,nearest,cleanSecondary),secondary[i]));
  out.nextRouteCount.push(g.where(write,0,routeCount[i]));out.nextRouteStep.push(g.where(write,zeroInt,routeStep[i]));out.nextRouteTime.push(g.where(write,0,routeTime[i]));
  for(let j=0;j<4;j++){let f=flags[i*4+j];if(j===0)for(const bit of[16,64])f=g.sub(f,g.mul(g.sub(g.floor(g.mul(f,1/bit)),g.mul(g.floor(g.mul(f,1/(bit*2))),2)),bit));out.nextVisualFlagsBytes.push(g.where(write,f,flags[i*4+j]));}
  for(let j=0;j<3;j++)out.nextResetPosition.push(g.where(write,position[i*3+j],reset[i*3+j]));
  out.nearestTarget.push(nearest);out.futureTargetChosen.push(g.cast(g.and(active,future),'float32'));
 }
 for(const[name,v]of Object.entries(out))g.output(g.cat(v),name);return g;
}
if(process.argv[1]&&new URL(`file://${process.argv[1]}`).href===import.meta.url){
 for(const build of[buildPreprocessScan,buildPreprocessCommit]){const g=await build(),bytes=g.model();for(const[ext,data]of[['onnx',bytes],['json',JSON.stringify(g.json(),null,2)+'\n']]){const name=`${g.name}.${ext}`,temp=new URL(`${name}.pending-${process.pid}`,import.meta.url);await writeFile(temp,data);await rename(temp,new URL(name,import.meta.url));}console.log(JSON.stringify({name:g.name,nodes:g.nodes.length,bytes:bytes.length,sha256:hash(bytes)}));}
}
