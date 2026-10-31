// New explicit tension state around the shared original caller. Published
// action/encounter variants remain byte-identical when extension hooks are off.
import {Graph,physical} from '../graph-builder.mjs';
import {RandomGraph,buffStat} from '../transition-graphs.mjs';
import {ACTOR_FIELDS} from '../rules.mjs';
import {BOSS_STATUS_FIELDS,decodeBossActionRule} from '../boss-action-rules.mjs';
import {buildDispelActionCore} from './build-dispel-action.mjs';
import {readDispelMasks} from './build-dispel-mask.mjs';
import {TENSION_FIELDS,TENSION_AUTHORITY,tensionCoefficient,tensionBonus,raiseTension} from './build-tension-primitives.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
export const tensorContract={fieldDomains:TENSION_FIELDS.map(name=>({name,min:0,max:name.endsWith('stage')?4:1,integer:true})),default:Array(6).fill(0)};
export function tensionState(g){const x=g.split(g.input('tension',['N',6]),6);return[0,1].map(i=>({stage:x[i*3],low:x[i*3+1],high:x[i*3+2]}));}
export const packTension=(g,t)=>g.cat(t.flatMap(a=>[a.stage,a.low,a.high]));
const selectTension=(g,t,party)=>Object.fromEntries(['stage','low','high'].map(k=>[k,g.where(party,t[0][k],t[1][k])]));
const column=(g,id,values)=>g.op('Gather',[g.constant(values,'float32',[values.length]),g.cast(id,'int32')],{axis:0},{shape:['N',1]});
// A hit may consume tension only at its enclosing caller boundary. Repeated
// calls use deferConsumption=true and retain the same flags through every hit.
export function createTensionDamageHooks({deferConsumption=false}={}){
  let state,sourceTension,targetTension,applies,consumed;
  const getState=(g,party)=>{if(!state){state=tensionState(g);sourceTension=selectTension(g,state,party);targetTension=selectTension(g,[state[1],state[0]],party);}return state;};
  const records=new Map(rom.actions.map(a=>[a.id,a])),maxId=Math.max(...records.keys()),hasTension=Array.from({length:maxId+1},(_,i)=>Number(!!(records.get(i)?.w10&0x2000)));
  return{
    additionalSupport(g,r,{partySource}){getState(g,partySource);return g.or(g.eq(targetTension.high,0),g.eq(r.id,1));},
    preCriticalDamage(g,rng,r,hit,base,{source,partySource,active}){
      getState(g,partySource);applies=g.and(g.gt(column(g,r.id,hasTension),0),g.or(g.gt(sourceTension.low,0),g.gt(sourceTension.high,0)));consumed=g.and(active,applies);
      const boosted=g.add(g.mul(base,tensionCoefficient(g,sourceTension.stage,g.cast(g.not(partySource),'float32'))),tensionBonus(g,sourceTension.stage,source.level));
      return g.where(g.and(hit,applies),boosted,base);
    },
    // The original operation field is seven bits (word18 >> 5 & 127), already
    // decoded by bossRuleColumns. A two-bit mask aliases unrelated operations.
    beforeComboDamage(g,value,r){return g.where(g.and(g.gt(targetTension.high,0),g.eq(r.operation,1)),g.mul(value,.5),value);},
    extraOutputs(g,{actors,active,sourceIndex,rule,additionalTargetEffect,hit}){
      const applied=additionalTargetEffect?.applied??g.eq(0,1);
      for(let i=0;i<2;i++){
        const target=g.eq(sourceIndex,1-i),source=g.eq(sourceIndex,i),dead=g.and(active,g.le(actors[i].hp,0)),dispel=g.and(active,target,g.eq(rule.operation,49),applied),asleep=g.and(active,target,g.eq(rule.operation,8),hit,g.gt(actors[i].sleep,0)),skip=g.and(active,target,g.eq(rule.operation,10),applied);
        const clearAll=g.or(dead,dispel,...(deferConsumption?[]:[g.and(source,consumed)])),clearOrdinary=g.or(clearAll,asleep,skip);
        state[i].stage=g.where(clearOrdinary,0,state[i].stage);state[i].low=g.where(clearOrdinary,0,state[i].low);state[i].high=g.where(clearAll,0,state[i].high);
      }
      return{nextTension:packTension(g,state),tensionConsumed:g.cast(consumed,'float32')};
    }
  };
}
export function buildTensionActionCore(audit){
  const previous=buildDispelActionCore(audit).contract;
  return buildDispelActionCore(audit,{
    name:'rom-tension-action-core2',...createTensionDamageHooks(),contract:{
      ...previous,fieldDomains:{...previous.fieldDomains,tension:tensorContract.fieldDomains},defaults:{...previous.defaults,actionId:1,tension:tensorContract.default},feedback:{...previous.feedback,tension:'nextTension'},tensionFields:TENSION_FIELDS,
      scope:'New tension-state extension of the forty previously audited single-target records. A current source low/high flag enables the original action word10 bit0x2000 multiplier and level bonus before critical/resistance. Source tension is consumed after the whole single-hit caller, including a primary miss. Target high-tension damage-halving is represented for normal action1. Target high tension on other records is explicitly unsupported pending their immunity/caller proofs. Repeated actions/self-heal/self161 are separate modules.',
      scopeJa:'共通40行動にテンション状態を追加します。倍率・レベル加算・会心の順序と攻撃後の解除を処理し、通常攻撃では対象のスーパーハイテンションによる半減も扱います。',
      support:'Existing one-party/one-enemy alive source/target, source free of sleep/paralysis/confusion/skip, represented critical/rank/vital domains, enough MP or enemy255. No metal/counter/reflection/barrier, species/equipment callbacks or event-allocation failure. Target high flag is supported only for action1; all other existing restrictions remain.',
      excludedRawStatusMask:0,
      tensionAuthority:{...TENSION_AUTHORITY,caller:'JPN021ebd9c / USA021eb5d0',postprocess:'JPN021e7328 / USA021e6a90'},
      stateProjection:'tension is [partyStage,partyLow,partyHigh,enemyStage,enemyLow,enemyHigh]. Stage is0..4; low/high are the separate raw status14 bits23/24. Their consistency is not inferred from stage. Caller source level is the existing explicit current-job/enemy helper value, restricted to nonnegative signed-byte range. A target death clears all three fields; sleep/skip setter clears stage/ordinary flag; dispel clears all three. Other represented actor/aux/status/preparation fields preserve their existing meanings. The actor poison field is severe poison only (raw poison flag AND subtype2); ordinary poison flag is not in this decoded ABI. Raw poison-bit behavior for every subtype is covered by the separate raw raise primitive, not claimed by this decoded full-caller comparison.',
      rounding:'F32(base*coefficient)+integerLevelBonus, then critical max(F32(1.2*scaled),F32(signedBaseATK*range),originalBase), then the existing resistance/defend/zero branch. High target halving precedes combo/final floor/cap. Each non-exact binary32 site remains a separate ONNX node.',
      extensionStatus:'New separate component; forty old records still require zero-tension regression and new nonzero-tension actual-ROM comparisons. No new full encounter is implied.'
    }
  });
}
export function buildTensionSelfCore(audit){
  const c=buildDispelActionCore(audit).contract,rule=decodeBossActionRule(161);
  if(rule.operation!==15||rule.parameter!==1||rule.preCritical||rule.dodge||rule.guard||rule.blind||rule.defend||rule.combo||rule.recover||rule.mpCost||rule.accuracyMode!==3)throw Error('Unexpected original161 record');
  const g=new Graph('rom-tension-self-core2',{
    ...c,actionRules:[rule],inputDomains:{...c.inputDomains,actionId:{values:[161]},sourceIndex:{values:[1]}},fieldDomains:{...c.fieldDomains,tension:tensorContract.fieldDomains},defaults:{...c.defaults,actionId:161,sourceIndex:1,tension:tensorContract.default},feedback:{...c.feedback,tension:'nextTension'},tensionFields:TENSION_FIELDS,
    scope:'Enemy self-target192 action161 operation15 only, one live eligible source and successful event memory. It shares the exact decoded state ABI, but is a self-target caller, not opponent damage. Source high tension or stage4 still goes through caller RNG and does not raise. No party action161, arbitrary multi-stage action, primary/post/turn/camera claim.',
    scopeJa:'敵の「ためる」を自己対象の実行順で処理します。段階3だけ追加抽選し、上限でも行動本体の乱数消費を保持します。',
    excludedRawStatusMask:0,tensionAuthority:TENSION_AUTHORITY,
    phaseContract:'Gather repeat2 → shared100 → critical10000 → accuracy100 → self physical base0/1/2 draws and zero fallback if needed → eligible stage raise. The operation handler returns null, so there is no positive-internal weapon callback. At ordinary positive self physical base this is7 draws, plus1 only for stage3 raise. MPcost0. Full caller combo resets all fields except target; logical context advances once.',
    stateProjection:'Six explicit tension fields with stage0..4 and separate low/high flags. Existing severe-poison flag/subtype and target other statuses are preserved, except successful high setup clears the represented severe-poison flag/subtype. Ordinary poison flag is not represented in this decoded ABI; full raw poison-bit clearing across all subtypes is independently checked by rom-tension-raise-raw. No unrepresented raw176-byte or presentation/event-counter claim.',
    extensionStatus:'Separate component; original161 caller must be compared independently. Existing forty-action and published encounter artifacts are unchanged.'
  });
  const seed=g.input('seed',['N',8]),position=g.input('position',['N',1],'int32'),actorsInput=g.input('actors',['N',66]),aux=g.input('aux',['N',35]),config=g.input('config',['N',7]),comboInput=g.input('combo',['N',6]),contextInput=g.input('context',['N',2]),sourceIndex=g.input('sourceIndex'),enabled=g.input('enabled',['N',1],'bool'),actionId=g.input('actionId'),resistance=g.input('resistances',['N',5]),statusInput=g.input('status',['N',14]),wake=g.input('wakeSkip',['N',2]),preparation=g.input('preparationState',['N',10]),tension=tensionState(g);
  void config;void resistance;
  const a=g.split(actorsInput,66),status=g.split(statusInput,14),get=(i,k)=>a[i*33+ACTOR_FIELDS.indexOf(k)],poisonIndex=BOSS_STATUS_FIELDS.indexOf('a1_poisonKind');
  const supported=g.and(g.eq(sourceIndex,1),g.eq(actionId,161),g.eq(get(1,'criticalThreshold'),0),...['sleep','paralysis','confusion','skip'].map(k=>g.eq(get(1,k),0)),g.or(g.eq(get(1,'poison'),0),g.eq(status[poisonIndex],2))),active=g.and(enabled,supported,g.gt(get(1,'hp'),0)),rng=new RandomGraph(g,seed,position);
  rng.raw(active);rng.raw(active);rng.bounded(active,100);rng.bounded(active,10000);rng.bounded(active,100);
  const p=physical(g,rng.seed,rng.position,get(1,'baseAttack'),buffStat(g,get(1,'baseDefense'),get(1,'defenseRank'),'defense',true,get(1,'party')),active);rng.seed=p.seed;rng.position=p.position;
  const zero=g.and(active,g.le(p.damage,0)),internal=g.where(active,g.where(zero,rng.bounded(zero,2),p.damage),0);
  const canRaise=g.and(active,g.eq(tension[1].high,0),g.lt(tension[1].stage,4)),raised=raiseTension(g,rng,{...tension[1],poison:get(1,'poison'),poisonKind:status[poisonIndex],dead:g.cast(g.le(get(1,'hp'),0),'float32'),asleep:get(1,'sleep'),paralyzed:get(1,'paralysis'),skip:get(1,'skip')},canRaise);
  tension[1]={stage:raised.stage,low:raised.low,high:raised.high};a[33+ACTOR_FIELDS.indexOf('poison')]=raised.poison;status[poisonIndex]=raised.poisonKind;
  const combo=g.split(comboInput,6).map((x,i)=>i===3?x:g.where(active,0,x)),context=g.split(contextInput,2),low=g.add(context[0],g.cast(active,'float32')),carry=g.floor(g.mul(low,1/65536)),high=g.add(context[1],carry),nextContext=g.cat([g.sub(low,g.mul(carry,65536)),g.sub(high,g.mul(g.floor(g.mul(high,1/65536)),65536))]),z=g.mul(internal,0);
  const out={nextSeed:rng.seed,nextPosition:rng.position,nextActors:g.cat(a),nextAux:aux,nextStatus:g.cat(status),nextWakeSkip:wake,nextCombo:g.cat(combo),nextContext,nextPreparationState:preparation,nextTension:packTension(g,tension),comboSide:combo[0],comboCount:combo[1],comboAction:combo[2],comboTarget:combo[3],damage:z,internalDamage:internal,consumed:g.sub(rng.position,position),active:g.cast(active,'float32'),supported:g.cast(supported,'float32'),critical:z,accuracyPassed:g.cast(active,'float32'),effectApplied:g.cast(g.and(canRaise,g.gt(raised.result,0)),'float32'),poisoned:z,charged:z,angerActivated:z,tensionConsumed:z,raiseResult:raised.result};
  for(const[name,value]of Object.entries(out))g.output(value,name);return g;
}
async function main(){
  const audit=await readDispelMasks(),old=await readFile(new URL('rom-dispel-action-core2.onnx',dir));if(hash(old)!==hash(buildDispelActionCore(audit).model()))throw Error('Frozen40-action bytes changed');
  const models=[];
  for(const g of[buildTensionActionCore(audit),buildTensionSelfCore(audit)]){const bytes=g.model();models.push({name:g.name,sha256:hash(bytes),bytes:bytes.length,nodes:g.nodes.length});for(const[file,value]of[[g.name+'.onnx',bytes],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n']]){await writeFile(new URL(file+'.tmp',dir),value);await rename(new URL(file+'.tmp',dir),new URL(file,dir));}}
  const report={schema:'dq9-tension-actions-v1',models,immutable40Sha256:hash(old),immutable40RegeneratedEqual:true,tensionFields:TENSION_FIELDS,proofStatus:'New separate components; actual caller/zero-state regression evidence belongs to separate reports.'};
  await writeFile(new URL('tension-action-models.json.tmp',dir),JSON.stringify(report,null,2)+'\n');await rename(new URL('tension-action-models.json.tmp',dir),new URL('tension-action-models.json',dir));console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]===fileURLToPath(import.meta.url))await main();
