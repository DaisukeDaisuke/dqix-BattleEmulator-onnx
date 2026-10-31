import {sourceSHA256} from '../data/source-authority.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Graph} from './graph-builder.mjs';
import {RandomGraph} from './transition-graphs.mjs';
import cameraGeometry from '../restored/dq9-unified/data/camera-geometry.mjs';

export const FREE_CAMERA_STATE_FIELDS=['counter','sample100','appliedMode','heightParameterQ12','angleParameterQ12'];
export async function buildFreeCameraRng(){
  const relative='src/Combat/Overlay_0/func_ov000_0216e678.cpp',recordRelative='src/Combat/Overlay_0/func_ov000_0216f728.cpp',sourceRoot=new URL('../restored/dqix-decomp-decomp-matching/',import.meta.url),hash=bytes=>createHash('sha256').update(bytes).digest('hex'),
    sourceHashes=[relative,recordRelative].map(file=>({file,sha256:sourceSHA256(file)})),
    g=new Graph('rom-free-camera-rng-step',{
      authority:{matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10',sources:sourceHashes,address:'overlay0:0x0216fda4',recordPredicateAddress:'overlay0:0x02170e54',sourceNamesAreUSAAddresses:true},
      scope:'RNG and counter/random-parameter projection of actual free-camera helper0216fda4. Source/target lookup results, target Object3D height and the first u16 of the existing presentation record are explicit caller observations. Geometry, camera matrix, route setup, trigger eligibility and row+4 producer are external.',
      scopeJa:'フリーカメラ関数の乱数・連続回数・乱数由来パラメータを実行します。対象の高さと既存表示レコードを入力し、counter5の短絡もROM通りに扱います。',
      stateFields:FREE_CAMERA_STATE_FIELDS,
      memoryProjection:{counter:'camera+0x25c',sample100:'JPN global0x02185370+0x0 u16',appliedMode:'same global+0x2 u16',heightParameterQ12:'same global+0x8 s32',angleParameterQ12:'same global+0xc s32'},
      order:'Always bounded100 when enabled. Then bounded(5-counter) only for counter1..4, regardless of caller forced flag. Counter5 forces without bounded0. A forced move first validates both objects; invalid objects preserve counter and omit preset/height draws. Valid moves draw bounded4, then height float if height>0x2800, then angle float unless record exists and firstU16 is9..11.',
      preserved:'The global height/angle parameter words are not cleared on function entry. A branch that does not overwrite one retains its input value. Applied mode is reset to0 on enabled entry and set5 only after a successful move.',
      recordContract:'recordFirstU16 is the first word at the already-established camera+0x27c pointer. It is not independently guessed from a combat action ID. Null record is represented by recordPresent=false.',
      lookupContract:'sourcePresent and targetPresent are results of GetGameObjectByIndex after the helper stores caller IDs in bytes262/263. Actor membership and object construction are not simulated by these booleans.',
      geometryBoundary:'No row+4 mask, coordinates, occupancy, caller trigger or formation is generated. This graph follows a previously determined free-camera call. A route-only result is insufficient to determine these inputs.',
      defaults:{seed:[1,0,0,0,0,0,0,0],position:1,cameraState:[0,0,0,0,0],forced:true,sourcePresent:true,targetPresent:true,targetHeight:cameraGeometry.heights.find(x=>x.id===303).height,recordPresent:true,recordFirstU16:1,enabled:true},
      defaultProfile:'Isolated free-camera call using monster303 height11468 from restored camera-geometry metadata; forced=true is an explicit caller input, not an inferred trigger. This does not establish a whole camera sequence.',
      labels:{cameraState:'counter・最初の抽選・適用mode・高さQ12・角度Q12',forced:'呼出し元が強制移動を指定',sourcePresent:'描画側の行動者objectが存在',targetPresent:'描画側の対象objectが存在',targetHeight:'対象Object3Dの高さ',recordPresent:'camera+27c表示レコードが存在',recordFirstU16:'既存表示レコードの先頭u16',enabled:'この関数を実行する'},
      inputDomains:{seed:{min:0,max:255,integer:true,width:8},position:{min:1,max:4950,integer:true},targetHeight:{min:0,max:16777215,integer:true},recordFirstU16:{min:0,max:65535,integer:true}},
      fieldDomains:{cameraState:[{name:'counter',min:0,max:5,integer:true},{name:'sample100',min:0,max:99,integer:true},{name:'appliedMode',min:0,max:65535,integer:true},{name:'heightParameterQ12',min:-16777215,max:16777215,integer:true},{name:'angleParameterQ12',min:-16777215,max:16777215,integer:true}]},
      feedback:{seed:'nextSeed',position:'nextPosition',cameraState:'nextCameraState'},defaultSteps:1,
      rounding:'Each Mul/Sub/Add in the random height/angle expressions is a distinct binary32 operation, followed by signed truncation toward zero. Arbitrary fusion changes some integer boundary results.'
    });
  const seed=g.input('seed',['N',8]),position=g.input('position',['N',1],'int32'),state=g.split(g.input('cameraState',['N',5]),5),forced=g.input('forced',['N',1],'bool'),sourcePresent=g.input('sourcePresent',['N',1],'bool'),targetPresent=g.input('targetPresent',['N',1],'bool'),height=g.input('targetHeight'),recordPresent=g.input('recordPresent',['N',1],'bool'),record=g.input('recordFirstU16'),enabled=g.input('enabled',['N',1],'bool'),rng=new RandomGraph(g,seed,position);
  const first=rng.bounded(enabled,100),counterDraw=g.and(enabled,g.ge(state[0],1),g.lt(state[0],5)),counterSample=rng.bounded(counterDraw,g.max(g.sub(5,state[0]),1)),
    selected=g.and(enabled,g.or(forced,g.eq(state[0],5),g.and(counterDraw,g.eq(counterSample,0)))),applied=g.and(selected,sourcePresent,targetPresent),earlyReturn=g.and(selected,g.not(g.and(sourcePresent,targetPresent))),
    preset=rng.bounded(applied,4),heightDraw=g.and(applied,g.gt(height,0x2800)),heightUnit=rng.unit(heightDraw),
    heightValue=g.cast(g.mul(4096,g.add(-1.8,g.sub(.6,g.mul(.8,heightUnit)))),'int32'),
    excluded=g.and(recordPresent,g.ge(record,9),g.le(record,11)),angleDraw=g.and(heightDraw,g.not(excluded)),angleUnit=rng.unit(angleDraw),
    angleValue=g.cast(g.mul(4096,g.sub(1.0995574,g.mul(.7,g.mul(3.1415927,angleUnit)))),'int32'),
    nextCounter=g.where(enabled,g.where(applied,0,g.where(selected,state[0],g.add(state[0],1))),state[0]),
    nextState=g.cat([nextCounter,g.where(enabled,first,state[1]),g.where(enabled,g.where(applied,5,0),state[2]),g.where(heightDraw,g.cast(heightValue,'float32'),state[3]),g.where(angleDraw,g.cast(angleValue,'float32'),state[4])]);
  for(const [name,value]of Object.entries({nextSeed:rng.seed,nextPosition:rng.position,consumed:g.sub(rng.position,position),nextCameraState:nextState,initialRoll:g.where(enabled,first,-1),counterRoll:g.where(counterDraw,counterSample,-1),presetIndex:g.where(applied,preset,-1),selected,applied,earlyReturn,heightDraw,angleDraw,recordExcluded:excluded}))g.output(value,name);
  return g;
}
if(process.argv[1]&&new URL(`file://${process.argv[1]}`).href===import.meta.url){const report=await(await buildFreeCameraRng()).save();await writeFile(new URL('camera-rng-model.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({name:report.name,nodes:report.nodes,bytes:report.bytes}));}
