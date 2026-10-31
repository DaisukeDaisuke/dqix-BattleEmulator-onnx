import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Graph} from './graph-builder.mjs';
import cameraConstants from '../data/camera-constants.mjs';
import {sourceSHA256} from '../data/source-authority.mjs';
import {CAMERA_BYTE_NEIGHBORS} from './camera-goal-tables.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const integer=(min,max,width=1)=>({min,max,integer:true,...(width===1?{}:{width})});

export async function buildCameraRing(){
  const proof=cameraConstants.neighbors.map(({path,sha256,cases})=>({path,sha256,cases}));
  if(CAMERA_BYTE_NEIGHBORS.length!==256)throw Error('Incomplete ordered neighbor constants');
  const weights=Array.from({length:81},(_,i)=>Array.from({length:81},(_,j)=>CAMERA_BYTE_NEIGHBORS[i].includes(j)?1:0)).flat();
  const source='src/Combat/Overlay_25/func_ov025_021e120c.cpp';
  const g=new Graph('rom-camera-ring-labels',{
    authority:{address:'overlay25:0x021e1b1c',matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10',source,sourceSHA256:sourceSHA256(source),adjacencyProof:proof},
    scope:'Exact label-paint projection with initialLevel0, radius1..5 and delay0..4. Eight Boolean reachability frontiers use an81x81 adjacency matrix observed from actual ROM neighbor calls. Initial >=242 cells block active-label stages but may be crossed during the delayed stages. New labels1..5 never create barriers, so recursion order does not affect final minima. This simplification is NOT valid for class-paint which writes>=242 and remains a separate graph.',
    scopeJa:'再帰のラベル描画を81×81の固定隣接行列と最大8段の到達判定へ変換します。新しいラベルは障害物を作らないため、最小ラベルが元の再帰と一致します。',
    defaults:{occupancy:Array(81).fill(0),origin:40,radius:2,delay:1,enabled:true},
    labels:{occupancy:'初期81セル（242以上は障害）',origin:'始点node',radius:'最大ラベル1..5',delay:'障害判定前の遅延0..4',enabled:'ラベル処理を実行'},
    inputDomains:{occupancy:integer(0,255,81),origin:integer(0,80),radius:integer(1,5),delay:integer(0,4)},
    feedback:{occupancy:'nextOccupancy'},defaultSteps:1,
    outputContract:'nextOccupancy is the full81-byte result; the origin is not prepainted, but may be reached by a later two-step cycle. No RNG consumed. Four padding nodes have empty outgoing rows.',
    unsupported:'Initial recursion level other than0, byte origins above80, full goal candidate scratch and class-paint are separate boundaries.'
  });
  const initial=g.input('occupancy',['N',81]),origin=g.input('origin'),radius=g.input('radius'),delay=g.input('delay'),enabled=g.input('enabled',['N',1],'bool');
  const ids=g.constant(Array.from({length:81},(_,i)=>i),'float32',[1,81]),adjacency=g.constant(weights,'float32',[81,81]),first=g.max(delay,1),last=g.sub(g.add(first,radius),1);
  let frontier=g.cast(g.eq(ids,origin),'float32'),map=initial;
  for(let step=1;step<=8;step++){
    const within=g.and(enabled,g.le(step,last)),active=g.ge(step,first),reachable=g.gt(g.op('MatMul',[frontier,adjacency],{},{shape:['N',81]}),0);
    frontier=g.cast(g.and(within,reachable,g.or(g.not(active),g.lt(initial,242))),'float32');
    const label=g.add(g.sub(step,first),1),write=g.and(active,g.gt(frontier,0),g.or(g.eq(map,0),g.lt(label,map)));
    map=g.where(write,label,map);
  }
  g.output(map,'nextOccupancy');
  return g;
}
if(process.argv[1]&&new URL(`file://${process.argv[1]}`).href===import.meta.url){
  const g=await buildCameraRing(),bytes=g.model();for(const [ext,data]of [['onnx',bytes],['json',JSON.stringify(g.json(),null,2)+'\n']]){const name=`${g.name}.${ext}`,tmp=new URL(`${name}.pending-${process.pid}`,import.meta.url);await writeFile(tmp,data);await rename(tmp,new URL(name,import.meta.url));}
  console.log(JSON.stringify({model:g.name,nodes:g.nodes.length,bytes:bytes.length,sha256:hash(bytes)}));
}
