// Positive appeal and its preparation/post state are separate from the
// immutable monster300 and monster303 modules. Numeric decisions stay in ONNX.
import {Graph} from '../graph-builder.mjs';
import {RandomGraph} from '../transition-graphs.mjs';
import {ACTOR_FIELDS} from '../rules.mjs';
import {AUX_FIELDS} from '../extended-rules.mjs';
import {BOSS_STATUS_FIELDS,resistanceFraction} from '../boss-action-rules.mjs';
import {extendedInputContract} from '../input-domains.mjs';
import {APPEAL_FIELDS} from './build-appeal-program.mjs';
import {makeNushiRow} from './nushi-profiles.mjs';
import {NUSHI_ACTION_IDS,NUSHI_ACTION_RULES} from './build-nushi-action.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const directory=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
export const PACKED_APPEAL_FIELDS=APPEAL_FIELDS.map((rule,i)=>({...rule,max:i<3?1023:rule.max}));
const fields=['appealMode','appealTarget','skipKind','incapacitatedThisAction','pendingRecoveryMessage'];
export const PREPARATION_FIELDS=[0,1].flatMap(i=>fields.map(name=>`a${i}_${name}`));
export const PREPARATION_DOMAINS=[0,1].flatMap(i=>[
  {name:`a${i}_appealMode`,min:0,max:3,integer:true},
  {name:`a${i}_appealTarget`,min:-32768,max:32767,integer:true},
  {name:`a${i}_skipKind`,min:0,max:15,integer:true},
  {name:`a${i}_incapacitatedThisAction`,min:0,max:1,integer:true},
  {name:`a${i}_pendingRecoveryMessage`,min:0,max:1,integer:true}
]);
export const OBJECT_FLAG_FIELDS=[0,1].flatMap(i=>['present','dead','excluded','mentalImmune'].map(name=>`a${i}_${name}`));
const object=(names,values)=>Object.fromEntries(names.map((name,i)=>[name,values[i]]));
const unpack=(g,input,names)=>{const v=g.split(input,names.length*2);return[0,1].map(i=>object(names,v.slice(i*names.length,(i+1)*names.length)));};
const pack=(g,values,names)=>g.cat(values.flatMap(v=>names.map(name=>v[name])));
const choose=(g,values,index)=>g.where(g.eq(index,0),values[0],values[1]);
const actorObjects=(g,input)=>unpack(g,input,ACTOR_FIELDS);
const metadata=(g,input)=>unpack(g,input,fields);
const statusDomains=()=>BOSS_STATUS_FIELDS.map(name=>({name,min:0,max:name.endsWith('poisonKind')?2:name.endsWith('Recovery')?4:255,integer:true}));
const commonContract=()=>{
  const c=extendedInputContract();delete c.fieldDomains.combo;delete c.fieldDomains.config;delete c.inputDomains.context;
  c.fieldDomains.preparationState=PREPARATION_DOMAINS;
  return c;
};
const initialMetadata=()=>Array(10).fill(0);

export function appealAttempt(g,x){
  const actors=actorObjects(g,x.actors),state=metadata(g,x.preparationState),objects=unpack(g,x.objectFlags,['present','dead','excluded','mentalImmune']),a=g.split(x.appeal,4),effects=g.split(x.effectResistances,2),enemy=actors[1];
  const partyEligible=g.and(g.gt(objects[0].present,0),g.eq(objects[0].dead,0),g.eq(objects[0].excluded,0));
  const active=g.and(x.enabled,g.eq(x.sourceIndex,1),partyEligible,g.gt(objects[1].present,0),g.eq(objects[1].dead,0),g.eq(objects[1].excluded,0),g.eq(enemy.paralysis,0),g.eq(enemy.sleep,0),g.eq(enemy.skip,0),g.gt(a[3],0));
  const effective=g.add(g.sub(a[0],a[1]),a[2]),chance=g.mul(g.mul(g.sub(effective,100),Math.fround(.02)),resistanceFraction(g,a[3]));
  const rng=new RandomGraph(g,x.seed,x.position),first=rng.bounded(active,100),secondGate=g.and(active,g.gt(chance,first)),second=rng.bounded(secondGate,100);
  const ordinaryPredicate=g.and(g.eq(objects[1].dead,0),g.eq(objects[1].mentalImmune,0));
  const enabled=[g.gt(100,0),g.gt(effects[0],0),g.gt(effects[1],0)];
  const predicates=[g.and(ordinaryPredicate,g.eq(enemy.paralysis,0),g.or(g.eq(enemy.skip,0),g.not(g.eq(state[1].skipKind,10)))),ordinaryPredicate,ordinaryPredicate];
  let remaining=second,success=g.eq(0,1),kind=g.constant(0);
  // A disabled selected row still subtracts its weight. Do not replace this
  // loop by an exclusive interval lookup: later enabled rows can then win.
  for(const[i,weight]of[90,5,5].entries()){
    const accepted=g.and(secondGate,g.not(success),g.lt(remaining,weight),enabled[i],predicates[i]);
    kind=g.where(accepted,i+1,kind);success=g.or(success,accepted);remaining=g.sub(remaining,weight);
  }
  state[1].appealMode=g.where(success,kind,state[1].appealMode);state[1].appealTarget=g.where(success,actors[0].id,state[1].appealTarget);
  return{nextSeed:rng.seed,nextPosition:rng.position,nextPreparationState:pack(g,state,fields),consumed:g.sub(rng.position,x.position),success,selectedType:kind,chance,attempted:active,secondAttempted:secondGate,firstRoll:first,secondRoll:second};
}

export function buildAppealAttempt(){
  const c=commonContract();delete c.fieldDomains.aux;
  c.fieldDomains.appeal=PACKED_APPEAL_FIELDS;c.fieldDomains.effectResistances=['stats4e','stats4a'].map(name=>({name,min:0,max:255,integer:true}));c.fieldDomains.objectFlags=OBJECT_FLAG_FIELDS.map(name=>({name,min:0,max:1,integer:true}));
  const row=makeNushiRow(),g=new Graph('rom-appeal-attempt2',{
    ...c,scope:'One party candidate and one enemy, through the actual JPN021587cc helper return. Explicit object/roster flags reproduce early returns. Every eligible nonzero-resistance attempt consumes bounded100 even for nonpositive chance; a winning first comparison consumes a second bounded100 and processes the actual90/5/5 rows in sequence. Only helper side effects at stats22 bits12..13 and stats28 are committed here.',
    scopeJa:'敵の魅了判定を成功・失敗と乱数消費まで実行します。成功時の種類と対象を保存し、行動503への置換は次の準備グラフで処理します。',
    authority:[{file:'src/Combat/Overlay_0/func_ov000_0215704c.cpp',jpnAddress:'0x021587cc'},{file:'src/Combat/Overlay_0/func_ov000_0215641c.cpp',jpnAddress:'0x02157b9c'},{tableAddress:'0x02183b58',bytes:'5a6401000500020005000300'}],
    actorFields:ACTOR_FIELDS,preparationFields:PREPARATION_FIELDS,objectFlagFields:OBJECT_FLAG_FIELDS,
    defaults:{seed:row.seed,position:1,actors:row.actors,preparationState:initialMetadata(),objectFlags:[1,0,0,0,1,0,0,0],appeal:row.appeal,effectResistances:[0,0],sourceIndex:1,enabled:true},
    feedback:{seed:'nextSeed',position:'nextPosition',preparationState:'nextPreparationState'},
    objectMeaning:'Object flags are explicit present/dead/excluded/mental-immunity for each actor. dead is the status bit, not inferred from numeric HP by this helper. Stable object IDs/roster membership and successful event allocation are caller contracts. Only one live party roster entry is represented.',
    floatOrder:'F(F((current-base+equipment-100)*F(.02))*F(byte/100)); compare strictly against integer bounded100. No continuous-probability interpretation of the threshold is assumed.',
    defaultSteps:1,labels:{appeal:'現在魅力・基礎魅力・装備魅力・敵魅了係数',effectResistances:'敵の効果2/3適用byte',preparationState:'魅了種類・対象・行動不能・回復通知',objectFlags:'存在・死亡・除外・精神耐性フラグ'}
  });
  const x={seed:g.input('seed',['N',8]),position:g.input('position',['N',1],'int32'),actors:g.input('actors',['N',66]),preparationState:g.input('preparationState',['N',10]),objectFlags:g.input('objectFlags',['N',8]),appeal:g.input('appeal',['N',4]),effectResistances:g.input('effectResistances',['N',2]),sourceIndex:g.input('sourceIndex'),enabled:g.input('enabled',['N',1],'bool')};
  for(const[name,value]of Object.entries(appealAttempt(g,x)))g.output(value,name);return g;
}

export async function buildNushiPreparation(options={}){
  const actionIds=options.actionIds??NUSHI_ACTION_IDS,actionRules=options.actionRules??NUSHI_ACTION_RULES;
  const primary=JSON.parse(await readFile(new URL('../rom-primary-recovery2.json',import.meta.url),'utf8')),row=options.row??makeNushiRow(),c=commonContract();c.fieldDomains.status=statusDomains();c.fieldDomains.appeal=PACKED_APPEAL_FIELDS;c.fieldDomains.effectResistances=['stats4e','stats4a'].map(name=>({name,min:0,max:255,integer:true}));Object.assign(c.inputDomains,{actionId:{min:0,max:65535,integer:true},targetCount:{min:0,max:8,integer:true}});
  const g=new Graph(options.name??'rom-nushi-preparation2',{
    ...c,scope:'Restricted actual JPN02158dfc preparation: one existing party0/enemy192, no excluded/mental-immunity/equipment/party-AI/tension effects. Appeal precedes the immutable primary recovery helper. Cleanup then clears stats3b bit1, stats3c bit6 and party coupSkip. Unrecovered inability or successful appeal becomes503. Type1 sets skipKind10, skip status, defend0 and stats3b bit1. Confusion-selected actions remain explicitly unsupported.',
    scopeJa:'魅了→主状態回復→行動前フラグ整理→行動503への置換を順に接続します。魅了による行動不能と解除通知を明示状態で保持します。',
    authority:[{file:'src/Combat/Overlay_0/func_ov000_0215767c.cpp',jpnAddress:'0x02158dfc'},{file:'src/Combat/Main/func_02089758.cpp',rule:'clear3b bit1,3c bit6,3a'},{file:'src/Combat/Main/func_02088474.cpp',rule:'type10 sets skip, clears defend/tension, preserves appeal mode/target'}],
    actorFields:ACTOR_FIELDS,auxFields:AUX_FIELDS,statusFields:BOSS_STATUS_FIELDS,preparationFields:PREPARATION_FIELDS,
    defaults:{seed:row.seed,position:1,actors:row.actors,aux:row.aux,status:row.status,preparationState:initialMetadata(),appeal:row.appeal,effectResistances:[0,0],sourceIndex:1,actionId:548,targetCount:1,enabled:true},
    feedback:{seed:'nextSeed',position:'nextPosition',actors:'nextActors',aux:'nextAux',status:'nextStatus',preparationState:'nextPreparationState',actionId:'nextAction',targetCount:'nextTargetCount'},
    constraints:'Both stable objects are present; death flag agrees with HP0; excluded and mental-immunity bits are0, tension0 and no charm-changing effects. Party has manual normal1 command. Enemy uses1/94/548. Primary900/901/938 and503/504 events are accepted. Initial source skip is represented with its explicit skipKind and bit1; post must run for every ongoing participant.',
    defaultSteps:1,labels:{preparationState:'魅了・行動不能・回復通知の永続状態',appeal:'魅力と敵係数',effectResistances:'敵の効果2/3適用byte'},...(options.contract??{})
  });
  const x={seed:g.input('seed',['N',8]),position:g.input('position',['N',1],'int32'),actors:g.input('actors',['N',66]),aux:g.input('aux',['N',35]),status:g.input('status',['N',14]),preparationState:g.input('preparationState',['N',10]),appeal:g.input('appeal',['N',4]),effectResistances:g.input('effectResistances',['N',2]),sourceIndex:g.input('sourceIndex'),actionId:g.input('actionId'),targetCount:g.input('targetCount'),enabled:g.input('enabled',['N',1],'bool')};
  const before=actorObjects(g,x.actors),initial=metadata(g,x.preparationState),active=g.and(x.enabled,g.gt(choose(g,before.map(a=>a.hp),x.sourceIndex),0)),zero=g.mul(before[0].hp,0),one=g.add(zero,1),objectFlags=g.cat(before.flatMap(a=>[one,g.cast(g.le(a.hp,0),'float32'),zero,zero]));
  const appealFlags=options.appealObjectFlags?options.appealObjectFlags(g,objectFlags,{before,x}):objectFlags;
  const appeal=appealAttempt(g,{...x,enabled:active,objectFlags:appealFlags});
  const p=g.inline(primary,{seed:appeal.nextSeed,position:appeal.nextPosition,actors:x.actors,status:x.status,sourceIndex:x.sourceIndex,actionId:x.actionId,targetCount:x.targetCount,present:g.eq(0,0),pendingRecoveryMessage:g.gt(choose(g,initial.map(a=>a.pendingRecoveryMessage),x.sourceIndex),0),recoveryMessage:g.eq(0,1),enabled:active},'primary');
  const actors=actorObjects(g,p.nextActors),state=metadata(g,appeal.nextPreparationState),aux=object(AUX_FIELDS,g.split(x.aux,35)),source=object(ACTOR_FIELDS,ACTOR_FIELDS.map(k=>choose(g,actors.map(a=>a[k]),x.sourceIndex))),disabled=g.or(g.gt(source.paralysis,0),g.gt(source.sleep,0),g.gt(source.skip,0)),replaced=g.and(active,g.not(p.recovered),g.or(disabled,appeal.success)),applyType1=g.and(active,g.not(p.recovered),g.not(disabled),appeal.success,g.eq(appeal.selectedType,1)),incap=g.or(g.and(active,g.not(p.recovered),disabled,g.gt(source.skip,0)),applyType1);
  let nextAction=g.where(replaced,503,p.nextAction),cost=g.constant(0);
  for(const r of actionRules)cost=g.where(g.eq(nextAction,r.id),r.mpCost,cost);
  const insufficient=g.and(active,g.not(p.recovered),g.not(disabled),g.not(appeal.success),g.or(g.eq(x.sourceIndex,0),g.lt(source.mp,255)),g.lt(source.mp,cost));nextAction=g.where(insufficient,504,nextAction);
  const confused=g.and(active,g.not(p.recovered),g.not(disabled),g.not(appeal.success),g.gt(source.confusion,0)),event=g.or(...[503,504,900,901,938].map(id=>g.eq(nextAction,id))),ordinary=g.or(...actionIds.map(id=>g.eq(nextAction,id))),supported=g.and(g.not(confused),g.or(event,g.and(ordinary,g.or(g.eq(x.sourceIndex,1),g.eq(nextAction,1)))));
  for(let i=0;i<2;i++){
    const selected=g.and(active,g.eq(x.sourceIndex,i)),apply=g.and(applyType1,g.eq(x.sourceIndex,i));
    state[i].incapacitatedThisAction=g.where(selected,g.cast(incap,'float32'),state[i].incapacitatedThisAction);state[i].pendingRecoveryMessage=g.where(selected,0,state[i].pendingRecoveryMessage);
    state[i].skipKind=g.where(apply,10,state[i].skipKind);actors[i].skip=g.where(apply,1,actors[i].skip);actors[i].defend=g.where(apply,0,actors[i].defend);
  }
  aux.coupSkip=g.where(g.and(active,g.eq(x.sourceIndex,0)),0,aux.coupSkip);
  const out={nextSeed:p.nextSeed,nextPosition:p.nextPosition,nextActors:pack(g,actors,ACTOR_FIELDS),nextAux:g.cat(AUX_FIELDS.map(k=>aux[k])),nextStatus:p.nextStatus,nextPreparationState:pack(g,state,fields),nextAction,nextTargetCount:g.where(g.and(active,event),0,p.nextTargetCount),consumed:g.sub(p.nextPosition,x.position),ordinaryGate:g.and(active,supported,ordinary),eventGate:g.and(active,supported,event),supported,insufficientMp:insufficient,active,recovered:p.recovered,nextRecoveryMessage:p.nextRecoveryMessage,appealSuccess:appeal.success,appealType:appeal.selectedType,appealConsumed:appeal.consumed};
  for(const[name,value]of Object.entries(out))g.output(value,name);return g;
}

export async function buildNushiPost(){
  const old=JSON.parse(await readFile(new URL('../rom-boss-post-status2.json',import.meta.url),'utf8')),row=makeNushiRow(),c=commonContract();c.fieldDomains.status=statusDomains();
  const g=new Graph('rom-nushi-post-status2',{
    ...c,scope:'The immutable verified post-action status pair with stats3b bit1 cleanup restored. Actual order is shared bounded100, clear skip/skipKind and set3c bit6 if bit1, then other recoveries/duration ticks. The old pair never reads skip/metadata, so its state changes commute with this deterministic cleanup; RNG order is unchanged. stats3b bit1 persists until the next preparation cleanup.',
    scopeJa:'行動後の乱数・状態回復に、魅了で立てた行動不能の解除と回復通知を接続します。',
    authority:[{file:'src/Combat/Overlay_0/func_ov000_0215858c.cpp',jpnAddress:'0x02159d0c'},{file:'src/Combat/Main/func_020884f8.cpp',rule:'clear status skip and skipKind only'}],
    actorFields:ACTOR_FIELDS,auxFields:AUX_FIELDS,statusFields:BOSS_STATUS_FIELDS,preparationFields:PREPARATION_FIELDS,
    defaults:{seed:row.seed,position:1,actors:row.actors,aux:row.aux,status:row.status,preparationState:initialMetadata(),sourceIndex:1,enabled:true},
    feedback:{seed:'nextSeed',position:'nextPosition',actors:'nextActors',aux:'nextAux',status:'nextStatus',preparationState:'nextPreparationState'},defaultSteps:1
  });
  const x=Object.fromEntries(old.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)])),state=metadata(g,g.input('preparationState',['N',10])),r=g.inline(old,x,'post'),actors=actorObjects(g,r.nextActors);
  for(let i=0;i<2;i++){
    const clear=g.and(g.gt(r.active,0),g.eq(x.sourceIndex,i),g.gt(state[i].incapacitatedThisAction,0));actors[i].skip=g.where(clear,0,actors[i].skip);state[i].skipKind=g.where(clear,0,state[i].skipKind);state[i].pendingRecoveryMessage=g.where(clear,1,state[i].pendingRecoveryMessage);
  }
  const out={...r,nextActors:pack(g,actors,ACTOR_FIELDS),nextPreparationState:pack(g,state,fields)};for(const[name,value]of Object.entries(out))g.output(value,name);return g;
}

export async function buildNushiEvent(){
  const old=JSON.parse(await readFile(new URL('../rom-boss-event-core2.json',import.meta.url),'utf8')),row=makeNushiRow();
  const g=new Graph('rom-nushi-event-core2',{
    ...old.contract,fieldDomains:{...old.contract.fieldDomains,preparationState:PREPARATION_DOMAINS},
    scope:'The immutable event numerical kernel plus the observed action503 appealMode1 completion. The actual full caller consumes the ordinary event self-target draws even for appeal success. Its type1 event clears appealMode, preserving appealTarget/skipKind/bit1/pending; the latter skip fields are cleared by the subsequent post helper. Modes2/3 are explicitly outside this composite event contract.',
    scopeJa:'魅了成功による行動503にも共通のイベント乱数処理を実行し、処理済みの魅了種類だけを消去します。',
    authority:[...(Array.isArray(old.contract.authority)?old.contract.authority:[]),{file:'src/Combat/Overlay_24/func_ov024_021da670.cpp',rule:'Self-target event operation, appealMode1 invokes02088474(type10), then clears the2-bit appealMode.'},{artifact:'evidence-v2/ghidra/emulation-appeal-prepared-run/response.json',boundary:'Full actual JPN021ebd9c after real preparation, same memory/RNG, action503/type1.'}],
    preparationFields:PREPARATION_FIELDS,defaults:{...old.contract.defaults,actors:row.actors,aux:row.aux,config:row.config,sourceIndex:1,preparationState:initialMetadata()},
    feedback:{...old.contract.feedback,preparationState:'nextPreparationState'}
  });
  const x=Object.fromEntries(old.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)])),state=metadata(g,g.input('preparationState',['N',10])),mode=choose(g,state.map(a=>a.appealMode),x.sourceIndex),valid=g.or(g.eq(mode,0),g.and(g.eq(mode,1),g.eq(x.sourceIndex,1),g.eq(x.actionId,503))),r=g.inline(old,{...x,enabled:g.and(x.enabled,valid)},'event'),actors=actorObjects(g,r.nextActors);
  for(let i=0;i<2;i++){
    const apply=g.and(g.gt(r.active,0),g.eq(x.sourceIndex,i),g.eq(x.actionId,503),g.eq(mode,1));state[i].appealMode=g.where(apply,0,state[i].appealMode);state[i].skipKind=g.where(apply,10,state[i].skipKind);actors[i].skip=g.where(apply,1,actors[i].skip);actors[i].defend=g.where(apply,0,actors[i].defend);
  }
  const out={...r,nextActors:pack(g,actors,ACTOR_FIELDS),supported:g.cast(g.and(valid,g.gt(r.supported,0)),'float32'),nextPreparationState:pack(g,state,fields)};
  for(const[name,value]of Object.entries(out))g.output(value,name);return g;
}

export function buildPreparationDeathSync(){
  const c=commonContract();delete c.fieldDomains.aux;delete c.inputDomains.seed;delete c.inputDomains.position;delete c.inputDomains.sourceIndex;
  const row=makeNushiRow(),g=new Graph('rom-preparation-death-sync2',{
    ...c,scope:'State connection after an entered action or turn tail that may have invoked the actual death-clear helper. For every now-dead actor, clear appealMode and skipKind; preserve appealTarget, stats3b bit1 and stats3c bit6. Terminal re-entry supplies enabled=false and is full identity. This model does not apply HP damage.',
    scopeJa:'死亡処理で消える魅了種類と行動不能種別を、明示状態へ反映します。既に終了した戦闘の再実行では状態を保持します。',
    authority:{file:'src/Combat/Main/func_02088e80.cpp',rule:'word22 type bits clear; +28,3b bit1 and3c bit6 are preserved'},preparationFields:PREPARATION_FIELDS,actorFields:ACTOR_FIELDS,
    defaults:{actors:row.actors,preparationState:initialMetadata(),enabled:true},feedback:{preparationState:'nextPreparationState'},defaultSteps:1
  }),actors=actorObjects(g,g.input('actors',['N',66])),state=metadata(g,g.input('preparationState',['N',10])),enabled=g.input('enabled',['N',1],'bool');
  for(let i=0;i<2;i++){const clear=g.and(enabled,g.le(actors[i].hp,0));for(const k of['appealMode','skipKind'])state[i][k]=g.where(clear,0,state[i][k]);}
  g.output(pack(g,state,fields),'nextPreparationState');return g;
}

export async function buildNushiPreparationModels(){
  const models=[];for(const g of[buildAppealAttempt(),await buildNushiPreparation(),await buildNushiEvent(),await buildNushiPost(),buildPreparationDeathSync()]){const info=await g.save(directory);models.push({...info,sha256:hash(g.model())});}
  const report={schema:'dq9-nushi-preparation-models-v1',preparationFields:PREPARATION_FIELDS,models};await writeFile(new URL('nushi-preparation-models.json.tmp',directory),JSON.stringify(report,null,2)+'\n');await rename(new URL('nushi-preparation-models.json.tmp',directory),new URL('nushi-preparation-models.json',directory));return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const r=await buildNushiPreparationModels();console.log(JSON.stringify(r.models.map(({name,nodes,bytes,sha256})=>({name,nodes,bytes,sha256})),null,2));}
