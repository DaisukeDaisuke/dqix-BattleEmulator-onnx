// Three new original records, kept separate from every frozen action family.
// All numerical state/RNG work stays in ONNX. Source and actual caller traces
// determine operation order; the unchanged C++ emulator is a separate oracle.
import {Graph,physical} from '../graph-builder.mjs';
import {RandomGraph,buffStat} from '../transition-graphs.mjs';
import {ACTOR_FIELDS} from '../rules.mjs';
import {BOSS_STATUS_FIELDS,decodeBossActionRule} from '../boss-action-rules.mjs';
import {buildBossActionCore} from '../build-boss-action.mjs';
import {buildRomColumnActionCore} from './build-shared-action.mjs';
import {createTensionDamageHooks} from './build-tension-actions.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const dir=new URL('./',import.meta.url),F=Math.fround,hash=x=>createHash('sha256').update(x).digest('hex');
const pack=(g,actors)=>g.cat(actors.flatMap(a=>ACTOR_FIELDS.map(k=>a[k])));
const record=id=>{const a=rom.actions.find(r=>r.id===id),b=Buffer.from(a.raw,'hex');return{...decodeBossActionRule(id),damageId:a.damageId,damageCap:b.readUInt32LE(28)&0x3fff,selector:a.selector,effectElement:a.w18>>>27&31};};
export const MONSTER320_COMPONENT_IDS=[558,563,583];
export const MONSTER320_COMPONENT_RULES=MONSTER320_COMPONENT_IDS.map(record);
const authority={
  sourceDirectory:'restored/dqix-decomp-decomp-matching/src/Combat',
  actual:'evidence-v2/ghidra/emulation-monster320-components-probe-v2-run/response.json',
  static:'evidence-v2/ghidra/monster320-components-defined/response.json',
  caller:'JPN021ebd9c / USA021eb5d0',
  operation26:'JPN021de808 / USA021ddf5c',operation8:'JPN021dc630 / USA021dbd84',
  selector63:'JPN021dab08 / USA021da248',sleepSetter:'USA02088338',
  mpRule:'Enemy currentMP>=255 disables payment; cost255 with currentMP1..254 spends the entire initial currentMP. MP0 invokes replacement504 and is a separate unsupported control at this component boundary.'
};
async function commonContract(ids){
  const c=structuredClone(JSON.parse(await readFile(new URL('rom-weapon-tension-action-core2.json',dir),'utf8')).contract);
  for(const k of ['weaponFields','equipmentAuthority','elementResistanceLayout','originalDifference'])delete c[k];
  delete c.fieldDomains.weapon;delete c.inputDomains.elementResistances;delete c.defaults.weapon;delete c.defaults.elementResistances;
  c.inputDomains.actionId={values:ids};c.inputDomains.sourceIndex={values:[1]};
  c.defaults.actionId=ids[0];c.defaults.sourceIndex=1;
  c.actionRules=ids.map(record);c.authority=authority;
  c.support='Enemy source192, one declared existing target, successful event allocation, both objects present. Source must be alive and free of sleep/paralysis/confusion/skip and appealMode. No metal, force, reflection, counter, barriers, ailment immunity/equipment callbacks or missing records. This decoded ABI does not represent every raw status or event-memory byte.';
  c.extensionStatus='Separate new record components. No old kernel, whole encounter, GPU runtime, or published artifact is changed. Actual caller and initial-state whole-program proofs are separate.';
  return c;
}

// Present-enemy selector63. The two range operations must remain ordered and
// retain each original f32 multiplication. Fallback is computed by the caller
// first even though this selector does not use it in its result.
export function magicBurstSelector(g,rng,level,enabled){
  const a=rng.range(enabled,F(.9),F(1)),byLevel=g.mul(g.mul(6,level),a);
  const b=rng.range(enabled,F(.9),F(1.1)),minimum=g.mul(160,b);
  return g.where(enabled,g.floor(g.max(byLevel,minimum)),0);
}
export function buildMagicBurstSelector(){
  const g=new Graph('rom-magicburst-selector63',{
    scope:'Actual selector63 present-enemy auxiliary-level branch. Two ordered FloatBetween draws, max(F(F(6*level)*A),F(160*B)), then signed truncation. Nonnegative level0..127 makes Floor identical. No caller physical fallback, MP consumption, critical, resistance, target or HP effect is included.',
    scopeJa:'マダンテの敵レベル参照selectorを、2回の乱数と実ROMの単精度演算順で計算します。',
    authority,inputDomains:{seed:{min:0,max:255,integer:true,width:8},position:{min:1,max:4990,integer:true},resolvedLevel:{min:0,max:127,integer:true},enabled:{values:[false,true,0,1]}},
    defaults:{seed:[1,0,0,0,0,0,0,0],position:1,resolvedLevel:30,enabled:true},feedback:{seed:'nextSeed',position:'nextPosition'}
  });
  const seed=g.input('seed',['N',8]),position=g.input('position',['N',1],'int32'),level=g.input('resolvedLevel'),enabled=g.input('enabled',['N',1],'bool'),rng=new RandomGraph(g,seed,position),damage=magicBurstSelector(g,rng,level,enabled);
  for(const[k,v]of Object.entries({damage,nextSeed:rng.seed,nextPosition:rng.position,consumed:g.sub(rng.position,position)}))g.output(v,k);
  return g;
}

export async function buildMpFullAction(){
  const c=await commonContract([558]),rule=record(558);
  if(rule.operation!==26||rule.selector||rule.damageId||rule.mpCost||rule.preCritical||rule.dodge||rule.guard||rule.blind||rule.defend||rule.combo||rule.recover||rule.accuracyMode!==3)throw Error('Unrepresented original558 record');
  const g=new Graph('rom-mpfull-action-core2',{
    ...c,scope:'Original558 enemy self-target192 only. Repeat2/shared/critical/accuracy precede real self physical0/1/2 draws and its zero-damage bounded2 branch. Operation26 then restores MP using target.maxMP and clamps to max; positive internal amount plus a nonnull event controls the weapon draw even if MP was already full. Tension remains unchanged because the action lacks the tension-use flag. Primary/post/turn/camera and arbitrary operation26 records are outside.',
    scopeJa:'敵のMP全回復を自己対象として処理します。MP満タンでも実際の内部物理計算と条件付き武器処理の乱数を保持します。',
    targetContract:'The selected command must resolve source192 to target192. This is not an opponent-target kernel. Both input MP bounds and MP<=max relation remain enforced.',
    mpBehavior:'nextMP=min(initialMP+maxMP,maxMP), which equals maxMP under the declared nonnegative bounded inputs. Effect message success includes enemy nextMP>=255 even when the numerical delta is0.',
    stateProjection:'Only represented enemyMP, combo reset preserving target, context counter and RNG can change. The source poison/primary/aux/preparation/tension fields and all party fields are preserved.'
  });
  const x={};for(const[name,width,dtype]of [['seed',8,'float32'],['position',1,'int32'],['actors',66,'float32'],['aux',35,'float32'],['config',7,'float32'],['combo',6,'float32'],['context',2,'float32'],['sourceIndex',1,'float32'],['enabled',1,'bool'],['actionId',1,'float32'],['resistances',5,'float32'],['status',14,'float32'],['wakeSkip',2,'float32'],['preparationState',10,'float32'],['tension',6,'float32']])x[name]=g.input(name,['N',width],dtype);
  const a=g.split(x.actors,66),prep=g.split(x.preparationState,10),get=k=>a[33+ACTOR_FIELDS.indexOf(k)],supported=g.and(g.eq(x.sourceIndex,1),g.eq(x.actionId,558),g.eq(get('criticalThreshold'),0),g.eq(prep[5],0),...['sleep','paralysis','confusion','skip'].map(k=>g.eq(get(k),0))),active=g.and(x.enabled,supported,g.gt(get('hp'),0)),rng=new RandomGraph(g,x.seed,x.position);
  rng.raw(active);rng.raw(active);rng.bounded(active,100);rng.bounded(active,10000);rng.bounded(active,100);
  const p=physical(g,rng.seed,rng.position,get('baseAttack'),buffStat(g,get('baseDefense'),get('defenseRank'),'defense',true,get('party')),active);rng.seed=p.seed;rng.position=p.position;
  const zero=g.and(active,g.le(p.damage,0)),internal=g.where(active,g.where(zero,rng.bounded(zero,2),p.damage),0),oldMp=get('mp'),newMp=g.where(active,g.min(g.add(oldMp,get('maxMp')),get('maxMp')),oldMp),restored=g.sub(newMp,oldMp);
  a[33+ACTOR_FIELDS.indexOf('mp')]=newMp;
  rng.raw(g.and(active,g.gt(internal,0)));
  const combo=g.split(x.combo,6).map((v,i)=>i===3?v:g.where(active,0,v)),context=g.split(x.context,2),low=g.add(context[0],g.cast(active,'float32')),carry=g.floor(g.mul(low,1/65536)),high=g.add(context[1],carry),nextContext=g.cat([g.sub(low,g.mul(carry,65536)),g.sub(high,g.mul(g.floor(g.mul(high,1/65536)),65536))]),z=g.mul(internal,0);
  const out={nextSeed:rng.seed,nextPosition:rng.position,nextActors:g.cat(a),nextAux:x.aux,nextStatus:x.status,nextWakeSkip:x.wakeSkip,nextCombo:g.cat(combo),nextContext,nextPreparationState:x.preparationState,nextTension:x.tension,comboSide:combo[0],comboCount:combo[1],comboAction:combo[2],comboTarget:combo[3],damage:z,internalDamage:internal,recoveryAmount:g.where(active,get('maxMp'),0),mpRecovered:restored,consumed:g.sub(rng.position,x.position),active:g.cast(active,'float32'),supported:g.cast(supported,'float32'),critical:z,accuracyPassed:g.cast(active,'float32'),effectApplied:g.cast(g.and(active,g.or(g.gt(restored,0),g.ge(newMp,255))),'float32'),poisoned:z,charged:z,angerActivated:z,tensionConsumed:z};
  for(const[k,v]of Object.entries(out))g.output(v,k);return g;
}

export async function buildHypnoticSleepAction(){
  const c=await commonContract([563]),rule=record(563);
  if(rule.operation!==8||rule.selector||rule.damageId||rule.preCritical||rule.mpCost||rule.dodge||rule.guard||rule.blind||rule.recover||rule.combo||rule.accuracyMode!==3)throw Error('Unrepresented original563 record');
  let prep,tension,applied;
  return buildBossActionCore({name:'rom-hypnotic-sleep-action-core2',actionIds:[563],actionRules:[rule],contract:{
    ...c,scope:'Original563 enemy to one existing live party target only. Shared precedes critical because preCritical=0; mode3 still consumes accuracy100 but ignores susceptibility. Real physical fallback/postprocessing precedes operation8. Target paralysis refuses the setter. Successful sleep resets duration1/recovery0, skip/skipKind/defend and ordinary tension/stage; existing confusion and its timers are preserved. Existing sleep may be reapplied. Target high tension is explicitly unsupported in this first component; raw eligibility rejects it but its caller side effects need their own proof.',
    scopeJa:'あやしいひとみの実行順と睡眠の再設定を処理します。混乱状態とそのカウンタを保持し、通常テンション・行動不能・防御を解除します。',
    resistanceContract:'The raw action accuracy mode3 ignores the supplied susceptibility byte. Element10 is kept in metadata for source identity; no percentage is inferred or computed by the host.',
    sleepAuthority:'USA0208830c rejects dead/paralysis/high. USA02088338 clears status14 bit0x800000, stage24, skip80000/word22 skipKind and defend21; it does not clear status14 confusion bit0x20 or its counters.'
  },additionalSupport(g,r,{sourceIndex}){
    prep=[...g.split(g.input('preparationState',['N',10]),10)];tension=[...g.split(g.input('tension',['N',6]),6)];
    return g.and(g.eq(sourceIndex,1),g.eq(prep[5],0),g.eq(tension[2],0));
  },targetEffect(g,r,hit,{sourceIndex,target,nextTarget}){
    applied=g.and(hit,g.eq(target.paralysis,0),g.gt(target.hp,0));
    const selected=g.and(applied,g.eq(sourceIndex,1));prep[2]=g.where(selected,0,prep[2]);tension[0]=g.where(selected,0,tension[0]);tension[1]=g.where(selected,0,tension[1]);
    return{applied,target:{sleep:g.where(applied,1,nextTarget.sleep),skip:g.where(applied,0,nextTarget.skip),defend:g.where(applied,0,nextTarget.defend)}};
  },extraOutputs(g,{source}){return{nextPreparationState:g.cat(prep),nextTension:g.cat(tension),tensionConsumed:g.mul(source.hp,0)};}});
}

export async function buildMagicBurstAction(){
  const c=await commonContract([583]),rule=record(583),hooks=createTensionDamageHooks();let prep;
  if(rule.operation!==1||rule.selector!==63||rule.damageId||rule.mpCost!==255||rule.preCritical!==1||rule.dodge||rule.guard||rule.blind||rule.recover||rule.combo||rule.damageCap!==2999||rule.accuracyMode!==2)throw Error('Unrepresented original583 record');
  return buildRomColumnActionCore({
    ...hooks,name:'rom-magicburst-action-core2',actionIds:[583],actionRules:[rule],checkMp:false,spendMp:false,
    contract:{...c,scope:'Original583 enemy to one existing live party target only. Real physical fallback is computed before selector63, whose two range draws replace that fallback; tension/critical/resistance/defend/postprocessing and raw2999 cap follow. EnemyMP1..254 is fully spent once; MP>=255 is exempt. MP0 replacement504 is unsupported and freezes this component. Source level0..127 is the original auxiliary helper value. Target high tension is outside this first component. No claim of party583, arbitrary MP-cost255 records, whole turns or camera.',
      scopeJa:'敵のマダンテをレベル参照2乱数式、テンション・耐性・防御・2999上限の順で処理し、MP全消費と敵MP255の無料条件を保持します。',
      mpContract:authority.mpRule,
      paymentProjection:'Payment precedes hit processing in actual ROM. Under this component no numerical branch after admission reads sourceMP, so its identical final mutation is written at the output boundary; no random draw or control decision is moved. Actual phase traces remain the authority.',
      selectorFormula:'trunc(max(F(F(6*level)*FloatBetween(.9,1)),F(160*FloatBetween(.9,1.1)))) after the already-computed physical fallback. Separate binary32 operations, no fused expression.',
      resistanceContract:'resistances[4] is the target raw damage-element8 byte. Other four susceptibility inputs do not affect this record.'
    },additionalSupport(g,r,p){prep=g.input('preparationState',['N',10]);const t=g.split(prep,10);return g.and(hooks.additionalSupport(g,r,p),g.eq(p.sourceIndex,1),g.eq(t[5],0),g.gt(p.source.mp,0));},
    transformBaseDamage(g,rng,r,hit,base,{source}){void base;return magicBurstSelector(g,rng,source.level,hit);},
    extraOutputs(g,p){const t=hooks.extraOutputs(g,p),old=p.before[1].mp;p.actors[1].mp=g.where(g.and(p.active,g.lt(old,255)),0,old);return{...t,nextActors:pack(g,p.actors),nextPreparationState:prep};}
  });
}

export async function writeMonster320Components(){
  const graphs=[buildMagicBurstSelector(),await buildMpFullAction(),await buildHypnoticSleepAction(),await buildMagicBurstAction()],models=[];
  for(const g of graphs){const b=g.model();auditModelBytes(b,{name:g.name});models.push({name:g.name,sha256:hash(b),bytes:b.length,nodes:g.nodes.length});for(const[f,v]of[[g.name+'.onnx',b],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n']]){await writeFile(new URL(f+'.tmp',dir),v);await rename(new URL(f+'.tmp',dir),new URL(f,dir));}}
  const report={schema:'dq9-monster320-components-v1',actionIds:MONSTER320_COMPONENT_IDS,models,authority,scope:'New components only. Independently compare each supported actual caller; unsupported MP0/target-high controls remain explicitly reported. No previous family/program artifact was regenerated.',proofStatus:'Pending actual comparisons.'};
  await writeFile(new URL('monster320-component-models.json.tmp',dir),JSON.stringify(report,null,2)+'\n');await rename(new URL('monster320-component-models.json.tmp',dir),new URL('monster320-component-models.json',dir));return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await writeMonster320Components(),null,2));
