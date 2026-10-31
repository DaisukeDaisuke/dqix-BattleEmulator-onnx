// New original560 variant. All published numerical kernels remain immutable.
import {buildBossActionCore} from '../build-boss-action.mjs';
import {buffStat} from '../transition-graphs.mjs';
import {decodeBossActionRule} from '../boss-action-rules.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
export async function buildDarkwaveAction(){
 const reference=JSON.parse(await readFile(new URL('rom-weapon-tension-action-core2.json',dir),'utf8')),record=rom.actions.find(a=>a.id===560),rule=decodeBossActionRule(560),contract=structuredClone(reference.contract);
 if(rule.operation!==4||record.selector!==0||rule.additional!==17||rule.parameter!==-1||rule.secondaryParameter!==-1||rule.preCritical!==1||rule.mpCost||rule.dodge||rule.guard||rule.blind||rule.defend||rule.buffAttack||rule.recover||rule.combo||rule.damageElement!==0||rule.accuracyMode!==1||rule.baseChance!==50||(record.w18>>>27&31)!==19||(record.w10&0x2000))throw Error('Unrepresented original560 record');
 delete contract.inputDomains.elementResistances;delete contract.fieldDomains.weapon;delete contract.defaults.weapon;delete contract.defaults.elementResistances;delete contract.weaponFields;delete contract.equipmentAuthority;delete contract.elementResistanceLayout;delete contract.originalDifference;
 let preparation,tension;
 return buildBossActionCore({name:'rom-darkwave-action-core2',actionIds:[560],actionRules:[rule],contract:{
  ...contract,actionRules:[{...rule,effectElement:record.w18>>>27&31}],inputDomains:{...contract.inputDomains,actionId:{values:[560]},sourceIndex:{values:[1]}},defaults:{...contract.defaults,sourceIndex:1,actionId:560},
  scope:'Original560 enemy to one existing living party target. Primary accuracy uses raw base50 and effect element19/currentStats50. On accuracy success, operation4 calls additional17 first: agility rank decreases by1 if above-2, then primary defense rank decreases by1 if above-2. Each changed rank is recomputed from its own base stat; zero rank clears its timer/recovery, otherwise duration6/recovery0. No attack-rank change or extra status-effect RNG. The actual caller still computes physical fallback before either change and invokes positive-internal weapon/coup phases. Source and target tension are preserved because this action has no tension-use flag and operation4 has no high-target damage modifier.',
  scopeJa:'やみのはどうの命中後に、追加効果のすばやさ低下と本体の守備力低下を実行します。更新前の能力による内部物理計算と後続の乱数消費を保持します。',
  resistanceContract:'resistances[2] is the supplied target effect element19 byte, original array index18/currentStats+0x50. The exact original binary32 fraction/product/.5/truncation computes the accuracy threshold. Neither source thresholds nor expected outputs are injected.',
  sourceScope:'Both actors alive, source free of primary inability/skip/appeal modes, enemy criticalThreshold0, existing event/target buffers. Raw reflection, barriers, immunity and resistance-modifier flags are absent. No party560, multiple targets, arbitrary additional17 parameters or enclosing battle claim.',
  authority:{primary:'JPN021dc06c / USA021db7c0',additionalDispatch:'JPN021e53ac / USA021e4b14',table:'Original overlay24 JPN021ffc30 entry17, raw504b1e0200000000, thisAdjustment0',additional:'JPN021e4b50 / USA021e42b8',agilityEligibility:'USA02087954',agilitySetter:'USA020879a8',defenseEligibility:'USA02087860',defenseSetter:'USA020878b4'},
  ordering:'The symbolic graph computes independent final rank fields without mutating the pre-operation physical inputs. Actual additional AGI occurs before primary DEF; no intervening represented branch reads the other current stat or consumes RNG, so the simultaneous final actor commit preserves this order-dependent boundary.',
  proofStatus:'Source/table-derived original560 kernel. Independent actual caller proofs are stored separately and do not alter the numerical weights.'
 },additionalSupport(g,r,{sourceIndex}){preparation=g.input('preparationState',['N',10]);tension=g.input('tension',['N',6]);return g.and(g.eq(sourceIndex,1),g.eq(g.split(preparation,10)[5],0));},
 targetEffect(g,r,operationHit,{sourceIndex,target,nextTarget,aux}){
  const changed=g.and(operationHit,g.gt(target.agilityRank,-2)),next=g.where(changed,g.sub(target.agilityRank,1),target.agilityRank);
  for(let i=0;i<2;i++){const applies=g.and(changed,g.eq(sourceIndex,1-i));aux[`a${i}_agilityRankDuration`]=g.where(applies,g.where(g.eq(next,0),0,6),aux[`a${i}_agilityRankDuration`]);aux[`a${i}_agilityRankRecovery`]=g.where(applies,0,aux[`a${i}_agilityRankRecovery`]);}
  return{target:{agilityRank:next},applied:changed};
 },extraOutputs(g,{actors,source}){return{nextPreparationState:preparation,nextTension:tension,tensionConsumed:g.mul(source.hp,0),currentDefense:buffStat(g,actors[0].baseDefense,actors[0].defenseRank,'defense',true,actors[0].party),currentAgility:buffStat(g,actors[0].baseAgility,actors[0].agilityRank,'defense',true,actors[0].party)};}});
}
export async function writeDarkwaveAction(){const g=await buildDarkwaveAction(),bytes=g.model();auditModelBytes(bytes,{name:g.name});const report={schema:'dq9-darkwave-action-v1',name:g.name,sha256:hash(bytes),bytes:bytes.length,nodes:g.nodes.length,actionIds:[560],scope:g.contract.scope,proofStatus:g.contract.proofStatus};for(const[file,value]of[[g.name+'.onnx',bytes],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n'],['darkwave-action-model.json',JSON.stringify(report,null,2)+'\n']]){await writeFile(new URL(file+'.tmp',dir),value);await rename(new URL(file+'.tmp',dir),new URL(file,dir));}return report;}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await writeDarkwaveAction(),null,2));
