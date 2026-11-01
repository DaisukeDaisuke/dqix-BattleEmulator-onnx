import {pathToFileURL} from 'node:url';
import {Graph} from './graph-builder.mjs';
import {exactRoundedDistance} from './build-camera-geometry.mjs';
import {exactNormalize3} from './build-camera-facing-math.mjs';
import {exactMultiplyQ12,saveFixedGraph} from './build-camera-fixed-math.mjs';

const integer=(width,min,max)=>({width,min,max,integer:true}),bool=width=>({width,values:[true,false,0,1]});
const authority=[
  {path:'restored/dqix-decomp-decomp-matching/src/Combat/Overlay_25/func_ov025_021dc324.cpp',sha256:'790e37179fe2f8669cb6e50e2856c9cb67a74cbbb9d36d654f5eacb18135b311'},
  {path:'restored/dqix-decomp-decomp-matching/src/Combat/Overlay_25/func_ov025_021df5e4.cpp',sha256:'a6ebefa9cff710af274b9e75375ed6514369a32d698fed63f8659be4e78f2b9f'},
  {path:'restored/dqix-decomp-decomp-matching/src/Combat/Overlay_25/func_ov025_021df9f4.cpp',sha256:'21d102fc16a27b2207b09e009573c39b66bd875343f530e57170e67e62067f18'},
  {path:'restored/dqix-decomp-decomp-matching/src/Combat/Main/func_0204936c.cpp',sha256:'24f82995ebad30206ea95debbccdf3638e98b5a13fb9928930fc544628f16513'},
];

// floor(value/3072), with a bounded integer dividend. Dividing by1024 is
// exact; the remaining division by3 uses restoring bits and never rounds.
function divide3072(g,value){
  const n=g.floor(g.mul(value,1/1024));let quotient=g.mul(n,0),remainder=quotient;
  for(let bit=14;bit>=0;bit--){const digit=g.sub(g.floor(g.mul(n,2**-bit)),g.mul(g.floor(g.mul(n,2**(-bit-1))),2)),next=g.add(g.mul(remainder,2),digit),take=g.ge(next,3);remainder=g.where(take,g.sub(next,3),next);quotient=g.add(quotient,g.where(take,2**bit,0));}
  return quotient;
}

export function buildCommonPresentationGate(){
  const g=new Graph('rom-common-presentation-state6',{
    authority,address:'JPN021dcc18 / USA021dc324; marker count JPN021dfef4 / USA021df5e4',
    scope:'Common presentation state6 control from real initial camera, script, action-table, actor and movement state. Marker count is derived from original SDK distance, normalize and rounded Q12 scale of source/target positions; it is not supplied after the helper. Exact unsigned timer comparison and original u8 marker-count wrapping are retained. Outputs request original message/facing/delay helpers in order; the caller must execute their separate common semantic modules before committing the complete function. Marker rendering/animation, indicator transforms and whole world scheduling are not claimed by this gate.',
    scopeJa:'カメラ完了、実際の対象移動、距離から算出したマーカー数で共通の表示進行を決めます。固定フレーム待ちや完了フラグの注入は使いません。メッセージ・向き・遅延の要求は対応する共通処理へ引き継ぎます。',
    inputDomains:{scriptEnabled:bool(1),presentationState:integer(1,0,255),waitFlagU16:integer(2,0,65535),cameraInitialized:integer(1,0,255),cameraReadyByte:integer(1,0,255),actionId:integer(1,0,65535),actionRowPresent:bool(1),actionRowCategory:integer(1,0,15),actionRowDefinitionId:integer(1,0,4095),participantPresent:bool(1),firstTargetPresent:bool(1),sourceId:integer(1,0,255),targetId:integer(1,0,255),battleType:integer(1,0,65535),markerCount:integer(1,0,255),sourceXYZ:integer(3,-4194303,4194303),targetXYZ:integer(3,-4194303,4194303),sourceRadius:integer(1,0,65535),sourceObjectPresent:bool(1),targetObjectPresent:bool(1),targetFlags6cLow16:integer(1,0,65535),targetBehaviorC1:integer(1,0,255),targetDescriptorPresent:bool(1),targetDescriptorFlagsLow16:integer(1,0,65535),targetPartyStatePresent:bool(1),targetPartyFlags180Low16:integer(1,0,65535),targetPartyByteC0:integer(1,0,255),pendingFacingMode:integer(1,0,255),movementTimer:integer(1,0,65535),deltaU16:integer(2,0,65535),targetsPresent:bool(12),targetsDescriptorPresent:bool(12),targetsFlagsLow16:integer(12,0,65535)},
    feedback:{presentationState:'nextPresentationState',waitFlagU16:'nextWaitFlagU16',movementTimer:'nextMovementTimer',markerCount:'nextMarkerCount'},defaultSteps:1,
    proof:'With admitted XYZ and radius, both distances fit24unsigned bits; normalized Q12 scale is calculated in byte limbs. The positive SDK rounded fixedDivide(distance,3072), cast tofloat32 and divided by4096 has the same nonnegative truncation as floor(distance/3072) in this domain. Compute that quotient with restoring division, then apply the original u8 cast BEFORE min10. Original camera readiness is !initialized || readyByte, not a predicted timer. A timer equal to delta reaches0 without advancing state until a subsequent call.'
  });
  const scalar=(name,type='float32')=>g.input(name,['N',1],type),flag=name=>scalar(name,'bool'),bit=(x,n)=>g.sub(g.floor(g.mul(x,2**-n)),g.mul(g.floor(g.mul(x,2**(-n-1))),2));
  const enabled=flag('scriptEnabled'),state=scalar('presentationState'),wait=g.split(g.input('waitFlagU16',['N',2]),2),initialized=scalar('cameraInitialized'),readyByte=scalar('cameraReadyByte'),action=scalar('actionId'),rowPresent=flag('actionRowPresent'),category=scalar('actionRowCategory'),definition=scalar('actionRowDefinitionId'),participant=flag('participantPresent'),firstTarget=flag('firstTargetPresent'),sourceId=scalar('sourceId'),targetId=scalar('targetId'),battleType=scalar('battleType'),priorCount=scalar('markerCount');
  const src=g.split(g.input('sourceXYZ',['N',3]),3),dst=g.split(g.input('targetXYZ',['N',3]),3),radius=scalar('sourceRadius'),sourceObject=flag('sourceObjectPresent'),targetObject=flag('targetObjectPresent'),targetFlags=scalar('targetFlags6cLow16'),behavior=scalar('targetBehaviorC1'),descriptor=flag('targetDescriptorPresent'),descriptorFlags=scalar('targetDescriptorFlagsLow16'),partyState=flag('targetPartyStatePresent'),partyFlags=scalar('targetPartyFlags180Low16'),partyByte=scalar('targetPartyByteC0'),pendingFacing=scalar('pendingFacingMode'),timer=scalar('movementTimer'),delta=g.split(g.input('deltaU16',['N',2]),2);
  const present=g.split(g.input('targetsPresent',['N',12],'bool'),12),descriptors=g.split(g.input('targetsDescriptorPresent',['N',12],'bool'),12),movementFlags=g.split(g.input('targetsFlagsLow16',['N',12]),12);
  const waiting=g.or(...wait.map(x=>g.not(g.eq(x,0)))),ready=g.or(g.eq(initialized,0),g.not(g.eq(readyByte,0))),admit=g.and(enabled,waiting,ready),special=g.or(...[1,2,219,336].map(x=>g.eq(action,x)),g.and(rowPresent,g.or(g.eq(category,2),g.eq(definition,174)))),targetBranch=g.and(admit,special,participant,firstTarget),initialize=g.and(targetBranch,g.not(g.and(g.or(g.eq(battleType,800),g.eq(battleType,801)),g.eq(sourceId,0))),g.not(g.eq(initialized,0)));
  const zero=g.mul(state,0),from=[src[0],zero,src[2]],to=[dst[0],zero,dst[2]],distance=exactRoundedDistance(g,from,to).distance,normal=exactNormalize3(g,to.map((x,i)=>g.sub(x,from[i]))).normalized,offset=normal.map(x=>g.cast(exactMultiplyQ12(g,x,g.floor(g.mul(radius,.5))).value,'float32')),origin=from.map((x,i)=>g.add(x,offset[i])),remaining=exactRoundedDistance(g,origin,to).distance,quotient=divide3072(g,remaining),sum=g.add(quotient,1),wrapped=g.sub(sum,g.mul(g.floor(g.mul(sum,1/256)),256)),newCount=g.min(wrapped,10),writeCount=g.and(initialize,sourceObject,targetObject,g.ge(distance,radius)),count=g.where(writeCount,newCount,priorCount);
  const top=g.floor(g.mul(behavior,1/16)),faceEligible=g.and(targetObject,g.eq(bit(targetFlags,0),0),g.not(g.and(g.ge(top,2),g.le(top,5))),g.or(g.not(descriptor),g.and(g.eq(bit(descriptorFlags,9),0),g.eq(bit(descriptorFlags,8),0))),g.not(g.and(g.le(targetId,3),partyState,g.or(g.not(g.eq(bit(partyFlags,0),0)),g.eq(partyByte,8)))));
  // The original reads the action row after the face predicate succeeds.
  // An absent row at that dereference is deliberately unsupported.
  const supported=g.not(g.and(targetBranch,faceEligible,g.not(rowPresent))),moving=g.and(descriptor,g.not(g.eq(bit(descriptorFlags,4),0))),early=g.and(targetBranch,faceEligible,rowPresent,g.eq(definition,174),moving),proceed=g.and(admit,g.not(early),supported),face=g.and(targetBranch,faceEligible,g.not(early),supported),notWait=g.and(enabled,g.not(waiting)),elapsed=g.or(g.gt(delta[1],0),g.lt(timer,delta[0])),anyMoving=g.or(...present.map((x,i)=>g.and(x,descriptors[i],g.not(g.eq(bit(movementFlags[i],4),0))))),advance=g.or(g.and(proceed,g.eq(count,0)),g.and(notWait,elapsed,g.not(anyMoving))),tail=g.or(proceed,notWait);
  g.output(supported,'supported');g.output(g.where(advance,3,state),'nextPresentationState');g.output(g.cat(wait.map(x=>g.where(proceed,0,x))),'nextWaitFlagU16');g.output(g.where(proceed,0,g.where(g.and(notWait,g.not(elapsed)),g.sub(timer,delta[0]),timer)),'nextMovementTimer');g.output(count,'nextMarkerCount');
  for(const[name,value]of Object.entries({hideIndicators:admit,initializeMarkers:initialize,markerCountWritten:writeCount,queueStartMessages:proceed,delayCommit:g.and(tail,g.not(g.eq(action,219))),setDelay750:g.and(tail,g.eq(action,219)),requestPendingFace:g.and(face,g.not(g.eq(pendingFacing,0))),requestImmediateFace:g.and(face,g.eq(pendingFacing,0)),earlyReturn174:early,targetFaceEligible:faceEligible,anyTargetMoving:anyMoving}))g.output(value,name);
  g.output(distance,'markerInitialDistance');g.output(remaining,'markerRemainingDistance');g.output(g.cat(normal),'markerDirection');g.output(g.cat(origin),'markerOrigin');g.output(newCount,'computedMarkerCount');
  return g;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await saveFixedGraph(buildCommonPresentationGate()),null,2));
