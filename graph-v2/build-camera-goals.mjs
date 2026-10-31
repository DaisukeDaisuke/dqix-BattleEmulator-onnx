import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Graph} from './graph-builder.mjs';
import {sourceSHA256} from '../data/source-authority.mjs';
import {CAMERA_BYTE_NEIGHBORS,row4Bytes} from './camera-goal-tables.mjs';
import observedStack from '../restored/dq9-unified/data/camera-stack.mjs';

const matchingCommit='e0d1df250bfc554efe2fd37513a4ad3867a77b10';
const root=new URL('../restored/dqix-decomp-decomp-matching/',import.meta.url);
const sourceInfo=async files=>files.map(file=>({file,sha256:sourceSHA256(file)}));
const integer=(min,max,width=1)=>({min,max,integer:true,...(width===1?{}:{width})});

export function cameraMapOperations(g){
  const ids=g.constant(Array.from({length:81},(_,i)=>i),'float32',[1,81]);
  const table=Array.from({length:6},(_,column)=>g.constant(CAMERA_BYTE_NEIGHBORS.map(row=>row[column]),'float32',[256]));
  const neighbors=node=>{const index=g.cast(node,'int32');return table.map(t=>g.op('Gather',[t,index],{axis:0},{shape:['N',1]}));};
  const at=(map,node)=>g.op('GatherElements',[map,g.cast(g.min(node,80),'int32')],{axis:1},{shape:['N',1]});
  const write=(map,node,value,enabled)=>g.where(g.and(enabled,g.lt(node,81),g.eq(ids,node)),value,map);
  // Both actual callers represented here pass hold=0, currentDepth=0. Preserve
  // recursive pre-test and post-order writes; class>=0xf2 creates new barriers.
  const paint=(map,origin,value,maximumDepth,enabled,depth=0)=>{
    const entered=g.and(enabled,g.gt(maximumDepth,depth));
    for(const node of neighbors(origin)){
      const accepted=g.and(entered,g.lt(node,81),g.lt(at(map,node),242));
      if(depth<2)map=paint(map,node,value,maximumDepth,accepted,depth+1);
      map=write(map,node,value,accepted);
    }
    return map;
  };
  return {neighbors,at,write,paint};
}

export async function buildFallbackGoal(){
  const files=['src/Combat/Overlay_25/func_ov025_021e1d54.cpp','src/Combat/Overlay_25/func_ov025_021e169c.cpp','src/Combat/Overlay_25/func_ov025_021e13e0.cpp','src/Combat/Overlay_25/func_ov025_021e12f8.cpp','src/Combat/Overlay_0/func_ov000_0216f82c.cpp','src/Combat/Main/func_020493a4.cpp','src/Combat/Main/func_020493b8.cpp','src/Combat/Main/func_020493ec.cpp'];
  const occupancy=Array.from({length:81},(_,i)=>i%18===17?255:i===40?242:0);
  const g=new Graph('rom-camera-fallback-goal',{
    authority:{matchingCommit,address:'overlay25:0x021e2664',restore:'0x021e1cf0',paint:'0x021e1c08',neighbors:'overlay0:0x02170f58',sourceNamesAreUSAAddresses:true,sources:await sourceInfo(files)},
    scope:'One complete fallback goal consumer JPN021e2664 for a nonnull roster row/actor, starting node0..80 and byte auxiliary node. Includes ordered 6x6 candidate search, strict first-increasing-count choice of the INNER neighbor, clearing actor-class cells, restoring start/auxiliary footprint and exact post-order depth0..3 paint with hold0. Row+4 comes from an explicit correlated observed four-row snapshot; no producer or timing is invented.',
    scopeJa:'観測済みrow+4と占有81セルから代替目標を決め、元のクラス消去・足元復元・深さ3までの占有更新を順序どおり行います。row+4の生成時期と全カメラ制御は外部入力です。',
    actorFields:['class','startNode','auxiliaryNode','goalNode','descriptorDepth'],
    row4Contract:'observedRow4Bytes is four complete physical u32 words, 16 little-endian byte limbs, from one correlated observation/profile. rosterRow selects0..3 only. Do not enumerate independent16 masks, infer a producer from an action ID, or extrapolate these four rows to unobserved rows. Synthetic isolated ROM boundary fixtures, if present, must be labeled separately from natural observations.',
    row4Observations:{repository:observedStack.repository,commit:observedStack.commit,sources:observedStack.sources,rowBase:observedStack.rowBase,rowStride:observedStack.rowStride,fieldOffset:observedStack.fieldOffset,defaultSample:0,defaultSampleProvenance:observedStack.samples[0]},
    paintContract:'descriptorDepth is (descriptor.word10<<1)>>>30 and is effective only when actor flag0x400 and descriptor pointer are present. Auxiliary255 is passed to the actual byte-neighbor helper and may wrap to nodes7/8/0; it is not globally replaced with an empty neighborhood. Depth-first recursion checks occupancy before recursion and writes after recursion.',
    defaults:{occupancy,actor:[242,40,40,255,0],observedRow4Bytes:row4Bytes(observedStack.samples[0].words),rosterRow:0,flag400:false,descriptorPresent:false,enabled:true},
    defaultProfile:'Isolated occupancy example using the exact correlated four-word natural stack sample0. The occupancy/actor example is numeric, not claimed to be the full state of that observed battle.',
    labels:{occupancy:'占有81セル（242以上は障害）',actor:'class / start / aux / goal / descriptor depth',observedRow4Bytes:'同一観測の4行分row+4（LE16bytes）',rosterRow:'観測4行の選択index',flag400:'actor header bit0x400',descriptorPresent:'actor+148 descriptorが存在',enabled:'fallback入口を実行'},
    inputDomains:{occupancy:integer(0,255,81),observedRow4Bytes:integer(0,255,16),rosterRow:integer(0,3)},
    fieldDomains:{actor:[{name:'class',...integer(0,255)},{name:'startNode',...integer(0,80)},{name:'auxiliaryNode',...integer(0,255)},{name:'goalNode',...integer(0,255)},{name:'descriptorDepth',...integer(0,3)}]},
    feedback:{occupancy:'nextOccupancy'},defaultSteps:1,
    unsupported:'No actor/object lookup, full AssignGoal, occupancy rebuild for the whole roster, row+4 producer/timing, route planning or presentation-program dispatch. Non-null row/actor and start0..80 are the direct-call boundary; arbitrary start bytes may cause out-of-map ROM reads and are excluded.'
  });
  const initial=g.input('occupancy',['N',81]),a=g.split(g.input('actor',['N',5]),5),rowBytes=g.input('observedRow4Bytes',['N',16]),row=g.input('rosterRow'),flag=g.input('flag400',['N',1],'bool'),descriptor=g.input('descriptorPresent',['N',1],'bool'),enabled=g.input('enabled',['N',1],'bool');
  const op=cameraMapOperations(g),picked=[];
  for(let i=0;i<4;i++)picked.push(g.op('GatherElements',[rowBytes,g.cast(g.add(g.mul(row,4),i),'int32')],{axis:1},{shape:['N',1]}));
  const rowNonzero=g.gt(picked.reduce((x,y)=>g.add(x,y)),0),neighbors=op.neighbors(a[1]);
  let free=g.constant(0);
  for(const node of neighbors)free=g.add(free,g.cast(g.and(g.lt(node,81),g.lt(op.at(initial,node),242)),'float32'));
  const early=g.and(g.not(rowNonzero),g.ge(free,4));
  let bestCount=g.constant(0),bestNode=g.constant(255);
  for(const outer of neighbors){
    let count=g.constant(0);
    for(const inner of op.neighbors(outer)){
      const available=g.and(g.lt(outer,81),g.lt(inner,81),g.lt(op.at(initial,inner),242));
      count=g.add(count,g.cast(available,'float32'));
      const take=g.and(available,g.gt(count,bestCount));
      bestNode=g.where(take,inner,bestNode);bestCount=g.where(take,count,bestCount);
    }
  }
  const applied=g.and(enabled,g.not(early),g.lt(bestNode,81),g.or(g.lt(free,bestCount),rowNonzero));
  let map=g.where(g.and(applied,g.eq(initial,a[0])),0,initial);
  map=op.write(map,a[1],a[0],applied);map=op.write(map,a[2],a[0],applied);
  map=op.paint(map,a[2],a[0],a[4],g.and(applied,flag,descriptor));
  const values={nextOccupancy:map,nextGoal:g.where(applied,bestNode,a[3]),applied,row4Nonzero:rowNonzero,freeNeighbors:free,bestNode:g.where(g.and(enabled,g.not(early)),bestNode,255),bestCount:g.where(g.and(enabled,g.not(early)),bestCount,0)};
  for(const [name,value]of Object.entries(values))g.output(value,name);
  return g;
}

export async function buildPresentationGate(){
  const files=['src/Combat/Overlay_25/func_ov025_021e1f08.cpp','src/Combat/Overlay_25/func_ov025_021e1f40.cpp','src/Combat/Main/func_02049468.cpp','src/Combat/Main/func_0204948c.cpp','src/Combat/Main/func_02049ee8.cpp','src/Combat/Main/func_02048bd0.cpp','src/Combat/Main/func_02048c68.cpp'];
  const g=new Graph('rom-camera-presentation-gate',{
    authority:{matchingCommit,target:'overlay25:0x021e2818',movement:'overlay25:0x021e2850',sourceNamesAreUSAAddresses:true,sources:await sourceInfo(files)},
    scope:'Target resolution cached visual+4c, auxiliary+4d, signed current target record+e, then movement eligibility. The graph takes accessor values and party-state presence/bit0 explicitly. This is not program dispatch or a row+4 producer.',
    scopeJa:'表示対象のcached→aux→record優先と、その対象へ移動できる条件を判定します。開始nodeはROMと同じ255だけを拒否し、他のbyte値を追加で排除しません。',
    defaults:{targets:[255,255,192],recordTargetPresent:true,actorId:0,movementEnabled:1,startNode:40,flag80:false,flag100:false,partyStatePresent:true,partyDisabled:false,enabled:true},
    labels:{targets:'cached byte / aux byte / signed record target',recordTargetPresent:'target recordが存在',actorId:'actor object ID',movementEnabled:'visual+56 byte',startNode:'visual+1c byte',flag80:'visual flags bit0x80',flag100:'visual flags bit0x100',partyStatePresent:'party actor stateが存在',partyDisabled:'JPN party state+180 bit0',enabled:'対象と移動判定を実行'},
    inputDomains:{actorId:integer(-32768,32767),movementEnabled:integer(0,255),startNode:integer(0,255)},
    fieldDomains:{targets:[{name:'cachedTarget',...integer(0,255)},{name:'auxiliaryTarget',...integer(0,255)},{name:'recordTarget',...integer(-32768,32767)}]},
    defaultsScope:'Isolated numeric actor0 targeting enemy192. Presence flags are observed accessor results, not object allocations created by the graph.',
    feedback:{},defaultSteps:1,unsupported:'Accessor memory production, missing/null main actor, full camera goal assignment and route execution are external.'
  });
  const t=g.split(g.input('targets',['N',3]),3),present=g.input('recordTargetPresent',['N',1],'bool'),actor=g.input('actorId'),move=g.input('movementEnabled'),start=g.input('startNode'),flag80=g.input('flag80',['N',1],'bool'),flag100=g.input('flag100',['N',1],'bool'),party=g.input('partyStatePresent',['N',1],'bool'),disabled=g.input('partyDisabled',['N',1],'bool'),enabled=g.input('enabled',['N',1],'bool');
  const cached=g.not(g.eq(t[0],255)),aux=g.not(g.eq(t[1],255));
  const target=g.where(cached,t[0],g.where(aux,t[1],g.where(present,t[2],255)));
  const canMove=g.and(enabled,g.gt(move,0),g.not(g.eq(target,actor)),g.not(flag80),g.not(g.eq(start,255)),g.not(flag100),g.not(g.and(g.ge(actor,0),g.le(actor,3),party,disabled)));
  g.output(target,'targetId');g.output(canMove,'canMove');g.output(g.where(cached,0,g.where(aux,1,g.where(present,2,3))),'targetSource');
  return g;
}

if(process.argv[1]&&new URL(`file://${process.argv[1]}`).href===import.meta.url){
  for(const build of [buildFallbackGoal,buildPresentationGate]){
    const graph=await build(),model=graph.model();
    for(const [extension,data]of [['onnx',model],['json',JSON.stringify(graph.json(),null,2)+'\n']]){const name=`${graph.name}.${extension}`,temp=new URL(`${name}.pending-${process.pid}`,import.meta.url);await writeFile(temp,data);await rename(temp,new URL(name,import.meta.url));}
    console.log(JSON.stringify({model:graph.name,nodes:graph.nodes.length,bytes:model.length,sha256:createHash('sha256').update(model).digest('hex')}));
  }
}
