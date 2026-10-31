// Operation2 is not a damage-to-opponent kernel. A small self-target caller
// shares ROM row lookup/RNG/state ABI without cloning the physical pipeline.
import {Graph} from '../graph-builder.mjs';
import {RandomGraph} from '../transition-graphs.mjs';
import {ACTOR_FIELDS} from '../rules.mjs';
import {BOSS_STATUS_FIELDS,decodeBossActionRule,bossRuleColumns} from '../boss-action-rules.mjs';
import {buildIncapacityActionCore} from './build-incapacity-action.mjs';
import {enemyPackedDamage} from './build-packed-damage.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
export const SELF_HEAL_IDS=[30,587];
export const SELF_HEAL_RULES=SELF_HEAL_IDS.map(id=>{
  const a=rom.actions.find(r=>r.id===id),b=Buffer.from(a.raw,'hex'),r={...decodeBossActionRule(id),damageId:a.damageId,damageCap:b.readUInt32LE(28)&0x3fff,selector:a.selector,repeatCode:b.readUInt32LE(28)>>>14&31};
  if(r.operation!==2||r.selector!==0||r.repeatCode!==0||r.preCritical!==0||r.additional!==0||r.damageElement!==0||r.dodge||r.guard||r.blind||r.defend||r.recover||r.combo)throw Error('Unrepresented self-heal record '+id);
  return r;
});
export function buildSelfHealAction(){
  const c=structuredClone(buildIncapacityActionCore().contract);
  const g=new Graph('rom-self-heal-action-core2',{
    ...c,actionRules:SELF_HEAL_RULES,inputDomains:{...c.inputDomains,actionId:{values:SELF_HEAL_IDS},sourceIndex:{values:[1]}},
    defaults:{...c.defaults,actionId:30,sourceIndex:1},
    scope:'Enemy self-target192 actions30 and587 only, one live eligible existing source/target, initially successful event allocation, enough finite MP or enemy MP255. No reflection/tension, magic critical, heal amplification, suppression or equipment callbacks. Source must have no sleep/paralysis/confusion/skip. Other actor is preserved; no primary, post-action, enclosing turn, camera or party-heal claim.',
    scopeJa:'敵の自己回復ホイミ・めいそうをROM表から計算します。HP上限でも乱数を消費し、MP255の敵無料条件を保持します。',
    authority:[
      {file:'src/Combat/Overlay_24/func_ov024_021eb5d0.cpp',address:'JPN021ebd9c',rule:'One target-collection phase; shared, critical, accuracy, packed damage, positive-amount weapon callback in caller order.'},
      {file:'src/Combat/Overlay_24/func_ov024_021db3a4.cpp',address:'JPN021dbc50',rule:'Operation2 calls HP recovery and returns an event even when clamped recovery is0.'},
      {file:'src/Combat/Overlay_0/func_ov000_0215a16c.cpp',address:'JPN0215b8ec',rule:'HP min(old+amount,max), actual healed difference.'},
      {evidence:'evidence-v2/ghidra/heal-defined/response.json',rule:'Actual ROM decompile and instructions,8 successful queries.'}
    ],
    targetContract:'sourceIndex1 means enemy192 acting on itself, not the opposing party. No target is inferred from expected output. Host routing must choose this self-target component only for an actual planned self target.',
    phaseContract:'Each supported active call consumes seven RNG draws: repeat materialization2, shared1, critical1, accuracy1, packed1 (even width0), weapon1. A full-HP result still has positive internal amount and a nonnull event, so weapon is not gated by actual HP delta. Action30 cost2,587 cost5; MP255 is not spent.',
    stateEncoding:'Same decoded state ABI as the33-record action core. HP and MP of actor1 change; combo reset preserves target field, context advances once. All actor0/aux/status/wake/preparation fields remain as input. No arbitrary raw event-buffer bytes or presentation counters are represented.',
    currentStatsProjection:undefined,repeatedActionExclusion:undefined,
    proofStatus:'Separate new component. Must be checked against actual self-target fullcaller executions before encounter integration.'
  });
  const seed=g.input('seed',['N',8]),position=g.input('position',['N',1],'int32'),actors=g.input('actors',['N',66]),aux=g.input('aux',['N',35]),config=g.input('config',['N',7]),comboInput=g.input('combo',['N',6]),contextInput=g.input('context',['N',2]),sourceIndex=g.input('sourceIndex'),enabled=g.input('enabled',['N',1],'bool'),actionId=g.input('actionId'),resistance=g.input('resistances',['N',5]),status=g.input('status',['N',14]),wake=g.input('wakeSkip',['N',2]),preparation=g.input('preparationState',['N',10]);
  // config/resistance are intentionally preserved public ABI inputs; none can
  // change element0 healing under this explicit no-amplification contract.
  void config;void resistance;
  const a=g.split(actors,66),get=(i,k)=>a[i*33+ACTOR_FIELDS.indexOf(k)],rule=bossRuleColumns(g,actionId,SELF_HEAL_RULES);
  const supported=g.and(g.eq(sourceIndex,1),g.or(...SELF_HEAL_IDS.map(id=>g.eq(actionId,id))),g.eq(get(1,'criticalThreshold'),0),...['sleep','paralysis','confusion','skip'].map(k=>g.eq(get(1,k),0)),g.or(g.ge(get(1,'mp'),255),g.ge(get(1,'mp'),rule.mpCost)));
  const active=g.and(enabled,supported,g.gt(get(1,'hp'),0)),rng=new RandomGraph(g,seed,position);
  rng.raw(active);rng.raw(active); // actual repeat-table materialization
  rng.bounded(active,100); // shared loop roll
  rng.bounded(active,10000); // enemy critical threshold0 still draws
  rng.bounded(active,100); // primary accuracy consumes even mode3
  const packed=enemyPackedDamage(g,rng,rule.damageId,active),amount=g.where(active,g.min(packed.damage,rule.damageCap),0);
  const healed=g.where(active,g.min(amount,g.sub(get(1,'maxHp'),get(1,'hp'))),0);
  a[33+ACTOR_FIELDS.indexOf('hp')]=g.add(get(1,'hp'),healed);
  a[33+ACTOR_FIELDS.indexOf('mp')]=g.where(g.and(active,g.lt(get(1,'mp'),255)),g.sub(get(1,'mp'),rule.mpCost),get(1,'mp'));
  rng.raw(g.and(active,g.gt(amount,0))); // positive event amount, not healed delta
  const oldCombo=g.split(comboInput,6),combo=oldCombo.map((v,i)=>i===3?v:g.where(active,0,v)),context=g.split(contextInput,2),low=g.add(context[0],g.cast(active,'float32')),carry=g.floor(g.mul(low,1/65536)),high=g.add(context[1],carry),nextContext=g.cat([g.sub(low,g.mul(carry,65536)),g.sub(high,g.mul(g.floor(g.mul(high,1/65536)),65536))]);
  const zero=g.mul(amount,0),out={nextSeed:rng.seed,nextPosition:rng.position,nextActors:g.cat(a),nextAux:aux,nextStatus:status,nextWakeSkip:wake,nextCombo:g.cat(combo),nextContext,nextPreparationState:preparation,comboSide:combo[0],comboCount:combo[1],comboAction:combo[2],comboTarget:combo[3],damage:zero,internalDamage:amount,recoveryAmount:amount,healed,consumed:g.sub(rng.position,position),active:g.cast(active,'float32'),supported:g.cast(supported,'float32'),critical:zero,accuracyPassed:g.cast(active,'float32'),effectApplied:g.cast(g.and(active,g.gt(healed,0)),'float32'),poisoned:zero,charged:zero,angerActivated:zero};
  for(const[name,value]of Object.entries(out))g.output(value,name);return g;
}
async function main(){
  const old=await readFile(new URL('rom-incapacity-action-core2.onnx',dir)),g=buildSelfHealAction(),bytes=g.model();
  const report={schema:'dq9-self-heal-action-model-v1',name:g.name,sha256:hash(bytes),bytes:bytes.length,nodes:g.nodes.length,actionIds:SELF_HEAL_IDS,immutable33Sha256:hash(old),proofStatus:'Pending actual-ROM self-target fullcaller comparisons.'};
  for(const[file,value]of[[g.name+'.onnx',bytes],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n'],['self-heal-action-model.json',JSON.stringify(report,null,2)+'\n']]){await writeFile(new URL(file+'.tmp',dir),value);await rename(new URL(file+'.tmp',dir),new URL(file,dir));}
  console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]===fileURLToPath(import.meta.url))await main();
