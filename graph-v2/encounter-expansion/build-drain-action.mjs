// Original469 keeps the ordinary physical fallback draws, then selector47
// replaces its number. The operation transfers MP after common postprocessing.
import {physical} from '../graph-builder.mjs';
import {buildBossActionCore} from '../build-boss-action.mjs';
import {ACTOR_FIELDS} from '../rules.mjs';
import {decodeBossActionRule,resistanceFraction} from '../boss-action-rules.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
export async function buildDrain(){
  const reference=JSON.parse(await readFile(new URL('rom-weapon-tension-action-core2.json',dir),'utf8')),a=rom.actions.find(r=>r.id===469),rule=decodeBossActionRule(469),contract=structuredClone(reference.contract);
  for(const k of['weaponFields','equipmentAuthority','elementResistanceLayout','originalDifference'])delete contract[k];delete contract.inputDomains.elementResistances;delete contract.fieldDomains.weapon;delete contract.defaults.weapon;delete contract.defaults.elementResistances;
  if(rule.operation!==28||a.selector!==47||rule.mpCost||rule.additional||rule.preCritical||rule.dodge||rule.guard||rule.blind||rule.recover||(a.w10&0x2000))throw Error('Unrepresented original469 record');let preparation,tension;
  return buildBossActionCore({name:'rom-drain-action-core2',actionIds:[469],actionRules:[rule],contract:{...contract,actionRules:[rule],inputDomains:{...contract.inputDomains,actionId:{values:[469]},sourceIndex:{values:[1]}},defaults:{...contract.defaults,sourceIndex:1,actionId:469},
    scope:'Original469 enemy→existing party target only. Actual physical fallback still consumes0/1/2 draws, after which selector47 gives floor(resolvedEnemyLevel/4)+5 without RNG. Original susceptibility/zero/combo postprocessing precedes operation28. Transfer amount is min(postprocessedAmount,partyMP); party loses that amount and enemy gains up to its maxMP, independently of the amount actually received. Positive internal amount still controls the weapon callback even if targetMP is0 or sourceMP isfull. Both live actors and no unrepresented spell-resistance rank, reflection, immunity or allocation failure are required.',
    scopeJa:'マホトラの既存物理乱数を保持した後、ROMのレベル式とMP移動を適用します。奪う量と実際に回復できた量を区別し、MPが空でも行動本体の乱数を処理します。',
    authority:[{artifact:'evidence-v2/ghidra/rank-paralysis-drain-defined/response.json',selector47:'JPN021d9f90 / USA021d96d0',operation28:'JPN021deb20 / USA021de274'},{artifact:'evidence-v2/ghidra/emulation-drain-selector47-run/response.json',scope:'All128 initial resolved-level values through actual selector'}],
    resistanceContract:'resistances[4] is the actual target element12 MP-drain susceptibility byte; spell-resistance rank and other unrepresented multipliers are inactive. Source tension fields persist because original word10 lacks the tension bit.',
    sourceScope:'Enemy sourceIndex1, one already selected party target0; source without primary/skip/appeal modes, critical threshold0. No party or multi-target drain, raw event counters or fullbattle claim.',excludedRawStatusMask:0
  },additionalSupport(g,r,{sourceIndex}){preparation=g.input('preparationState',['N',10]);tension=g.input('tension',['N',6]);const p=g.split(preparation,10);return g.and(g.eq(sourceIndex,1),g.eq(p[5],0));},
    baseDamage(g,rng,r,hit,{attack,defense,source}){const p=physical(g,rng.seed,rng.position,attack,defense,hit);return{...p,damage:g.where(hit,g.add(g.floor(g.mul(source.level,.25)),5),0)};},
    damageResistance(g,r,bytes){return resistanceFraction(g,bytes[4]);},
    extraOutputs(g,{actors,active,hit,internalDamage}){const amount=g.where(g.and(active,hit),g.min(internalDamage,actors[0].mp),0),received=g.min(amount,g.max(g.sub(actors[1].maxMp,actors[1].mp),0)),next=actors.map(a=>({...a}));next[0].mp=g.sub(actors[0].mp,amount);next[1].mp=g.add(actors[1].mp,received);return{nextActors:g.cat(next.flatMap(a=>ACTOR_FIELDS.map(k=>a[k]))),nextPreparationState:preparation,nextTension:tension,tensionConsumed:g.mul(amount,0),drainedAmount:amount,recoveredMp:received};}
  });
}
export async function writeDrain(){const g=await buildDrain(),b=g.model();auditModelBytes(b,{name:g.name});const report={schema:'dq9-drain-action-v1',name:g.name,sha256:hash(b),nodes:g.nodes.length,bytes:b.length,actionIds:[469],scope:g.contract.scope};for(const[file,value]of[[g.name+'.onnx',b],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n'],['drain-action-model.json',JSON.stringify(report,null,2)+'\n']]){await writeFile(new URL(file+'.tmp',dir),value);await rename(new URL(file+'.tmp',dir),new URL(file,dir));}return report;}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await writeDrain(),null,2));
