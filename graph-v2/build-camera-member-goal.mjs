import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Graph} from './graph-builder.mjs';
import cameraConstants from '../data/camera-constants.mjs';
import {sourceSHA256} from '../data/source-authority.mjs';
import {exactRoundedDistance} from './build-camera-geometry.mjs';
import {cameraMapOperations} from './build-camera-goals.mjs';
import {cameraNodePosition} from './build-camera-nonmember-goal.mjs';
import {row4Bytes} from './camera-goal-tables.mjs';
import observedStack from '../restored/dq9-unified/data/camera-stack.mjs';

const hash=x=>createHash('sha256').update(x).digest('hex'),integer=(min,max,width=1)=>({min,max,integer:true,...(width===1?{}:{width})});
const directory=new URL('./',import.meta.url),sourceRoot=new URL('../restored/dqix-decomp-decomp-matching/',import.meta.url);
async function authority(files,address){return {matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10',address,sourceNamesAreUSAAddresses:true,sources:files.map(path=>({path,sha256:sourceSHA256(path)}))};}
async function coordinateTable(){
  const path='evidence-v2/ghidra/emulation-camera-node-coordinate-run/response.json',positions=structuredClone(cameraConstants.coordinates.coords.slice(0,81));
  for(const[node,position]of positions.entries())if(JSON.stringify(position)!==JSON.stringify(cameraNodePosition(node)))throw Error('Actual/source coordinate disagreement');
  if(positions.length!==81)throw Error('Incomplete coordinate table');return {positions,proof:{path,sha256:sourceSHA256(path),cases:81}};
}
export async function buildCameraNearestNode(){
  const coordinates=await coordinateTable(),g=new Graph('rom-camera-nearest-node',{
    authority:{...await authority(['src/Combat/Overlay_25/func_ov025_021e1540.cpp','src/NitroSDK/Main/func_020c3030.cpp'],'overlay25:0x021e1e50'),coordinateProof:coordinates.proof},
    scope:'Nearest camera node from the real object world X/Z, with Y forced to0. Scans ascending0..80 excluding node%18==17. Compares exact rounded integer distances with strict less-than and initial minimum0x400000; ties preserve the first node. Missing object returns node0. No expected nearest node or intermediate distance is supplied.',
    scopeJa:'world座標から77候補の距離を並列に計算し、ROMと同じ整数丸め・同点時の先着順で最寄りnodeを選びます。Yは実関数どおり0へ置き換えます。',
    defaults:{worldPosition:[0,0,0],objectPresent:true},inputDomains:{worldPosition:integer(-4194303,4194303,3)},labels:{worldPosition:'対象objectの初期world XYZ',objectPresent:'GameObjectが存在'},defaultSteps:1,feedback:{},
    unsupported:'General wrapping signed32 coordinates outside the bounded exact-distance domain are excluded. This does not update world coordinates or infer an object from a route node.'
  });
  const world=g.split(g.input('worldPosition',['N',3]),3),present=g.input('objectPresent',['N',1],'bool'),x=g.constant(coordinates.positions.map(p=>p[0]),'float32',[1,81]),z=g.constant(coordinates.positions.map(p=>p[1]),'float32',[1,81]),zero=g.constant(Array(81).fill(0),'float32',[1,81]),from=[world[0],g.mul(world[1],0),world[2]];
  const distance=exactRoundedDistance(g,from,[x,zero,z]).distance,columns=g.split(distance,81);let node=g.mul(world[0],0),minimum=g.add(node,4194304);
  for(let i=0;i<81;i++)if(i%18!==17){const take=g.and(present,g.lt(columns[i],minimum));node=g.where(take,i,node);minimum=g.where(take,columns[i],minimum);}
  g.output(node,'nearestNode');g.output(minimum,'minimumDistance');g.output(g.cat(cameraMapOperations(g).neighbors(node)),'neighbors');return g;
}

export async function buildCameraMapWrite(){
  const g=new Graph('rom-camera-map-write',{
    authority:await authority(['src/Combat/Overlay_25/func_ov025_021e16c8.cpp'],'overlay25:0x021e1fd8 inline map write'),
    scope:'Shared byte-map write used by camera goal commits. Writes only when node<81 and enabled; invalid byte nodes preserve all cells. This is a local operation, not a standalone camera phase.',
    scopeJa:'goal処理で共有する81セルの1要素書込みです。node81以上では更新しません。',defaults:{occupancy:Array(81).fill(0),node:40,value:242,enabled:true},inputDomains:{occupancy:integer(0,255,81),node:integer(0,255),value:integer(0,255)},labels:{occupancy:'占有81セル',node:'書込node byte',value:'書込byte',enabled:'書込みを実行'},defaultSteps:1,feedback:{occupancy:'nextOccupancy'}
  });
  const map=g.input('occupancy',['N',81]),node=g.input('node'),value=g.input('value'),enabled=g.input('enabled',['N',1],'bool');g.output(cameraMapOperations(g).write(map,node,value,enabled),'nextOccupancy');return g;
}

export async function buildCameraConflictUpdate(){
  const g=new Graph('rom-camera-conflict-update',{
    authority:await authority(['src/Combat/Overlay_25/func_ov025_021e1ff4.cpp','src/Combat/Overlay_25/func_ov025_021e1c20.cpp'],'overlay25:0x021e2904 / post-conflict0x021e2530'),
    scope:'Shared conflict writes from up to6 already selected neighbor nodes. Each valid node becomes255. For each nonexcluded roster actor, effective occupied node is auxiliary<81?auxiliary:start. A matching node writes row+4=u32(1) and auxiliary=255. Known writes are exposed separately for all12rows; only the initial four correlated raw words are carried as complete row+4 values.',
    scopeJa:'近傍の占有競合を更新します。ROMが実際に書くrow+4=1だけを計算し、未観測行の初期row+4は生成しません。',
    defaults:{occupancy:Array(81).fill(0),selectedNodes:[31,32,39,41,49,50],roster:[0,0,255,192,40,255,...Array(10).fill([255,0,255]).flat()],rosterCount:2,excludedIds:[0,192],excludedPresent:[true,true],observedRow4Bytes:row4Bytes(observedStack.samples[0].words),enabled:true},
    inputDomains:{occupancy:integer(0,255,81),selectedNodes:integer(0,255,6),roster:integer(0,255,36),rosterCount:integer(0,12),excludedIds:integer(0,255,2),observedRow4Bytes:integer(0,255,16)},
    labels:{occupancy:'初期占有81セル',selectedNodes:'書込み近傍6byte（無効255）',roster:'12行のid/start/aux',rosterCount:'実在roster行数',excludedIds:'除外するactor ID2つ',excludedPresent:'各除外IDが有効',observedRow4Bytes:'同一観測の4word16bytes',enabled:'この競合更新を実行'},
    row4Contract:'The input16bytes must be one correlated four-row observation. writeRow4One is the documented deterministic writer effect, not an invented initial value. For rows4..11 with writeRow4One=false the raw row+4 value remains unknown/unrepresented. Existing unknown values are not zero-filled as state.',
    defaultProfile:'Isolated numeric roster using the exact complete correlated row+4 natural observation0. This is not asserted to be the whole battle state at that observation.',row4DefaultObservation:observedStack.samples[0],feedback:{occupancy:'nextOccupancy',observedRow4Bytes:'nextObservedRow4Bytes'},defaultSteps:1,
    equivalence:'Sequential repeated matches after auxiliary clearing cannot change the final effect: the first match already writes1 and255. A row with no initial effective-node match never changes. Thus one membership predicate per row preserves the exact final writes.'
  });
  const map=g.input('occupancy',['N',81]),nodes=g.split(g.input('selectedNodes',['N',6]),6),roster=g.split(g.input('roster',['N',36]),36),count=g.input('rosterCount'),excluded=g.split(g.input('excludedIds',['N',2]),2),excludeOn=g.split(g.input('excludedPresent',['N',2],'bool'),2),raw=g.split(g.input('observedRow4Bytes',['N',16]),16),enabled=g.input('enabled',['N',1],'bool'),op=cameraMapOperations(g);
  let next=map;for(const node of nodes)next=op.write(next,node,255,enabled);
  const changes=[],aux=[];
  for(let i=0;i<12;i++){
    const [id,start,oldAux]=roster.slice(3*i,3*i+3),occupied=g.where(g.lt(oldAux,81),oldAux,start),excludedRow=g.or(...excluded.map((e,j)=>g.and(excludeOn[j],g.eq(id,e)))),match=g.or(...nodes.map(n=>g.and(g.lt(n,81),g.eq(n,occupied)))),changed=g.and(enabled,g.gt(count,i),g.not(excludedRow),match);
    changes.push(changed);aux.push(g.where(changed,255,oldAux));
  }
  const nextRaw=raw.map((value,i)=>g.where(changes[Math.floor(i/4)],i%4===0?1:0,value));
  g.output(next,'nextOccupancy');g.output(g.cat(aux),'nextAuxiliary');g.output(g.cat(changes),'writeRow4One');g.output(g.cat(nextRaw),'nextObservedRow4Bytes');return g;
}

export async function buildCameraMemberPrepare({wide=false}={}){
  const g=new Graph(wide?'rom-camera-member-goal-prepare-wide':'rom-camera-member-goal-prepare',{
    authority:await authority(['src/Combat/Overlay_25/func_ov025_021e16c8.cpp'],'overlay25:0x021e1fd8'),
    scope:'Current-action participant AssignGoal preparation. Clears source-class cells, keeps the pre-conflict label-map copy and identifies the target start pivot. The initial closed member implementation requires effective target descriptor depth0; unsupported depth is explicitly returned, never silently treated as0.',
    scopeJa:'現在行動に参加するactorの目標選択を準備します。競合更新前のmapを保持し、対象のstartをpivotにします。対象の有効深さ0の分岐を接続します。',
    defaults:{occupancy:Array(81).fill(0),actor:[242,0,255,255,0,0],target:[192,243,40,255,255,0],flags:[false,false,false,false],enabled:true},
    actorFields:['class','start','goal','auxiliary','descriptorDepth','cachedTarget'],targetFields:['id','class','start','goal','auxiliary','descriptorDepth'],flagFields:['sourceFlag400','sourceDescriptorPresent','targetFlag400','targetDescriptorPresent'],
    inputDomains:{occupancy:integer(0,255,81)},fieldDomains:{actor:[integer(0,255),integer(0,80),integer(0,255),integer(0,255),integer(0,3),integer(0,255)],target:[integer(0,255),integer(0,255),integer(0,80),integer(0,255),integer(0,255),integer(0,3)]},
    labels:{occupancy:'初期占有81セル',actor:'class/start/goal/aux/depth/cachedTarget',target:'id/class/start/goal/aux/depth',flags:'source flag/descriptor,target flag/descriptor',enabled:'member AssignGoalを実行'},feedback:{},defaultSteps:1,
    unsupported:'Effective target depth1..3 requires nonzero-hold ordered class paint and is not executed here. Object existence, actual membership and the original correlated row+4 input must be established by the enclosing caller.'
  });
  if(wide){g.contract.scope='Current-action participant AssignGoal preparation for target descriptor depth0..3. Preserves the label-map copy before world-neighbor conflict writes. Target classes>=242 are required when depth>0 so the shared delayed-paint first-occurrence proof applies.';g.contract.scopeJa='参加者の目標選択を対象深さ0..3へ拡張します。競合前mapと、半径2+depth・遅延1+depthを共通graphへ渡します。';g.contract.unsupported='When target depth>0, class<242 is excluded because delayed-paint repeated-origin elimination would not be valid. Full upstream membership/dispatch and missing source/target rows remain external.';}
  const map=g.input('occupancy',['N',81]),a=g.split(g.input('actor',['N',6]),6),t=g.split(g.input('target',['N',6]),6),flags=g.split(g.input('flags',['N',4],'bool'),4),enabled=g.input('enabled',['N',1],'bool'),depth=g.where(g.and(flags[2],flags[3]),t[5],0),supported=wide?g.or(g.eq(depth,0),g.ge(t[1],242)):g.eq(depth,0),active=g.and(enabled,supported);
  const cleared=g.where(g.and(active,g.eq(map,a[0])),0,map);g.output(cleared,'clearedOccupancy');g.output(t[2],'origin');g.output(g.add(wide?depth:g.mul(depth,0),2),'radius');g.output(g.add(wide?depth:g.mul(depth,0),1),'delay');g.output(supported,'supported');g.output(active,'active');if(wide){g.output(depth,'effectiveDepth');g.output(g.where(g.gt(depth,0),t[1],242),'delayedPaintClass');g.output(g.and(active,g.gt(depth,0)),'delayedPaintEnabled');}return g;
}

export async function buildCameraMemberCommit({wide=false}={}){
  const g=new Graph(wide?'rom-camera-member-goal-commit-wide':'rom-camera-member-goal-commit',{
    authority:await authority(['src/Combat/Overlay_25/func_ov025_021e16c8.cpp','src/Combat/Overlay_25/func_ov025_021e161c.cpp','src/Combat/Overlay_25/func_ov025_021e1c20.cpp'],'overlay25:0x021e1fd8 / auxiliary0x021e1f2c'),
    scope:'Current-member target-depth0 goal/auxiliary selection, using shared ring labels and shared candidate-choice output. category2 stays only on radius2; other categories stay on positive labels<=2 and may override a chosen goal with the source start inside the radius1 ring. Auxiliary is the first neighbor labelled2, else the goal itself. Outputs are staged before source footprint restoration and post-conflict writes.',
    scopeJa:'共有ringと候補選択の結果から、参加者のgoal・補助node・近傍競合を決めます。同点順とcategory2の例外をROMどおり保持します。',
    defaults:{occupancy:Array(81).fill(0),distanceLabels:Array(81).fill(0),targetArea:Array(81).fill(0),innerArea:Array(81).fill(0),actor:[242,0,255,255,0,0],target:[192,243,40,255,255,0],flags:[false,false,false,false],categories:[2,2],lookupRecordPresent:true,priorInnerFlag:false,candidateGoal:21,enabled:true},
    inputDomains:{occupancy:integer(0,255,81),distanceLabels:integer(0,255,81),targetArea:integer(0,255,81),innerArea:integer(0,255,81),categories:integer(0,15,2),candidateGoal:integer(0,255)},
    fieldDomains:{actor:[integer(0,255),integer(0,80),integer(0,255),integer(0,255),integer(0,3),integer(0,255)],target:[integer(0,255),integer(0,255),integer(0,80),integer(0,255),integer(0,255),integer(0,3)]},
    categoryContract:'categories[0] is the passed record word18 bits12..15. categories[1] is the table-lookup record for command.actionID. They are not assumed equal; the latter is active only when lookupRecordPresent.',
    inputContract:'distanceLabels/targetArea/innerArea and candidateGoal are produced by the shared graph chain from the original initial inputs, not copied from an actual-ROM result. targetArea is the empty-map ring before its pivot class write, which this graph performs. The complete runner requires target effective depth0.',
    labels:{occupancy:'前段の競合更新後81セル',distanceLabels:'競合前mapから得たring labels',targetArea:'空mapから得たtarget ring/class',innerArea:'radius1のtarget ring',actor:'class/start/goal/aux/depth/cachedTarget',target:'id/class/start/goal/aux/depth',flags:'source/target flagとdescriptor',categories:'引数record category / tablelookup category',lookupRecordPresent:'lookup record存在',candidateGoal:'共有候補選択graph出力',enabled:'この段階を実行'},
    defaultSteps:1,feedback:{},unsupported:'This staged graph alone is not the whole function. Restore-paint and ordered post-conflict updates must follow. Effective target depth1..3 is excluded by the preparation contract.'
  });
  if(wide){g.contract.scope='Current-member depth0..3 goal/auxiliary selection, with radius=2+effective target depth. Uses shared matrix labels, ordered class footprint and candidate scratch outputs. targetArea already contains the pivot class and completed delayed target-class paint; the repeated pivot write is idempotent. Source restore and post-conflict writes follow this staged graph.';g.contract.scopeJa='参加者のgoal・補助node・近傍競合を対象深さ0..3で選択します。遅延付きclass描画も共有graphから受け取ります。';g.contract.inputContract='distanceLabels is the pre-conflict map after ring and target-depth source-class paint. targetArea is the empty-map ring after pivot target-class write and complete delayed target footprint. innerArea is radius1/delay1+depth. candidateGoal is the shared aliased candidate graph output. All must come from the same initial inputs; no actual-ROM intermediate is injected.';g.contract.unsupported='Requires the enclosing wide preparation and complete delayed-paint/source-restore/post-conflict chain. Target depth>0 and class<242 is unsupported by the shared delayed-paint proof.';}
  const map=g.input('occupancy',['N',81]),labels=g.input('distanceLabels',['N',81]),rawArea=g.input('targetArea',['N',81]),inner=g.input('innerArea',['N',81]),a=g.split(g.input('actor',['N',6]),6),t=g.split(g.input('target',['N',6]),6),flags=g.split(g.input('flags',['N',4],'bool'),4),category=g.split(g.input('categories',['N',2]),2),record=g.input('lookupRecordPresent',['N',1],'bool'),priorInnerFlag=g.input('priorInnerFlag',['N',1],'bool'),candidate=g.input('candidateGoal'),enabled=g.input('enabled',['N',1],'bool'),op=cameraMapOperations(g),area=op.write(rawArea,t[2],t[1],enabled);
  const radius=wide?g.add(2,g.where(g.and(flags[2],flags[3]),t[5],0)):2,innerLabel=wide?g.sub(radius,1):1;
  const atStart=op.at(labels,a[1]),stay=g.and(enabled,g.or(g.and(g.eq(category[0],2),g.eq(atStart,radius)),g.and(g.not(g.eq(category[0],2)),g.gt(atStart,0),g.le(atStart,radius)))),choose=g.and(enabled,g.not(stay)),override=g.and(record,g.not(g.eq(category[1],2)),g.or(g.eq(op.at(inner,a[1]),1),g.eq(t[2],a[1]))),chosen=g.where(override,a[1],candidate),pivot=g.where(stay,a[1],chosen);
  let aux=pivot,found=g.gt(g.mul(a[1],0),0);
  for(const n of op.neighbors(pivot)){const take=g.and(g.not(found),g.lt(n,81),g.eq(op.at(labels,n),radius));aux=g.where(take,n,aux);found=g.or(found,take);}
  let next=op.write(map,a[1],a[0],stay);next=op.write(next,a[3],a[0],stay);next=op.write(next,chosen,a[0],choose);
  const conflicts=op.neighbors(pivot).map(n=>g.where(g.and(g.lt(n,81),g.eq(op.at(area,n),innerLabel)),n,255));
  const setInnerFlag=g.and(stay,g.not(g.eq(category[0],2)),g.eq(atStart,innerLabel));
  for(const [name,value]of Object.entries({occupancyBeforeRestorePaint:next,restorePaintOrigin:a[3],restorePaintValue:a[0],restorePaintDepth:a[4],restorePaintEnabled:g.and(stay,flags[0],flags[1]),nextGoal:g.where(choose,chosen,a[2]),nextAuxiliary:g.where(enabled,aux,a[3]),nextCachedTarget:g.where(choose,t[0],a[5]),postConflictNodes:g.cat(conflicts),auxiliaryWriteNode:g.where(enabled,aux,255),auxiliaryWriteValue:a[0],stayed:stay,changed:choose,setInnerFlag,nextInnerFlag:g.or(priorInnerFlag,setInnerFlag)}))g.output(value,name);
  return g;
}

if(process.argv[1]&&new URL(`file://${process.argv[1]}`).href===import.meta.url){
  for(const build of [buildCameraNearestNode,buildCameraMapWrite,buildCameraConflictUpdate,buildCameraMemberPrepare,buildCameraMemberCommit]){const g=await build(),bytes=g.model();for(const [extension,data]of [['onnx',bytes],['json',JSON.stringify(g.json(),null,2)+'\n']]){const name=`${g.name}.${extension}`,temp=new URL(`${name}.pending-${process.pid}`,directory);await writeFile(temp,data);await rename(temp,new URL(name,directory));}console.log(JSON.stringify({model:g.name,nodes:g.nodes.length,bytes:bytes.length,sha256:hash(bytes)}));}
}
