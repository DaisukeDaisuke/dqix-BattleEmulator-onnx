import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Graph} from './graph-builder.mjs';
import {sourceSHA256} from '../data/source-authority.mjs';
import {cameraMapOperations} from './build-camera-goals.mjs';

export async function buildCameraOccupancy(){
  const root=new URL('../restored/dqix-decomp-decomp-matching/',import.meta.url),files=['src/Combat/Overlay_25/func_ov025_021e110c.cpp','src/Combat/Overlay_25/func_ov025_021e12f8.cpp','src/Combat/Overlay_0/func_ov000_0216f82c.cpp'];
  const sources=files.map(file=>({file,sha256:sourceSHA256(file)}));
  const fields=['class','startNode','goalNode','auxiliaryNode','descriptorDepth'];
  const g=new Graph('rom-camera-occupancy-step',{
    authority:{matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10',address:'overlay25:0x021e1a1c',paint:'0x021e1c08',neighbors:'overlay0:0x02170f58',sourceNamesAreUSAAddresses:true,sources},
    scope:'Initialization and one ordered roster row of occupancy rebuild JPN021e1a1c. Initial reset preserves byte255 only. Each nonnull actor row writes goal<81?goal:start, paints depth0..3 with hold0, then writes auxiliary<81. Reuse this graph in the actual roster order; initialize only the first call, including an empty roster call. No row+4 is read by this function.',
    scopeJa:'占有マップを初期化し、名簿1行の目標・足元・補助位置を反映します。同じグラフを実際の名簿順で最大12回つなぎます。row+4はこの関数では読みません。',
    actorFields:fields,
    defaults:{occupancy:Array.from({length:81},(_,i)=>i%18===17?255:0),actor:[242,40,40,40,0],flag400:false,descriptorPresent:false,initialize:true,rowPresent:true,enabled:true},
    labels:{occupancy:'占有81セル',actor:'class / start / goal / aux / descriptor depth',flag400:'actor header bit0x400',descriptorPresent:'actor+148 descriptorが存在',initialize:'このrebuildの最初の呼出',rowPresent:'今回の名簿行が存在',enabled:'rebuildを実行'},
    inputDomains:{occupancy:{min:0,max:255,integer:true,width:81}},fieldDomains:{actor:fields.map((name,i)=>({name,min:0,max:i===4?3:255,integer:true}))},
    feedback:{occupancy:'nextOccupancy'},defaultSteps:1,
    connection:'camera-occupancy-runner.mjs resets once and feeds nextOccupancy through the exact supplied roster order; padding rows use rowPresent=false. Its result can feed rom-camera-fallback-goal. A goal producer and complete camera state remain separate.',
    unsupported:'A present row must contain a nonnull actual actor. No roster construction, class derivation from actorID, object allocation, AssignGoal, row+4 producer, route or camera program is invented. The row iterator is the boundary, not a full camera simulation.'
  });
  const old=g.input('occupancy',['N',81]),a=g.split(g.input('actor',['N',5]),5),flag=g.input('flag400',['N',1],'bool'),descriptor=g.input('descriptorPresent',['N',1],'bool'),initialize=g.input('initialize',['N',1],'bool'),present=g.input('rowPresent',['N',1],'bool'),enabled=g.input('enabled',['N',1],'bool'),op=cameraMapOperations(g);
  const reset=g.and(enabled,initialize),apply=g.and(enabled,present),node=g.where(g.lt(a[2],81),a[2],a[1]);
  let map=g.where(g.and(reset,g.lt(old,255)),0,old);
  map=op.write(map,node,a[0],apply);map=op.paint(map,node,a[0],a[4],g.and(apply,flag,descriptor));map=op.write(map,a[3],a[0],apply);
  g.output(map,'nextOccupancy');g.output(node,'selectedNode');g.output(apply,'applied');g.output(reset,'initialized');
  return g;
}

if(process.argv[1]&&new URL(`file://${process.argv[1]}`).href===import.meta.url){
  const g=await buildCameraOccupancy(),model=g.model();
  for(const [extension,data]of [['onnx',model],['json',JSON.stringify(g.json(),null,2)+'\n']]){const name=`${g.name}.${extension}`,temp=new URL(`${name}.pending-${process.pid}`,import.meta.url);await writeFile(temp,data);await rename(temp,new URL(name,import.meta.url));}
  console.log(JSON.stringify({model:g.name,nodes:g.nodes.length,bytes:model.length,sha256:createHash('sha256').update(model).digest('hex')}));
}
