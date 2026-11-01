import {Graph,physical} from './graph-builder.mjs';
import {RandomGraph,buffStat} from './transition-graphs.mjs';
import {ACTOR_FIELDS,COMBO_FIELDS,COMBO_MULTIPLIERS,DEFEND_MULTIPLIERS} from './rules.mjs';
import {AUX_FIELDS,CONFIG_FIELDS,DEFAULT_AUX,DEFAULT_CONFIG,DEFAULT_EXTENDED_ACTORS,EXTENDED_PROVENANCE} from './extended-rules.mjs';
import {extendedInputContract} from './input-domains.mjs';
import {clearAuxDeaths} from './extended-action.mjs';
import {coupDamageBonus,coupLevelDuration,coupEligibility,angerCheck} from './lifecycle-rules.mjs';
import {BOSS_ACTION_IDS,BOSS_ACTION_RULES,BOSS_STATUS_FIELDS,BOSS_RESISTANCE_FIELDS,bossRuleColumns,resistanceFraction} from './boss-action-rules.mjs';
import {writeFile} from 'node:fs/promises';
const object=(keys,values)=>Object.fromEntries(keys.map((key,i)=>[key,values[i]]));
const unpack=(g,x)=>{const a=g.split(x,ACTOR_FIELDS.length*2);return[0,1].map(i=>object(ACTOR_FIELDS,a.slice(i*ACTOR_FIELDS.length,(i+1)*ACTOR_FIELDS.length)));};
const pack=(g,a)=>g.cat(a.flatMap(x=>ACTOR_FIELDS.map(k=>x[k])));
const lookup=(g,key,values)=>values.slice(1).reduce((v,x,i)=>g.where(g.eq(key,i+1),x,v),g.constant(values[0]));
const statusKey=(actor,field)=>`a${actor}_${field}`;
export function buildBossActionCore(options={}){
  const actionIds=options.actionIds??BOSS_ACTION_IDS,actionRules=options.actionRules??BOSS_ACTION_RULES;
  const contract=extendedInputContract();
  Object.assign(contract.inputDomains,{actionId:{values:actionIds},resistances:{min:0,max:255,integer:true,width:BOSS_RESISTANCE_FIELDS.length},wakeSkip:{min:0,max:1,integer:true,width:2}});
  contract.fieldDomains.status=BOSS_STATUS_FIELDS.map(name=>({name,min:0,max:name.endsWith('poisonKind')?2:name.endsWith('Recovery')?4:255,integer:true}));
  const g=new Graph(options.name??'rom-boss-action-core2',{
    ...contract,scopeJa:'通常攻撃・もうどく攻撃・ルカナン・ボミオス・あまいいきの行動本体。味方の非通常行動、行動前後の状態回復、AIとカメラは外側。',defaultSteps:1,
    scope:'The same actual ROM core boundary JPN021ebd9c: decoded 1v1 state, one existing target, successful event allocation, action1 for either side and44/48/228/275 for the enemy. Primary pre-recovery and post-action expiry are outside.',
    provenance:EXTENDED_PROVENANCE,actionRules:actionRules,actorFields:ACTOR_FIELDS,auxFields:AUX_FIELDS,configFields:CONFIG_FIELDS,comboFields:COMBO_FIELDS,statusFields:BOSS_STATUS_FIELDS,resistanceFields:BOSS_RESISTANCE_FIELDS,
    stateEncoding:'Status bits8=paralysis,16=sleep,32=confusion are separate. actors.poison denotes the active severe-poison flag; status.poisonKind preserves the raw subtype0/1/2. Active severe poison requires subtype2, but an inactive poison flag may retain subtype2. Ordinary poison has no periodic damage in the represented rules. Timers retain their individual ROM bytes.',
    support:'Acting actor is alive and not asleep/paralyzed/confused/skipping; target may have those statuses. No counter/redirection, magic reflection, barriers, metal, tension, elemental/species/equipment effects, ailment resistance modifiers or failed event allocation. Enemy critical threshold0. Party acrobat excluded. Enemy MP>=255 is not spent; otherwise mp must cover cost. Action replacement/fizzle is outside.',
    rounding:'Resistance/100 comes from an exact256-entry binary32 table, then the original multiply/add/floor sequence. Non-damaging status actions still calculate physical internal damage and can consume the positive-damage weapon-reaction draw.',
    feedback:{seed:'nextSeed',position:'nextPosition',actors:'nextActors',aux:'nextAux',combo:'nextCombo',context:'nextContext',status:'nextStatus',wakeSkip:'nextWakeSkip'},
    defaults:{seed:[1,0,0,0,0,0,0,0],position:1,actors:DEFAULT_EXTENDED_ACTORS,aux:DEFAULT_AUX,config:DEFAULT_CONFIG,combo:[0,0,0,-1,0,0],context:[1,0],sourceIndex:1,enabled:true,actionId:275,resistances:[100,100,100,100,100],status:Array(14).fill(0),wakeSkip:[0,0]},
    wakeSkip:'Raw stats3b bit0 is separate from status14 skip. Damage recovery sets it. The enclosing turn execution loop skips the actor before preparation when this flag is1; this core preserves its own narrower entry boundary.',
    labels:{actionId:'1攻撃 /44ルカナン /48ボミオス /228あまいいき /275もうどく攻撃',resistances:'低下DEF・低下AGI・睡眠・毒・物理の耐性率',status:'毒種別と主状態の個別カウンタ',actors:'2人の状態',aux:'必殺・怒り・強化状態カウンタ',wakeSkip:'被ダメ回復による当ターン行動省略flag'},
    ...(options.contract??{})
  });
  const seed=g.input('seed',['N',8]),position=g.input('position',['N',1],'int32'),actorInput=g.input('actors',['N',66]),auxInput=g.input('aux',['N',35]),configInput=g.input('config',['N',7]),comboInput=g.input('combo',['N',6]),contextInput=g.input('context',['N',2]),sourceIndex=g.input('sourceIndex'),enabled=g.input('enabled',['N',1],'bool'),actionId=g.input('actionId'),resistance=g.split(g.input('resistances',['N',BOSS_RESISTANCE_FIELDS.length]),BOSS_RESISTANCE_FIELDS.length),statusInput=g.input('status',['N',14]);
  const wakeSkip=[...g.split(g.input('wakeSkip',['N',2]),2)],rule=bossRuleColumns(g,actionId,actionRules),before=unpack(g,actorInput),actors=before.map(x=>({...x})),firstSource=g.eq(sourceIndex,0),source={},target={},status=object(BOSS_STATUS_FIELDS,g.split(statusInput,14)),cfg=object(CONFIG_FIELDS,g.split(configInput,7));let aux=object(AUX_FIELDS,g.split(auxInput,35));
  // Pair position is independent of party/enemy identity in the common ABI.
  // The default remains the original two-actor ABI, with identical nodes.
  for(const key of ACTOR_FIELDS){source[key]=g.where(firstSource,before[0][key],before[1][key]);target[key]=g.where(firstSource,before[1][key],before[0][key]);}
  const partySource=options.independentActors?g.gt(source.party,0):firstSource;
  const mpEligible=()=>options.checkMp===false?g.eq(0,0):g.or(g.and(g.not(partySource),g.ge(source.mp,255)),g.ge(source.mp,rule.mpCost));
  let supported=g.and(g.or(...actionIds.map(id=>g.eq(actionId,id))),...(options.allowPartyActions?[]:[g.or(g.not(partySource),g.eq(actionId,1))]),options.partyAcrobatSupport?options.partyAcrobatSupport(g,rule,before):g.eq(before[0].acrobat,0),options.independentActors?g.or(partySource,g.eq(source.criticalThreshold,0)):g.eq(before[1].criticalThreshold,0),...(options.sourceEligibility?[options.sourceEligibility(g,rule,source)]:['sleep','paralysis','confusion','skip'].map(k=>g.eq(source[k],0))),mpEligible(),...[0,1].map(i=>g.or(g.eq(before[i].poison,0),g.eq(status[statusKey(i,'poisonKind')],2))));
  if(options.additionalSupport)supported=g.and(supported,options.additionalSupport(g,rule,{before,source,target,sourceIndex,partySource}));
  const active=g.and(enabled,supported,g.gt(source.hp,0),g.gt(target.hp,0),...(options.targetEligibility?[options.targetEligibility(g,rule,target)]:[])),rng=new RandomGraph(g,seed,position);
  if(options.gatherTargets!==false){rng.raw(active);rng.raw(active);} // execution target-repetition table materialization
  const preCrit=g.gt(rule.preCritical,0),critBefore=options.commandCritical?g.and(active,preCrit,g.input('commandCritical',['N',1],'bool')):options.criticalCheck?options.criticalCheck(g,rng,rule,g.and(active,preCrit),{source,target,partySource}):g.and(active,preCrit,g.lt(rng.bounded(g.and(active,preCrit),10000),source.criticalThreshold)),sharedGate=options.sharedBeforeTargetCheck?g.and(enabled,supported,g.gt(source.hp,0)):active,shared=options.sharedDraw?options.sharedDraw(g,rng,sharedGate):rng.bounded(sharedGate,100);
  const oldCombo=g.split(comboInput,6),context=g.split(contextInput,2),side=g.where(partySource,1,2),sameToken=g.and(g.eq(oldCombo[4],context[0]),g.eq(oldCombo[5],context[1]));
  let count=g.where(g.eq(oldCombo[0],side),g.where(sameToken,oldCombo[1],g.add(oldCombo[1],1)),0);
  count=g.where(g.and(g.eq(oldCombo[2],actionId),g.eq(oldCombo[3],target.id)),count,0);
  const comboUpdateGate=options.comboUpdateGate?options.comboUpdateGate(g,active):active;
  let combo=[side,count,actionId,target.id,...context].map((x,i)=>g.where(comboUpdateGate,g.where(g.gt(rule.combo,0),x,i===3?oldCombo[i]:0),oldCombo[i]));
  const critAfter=options.criticalCheck?options.criticalCheck(g,rng,rule,g.and(active,g.not(preCrit)),{source,target,partySource}):g.and(active,g.not(preCrit),g.lt(rng.bounded(g.and(active,g.not(preCrit)),10000),source.criticalThreshold)),critical=options.finalCritical?options.finalCritical(g,active,g.or(critBefore,critAfter)):g.or(critBefore,critAfter);
  const defendable=g.and(active,g.eq(g.add(g.add(target.sleep,target.paralysis),target.skip),0)),acrobat=g.gt(target.acrobat,0),dodgeGate=g.and(defendable,g.gt(rule.dodge,0)),dodgeRoll=rng.bounded(g.and(dodgeGate,g.not(acrobat)),100);
  const dodgeRate=options.dodgeRate?options.dodgeRate(g,target.dodgeRate,rule,{source,target,partySource}):target.dodgeRate;
  let dodge=g.and(dodgeGate,g.lt(g.where(acrobat,shared,dodgeRoll),g.where(acrobat,50,g.floor(g.mul(dodgeRate,g.where(g.gt(target.doubleDodge,0),2,1))))));
  const guardRate=options.guardRate?options.guardRate(g,target.guardRate,rule,{source,target,partySource}):target.guardRate;
  const guardGate=g.and(defendable,g.gt(rule.guard,0),g.not(dodge),...(options.guardEligibility?[options.guardEligibility(g,rule,{source,target,partySource})]:[]));let guard=g.and(guardGate,g.lt(rng.bounded(guardGate,100),g.mul(guardRate,g.where(g.gt(target.doubleGuard,0),2,1))));
  const accuracyActive=options.accuracyEligibility?g.and(active,options.accuracyEligibility(g,rule,{source,target,partySource})):active;
  const accuracy=rng.bounded(accuracyActive,100),statusResistance=options.accuracyResistance?options.accuracyResistance(g,rule,resistance):g.where(g.eq(actionId,44),resistance[0],g.where(g.eq(actionId,48),resistance[1],resistance[2])),accuracyRule=options.accuracyThreshold?options.accuracyThreshold(g,rng,rule,{source,target,partySource,active:accuracyActive,critical,statusResistance}):null,threshold=accuracyRule?accuracyRule.threshold:g.where(g.eq(rule.accuracyMode,1),g.floor(g.add(.5,g.mul(rule.baseChance,resistanceFraction(g,statusResistance)))),100);
  const blindGate=g.and(accuracyActive,g.gt(rule.blind,0),g.gt(source.blind,0),...(accuracyRule?.skipBlind?[g.not(accuracyRule.skipBlind)]:[])),blindMiss=g.and(blindGate,g.lt(rng.bounded(blindGate,8),5)),hit=g.and(accuracyActive,g.lt(accuracy,threshold),g.not(blindMiss));
  const attack=g.where(g.gt(rule.buffAttack,0),buffStat(g,source.baseAttack,source.attackRank,'quarter',true,source.party),source.baseAttack),defense=buffStat(g,target.baseDefense,target.defenseRank,'defense',true,target.party);
  const p=options.baseDamage?options.baseDamage(g,rng,rule,hit,{attack,defense,source,target,actionId,partySource}):physical(g,rng.seed,rng.position,attack,defense,hit);rng.seed=p.seed;rng.position=p.position;
  const critActive=options.criticalDamageGate?options.criticalDamageGate(g,rule,g.and(hit,critical),{source,target,partySource}):g.and(hit,critical);
  let internal;
  if(options.criticalDamage){
    const preCritical=options.preCriticalDamage?options.preCriticalDamage(g,rng,rule,hit,p.damage,{before,source,target,sourceIndex,partySource,active,critical}):p.damage;
    internal=options.criticalDamage(g,rng,rule,critActive,p.damage,{preCritical,source,target,partySource});
  }else{
    // Keep the original normal-strike construction byte-for-byte for callers
    // which do not request the shared critical formula.
    const critRange=rng.range(critActive,Math.fround(.95),Math.fround(1.05)),signedAttack=g.where(g.ge(source.baseAttack,32768),g.sub(source.baseAttack,65536),source.baseAttack);
    const preCritical=options.preCriticalDamage?options.preCriticalDamage(g,rng,rule,hit,p.damage,{before,source,target,sourceIndex,partySource,active,critical}):p.damage;
    internal=g.where(critActive,g.max(g.max(g.mul(preCritical,Math.fround(1.2)),g.mul(signedAttack,critRange)),p.damage),preCritical);
  }
  // The record's damage element (word08) is distinct from its ailment element
  // (word18). Normal and poison attacks use physical resistance element8;
  // the three status operations use damage element0, whose multiplier is1.
  const damageResistance=options.damageResistance?options.damageResistance(g,rule,resistance):g.where(g.eq(rule.damageElement,8),resistanceFraction(g,resistance[4]),1);
  internal=g.mul(internal,damageResistance);
  const equipmentDamage=options.postResistanceDamage?options.postResistanceDamage(g,internal,rule,{source,target,sourceIndex,partySource,resistance,damageResistance,active,hit,critical}):null;
  if(equipmentDamage)internal=equipmentDamage.damage;
  internal=g.mul(internal,g.where(g.gt(rule.defend,0),lookup(g,target.defend,DEFEND_MULTIPLIERS),1));
  if(options.postDefendDamage)internal=options.postDefendDamage(g,internal,rule,{source,target,sourceIndex,partySource,active,hit,critical});
  if(options.postprocessEquipment){
    const equipment=options.postprocessEquipment(g,internal,rule,{source,target,sourceIndex,partySource,active,hit,critical,dodge,guard});
    internal=equipment.damage;dodge=equipment.dodge;guard=equipment.guard;
  }
  const blocked=g.or(dodge,guard);internal=g.where(blocked,0,internal);
  const minimumContext={source,target,sourceIndex,partySource,active,hit,critical,blocked,damageResistance};
  if(options.beforeMinimumDamage)internal=options.beforeMinimumDamage(g,rng,internal,rule,minimumContext);
  const minimumGate=options.minimumDamageGate?options.minimumDamageGate(g,rule,minimumContext):null;
  const zero=g.and(hit,g.not(blocked),g.le(internal,0),g.gt(damageResistance,0),...(equipmentDamage?.minimumAllowed?[equipmentDamage.minimumAllowed]:[]),...(minimumGate?[minimumGate]:[]));internal=g.where(zero,rng.bounded(zero,2),internal);
  if(options.afterMinimumDamage)internal=options.afterMinimumDamage(g,rng,internal,rule,minimumContext);
  if(options.beforeComboDamage)internal=options.beforeComboDamage(g,internal,rule,{source,target,sourceIndex,partySource,active,hit});
  const comboDamageGate=options.fullPostprocessOnBlocked?g.and(hit,g.ge(internal,1),g.gt(rule.combo,0)):g.and(hit,g.not(blocked),g.ge(internal,1),g.gt(rule.combo,0));
  // The command header is written inside the postprocessor, before the
  // caller clears a dodged/guarded result and before combo state is reset.
  // Keep this computed projection separate from final HP damage.
  const cameraFlagsB=options.commandHeaderMetadata?g.where(comboDamageGate,g.mul(g.min(combo[1],3),32),8):null;
  const keepCombo=options.fullPostprocessOnBlocked?g.and(comboDamageGate,g.not(blocked)):comboDamageGate;internal=g.where(comboDamageGate,g.mul(internal,lookup(g,g.min(combo[1],3),COMBO_MULTIPLIERS)),internal);internal=g.where(hit,g.floor(internal),0);
  if(options.finalDamage)internal=options.finalDamage(g,internal,rule,{source,target,actionId,partySource,hit,critical});
  const postprocessedDamage=internal;
  // The original action caller clears a guarded/dodged result AFTER the
  // complete postprocessor. Metal64/126 and equipment+1 can produce a
  // positive postprocessor value even with those flags still set.
  if(options.fullPostprocessOnBlocked)internal=g.where(blocked,0,internal);
  combo=combo.map((x,i)=>i===3?x:g.where(active,g.where(keepCombo,x,0),x));
  const operationHit=g.and(hit,g.not(blocked)),ordinaryPrimaryDamage=g.where(g.eq(rule.operation,1),internal,0),damage=options.primaryDamage?options.primaryDamage(g,ordinaryPrimaryDamage,rule,{source,target,actionId,partySource,active,hit,operationHit}):ordinaryPrimaryDamage;
  let poisonResult;
  if(options.additionalPoison)poisonResult=options.additionalPoison(g,rng,rule,{source,target,partySource,active,operationHit,damage,internalDamage:internal,critical,resistance});
  else {const poisonGate=g.and(operationHit,g.eq(rule.additional,4),g.gt(internal,0),g.gt(resistance[3],0)),poisonRoll=rng.bounded(poisonGate,100),poisonChance=g.where(critical,100,g.mul(rule.baseChance,resistanceFraction(g,resistance[3])));poisonResult={applied:g.and(poisonGate,g.lt(poisonRoll,poisonChance)),kind:g.constant(2),severe:g.eq(0,0)};}
  const poisoned=poisonResult.applied;
  const rankEligible=value=>options.dataDrivenRank?g.or(g.and(g.gt(rule.parameter,0),g.lt(value,2)),g.and(g.lt(rule.parameter,0),g.gt(value,-2))):g.gt(value,-2);
  const changedRank=value=>options.dataDrivenRank?g.min(2,g.max(-2,g.add(value,rule.parameter))):g.sub(value,1);
  const rankDefense=g.and(operationHit,g.eq(rule.operation,4),rankEligible(target.defenseRank)),rankAgility=g.and(operationHit,g.eq(rule.operation,5),rankEligible(target.agilityRank)),asleep=g.and(operationHit,g.eq(rule.operation,8),g.eq(target.paralysis,0));
  const nextTarget={...target,hp:g.max(g.sub(target.hp,damage),0),poison:g.where(poisoned,g.cast(poisonResult.severe,'float32'),target.poison),defenseRank:g.where(rankDefense,changedRank(target.defenseRank),target.defenseRank),agilityRank:g.where(rankAgility,changedRank(target.agilityRank),target.agilityRank),sleep:g.where(asleep,1,target.sleep),defend:g.where(asleep,0,target.defend),skip:g.where(asleep,0,target.skip)};
  const additionalTargetEffect=options.targetEffect?options.targetEffect(g,rule,operationHit,{sourceIndex,partySource,source,target,nextTarget,active,aux,status,wakeSkip,rng,internalDamage:internal,critical,resistance}):null;
  if(additionalTargetEffect?.target)Object.assign(nextTarget,additionalTargetEffect.target);
  const dead=g.and(active,g.le(nextTarget.hp,0));
  for(const key of ['attackRank','defenseRank','agilityRank','blind','sleep','confusion','paralysis','skip','defend','acrobat','doubleDodge','doubleGuard','hpRegen','hpDuration','hpRecovery','mpRegen','mpDuration','mpRecovery','poison'])nextTarget[key]=g.where(dead,0,nextTarget[key]);
  if(options.spendMp!==false)source.mp=g.where(g.and(active,g.or(partySource,g.lt(source.mp,255))),g.max(g.sub(source.mp,rule.mpCost),0),source.mp);
  for(const key of ACTOR_FIELDS){actors[0][key]=g.where(firstSource,source[key],nextTarget[key]);actors[1][key]=g.where(firstSource,nextTarget[key],source[key]);}
  for(let i=0;i<2;i++){
    const selected=g.eq(sourceIndex,1-i),apply=g.and(active,selected),death=g.and(apply,dead),sleepSet=g.and(selected,asleep);
    status[statusKey(i,'poisonKind')]=g.where(g.and(selected,poisoned),poisonResult.kind,status[statusKey(i,'poisonKind')]);
    status[statusKey(i,'sleepDuration')]=g.where(sleepSet,1,status[statusKey(i,'sleepDuration')]);status[statusKey(i,'sleepRecovery')]=g.where(sleepSet,0,status[statusKey(i,'sleepRecovery')]);
    for(const field of BOSS_STATUS_FIELDS.filter(k=>k.startsWith(`a${i}_`)))status[field]=g.where(death,0,status[field]);
    for(const [field,gate]of [['defenseRank',rankDefense],['agilityRank',rankAgility]]){
      const changed=g.and(selected,gate),durationKey=`a${i}_${field}Duration`,recoveryKey=`a${i}_${field}Recovery`;
      aux[durationKey]=g.where(changed,g.where(g.eq(actors[i][field],0),0,6),aux[durationKey]);aux[recoveryKey]=g.where(changed,0,aux[recoveryKey]);
    }
  }
  aux=clearAuxDeaths(g,aux,actors,active);
  const applyAnger=(gate,chance)=>{const blocked=g.or(g.le(actors[1].hp,0),...['sleep','paralysis','confusion','skip'].map(k=>g.gt(actors[1][k],0)));const result=angerCheck(g,rng,aux,{gate,blocked,chance,minimum:cfg.angerMin,maximum:cfg.angerMax,sourceId:actors[0].id});aux=result.aux;return result.activated;};
  const quarter=g.and(g.ge(g.mul(before[1].hp,4),before[1].maxHp),g.lt(g.mul(actors[1].hp,4),actors[1].maxHp)),half=g.and(g.ge(g.mul(before[1].hp,2),before[1].maxHp),g.lt(g.mul(actors[1].hp,2),actors[1].maxHp));
  const lifecycleContext={before,actors,source,target,sourceIndex,partySource,active,damage,internalDamage:internal,critical,rule,aux,status,wakeSkip};
  const hpAnger=options.beforeHitRecovery?options.beforeHitRecovery(g,rng,lifecycleContext):applyAnger(g.and(active,partySource,g.gt(damage,0),g.gt(actors[1].hp,0),g.or(quarter,half)),g.where(quarter,cfg.angerQuarterChance,cfg.angerHalfChance));
  const positive=g.and(active,g.gt(internal,0));
  if(options.beforeWakeRecovery)options.beforeWakeRecovery(g,rng,{...lifecycleContext,positive,internalDamage:internal});
  const ordinaryWake=g.and(positive,g.gt(rule.recover,0)),wakeGate=options.wakeRecoveryGate?options.wakeRecoveryGate(g,ordinaryWake):ordinaryWake,wakeRoll=rng.bounded(wakeGate,100);
  for(let i=0;i<2;i++){
    const a=actors[i],probability=g.where(g.gt(a.sleep,0),g.where(g.gt(a.party,0),100,50),g.where(g.gt(a.confusion,0),g.where(g.gt(a.party,0),50,25),0)),recovered=g.and(wakeGate,g.eq(sourceIndex,1-i),g.lt(wakeRoll,probability));
    a.sleep=g.where(recovered,0,a.sleep);a.confusion=g.where(recovered,0,a.confusion);
    wakeSkip[i]=g.where(recovered,1,wakeSkip[i]);
    for(const key of ['sleepDuration','sleepRecovery','confusionDuration','confusionRecovery'])status[statusKey(i,key)]=g.where(recovered,0,status[statusKey(i,key)]);
  }
  rng.raw(options.weaponCallbackGate?options.weaponCallbackGate(g,rule,positive):positive); // Allocator-success weapon callback even for status actions.
  const tryCoup=(gate,chance)=>{const blocked=g.or(g.le(actors[0].hp,0),...['sleep','paralysis','confusion','skip'].map(k=>g.gt(actors[0][k],0))),eligible=coupEligibility(g,{gate,skip:aux.coupSkip,level:actors[0].level,blocked,ready:aux.coupReady});aux.coupSkip=eligible.skip;const charged=g.and(eligible.eligible,g.lt(rng.bounded(eligible.eligible,100),chance));aux.coupReady=g.where(charged,1,aux.coupReady);aux.coupDuration=g.where(charged,coupLevelDuration(g,actors[0].level),aux.coupDuration);return charged;};
  const after=options.afterHitRecovery?options.afterHitRecovery(g,rng,lifecycleContext):null;
  const hitCharge=after?after.hitCharge:tryCoup(g.and(active,g.not(partySource)),coupDamageBonus(g,damage,actors[0].maxHp)),critAnger=after?after.critAnger:applyAnger(g.and(active,partySource,critical,g.gt(actors[1].hp,0)),cfg.angerCriticalChance),actionCharge=after?after.actionCharge:tryCoup(g.and(active,partySource,g.gt(actors[1].hp,0)),cfg.coupAfterActionChance);
  let nextContext=contextInput;
  if(options.advanceContext!==false){const low=g.add(context[0],g.cast(active,'float32')),carry=g.floor(g.mul(low,1/65536)),high=g.add(context[1],carry);nextContext=g.cat([g.sub(low,g.mul(carry,65536)),g.sub(high,g.mul(g.floor(g.mul(high,1/65536)),65536))]);}
  const output={nextSeed:rng.seed,nextPosition:rng.position,nextActors:pack(g,actors),nextAux:g.cat(AUX_FIELDS.map(k=>aux[k])),nextStatus:g.cat(BOSS_STATUS_FIELDS.map(k=>status[k])),nextWakeSkip:g.cat(wakeSkip),nextCombo:g.cat(combo),nextContext,comboSide:combo[0],comboCount:combo[1],comboAction:combo[2],comboTarget:combo[3],damage,internalDamage:internal,consumed:g.sub(rng.position,position),active:g.cast(active,'float32'),supported:g.cast(supported,'float32'),critical:g.cast(critical,'float32'),accuracyPassed:g.cast(hit,'float32'),effectApplied:g.cast(g.or(g.and(operationHit,g.eq(rule.operation,1)),rankDefense,rankAgility,asleep),'float32'),poisoned:g.cast(poisoned,'float32'),charged:g.cast(g.or(hitCharge,actionCharge),'float32'),angerActivated:g.cast(g.or(hpAnger,critAnger),'float32')};
  if(additionalTargetEffect?.applied)output.effectApplied=g.cast(g.or(g.gt(output.effectApplied,0),additionalTargetEffect.applied),'float32');
  if(options.exposeHitResults)for(const[name,value]of Object.entries({dodged:dodge,guarded:guard,blindMiss,operationHit}))output[name]=g.cast(value,'float32');
  if(options.commandHeaderMetadata)output.cameraFlagsB=cameraFlagsB;
  if(options.extraOutputs)Object.assign(output,options.extraOutputs(g,{actors,before,active,supported,hit,critical,damage,internalDamage:internal,postprocessedDamage,sourceIndex,partySource,source,target,rule,additionalTargetEffect}));
  for(const [name,value]of Object.entries(output))g.output(value,name);
  return g;
}
if(process.argv[1]&&new URL(`file://${process.argv[1]}`).href===import.meta.url){const model=buildBossActionCore(),result=await model.save();await writeFile(new URL('boss-action-models.json',import.meta.url),JSON.stringify([result],null,2)+'\n');console.log(JSON.stringify(result,null,2));}
