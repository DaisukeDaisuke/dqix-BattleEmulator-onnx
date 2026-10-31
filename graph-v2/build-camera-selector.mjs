import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Graph} from './graph-builder.mjs';
import {sourceSHA256} from '../data/source-authority.mjs';

export const SELECTOR_HISTORY_FIELDS=['actionId','actorId','targetId','previousActionId','previousActorId','previousTargetId','previousResolvedTargetId','recordIndex'];
export const SELECTOR_SNAPSHOT_FIELDS=['currentActorSnapshot','currentTargetSnapshot','previousActorSnapshot','previousTargetSnapshot'];

export async function buildCameraSelector(){
  const root=new URL('../restored/dqix-decomp-decomp-matching/',import.meta.url);
  const files=['src/Combat/Overlay_25/func_ov025_021db8d8.cpp','src/Combat/Overlay_25/func_ov025_021dfa9c.cpp','src/Combat/Overlay_0/func_ov000_02169aa4.cpp','src/Combat/Main/func_02048ae0.cpp','src/Combat/Main/func_02048bd0.cpp','src/Combat/Main/func_02049444.cpp','src/Combat/Main/func_020493ec.cpp','src/Combat/Overlay_0/func_ov000_0215ffa0.cpp'];
  const sources=files.map(file=>({file,sha256:sourceSHA256(file)}));
  const g=new Graph('rom-free-camera-selector',{
    authority:{matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10',address:'overlay25:0x021dc1d4',sourceNamesAreUSAAddresses:true,sources},
    scope:'Free-camera call/forced/reset decision of selector JPN021dc1d4 from an already-selected presentation program, actual route counts, prior/current record fields and observed distance/radii. Membership/BACT program dispatch, row+4, goal/occupancy producers, geometric distance calculation and selector side effects remain external.',
    scopeJa:'経路と表示履歴からフリーカメラ呼出し・強制移動・連続通常攻撃resetを判定します。表示プログラムの選択と距離の計算は別の入力境界です。',
    historyFields:SELECTOR_HISTORY_FIELDS,snapshotPresentFields:SELECTOR_SNAPSHOT_FIELDS,
    projection:'programProjection=[flags,type0c]. flags bit0=0x0c command exists; bit1=that exact pointer also occurs inside a 0x3d or 7 command; bit2=0x20 command exists; bit3=0x22 command exists. type0c is command+8 u16. This is an observed structural projection, not an arbitrary action classification.',
    routeContract:'actorRouteCount is the actor presentation+0x34 byte. participantRouteCounts contains effective counts for the up-to-12 actual turn participants; pad absent/null participants with zero. It may be populated from completed route graphs only after the occupancy/participant projection is known.',
    historyContract:'history recordIndex is controller+0x57c8. source IDs come from u16 actor snapshots; target IDs and previousResolvedTargetId are signed short target records. snapshotPresent marks actual non-null records. A missing current snapshot forces its effective object presence false. previousResolvedTargetId is the result of the previous target record subtype selector, not guessed from the current actor.',
    geometryContract:'geometry=[distance,actorRadius,targetRadius] are already computed integer outputs of Vector3fix_Distance and Object3D radius accessors. Graph evaluates distance < ((radiusA+radiusB)>>1); it does not emulate DS sqrt hardware or create world coordinates.',
    resetContract:'The reset helper requires current/previous normal action1, same actor and target, prior resolved target equality, actor presentation bit0x80 and at least two non-null matching membership nodes. The membership walker writes actual node pointers to the out array. Program selection and membership enumeration are upstream.',
    connection:'callFreeCamera feeds rom-free-camera-rng-step.enabled and forced feeds its forced input. Source/target existence, targetHeight and the existing record firstU16 must still come from the same presentation occurrence. No camera RNG is consumed here.',
    defaults:{programProjection:[0,0],history:[1,0,192,1,192,0,0,0],snapshotPresent:[true,true,false,false],actorPresent:true,targetPresent:true,actorFlag80:false,membershipCount:1,actorRouteCount:2,participantRouteCounts:[2,0,0,0,0,0,0,0,0,0,0,0],targetAuxiliaryNode:255,geometry:[24576,4096,8192],enabled:true},
    defaultProfile:'Isolated numeric selector example: first presentation record, actor route count2, no suppressing program commands. It is not asserted to be an observed whole battle or independently synthesized row+4 profile.',
    labels:{programProjection:'選択済programの構造flags・0c type',history:'現在と直前の表示record・recordIndex',snapshotPresent:'actor/target snapshotの存在',actorPresent:'行動者objectが存在',targetPresent:'対象objectが存在',actorFlag80:'行動者presentationのbit0x80',membershipCount:'行動者の一致membership node数',actorRouteCount:'行動者route count',participantRouteCounts:'実参加者12枠のroute count',targetAuxiliaryNode:'対象presentation+1e',geometry:'観測済み距離・行動者半径・対象半径',enabled:'selector入口を実行'},
    inputDomains:{membershipCount:{min:0,max:65535,integer:true},actorRouteCount:{min:0,max:255,integer:true},participantRouteCounts:{min:0,max:255,integer:true,width:12},targetAuxiliaryNode:{min:0,max:255,integer:true}},
    fieldDomains:{programProjection:[{name:'flags',min:0,max:15,integer:true},{name:'type0c',min:0,max:65535,integer:true}],history:SELECTOR_HISTORY_FIELDS.map((name,i)=>({name,min:[2,5,6].includes(i)?-32768:0,max:i===7?72:[2,5,6].includes(i)?32767:65535,integer:true})),geometry:[{name:'distance',min:0,max:16777215,integer:true},{name:'actorRadius',min:0,max:8388607,integer:true},{name:'targetRadius',min:0,max:8388607,integer:true}]},
    defaultSteps:1,feedback:{},unsupported:'This model is a selector projection. It does not implement state changes after the camera call, BACT/tracking opcodes, node assignment, camera geometry, or a full camera sequence.'
  });
  const program=g.split(g.input('programProjection',['N',2]),2),h=g.split(g.input('history',['N',8]),8),snap=g.split(g.input('snapshotPresent',['N',4],'bool'),4),actorPresent=g.input('actorPresent',['N',1],'bool'),targetPresent=g.input('targetPresent',['N',1],'bool'),actorFlag80=g.input('actorFlag80',['N',1],'bool'),count=g.input('membershipCount'),route=g.input('actorRouteCount'),routes=g.split(g.input('participantRouteCounts',['N',12]),12),aux=g.input('targetAuxiliaryNode'),geometry=g.split(g.input('geometry',['N',3]),3),enabled=g.input('enabled',['N',1],'bool');
  const bit=(value,mask)=>g.ge(g.sub(value,g.mul(g.floor(g.mul(value,1/(mask*2))),mask*2)),mask);
  const has0c=bit(program[0],1),samePointer=bit(program[0],2),has20=bit(program[0],4),has22=bit(program[0],8);
  const suppression=g.and(g.not(g.and(has0c,samePointer)),g.or(g.and(has0c,g.not(g.eq(program[1],10))),has20,has22));
  const prior=g.gt(h[7],0),reset=g.and(enabled,actorPresent,snap[0],snap[1],snap[2],snap[3],prior,g.eq(h[0],1),g.eq(h[3],1),actorFlag80,g.eq(h[1],h[4]),g.eq(h[2],h[5]),g.eq(h[5],h[6]),g.ge(count,2));
  const effectiveActor=g.and(actorPresent,snap[0]),effectiveTarget=g.and(targetPresent,snap[1]);
  const actorRoute=g.and(effectiveActor,g.gt(route,0));
  const anyLong=routes.map(x=>g.ge(x,5)).reduce((a,b)=>g.or(a,b));
  const previousTarget=g.and(prior,effectiveTarget,g.not(g.eq(aux,255)),snap[2],g.eq(h[2],h[4]));
  const overlap=g.and(effectiveActor,effectiveTarget,g.lt(geometry[0],g.floor(g.mul(g.add(geometry[1],geometry[2]),.5))));
  const call=g.and(enabled,g.not(reset),g.or(actorRoute,g.not(suppression)));
  const forced=g.and(call,g.or(g.not(prior),previousTarget,overlap,anyLong));
  const reason=g.where(call,g.add(g.add(g.cast(g.not(prior),'float32'),g.mul(g.cast(previousTarget,'float32'),2)),g.add(g.mul(g.cast(overlap,'float32'),4),g.mul(g.cast(anyLong,'float32'),8))),0);
  for(const [name,value]of Object.entries({callFreeCamera:call,forced,resetOnly:reset,selectorSuppressed:g.and(enabled,g.or(suppression,reset)),actorRoutePresent:g.and(enabled,actorRoute),anyLongRoute:g.and(enabled,anyLong),targetIsPreviousActor:g.and(enabled,previousTarget),geometryOverlap:g.and(enabled,overlap),forceReasonMask:reason}))g.output(value,name);
  return g;
}

if(process.argv[1]&&new URL(`file://${process.argv[1]}`).href===import.meta.url){
  const graph=await buildCameraSelector(),base=new URL('./',import.meta.url);
  for(const [extension,data]of [['onnx',graph.model()],['json',JSON.stringify(graph.json(),null,2)+'\n']]){
    const name=`${graph.name}.${extension}`,temp=new URL(`${name}.pending-${process.pid}`,base);
    await writeFile(temp,data);await rename(temp,new URL(name,base));
  }
  console.log(JSON.stringify({model:graph.name,nodes:graph.nodes.length,bytes:graph.model().length}));
}
