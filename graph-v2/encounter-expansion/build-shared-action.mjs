// One immutable ROM-column action kernel replaces repeated specialized copies
// only after equivalence checks. Published300/303/305 artifacts stay untouched.
import {physical} from '../graph-builder.mjs';
import {buildBossActionCore} from '../build-boss-action.mjs';
import {decodeBossActionRule,resistanceFraction} from '../boss-action-rules.mjs';
import {enemyPackedDamage,buildRubbleCore} from './build-packed-damage.mjs';
import {buildNushiCore} from './build-nushi-action.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const directory=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
export const SHARED_ACTION_IDS=[1,44,48,94,228,275,546,548];
export const SHARED_ACTION_RULES=SHARED_ACTION_IDS.map(id=>{
  const a=rom.actions.find(x=>x.id===id),view=new DataView(Uint8Array.from(a.raw.match(/../g),x=>parseInt(x,16)).buffer);
  if(a.selector!==0)throw Error('Unimplemented damage selector '+id);
  return{...decodeBossActionRule(id),damageId:a.damageId,damageCap:view.getUint32(0x1c,true)&0x3fff};
});
export function buildSharedActionCore(){
  return buildRomColumnActionCore({
    name:'rom-shared-action-core2',actionIds:SHARED_ACTION_IDS,actionRules:SHARED_ACTION_RULES,
    contract:{
      scope:'Shared actual JPN021ebd9c one-existing-live-target kernel for the eight explicitly audited records1/44/48/94/228/275/546/548. Party action1 only; other records enemy-only. The original ROM columns and packed table weights select shared exact operations. This union does not enable arbitrary operation1 records, nonzero damage selectors or additional boss profiles.',
      scopeJa:'実ROMで検証した8行動を1つの核で処理します。通常攻撃・守備低下・素早さ低下・睡眠・猛毒・なぎはらい・ガレキ落とし・つなみの行動列とダメージ表をGatherで選択します。',
      ruleRepresentation:'The eight immutable action records are stored as per-column initializers and selected by Gather. Packed enemy damage uses the same123 first-priority ROM rows as the validated standalone kernel. No learned parameters, seed sampling, branch omission or approximation.',
      resistanceFields:['defenseRank','agilityRank','sleep','poison','selectedDamageElement'],
      resistanceContract:'resistances[4] must be the target resistance byte for this action damage element: physical8 for1/94/275/548, earth5 for546. Element0 ignores that byte. A caller with arbitrary element arrays must resolve the element from the action record before invoking this ABI.',
      damageCap:'The raw nonzero14-bit cap is applied after sequential binary32 modifiers, combo and final integer conversion, before HP application. Among these eight records only94 caps damage at1999. A zero cap has no limit.',
      authority:[
        {file:'src/Combat/Overlay_24/func_ov024_021eb5d0.cpp',address:'JPN021ebd9c',rule:'Common command core and ordered RNG/state operations'},
        {file:'src/Combat/Overlay_24/GetAttackBaseDamage.cpp',address:'JPN021e8458',rule:'Physical or enemy packed-table base damage'},
        {file:'src/Combat/Overlay_24/func_ov024_021e6a90.cpp',rule:'Postprocess and14-bit nonzero cap'},
        {evidence:'evidence-v2/ghidra/action-records-audit.json',rule:'All681 raw action records independently matched to ROM banks'}
      ],
      extensionStatus:'A new shared representation. Immutable specialized models and their proofs remain available; cross-model and direct-ROM comparisons are separate reports.'
    }
  });
}
// Shared numeric implementation; extensions vary only validated rule columns
// and their explicit contract. Keep arithmetic/RNG order in this one function.
export function buildRomColumnActionCore(options){
  return buildBossActionCore({
    ...options,
    baseDamage(g,rng,rule,hit,parameters){
      const {attack,defense}=parameters;
      const packed=g.gt(rule.damageId,0);
      const p=physical(g,rng.seed,rng.position,attack,defense,g.and(hit,g.not(packed)));
      rng.seed=p.seed;rng.position=p.position;
      const table=enemyPackedDamage(g,rng,rule.damageId,g.and(hit,packed));
      const base=g.where(packed,table.damage,p.damage),damage=options.transformBaseDamage?options.transformBaseDamage(g,rng,rule,hit,base,parameters):base;
      return{seed:rng.seed,position:rng.position,damage};
    },
    damageResistance(g,rule,resistance){return g.where(g.eq(rule.damageElement,0),1,resistanceFraction(g,resistance[4]));},
    finalDamage(g,value,rule){return g.where(g.gt(rule.damageCap,0),g.min(value,rule.damageCap),value);}
  });
}
async function main(){
  const baselines=[];
  for(const[name,builder,path]of [
    ['rom-boss-action-core2',buildBossActionCore,'../'],
    ['rom-rubble-action-core2',buildRubbleCore,''],
    ['rom-nushi-action-core2',buildNushiCore,'']
  ]){
    const bytes=await readFile(new URL(path+name+'.onnx',directory)),rebuilt=builder().model();
    if(hash(bytes)!==hash(rebuilt))throw Error('Immutable source model no longer reproduces '+name);
    baselines.push({name,bytes:bytes.length,sha256:hash(bytes),regeneratedEqual:true});
  }
  const graph=buildSharedActionCore(),bytes=graph.model(),ir=graph.json();
  const report={schema:'dq9-shared-action-representation-v1',name:graph.name,sha256:hash(bytes),bytes:bytes.length,nodes:graph.nodes.length,actionIds:SHARED_ACTION_IDS,
    baselines,previousModelBytes:baselines.reduce((sum,x)=>sum+x.bytes,0),newModelBytes:bytes.length,
    artifactBytesSaved:baselines.reduce((sum,x)=>sum+x.bytes,0)-bytes.length,
    unchangedSemanticsClaim:'Pending the independent existing-fixture and exact legacy-model comparisons; model size alone is not correctness or throughput evidence.'};
  for(const[file,value]of [
    [graph.name+'.onnx',bytes],
    [graph.name+'.json',JSON.stringify(ir,null,2)+'\n'],
    ['shared-action-model.json',JSON.stringify(report,null,2)+'\n']
  ]){await writeFile(new URL(file+'.tmp',directory),value);await rename(new URL(file+'.tmp',directory),new URL(file,directory));}
  console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]===fileURLToPath(import.meta.url))await main();
