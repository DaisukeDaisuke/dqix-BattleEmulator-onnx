// Original272 uses the existing caller phases and one exact status setter.
// Existing action graphs are not regenerated or changed by this module.
import {buildBossActionCore} from '../build-boss-action.mjs';
import {ACTOR_FIELDS} from '../rules.mjs';
import {BOSS_STATUS_FIELDS,decodeBossActionRule} from '../boss-action-rules.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
export async function buildParalysis(){
  const reference=JSON.parse(await readFile(new URL('rom-weapon-tension-action-core2.json',dir),'utf8')),a=rom.actions.find(r=>r.id===272),rule=decodeBossActionRule(272);
  if(rule.operation!==24||a.selector!==0||rule.additional||rule.preCritical!==1||rule.mpCost||rule.recover||rule.combo||rule.guard||rule.damageElement!==0||(a.w10&0x2000))throw Error('Unrepresented original272 rule');
  const contract=structuredClone(reference.contract);delete contract.inputDomains.elementResistances;delete contract.fieldDomains.weapon;delete contract.defaults.weapon;delete contract.defaults.elementResistances;delete contract.weaponFields;delete contract.equipmentAuthority;delete contract.elementResistanceLayout;delete contract.originalDifference;
  let preparation,tension,applied;
  return buildBossActionCore({name:'rom-paralysis-action-core2',actionIds:[272],actionRules:[rule],contract:{
    ...contract,actionRules:[rule],inputDomains:{...contract.inputDomains,actionId:{values:[272]},sourceIndex:{values:[1]}},defaults:{...contract.defaults,sourceIndex:1,actionId:272},
    scope:'Original272 enemy→existing party target only. Actual operation24 reuses the original pre-critical/shared/dodge/accuracy/physical/weapon/coup caller order. Target susceptibility element19 is resistances[2]. A successful setter is refused for target death/high-tension; otherwise it sets paralysis with duration3/recovery0, clears sleep/confusion and their timers, skip/skipKind/defend and ordinary tension/stage. Source tension persists because original word10 lacks its consumption flag. Raw immunity/reflection/barrier and unrepresented status fields must be absent.',
    scopeJa:'やけつくいきの命中・内部物理計算・麻痺状態変更を共通行動処理で実行します。スーパーハイテンションで麻痺を拒否し、成功時に睡眠・混乱・行動不能と通常テンションを解除します。',
    resistanceContract:'resistances[2] is actual target element19/currentStats+0x50. No host-computed probability or expected state supplies this value.',
    authority:[{artifact:'evidence-v2/ghidra/rank-paralysis-drain-defined/response.json',operation:'JPN021de52c',eligibility:'USA02088b48',setter:'USA02088b68'},{artifact:'evidence-v2/ghidra/emulation-rank-paralysis-drain-run/response.json',subset:'Original272 actual through-return callers'}],
    sourceScope:'Both actors alive; only one target, enemy source without sleep/paralysis/confusion/skip or appeal mode. Enemy critical threshold0. Successful event allocation. No party action, complete battle, general operation24, raw176-byte state or presentation-memory claim.',
    feedback:{...contract.feedback},excludedRawStatusMask:0
  },additionalSupport(g,r,{sourceIndex}){preparation=[...g.split(g.input('preparationState',['N',10]),10)];tension=[...g.split(g.input('tension',['N',6]),6)];return g.and(g.eq(sourceIndex,1),g.eq(preparation[5],0));},
    targetEffect(g,r,hit,{sourceIndex,target,nextTarget,status}){
      const high=g.where(g.eq(sourceIndex,0),tension[5],tension[2]);applied=g.and(hit,g.eq(r.operation,24),g.gt(target.hp,0),g.eq(high,0));
      for(let i=0;i<2;i++){const selected=g.and(applied,g.eq(sourceIndex,1-i));for(const field of['sleepDuration','sleepRecovery','confusionDuration','confusionRecovery','paralysisDuration','paralysisRecovery']){const k=`a${i}_${field}`;if(!BOSS_STATUS_FIELDS.includes(k))throw Error('Missing primary field '+k);status[k]=g.where(selected,field==='paralysisDuration'?3:0,status[k]);}preparation[i*5+2]=g.where(selected,0,preparation[i*5+2]);tension[i*3]=g.where(selected,0,tension[i*3]);tension[i*3+1]=g.where(selected,0,tension[i*3+1]);}
      return{applied,target:{paralysis:g.where(applied,1,nextTarget.paralysis),sleep:g.where(applied,0,nextTarget.sleep),confusion:g.where(applied,0,nextTarget.confusion),skip:g.where(applied,0,nextTarget.skip),defend:g.where(applied,0,nextTarget.defend)}};
    },extraOutputs(g,{source}){return{nextPreparationState:g.cat(preparation),nextTension:g.cat(tension),tensionConsumed:g.mul(source.hp,0)};}
  });
}
export async function writeParalysis(){const g=await buildParalysis(),b=g.model();auditModelBytes(b,{name:g.name});const report={schema:'dq9-paralysis-action-v1',name:g.name,sha256:hash(b),nodes:g.nodes.length,bytes:b.length,actionIds:[272],scope:g.contract.scope};for(const[file,value]of[[g.name+'.onnx',b],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n'],['paralysis-action-model.json',JSON.stringify(report,null,2)+'\n']]){await writeFile(new URL(file+'.tmp',dir),value);await rename(new URL(file+'.tmp',dir),new URL(file,dir));}return report;}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await writeParalysis(),null,2));
