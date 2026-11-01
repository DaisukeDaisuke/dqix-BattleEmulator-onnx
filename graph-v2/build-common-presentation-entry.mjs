import {fileURLToPath} from 'node:url';
import {Graph} from './graph-builder.mjs';

const directory=new URL('./',import.meta.url),SCENE_BYTES=0x8000,IDS=[0,1,2,3,192,193,194,195,196,197,198,199];
// These are byte-layout descriptors, not a synthetic full-scene state. An
// adapter may project only fields it actually retains and must consume an
// unchanged output field only when every corresponding input byte is known.
export const COMMON_PRESENTATION_ENTRY_SCENE_FIELDS=Object.freeze({
  contextPointer:{offset:0x218,width:4,preserved:true},battleDataPointer:{offset:0x21c,width:4,preserved:true},
  scriptHeader:{offset:0x224,width:4},scriptCursor:{offset:0x228,width:4},scriptContext:{offset:0x230,width:4},
  scriptWord1c0:{offset:0x3e4,width:4,signed:true},programFlags3e8:{offset:0x3e8,width:4,preserved:true},
  timelineCount:{offset:0x750,width:1},feedbackCount:{offset:0x760,width:1},feedbackSelector:{offset:0x7ec,width:2},scriptDelay:{offset:0x7f2,width:2},
  messageIds:{offset:0x80c,width:2,count:16},messageTargets:{offset:0x82c,width:2,count:16,signed:true},messageExtraSources:{offset:0x84c,width:2,count:16,signed:true},messageSerials:{offset:0x86c,width:2,count:16,signed:true},
  messageHolds:{offset:0x88c,width:2,count:16,preserved:true},messageTypes:{offset:0x8ac,width:1,count:16},messageContexts:{offset:0x8bc,width:4,count:16},
  messageActive:{offset:0x95c,width:1},messageSerialCounter:{offset:0x95e,width:2,signed:true},messageCursor:{offset:0x960,width:2,signed:true},messageContext:{offset:0x964,width:4},messageSavedSource:{offset:0x968,width:2,signed:true},
  messagePhase:{offset:0x96a,width:2},messageHoldTimer:{offset:0x96c,width:2},messageDefaultHold:{offset:0x96e,width:2},scriptEnabled:{offset:0xa5d,width:1},
  cameraBytes:{offset:0xb94,width:1,count:0x280,preserved:true},mainState:{offset:0xe24,width:4,preserved:true},presentationState:{offset:0xe28,width:4},sceneE2c:{offset:0xe2c,width:4},
  currentActionIndex:{offset:0x57c8,width:4,preserved:true},markerCount:{offset:0x5e2a,width:1},scene703c:{offset:0x703c,width:1},scene71c5:{offset:0x71c5,width:1},overlayTaskId:{offset:0x7920,width:2,signed:true,preserved:true},
});
const authority=[
  {path:'src/Combat/Overlay_26/func_ov026_021d8ba0.cpp',jpn:'021db44c..021db460: accepted-menu cursor store and original turnBegin call'},
  {path:'src/Combat/Overlay_0/func_ov000_02160e94.cpp',jpn:'02162630..02162658: already-completed loader tail'},
  {path:'src/Combat/Overlay_25/func_ov025_021db6dc.cpp',jpn:'021dbfd0: complete next presentation initializer'},
  ...['021e88d8','021e8a20','021e8a4c','021e8d14','021ebab4','021ebb24','021dcd5c','021dcd98','021df9b0','021eed58','021dfbfc','021ed124'].map(id=>({path:`src/Combat/Overlay_25/func_ov025_${id}.cpp`})),
  {path:'src/Combat/Overlay_0/func_ov000_0216fe48.cpp'},
  {path:'src/Combat/Main/func_02033b58.cpp'},
  {path:'src/Combat/Main/func_02049458.cpp'},
  {path:'src/Combat/Overlay_0/func_ov000_0215ec1c.cpp',jpn:'0216039c: enumerate enemy IDs with GameObject+0 flag0x400'},
  {path:'src/GameState/GameStateObjects.cpp',jpn:'0200fcc4: GetCombatantByIndex requires GameObject+0 flag0x80'},
  {path:'src/Combat/Main/func_0200fea4.cpp'},
  {path:'src/Combat/Main/func_0200ff1c.cpp'},
  {path:'src/Combat/Main/func_02053c6c.cpp'},
  {path:'src/Memory/SafeAllocator.cpp'},
];

/** Two explicit accepted-input boundaries. Neither infers UI/loader readiness. */
export function buildCommonPresentationEntryControl(){
  const g=new Graph('rom-common-presentation-entry-control',{
    inputContractVersion:1,authority,
    scope:'Operation0 is the actual accepted-menu cursor store before original turnBegin; the caller must run the shared turnBegin exactly once after this request. Operation1 is the actual already-completed overlay-loader tail after its task removal. These bounded stores do not emulate or infer the preceding menu UI, resource destruction, overlay filesystem transfer or task completion.',
    defaults:{operation:0,currentIndex:0,mainState:7,presentationState:0,stateDirty:0,overlayTaskId:-1,enabled:true},
  });
  const op=g.input('operation'),index=g.input('currentIndex'),main=g.input('mainState'),state=g.input('presentationState'),dirty=g.input('stateDirty'),task=g.input('overlayTaskId'),enabled=g.input('enabled',['N',1],'bool');
  const menu=g.and(enabled,g.eq(op,0)),loader=g.and(enabled,g.eq(op,1));
  g.output(g.where(menu,0,index),'nextCurrentIndex');g.output(g.where(loader,8,main),'nextMainState');g.output(g.where(loader,0,state),'nextPresentationState');g.output(g.where(loader,1,dirty),'nextStateDirty');g.output(g.where(loader,-1,task),'nextOverlayTaskId');g.output(menu,'requestTurnBegin');g.output(g.or(g.eq(op,0),g.eq(op,1)),'supported');return g;
}

/** Exact raw scene stores plus roster/cached-target side effects of021dbfd0. */
export function buildCommonPresentationEntry(){
  const g=new Graph('rom-common-presentation-entry',{
    inputContractVersion:2,authority,semanticSceneFields:COMMON_PRESENTATION_ENTRY_SCENE_FIELDS,
    scope:'Complete raw scene stores of original JPN021dbfd0 and its initialization leaves, preserving every unmodified byte, camera state, queue index and unused FIFO hold override. Absolute pointers use u16 limbs; the supplied scene must match the actual global-current-scene alias and its retained context pointer. The input participant records are the actual linked command traversal, flattened structurally in order; the graph selects the last eligible cached target per actor. Behavior reset enumerates only IDs192..199 with actual GameObject+0 flags0x400 and0x80 and a clear current-status dead bit. These type flags are distinct from renderer flags at+0x6c. This initializer neither creates a fresh scene nor advances a command.',
    defaults:{sceneBaseU16:[0,0],globalSceneBaseU16:[0,0],contextU16:[0,0],actorLookupPresent:Array(12).fill(false),actorTypeFlagsLow16:Array(12).fill(0),actorDead:Array(12).fill(false),actorVisualPresent:Array(12).fill(false),actorBehavior:Array(12).fill(0),actorPreviousBehavior:Array(12).fill(0),actorPreferredTarget:Array(12).fill(255),partyTacticsPresent:Array(4).fill(false),partyTactics:Array(4).fill(5),recordCount:0,recordSourceIds:Array(72).fill(-1),recordFirstTargetIds:Array(72).fill(-1),recordHasTarget:Array(72).fill(false),resource4100U16:[0,0],ui17ee:0,context8e49:0,battle35:0,scriptGlobalU16:[0,0],enabled:true},
    inputDomains:{sceneBytes:{width:SCENE_BYTES,min:0,max:255,integer:true},sceneBaseU16:{width:2,min:0,max:65535,integer:true},globalSceneBaseU16:{width:2,min:0,max:65535,integer:true},contextU16:{width:2,min:0,max:65535,integer:true},actorTypeFlagsLow16:{width:12,min:0,max:65535,integer:true},recordCount:{width:1,min:0,max:72,integer:true}},
    actorOrder:IDS,
  });
  const input=(name,width=1,type='float32')=>g.input(name,['N',width],type),scene=input('sceneBytes',SCENE_BYTES),base=g.split(input('sceneBaseU16',2),2),globalBase=g.split(input('globalSceneBaseU16',2),2),context=g.split(input('contextU16',2),2),enabled=input('enabled',1,'bool'),count=input('recordCount');
  const rawContext=g.split(g.op('Gather',[scene,g.constant([0x218,0x219,0x21a,0x21b],'int32',[4])],{axis:1},{shape:['N',4]}),4),supported=g.and(g.ge(count,0),g.le(count,72),g.eq(base[0],globalBase[0]),g.eq(base[1],globalBase[1]),g.eq(context[0],g.add(rawContext[0],g.mul(rawContext[1],256))),g.eq(context[1],g.add(rawContext[2],g.mul(rawContext[3],256)))),apply=g.and(enabled,supported);
  const zero=g.mul(g.cast(enabled,'float32'),0),mod=(x,n)=>g.sub(x,g.mul(g.floor(g.mul(x,1/n)),n)),bytes16=x=>[mod(x,256),g.floor(g.mul(x,1/256))];
  const pointer=offset=>{const low=g.add(base[0],offset);return[...bytes16(mod(low,65536)),...bytes16(mod(g.add(base[1],g.floor(g.mul(low,1/65536))),65536))];};
  // Gather from one small value pool and the original bytes. This avoids
  // expanding every untouched byte into a separate graph node.
  const values=[zero,g.add(zero,1),g.add(zero,255)],patches=new Map(),constantIndex=new Map([[0,0],[1,1],[255,2]]);
  const constant=n=>{if(!constantIndex.has(n)){constantIndex.set(n,values.length);values.push(g.add(zero,n));}return constantIndex.get(n);};
  const put=(at,width,value)=>{for(let i=0;i<width;i++)patches.set(at+i,constant(Math.floor(value/2**(8*i))%256));};
  const fill=(at,n,value=0)=>{for(let i=0;i<n;i++)patches.set(at+i,constant(value));};
  const dynamic=(at,bytes)=>bytes.forEach((v,i)=>{patches.set(at+i,values.length);values.push(v);});
  const s=0x224;
  put(s,4,0);put(s+4,4,0);fill(s+0x10,0x20);put(s+0x30,1,0);
  for(let i=0;i<3;i++){put(s+0x34+0x14*i,4,0);dynamic(s+0x14+4*i,pointer(s+0x34+0x14*i));dynamic(s+0x24+4*i,pointer(s+0x70+0x70*i));}
  put(s+0x1c0,4,0xffffffff);put(s+0x1d8,4,0);put(s+0x21c,2,1);put(s+0x21e,2,0);put(s+0x224,4,0);
  for(let i=0;i<12;i++){
    const p=s+0x22c+0x40*i;put(p,4,0);fill(p+4,3);fill(p+8,0x18);put(p+0x20,2,65535);put(p+0x22,2,65535);fill(p+0x24,0xe);put(p+0x30,2,0);put(p+0x38,1,0);put(p+0x3a,1,0);put(p+0x3c,2,0);
  }
  const t=s+0x22c;fill(t+0x300,7);fill(t+0x308,8);put(t+0x310,1,1);put(t+0x311,1,0);
  put(0x703d,1,0);put(0x703c,1,0);fill(0x70e0,10,255);put(0x70ea,2,0);
  put(0x70f0,1,0);put(0x70ef,1,0);fill(0x71aa,8,255);put(0x71b2,2,0);fill(0x71b4,16);
  const q=s+0x5e8;fill(q,0x80);fill(q+0xa0,0xa0);fill(q+0x150,6);put(q+0x158,4,0);fill(q+0x15c,6);put(q+0x162,2,750);put(q+0x16c,1,0);put(q+0x1ac,2,0);
  const text=s+0x798;put(text,4,0xffffffff);put(text+0x84,4,0);fill(text+0x88,0x18);put(text+0xa0,1,0);put(text+0xa1,1,0);
  put(s+0x83c,1,0);put(s+0x87c,1,0);put(s+0x880,4,0xffffffff);put(s+0x884,4,0);put(s+0x57c,2,0);put(s+0x57e,2,0);put(s+0x580,2,0x333);put(s+0x582,1,0);
  for(let i=0;i<4;i++){const p=s+0x594+12*i;put(p,4,0xffffffff);fill(p+4,6);}
  put(s+0x5c5,1,0);put(s+0x5c6,1,0);dynamic(s+0xc,context.flatMap(bytes16));put(s+0x228,4,0);put(s+0x5c8,2,255);put(s+0x5ce,2,0);
  const timeline=0x5ca0;fill(timeline+0x158,24);put(timeline+0x170,4,1);fill(timeline+0x176,22);
  const controller=0xaac;fill(controller,0xe8);for(let i=0;i<7;i++)dynamic(controller+0x1c*i+0x18,pointer(controller+0x1c*(i+1)));dynamic(controller+0xe4,pointer(controller));
  put(0xe2c,4,0);put(0xe28,4,1);put(0x71c5,1,0);
  const pool=g.cat([...values,scene]),start=values.length,indices=Array.from({length:SCENE_BYTES},(_,i)=>patches.get(i)??start+i),patched=g.op('Gather',[pool,g.constant(indices,'int32',[SCENE_BYTES])],{axis:1},{shape:['N',SCENE_BYTES]}),nextScene=g.where(apply,patched,scene);
  g.output(nextScene,'nextSceneBytes');g.contract.rawSceneWrittenOffsets=[...patches.keys()].sort((a,b)=>a-b);
  const present=g.split(input('actorLookupPresent',12,'bool'),12),typeFlags=g.split(input('actorTypeFlagsLow16',12),12),dead=g.split(input('actorDead',12,'bool'),12),visual=g.split(input('actorVisualPresent',12,'bool'),12),behavior=g.split(input('actorBehavior',12),12),previous=g.split(input('actorPreviousBehavior',12),12),preferred=g.split(input('actorPreferredTarget',12),12),tacticsPresent=g.split(input('partyTacticsPresent',4,'bool'),4),tactics=g.split(input('partyTactics',4),4),sources=input('recordSourceIds',72),targets=input('recordFirstTargetIds',72),targetPresent=input('recordHasTarget',72,'bool');
  const flag=(value,mask)=>g.gt(mod(g.floor(g.mul(value,1/mask)),2),0);
  const positions=g.constant(Array.from({length:72},(_,i)=>i+1),'float32',[1,72]),active=g.and(targetPresent,g.le(positions,count)),nextBehavior=[],nextPrevious=[],nextPreferred=[];
  for(let i=0;i<12;i++){
    const combatant=g.and(present[i],flag(typeFlags[i],0x80)),reset=g.and(apply,combatant,i>=4?flag(typeFlags[i],0x400):g.constant(false,'bool'),g.not(dead[i]));nextBehavior.push(g.where(reset,0,behavior[i]));nextPrevious.push(g.where(reset,behavior[i],previous[i]));
    const eligible=g.and(apply,combatant,visual[i],i>=4?g.constant(true,'bool'):g.and(flag(typeFlags[i],0x100),tacticsPresent[i],g.not(g.eq(tactics[i],5)))),matches=g.and(active,g.eq(sources,IDS[i]));
    const selected=g.split(g.where(matches,positions,0),72).reduce((a,b)=>g.max(a,b)),target=g.op('GatherElements',[g.cat([preferred[i],targets]),g.cast(selected,'int32')],{axis:1},{shape:['N',1]});nextPreferred.push(g.where(eligible,mod(target,256),preferred[i]));
  }
  g.output(g.cat(nextBehavior),'nextActorBehavior');g.output(g.cat(nextPrevious),'nextActorPreviousBehavior');g.output(g.cat(nextPreferred),'nextActorPreferredTarget');
  for(const[name,width,value]of[['resource4100U16',2,0],['ui17ee',1,1],['context8e49',1,0],['battle35',1,0],['scriptGlobalU16',2,0]]){const before=input(name,width);g.output(g.where(apply,value,before),'next'+name[0].toUpperCase()+name.slice(1));}
  g.output(supported,'supported');g.output(apply,'completed');return g;
}

/** Original overlay image/BSS and the separate full-frame header boundary. */
export function buildCommonPresentationEntryGlobals(){
  const g=new Graph('rom-common-presentation-entry-globals',{
    inputContractVersion:1,
    authority:[...authority,{path:'src/Combat/Overlay_25/func_ov025_021db038.cpp',jpn:'021db91c prefix: reset pending-facing byte, then set it iff camera+260 is zero'},{path:'src/Combat/Overlay_0/func_ov000_0215fc60.cpp',jpn:'reads actual context+81fe, identifies scenarios0320/0321'},{path:'src/Combat/Overlay_0/func_ov000_02160fd4.cpp',jpn:'reads scene+57e4 flags'}],
    originalOverlay25Globals:[{address:'021ef6e4',field:'resourceTaskIdU16',bytes:'ffffffff'},{address:'021ef6e8',field:'waitFlagU16',bytes:'01000000'},{address:'021efc34',field:'pendingFacingMode/movementTimer',bytes:'00000000'},{address:'021efc3c',field:'fallbackGlobal8U16',bytes:'00000000'},{address:'021efc44',field:'fallbackGlobal10U16',bytes:'00000000'},{address:'021efc48',field:'presentationGlobal48U16',bytes:'00000000'},{address:'021efc4c',field:'scriptOwnerGlobalU16',bytes:'00000000'},{address:'021efc54',field:'eventFlagsU16',bytes:'00000000'},{address:'021efc5c',field:'scriptGlobalU16',bytes:'00000000'}],
    scope:'Operation0 is an explicitly completed reload of unchanged original overlay25 code/data/BSS: its wait word is1, not0; scoped BSS globals are zero. Operation1 is the real fullframe header before optional initializer and admission. Camera/global geometry in overlay0 is preserved and is not reconstructed. context81fe is the actual raw unsigned scenario field, not the battle outcome. The normal admission gate rejects the distinct0320/0321 story-message path and scene+57e4 bit01000000; it neither clears that flag nor claims to execute that path. Loader readiness and accepted menu state are external explicit boundaries.',
    defaults:{operation:0,waitFlagU16:[0,0],eventFlagsU16:[0,0],scriptGlobalU16:[0,0],presentationGlobal48U16:[0,0],scriptOwnerGlobalU16:[0,0],resourceTaskIdU16:[65535,65535],fallbackGlobal8U16:[0,0],fallbackGlobal10U16:[0,0],pendingFacingMode:0,movementTimer:0,cameraInitialized:0,context81fe:0,sceneFlagsU16:[0,0],enabled:true},
    inputDomains:{operation:{width:1,min:0,max:1,integer:true},waitFlagU16:{width:2,min:0,max:65535,integer:true},eventFlagsU16:{width:2,min:0,max:65535,integer:true},scriptGlobalU16:{width:2,min:0,max:65535,integer:true},sceneFlagsU16:{width:2,min:0,max:65535,integer:true},pendingFacingMode:{width:1,min:0,max:255,integer:true},movementTimer:{width:1,min:0,max:65535,integer:true},cameraInitialized:{width:1,min:0,max:255,integer:true},context81fe:{width:1,min:0,max:65535,integer:true}},
  });
  const op=g.input('operation'),wait=g.input('waitFlagU16',['N',2]),event=g.input('eventFlagsU16',['N',2]),owner=g.input('scriptGlobalU16',['N',2]),pending=g.input('pendingFacingMode'),timer=g.input('movementTimer'),initialized=g.input('cameraInitialized'),scenario=g.input('context81fe'),flags=g.split(g.input('sceneFlagsU16',['N',2]),2),enabled=g.input('enabled',['N',1],'bool');
  const reload=g.and(enabled,g.eq(op,0)),header=g.and(enabled,g.eq(op,1)),specialBit=g.gt(g.sub(g.floor(g.mul(flags[1],1/256)),g.mul(g.floor(g.mul(flags[1],1/512)),2)),0),normal=g.and(g.not(g.eq(scenario,0x320)),g.not(g.eq(scenario,0x321)),g.not(specialBit));
  g.output(g.where(reload,g.constant([1,0],'float32',[1,2]),wait),'nextWaitFlagU16');g.output(g.where(reload,0,event),'nextEventFlagsU16');g.output(g.where(reload,0,owner),'nextScriptGlobalU16');g.output(g.where(header,g.cast(g.eq(initialized,0),'float32'),g.where(reload,0,pending)),'nextPendingFacingMode');g.output(g.where(reload,0,timer),'nextMovementTimer');
  for(const name of['presentationGlobal48U16','scriptOwnerGlobalU16','resourceTaskIdU16','fallbackGlobal8U16','fallbackGlobal10U16']){const value=g.input(name,['N',2]);g.output(g.where(reload,name==='resourceTaskIdU16'?65535:0,value),'next'+name[0].toUpperCase()+name.slice(1));g.contract.inputDomains[name]={width:2,min:0,max:65535,integer:true};}
  g.output(normal,'normalAdmissionSupported');g.output(g.where(g.eq(scenario,0x320),1,g.where(g.eq(scenario,0x321),2,0)),'storyMessageKind');g.output(specialBit,'specialMessageActive');g.output(g.or(g.eq(op,0),g.eq(op,1)),'supported');return g;
}

/** Retained scratch for the explicitly bounded component call schedule. */
export function buildCommonPresentationEntryStack(){
  const g=new Graph('rom-common-presentation-entry-stack',{
    inputContractVersion:1,authority,
    stackAbi:'jpn-component-next-entry-disjoint-numeric-v1',
    scope:'Retain the already computed nested four row+4 words across the declared accepted-command/seed-snapshot/turnBegin/numeric/loader/initializer prefix. The component stack is4-byte aligned; numeric entry SP is componentSP−8000. Seed snapshot and allocator reset on the component stack are shallow; the complete next fullframe/initializer prefix writes no deeper than componentSP−b0, above all nested row+4 slots. The subsequent outer entry SP is componentSP−30 and its row base componentSP−174. This is an explicit call ABI, not a universal native-stack claim. Actual two-seed guest-STORE observation includes same-value writes and has zero writes to those slots; no observed row words are used as constants or inputs in production.',
    defaults:{priorNestedU16:Array(8).fill(0),componentSpU16:[0,0],numericSpU16:[0,0],enabled:true},
    inputDomains:{priorNestedU16:{width:8,min:0,max:65535,integer:true},componentSpU16:{width:2,min:0,max:65535,integer:true},numericSpU16:{width:2,min:0,max:65535,integer:true}},
  });
  const prior=g.input('priorNestedU16',['N',8]),component=g.split(g.input('componentSpU16',['N',2]),2),numeric=g.split(g.input('numericSpU16',['N',2]),2),enabled=g.input('enabled',['N',1],'bool'),mod=(x,n)=>g.sub(x,g.mul(g.floor(g.mul(x,1/n)),n));
  const offset=n=>{const low=g.add(component[0],n),carry=g.floor(g.mul(low,1/65536));return[mod(low,65536),mod(g.add(component[1],carry),65536)];},expectedNumeric=offset(-0x8000),supported=g.and(g.eq(mod(component[0],4),0),g.eq(numeric[0],expectedNumeric[0]),g.eq(numeric[1],expectedNumeric[1]));
  g.output(prior,'nextNestedU16');g.output(g.cat(offset(-0x30)),'nextOuterSpU16');g.output(g.cat(offset(-0x174)),'nextRowBaseU16');g.output(supported,'supported');g.output(g.and(enabled,supported),'completed');return g;
}

export async function buildCommonPresentationEntries(){const out=[];for(const g of[buildCommonPresentationEntryControl(),buildCommonPresentationEntry(),buildCommonPresentationEntryGlobals(),buildCommonPresentationEntryStack()])out.push(await g.save(directory));return out.map(({name,nodes,bytes})=>({name,nodes,bytes}));}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildCommonPresentationEntries()));
