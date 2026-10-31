import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Graph} from './graph-builder.mjs';
import {buildClassPaint} from './build-camera-nonmember-goal.mjs';
import {CAMERA_BYTE_NEIGHBORS} from './camera-goal-tables.mjs';
import cameraConstants from '../data/camera-constants.mjs';
import {sourceSHA256} from '../data/source-authority.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex'),integer=(min,max,width=1)=>({min,max,integer:true,...(width===1?{}:{width})});
export const DELAYED_PAINT_QUEUE_WIDTH=37;
export const DELAYED_PAINT_ORIGINS=[...Array.from({length:81},(_,i)=>i),255];
export function delayedPaintOrigins(origin,depth){
  if(depth===0)return [];const seen=new Set(),ordered=[];
  function visit(node,left){if(left===0){if(!seen.has(node)){seen.add(node);ordered.push(node);}return;}for(const next of CAMERA_BYTE_NEIGHBORS[node])if(next<81)visit(next,left-1);}
  visit(origin,depth);return ordered;
}
async function verifyNeighborWeights(){
  const sources=structuredClone(cameraConstants.neighbors);
  for(const entry of sources)if(entry.sha256!==sourceSHA256(entry.path))throw Error('Pinned neighbor authority mismatch');
  if(CAMERA_BYTE_NEIGHBORS.length!==256)throw Error('Need complete byte-indexed neighbor table');
  return sources;
}
export async function buildCameraDelayedPaint(){
  const lists=Array.from({length:4},(_,depth)=>DELAYED_PAINT_ORIGINS.map(origin=>delayedPaintOrigins(origin,depth))).flat(),counts=lists.map(x=>x.length);if(Math.max(...counts)!==37)throw Error('Unexpected fixed queue bound');
  const source='src/Combat/Overlay_25/func_ov025_021e12f8.cpp';
  const g=new Graph('rom-camera-delayed-paint-step',{
    authority:{matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10',address:'overlay25:0x021e1c08',source,sourceSHA256:sourceSHA256(source),orderedNeighborProof:await verifyNeighborWeights()},
    scope:'One resumable step of target-footprint class paint with maximumDepth=d0..3, initialHold=d+1 and initialLevel0. A fixed ordered queue of first-occurrence d-step walk origins feeds the existing exact hold0 class-paint kernel. Class must be242..255. At most37 calls complete the original whole delayed traversal, with no independent-array or unordered-set replacement of writes.',
    scopeJa:'遅延付き足元描画を、ROM順序の固定候補列と共通class描画へ分解します。深さ3でも最大37個の起点を順に処理し、障害物が増える順序を保持します。',
    derivation:'While hold remains positive the recursion ignores occupancy and performs no writes, so it only enumerates d-step walk origins in original DFS neighbor order. At each origin hold1 becomes0 and the exact existing hold0/maxDepth=d routine runs. After a completed call with class>=242 every immediate neighbor is blocked; all later writes also remain>=242, so a repeated origin can never change any cell. Keep its first occurrence and remove only subsequent no-ops. The distinct-origin maximum over all81nodes/depth<=3 is37 (depth1:6,depth2:19,depth3:37).',
    defaults:{occupancy:Array(81).fill(0),origin:40,actorClass:243,maximumDepth:1,cursor:0,enabled:true},inputDomains:{occupancy:integer(0,255,81),origin:{...integer(0,255),values:DELAYED_PAINT_ORIGINS},actorClass:integer(242,255),maximumDepth:integer(0,3),cursor:integer(0,37)},
    labels:{occupancy:'更新中の81セル',origin:'初期pivot node',actorClass:'障害物class242..255',maximumDepth:'descriptor深さ0..3',cursor:'固定列の処理位置0..37',enabled:'元の遅延描画を有効化'},feedback:{occupancy:'nextOccupancy',cursor:'nextCursor'},defaultSteps:37,
    inputContract:'Start cursor0 and feed nextOccupancy/nextCursor back with the same origin/class/depth. Stop at complete. No intermediate actual-ROM map or selected origin is an input. This graph intentionally represents only hold=d+1,level0; ordinary hold0 remains the separate shared model.',
    originContract:'Origins0..80 and auxiliary255 are supported. Origin255 uses the actual u8 neighbor wrapping (valid neighbors7,8,0), not an empty list. Other bytes81..254 remain outside this boundary.',
    unsupported:'Classes below242 can reopen or retain traversable cells, invalidating repeat elimination. Arbitrary initialHold/level and origins81..254 are outside this model.'
  });
  const map=g.input('occupancy',['N',81]),origin=g.input('origin'),value=g.input('actorClass'),depth=g.input('maximumDepth'),cursor=g.input('cursor'),enabled=g.input('enabled',['N',1],'bool'),row=g.add(g.mul(depth,82),g.where(g.eq(origin,255),81,origin)),count=g.op('Gather',[g.constant(counts,'float32',[328]),g.cast(row,'int32')],{axis:0},{shape:['N',1]}),index=g.add(g.mul(row,37),g.min(cursor,36)),picked=g.op('Gather',[g.constant(lists.flatMap(x=>[...x,...Array(37-x.length).fill(255)]),'float32',[328*37]),g.cast(index,'int32')],{axis:0},{shape:['N',1]}),active=g.and(enabled,g.lt(cursor,count));
  const painted=g.inline(await buildClassPaint(),{occupancy:map,origin:picked,actorClass:value,maximumDepth:depth,enabled:active},'sharedPaint'),nextCursor=g.where(active,g.add(cursor,1),cursor);
  for(const [name,output]of Object.entries({nextOccupancy:painted.nextOccupancy,nextCursor,complete:g.or(g.not(enabled),g.ge(nextCursor,count)),applied:active,originCount:count,paintOrigin:g.where(active,picked,255)}))g.output(output,name);return g;
}
if(process.argv[1]&&new URL(`file://${process.argv[1]}`).href===import.meta.url){const g=await buildCameraDelayedPaint(),bytes=g.model();for(const [extension,data]of [['onnx',bytes],['json',JSON.stringify(g.json(),null,2)+'\n']]){const name=`${g.name}.${extension}`,temp=new URL(`${name}.pending-${process.pid}`,import.meta.url);await writeFile(temp,data);await rename(temp,new URL(name,import.meta.url));}console.log(JSON.stringify({model:g.name,nodes:g.nodes.length,bytes:bytes.length,sha256:hash(bytes)}));}
