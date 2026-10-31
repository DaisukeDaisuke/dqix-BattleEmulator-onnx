import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Graph} from './graph-builder.mjs';
import cameraConstants from '../data/camera-constants.mjs';
import {sourceSHA256} from '../data/source-authority.mjs';
import {cameraMapOperations} from './build-camera-goals.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex'),integer=(min,max,width=1)=>({min,max,integer:true,...(width===1?{}:{width})});
export function cameraNodePosition(node){
  const F=Math.fround,row=Math.trunc(node/9),col=node%9;
  return [Math.trunc(F(F(F(-42566.87890625)+F(F(10641.7197265625)*F(col)))+F(F(5320.85986328125)*F(row%2)))),Math.trunc(F(F(-36864)+F(F(3)*F(F(3072)*F(row)))))];
}
async function actualDistances(){
  const path='evidence-v2/ghidra/emulation-camera-node-coordinate-run/response.json',positions=structuredClone(cameraConstants.coordinates.coords.slice(0,81));
  for(const[n,p]of positions.entries())if(JSON.stringify(p)!==JSON.stringify(cameraNodePosition(n)))throw Error(`Actual/source coordinate mismatch node${n}`);
  if(positions.filter(Boolean).length!==81)throw Error('Actual coordinate table incomplete');
  return {proof:{path,sha256:sourceSHA256(path),cases:81},weights:positions.flatMap(a=>positions.map(b=>{const x=BigInt(a[0]-b[0]),z=BigInt(a[1]-b[1]);return Number(((x*x+2048n)>>12n)+((z*z+2048n)>>12n));}))};
}
async function contract(kind){
  const files=['src/Combat/Overlay_25/func_ov025_021e16c8.cpp','src/Combat/Overlay_25/func_ov025_021e1480.cpp','src/Combat/Overlay_0/func_ov000_0216f74c.cpp'];
  const sources=files.map(path=>({path,sha256:sourceSHA256(path)}));
  return {authority:{address:'overlay25:0x021e1fd8',matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10',sources,stackProof:'evidence-v2/ghidra/camera-goal-defined/response.json'},scope:`${kind} of complete nonmember AssignGoal. The source actor is absent from the current participant list. Target pivot uses auxiliary!=255, then goal!=255, then start. Ring labeling is a separate81x81 matrix graph. Candidate arrays share one scratch region: inner base0, outer base12, ascending0..80 writes may overlap. No independent-array correction is applied.`,scopeJa:'行動者が現在recordのparticipantでないAssignGoalです。リングのラベルは共有行列で計算し、候補配列の実スタック重なりも保持して目標を選びます。',actorFields:['class','start','goal','auxiliary','descriptorDepth','cachedTarget'],targetFields:['id','class','start','goal','auxiliary','descriptorDepth'],flagFields:['sourceFlag400','sourceDescriptorPresent','targetFlag400','targetDescriptorPresent'],defaults:{occupancy:Array(81).fill(0),actor:[242,0,0,255,0,255],target:[192,243,40,40,255,0],flags:[false,false,false,false],enabled:true},inputDomains:{occupancy:integer(0,255,81)},fieldDomains:{actor:[integer(0,255),integer(0,80),integer(0,255),integer(0,255),integer(0,3),integer(0,255)],target:[integer(0,255),integer(0,255),integer(0,255),integer(0,255),integer(0,255),integer(0,3)]},labels:{occupancy:'初期占有81セル',actor:'class/start/goal/aux/depth/cachedTarget',target:'id/class/start/goal/aux/depth',flags:'source flag/descriptor, target flag/descriptor',enabled:'nonmember AssignGoalを実行'},feedback:{},defaultSteps:1,unsupported:'The member/current-action branch (conflict writes, target-area rules and action-record category) is excluded. Selected target pivot must be0..80. Full goal-dispatch/object allocation/geometry writers are external. Only data relevant to nonmember behavior is represented.'};
}
function common(g){
  const occupancy=g.input('occupancy',['N',81]),a=g.split(g.input('actor',['N',6]),6),t=g.split(g.input('target',['N',6]),6),flags=g.split(g.input('flags',['N',4],'bool'),4),enabled=g.input('enabled',['N',1],'bool');
  const origin=g.where(g.not(g.eq(t[4],255)),t[4],g.where(g.not(g.eq(t[3],255)),t[3],t[2])),supported=g.lt(origin,81),active=g.and(enabled,supported),depth=g.where(g.and(flags[2],flags[3]),t[5],0),radius=g.add(2,depth),delay=g.add(1,depth),cleared=g.where(g.and(active,g.eq(occupancy,a[0])),0,occupancy);
  return {occupancy,a,t,flags,enabled,origin,supported,active,depth,radius,delay,cleared};
}
export async function buildNonmemberPrepare(){
  const g=new Graph('rom-camera-nonmember-goal-prepare',await contract('Preparation')),s=common(g);
  for(const [k,v]of Object.entries({clearedOccupancy:s.cleared,origin:g.where(s.supported,s.origin,0),radius:s.radius,delay:s.delay,effectiveDepth:s.depth,supported:s.supported}))g.output(v,k);
  return g;
}
export async function buildClassPaint(){
  const c=await contract('Shared ordered class paint');c.authority.address='overlay25:0x021e1c08';c.defaults={occupancy:Array(81).fill(0),origin:40,actorClass:242,maximumDepth:1,enabled:true};c.inputDomains={occupancy:integer(0,255,81),origin:integer(0,255),actorClass:integer(0,255),maximumDepth:integer(0,3)};c.fieldDomains={};c.labels={occupancy:'占有81セル',origin:'paint始点byte',actorClass:'書込みclass',maximumDepth:'最大深さ0..3',enabled:'paintを実行'};c.scope='Shared exact ordered recursive class paint at JPN021e1c08, hold0/currentDepth0, maximumDepth0..3. Candidate occupancy is tested before recursion and written after recursion. This model is reused for target and source footprints; unlike label paint, class>=242 creates new barriers, so the recursion order is preserved.';c.scopeJa='障害物を作るclass描画を1つの共通グラフで共有し、対象側と行動者側の足元処理へ再利用します。';c.feedback={occupancy:'nextOccupancy'};
  c.unsupported='Only hold0/currentDepth0 and maximumDepth0..3 are represented. Nonzero hold is a separate recursive boundary.';delete c.actorFields;delete c.targetFields;delete c.flagFields;
  const path='src/Combat/Overlay_25/func_ov025_021e12f8.cpp';c.authority.sources.push({path,sha256:sourceSHA256(path)});
  const g=new Graph('rom-camera-class-paint',c),map=g.input('occupancy',['N',81]),origin=g.input('origin'),value=g.input('actorClass'),depth=g.input('maximumDepth'),enabled=g.input('enabled',['N',1],'bool');g.output(cameraMapOperations(g).paint(map,origin,value,depth,enabled),'nextOccupancy');return g;
}
export async function buildNonmemberFinalize(){
  const c=await contract('Candidate choice and commit'),distances=await actualDistances();c.authority.coordinateProof=distances.proof;c.defaults.distanceLabels=Array(81).fill(0);c.inputDomains.distanceLabels=integer(0,255,81);c.labels.distanceLabels='ring→target class-paint後の81labels';c.inputContract='distanceLabels must be generated by prepare->rom-camera-ring-labels->rom-camera-class-paint from the same original inputs. Source member=false and initial recursion level0. Final occupancy is occupancyBeforeRestorePaint passed through the shared class-paint graph with the returned restorePaint fields. Combined verification begins with only original occupancy+actor+target+flags.';
  const g=new Graph('rom-camera-nonmember-goal-finalize',c),s=common(g),labels=g.input('distanceLabels',['N',81]),op=cameraMapOperations(g),stay=g.eq(op.at(labels,s.a[1]),s.radius),choose=g.and(s.active,g.not(stay));
  const scratchIds=g.constant(Array.from({length:128},(_,i)=>i),'float32',[1,128]);let scratch=g.mul(scratchIds,0),inner=g.constant(0),outer=g.constant(0);
  for(let node=0;node<81;node++){
    const value=g.op('Gather',[labels,g.constant([node],'int32',[1])],{axis:1},{shape:['N',1]}),isInner=g.eq(value,g.sub(s.radius,1)),isOuter=g.and(g.not(isInner),g.eq(value,s.radius));
    scratch=g.where(g.and(isInner,g.eq(scratchIds,inner)),node,scratch);scratch=g.where(g.and(isOuter,g.eq(scratchIds,g.add(outer,12))),node,scratch);
    inner=g.add(inner,g.cast(isInner,'float32'));outer=g.add(outer,g.cast(isOuter,'float32'));
  }
  const hasOuter=g.gt(outer,0),count=g.where(hasOuter,outer,inner),base=g.where(hasOuter,12,0),weights=g.constant(distances.weights,'float32',[81*81]);let best=g.constant(0),distance=g.constant(4194304);
  for(let i=0;i<81;i++){
    const candidate=g.op('GatherElements',[scratch,g.cast(g.add(base,i),'int32')],{axis:1},{shape:['N',1]}),index=g.add(g.mul(s.a[1],81),candidate),d=g.op('Gather',[weights,g.cast(index,'int32')],{axis:0},{shape:['N',1]}),take=g.and(g.gt(count,i),g.lt(d,distance));
    best=g.where(take,candidate,best);distance=g.where(take,d,distance);
  }
  best=g.where(g.eq(count,0),s.a[1],best);
  let restore=op.write(s.cleared,s.a[1],s.a[0],g.and(s.active,stay));restore=op.write(restore,s.a[3],s.a[0],g.and(s.active,stay));
  const map=op.write(restore,best,s.a[0],choose);
  for(const [k,v]of Object.entries({occupancyBeforeRestorePaint:map,restorePaintOrigin:s.a[3],restorePaintValue:s.a[0],restorePaintDepth:s.a[4],restorePaintEnabled:g.and(s.active,stay,s.flags[0],s.flags[1]),nextGoal:g.where(choose,best,s.a[2]),nextAuxiliary:s.a[3],nextCachedTarget:g.where(choose,s.t[0],s.a[5]),stayed:g.and(s.active,stay),changed:choose,supported:s.supported,innerCount:g.where(choose,inner,0),outerCount:g.where(choose,outer,0),candidateScratch:scratch}))g.output(v,k);
  return g;
}
if(process.argv[1]&&new URL(`file://${process.argv[1]}`).href===import.meta.url){
  for(const build of [buildNonmemberPrepare,buildClassPaint,buildNonmemberFinalize]){const g=await build(),bytes=g.model();for(const [ext,data]of [['onnx',bytes],['json',JSON.stringify(g.json(),null,2)+'\n']]){const name=`${g.name}.${ext}`,tmp=new URL(`${name}.pending-${process.pid}`,import.meta.url);await writeFile(tmp,data);await rename(tmp,new URL(name,import.meta.url));}console.log(JSON.stringify({model:g.name,nodes:g.nodes.length,bytes:bytes.length,sha256:hash(bytes)}));}
}
