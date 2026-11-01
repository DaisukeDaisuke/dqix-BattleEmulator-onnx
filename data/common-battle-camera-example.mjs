// Explicit starting conditions for the common program, not expected outputs.
// Camera object identities and definition tables are shipped with the release.
// No ROM, row+4 answer, message/font data or resource execution is needed.
const actorState=(actorId,actor,status)=>({
  actorId,group:actorId===0?-1:0,present:true,roster:true,dead:false,excluded:false,
  definitionId:actorId===0?null:303,originalMonsterId:actorId===0?null:303,actor,
  aux:[0,0,0,0,0,0,actorId===0?-1:0,...Array(14).fill(0)],status,wakeSkip:0,
  tension:[0,0,0],preparation:[0,0,0,0,0],config:[1,0,0,0,2,4,0],
  resistances:[...Array(21).fill(100),0],weapon:[0,0,10,0],charm:[0,0,0],magic:[0,0],packedScale:[0,0],
  ai:{cursor:0,alternate:false,storedTransitionId:0,previousTargetCount:0,previousTargets:Array(8).fill(-1)},
  rawStatus:0,rawFlags:0,rawRanks:Array(10).fill(0),rawTimers:Array(18).fill(0),state3c:0,auxiliaryBytes:Array(9).fill(0),
  commands:actorId===0?[{actionId:1,targets:[192]}]:[]
});
const visual=(id,start,position,initialRouteBytes)=>({
  id,start,goal:255,auxiliaryNode:255,faceNode:77,flag400:id>=192,descriptorPresent:1,
  typeFlagsLow16:id<4?0x180:0x480,tacticsPresent:id<4,tactics:5,behaviorBE:0,behaviorPrevious:0,
  expansionDepth:0,movementPresence:1,flag80:0,flag100:0,preferredTarget:255,secondaryTarget:255,
  position,visualPresent:1,routeCount:3,routeStep:-7,routeTime:123,visualFlags:0,
  routePositionXYZ:[11,22,33],resetPositionXYZ:[99,88,77],initialRouteBytes,
  residentProgram:0,height:4096,radius:4096
});
export const COMMON_BATTLE_CAMERA_EXAMPLE={
  id:'common-battle-camera-example',titleJa:'共通戦闘＋カメラ・ROM不要の初期条件例',
  scopeJa:'初期条件を明示した2体の例です。同じ共通プログラムへ能力値・行動表を入力します。row+4は各外部入力境界で候補を列挙し、実測との照合後も全ての残存枝を保持します。',
  inputs:{schema:'dq9-common-battle-state-v1',encounterId:'common-battle-camera-example',
    seed:[24,59,44,43,117,255,55,197],position:1,turn:1,completedTurns:0,firstTurn:true,surprise:0,
    actors:[actorState(0,[89,89,18,18,82,90,0,0,0,0,0,0,0,0,0,0,0,1,2,.5,500,0,0,0,0,0,0,0,15,58,0,0,0],[0,2,0,3,0,4,0]),
      actorState(192,[696,696,255,255,68,68,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,9,50,0,0,192],[0,0,0,0,0,0,0])],
    groups:Array.from({length:3},()=>({cursor:0,usedSlots:Array(6).fill(false)})),combo:[0,0,0,-1,0,0],context:[1,0],outcome:0,finished:false,supported:true,
    camera:{mode:'battle-camera',initial:{
      profile:'explicit-common-camera-start-v1',roster:[visual(0,0,[-42566,0,-36864],[0,11,22,33,44,55,66,77,88,99,110,121,132,143,154,165]),visual(192,40,[0,0,0],[192,203,214,225,236,247,2,13,24,35,46,57,68,79,90,101])],
      lookupObjects:[],battleType:0,sceneFlags:164,residentPrograms:[{actions:[1],codes:[]}],
      counter:0,sample100:77,appliedMode:3,heightQ12:12345,angleQ12:-23456,cameraInitialized:0,resourceFlags04:1515848704,
      commandBaseU16:[0x821c,0x023e],cameraRngPointerU16:[0,0x023e]
    }},pendingCommands:[],nowstate:[]}
};
