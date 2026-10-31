// Action300 extends the shared numeric action core with one independently
// verified selector; it does not alter any frozen encounter or shared builder.
import {physical} from '../graph-builder.mjs';
import {buildBossActionCore} from '../build-boss-action.mjs';
import {decodeBossActionRule,resistanceFraction} from '../boss-action-rules.mjs';
import {createTensionDamageHooks} from './build-tension-actions.mjs';
import {levelScaledSelectorDamage} from './build-level-scaled-selector.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
export const VACUUM_ACTION_RULE={...decodeBossActionRule(300),selector:43,damageCap:0};
if(VACUUM_ACTION_RULE.raw!=='d70c00002c0100000009c0000000000010380000000000302010ae00000000000090240005104000080000000000000000000000')throw Error('Original action300 changed');
export async function buildVacuumAction(){
  const reference=JSON.parse(await readFile(new URL('rom-tension-action-core2.json',dir),'utf8')),contract=structuredClone(reference.contract),tension=createTensionDamageHooks();
  let preparation;
  return buildBossActionCore({
    name:'rom-vacuum-action-core2',actionIds:[300],actionRules:[VACUUM_ACTION_RULE],...tension,
    contract:{...contract,actionRules:[VACUUM_ACTION_RULE],inputDomains:{...contract.inputDomains,actionId:{values:[300]},sourceIndex:{values:[1]}},defaults:{...contract.defaults,sourceIndex:1,actionId:300},
      scope:'Original enemy action300 (しんくうは), one existing live party target, through the numeric action core. Physical fallback retains its original0/1/2 random draws before present-source selector43 replaces the value with min(30+2*level,150) plus one FloatBetween(-.1,.1) variation. Original critical/accuracy, wind resistance, defend, tension, damage/HP, recovery, combo and explicit state effects remain in the shared caller.',
      scopeJa:'しんくうはを共通の行動処理で実行し、基礎ダメージ計算の乱数消費、風耐性、防御、テンション、HP変化を保持します。',
      support:'Existing enemy192 and one living party0, source free of primary/skip/appeal state, enemy critical threshold0, coherent base/current/rank statistics. Target high-tension flag is excluded by the inherited support predicate. No counter/redirect/reflection/barrier/metal/species/equipment callback, failed allocation or unrepresented status. This is a direct action-core boundary, not target collection/preparation/post/whole316 battle.',
      resistanceContract:'resistances[4] is target currentStats+0x40, original wind element3. Other input resistance fields retain the common core meanings.',
      authority:{selector:'JPN021d9ddc / USA021d951c',selectorProof:'level-scaled-selector43-rom-verification.json',actionRecord:VACUUM_ACTION_RULE.raw,sourceSha256:'615285ff7a6bebcfe1a6b40bf87b90d14cbe6478c0b4adec2b4d0b695ce6cd66'},
      extensionStatus:'Separate action300 graph; frozen prior actions and encounter programs stay unchanged. Actual caller comparison is a separate report.'},
    additionalSupport(g,r,context){preparation=[...g.split(g.input('preparationState',['N',10]),10)];return g.and(g.eq(context.sourceIndex,1),tension.additionalSupport(g,r,context));},
    damageResistance(g,r,resistance){return resistanceFraction(g,resistance[4]);},
    baseDamage(g,rng,r,hit,{attack,defense,source}){
      const fallback=physical(g,rng.seed,rng.position,attack,defense,hit);rng.seed=fallback.seed;rng.position=fallback.position;
      const damage=levelScaledSelectorDamage(g,rng,source.level,hit);
      return{seed:rng.seed,position:rng.position,damage};
    },
    extraOutputs(g,context){
      const output=tension.extraOutputs(g,context);
      for(let actor=0;actor<2;actor++)for(const field of[0,2])preparation[actor*5+field]=g.where(g.and(context.active,g.le(context.actors[actor].hp,0)),0,preparation[actor*5+field]);
      return{...output,nextPreparationState:g.cat(preparation)};
    }
  });
}
export async function writeVacuumAction(){
  const g=await buildVacuumAction(),bytes=g.model();auditModelBytes(bytes,{name:g.name});
  const report={schema:'dq9-vacuum-action-build-v1',name:g.name,sha256:hash(bytes),nodes:g.nodes.length,bytes:bytes.length,actionIds:[300],scope:g.contract.scope,proofStatus:'Independent actual-ROM caller comparison is a separate report.'};
  for(const[file,value]of[[g.name+'.onnx',bytes],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n'],['vacuum-action-model.json',JSON.stringify(report,null,2)+'\n']]){await writeFile(new URL(file+'.tmp',dir),value);await rename(new URL(file+'.tmp',dir),new URL(file,dir));}
  return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await writeVacuumAction(),null,2));
