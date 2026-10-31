import {writeFile} from 'node:fs/promises';
import {Graph} from './graph-builder.mjs';
import {RandomGraph} from './transition-graphs.mjs';
import {coupDamageBonus,coupLevelDuration,coupEligibility,angerCheck,advanceAnger,coupTailTick} from './lifecycle-rules.mjs';
export const LIFECYCLE_FIELDS=['coupReady','coupDuration','coupSkip','anger','angerDuration','angerRecovery','angerTarget'];
export function buildLifecycleGraph(){
  const g=new Graph('rom-lifecycle-rules',{
    scopeJa:'ROM命令を実行した728例と直接照合した必殺・怒りの共通規則。統合行動グラフでも同じ規則を使用。',defaultSteps:1,
    scope:'Shared exact decoded-field helpers used inside rom-normal-action2 and rom-battle-step2; directly compared with actual ARM p-code fixtures.',
    operations:{0:'damage coup bonus',1:'coup eligibility and skip-byte reset',2:'set level-based coup duration',3:'anger check',4:'post-action anger expiry',5:'turn-end coup expiry',6:'one-party charged count'},
    stateFields:LIFECYCLE_FIELDS,
    bounds:'damage integer-1..131070,maxHP1..65535,level0..99,coupReady/anger0or1,coupDuration0..15,coupSkip0..255,angerDuration0..255,recovery0..4,angerTarget signed16; chance0..127,minimum/maximum0..255 (reversed allowed); operation0..6.',
    allowed:'For eligibility, entity exists and is a party member. For anger check, entity has a monster record and sourceId is0..3. For expiry, entity exists/alive. For one-party count, entity is alive and not excluded. False gates state and RNG.',
    blocked:'Predecoded status14 has any of bits0,3,4,5,19 (death/paralysis/sleep/confusion/skip). In a coherent battle state, death agrees with HP0. The actual helper tests the status bits, so this small graph does not substitute HP for those bits.',
    targetValid:'For post-action anger: stored target resolves to an existing, alive, non-excluded actor. The target id is preserved when anger expires.',
    rng:'Current LCG state; post-action anger and end-coup helpers include their otherwise unconditional shared100 draw. Anger check consumes its roll before eligibility and duration only when eligible; nonpositive duration width consumes no second draw.',
    feedback:{seed:'nextSeed',position:'nextPosition',state:'nextState'},
    defaults:{seed:[1,0,0,0,0,0,0,0],position:1,state:[0,0,0,0,0,0,0],operation:3,damage:9,maxHp:89,level:15,allowed:true,blocked:false,chance:0,minimum:2,maximum:4,sourceId:0,targetValid:true},
    labels:{state:'必殺/怒り（stateFields順）',operation:'0被ダメ必殺率/1資格/2期間/3怒り/4行動後/5ターン末/6発動数',allowed:'対象が存在し当該処理の対象か',blocked:'状態mask0x80039による禁止',targetValid:'怒り対象が存在・生存・除外なし'}
  });
  const seed=g.input('seed',['N',8]),position=g.input('position',['N',1],'int32'),state=g.input('state',['N',7]),operation=g.input('operation'),damage=g.input('damage'),maxHp=g.input('maxHp'),level=g.input('level'),allowed=g.input('allowed',['N',1],'bool'),blocked=g.input('blocked',['N',1],'bool'),chance=g.input('chance'),minimum=g.input('minimum'),maximum=g.input('maximum'),sourceId=g.input('sourceId'),targetValid=g.input('targetValid',['N',1],'bool');
  const stateColumns=g.split(state,7),original=Object.fromEntries(LIFECYCLE_FIELDS.map((k,i)=>[k,stateColumns[i]]));
  let aux={...original};const rng=new RandomGraph(g,seed,position),op=n=>g.and(allowed,g.eq(operation,n));
  const eligibility=coupEligibility(g,{gate:op(1),skip:aux.coupSkip,level,blocked,ready:aux.coupReady});aux.coupSkip=eligibility.skip;
  aux.coupDuration=g.where(op(2),coupLevelDuration(g,level),aux.coupDuration);
  const check=angerCheck(g,rng,aux,{gate:op(3),blocked,chance,minimum,maximum,sourceId});aux=check.aux;
  const shared=rng.bounded(g.or(op(4),op(5)),100);aux=advanceAnger(g,aux,{enabled:op(4),targetValid,sharedRoll:shared});
  const tail=coupTailTick(g,{ready:aux.coupReady,duration:aux.coupDuration,enabled:op(5)});aux.coupReady=tail.ready;aux.coupDuration=tail.duration;
  const result=g.where(g.eq(operation,0),coupDamageBonus(g,damage,maxHp),g.where(g.eq(operation,1),g.cast(eligibility.eligible,'float32'),g.where(g.eq(operation,3),g.cast(check.activated,'float32'),g.where(g.eq(operation,6),g.where(allowed,original.coupReady,0),0))));
  for(const [name,value]of Object.entries({nextSeed:rng.seed,nextPosition:rng.position,nextState:g.cat(LIFECYCLE_FIELDS.map(k=>aux[k])),result,consumed:g.sub(rng.position,position)}))g.output(value,name);
  return g;
}
const report=await buildLifecycleGraph().save();await writeFile(new URL('lifecycle-models.json',import.meta.url),JSON.stringify([report],null,2)+'\n');console.log(JSON.stringify({name:report.name,nodes:report.nodes,bytes:report.bytes},null,2));
