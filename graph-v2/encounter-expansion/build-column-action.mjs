// Broaden numeric selector columns without duplicating the shared caller.
// Only the six separately audited single-hit, operation1 records are added.
import {buildIncapacityActionCore} from './build-incapacity-action.mjs';
import {columnSelectorDamage,SELECTOR_COLUMN_IDS} from './build-selector-columns.mjs';
import {decodeBossActionRule} from '../boss-action-rules.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
export const COLUMN_ACTION_IDS=[540,245,279,280,290,316];
export const COLUMN_ACTION_RULES=COLUMN_ACTION_IDS.map(id=>{
  const a=rom.actions.find(x=>x.id===id),b=Buffer.from(a.raw,'hex'),r={...decodeBossActionRule(id),damageId:a.damageId,damageCap:b.readUInt32LE(28)&0x3fff,forcedCritical:a.w08>>>29&1,selector:a.selector};
  if(r.operation!==1||r.damageId!==0||r.additional!==0||!SELECTOR_COLUMN_IDS.includes(r.selector)||(b.readUInt32LE(28)>>>14&31)!==0)throw Error('Unrepresented column caller '+id);
  return r;
});
export function buildColumnActionCore(options={}){
  const previous=buildIncapacityActionCore().contract;
  return buildIncapacityActionCore({...options,name:options.name??'rom-column-action-core2',additionalRules:[...COLUMN_ACTION_RULES,...(options.additionalRules??[])],
    contract:{
      scope:'The33 previously audited one-existing-target action records plus six enemy single-hit physical records540/245/279/280/290/316. Original mode/scale/bias/range columns select the20 represented numeric selectors. This model does not enable other actions just because their selector is represented; repeat loops, recoil/drain, species gates and extra state operations remain excluded.',
      scopeJa:'共通33行動と単発物理6行動を、同じ呼出処理とselector係数表で実行します。多段攻撃・吸収・反動などは別の処理として扱います。',
      selectorAuthority:{table:'evidence-v2/ghidra/damage-selector-table67.json',address:'JPN021ff9c0',pureEntryProof:'evidence-v2/ghidra/emulation-pure-selector-run/response.json',fullCallerProof:'evidence-v2/ghidra/emulation-pure-selector-action-run/response.json'},
      selectorColumns:SELECTOR_COLUMN_IDS,
      addedCallerIds:COLUMN_ACTION_IDS,
      previousFrozenCore:'rom-incapacity-action-core2',
      forcedCritical:'Action245 uses its actual forced-critical flag: the critical probability draw is absent and the ordinary critical bonus branch is bypassed. All other record flags retain their own raw column values.',
      resistanceContract:previous.resistanceContract+' Added action279 is fire1,280 ice2,290 earth5, and540/245/316 physical8; resistances[4] must be selected from that target byte before this boundary.',
      extensionStatus:'New39-record variant. Legacy33 and all published encounter programs stay immutable; direct actual-ROM and exact shared-case comparisons are separate evidence.',
      ...(options.contract??{})
    },
    transformBaseDamage(g,rng,rule,hit,base,{source}){return columnSelectorDamage(g,rng,rule.selector,base,source.baseAttack,source.level,hit).damage;}
  });
}
async function main(){
  const old=await readFile(new URL('rom-incapacity-action-core2.onnx',dir));
  if(hash(old)!==hash(buildIncapacityActionCore().model()))throw Error('Default33-action builder no longer reproduces its frozen bytes');
  const g=buildColumnActionCore(),b=g.model(),report={schema:'dq9-column-action-model-v1',name:g.name,sha256:hash(b),bytes:b.length,nodes:g.nodes.length,actionIds:g.contract.inputDomains.actionId.values,addedCallerIds:COLUMN_ACTION_IDS,immutable33Sha256:hash(old),immutable33RegeneratedEqual:true,proofStatus:'Pending actual caller and existing-case comparisons.'};
  for(const[file,value]of[[g.name+'.onnx',b],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n'],['column-action-model.json',JSON.stringify(report,null,2)+'\n']]){await writeFile(new URL(file+'.tmp',dir),value);await rename(new URL(file+'.tmp',dir),new URL(file,dir));}
  console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]===fileURLToPath(import.meta.url))await main();
