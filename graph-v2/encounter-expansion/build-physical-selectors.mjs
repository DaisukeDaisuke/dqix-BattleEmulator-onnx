// The ROM member-pointer table selects a small numeric function between base
// damage and common postprocessing. No learned approximation or boss copy.
import {Graph} from '../graph-builder.mjs';
import {RandomGraph} from '../transition-graphs.mjs';
import {decodeBossActionRule} from '../boss-action-rules.mjs';
import {buildRomColumnActionCore,SHARED_ACTION_IDS,SHARED_ACTION_RULES} from './build-shared-action.mjs';
import {buildPackedActionCore,PACKED_CALLER_IDS,PACKED_CALLER_RULES} from './build-packed-actions.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const F=Math.fround,directory=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
export const PHYSICAL_SELECTOR_IDS=[0,5,7,11,25,41];
export const SINGLE_PHYSICAL_ACTION_IDS=[244,249,309,550];
export const SELECTOR_AUTHORITY={
  table:'evidence-v2/ghidra/damage-selector-table67.json',tableAddress:'JPN021ff9c0',dispatcher:'JPN021dae1c',
  source:'src/Combat/Overlay_24/func_ov024_021da55c.cpp',
  selectors:{5:{jpn:'021d9428',usa:'021d8b68',rule:'trunc(f32(baseAttack * FloatBetween(.85,.95)))'},7:{jpn:'021d94ac',usa:'021d8bec',rule:'trunc(f32(fallback *1.25))'},11:{jpn:'021d9594',usa:'021d8cd4',rule:'trunc(f32(.5 *fallback))'},25:{jpn:'021d98b8',usa:'021d8ff8',rule:'trunc(f32(fallback *1.2))'},41:{jpn:'021d9c9c',usa:'021d93dc',rule:'trunc(f32(f32(2.5 *resolvedLevel) * FloatBetween(.9,1.1)))'}},
  order:'Actual JPN021ebd9c computes GetAttackBaseDamage first, invokes the selector through the67-entry member-pointer table, then invokes common postprocessing. Selector5/41 add one draw even though their result replaces the already calculated fallback.',
};
export function physicalSelectorDamage(g,rng,selector,fallback,baseAttack,resolvedLevel,enabled){
  const byAttack=g.eq(selector,5),byLevel=g.eq(selector,41),needsRandom=g.or(byAttack,byLevel);
  const range=rng.range(g.and(enabled,needsRandom),g.where(byAttack,F(.85),F(.9)),g.where(byAttack,F(.95),F(1.1)));
  const multiplier=g.where(g.eq(selector,7),F(1.25),g.where(g.eq(selector,11),F(.5),g.where(g.eq(selector,25),F(1.2),1)));
  const scaled=g.floor(g.mul(fallback,multiplier)),attack=g.floor(g.mul(baseAttack,range)),level=g.floor(g.mul(g.mul(F(2.5),resolvedLevel),range));
  return g.where(enabled,g.where(byAttack,attack,g.where(byLevel,level,scaled)),fallback);
}
export function buildPhysicalSelectorModel(){
  const g=new Graph('rom-physical-selector-damage',{
    scope:'The present-actor branch of selector0/5/7/11/25/41 only. Fallback is the already generated nonnegative base damage. There is no target collection, action critical/accuracy, resistance, HP mutation or repeat-hit loop in this primitive.',
    scopeJa:'物理ダメージ補正5規則を実ROM表のselector番号で選びます。既に計算済みの基礎値から補正値と追加乱数状態を返す単体核です。',authority:SELECTOR_AUTHORITY,
    inputDomains:{seed:{min:0,max:255,integer:true,width:8},position:{min:1,max:4990,integer:true},selector:{min:0,max:66,integer:true},fallback:{min:0,max:16777215,integer:true},baseAttack:{min:0,max:65535,integer:true},resolvedLevel:{min:0,max:127,integer:true},enabled:{values:[false,true,0,1]}},
    levelContract:'For source0..3, the current-job party level; for an enemy, the actual USA02159dbc helper result. The caller supplies this resolved value from initial game state, never from observed output. The represented range is0..127 and excludes an out-of-range legacy-boss level override.',
    rounding:'Separate original binary32 multiply/add sites, followed by truncation. The fallback integer0..2^24-1 is exactly representable at input; multiplication can round and is not asserted exact. All represented numeric inputs and range endpoints are nonnegative, so Floor is the exact required truncation. Selector0 is identity. Missing selectors are supported0 and preserve fallback/RNG.',
    defaults:{seed:[1,0,0,0,0,0,0,0],position:1,selector:7,fallback:24,baseAttack:68,resolvedLevel:9,enabled:true},feedback:{seed:'nextSeed',position:'nextPosition'},
    labels:{selector:'0なし /5攻撃力 /7×1.25 /11×0.5 /25×1.2 /41レベル',fallback:'補正前の基礎ダメージ',baseAttack:'基礎攻撃力',resolvedLevel:'実helperで解決したレベル'}
  });
  const seed=g.input('seed',['N',8]),position=g.input('position',['N',1],'int32'),selector=g.input('selector'),fallback=g.input('fallback'),baseAttack=g.input('baseAttack'),level=g.input('resolvedLevel'),enabled=g.input('enabled',['N',1],'bool');
  const supported=g.or(...PHYSICAL_SELECTOR_IDS.map(x=>g.eq(selector,x))),active=g.and(enabled,supported),rng=new RandomGraph(g,seed,position),damage=physicalSelectorDamage(g,rng,selector,fallback,baseAttack,level,active);
  for(const[name,value]of Object.entries({damage,nextSeed:rng.seed,nextPosition:rng.position,consumed:g.sub(rng.position,position),supported:g.cast(supported,'float32'),active:g.cast(active,'float32')}))g.output(value,name);
  return g;
}
export function buildSelectedActionCore(options={}){
  const previous=buildPackedActionCore().contract,oldRules=[...SHARED_ACTION_RULES.map(r=>({...r,forcedCritical:0})),...PACKED_CALLER_RULES].map(r=>({...r,selector:0}));
  const added=SINGLE_PHYSICAL_ACTION_IDS.map(id=>{
    const a=rom.actions.find(x=>x.id===id),b=Buffer.from(a.raw,'hex');
    if(a.operation!==1||a.damageId!==0||!PHYSICAL_SELECTOR_IDS.includes(a.selector)||(b.readUInt32LE(28)>>>14&31)!==0)throw Error('Unrepresented physical caller '+id);
    return{...decodeBossActionRule(id),damageId:a.damageId,damageCap:b.readUInt32LE(28)&0x3fff,forcedCritical:a.w08>>>29&1,selector:a.selector};
  });
  const extraRules=options.additionalRules??[],ids=[...SHARED_ACTION_IDS,...PACKED_CALLER_IDS,...SINGLE_PHYSICAL_ACTION_IDS,...extraRules.map(r=>r.id)],rules=[...oldRules,...added,...extraRules];
  return buildRomColumnActionCore({...options,name:options.name??'rom-selected-action-core2',actionIds:ids,actionRules:rules,
    contract:{...previous,actionRules:rules,
      inputDomains:{...previous.inputDomains,actionId:{values:ids}},
      fieldDomains:{...previous.fieldDomains,actors:previous.fieldDomains.actors.map(r=>r.name==='actor1.level'?{...r,max:127}:r)},
      scope:'The previous28 audited ROM-column action records plus enemy single-hit physical actions244/249/309/550, each with one existing live target and repeatCode0. All prior state/equipment exclusions remain. Action73 repeatCode3 is explicitly absent: its3/4 hits are not one call to this kernel.',
      scopeJa:'共通28行動に、敵の単発物理補正4行動を追加します。ツメできりさく、いなずまづき、鉄球ぶん回し、行動244。さみだれづきの連続ヒットはこの核に含めません。',
      selectorAuthority:SELECTOR_AUTHORITY,
      levelContract:'actors[1].level is the actual enemy level helper result, read from its explicit initial combat auxiliary record; it is not inferred from HP/attack or a party level. Party level keeps the existing current-job level meaning. No legacy-boss override outside0..127.',
      selectorContract:'Fallback base damage is computed with its original0/1/2 draws before selector transformation. Selector5 reads unbuffed baseAttack, selector41 reads resolved level, and each adds one FloatBetween draw. Multiplicative selectors round to integer before critical/resistance/defend/combo.',
      currentStatsProjection:'This ABI stores base stats and rank, and reconstructs current stats using the existing exact buff rule. Entry raw current attack/defense must equal that result. Deliberately inconsistent base/current RAM snapshots are outside this core input representation and are retained as separate diagnostics; the standalone selector primitive accepts independent fallback/baseAttack to test their distinct reads.',
      repeatedActionExclusion:'Action73 (selector11, repeatCode3) has actual3/4 hits and may stop early on death. Its numeric selector is implemented separately, but no fullcaller73 support is asserted.',
      extensionStatus:'New component only. Each added selector/action requires independent actual-ROM caller or primitive checks; existing programs/models remain immutable.',
      ...(options.contract??{})
    },
    criticalCheck(g,rng,rule,gate,{source}){const forced=g.gt(rule.forcedCritical,0),roll=rng.bounded(g.and(gate,g.not(forced)),10000);return g.and(gate,g.or(forced,g.lt(roll,source.criticalThreshold)));},
    criticalDamageGate(g,rule,gate){return g.and(gate,g.eq(rule.forcedCritical,0));},
    transformBaseDamage:options.transformBaseDamage??function(g,rng,rule,hit,base,{source}){return physicalSelectorDamage(g,rng,rule.selector,base,source.baseAttack,source.level,hit);}
  });
}
async function main(){
  const old=await readFile(new URL('rom-packed-action-core2.onnx',directory));if(hash(old)!==hash(buildPackedActionCore().model()))throw Error('Frozen28-action kernel changed.');
  const models=[];
  for(const g of[buildPhysicalSelectorModel(),buildSelectedActionCore()]){
    const bytes=g.model(),ir=g.json();models.push({name:g.name,sha256:hash(bytes),bytes:bytes.length,nodes:g.nodes.length});
    for(const[file,value]of[[g.name+'.onnx',bytes],[g.name+'.json',JSON.stringify(ir,null,2)+'\n']]){await writeFile(new URL(file+'.tmp',directory),value);await rename(new URL(file+'.tmp',directory),new URL(file,directory));}
  }
  const report={schema:'dq9-physical-selectors-v1',models,supportedSelectors:PHYSICAL_SELECTOR_IDS,singleHitActionIds:SINGLE_PHYSICAL_ACTION_IDS,excludedRepeatedActionIds:[73],unchangedPreviousSha256:hash(old),proofStatus:'Pending independent actual-ROM comparisons.'};
  await writeFile(new URL('physical-selector-models.json.tmp',directory),JSON.stringify(report,null,2)+'\n');await rename(new URL('physical-selector-models.json.tmp',directory),new URL('physical-selector-models.json',directory));console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]===fileURLToPath(import.meta.url))await main();
