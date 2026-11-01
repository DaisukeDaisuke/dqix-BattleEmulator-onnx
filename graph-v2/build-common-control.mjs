// Actor-local ROM boundaries for the common actor-array battle controller.
// Definitions select data; no actor ID, enemy count, or encounter is compiled in.
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {Graph} from './graph-builder.mjs';
import {RandomGraph,buffStat} from './transition-graphs.mjs';
import {advanceAnger,coupTailTick} from './lifecycle-rules.mjs';
import {ACTION_STATUSES} from './extended-rules.mjs';
import {COMMON_MODIFIER_RULES,COMMON_RAW_TIMER_FIELDS,commonRawBit,commonRawOverlay,clearCommonModifier} from './common-modifier-rules.mjs';
import {resistanceFraction} from './boss-action-rules.mjs';
import {ACTOR_FIELDS,COMMON_AUX_FIELDS,COMMON_STATUS_FIELDS,COMMON_TENSION_FIELDS,COMMON_PREPARATION_FIELDS,commonAuxDefault} from './common-battle-schema.mjs';
import statusRules from '../restored/dq9-unified/data/status-progress.mjs';

const matchingCommit='e0d1df250bfc554efe2fd37513a4ad3867a77b10';
export const COMMON_PLANNING_DEFEND_ROWS=Object.freeze([[3,1,1],[134,1,1],[135,2,1],[237,3,1],[96,4,6],[138,5,1],[146,6,1],[929,6,1],[185,7,0],[182,8,0],[329,9,0]]);
const object=(names,values)=>Object.fromEntries(names.map((name,i)=>[name,values[i]]));
const unpack=(g,name,names)=>object(names,g.split(g.input(name,['N',names.length]),names.length));
const pack=(g,names,value)=>g.cat(names.map(name=>value[name]));
const lookup=(g,key,values,otherwise=0)=>values.reduce((out,value,i)=>g.where(g.eq(key,i),value,out),g.constant(otherwise));
const seedInput=g=>({seed:g.input('seed',['N',8]),position:g.input('position',['N',1],'int32')});
const enabledInput=g=>({enabled:g.input('enabled',['N',1],'bool'),present:g.input('present',['N',1],'bool')});
const defaultActor=ACTOR_FIELDS.map(name=>({hp:100,maxHp:100,mp:10,maxMp:10,baseAttack:40,baseDefense:30,baseAgility:20,party:1,level:15,id:0})[name]??0);
const common={
  matchingCommit,actorFields:ACTOR_FIELDS,auxFields:COMMON_AUX_FIELDS,statusFields:COMMON_STATUS_FIELDS,
  actorIdentity:'One actual actor per row. actors.party and actors.id are independent state; no array slot or two-actor battle is implied.',
  rounding:'Separate binary32 rounding sites must be preserved. Exact integer RNG uses eight byte limbs, not a uint64 stored in float32.',
  scopeLimit:'Only represented state is covered; event allocations are assumed to succeed. Caller owns raw roster/exclusion bits, command order, battle outcome, and presentation.',
  inputDomains:{seed:{integer:true,min:0,max:255},position:{integer:true,min:0,max:2147483000}},
  defaults:{seed:[1,0,0,0,0,0,0,0],position:1,actor:defaultActor,aux:commonAuxDefault(),status:Array(7).fill(0),enabled:true,present:true},defaultSteps:1
};
function randomOutputs(g,rng,position){g.output(rng.seed,'nextSeed');g.output(rng.position,'nextPosition');g.output(g.sub(rng.position,position),'consumed');}

export function buildCommonPlanningPreprocess(){
  const g=new Graph('rom-common-planning-preprocess',{...common,
    authority:[{file:'src/Combat/Overlay_0/func_ov000_0215f110.cpp',address:'overlay0:0x02160890'},{file:'src/Combat/Overlay_0/func_ov000_021537b8.cpp',address:'overlay0:0x02154f38'},{table:'data_ov000_02182e24',address:'overlay0:0x02183edc',rows:COMMON_PLANNING_DEFEND_ROWS}],
    scope:'Common planning pass before priority and any action execution. For original word08 bit28 and a nonconfused actor, pay MP now and set defend/motion from the ROM table. Enemy MP>=255 and flags18 bit9 bypass payment but still set defend.',
    callerBoundary:'Invoke in planned-command order before priority sorting. The action effect caller must not charge MP again for prepaid records. Script battle special mode is excluded by enabled=false at the outer boundary.',
    insufficient:'Raw cost<255 requires current MP>=resolved cost; raw255 requires MP!=0. Failure becomes937 for action category1,504 otherwise, with count0 and prior defend/motion retained. Payment is max(MP-resolvedCost,0) including the planning raw255 case.',
    defaults:{...common.defaults,actionId:3,targetCount:1,prepaid:true,mpCost:0,mpDiscount:false,actionCategory:0,spellFlag:false,rawFlagBytes:[0,0,0,0],priorMotion:0,priorState3c:0},
    feedback:{actor:'nextActor',actionId:'nextAction',targetCount:'nextTargetCount',rawFlagBytes:'nextRawFlagBytes',priorMotion:'nextMotion',priorState3c:'nextState3c'}});
  const actor=unpack(g,'actor',ACTOR_FIELDS),{enabled,present}=enabledInput(g),actionId=g.input('actionId'),targetCount=g.input('targetCount'),prepaid=g.input('prepaid',['N',1],'bool'),mpCost=g.input('mpCost'),discount=g.input('mpDiscount',['N',1],'bool'),category=g.input('actionCategory'),spell=g.input('spellFlag',['N',1],'bool'),flags=[...g.split(g.input('rawFlagBytes',['N',4]),4)],motion=g.input('priorMotion'),state3c=g.input('priorState3c'),
    bit=(value,mask)=>{const q=g.floor(g.mul(value,1/mask));return g.sub(q,g.mul(g.floor(g.mul(q,.5)),2));},setBit=(value,mask)=>g.add(g.sub(value,g.mul(bit(value,mask),mask)),mask),
    active=g.and(enabled,present,prepaid,g.eq(actor.confusion,0)),party=g.gt(actor.party,0),protectedMp=g.gt(bit(flags[1],2),0),pay=g.and(active,g.not(protectedMp),g.or(party,g.lt(actor.mp,255))),
    cost=g.where(g.and(party,discount),g.floor(g.add(g.mul(mpCost,.75),.75)),mpCost),insufficient=g.and(pay,g.or(g.and(g.lt(mpCost,255),g.lt(actor.mp,cost)),g.and(g.ge(mpCost,255),g.eq(actor.mp,0)))),apply=g.and(active,g.not(insufficient)),special=g.and(apply,g.eq(actionId,476));
  let defend=g.constant(0),nextMotion=g.constant(0);for(const [id,value,motionValue]of COMMON_PLANNING_DEFEND_ROWS){defend=g.where(g.eq(actionId,id),value,defend);nextMotion=g.where(g.eq(actionId,id),motionValue,nextMotion);}
  actor.mp=g.where(g.and(pay,g.not(insufficient)),g.max(g.sub(actor.mp,cost),0),actor.mp);actor.defend=g.where(g.and(apply,g.not(special)),defend,actor.defend);
  flags[0]=g.where(special,setBit(flags[0],32),flags[0]);
  g.output(pack(g,ACTOR_FIELDS,actor),'nextActor');g.output(g.where(insufficient,g.where(g.eq(category,1),937,504),actionId),'nextAction');g.output(g.where(insufficient,0,targetCount),'nextTargetCount');
  g.output(g.where(insufficient,actionId,-1),'replacedAction');g.output(g.where(insufficient,g.where(spell,setBit(state3c,8),setBit(state3c,32)),state3c),'nextState3c');g.output(g.where(apply,g.where(special,1,nextMotion),motion),'nextMotion');
  g.output(g.cat(flags),'nextRawFlagBytes');g.output(insufficient,'insufficientMp');g.output(active,'active');return g;
}

export function buildCommonDraw(){
  const g=new Graph('rom-common-draw',{...common,
    authority:'Util/Random NextRandomMax / NextRandomFloatBetween',
    scope:'One common RNG boundary: bounded integer, float range, or raw state advance. Nonpositive bounded maximum returns zero without consuming RNG.',
    operation:'0=bounded(maximum), 1=float range(minimum,maximum), 2=raw advance; raw output value is zero because the next seed contains all eight exact bytes.',
    defaults:{...common.defaults,operation:0,minimum:0,maximum:100},feedback:{seed:'nextSeed',position:'nextPosition'}});
  const {seed,position}=seedInput(g),enabled=g.input('enabled',['N',1],'bool'),operation=g.input('operation'),minimum=g.input('minimum'),maximum=g.input('maximum'),
    supported=g.or(...[0,1,2].map(x=>g.eq(operation,x))),active=g.and(enabled,supported,g.or(g.not(g.eq(operation,0)),g.gt(maximum,0))),rng=new RandomGraph(g,seed,position),unit=rng.unit(active),
    bounded=g.min(g.floor(g.mul(unit,g.max(maximum,1))),g.sub(g.max(maximum,1),1)),range=g.add(g.mul(g.sub(maximum,minimum),unit),minimum),
    value=g.where(active,g.where(g.eq(operation,0),bounded,g.where(g.eq(operation,1),range,0)),0);
  randomOutputs(g,rng,position);g.output(value,'value');g.output(active,'active');g.output(supported,'supported');return g;
}

export function buildCommonInitiative(){
  const g=new Graph('rom-common-initiative',{...common,
    authority:{file:'src/Combat/Overlay_0/ProcessCombatTurn.cpp',address:'overlay0:0x0215edbc'},
    scope:'Recompute this actor agility, consume exactly one RNG, and multiply by the ROM 0.51f..1.0f range. Surprise enumeration and the ROM quicksort are external common control.',
    feedback:{seed:'nextSeed',position:'nextPosition'}});
  const {seed,position}=seedInput(g),actor=unpack(g,'actor',ACTOR_FIELDS),enabled=g.input('enabled',['N',1],'bool'),rng=new RandomGraph(g,seed,position),
    agility=buffStat(g,actor.baseAgility,actor.agilityRank,'defense',false,actor.party),roll=rng.range(enabled,Math.fround(.51),1),initiative=g.where(enabled,g.mul(agility,roll),0);
  randomOutputs(g,rng,position);g.output(agility,'agility');g.output(initiative,'initiative');g.output(g.where(enabled,roll,0),'roll');return g;
}

export function buildCommonPrimaryRecovery(){
  const g=new Graph('rom-common-primary-recovery',{...common,
    authority:{file:'src/Combat/Overlay_0/func_ov000_0215833c.cpp',address:'overlay0:0x02159abc'},
    scope:'Existing actor consumes one bounded100 even when healthy. Only the first active paralysis, sleep, confusion recovery counter is decremented/tested; success replaces the command with its recovery event.',
    ordering:'A selected recovery counter of zero still prevents testing lower-priority primary ailments. No duration ticks occur here. Recovery events do not execute the original action in the same command slot.',
    defaults:{...common.defaults,actionId:1,targetCount:1,pendingRecoveryMessage:false,recoveryMessage:false},
    feedback:{seed:'nextSeed',position:'nextPosition',actor:'nextActor',status:'nextStatus',actionId:'nextAction',targetCount:'nextTargetCount',recoveryMessage:'nextRecoveryMessage'}});
  const {seed,position}=seedInput(g),actor=unpack(g,'actor',ACTOR_FIELDS),status=unpack(g,'status',COMMON_STATUS_FIELDS),{enabled,present}=enabledInput(g),
    actionId=g.input('actionId'),targetCount=g.input('targetCount'),pending=g.input('pendingRecoveryMessage',['N',1],'bool'),message=g.input('recoveryMessage',['N',1],'bool'),
    active=g.and(enabled,present),rng=new RandomGraph(g,seed,position),roll=rng.bounded(active,100),
    fields=['paralysis','sleep','confusion'],code=g.where(g.gt(actor.paralysis,0),1,g.where(g.gt(actor.sleep,0),2,g.where(g.gt(actor.confusion,0),3,0)));
  let recovered=g.eq(g.constant(0),1),nextAction=actionId;
  for(let i=0;i<fields.length;i++){
    const field=fields[i],rk=field+'Recovery',dk=field+'Duration',advance=g.and(active,g.eq(code,i+1),g.gt(status[rk],0)),remaining=g.sub(status[rk],1),
      success=g.and(advance,g.lt(roll,lookup(g,remaining,statusRules.primary[i].thresholds)));
    actor[field]=g.where(success,0,actor[field]);status[rk]=g.where(success,0,g.where(advance,remaining,status[rk]));status[dk]=g.where(success,0,status[dk]);
    recovered=g.or(recovered,success);nextAction=g.where(success,statusRules.primary[i].action,nextAction);
  }
  randomOutputs(g,rng,position);g.output(pack(g,ACTOR_FIELDS,actor),'nextActor');g.output(pack(g,COMMON_STATUS_FIELDS,status),'nextStatus');g.output(nextAction,'nextAction');
  g.output(g.where(recovered,0,targetCount),'nextTargetCount');g.output(g.or(message,g.and(active,pending)),'nextRecoveryMessage');g.output(recovered,'recovered');g.output(g.where(active,code,0),'primaryCode');
  g.output(g.and(active,g.not(recovered),...['paralysis','sleep','confusion','skip'].map(name=>g.eq(actor[name],0)),g.gt(actor.hp,0)),'canRunOrdinaryAction');return g;
}

export function buildCommonAppeal(){
  const g=new Graph('rom-common-appeal',{...common,
    authority:[{file:'src/Combat/Overlay_0/func_ov000_0215704c.cpp',address:'overlay0:0x021587cc'},{file:'src/Combat/Overlay_0/func_ov000_0215641c.cpp',address:'overlay0:0x02157b9c'},{address:'overlay0:0x02183b58',tableHex:'5a6401000500020005000300'}],
    scope:'One actual party-roster candidate against the acting enemy. Nonzero enemy resistance consumes a first bounded100 even for nonpositive charm chance; a winning comparison consumes a second draw and attempts the ROM 90/5/5 table in order.',
    callerBoundary:'Enumerate living nonexcluded party roster entries in their original order, skip missing objects, and stop only on success. A first-roll win with no applicable type continues to the next party candidate. No fixed actor IDs are assumed.',
    objectFlagFields:['present','dead','excluded','mentalImmune'],charmFields:['current','base','equipment'],preparationFields:COMMON_PREPARATION_FIELDS,
    effectResistances:'Two enemy bytes stats4e,stats4a enable types2,3. resistance21 is enemy stats53.',
    floatOrder:'F(F((current-base+equipment-100)*F(.02))*F(resistance21/100)); strict chance>integerRoll.',
    defaults:{...common.defaults,partyActor:defaultActor,enemyActor:defaultActor.map((v,i)=>ACTOR_FIELDS[i]==='party'?0:ACTOR_FIELDS[i]==='id'?192:v),partyObjectFlags:[1,0,0,0],enemyObjectFlags:[1,0,0,0],preparation:Array(5).fill(0),charm:[0,0,0],resistance21:100,effectResistances:[0,0]},
    feedback:{seed:'nextSeed',position:'nextPosition',preparation:'nextPreparation'}});
  const {seed,position}=seedInput(g),party=unpack(g,'partyActor',ACTOR_FIELDS),enemy=unpack(g,'enemyActor',ACTOR_FIELDS),preparation=unpack(g,'preparation',COMMON_PREPARATION_FIELDS),
    flags=['present','dead','excluded','mentalImmune'],partyObject=unpack(g,'partyObjectFlags',flags),enemyObject=unpack(g,'enemyObjectFlags',flags),charm=g.split(g.input('charm',['N',3]),3),effects=g.split(g.input('effectResistances',['N',2]),2),resistance=g.input('resistance21'),enabled=g.input('enabled',['N',1],'bool'),
    active=g.and(enabled,g.gt(party.party,0),g.eq(enemy.party,0),g.gt(partyObject.present,0),g.eq(partyObject.dead,0),g.eq(partyObject.excluded,0),g.gt(enemyObject.present,0),g.eq(enemyObject.dead,0),g.eq(enemyObject.excluded,0),g.eq(enemy.paralysis,0),g.eq(enemy.sleep,0),g.eq(enemy.skip,0),g.gt(resistance,0)),
    effective=g.add(g.sub(charm[0],charm[1]),charm[2]),chance=g.mul(g.mul(g.sub(effective,100),Math.fround(.02)),resistanceFraction(g,resistance)),rng=new RandomGraph(g,seed,position),first=rng.bounded(active,100),secondGate=g.and(active,g.gt(chance,first)),second=rng.bounded(secondGate,100),
    ordinary=g.and(g.eq(enemyObject.dead,0),g.eq(enemyObject.mentalImmune,0)),predicates=[g.and(ordinary,g.eq(enemy.paralysis,0),g.or(g.eq(enemy.skip,0),g.not(g.eq(preparation.skipKind,10)))),ordinary,ordinary],allowed=[g.gt(g.constant(100),0),g.gt(effects[0],0),g.gt(effects[1],0)];
  let remaining=second,success=g.eq(g.constant(0),1),kind=g.constant(0);
  for(const [i,weight]of [90,5,5].entries()){
    const accepted=g.and(secondGate,g.not(success),g.lt(remaining,weight),allowed[i],predicates[i]);
    kind=g.where(accepted,i+1,kind);success=g.or(success,accepted);remaining=g.sub(remaining,weight);
  }
  preparation.appealMode=g.where(success,kind,preparation.appealMode);preparation.appealTarget=g.where(success,party.id,preparation.appealTarget);
  randomOutputs(g,rng,position);g.output(pack(g,COMMON_PREPARATION_FIELDS,preparation),'nextPreparation');g.output(success,'success');g.output(kind,'selectedType');g.output(chance,'chance');g.output(active,'attempted');g.output(secondGate,'secondAttempted');
  g.output(g.where(active,first,0),'firstRoll');g.output(g.where(secondGate,second,0),'secondRoll');return g;
}

export function buildCommonPrepareRoute(){
  const g=new Graph('rom-common-prepare-route',{...common,
    authority:[{file:'src/Combat/Overlay_0/func_ov000_0215767c.cpp',address:'overlay0:0x02158dfc'},{file:'src/Combat/Main/func_02089758.cpp',rule:'clear stats3b bit1,stats3c bit6,stats3a for either side'},{file:'src/Combat/Main/func_02088474.cpp',rule:'type10 incapacity resets defend/tension and sets skip'}],
    scope:'Preparation cleanup and the pre-target caller rewrite after appeal/reselection/primary recovery. Remaining paralysis/sleep/skip or successful appeal becomes503. Insufficient MP becomes504 or937; sealed spells become914. Recovered primary ailments retain their recovery event.',
    callerBoundary:'mpCost/actionSupported come from the shared action definition. Unrecovered confusion requests its real selection boundary; ordinaryGate is false until that selection completes. No actor IDs or action-family list is embedded.',
    preparationFields:COMMON_PREPARATION_FIELDS,
    defaults:{...common.defaults,preparation:Array(5).fill(0),tension:[0,0,0],actionId:1,targetCount:1,mpCost:0,mpDiscount:false,prepaid:false,actionCategory:0,spellFlag:false,rawStatusBytes:[0,0,0,0],rawFlagBytes:[0,0,0,0],priorState3c:0,actionSupported:true,appealSuccess:false,recovered:false},
    feedback:{actor:'nextActor',aux:'nextAux',preparation:'nextPreparation',tension:'nextTension',actionId:'nextAction',targetCount:'nextTargetCount'}});
  const actor=unpack(g,'actor',ACTOR_FIELDS),aux=unpack(g,'aux',COMMON_AUX_FIELDS),preparation=unpack(g,'preparation',COMMON_PREPARATION_FIELDS),tension=unpack(g,'tension',COMMON_TENSION_FIELDS),
    {enabled,present}=enabledInput(g),actionId=g.input('actionId'),targetCount=g.input('targetCount'),mpCost=g.input('mpCost'),discount=g.input('mpDiscount',['N',1],'bool'),prepaid=g.input('prepaid',['N',1],'bool'),category=g.input('actionCategory'),spell=g.input('spellFlag',['N',1],'bool'),rawStatus=g.split(g.input('rawStatusBytes',['N',4]),4),rawFlags=g.split(g.input('rawFlagBytes',['N',4]),4),state3c=g.input('priorState3c'),actionSupported=g.input('actionSupported',['N',1],'bool'),appealSuccess=g.input('appealSuccess',['N',1],'bool'),recovered=g.input('recovered',['N',1],'bool'),
    bit=(value,mask)=>{const q=g.floor(g.mul(value,1/mask));return g.sub(q,g.mul(g.floor(g.mul(q,.5)),2));},setBit=(value,mask)=>g.add(g.sub(value,g.mul(bit(value,mask),mask)),mask),
    active=g.and(enabled,present),disabled=g.or(...['paralysis','sleep','skip'].map(name=>g.gt(actor[name],0))),notRecovered=g.and(active,g.not(recovered)),
    replace=g.and(notRecovered,g.or(disabled,appealSuccess)),applyType1=g.and(notRecovered,g.not(disabled),appealSuccess,g.eq(preparation.appealMode,1)),
    incap=g.or(g.and(notRecovered,disabled,g.gt(actor.skip,0)),applyType1),confused=g.and(notRecovered,g.not(disabled),g.not(appealSuccess),g.gt(actor.confusion,0)),
    rewrite=g.and(notRecovered,g.not(disabled),g.not(appealSuccess),g.not(confused)),cost=g.where(g.and(g.gt(actor.party,0),discount),g.floor(g.add(g.mul(mpCost,.75),.75)),mpCost),
    insufficient=g.and(rewrite,g.not(prepaid),g.eq(bit(rawFlags[1],2),0),g.or(g.and(g.lt(mpCost,255),g.lt(actor.mp,cost)),g.and(g.ge(mpCost,255),g.eq(actor.mp,0)))),sealed=g.and(rewrite,g.not(insufficient),spell,g.gt(bit(rawStatus[1],1),0)),
    nextAction=g.where(insufficient,g.where(g.eq(category,1),937,504),g.where(sealed,914,g.where(replace,503,actionId))),event=g.or(...[503,504,900,901,914,937,938].map(id=>g.eq(nextAction,id))),supported=g.or(event,actionSupported);
  aux.coupSkip=g.where(active,0,aux.coupSkip);preparation.incapacitatedThisAction=g.where(active,g.cast(incap,'float32'),preparation.incapacitatedThisAction);preparation.pendingRecoveryMessage=g.where(active,0,preparation.pendingRecoveryMessage);
  preparation.skipKind=g.where(applyType1,10,preparation.skipKind);actor.skip=g.where(applyType1,1,actor.skip);actor.defend=g.where(applyType1,0,actor.defend);
  // func02088474(...,10,0) clears stats24 and word14 bit23, retaining
  // bit24. Only the separate action508/527 path clears that high bit.
  for(const key of ['stage','low'])tension[key]=g.where(applyType1,0,tension[key]);
  g.output(pack(g,ACTOR_FIELDS,actor),'nextActor');g.output(pack(g,COMMON_AUX_FIELDS,aux),'nextAux');g.output(pack(g,COMMON_PREPARATION_FIELDS,preparation),'nextPreparation');g.output(pack(g,COMMON_TENSION_FIELDS,tension),'nextTension');
  g.output(nextAction,'nextAction');g.output(g.where(g.and(active,event),0,targetCount),'nextTargetCount');g.output(confused,'needsConfusionSelection');
  g.output(g.where(g.or(insufficient,sealed),actionId,-1),'replacedAction');g.output(g.where(g.or(insufficient,sealed),g.where(g.or(spell,sealed),setBit(state3c,8),setBit(state3c,32)),state3c),'nextState3c');
  g.output(g.and(active,supported,g.not(event),g.not(confused)),'ordinaryGate');g.output(g.and(active,event),'eventGate');g.output(supported,'supported');g.output(insufficient,'insufficientMp');g.output(sealed,'spellBlocked');g.output(active,'active');return g;
}

export function buildCommonConfusionSelection(){
  const g=new Graph('rom-common-confusion-selection',{...common,
    authority:[{file:'src/Combat/Overlay_0/func_ov000_0215f67c.cpp',address:'overlay0:0x02160dfc'},{file:'src/Combat/Main/func_020a3694.cpp',rule:'battle context signed word+c >=0'}],
    scope:'The actual confused-command selector. Always consumes bounded2; fewer than two living same-side roster entries force the nonattack branch after that draw. The chosen nonattack table then consumes bounded4 or5.',
    callerBoundary:'sameSideAliveCount is the original live/nonexcluded roster count, not a reconstructed count of target effects. scenarioId is the signed battle-context word+c. Planning target count becomes0; targets are reconstructed at execution.',
    partyActions:[221,915,222,918],enemyActions:[221,915,222,916,917],
    defaults:{...common.defaults,sameSideAliveCount:1,scenarioId:-1,actionId:1,targetCount:1},
    feedback:{seed:'nextSeed',position:'nextPosition',actionId:'nextAction',targetCount:'nextTargetCount'}});
  const {seed,position}=seedInput(g),actor=unpack(g,'actor',ACTOR_FIELDS),enabled=g.input('enabled',['N',1],'bool'),count=g.input('sameSideAliveCount'),sceneId=g.input('scenarioId'),actionId=g.input('actionId'),targetCount=g.input('targetCount'),
    rng=new RandomGraph(g,seed,position),first=rng.bounded(enabled,2),party=g.gt(actor.party,0),nonAttack=g.and(enabled,g.or(g.gt(first,0),g.lt(count,2))),size=g.where(g.or(party,g.ge(sceneId,0)),4,5),second=rng.bounded(nonAttack,size),
    choice=lookup(g,second,[221,915,222,g.where(party,918,916),917]),nextAction=g.where(enabled,g.where(nonAttack,choice,219),actionId);
  randomOutputs(g,rng,position);g.output(nextAction,'nextAction');g.output(g.where(enabled,0,targetCount),'nextTargetCount');g.output(g.and(enabled,g.not(nonAttack)),'friendlyAttack');g.output(nonAttack,'nonAttack');return g;
}

export function buildCommonConfusionTarget(){
  const g=new Graph('rom-common-confusion-target',{...common,
    authority:{file:'src/Combat/Overlay_0/func_ov000_02153f98.cpp',address:'overlay0:0x02155718'},
    scope:'Party-confusion execution target helper. Scope2 samples all living party entries; scope8 excludes the source and samples the remaining entries; other scopes target self. It returns before the ordinary repetition helper, so does not consume its two table-building draws.',
    callerBoundary:'candidateIds/present are the four original roster entries already filtered to live/nonexcluded and retain roster order. Scope8 needs another party member; the preceding confusion selector prevents action219 for a singleton. Enemy confusion uses the ordinary enemy default target callback instead.',
    defaults:{...common.defaults,candidateIds:[0,1,-1,-1],candidatePresent:[true,true,false,false],targetScope:8},feedback:{seed:'nextSeed',position:'nextPosition'}});
  const {seed,position}=seedInput(g),actor=unpack(g,'actor',ACTOR_FIELDS),ids=g.split(g.input('candidateIds',['N',4]),4),present=g.split(g.input('candidatePresent',['N',4],'bool'),4),scope=g.input('targetScope'),enabled=g.input('enabled',['N',1],'bool'),
    randomScope=g.or(g.eq(scope,2),g.eq(scope,8)),allowed=present.map((p,i)=>g.and(p,g.or(g.not(g.eq(scope,8)),g.not(g.eq(ids[i],actor.id))))),ranks=[],rng=new RandomGraph(g,seed,position);
  let count=g.constant(0);for(const accept of allowed){ranks.push(count);count=g.add(count,g.cast(accept,'float32'));}
  const supported=g.and(g.gt(actor.party,0),g.or(g.not(randomScope),g.gt(count,0))),active=g.and(enabled,supported),draw=g.and(active,randomScope),roll=rng.bounded(draw,g.max(count,1));
  let sampled=g.constant(-1);for(let i=0;i<4;i++)sampled=g.where(g.and(allowed[i],g.eq(ranks[i],roll)),ids[i],sampled);
  randomOutputs(g,rng,position);g.output(g.where(active,g.where(randomScope,sampled,actor.id),-1),'targetId');g.output(g.where(active,1,0),'targetCount');g.output(active,'active');g.output(supported,'supported');return g;
}

export function buildCommonPostStatus(){
  const g=new Graph('rom-common-post-status',{...common,
    authority:[{file:'src/Combat/Overlay_0/func_ov000_0215858c.cpp',address:'overlay0:0x02159d0c'},{file:'src/Combat/Overlay_0/func_ov000_021599f4.cpp',address:'overlay0:0x0215b174'}],
    scope:'One participant after a command while battle is ongoing: unconditional shared roll, skip recovery, anger, represented buff and raw-modifier recoveries in original order, then primary and modifier duration ticks.',
    callerBoundary:'The caller updates outcome before the participant loop. enabled must be false if the outcome ended combat or the command suppresses post processing. The helper checks existence, not HP; a dead participant may still be visited in a continuing multi-actor battle.',
    preparationFields:COMMON_PREPARATION_FIELDS,rawTimerFields:COMMON_RAW_TIMER_FIELDS,modifierRules:COMMON_MODIFIER_RULES,
    ordering:'Original statusRules.expirations order: blind; magic reflection; Force; ailment-resistance up; ailment-resistance down; fire shield; ice shield; attack/defense/agility; magic barrier; breath barrier; double guard; double dodge; acrobat. In particular weakness recovery byte9e precedes fire byte8f; memory-offset sorting is not the original execution order. Missing unrelated raw effect families are outside this ABI. Active recoveries consume their own bounded100 before any duration decrement.',
    defaults:{...common.defaults,targetValid:true,preparation:Array(COMMON_PREPARATION_FIELDS.length).fill(0),rawStatusBytes:[0,0,0,0],rawFlagBytes:[0,0,0,0],rawRanks:Array(10).fill(0),statusKindsBytes:[0,0],rawTimers:Array(COMMON_RAW_TIMER_FIELDS.length).fill(0)},
    fieldDomains:{rawTimers:COMMON_RAW_TIMER_FIELDS.map((name,i)=>({name,min:0,max:i%2?4:255,integer:true}))},
    feedback:{seed:'nextSeed',position:'nextPosition',actor:'nextActor',aux:'nextAux',status:'nextStatus',preparation:'nextPreparation',rawStatusBytes:'nextRawStatusBytes',rawFlagBytes:'nextRawFlagBytes',rawRanks:'nextRawRanks',statusKindsBytes:'nextStatusKindsBytes',rawTimers:'nextRawTimers'}});
  const {seed,position}=seedInput(g),actor=unpack(g,'actor',ACTOR_FIELDS),status=unpack(g,'status',COMMON_STATUS_FIELDS),preparation=unpack(g,'preparation',COMMON_PREPARATION_FIELDS),
    {enabled,present}=enabledInput(g),targetValid=g.input('targetValid',['N',1],'bool'),active=g.and(enabled,present),rng=new RandomGraph(g,seed,position),shared=rng.bounded(active,100);
  // Split's output-name array belongs to the IR node. Copy before replacing
  // any state column, otherwise a later overlay would rename that output.
  const raw={rawStatusBytes:[...g.split(g.input('rawStatusBytes',['N',4]),4)],rawFlagsBytes:[...g.split(g.input('rawFlagBytes',['N',4]),4)],rawRanks:[...g.split(g.input('rawRanks',['N',10]),10)],statusKindsBytes:[...g.split(g.input('statusKindsBytes',['N',2]),2)],rawTimers:[...g.split(g.input('rawTimers',['N',COMMON_RAW_TIMER_FIELDS.length]),COMMON_RAW_TIMER_FIELDS.length)]};
  let aux=unpack(g,'aux',COMMON_AUX_FIELDS);
  const skipClear=g.and(active,g.gt(preparation.incapacitatedThisAction,0));actor.skip=g.where(skipClear,0,actor.skip);
  preparation.skipKind=g.where(skipClear,0,preparation.skipKind);
  preparation.pendingRecoveryMessage=g.where(skipClear,1,preparation.pendingRecoveryMessage);
  aux=advanceAnger(g,aux,{enabled:active,targetValid,sharedRoll:shared});
  const recoveryOrder=new Map(statusRules.expirations.map((rule,index)=>[rule.counter,index])),recoveryRules=[...ACTION_STATUSES,...COMMON_MODIFIER_RULES];
  for(const rule of recoveryRules)if(!recoveryOrder.has(rule.recoveryOffset))throw Error('Missing original recovery order for '+rule.field);
  for(const rule of recoveryRules.sort((a,b)=>recoveryOrder.get(a.recoveryOffset)-recoveryOrder.get(b.recoveryOffset))){
    if(rule.timerIndex!==undefined){
      const i=rule.timerIndex+1,gate=g.and(active,g.gt(commonRawBit(g,raw[rule.flag],rule.bit),0),g.gt(raw.rawTimers[i],0)),remaining=g.max(g.sub(raw.rawTimers[i],1),0),clear=g.and(gate,g.lt(rng.bounded(gate,100),lookup(g,remaining,rule.thresholds)));
      raw.rawTimers[i]=g.where(gate,remaining,raw.rawTimers[i]);clearCommonModifier(g,raw,rule,clear);
    }else{
      const rk=rule.field+'Recovery',dk=rule.field+'Duration',gate=g.and(active,g.not(g.eq(actor[rule.field],0)),g.gt(aux[rk],0)),remaining=g.max(g.sub(aux[rk],1),0),clear=g.and(gate,g.lt(rng.bounded(gate,100),lookup(g,remaining,rule.thresholds)));
      actor[rule.field]=g.where(clear,0,actor[rule.field]);aux[rk]=g.where(clear,0,g.where(gate,remaining,aux[rk]));aux[dk]=g.where(clear,0,aux[dk]);
      // The original blind clear02088874 leaves the stored subtype intact.
      // Only its flag and duration/recovery bytes are cleared here.
    }
  }
  let prior=g.eq(g.constant(0),1);
  for(const field of ['paralysis','sleep','confusion']){
    const isPresent=g.gt(actor[field],0),dk=field+'Duration',rk=field+'Recovery',tick=g.and(active,g.not(prior),isPresent,g.gt(status[dk],0));
    status[dk]=g.where(tick,g.sub(status[dk],1),status[dk]);status[rk]=g.where(g.and(tick,g.eq(status[dk],0)),4,status[rk]);prior=g.or(prior,isPresent);
  }
  for(const rule of ACTION_STATUSES){
    const dk=rule.field+'Duration',rk=rule.field+'Recovery',tick=g.and(active,g.not(g.eq(actor[rule.field],0)),g.gt(aux[dk],0));
    aux[dk]=g.where(tick,g.sub(aux[dk],1),aux[dk]);aux[rk]=g.where(g.and(tick,g.eq(aux[dk],0)),rule.steps,aux[rk]);
  }
  for(const rule of COMMON_MODIFIER_RULES){
    const i=rule.timerIndex,tick=g.and(active,g.gt(commonRawBit(g,raw[rule.flag],rule.bit),0),g.gt(raw.rawTimers[i],0));
    raw.rawTimers[i]=g.where(tick,g.sub(raw.rawTimers[i],1),raw.rawTimers[i]);raw.rawTimers[i+1]=g.where(g.and(tick,g.eq(raw.rawTimers[i],0)),rule.steps,raw.rawTimers[i+1]);
  }
  for(const[field,bit]of Object.entries({blind:6,skip:19,doubleDodge:25}))commonRawOverlay(g,raw.rawStatusBytes,bit,g.cast(g.gt(actor[field],0),'float32'));
  for(const[field,bit,index]of[['attackRank',10,0],['defenseRank',11,1],['agilityRank',12,2]]){commonRawOverlay(g,raw.rawStatusBytes,bit,g.cast(g.not(g.eq(actor[field],0)),'float32'));raw.rawRanks[index]=actor[field];}
  for(const[field,bit]of[['doubleGuard',0],['acrobat',10]])commonRawOverlay(g,raw.rawFlagsBytes,bit,g.cast(g.gt(actor[field],0),'float32'));
  commonRawOverlay(g,raw.rawFlagsBytes,12,g.cast(g.gt(aux.anger,0),'float32'));
  for(let bit=0;bit<4;bit++)commonRawOverlay(g,raw.statusKindsBytes,bit+2,commonRawBit(g,[preparation.skipKind],bit));
  randomOutputs(g,rng,position);g.output(pack(g,ACTOR_FIELDS,actor),'nextActor');g.output(pack(g,COMMON_AUX_FIELDS,aux),'nextAux');g.output(pack(g,COMMON_STATUS_FIELDS,status),'nextStatus');
  for(const[key,name]of Object.entries({rawStatusBytes:'nextRawStatusBytes',rawFlagsBytes:'nextRawFlagBytes',rawRanks:'nextRawRanks',statusKindsBytes:'nextStatusKindsBytes',rawTimers:'nextRawTimers'}))g.output(g.cat(raw[key]),name);
  g.output(pack(g,COMMON_PREPARATION_FIELDS,preparation),'nextPreparation');g.output(active,'active');return g;
}

const deathFields=['attackRank','defenseRank','agilityRank','blind','sleep','confusion','paralysis','skip','defend','acrobat','doubleDodge','doubleGuard','hpRegen','hpDuration','hpRecovery','mpRegen','mpDuration','mpRecovery','poison'];
export function clearCommonDeath(g,{actor,aux,status,tension},dead){
  const nextActor={...actor},nextAux={...aux},nextStatus={...status},nextTension={...tension};
  for(const key of deathFields)nextActor[key]=g.where(dead,0,nextActor[key]);
  // The raw reset preserves byte3a (coupSkip) and old anger target +2e.
  for(const key of COMMON_AUX_FIELDS)if(key!=='coupSkip'&&key!=='angerTarget')nextAux[key]=g.where(dead,0,nextAux[key]);
  for(const key of COMMON_STATUS_FIELDS)nextStatus[key]=g.where(dead,0,nextStatus[key]);
  for(const key of COMMON_TENSION_FIELDS)nextTension[key]=g.where(dead,0,nextTension[key]);
  return {actor:nextActor,aux:nextAux,status:nextStatus,tension:nextTension};
}

export function buildCommonPeriodic(){
  const g=new Graph('rom-common-periodic',{...common,
    authority:[{file:'src/Combat/Overlay_0/func_ov000_0215a23c.cpp',address:'overlay0:0x0215b9bc'},{file:'src/Combat/Overlay_0/func_ov000_0215e6e8.cpp',address:'overlay0:0x0215fe68'}],
    scope:'One actor and one exact turn-tail phase. operation0 resets entry defend/wake;1 is party HP regen;2 is MP regen including party defend-equipment;3 is severe poison and represented death reset.',
    ordering:'Caller executes entry reset for participants, then ALL party HP, ALL party MP, ALL party poison, ALL enemy MP, ALL enemy poison. Status expiry is a later separate module and does not run after a terminal periodic outcome.',
    poison:'General poison flag alone does not damage; status.poisonKind must be2. Damage is clamp(maxHp>>4,1,999).',
    defaults:{...common.defaults,operation:0,wakeSkip:0,tension:[0,0,0],preparation:Array(5).fill(0),defendMpRecovery:false,selectedCommandCount:0,selectedCommandKind:0},
    feedback:{seed:'nextSeed',position:'nextPosition',actor:'nextActor',aux:'nextAux',status:'nextStatus',tension:'nextTension',preparation:'nextPreparation',wakeSkip:'nextWakeSkip'}});
  const {seed,position}=seedInput(g),before=unpack(g,'actor',ACTOR_FIELDS),aux=unpack(g,'aux',COMMON_AUX_FIELDS),status=unpack(g,'status',COMMON_STATUS_FIELDS),tension=unpack(g,'tension',COMMON_TENSION_FIELDS),preparation=unpack(g,'preparation',COMMON_PREPARATION_FIELDS),
    {enabled,present}=enabledInput(g),operation=g.input('operation'),wakeSkip=g.input('wakeSkip'),equipment=g.input('defendMpRecovery',['N',1],'bool'),commandCount=g.input('selectedCommandCount'),commandKind=g.input('selectedCommandKind'),
    supported=g.or(...[0,1,2,3].map(value=>g.eq(operation,value))),active=g.and(enabled,present,supported),alive=g.and(active,g.gt(before.hp,0)),party=g.gt(before.party,0),rng=new RandomGraph(g,seed,position),actor={...before};
  actor.defend=g.where(g.and(active,g.eq(operation,0)),0,actor.defend);
  const hpAmount=g.add(g.where(g.gt(actor.hpEquipmentRegen,0),25,0),g.where(g.gt(actor.hpRegen,0),g.max(10,g.floor(g.mul(actor.level,.5))),0)),
    hpGate=g.and(alive,party,g.eq(operation,1),g.gt(hpAmount,0));
  actor.hp=g.where(hpGate,g.min(g.add(actor.hp,hpAmount),actor.maxHp),actor.hp);
  // Exact integer division for the documented actor level0..99 domain.
  let decade=g.constant(0);for(let i=1;i<=9;i++)decade=g.where(g.ge(actor.level,i*10),i,decade);
  const mpGate=g.and(alive,g.eq(operation,2)),equipmentGate=g.and(mpGate,party,equipment,g.gt(commandCount,0),g.eq(commandKind,3)),
    levelDiv10=g.op('Gather',[g.constant(Array.from({length:100},(_,i)=>Math.fround(i/10)),'float32',[100]),g.cast(actor.level,'int32')],{axis:0},{shape:['N',1]}),equipmentAmount=g.floor(g.add(1,rng.range(equipmentGate,0,levelDiv10))),
    mpAmount=g.add(g.where(g.gt(actor.mpRegen,0),g.max(3,g.where(party,decade,actor.level)),0),g.where(equipmentGate,equipmentAmount,0));
  // Enemy helper is called even for zero; party helper is called only >0.
  const mpApply=g.and(mpGate,g.or(g.not(party),g.gt(mpAmount,0)));
  actor.mp=g.where(mpApply,g.min(g.add(actor.mp,mpAmount),actor.maxMp),actor.mp);
  const poison=g.and(alive,g.eq(operation,3),g.gt(actor.poison,0),g.eq(status.poisonKind,2)),amount=g.min(g.max(g.floor(g.mul(actor.maxHp,1/16)),1),999);
  actor.hp=g.where(poison,g.max(g.sub(actor.hp,amount),0),actor.hp);
  const died=g.and(poison,g.le(actor.hp,0)),next=clearCommonDeath(g,{actor,aux,status,tension},died);
  for(const key of ['appealMode','skipKind'])preparation[key]=g.where(died,0,preparation[key]);
  randomOutputs(g,rng,position);g.output(pack(g,ACTOR_FIELDS,next.actor),'nextActor');g.output(pack(g,COMMON_AUX_FIELDS,next.aux),'nextAux');g.output(pack(g,COMMON_STATUS_FIELDS,next.status),'nextStatus');
  g.output(pack(g,COMMON_TENSION_FIELDS,next.tension),'nextTension');g.output(pack(g,COMMON_PREPARATION_FIELDS,preparation),'nextPreparation');g.output(g.where(g.and(active,g.eq(operation,0)),0,wakeSkip),'nextWakeSkip');
  g.output(g.sub(actor.hp,before.hp),'deltaHP');g.output(g.sub(actor.mp,before.mp),'deltaMP');g.output(g.where(hpGate,hpAmount,0),'hpRequested');g.output(g.where(mpApply,mpAmount,0),'mpRequested');g.output(g.where(poison,amount,0),'poisonRequested');g.output(died,'died');g.output(active,'active');g.output(supported,'supported');return g;
}

export function buildCommonTurnStatus(){
  const g=new Graph('rom-common-turn-status',{...common,
    authority:{file:'src/Combat/Overlay_0/func_ov000_02157e1c.cpp',address:'overlay0:0x0215959c'},
    scope:'Actor-local MP then HP regen status expiration, followed by coup lifetime. A represented regen status consumes a separate bounded100 even when its fixed duration has not expired.',
    callerBoundary:'Caller consumes one shared bounded100 before visiting the surviving participants. That shared value belongs to omitted immunity status fields and is not consumed here. The entire phase is skipped if periodic effects ended combat.',
    coup:'The duration is a four-bit field: ready with duration0 decrements to15; ready clears only when decrement reaches0.',
    feedback:{seed:'nextSeed',position:'nextPosition',actor:'nextActor',aux:'nextAux'}});
  const {seed,position}=seedInput(g),actor=unpack(g,'actor',ACTOR_FIELDS),aux=unpack(g,'aux',COMMON_AUX_FIELDS),{enabled,present}=enabledInput(g),active=g.and(enabled,present,g.gt(actor.hp,0)),rng=new RandomGraph(g,seed,position);
  for(const prefix of ['mp','hp']){
    const flag=prefix+'Regen',dk=prefix+'Duration',rk=prefix+'Recovery',gate=g.and(active,g.gt(actor[flag],0)),roll=rng.bounded(gate,100),recovering=g.gt(actor[rk],0),remaining=g.max(g.sub(actor[rk],1),0),
      clear=g.and(gate,recovering,g.lt(roll,lookup(g,remaining,[100,87.5,75,62.5]))),tick=g.and(gate,g.not(recovering),g.gt(actor[dk],0)),duration=g.max(g.sub(actor[dk],1),0);
    actor[flag]=g.where(clear,0,actor[flag]);actor[dk]=g.where(clear,0,g.where(tick,duration,actor[dk]));actor[rk]=g.where(clear,0,g.where(g.and(gate,recovering),remaining,g.where(g.and(tick,g.eq(duration,0)),4,actor[rk])));
  }
  const coup=coupTailTick(g,{ready:aux.coupReady,duration:aux.coupDuration,enabled:active});aux.coupReady=coup.ready;aux.coupDuration=coup.duration;
  randomOutputs(g,rng,position);g.output(pack(g,ACTOR_FIELDS,actor),'nextActor');g.output(pack(g,COMMON_AUX_FIELDS,aux),'nextAux');g.output(active,'active');return g;
}

export function buildCommonStateView(){
  const g=new Graph('rom-common-state-view',{...common,
    scope:'Read-only actor facts for the common scheduler and AI. Buffed attack/defense/agility are calculated by graph operations; host control only reads/branches on returned facts.',
    rawProjection:'Preserve unrelated raw bytes and signed3-bit rank fields; overlay the typed represented state. Raw death/exclusion remain independent of numeric HP. deathReset/escapeReset apply their actual masks only when explicitly requested by a state-changing boundary.',
    rawAuthority:{death:'src/Combat/Main/func_02088e80.cpp',ranks:'include/Combat/Main/BattleList.h',anger:'src/Combat/Main/func_02088e48.cpp',tension:'src/Combat/Main/func_02088b04.cpp'},
    statusBits:{poison:1,paralysis:3,sleep:4,confusion:5,blind:6,skip:19,doubleDodge:25,mpRegen:30,hpRegen:31,tensionLow:23,tensionHigh:24},rankStatusBits:{attackRank:10,defenseRank:11,agilityRank:12},flagBits:{doubleGuard:0,acrobat:10,anger:12},
    defaults:{...common.defaults,wakeSkip:0,rawStatusBytes:[0,0,0,0],rawFlagBytes:[0,0,0,0],rawRanks:Array(10).fill(0),statusKindsBytes:[0,0],rawTimers:Array(COMMON_RAW_TIMER_FIELDS.length).fill(0),tension:[0,0,0],deathReset:false,escapeReset:false},feedback:{}});
  const actor=unpack(g,'actor',ACTOR_FIELDS),aux=unpack(g,'aux',COMMON_AUX_FIELDS),tension=unpack(g,'tension',COMMON_TENSION_FIELDS),wakeSkip=g.input('wakeSkip'),present=g.input('present',['N',1],'bool'),
    rawStatus=g.split(g.input('rawStatusBytes',['N',4]),4),rawFlags=g.split(g.input('rawFlagBytes',['N',4]),4),rawRanks=g.split(g.input('rawRanks',['N',10]),10),rawTimers=g.input('rawTimers',['N',COMMON_RAW_TIMER_FIELDS.length]),rawKindsInput=g.input('statusKindsBytes',['N',2]),rawKinds=g.split(rawKindsInput,2),deathReset=g.input('deathReset',['N',1],'bool'),escapeReset=g.input('escapeReset',['N',1],'bool');
  const readBit=(bytes,bit)=>{const q=g.floor(g.mul(bytes[bit>>>3],2**-(bit&7)));return g.sub(q,g.mul(g.floor(g.mul(q,.5)),2));},
    overlay=(bytes,bit,value)=>{const index=bit>>>3,mask=2**(bit&7);bytes[index]=g.add(g.sub(bytes[index],g.mul(readBit(bytes,bit),mask)),g.mul(g.cast(g.gt(value,0),'float32'),mask));},
    statuses=[...rawStatus],flags=[...rawFlags],ranks=[...rawRanks];
  for(const [field,bit]of Object.entries(g.contract.statusBits))overlay(statuses,bit,field==='tensionLow'?tension.low:field==='tensionHigh'?tension.high:actor[field]);
  for(const [field,bit]of Object.entries(g.contract.rankStatusBits))overlay(statuses,bit,g.cast(g.not(g.eq(actor[field],0)),'float32'));
  for(const [field,bit]of Object.entries(g.contract.flagBits))overlay(flags,bit,field==='anger'?aux.anger:actor[field]);
  ['attackRank','defenseRank','agilityRank'].forEach((key,i)=>ranks[i]=actor[key]);
  const deathBytes=[g.add(1,g.mul(readBit(rawStatus,2),4)),g.constant(0),g.constant(0),g.constant(0)];
  for(let i=0;i<4;i++){statuses[i]=g.where(escapeReset,0,g.where(deathReset,deathBytes[i],statuses[i]));flags[i]=g.where(escapeReset,i===1?32:0,g.where(deathReset,0,flags[i]));}
  for(let i=0;i<10;i++)ranks[i]=g.where(g.or(deathReset,escapeReset),0,ranks[i]);
  const dead=g.gt(readBit(statuses,0),0),excluded=g.gt(readBit(flags,13),0),blocked=g.or(dead,excluded,g.le(actor.hp,0),...['paralysis','sleep','confusion','skip'].map(name=>g.gt(actor[name],0))),alive=g.and(present,g.not(dead),g.not(excluded),g.gt(actor.hp,0));
  for(const [name,value]of Object.entries({
    attack:buffStat(g,actor.baseAttack,actor.attackRank,'quarter',true,actor.party),defense:buffStat(g,actor.baseDefense,actor.defenseRank,'defense',true,actor.party),agility:buffStat(g,actor.baseAgility,actor.agilityRank,'defense',false,actor.party),
    alive,blocked,canPlan:g.and(present,g.not(blocked)),canExecute:g.and(alive,g.eq(wakeSkip,0)),actorId:actor.id,party:g.gt(actor.party,0),hp:actor.hp,mp:actor.mp,
    rageEnabled:g.gt(aux.anger,0),rageId:aux.angerTarget,paralyzed:g.gt(actor.paralysis,0),asleep:g.gt(actor.sleep,0),confused:g.gt(actor.confusion,0),
    statusBytes:g.cat(statuses),flagBytes:g.cat(flags),ranks:g.cat(ranks),nextRawTimers:g.where(g.or(deathReset,escapeReset),g.mul(rawTimers,0),rawTimers),nextStatusKindsBytes:g.where(g.or(deathReset,escapeReset),g.cat([g.mul(rawKinds[0],0),g.mul(readBit(rawKinds,15),128)]),rawKindsInput),dead,excluded
  }))g.output(value,name);return g;
}

export function buildCommonCoverTarget(){
  const fields=Object.fromEntries(ACTOR_FIELDS.map((name,i)=>[name,i])),defaults=Array.from({length:12},(_,i)=>ACTOR_FIELDS.map(name=>name==='id'?(i<4?i:188+i):name==='party'?(i<4?1:0):name==='defend'&&i===1?6:defaultActor[fields[name]]));
  const g=new Graph('rom-common-cover-target',{...common,
    actorIdentity:'Twelve arbitrary actor rows, matched by actors.id. The caller supplies the original ordered same-side live roster; row positions are not actor IDs.',
    authority:{file:'src/Combat/Overlay_24/func_ov024_021e9b74.cpp',address:'overlay24:0x021ea340',eligibility:'src/Combat/Overlay_0/func_ov000_02155f9c.cpp arg2=0',crisis:'src/Combat/Overlay_24/func_ov024_021db358.cpp'},
    scope:'One cover-routing call before reflection and target effect. Raw death/excluded/sleep/paralysis/skip bits govern eligibility. Confusion alone is allowed. Input roster order comes from the common party/enemy population graph.',
    priority:'First nonempty tier: defend8 excluding the target; defend7 excluding the target when target HP/maxHP <= f32(0.08); defend6 whose coverTargetId equals the target, including self. The selected tier consumes one bounded(count) RNG even for count1.',
    callerBoundary:'The action caller consumes its shared100 before this boundary. Clear priorCovered when the pre-cover target differs from the preceding target. If this call fails after priorCovered was set, skipTarget is true. Route recording and protagonist achievement are caller effects, not numeric actor mutations.',
    hpThresholdProof:'For unsigned16 HP/maxHP, f32(HP/maxHP)<=f32(0.08) iff 25*HP<=2*maxHP. Non-equal ratios differ from2/25 by at least1/(25*65535), exceeding float32 rounding around0.08; exact equality rounds to the same constant. Products remain <2^21. HP0 returns0, including maxHP0; positiveHP/maxHP0 is infinity and fails. No approximate reciprocal or division kernel is used.',
    defaults:{seed:[1,0,0,0,0,0,0,0],position:1,enabled:true,actors:defaults.flat(),actorPresent:[true,true,...Array(10).fill(false)],rawStatusBytes:Array(48).fill(0),rawFlagBytes:Array(48).fill(0),coverTargetIds:[-1,0,...Array(10).fill(-1)],rosterIds:[0,1,-1,-1,-1,-1,-1,-1],rosterCount:2,targetId:0,hitPresent:true,coverAllowed:true,priorCovered:false},
    feedback:{seed:'nextSeed',position:'nextPosition',targetId:'nextTargetId',priorCovered:'nextCovered'}});
  const {seed,position}=seedInput(g),enabled=g.input('enabled',['N',1],'bool'),flat=g.split(g.input('actors',['N',12*ACTOR_FIELDS.length]),12*ACTOR_FIELDS.length),present=g.split(g.input('actorPresent',['N',12],'bool'),12),status=g.split(g.input('rawStatusBytes',['N',48]),48),flags=g.split(g.input('rawFlagBytes',['N',48]),48),links=g.split(g.input('coverTargetIds',['N',12]),12),roster=g.split(g.input('rosterIds',['N',8]),8),count=g.input('rosterCount'),targetId=g.input('targetId'),hitPresent=g.input('hitPresent',['N',1],'bool'),coverAllowed=g.input('coverAllowed',['N',1],'bool'),prior=g.input('priorCovered',['N',1],'bool'),
    bit=(byte,mask)=>{const q=g.floor(g.mul(byte,1/mask));return g.gt(g.sub(q,g.mul(g.floor(g.mul(q,.5)),2)),0);},sum=values=>values.reduce((a,b)=>g.add(a,b),g.constant(0)),partyId=id=>g.and(g.ge(id,0),g.le(id,3));
  const rows=Array.from({length:12},(_,i)=>{
    const actor=object(ACTOR_FIELDS,flat.slice(i*ACTOR_FIELDS.length,(i+1)*ACTOR_FIELDS.length)),dead=bit(status[i*4],1),excluded=bit(flags[i*4+1],32),alive=g.and(present[i],g.not(dead),g.not(excluded)),able=g.and(alive,g.not(bit(status[i*4],8)),g.not(bit(status[i*4],16)),g.not(bit(status[i*4+2],8)));
    return{actor,alive,able,link:links[i]};
  });
  const find=id=>{
    const matches=rows.map((row,i)=>g.and(present[i],g.eq(row.actor.id,id))),select=read=>sum(rows.map((row,i)=>g.where(matches[i],read(row),0)));
    return{hp:select(row=>row.actor.hp),maxHp:select(row=>row.actor.maxHp),defend:select(row=>row.actor.defend),link:select(row=>row.link),alive:g.gt(select(row=>g.cast(row.alive,'float32')),0),able:g.gt(select(row=>g.cast(row.able,'float32')),0)};
  };
  const target=find(targetId),supported=g.and(g.ge(count,0),g.le(count,8),g.eq(count,g.floor(count))),active=g.and(enabled,supported,hitPresent,coverAllowed,target.alive),crisis=g.le(g.mul(target.hp,25),g.mul(target.maxHp,2)),targetParty=partyId(targetId),tiers=[[],[],[]];
  for(let i=0;i<8;i++){
    const candidate=find(roster[i]),candidateParty=partyId(roster[i]),sameSide=g.or(g.and(targetParty,candidateParty),g.and(g.not(targetParty),g.not(candidateParty))),base=g.and(active,g.lt(i,count),candidate.able,sameSide),other=g.not(g.eq(roster[i],targetId));
    tiers[0].push(g.and(base,other,g.eq(candidate.defend,8)));tiers[1].push(g.and(base,other,crisis,g.eq(candidate.defend,7)));tiers[2].push(g.and(base,g.eq(candidate.defend,6),g.eq(candidate.link,targetId)));
  }
  const counts=tiers.map(list=>sum(list.map(value=>g.cast(value,'float32')))),first=g.gt(counts[0],0),second=g.and(g.not(first),g.gt(counts[1],0)),third=g.and(g.not(first),g.not(second),g.gt(counts[2],0)),covered=g.or(first,second,third),candidateCount=g.where(first,counts[0],g.where(second,counts[1],counts[2])),rng=new RandomGraph(g,seed,position),index=rng.bounded(covered,candidateCount);
  let seen=g.constant(0),nextTarget=targetId;
  for(let i=0;i<8;i++){
    const eligible=g.or(g.and(first,tiers[0][i]),g.and(second,tiers[1][i]),g.and(third,tiers[2][i])),chosen=g.and(covered,eligible,g.eq(index,seen));nextTarget=g.where(chosen,roster[i],nextTarget);seen=g.add(seen,g.cast(eligible,'float32'));
  }
  randomOutputs(g,rng,position);g.output(nextTarget,'nextTargetId');g.output(covered,'covered');g.output(g.or(prior,covered),'nextCovered');g.output(g.and(enabled,prior,g.not(covered)),'skipTarget');g.output(g.where(first,6,g.where(second,7,g.where(third,8,0))),'routeKind');g.output(g.where(first,8,g.where(second,7,g.where(third,6,0))),'defendTier');g.output(candidateCount,'candidateCount');g.output(g.where(covered,index,-1),'selectedIndex');g.output(crisis,'crisis');g.output(active,'active');g.output(supported,'supported');return g;
}

export function buildCommonControls(){return [buildCommonPlanningPreprocess(),buildCommonDraw(),buildCommonInitiative(),buildCommonPrimaryRecovery(),buildCommonAppeal(),buildCommonPrepareRoute(),buildCommonConfusionSelection(),buildCommonConfusionTarget(),buildCommonPostStatus(),buildCommonPeriodic(),buildCommonTurnStatus(),buildCommonStateView(),buildCommonCoverTarget()];}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  const reports=[];for(const graph of buildCommonControls())reports.push(await graph.save());
  await writeFile(new URL('common-control-models.json',import.meta.url),JSON.stringify(reports,null,2)+'\n');
  console.log(JSON.stringify(reports.map(({name,nodes,bytes})=>({name,nodes,bytes}))));
}
