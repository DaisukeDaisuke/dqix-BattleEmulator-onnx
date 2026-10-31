// New112/569 component. The published58-record family and shared generators
// remain immutable; record-specific behavior enters through existing hooks.
import {physical} from '../graph-builder.mjs';
import {buildBossActionCore} from '../build-boss-action.mjs';
import {ACTOR_FIELDS} from '../rules.mjs';
import {decodeBossActionRule} from '../boss-action-rules.mjs';
import {createTensionDamageHooks} from './build-tension-actions.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
export const GIYUMEI_ACTION_IDS=[112,569];
export const GIYUMEI_ACTION_RULES=GIYUMEI_ACTION_IDS.map(id=>{
  const a=rom.actions.find(x=>x.id===id),b=Buffer.from(a.raw,'hex'),r={...decodeBossActionRule(id),selector:a.selector,damageCap:b.readUInt32LE(28)&0x3fff,effectElement:a.w18>>>27&31};
  if(r.operation!==1||a.damageId!==0||r.preCritical||r.criticalWeight||r.damageElement!==8||(a.w08>>>29&1))throw Error('Unexpected original giyumei physical record '+id);
  if(id===112&&(r.selector!==45||r.mpCost!==8||r.damageCap!==1999||r.additional!==0||r.buffAttack!==0))throw Error('Unexpected112 columns');
  if(id===569&&(r.selector!==0||r.mpCost!==0||r.damageCap!==0||r.additional!==1||r.secondaryParameter!==2||r.baseChance!==100||r.effectElement!==15))throw Error('Unexpected569 columns');
  return r;
});
export async function buildGiyumeiAction(){
  const reference=JSON.parse(await readFile(new URL('rom-weapon-tension-action-core2.json',dir),'utf8')),contract=structuredClone(reference.contract),tension=createTensionDamageHooks();
  delete contract.inputDomains.elementResistances;delete contract.fieldDomains.weapon;delete contract.defaults.weapon;delete contract.defaults.elementResistances;delete contract.weaponFields;delete contract.equipmentAuthority;delete contract.elementResistanceLayout;delete contract.originalDifference;
  let preparation,selectedDamage,skipApplied;
  return buildBossActionCore({
    name:'rom-giyumei-action-core2',actionIds:GIYUMEI_ACTION_IDS,actionRules:GIYUMEI_ACTION_RULES,
    contract:{
      ...contract,actionRules:GIYUMEI_ACTION_RULES,inputDomains:{...contract.inputDomains,actionId:{values:GIYUMEI_ACTION_IDS},sourceIndex:{values:[1]}},defaults:{...contract.defaults,sourceIndex:1,actionId:112},
      scope:'Original enemy112/569 single-target action caller, from independently supplied decoded initial state. The usual physical fallback precedes selector45;112 then uses bounded2 and, on its zero branch, one FloatBetween(.95,1.05) times unsigned base attack. A positive result marks the critical impact without ordinary critical amplification. Its zero result bypasses tension numeric boost and minimum-damage RNG. Action569 applies additional1 subtype2 with a nonzero susceptibility-byte gate but without multiplying its chance by that byte. Successful event allocation and existing exclusion rules apply.',
      scopeJa:'まじん斬りの会心またはゼロの分岐と、斬り上げの行動不能を元の行動処理へ追加します。',
      support:'Enemy source192 and one living party target0; source free of primary/skip/appeal state, enemy critical threshold0, MP covers the original cost or is255. No counter/redirection, reflection/barrier/metal, critical-block equipment, species/elemental equipment callback, failed allocation or unrepresented ailments. Target primary, skip subtype, defense and separate tension flags/stage are explicit. This component does not execute preparation/post/whole turns.',
      resistanceContract:'Target element8 uses resistances[4]. For569 only, resistances[2] is currentStats+0x4c (effect15). A zero byte suppresses its additional bounded100; any nonzero byte admits the original100 chance without susceptibility multiplication. This is the explicit action0x239 exception in the additional1 helper.',
      criticalContract:'112 always retains the prior ordinary enemy critical-check draw. Its positive selector result subsequently marks the impact critical. The ordinary critical-damage gate explicitly rejects action112, so no critical range or1.2 amplification is added. Unrepresented critical-block equipment is excluded.',
      zeroContract:'For112 selected zero, the original tension multiplier/level bonus and minimum-damage bounded2 are bypassed. Tension consumption is separate and retained. Raw cap1999 applies late;569 raw cap0 is unbounded.',
      authority:{sourceAudit:'giyumei-action-source-audit.json',selector45:'JPN021d9f14 / USA021d9654',criticalGate:'USA021ea7fc',postprocess:'JPN021e7328 / USA021e6a90',additional1:'JPN021e3468 / USA021e2bd0',skipSetter:'JPN02088d70 / USA02088474',probe:'evidence-v2/ghidra/emulation-giyumei-actions-probe-run/response.json'},
      extensionStatus:'New separate two-record component. Previous58 records and encounter programs remain unchanged; actual caller and same-memory proofs are separate artifacts.'
    },
    additionalSupport(g,r,{sourceIndex}){
      preparation=[...g.split(g.input('preparationState',['N',10]),10)];
      return g.and(g.eq(sourceIndex,1),g.eq(preparation[5],0));
    },
    baseDamage(g,rng,r,hit,{attack,defense,source}){
      const p=physical(g,rng.seed,rng.position,attack,defense,hit);rng.seed=p.seed;rng.position=p.position;
      const is45=g.eq(r.selector,45),choice=rng.bounded(g.and(hit,is45),2),roll=g.and(hit,is45,g.eq(choice,0)),range=rng.range(roll,Math.fround(.95),Math.fround(1.05));
      selectedDamage=g.where(roll,g.floor(g.mul(source.baseAttack,range)),0);
      return{seed:rng.seed,position:rng.position,damage:g.where(is45,selectedDamage,p.damage)};
    },
    criticalDamageGate(g,r,gate){return g.and(g.not(g.eq(r.id,112)),gate);},
    preCriticalDamage(g,rng,r,hit,base,context){
      const boosted=tension.preCriticalDamage(g,rng,r,hit,base,context);
      return g.where(g.and(g.eq(r.id,112),g.le(base,0)),base,boosted);
    },
    postResistanceDamage(g,value,r){return{damage:value,minimumAllowed:g.not(g.eq(r.id,112))};},
    beforeComboDamage:tension.beforeComboDamage,
    finalDamage(g,value,r){return g.where(g.gt(r.damageCap,0),g.min(value,r.damageCap),value);},
    targetEffect(g,r,hit,{sourceIndex,target,nextTarget,rng,internalDamage,resistance}){
      const state=g.split('tension',6),targetHigh=g.where(g.eq(sourceIndex,0),state[5],state[2]),kind=g.where(g.eq(sourceIndex,0),preparation[7],preparation[2]);
      const gate=g.and(hit,g.eq(r.id,569),g.gt(internalDamage,0),g.gt(resistance[2],0)),roll=rng.bounded(gate,100);
      skipApplied=g.and(gate,g.lt(roll,r.baseChance),g.gt(target.hp,0),g.eq(targetHigh,0),g.eq(target.paralysis,0),g.or(g.eq(target.skip,0),g.not(g.eq(kind,r.secondaryParameter))));
      for(let i=0;i<2;i++)preparation[i*5+2]=g.where(g.and(skipApplied,g.eq(sourceIndex,1-i)),r.secondaryParameter,preparation[i*5+2]);
      return{applied:skipApplied,target:{skip:g.where(skipApplied,1,nextTarget.skip),defend:g.where(skipApplied,0,nextTarget.defend)}};
    },
    extraOutputs(g,p){
      const out=tension.extraOutputs(g,p),next=[...g.split(out.nextTension,6)];
      for(let i=0;i<2;i++){
        const dead=g.and(p.active,g.le(p.actors[i].hp,0)),skip=g.and(skipApplied,g.eq(p.sourceIndex,1-i));
        for(const j of[0,2])preparation[i*5+j]=g.where(dead,0,preparation[i*5+j]);
        next[i*3]=g.where(skip,0,next[i*3]);next[i*3+1]=g.where(skip,0,next[i*3+1]);
      }
      return{...out,nextTension:g.cat(next),nextPreparationState:g.cat(preparation),nextActors:g.cat(p.actors.flatMap(a=>ACTOR_FIELDS.map(k=>a[k]))),critical:g.cast(g.and(p.hit,g.eq(p.rule.id,112),g.gt(selectedDamage,0)),'float32'),secondaryApplied:g.cast(skipApplied,'float32'),selectorDamage:selectedDamage};
    }
  });
}
export async function writeGiyumeiAction(){
  const g=await buildGiyumeiAction(),bytes=g.model();auditModelBytes(bytes,{name:g.name});
  const report={schema:'dq9-giyumei-action-v1',name:g.name,sha256:hash(bytes),nodes:g.nodes.length,bytes:bytes.length,actionIds:GIYUMEI_ACTION_IDS,scope:g.contract.scope,proofStatus:'Generated candidate; independent actual-ROM comparisons are separate reports.'};
  for(const[file,value]of[[g.name+'.onnx',bytes],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n'],['giyumei-action-model.json',JSON.stringify(report,null,2)+'\n']]){await writeFile(new URL(file+'.tmp',dir),value);await rename(new URL(file+'.tmp',dir),new URL(file,dir));}
  return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await writeGiyumeiAction(),null,2));
