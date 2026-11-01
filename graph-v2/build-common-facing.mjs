import {pathToFileURL} from 'node:url';
import {Graph} from './graph-builder.mjs';
import {buildCameraFacingDirection3} from './build-camera-facing-math.mjs';
import {saveFixedGraph} from './build-camera-fixed-math.mjs';
const integer=(width,min,max)=>({width,min,max,integer:true}),bool=width=>({width,values:[true,false,0,1]});

export async function buildCommonFacing(){
  const g=new Graph('rom-common-actor-facing',{
    authority:[
      {path:'restored/dqix-decomp-decomp-matching/src/Combat/Main/func_02033920.cpp',sha256:'10ae2aa9cfd99f3c13672c8bc364314574d12ca4f2c37709b1cbe1d4c044b7b5'},
      {path:'restored/dqix-decomp-decomp-matching/src/Combat/Main/func_02033834.cpp',sha256:'5dc174c63b87a47197e7186abb59555e2ecc2d00992f5546752325a7286b9659'},
      {path:'restored/dqix-decomp-decomp-matching/src/Combat/Main/func_02033874.cpp',sha256:'6d593fed1520a5e3fb18754706105e2481133df3289bbbf26bff14d03d295991'},
      {path:'restored/dqix-decomp-decomp-matching/src/Combat/Main/func_0204a030.cpp',sha256:'c55e926f696ecd6b94b9418aa4506c7816c222beeab5051954389fbdcaf77f47'},
      {path:'restored/dqix-decomp-decomp-matching/src/World/Object3D.cpp',symbol:'Object3D::MaybeSetRegularAnimation'}
    ],
    address:'JPN02033458 / USA02033920; pending JPN0204ae50 / USA0204a030',
    scope:'Shared actual actor-facing helper, with exact SDK geometry and stores to orientationAE, rotationY for behavior3/4, C4bit15 clear, and descriptor pending-facing target. Immediate calls qualify the real turn-animation gate from behavior, signed animationB0, current angle, model pointer, flagsbit22 and loaded-package-list pointer. Cases requiring a nonempty animation package are returned unsupported, never presumed successful or replaced by a forced completion. Null model/package and flag22 paths execute their original no-animation semantics.',
    scopeJa:'実座標から向きを求め、向き・回転・保留対象を更新します。回転アニメーションが必要な場合も実際のモデル・パッケージ有無で判定し、未実装の有効パッケージを完了扱いにしません。',
    inputDomains:{selfId:integer(1,0,255),sourceId:integer(1,0,255),sourceObjectPresent:bool(1),selfPosition:integer(3,-4194303,4194303),sourcePosition:integer(3,-4194303,4194303),rotationY:integer(1,-4194303,4194303),orientationAE:integer(1,-32768,32767),animationB0:integer(1,-32768,32767),behaviorBE:integer(1,0,255),flagsC4:integer(1,0,65535),objectFlagsU16:integer(2,0,65535),modelPresent:bool(1),animationPackageListPresent:bool(1),descriptorPresent:bool(1),pendingFacingTarget:integer(1,0,255),pendingRequest:bool(1),immediateRequest:bool(1)},
    feedback:{rotationY:'nextRotationY',orientationAE:'nextOrientationAE',flagsC4:'nextFlagsC4',pendingFacingTarget:'nextPendingFacingTarget'},defaultSteps:1
  });
  const scalar=(name,type='float32')=>g.input(name,['N',1],type),flag=name=>scalar(name,'bool'),self=scalar('selfId'),source=scalar('sourceId'),sourcePresent=flag('sourceObjectPresent'),selfPosition=g.input('selfPosition',['N',3],'int32'),sourcePosition=g.input('sourcePosition',['N',3],'int32'),rotation=scalar('rotationY'),orientation=scalar('orientationAE'),animation=scalar('animationB0'),behavior=scalar('behaviorBE'),flags=scalar('flagsC4'),objectFlags=g.split(g.input('objectFlagsU16',['N',2]),2),model=flag('modelPresent'),packages=flag('animationPackageListPresent'),descriptor=flag('descriptorPresent'),pending=scalar('pendingFacingTarget'),pendingRequest=flag('pendingRequest'),immediateRequest=flag('immediateRequest');
  const angle=g.cast(g.inline(await buildCameraFacingDirection3(),{selfPosition,targetPosition:sourcePosition},'faceDirection').angleResult,'float32'),write=g.and(immediateRequest,sourcePresent,g.not(g.eq(self,source))),rotationWrite=g.and(write,g.or(g.eq(behavior,3),g.eq(behavior,4))),nextRotation=g.where(rotationWrite,angle,rotation),delta=g.sub(angle,nextRotation),difference=g.where(g.gt(delta,12868),g.sub(delta,25736),g.where(g.lt(delta,-12868),g.add(delta,25736),delta)),turn=g.and(write,g.eq(behavior,0),g.gt(g.max(difference,g.sub(0,difference)),4096),g.le(animation,268)),blockedBit=g.sub(g.floor(g.mul(objectFlags[1],1/64)),g.mul(g.floor(g.mul(objectFlags[1],1/128)),2)),requiresAnimation=g.and(turn,model,packages,g.eq(blockedBit,0)),clearFlags=g.sub(flags,g.mul(g.floor(g.mul(flags,1/32768)),32768));
  g.output(g.not(requiresAnimation),'supported');g.output(requiresAnimation,'requiresAnimationPackage');g.output(turn,'callsTurnAnimation');g.output(angle,'computedAngle');g.output(nextRotation,'nextRotationY');g.output(g.where(write,angle,orientation),'nextOrientationAE');g.output(g.where(write,clearFlags,flags),'nextFlagsC4');g.output(g.where(g.and(pendingRequest,descriptor),source,pending),'nextPendingFacingTarget');g.output(write,'orientationWritten');return g;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await saveFixedGraph(await buildCommonFacing()),null,2));
