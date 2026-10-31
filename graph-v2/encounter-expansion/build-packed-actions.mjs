// Expand the same ROM-column core to enemy damage records occurring in the
//39 source configurations. No new numerical expression is duplicated here.
import {buildRomColumnActionCore,buildSharedActionCore,SHARED_ACTION_IDS,SHARED_ACTION_RULES} from './build-shared-action.mjs';
import {decodeBossActionRule} from '../boss-action-rules.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const directory=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
export const PACKED_CALLER_IDS=[10,11,12,14,15,16,18,19,20,22,227,264,269,285,286,295,304,462,463,534];
export const PACKED_CALLER_RULES=PACKED_CALLER_IDS.map(id=>{
  const a=rom.actions.find(x=>x.id===id),rule=decodeBossActionRule(id),view=new DataView(Uint8Array.from(a.raw.match(/../g),x=>parseInt(x,16)).buffer);
  if(a.operation!==1||a.selector!==0||a.damageId<=0||![0,4].includes(rule.additional))throw Error('Action needs an unrepresented caller rule '+id);
  return{...rule,damageId:a.damageId,damageCap:view.getUint32(0x1c,true)&0x3fff,forcedCritical:(a.w08>>>29)&1};
});
export function buildPackedActionCore(){
  const shared=buildSharedActionCore().contract;
  return buildRomColumnActionCore({
    name:'rom-packed-action-core2',actionIds:[...SHARED_ACTION_IDS,...PACKED_CALLER_IDS],actionRules:[...SHARED_ACTION_RULES.map(r=>({...r,forcedCritical:0})),...PACKED_CALLER_RULES],
    contract:{
      ...shared,
      scope:'The audited shared8 records plus20 enemy packed-damage operation1/selector0 records used in the39 restored configurations. One existing live target, successful event allocation; acting enemy critical threshold0. Ordinary party action1 remains the only party action. No spell/breath resistance-rank effects, elemental barriers, reflection, metal, tension, counters, redirection or equipment modifiers. MP-insufficient command replacement is outside this core.',
      scopeJa:'共通8行動に、敵の呪文・息・固定範囲ダメージ20行動を加えた実ROM列グラフです。1対象・未反射・魔法と息の耐性段階0という明示範囲で、MP・命中・防御・HP・状態・乱数を処理します。',
      actionRules:[...SHARED_ACTION_RULES.map(r=>({...r,forcedCritical:0})),...PACKED_CALLER_RULES],
      inputDomains:{...shared.inputDomains,actionId:{values:[...SHARED_ACTION_IDS,...PACKED_CALLER_IDS]}},
      fieldDomains:{...shared.fieldDomains,status:shared.fieldDomains.status.map(rule=>rule.name.endsWith('poisonKind')?{...rule,max:3}:rule)},
      stateEncoding:'Status bits8=paralysis,16=sleep,32=confusion are separate. actors.poison denotes active severe poison only. status.poisonKind preserves all raw two-bit subtype values0..3, including inactive/reserved values; severe poison requires the raw flag and subtype2. Ordinary poison has no periodic damage in this represented state. Individual duration/recovery bytes retain their ROM values.',
      ruleRepresentation:'The28 immutable original action rows are per-column initializers selected by Gather. All packed damage uses the same123 first-priority ROM damage rows; ordinary/status physical branches and lifecycle operations share the prior numeric kernel.',
      resistanceContract:'resistances[4] is the target byte for the selected action damage element1..8, supplied from the raw/current actor resistance array. Element0 ignores that byte. This ABI does not silently substitute physical resistance for elemental spells or breaths.',
      additionalEffects:'Only additional0(no effect) and4(severe poison) are represented. Action251 additional11 remains explicitly absent. New record295 uses the already represented severe-poison ordered RNG/state rule.',
      forcedCritical:'word08 bit29 returns critical=true without a random draw in JPN02158444/USA02156cc4. USA021ea7fc then suppresses the critical damage bonus for that flag except action505, which is outside this model. Real records462/463 use this rule; it is not a missing random draw guessed from samples.',
      extensionStatus:'Actual packed-base arithmetic was independently checked for all123 rows; wholecaller equivalence for each new record is checked separately. The standalone base proof alone is not a complete spell/breath/caller proof.',
      initialRestrictions:'Spell-resistance and breath-resistance ranks/status flags are absent from this input projection and must be inactive at entry. The caller must supply the selected raw elemental resistance byte. No additional boss initial profile or full encounter is claimed by this kernel alone.'
    },
    criticalCheck(g,rng,rule,gate,{source}){
      const forced=g.gt(rule.forcedCritical,0),roll=rng.bounded(g.and(gate,g.not(forced)),10000);
      return g.and(gate,g.or(forced,g.lt(roll,source.criticalThreshold)));
    },
    criticalDamageGate(g,rule,gate){return g.and(gate,g.eq(rule.forcedCritical,0));}
  });
}
async function main(){
  const old=await readFile(new URL('rom-shared-action-core2.onnx',directory)),rebuilt=buildSharedActionCore().model();
  if(hash(old)!==hash(rebuilt))throw Error('The immutable8-action model changed');
  const g=buildPackedActionCore(),bytes=g.model(),ir=g.json();
  const report={schema:'dq9-packed-action-extension-v1',name:g.name,sha256:hash(bytes),bytes:bytes.length,nodes:g.nodes.length,existingActionIds:SHARED_ACTION_IDS,newActionIds:PACKED_CALLER_IDS,
    unchangedShared:{sha256:hash(old),regeneratedEqual:true},newCallerProof:'Separate actual-ROM verification required; no full-encounter coverage inferred.'};
  for(const[file,value]of [[g.name+'.onnx',bytes],[g.name+'.json',JSON.stringify(ir,null,2)+'\n'],['packed-action-model.json',JSON.stringify(report,null,2)+'\n']]){
    await writeFile(new URL(file+'.tmp',directory),value);await rename(new URL(file+'.tmp',directory),new URL(file,directory));
  }
  console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]===fileURLToPath(import.meta.url))await main();
