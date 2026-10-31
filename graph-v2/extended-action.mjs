import {Graph} from './graph-builder.mjs';
import {RandomGraph,buildStrikeModel} from './transition-graphs.mjs';
import {ACTOR_FIELDS,COMBO_FIELDS} from './rules.mjs';
import {ACTION_STATUSES,AUX_FIELDS,CONFIG_FIELDS,DEFAULT_AUX,DEFAULT_CONFIG,DEFAULT_EXTENDED_ACTORS,EXTENDED_PROVENANCE} from './extended-rules.mjs';
import {coupDamageBonus,coupLevelDuration,coupEligibility,angerCheck as applyAngerCheck,advanceAnger,coupTailTick} from './lifecycle-rules.mjs';
import {extendedInputContract} from './input-domains.mjs';
const object=(names,values)=>Object.fromEntries(names.map((k,i)=>[k,values[i]]));
const unpack=(g,input)=>{const x=g.split(input,2*ACTOR_FIELDS.length);return [object(ACTOR_FIELDS,x.slice(0,ACTOR_FIELDS.length)),object(ACTOR_FIELDS,x.slice(ACTOR_FIELDS.length))];};
const pack=(g,a)=>g.cat(a.flatMap(x=>ACTOR_FIELDS.map(k=>x[k])));
const lookup=(g,key,values)=>values.slice(1).reduce((o,v,i)=>g.where(g.eq(key,i+1),v,o),g.constant(values[0]));
const timerKey=(actor,field,part)=>`a${actor}_${field}${part}`;
export function clearAuxDeaths(g,aux,actors,enabled){
  const out={...aux},partyDead=g.and(enabled,g.le(actors[0].hp,0)),enemyDead=g.and(enabled,g.le(actors[1].hp,0));
  for(const key of ['coupReady','coupDuration'])out[key]=g.where(partyDead,0,out[key]);
  // ROM death does not clear byte3a (coupSkip) or the old anger target +2e.
  for(const key of ['anger','angerDuration','angerRecovery'])out[key]=g.where(enemyDead,0,out[key]);
  for(let actor=0;actor<2;actor++)for(const s of ACTION_STATUSES)for(const part of ['Duration','Recovery']){const key=timerKey(actor,s.field,part);out[key]=g.where(actor?enemyDead:partyDead,0,out[key]);}
  return out;
}
export function advanceCoupTail(g,aux,actors,enabled){
  const next=clearAuxDeaths(g,aux,actors,enabled),tail=coupTailTick(g,{ready:next.coupReady,duration:next.coupDuration,enabled:g.and(enabled,g.gt(actors[0].hp,0))});
  next.coupDuration=tail.duration;next.coupReady=tail.ready;return next;
}
export function buildExtendedAction({name='rom-normal-action2',includePreparation=true,includePostStatus=true}={}){
  const g=new Graph(name,{
    ...extendedInputContract(),scopeJa:'通常攻撃1回と周辺状態処理。命中・回避・会心・HP・コンボ・必殺・怒り・状態期限を連鎖。行動/対象の計画とカメラは外側の処理。',defaultSteps:1,
    scope:'Preselected single-target normal attack with the surrounding source phases: optional unsuccessful appeal draw, primary-recovery draw (primary ailments excluded), two unconditional execution-target repetition draws even for repeat mode0, impact, HP-crossing anger, damage recovery, unconditional weapon-reaction draw for positive damage, after-hit coup, critical anger, after-action coup, then ongoing-combat post-action anger and seven timed status rules.',
    actorFields:ACTOR_FIELDS,comboFields:COMBO_FIELDS,auxFields:AUX_FIELDS,configFields:CONFIG_FIELDS,provenance:EXTENDED_PROVENANCE,
    exclusions:'AI/target planning and its RNG; successful charm/distraction; primary sleep/paralysis/confusion/skip actions; party acrobat counter routing; enemy nonzero critical threshold; metal/tension/element/species/equipment effects; camera; full raw state memory.',
    profile:'Critical and all party levels0..99 are supported; one party only. Config anger rates are predecoded trigger3/4/24 percentages, min/max inclusive0..255; reversed ranges return minimum without a duration draw. enemyAppealGate1 means chance<=0 so the actual draw is consumed without a successful appeal branch.',
    ordering:'After primary pre-recovery, target_repetition consumes NextRandomBetween(3,4) and NextRandomBetween(6,8) even when normal action repeat_mode0 returns0. HP-crossing anger precedes recover_after_damage, then apply_weapon_procs consumes a draw before inspecting weapon/source properties. Post-action status RNG is skipped if a death already ended combat. Primary pre-recovery draw occurs even when no ailment is active.',
    eventBuffer:'A valid event buffer with a successful effect-node allocation is required. ROM weapon proc JPN021e549c draws after the allocator succeeds; allocator failure/capacity and presentation memory are not represented by this decoded-state model.',
    callerBoundary:{preparationIncluded:includePreparation,postActionStatusIncluded:includePostStatus,core:'JPN021ebd9c / matching func_ov024_021eb5d0: execution-target collection through damage, reactions and after-action coup. Core-only entry seed is after primary recovery; core-only exit is before post-action status.'},
    coupRatioProof:'For integer maxHP<=32767 and damage<=131070, F(damage/maxHP)>=F(k/10) is equivalent to 10*damage>=k*maxHP: distinct rational grid points differ by >=1/(10*32767), larger than f32 rounding/constant error; equality maps to the same f32 constant.',
    feedback:{seed:'nextSeed',position:'nextPosition',actors:'nextActors',aux:'nextAux',combo:'nextCombo',context:'nextContext'},
    defaults:{seed:[1,0,0,0,0,0,0,0],position:1,actors:DEFAULT_EXTENDED_ACTORS,aux:DEFAULT_AUX,config:DEFAULT_CONFIG,combo:[0,0,0,0,0,0],context:[1,0],sourceIndex:0,enabled:true},labels:{aux:'必殺・怒り・状態期限',config:'必殺/怒り条件（configFields順）',actors:'2人の状態',sourceIndex:'攻撃者配列番号',context:'行動token下位/上位16bit'}
  });
  const seed=g.input('seed',['N',8]),position=g.input('position',['N',1],'int32'),actorInput=g.input('actors',['N',ACTOR_FIELDS.length*2]),auxInput=g.input('aux',['N',AUX_FIELDS.length]),configInput=g.input('config',['N',CONFIG_FIELDS.length]),combo=g.input('combo',['N',6]),context=g.input('context',['N',2]),sourceIndex=g.input('sourceIndex'),enabled=g.input('enabled',['N',1],'bool');
  const before=unpack(g,actorInput),cfg=object(CONFIG_FIELDS,g.split(configInput,CONFIG_FIELDS.length));let aux=object(AUX_FIELDS,g.split(auxInput,AUX_FIELDS.length));
  const partySource=g.eq(sourceIndex,0),source={};for(const k of ACTOR_FIELDS)source[k]=g.where(partySource,before[0][k],before[1][k]);
  const supported=g.and(g.eq(before[0].acrobat,0),g.eq(before[1].criticalThreshold,0),...before.flatMap(a=>['sleep','confusion','paralysis','skip'].map(k=>g.eq(a[k],0)))),active=g.and(enabled,supported,g.gt(before[0].hp,0),g.gt(before[1].hp,0));
  const pre=new RandomGraph(g,seed,position);
  if(includePreparation){pre.raw(g.and(active,g.not(partySource),g.gt(cfg.enemyAppealGate,0)));pre.raw(active);aux.coupSkip=g.where(g.and(active,partySource),0,aux.coupSkip);}
  // Actual target_repetition (JPN func_ov000_0215fbe0) constructs both random
  // table entries before looking up repeat_mode0. Their values are unused for
  // action1, but both draws must precede the attack's shared roll.
  pre.raw(active);pre.raw(active);
  const impact=g.inline(buildStrikeModel({name:'rom-strike-impact',deferRecovery:true}),{seed:pre.seed,position:pre.position,actors:actorInput,combo,context,sourceIndex,enabled:active},'impact');
  let actors=unpack(g,impact.nextActors);aux=clearAuxDeaths(g,aux,actors,active);const rng=new RandomGraph(g,impact.nextSeed,impact.nextPosition);
  const angerCheck=(gate,chance)=>{
    const blocked=g.or(g.le(actors[1].hp,0),...['sleep','paralysis','confusion','skip'].map(k=>g.gt(actors[1][k],0)));
    const result=applyAngerCheck(g,rng,aux,{gate,blocked,chance,minimum:cfg.angerMin,maximum:cfg.angerMax,sourceId:actors[0].id});aux=result.aux;return result.activated;
  };
  const quarter=g.and(g.ge(g.mul(before[1].hp,4),before[1].maxHp),g.lt(g.mul(actors[1].hp,4),actors[1].maxHp)),half=g.and(g.ge(g.mul(before[1].hp,2),before[1].maxHp),g.lt(g.mul(actors[1].hp,2),actors[1].maxHp));
  const hpAngerGate=g.and(active,partySource,g.gt(impact.damage,0),g.gt(actors[1].hp,0),g.or(quarter,half));
  const hpAnger=angerCheck(hpAngerGate,g.where(quarter,cfg.angerQuarterChance,cfg.angerHalfChance));
  // Physical damage reactions consume their recovery draw even after death.
  const wakeGate=g.and(active,g.gt(impact.damage,0)),wakeRoll=rng.bounded(wakeGate,100);
  for(let i=0;i<2;i++){
    const target=g.eq(sourceIndex,1-i),a=actors[i],probability=g.where(g.gt(a.sleep,0),a.party===undefined?0:g.where(g.gt(a.party,0),100,50),g.where(g.gt(a.confusion,0),g.where(g.gt(a.party,0),50,25),0));
    const recovered=g.and(wakeGate,target,g.lt(wakeRoll,probability));a.sleep=g.where(recovered,0,a.sleep);a.confusion=g.where(recovered,0,a.confusion);
  }
  // apply_weapon_procs draws before checking the source side or weapon flags.
  // No supported weapon has an effect here, but the draw is still observable.
  rng.raw(wakeGate);
  const level=actors[0].level,duration=coupLevelDuration(g,level);
  const tryCoup=(gate,chance)=>{
    const blocked=g.or(g.le(actors[0].hp,0),...['sleep','paralysis','confusion','skip'].map(k=>g.gt(actors[0][k],0))),check=coupEligibility(g,{gate,skip:aux.coupSkip,level,blocked,ready:aux.coupReady});
    aux.coupSkip=check.skip;const roll=rng.bounded(check.eligible,100),charged=g.and(check.eligible,g.lt(roll,chance));aux.coupReady=g.where(charged,1,aux.coupReady);aux.coupDuration=g.where(charged,duration,aux.coupDuration);return charged;
  };
  const bonus=coupDamageBonus(g,impact.damage,actors[0].maxHp);
  const hitCharge=tryCoup(g.and(active,g.not(partySource)),bonus);
  const criticalAnger=angerCheck(g.and(active,partySource,g.gt(impact.critical,0),g.gt(actors[1].hp,0)),cfg.angerCriticalChance);
  const actionCharge=tryCoup(g.and(active,partySource,g.gt(actors[1].hp,0)),cfg.coupAfterActionChance);
  if(includePostStatus){
    const ongoing=g.and(active,g.gt(actors[0].hp,0),g.gt(actors[1].hp,0)),shared=rng.bounded(ongoing,100);
    aux=advanceAnger(g,aux,{enabled:g.and(ongoing,g.not(partySource)),targetValid:g.eq(aux.angerTarget,actors[0].id),sharedRoll:shared});
  // Source after-action expiration order, followed by all duration decrements.
  for(const s of ACTION_STATUSES){
    const current=g.where(partySource,actors[0][s.field],actors[1][s.field]),rec=g.where(partySource,aux[timerKey(0,s.field,'Recovery')],aux[timerKey(1,s.field,'Recovery')]),gate=g.and(ongoing,g.not(g.eq(current,0)),g.gt(rec,0));
    const nextRec=g.max(g.sub(rec,1),0),cleared=g.and(gate,g.lt(rng.bounded(gate,100),lookup(g,nextRec,s.thresholds)));
    for(let i=0;i<2;i++){const selected=g.eq(sourceIndex,i),apply=g.and(gate,selected),clear=g.and(cleared,selected),rk=timerKey(i,s.field,'Recovery'),dk=timerKey(i,s.field,'Duration');actors[i][s.field]=g.where(clear,0,actors[i][s.field]);aux[rk]=g.where(clear,0,g.where(apply,nextRec,aux[rk]));aux[dk]=g.where(clear,0,aux[dk]);}
  }
  for(const s of ACTION_STATUSES)for(let i=0;i<2;i++){
    const dk=timerKey(i,s.field,'Duration'),rk=timerKey(i,s.field,'Recovery'),tick=g.and(ongoing,g.eq(sourceIndex,i),g.not(g.eq(actors[i][s.field],0)),g.gt(aux[dk],0));
    aux[dk]=g.where(tick,g.sub(aux[dk],1),aux[dk]);aux[rk]=g.where(g.and(tick,g.eq(aux[dk],0)),s.steps,aux[rk]);
  }
  }
  if(!includePreparation&&!includePostStatus){g.contract.scopeJa='通常攻撃の行動本体。対象展開・ダメージ・武器反応の乱数・必殺・怒りまで。行動前回復と行動後状態期限は含まない。';g.contract.scope='Core normal-action caller corresponding to JPN021ebd9c, with decoded state and successfully allocated event buffers. Preparation and post-action status are explicitly outside this entry/exit boundary.';}
  const comboColumns=g.split(impact.nextCombo,6);
  for(const [name,value] of Object.entries({nextSeed:rng.seed,nextPosition:rng.position,nextActors:pack(g,actors),nextAux:g.cat(AUX_FIELDS.map(k=>aux[k])),nextCombo:impact.nextCombo,nextContext:impact.nextContext,comboSide:comboColumns[0],comboCount:comboColumns[1],comboAction:comboColumns[2],comboTarget:comboColumns[3],damage:impact.damage,critical:impact.critical,consumed:g.sub(rng.position,position),active:g.cast(active,'float32'),supported:g.cast(supported,'float32'),charged:g.cast(g.or(hitCharge,actionCharge),'float32'),angerActivated:g.cast(g.or(hpAnger,criticalAnger),'float32')}))g.output(value,name);
  return g;
}
