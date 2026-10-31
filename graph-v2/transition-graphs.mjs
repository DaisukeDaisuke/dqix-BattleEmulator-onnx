import {Graph,lcg,normalized,bounded,between,physical} from './graph-builder.mjs';
import {ACTOR_FIELDS,COMBO_FIELDS,STAT_RULES,COMBO_MULTIPLIERS,DEFEND_MULTIPLIERS,RECOVERY_THRESHOLDS,EXAMPLE_ACTORS,SOURCES} from './rules.mjs';
const F=Math.fround;
const lookup=(g,key,values)=>values.slice(1).reduce((out,v,i)=>g.where(g.eq(key,i+1),v,out),g.constant(values[0]));
const actorObjects=(g,input)=>{const c=g.split(input,ACTOR_FIELDS.length*2);return [0,1].map(i=>Object.fromEntries(ACTOR_FIELDS.map((k,j)=>[k,c[i*ACTOR_FIELDS.length+j]])));};
const packActors=(g,a)=>g.cat(a.flatMap(x=>ACTOR_FIELDS.map(k=>x[k])));
const tagExact=(g,start,reason)=>{for(const n of g.nodes.slice(start)){n.exactArithmetic=true;n.exactArithmeticReason=reason;}};
export function buffStat(g,base,rank,kind,partyCap,party){
  const start=g.nodes.length;
  const quarters=kind==='quarter'?g.add(4,rank):kind==='defense'?g.where(g.lt(rank,0),g.add(3,rank),g.add(4,g.mul(2,rank))):kind==='charm'?g.add(4,g.mul(2,g.max(rank,0))):g.add(4,g.mul(2,rank));
  const integer=g.floor(g.mul(g.mul(base,quarters),.25));
  const u16=g.sub(integer,g.mul(g.floor(g.mul(integer,1/65536)),65536));
  const result=g.min(u16,partyCap?g.where(g.gt(party,0),999,65535):999);
  tagExact(g,start,'base is u16; rank in -2..2; products <= 524280 < 2^20; quarter scale and u16 modulo are exact integer/power-of-two arithmetic.');
  return result;
}
export class RandomGraph {
  constructor(g,seed,position){this.g=g;this.seed=seed;this.position=position;}
  raw(enabled){const g=this.g,n=lcg(g,this.seed);this.seed=g.where(enabled,n.seed,this.seed);this.position=g.add(this.position,g.cast(enabled,'int32'));return n.raw;}
  unit(enabled){return normalized(this.g,this.raw(enabled));}
  bounded(enabled,max){return bounded(this.g,this.unit(enabled),max);}
  range(enabled,min,max){return between(this.g,this.unit(enabled),min,max);}
}
function updatedCombo(g,previous,source,target,context,enabled){
  const side=g.where(g.gt(source.party,0),1,2),sameSide=g.eq(previous[0],side),sameContext=g.and(g.eq(previous[4],context[0]),g.eq(previous[5],context[1]));
  let count=g.where(sameSide,g.where(sameContext,previous[1],g.add(previous[1],1)),0);
  count=g.where(g.and(g.eq(previous[2],1),g.eq(previous[3],target.id)),count,0);
  return [side,count,g.constant(1),target.id,...context].map((v,i)=>g.where(enabled,v,previous[i]));
}
function finishCombo(g,combo,keep,active){return combo.map((v,i)=>i===3?v:g.where(active,g.where(keep,v,0),v));}
export function buildBuffModel(){
  const g=new Graph('rom-buff-stats',{sources:SOURCES,scope:'Six recomputed stats only, including ROM u16 conversion before upper cap.',base:'Six u16 integers',ranks:'Six integers in -2..2',party:'0 or 1',defaults:{base:[82,90,58,39,39,39],ranks:[0,0,0,0,0,0],party:1},labels:{base:'基礎能力6項目',ranks:'強化段階6項目',party:'味方=1'}});
  const base=g.split(g.input('base',['N',6]),6),ranks=g.split(g.input('ranks',['N',6]),6),party=g.input('party');
  const stats=STAT_RULES.map((rule,i)=>buffStat(g,base[i],ranks[i],rule.kind,rule.partyCap,party));g.output(g.cat(stats),'stats');return g;
}
export function buildStrikeModel(options={}){
  const g=new Graph(options.name??'rom-resolved-strike',{
    sources:SOURCES,
    scope:options.deferRecovery?'A resolved normal strike through HP application; damage-triggered recovery is deferred so HP-crossing anger checks can be inserted in exact source order.':'A resolved single-target normal physical strike (action 1), from the per-target shared roll through hit, critical, dodge/guard, damage, combo, HP and damage-triggered sleep/confusion recovery. Real source phase, not an entire action/turn/battle.',
    actorFields:ACTOR_FIELDS,comboFields:COMBO_FIELDS,
    seed:'Current LCG state, eight little-endian byte limbs. Position is a counter, not skip-ahead.',
    supported:'Two opposing existing actors; one selected eligible attacker; ordinary single-target weapon; no routing/counter/reflection, metal, tension, element/species bonus, barriers/immunity, weapon effects, coup/anger/finish-action callbacks. Critical/dodge/guard thresholds are already resolved input parameters.',
    excluded:'Target selection, AI, initiative and camera; attack selection; actor status bytes absent from actorFields; all callbacks after recover_after_damage. A full battle orchestrator must supply them rather than silently omit them.',
    terminal:'Both actors must have positive HP to execute. Death freezes subsequent runs. An attacker with sleep, paralysis, skip or confusion also freezes this resolved-strike API; planning/status processing is external.',
    bounds:'HP/MP/max values 0..32767; base stats u16; ranks -2..2; dodge/guard 0..100; criticalThreshold 0..10000 (enemy must be 0); combo count 0..126; context is two u16 limbs; position 1..4990. At most 127 consecutive eligible strikes per combo chain.',
    rounding:'Separate binary32 arithmetic results are required; graph nodes tagged exactArithmetic need no rounding emulation.',
    feedback:{seed:'nextSeed',position:'nextPosition',actors:'nextActors',combo:'nextCombo',context:'nextContext'},
    defaults:{seed:[1,0,0,0,0,0,0,0],position:1,actors:EXAMPLE_ACTORS,combo:[0,0,0,0,0,0],sourceIndex:0,context:[1,0],enabled:true},
    labels:{actors:'2人分の状態（順序は actorFields）',combo:'コンボ状態',sourceIndex:'攻撃者の配列番号',context:'行動IDの下位/上位16bit'}
  });
  const seed=g.input('seed',['N',8]),position=g.input('position',['N',1],'int32'),actorInput=g.input('actors',['N',2*ACTOR_FIELDS.length]),comboInput=g.input('combo',['N',6]),sourceIndex=g.input('sourceIndex'),enabled=g.input('enabled',['N',1],'bool'),context=g.split(g.input('context',['N',2]),2);
  const actors=actorObjects(g,actorInput),isFirst=g.eq(sourceIndex,0),source={},target={};
  for(const key of ACTOR_FIELDS){source[key]=g.where(isFirst,actors[0][key],actors[1][key]);target[key]=g.where(isFirst,actors[1][key],actors[0][key]);}
  const eligible=g.eq(g.add(g.add(source.sleep,source.confusion),g.add(source.paralysis,source.skip)),0);
  const active=g.and(enabled,g.gt(source.hp,0),g.gt(target.hp,0),eligible),rng=new RandomGraph(g,seed,position);
  const shared=rng.bounded(active,100);
  let combo=updatedCombo(g,g.split(comboInput,6),source,target,context,active);
  const critical=g.and(active,g.lt(rng.bounded(active,10000),source.criticalThreshold));
  const canDefend=g.and(active,g.eq(g.add(g.add(target.sleep,target.paralysis),target.skip),0));
  const acrobat=g.gt(target.acrobat,0),dodgeRoll=rng.bounded(g.and(canDefend,g.not(acrobat)),100);
  const dodge=g.and(canDefend,g.lt(g.where(acrobat,shared,dodgeRoll),g.where(acrobat,50,g.floor(g.mul(target.dodgeRate,g.where(g.gt(target.doubleDodge,0),2,1))))));
  const guardActive=g.and(canDefend,g.not(dodge)),guard=g.and(guardActive,g.lt(rng.bounded(guardActive,100),g.mul(target.guardRate,g.where(g.gt(target.doubleGuard,0),2,1))));
  // The unconditional normal accuracy roll occurs even though chance is 100.
  rng.raw(active);
  const blindActive=g.and(active,g.gt(source.blind,0)),blindMiss=g.and(blindActive,g.lt(rng.bounded(blindActive,8),5)),hit=g.and(active,g.not(blindMiss));
  const attack=buffStat(g,source.baseAttack,source.attackRank,'quarter',true,source.party),defense=buffStat(g,target.baseDefense,target.defenseRank,'defense',true,target.party);
  const p=physical(g,rng.seed,rng.position,attack,defense,hit);rng.seed=p.seed;rng.position=p.position;
  const criticalActive=g.and(hit,critical),critRange=rng.range(criticalActive,F(.95),F(1.05));
  const signedAttack=g.where(g.ge(source.baseAttack,32768),g.sub(source.baseAttack,65536),source.baseAttack);
  let damage=g.where(criticalActive,g.max(g.max(g.mul(p.damage,F(1.2)),g.mul(signedAttack,critRange)),p.damage),p.damage);
  damage=g.mul(damage,lookup(g,target.defend,DEFEND_MULTIPLIERS));
  const blocked=g.or(dodge,guard);damage=g.where(blocked,0,damage);
  const zeroDraw=g.and(hit,g.not(blocked),g.le(damage,0));damage=g.where(zeroDraw,rng.bounded(zeroDraw,2),damage);
  const keepCombo=g.and(hit,g.not(blocked),g.ge(damage,1));
  damage=g.where(keepCombo,g.mul(damage,lookup(g,g.min(combo[1],3),COMBO_MULTIPLIERS)),damage);
  // Action 1 has word1c & 0x3fff == 0 in the restored ROM: no damage cap.
  damage=g.where(hit,g.floor(damage),0);
  combo=finishCombo(g,combo,keepCombo,active);
  const newHP=g.max(g.sub(target.hp,damage),0),dead=g.and(active,g.le(newHP,0));
  const sleep=g.where(dead,0,target.sleep),confusion=g.where(dead,0,target.confusion);
  let recovered=g.eq(0,1);
  if(!options.deferRecovery){
    const wakeDraw=g.and(hit,g.gt(damage,0)),wakeRoll=rng.bounded(wakeDraw,100);
    const wakeChance=g.where(g.gt(sleep,0),g.where(g.gt(target.party,0),100,50),g.where(g.gt(confusion,0),g.where(g.gt(target.party,0),50,25),0));
    recovered=g.and(wakeDraw,g.lt(wakeRoll,wakeChance));
  }
  const nextTarget={...target,hp:newHP,sleep:g.where(recovered,0,sleep),confusion:g.where(recovered,0,confusion)};
  // Death clears these represented status/buff bytes in func_02088e80.
  for(const key of ['attackRank','defenseRank','agilityRank','blind','paralysis','skip','defend','acrobat','doubleDodge','doubleGuard','hpRegen','hpDuration','hpRecovery','mpRegen','mpDuration','mpRecovery','poison'])nextTarget[key]=g.where(dead,0,target[key]);
  const nextActors=[{},{}];for(const key of ACTOR_FIELDS){nextActors[0][key]=g.where(isFirst,source[key],nextTarget[key]);nextActors[1][key]=g.where(isFirst,nextTarget[key],source[key]);}
  const low=g.add(context[0],g.cast(active,'float32')),carry=g.floor(g.mul(low,1/65536)),nextContext=[g.sub(low,g.mul(carry,65536)),g.sub(g.add(context[1],carry),g.mul(g.floor(g.mul(g.add(context[1],carry),1/65536)),65536))];
  g.output(rng.seed,'nextSeed');g.output(rng.position,'nextPosition');g.output(g.sub(rng.position,position),'consumed');g.output(packActors(g,nextActors),'nextActors');g.output(g.cat(combo),'nextCombo');g.output(g.cat(nextContext),'nextContext');g.output(damage,'damage');g.output(g.cast(active,'float32'),'active');g.output(g.cast(critical,'float32'),'critical');g.output(g.cast(dodge,'float32'),'dodged');g.output(g.cast(guard,'float32'),'guarded');g.output(g.cast(hit,'float32'),'accuracyPassed');g.output(g.cast(recovered,'float32'),'recovered');
  return g;
}

const deathFields=['attackRank','defenseRank','agilityRank','blind','sleep','confusion','paralysis','skip','defend','acrobat','doubleDodge','doubleGuard','hpRegen','hpDuration','hpRecovery','mpRegen','mpDuration','mpRecovery','poison'];
function clearOnDeath(g,actor,dead){const result={...actor};for(const key of deathFields)result[key]=g.where(dead,0,actor[key]);return result;}

export function buildVitalModel(){
  const g=new Graph('rom-vital-effect',{
    sources:SOURCES,actorFields:ACTOR_FIELDS,
    scope:'Already-resolved HP damage, HP recovery, MP recovery or MP spend operation. Amount generation, action accuracy, costs/items and death presentation are caller phases.',
    sourceScope:'The live-target guard is the PoC caller contract. ROM heal/spend helpers themselves do not reject dead actors; this API deliberately exposes ordinary living-target effects and excludes resurrection.',
    operation:'1=HP damage, 2=HP recovery, 3=MP recovery, 4=MP spend; nonnegative integer amount 0..32767. Target must be alive for healing; this is not resurrection.',
    bounds:'Actor vitals 0..32767, current<=maximum. actorIndex 0 or 1.',
    terminal:'A dead target makes this API an identity, including no implicit resurrection.',
    feedback:{actors:'nextActors'},defaults:{actors:EXAMPLE_ACTORS,actorIndex:0,operation:2,amount:30},labels:{actors:'2人分の状態',actorIndex:'対象の配列番号',operation:'1ダメージ / 2HP回復 / 3MP回復 / 4MP消費',amount:'確定した効果量'}
  });
  const actors=actorObjects(g,g.input('actors',['N',ACTOR_FIELDS.length*2])),which=g.input('actorIndex'),operation=g.input('operation'),amount=g.input('amount');
  const first=g.eq(which,0),target={};for(const key of ACTOR_FIELDS)target[key]=g.where(first,actors[0][key],actors[1][key]);
  const active=g.gt(target.hp,0),damage=g.and(active,g.eq(operation,1)),heal=g.and(active,g.eq(operation,2)),mpHeal=g.and(active,g.eq(operation,3)),mpSpend=g.and(active,g.eq(operation,4));
  const newHP=g.where(damage,g.max(g.sub(target.hp,amount),0),g.where(heal,g.min(g.add(target.hp,amount),target.maxHp),target.hp));
  const newMP=g.where(mpSpend,g.max(g.sub(target.mp,amount),0),g.where(mpHeal,g.min(g.add(target.mp,amount),target.maxMp),target.mp));
  const dead=g.and(damage,g.le(newHP,0)),next=clearOnDeath(g,{...target,hp:newHP,mp:newMP},dead),nextActors=[{},{}];
  for(const key of ACTOR_FIELDS){nextActors[0][key]=g.where(first,next[key],actors[0][key]);nextActors[1][key]=g.where(first,actors[1][key],next[key]);}
  const deltaHP=g.sub(newHP,target.hp),deltaMP=g.sub(newMP,target.mp);
  g.output(packActors(g,nextActors),'nextActors');g.output(deltaHP,'deltaHP');g.output(deltaMP,'deltaMP');g.output(g.cast(dead,'float32'),'died');g.output(g.cast(active,'float32'),'active');
  tagExact(g,0,'All represented vitals/amounts are integers <=32767. Sums/differences <=65534 and predicate selections are exact binary32.');return g;
}

export function buildTurnTailModel(){
  const g=new Graph('rom-turn-tail2',{
    sources:SOURCES,actorFields:ACTOR_FIELDS,
    scope:'End-of-turn phase for one party actor followed by one enemy: defend reset, party HP regen, party/enemy MP regen, lethal poison, shared status roll, MP/HP regen expiration in source order, terminal outcome and turn count.',
    supported:'Only HP/MP regen and damaging poison are end-of-turn statuses. actorFields.poison means severe poison: status14 bit1 set and subtype22 low2==2, not the general poison bit alone. Regen counters are duration bytes 0..255 and recovery 0..4. No magic/breath immunity, coup, defend MP equipment or omitted status fields may be active. Other actorFields pass through except death clear.',
    sourceOrder:'Periodic HP/MP changes precede poison; alive status rows are collected after periodic changes; shared roll is consumed even if no regen status exists; independent MP then HP rolls are consumed even in the fixed-duration stage.',
    thresholdProof:'Comparing F(roll/100) against [1,.875,.75,.625] for integer roll 0..99 is exactly equivalent to roll < [100,87.5,75,62.5]. No inexact GPU division is needed.',
    bounds:'actors[0] is party and actors[1] enemy; actor IDs are passed through unchanged. Vitals0..32767; level0..99; position1..4990. turn/maxTurns int32 positive and <=1000; outcome0 ongoing,1 won,2 lost.',
    terminal:'API wrapper skips the phase and freezes state/RNG after outcome or turn limit. For active phase, source turn count advances by one. maxTurns is a PoC execution bound, not a ROM combat rule.',
    feedback:{seed:'nextSeed',position:'nextPosition',actors:'nextActors',turn:'nextTurn',outcome:'nextOutcome'},
    defaults:{seed:[1,0,0,0,0,0,0,0],position:1,actors:EXAMPLE_ACTORS,turn:1,maxTurns:32,outcome:0},labels:{actors:'味方1人＋敵1体の状態',turn:'現在ターン',maxTurns:'PoC最大ターン',outcome:'0続行 / 1勝利 / 2敗北'}
  });
  const seed=g.input('seed',['N',8]),position=g.input('position',['N',1],'int32'),actors=actorObjects(g,g.input('actors',['N',ACTOR_FIELDS.length*2])),turn=g.input('turn',['N',1],'int32'),maxTurns=g.input('maxTurns',['N',1],'int32'),outcome=g.input('outcome');
  const active=g.and(g.eq(outcome,0),g.le(turn,maxTurns)),rng=new RandomGraph(g,seed,position);
  const nextActors=actors.map(a=>({...a}));
  for(let i=0;i<2;i++){
    const a=nextActors[i],alive=g.and(active,g.gt(a.hp,0));a.defend=g.where(alive,0,a.defend);
    if(i===0){const hpAmount=g.add(g.mul(a.hpEquipmentRegen,25),g.where(g.gt(a.hpRegen,0),g.max(10,g.floor(g.mul(a.level,.5))),0));a.hp=g.where(alive,g.min(g.add(a.hp,hpAmount),a.maxHp),a.hp);}
    // floor(level/10) for 0..99 is exact via a tiny threshold table, avoiding
    // f32 0.1 rounding at integer boundaries in a generic optimizer.
    if(i===0){let decade=g.constant(0);for(let d=1;d<=9;d++)decade=g.where(g.ge(a.level,10*d),d,decade);const amount=g.where(g.gt(a.mpRegen,0),g.max(3,decade),0);a.mp=g.where(alive,g.min(g.add(a.mp,amount),a.maxMp),a.mp);}
    else {const mpAmount=g.where(g.gt(a.mpRegen,0),g.max(3,a.level),0);a.mp=g.where(alive,g.min(g.add(a.mp,mpAmount),a.maxMp),a.mp);}
    const poison=g.and(alive,g.gt(a.poison,0)),poisonAmount=g.min(g.max(g.floor(g.mul(a.maxHp,1/16)),1),999);
    a.hp=g.where(poison,g.max(g.sub(a.hp,poisonAmount),0),a.hp);
    nextActors[i]=clearOnDeath(g,a,g.and(poison,g.le(a.hp,0)));
  }
  rng.raw(active); // Shared bounded(100) roll: value unused by this status subset.
  for(const a of nextActors){
    const alive=g.and(active,g.gt(a.hp,0));
    for(const prefix of ['mp','hp']){
      const flag=prefix+'Regen',duration=prefix+'Duration',recovery=prefix+'Recovery';
      const present=g.and(alive,g.gt(a[flag],0)),roll=rng.bounded(present,100),recovering=g.gt(a[recovery],0),newRecovery=g.max(g.sub(a[recovery],1),0);
      const cleared=g.and(present,recovering,g.lt(roll,lookup(g,newRecovery,[100,87.5,75,62.5])));
      const ticking=g.and(present,g.not(recovering),g.gt(a[duration],0)),newDuration=g.max(g.sub(a[duration],1),0);
      a[flag]=g.where(cleared,0,a[flag]);a[duration]=g.where(cleared,0,g.where(ticking,newDuration,a[duration]));
      a[recovery]=g.where(cleared,0,g.where(g.and(present,recovering),newRecovery,g.where(g.and(ticking,g.eq(newDuration,0)),4,a[recovery])));
    }
  }
  const nextOutcome=g.where(active,g.where(g.le(nextActors[0].hp,0),2,g.where(g.le(nextActors[1].hp,0),1,0)),outcome),nextTurn=g.add(turn,g.cast(active,'int32'));
  g.output(rng.seed,'nextSeed');g.output(rng.position,'nextPosition');g.output(g.sub(rng.position,position),'consumed');g.output(packActors(g,nextActors),'nextActors');g.output(nextTurn,'nextTurn');g.output(nextOutcome,'nextOutcome');g.output(g.cast(g.or(g.gt(nextOutcome,0),g.gt(nextTurn,maxTurns)),'float32'),'finished');g.output(g.cast(active,'float32'),'active');
  return g;
}
