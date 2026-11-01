import {sourceSHA256} from '../data/source-authority.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Graph} from './graph-builder.mjs';
import {CAMERA_BYTE_NEIGHBORS} from './camera-goal-tables.mjs';

export const ROUTE_META_FIELDS=['initialized','actionCursor','pass','changed','finished','moves','pendingPath','activeActor'];
export const ROUTE_STATE_FIELDS=['positions','passStart','rawRoutes','rawCounts','skip','meta'];
const board=Array.from({length:81},(_,i)=>i).filter(i=>i%18!==17);
const integer=(min,max,width=1)=>({min,max,integer:true,...(width===1?{}:{width})});
const defaultRoster=Array.from({length:12},(_,i)=>[i===0?0:i===1?192:255,i===0?30:i===1?50:0,i===0?32:i===1?48:0]).flat();
const defaults={roster:defaultRoster,rosterCount:2,actionActors:[0,192,...Array(58).fill(65535)],actionPresent:[true,true,...Array(58).fill(false)],actionCount:2,currentActionIndex:0,storedRoutes:Array(192).fill(0),positions:Array(12).fill(0),passStart:Array(12).fill(0),rawRoutes:Array(192).fill(0),rawCounts:Array(12).fill(0),skip:Array(192).fill(0),meta:Array(8).fill(0),enabled:true};
async function contract(kind,commandCapacity){
  if(![60,72].includes(commandCapacity))throw Error("Camera command capacity must be60 or72");
  const source='src/Combat/Overlay_25/func_ov025_021e0638.cpp';
  return {authority:{matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10',address:'overlay25:0x021e0f48',source,sourceSHA256:sourceSHA256(source)},scope:`${kind} of ordered multi-actor camera route planning. Raw action records rotate current..end then0..current, absent actor records are compacted. Each accepted path advances one actor by path[count-2]. Compression uses the pass-start positions and excludes the compact ACTION sequence index, not the actor index. The path search itself is the separate existing rom-camera-route-step graph. No allocator failure, object lookup, later movement flags or geometry commit is modeled.`,scopeJa:'実際の行動record順で各actorを1歩ずつ進め、pass開始時の位置から中間点の圧縮を判定します。最短経路グラフを共有して繰り返します。',metaFields:ROUTE_META_FIELDS,rosterFields:'12 rows [actorId,start,goal], count limits active rows. Active IDs must be unique and start/goal bytes in0..80; the four odd-row padding nodes cannot move and retain their prior routes. Padded roster rows are ignored.',actionContract:'actionActors/actionPresent are the initial raw action-record actor-ID projection and actual pointer presence, before rotation or compaction. currentActionIndex is the index in these raw records. No selected path/result is an initial input.',defaults:{...structuredClone(defaults),actionActors:[0,192,...Array(commandCapacity-2).fill(65535)],actionPresent:[true,true,...Array(commandCapacity-2).fill(false)]},labels:{roster:'名簿12行 [id,start,goal]',rosterCount:'有効名簿数',actionActors:'raw action record actor IDs',actionPresent:'raw recordのactor pointer存在',actionCount:'raw action record数',currentActionIndex:'現在record index',positions:'今回passの可変actor位置',passStart:'今回pass開始時のactor位置',rawRoutes:'actor12×16の未圧縮route',rawCounts:'actorごとの未圧縮count',skip:'actor12×16の省略flag',meta:'初期化/cursor/pass/変更/終了/moves/pending/actor',enabled:'plannerを実行'},inputDomains:{rosterCount:integer(0,12),actionActors:integer(0,65535,commandCapacity),actionCount:integer(0,commandCapacity),currentActionIndex:integer(0,commandCapacity),positions:integer(0,80,12),passStart:integer(0,80,12),rawRoutes:integer(0,80,192),rawCounts:integer(0,16,12),skip:{values:[0,1],width:192}},fieldDomains:{roster:Array.from({length:12},(_,i)=>[{name:`actor${i}.id`,...integer(0,255)},{name:`actor${i}.start`,...integer(0,80)},{name:`actor${i}.goal`,...integer(0,80)}]).flat(),meta:[{name:'initialized',...integer(0,1)},{name:'actionCursor',...integer(0,commandCapacity)},{name:'pass',...integer(0,180)},{name:'changed',...integer(0,1)},{name:'finished',...integer(0,1)},{name:'moves',...integer(0,180)},{name:'pendingPath',...integer(0,1)},{name:'activeActor',...integer(0,11)}]},stateContract:'First state is allzero; subsequently state must be copied from these prepare/accept models. Each of12actors can make at most15moves before rawCount16, so total accepted moves<=180; no arbitrary16-pass cutoff.',feedback:Object.fromEntries(ROUTE_STATE_FIELDS.map(x=>[x,`next${x[0].toUpperCase()+x.slice(1)}`])),defaultSteps:1,unsupported:'Duplicate active roster IDs, unavailable allocator/object structures, invalid path response, or an interrupted continuation are not modeled as successful planning. Movement-flag side effects after route storage are outside scope.'};
}
function inputs(g,accept=false,byteNodes=false,commandCapacity=60){
  const roster=g.input('roster',['N',36]),rosterCount=g.input('rosterCount'),actionActors=g.input('actionActors',['N',commandCapacity]),actionPresent=g.input('actionPresent',['N',commandCapacity],'bool'),actionCount=g.input('actionCount'),currentActionIndex=g.input('currentActionIndex'),storedRoutes=g.input('storedRoutes',['N',192]),positions=g.input('positions',['N',12]),passStart=g.input('passStart',['N',12]),rawRoutes=g.input('rawRoutes',['N',192]),rawCounts=g.input('rawCounts',['N',12]),skip=g.input('skip',['N',192]),meta=g.input('meta',['N',8]),enabled=g.input('enabled',['N',1],'bool');
  const select=(vector,index,max)=>typeof index==='number'
    ?g.op('Gather',[vector,g.constant([Math.min(Math.max(index,0),max)],'int32',[1])],{axis:1},{shape:['N',1]})
    :g.op('GatherElements',[vector,g.cast(g.min(g.max(index,0),max),'int32')],{axis:1},{shape:['N',1]});
  const columns=(vector,offset,stride,count)=>g.op('Gather',[vector,g.constant(Array.from({length:count},(_,i)=>offset+i*stride),'int32',[count])],{axis:1},{shape:['N',count]});
  const ids=columns(roster,0,3,12),starts=columns(roster,1,3,12),goals=columns(roster,2,3,12),m=g.split(meta,8),p=g.split(positions,12),rawC=g.split(rawCounts,12),rids=g.split(ids,12),rs=g.split(starts,12),rg=g.split(goals,12);
  const nodeLimit=byteNodes?256:81;
  const validNode=node=>g.gt(g.op('Gather',[g.constant(Array.from({length:nodeLimit},(_,i)=>board.includes(i)?1:0),'float32',[nodeLimit]),g.cast(node,'int32')],{axis:0},{shape:['N',1]}),0);
  let supported=g.le(currentActionIndex,actionCount);
  // The raw command arena admits72 records, but the original planner's
  // compact local actor-order array is int[60]. Do not treat an overflowing
  // original path as a proved larger-array algorithm.
  if(commandCapacity>60){const indices=g.constant(Array.from({length:commandCapacity},(_,i)=>i),'float32',[1,commandCapacity]),live=g.cast(g.and(g.lt(indices,actionCount),actionPresent),'float32'),total=g.op('MatMul',[live,g.constant(Array(commandCapacity).fill(1),'float32',[commandCapacity,1])],{},{shape:['N',1]});supported=g.and(supported,g.le(total,60));}
  for(let i=0;i<12;i++){
    for(let j=0;j<i;j++)supported=g.and(supported,g.or(g.le(rosterCount,i),g.not(g.eq(rids[i],rids[j]))));
  }
  return {roster,rosterCount,actionActors,actionPresent,actionCount,currentActionIndex,storedRoutes,positions,passStart,rawRoutes,rawCounts,skip,meta,enabled,select,columns,validNode,ids,starts,goals,m,p,rawC,rids,rs,rg,supported,...(accept?{path:g.input('path',['N',16]),pathCount:g.input('pathCount')}: {})};
}
function outputStates(g,state){for(const field of ROUTE_STATE_FIELDS)g.output(state[field],`next${field[0].toUpperCase()+field.slice(1)}`);}
const labelNames=['positions','passStart','rawRoutes','rawCounts','skip'];

function extendByteContract(c){
  c.inputDomains.positions.max=255;c.inputDomains.passStart.max=255;
  for(const f of c.fieldDomains.roster)if(!f.name.endsWith('.id'))f.max=255;
  c.rosterFields='12 rows [actorId,start,goal], all start/goal bytes0..255. IDs unique among active rows. Endpoint>=81 cannot produce a path. Any blocked byte>=81 also makes that individual path call return0, exactly as JPN02171498 before queue initialization.';
  c.scope+=' Byte-node extension preserves invalid endpoint/obstacle rejection. It does not clamp or silently drop an invalid occupied node.';
}
export async function buildRoutePrepare({byteNodes=false,commandCapacity=60}={}){
  const c=await contract('Preparation',commandCapacity);c.inputDomains.storedRoutes=integer(0,255,192);c.labels.storedRoutes='初期visual+24 route bytes（未使用尾部も保持）';
  if(commandCapacity>60){c.rawCommandCapacity=commandCapacity;c.compactActionCapacity=60;c.actionContract+=' At most60 live participant records may be compacted, matching original int var6[60]; more live records are explicitly unsupported.';}
  if(byteNodes)extendByteContract(c);
  const g=new Graph((byteNodes?'rom-camera-route-byte-prepare':'rom-camera-route-prepare')+(commandCapacity===60?'':commandCapacity),c),s=inputs(g,false,byteNodes,commandCapacity),active=g.and(s.enabled,s.supported),initial=g.eq(s.m[0],0);
  let positions=g.where(initial,s.starts,s.positions),passStart=g.where(initial,s.starts,s.passStart),routes=g.where(initial,0,s.rawRoutes),counts=g.where(initial,0,s.rawCounts),skip=g.where(initial,0,s.skip),cursor=g.where(initial,0,s.m[1]),pass=g.where(initial,0,s.m[2]),changed=g.where(initial,0,s.m[3]),finished=g.where(initial,0,s.m[4]),moves=g.where(initial,0,s.m[5]);
  // Compact the initial record-presence projection in the exact wrapped order.
  // The cursor refers to this compact order, as in the ROM loop's var34.
  let total=g.constant(0);const records=[];const presence=g.cast(s.actionPresent,'float32');
  for(let j=0;j<commandCapacity;j++){
    const raw=g.add(s.currentActionIndex,j),index=g.where(g.ge(raw,s.actionCount),g.sub(raw,s.actionCount),raw),exists=g.and(g.gt(s.actionCount,j),g.gt(s.select(presence,index,commandCapacity-1),0));
    records.push({actor:s.select(s.actionActors,index,commandCapacity-1),exists,ordinal:total});total=g.add(total,g.cast(exists,'float32'));
  }
  const rollover=g.and(g.gt(total,0),g.ge(cursor,total),g.eq(finished,0)),continuePass=g.and(rollover,g.gt(changed,0));
  finished=g.where(g.or(g.eq(total,0),g.and(rollover,g.eq(changed,0))),1,finished);
  cursor=g.where(continuePass,0,cursor);pass=g.where(continuePass,g.add(pass,1),pass);changed=g.where(continuePass,0,changed);passStart=g.where(continuePass,positions,passStart);
  let actorId=g.constant(65535);for(const record of records)actorId=g.where(g.and(record.exists,g.eq(record.ordinal,cursor)),record.actor,actorId);
  let actor=g.constant(0),found=g.eq(0,1);for(let i=11;i>=0;i--){const match=g.and(g.gt(s.rosterCount,i),g.eq(s.rids[i],actorId));actor=g.where(match,i,actor);found=g.or(found,match);}
  const count=s.select(counts,actor,11),base=g.mul(actor,16),current=g.where(g.eq(count,0),s.select(s.starts,actor,11),s.select(routes,g.add(base,g.sub(count,1)),191)),goal=s.select(s.goals,actor,11);
  // The four odd-row padding nodes have no outgoing edges and are not in any
  // valid node's neighbor list. ROM path search therefore cannot move to/from
  // them. Keep their initial bytes and skip search; do not send such endpoints
  // to the older valid-board-only path model or mislabel the roster invalid.
  const working=g.and(active,g.eq(finished,0));let need=g.and(working,found,g.lt(count,16),g.not(g.eq(current,goal)),s.validNode(current),s.validNode(goal));
  if(byteNodes){let invalidBlocked=g.eq(0,1);for(let i=0;i<12;i++){const p=s.select(positions,i,11);invalidBlocked=g.or(invalidBlocked,g.and(g.gt(s.rosterCount,i),g.not(g.eq(p,goal)),g.ge(p,81)));}need=g.and(need,g.not(invalidBlocked));}
  const nextCursor=g.where(g.and(working,g.not(need)),g.add(cursor,1),cursor),nextMeta=g.cat([g.add(g.mul(cursor,0),1),nextCursor,pass,changed,finished,moves,g.cast(need,'float32'),actor]);
  const ids=g.constant(Array.from({length:81},(_,i)=>i),'float32',[1,81]);let blocked=g.mul(ids,0);
  for(let i=0;i<12;i++){const p=s.select(positions,i,11),use=g.and(need,g.gt(s.rosterCount,i),g.not(g.eq(p,goal)));blocked=g.add(blocked,g.cast(g.and(use,g.eq(ids,p)),'float32'));}
  const next={positions,passStart,rawRoutes:routes,rawCounts:counts,skip,meta:nextMeta};for(const k of ROUTE_STATE_FIELDS)next[k]=g.where(active,next[k],s[k]);outputStates(g,next);
  g.output(g.where(need,current,0),'pathStart');g.output(g.where(need,goal,0),'pathGoal');g.output(g.cast(g.gt(blocked,0),'float32'),'pathBlocked');g.output(need,'needPath');g.output(g.or(g.not(s.enabled),g.gt(finished,0)),'finished');g.output(s.supported,'supported');g.output(total,'orderedActionCount');
  return g;
}

export async function buildRouteAccept({byteNodes=false,commandCapacity=60}={}){
  const c=await contract('Path acceptance',commandCapacity);Object.assign(c.defaults,{path:Array(16).fill(0),pathCount:0});c.inputDomains.storedRoutes=integer(0,255,192);c.labels.storedRoutes='初期visual+24 route bytes（未使用尾部も保持）';c.inputDomains.path=integer(0,80,16);c.inputDomains.pathCount=integer(0,16);c.labels.path='最短経路graphのgoal→start nodes';c.labels.pathCount='最短経路graphのcount';
  if(commandCapacity>60){c.rawCommandCapacity=commandCapacity;c.compactActionCapacity=60;c.actionContract+=' At most60 live participant records may be compacted, matching original int var6[60]; more live records are explicitly unsupported.';}
  if(byteNodes)extendByteContract(c);
  const g=new Graph((byteNodes?'rom-camera-route-byte-accept':'rom-camera-route-accept')+(commandCapacity===60?'':commandCapacity),c),s=inputs(g,true,byteNodes,commandCapacity),actor=s.m[7],base=g.mul(actor,16),count=s.select(s.rawCounts,actor,11),pending=g.and(s.enabled,s.supported,g.gt(s.m[6],0)),move=g.and(pending,g.ge(s.pathCount,2),g.lt(count,16)),newCount=g.where(g.eq(count,0),2,g.add(count,1)),next=s.select(s.path,g.sub(s.pathCount,2),15),first=g.and(move,g.eq(count,0));
  const flatIds=g.constant(Array.from({length:192},(_,i)=>i),'float32',[1,192]),actorIds=g.constant(Array.from({length:12},(_,i)=>i),'float32',[1,12]);
  let routes=g.where(g.and(first,g.eq(flatIds,base)),s.select(s.positions,actor,11),s.rawRoutes);
  routes=g.where(g.and(move,g.eq(flatIds,g.add(base,g.where(g.eq(count,0),1,count)))),next,routes);
  const positions=g.where(g.and(move,g.eq(actorIds,actor)),next,s.positions),counts=g.where(g.and(move,g.eq(actorIds,actor)),newCount,s.rawCounts),before=s.select(routes,g.add(base,g.sub(newCount,3)),191);
  const adjacency=Array.from({length:81},(_,i)=>Array.from({length:81},(_,j)=>CAMERA_BYTE_NEIGHBORS[i].includes(j)?1:0)).flat(),nodeIds=g.constant(Array.from({length:81},(_,i)=>i),'float32',[1,81]);
  const adjacent=node=>g.op('Gather',[g.constant(adjacency,'float32',[81*81]),g.cast(g.add(g.mul(node,81),nodeIds),'int32')],{axis:0},{shape:['N',81]});
  const common=g.and(g.gt(adjacent(before),0),g.gt(adjacent(next),0)),commonF=g.cast(common,'float32'),found=g.gt(g.op('MatMul',[commonF,g.constant(Array(81).fill(1),'float32',[81,1])],{},{shape:['N',1]}),0);
  let occupied=g.eq(0,1);for(let i=0;i<12;i++){const conditions=[g.gt(s.rosterCount,i),g.not(g.eq(s.m[1],i)),g.gt(s.select(commonF,s.select(s.passStart,i,11),80),0)];if(byteNodes)conditions.push(g.lt(s.select(s.passStart,i,11),81));occupied=g.or(occupied,g.and(...conditions));}
  const compress=g.and(move,g.gt(newCount,2),g.gt(s.m[2],0),found,g.not(occupied));
  const skip=g.where(g.and(compress,g.eq(flatIds,g.add(base,g.sub(newCount,2)))),1,s.skip);
  const meta=g.cat([s.m[0],g.where(pending,g.add(s.m[1],1),s.m[1]),s.m[2],g.where(move,1,s.m[3]),s.m[4],g.add(s.m[5],g.cast(move,'float32')),g.where(pending,0,s.m[6]),s.m[7]]);
  outputStates(g,{positions,passStart:s.passStart,rawRoutes:routes,rawCounts:counts,skip,meta});g.output(move,'moved');g.output(compress,'compressed');g.output(s.supported,'supported');
  return g;
}

export async function buildRouteFinalize({byteNodes=false,commandCapacity=60}={}){
  const c=await contract('Final route compaction',commandCapacity);c.feedback={};c.inputDomains.storedRoutes=integer(0,255,192);c.labels.storedRoutes='初期visual+24 route bytes（未使用尾部も保持）';c.setterContract='JPN0204a230 returns without writing when unsigned count>=16. JPN02049ab0 reset clears count but preserves all16 route bytes. Therefore compressedCount16 yields routeCount0 and the original storedRoutes buffer; shorter counts copy only that prefix and preserve the prior tail.';
  if(commandCapacity>60){c.rawCommandCapacity=commandCapacity;c.compactActionCapacity=60;c.actionContract+=' At most60 live participant records may be compacted, matching original int var6[60]; more live records are explicitly unsupported.';}
  if(byteNodes)extendByteContract(c);
  const g=new Graph((byteNodes?'rom-camera-route-byte-finalize':'rom-camera-route-finalize')+(commandCapacity===60?'':commandCapacity),c),s=inputs(g,false,byteNodes,commandCapacity),flatIds=g.constant(Array.from({length:192},(_,i)=>i),'float32',[1,192]);let output=g.mul(s.rawRoutes,0);const counts=[];
  for(let actor=0;actor<12;actor++){
    let count=g.constant(0);const rawCount=s.select(s.rawCounts,actor,11);
    for(let j=0;j<16;j++){
      const keep=g.and(g.gt(s.rosterCount,actor),g.gt(rawCount,j),g.eq(s.select(s.skip,actor*16+j,191),0));
      output=g.where(g.and(keep,g.eq(flatIds,g.add(actor*16,count))),s.select(s.rawRoutes,actor*16+j,191),output);count=g.add(count,g.cast(keep,'float32'));
    }
    counts.push(count);
  }
  let stored=s.storedRoutes;const visibleCounts=[];
  for(let actor=0;actor<12;actor++){
    const visible=g.and(s.enabled,g.gt(s.rosterCount,actor),g.lt(counts[actor],16)),prefix=g.and(g.ge(flatIds,actor*16),g.lt(flatIds,g.add(actor*16,counts[actor])));
    stored=g.where(g.and(visible,prefix),output,stored);visibleCounts.push(g.where(visible,counts[actor],0));
  }
  g.output(stored,'routes');g.output(g.cat(visibleCounts),'routeCounts');g.output(g.cat(counts),'compressedCounts');g.output(s.positions,'endPositions');g.output(s.supported,'supported');g.output(g.or(g.not(s.enabled),g.gt(s.m[4],0)),'finished');
  return g;
}

if(process.argv[1]&&new URL(`file://${process.argv[1]}`).href===import.meta.url){
  for(const build of [buildRoutePrepare,buildRouteAccept,buildRouteFinalize]){
    const g=await build(),model=g.model();for(const [ext,data]of [['onnx',model],['json',JSON.stringify(g.json(),null,2)+'\n']]){const name=`${g.name}.${ext}`,temp=new URL(`${name}.pending-${process.pid}`,import.meta.url);await writeFile(temp,data);await rename(temp,new URL(name,import.meta.url));}
    console.log(JSON.stringify({model:g.name,nodes:g.nodes.length,bytes:model.length,sha256:createHash('sha256').update(model).digest('hex')}));
  }
}
