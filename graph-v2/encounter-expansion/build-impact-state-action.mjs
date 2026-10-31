// Two explicit original records share the existing damage caller. The new
// hooks add its secondary skip and post-action self-defense boundaries.
// This file never rewrites the frozen 52-action program or previous kernels.
import {physical} from '../graph-builder.mjs';
import {buildBossActionCore} from '../build-boss-action.mjs';
import {ACTOR_FIELDS} from '../rules.mjs';
import {decodeBossActionRule,resistanceFraction} from '../boss-action-rules.mjs';
import {createTensionDamageHooks} from './build-tension-actions.mjs';
import {buildWeaponTensionActionCore} from './build-weapon-tension-action.mjs';
import {readDispelMasks} from './build-dispel-mask.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
export const IMPACT_STATE_ACTION_IDS=[115,134];
export const IMPACT_STATE_RULES=IMPACT_STATE_ACTION_IDS.map(id=>{
  const a=rom.actions.find(r=>r.id===id),bytes=Buffer.from(a.raw,'hex');
  const r={...decodeBossActionRule(id),selector:a.selector,damageCap:bytes.readUInt32LE(28)&0x3fff,mpExempt:a.w08>>>28&1,afterAction:(bytes.readUInt32LE(44)>>>10)&15,effectElement:a.w18>>>27&31};
  if(r.operation!==1||a.damageId!==0||(bytes.readUInt32LE(28)>>>14&31)!==0||r.preCritical||r.damageCap!==1999||r.damageElement!==8||(a.w08>>>29&1))throw Error('Unexpected original impact-state row '+id);
  if(id===115&&(r.selector!==0||r.additional!==1||r.secondaryParameter!==5||r.mpCost!==2||r.mpExempt||r.afterAction!==0||r.baseChance!==25||r.effectElement!==15))throw Error('Unexpected original115 columns');
  if(id===134&&(r.selector!==11||r.additional!==0||r.mpCost!==4||r.mpExempt!==1||r.afterAction!==2))throw Error('Unexpected original134 columns');
  return r;
});
export async function buildImpactStateAction(){
  const reference=JSON.parse(await readFile(new URL('rom-weapon-tension-action-core2.json',dir),'utf8')),contract=structuredClone(reference.contract),tensionHooks=createTensionDamageHooks();
  delete contract.inputDomains.elementResistances;delete contract.fieldDomains.weapon;delete contract.defaults.weapon;delete contract.defaults.elementResistances;delete contract.weaponFields;delete contract.equipmentAuthority;delete contract.elementResistanceLayout;delete contract.originalDifference;
  let preparation,skipApplied;
  return buildBossActionCore({
    name:'rom-impact-state-action-core2',actionIds:IMPACT_STATE_ACTION_IDS,actionRules:IMPACT_STATE_RULES,checkMp:false,spendMp:false,
    preCriticalDamage:tensionHooks.preCriticalDamage,beforeComboDamage:tensionHooks.beforeComboDamage,
    contract:{
      ...contract,actionRules:IMPACT_STATE_RULES,inputDomains:{...contract.inputDomains,actionId:{values:IMPACT_STATE_ACTION_IDS},sourceIndex:{values:[1]}},defaults:{...contract.defaults,sourceIndex:1,actionId:115},
      scope:'Original115/134 enemy-to-party single-target action core only. Both use the existing exact physical/critical/accuracy/resistance/defend/tension/combo/cap/RNG caller. Action115 performs the additional skipKind5 probability before HP application and before wake/weapon/coup. Action134 applies selector11 half damage and dispatches the post-action self-defense handler index2, even on an ordinary miss or blocked hit. Source MP eligibility and spending honor original word08 bit28, which exempts134. Counter, redirection, reflect, barrier, metal, event-memory failure and unrepresented equipment/ailment modifiers remain excluded.',
      scopeJa:'ハートブレイクの追加行動不能と、シールドアタックの半減ダメージ・行動後の自己防御を、同じ行動処理と実ROMの列データで実行します。',
      support:'Enemy source192 and one living party target0. Source is free of sleep/paralysis/confusion/skip/appeal mode; enemy critical threshold0. Action115 requires MP2 or enemyMP255;134 has its explicit free-MP flag. Target raw tension flags/stage, primary states, skip subtype and ordinary defense are represented. Other restrictions of the decoded caller apply. A completed target death clears its represented statuses; no raw176-byte or complete battle claim.',
      resistanceContract:'For115, resistances[2] is target currentStats+0x4c, element15. Its nonzero byte gates one additional bounded100 draw when internal damage is positive. The chance is the separate original binary32 product baseChance * f32(byte/100), or100 for a critical. Both records use target element8 in resistances[4].',
      mpContract:'Raw record cost remains115=2/134=4. Word08 bit28 disables both the core MP-insufficiency replacement and expenditure for134. Other records are not inferred to share that exemption.',
      authority:{
        additional:'JPN021e3468 / USA021e2bd0: additional1, positive damage, nonzero stats4c, bounded100, then eligibility and setter',
        skipEligibility:'USA02088418: dead/high-tension/paralysis/same active skipKind reject',
        skipSetter:'JPN02088d70 / USA02088474: skipKind5, defend0, ordinary tension/stage0, primary sleep/confusion preserved',
        afterDispatcher:'USA021e6060: action word2c bits10..13 select eleven-entry member-pointer table',
        selfDefense:'JPN021e6058 / USA021e57c0: existing source currentStats+0x21 :=1',
        mpExemption:'USA021eaa50 precheck and021eb5d0 expenditure: action word08 bit28 suppresses both paths',
        probe:'evidence-v2/ghidra/emulation-enemy115-134-probe-run/response.json'
      },
      extensionStatus:'New two-record component. The frozen52-action family and previous encounter models are unchanged. Formal caller/followup proofs are separate artifacts.'
    },
    additionalSupport(g,r,{sourceIndex,source}){
      preparation=[...g.split(g.input('preparationState',['N',10]),10)];
      return g.and(g.eq(sourceIndex,1),g.eq(preparation[5],0),g.or(g.gt(r.mpExempt,0),g.ge(source.mp,255),g.ge(source.mp,r.mpCost)));
    },
    baseDamage(g,rng,r,hit,{attack,defense}){
      const p=physical(g,rng.seed,rng.position,attack,defense,hit);
      return{...p,damage:g.where(g.eq(r.selector,11),g.floor(g.mul(p.damage,.5)),p.damage)};
    },
    finalDamage(g,value,r){return g.min(value,r.damageCap);},
    targetEffect(g,r,hit,{sourceIndex,source,target,nextTarget,active,rng,internalDamage,critical,resistance}){
      // The preceding shared tension hook already declares this public input.
      if(!g.values.tension)throw Error('Tension hook must precede secondary effects');
      const fields=[...g.split('tension',6)],targetHigh=g.where(g.eq(sourceIndex,0),fields[5],fields[2]),kind=g.where(g.eq(sourceIndex,0),preparation[7],preparation[2]);
      const gate=g.and(hit,g.eq(r.additional,1),g.gt(internalDamage,0),g.gt(resistance[2],0)),roll=rng.bounded(gate,100),chance=g.where(critical,100,g.mul(r.baseChance,resistanceFraction(g,resistance[2])));
      skipApplied=g.and(gate,g.lt(roll,chance),g.gt(target.hp,0),g.eq(targetHigh,0),g.eq(target.paralysis,0),g.or(g.eq(target.skip,0),g.not(g.eq(kind,r.secondaryParameter))));
      for(let i=0;i<2;i++)preparation[i*5+2]=g.where(g.and(skipApplied,g.eq(sourceIndex,1-i)),r.secondaryParameter,preparation[i*5+2]);
      source.mp=g.where(g.and(active,g.eq(r.mpExempt,0),g.lt(source.mp,255)),g.max(g.sub(source.mp,r.mpCost),0),source.mp);
      return{applied:skipApplied,target:{skip:g.where(skipApplied,1,nextTarget.skip),defend:g.where(skipApplied,0,nextTarget.defend)}};
    },
    extraOutputs(g,p){
      const out=tensionHooks.extraOutputs(g,p),next=[...g.split(out.nextTension,6)];
      for(let i=0;i<2;i++){
        const dead=g.and(p.active,g.le(p.actors[i].hp,0)),target=g.and(skipApplied,g.eq(p.sourceIndex,1-i));
        for(const offset of[0,2])preparation[i*5+offset]=g.where(dead,0,preparation[i*5+offset]);
        next[i*3]=g.where(target,0,next[i*3]);next[i*3+1]=g.where(target,0,next[i*3+1]);
        const defend=g.and(p.active,g.eq(p.rule.afterAction,2),g.eq(p.sourceIndex,i),g.gt(p.actors[i].hp,0));
        p.actors[i].defend=g.where(defend,1,p.actors[i].defend);
      }
      return{...out,nextTension:g.cat(next),nextPreparationState:g.cat(preparation),nextActors:g.cat(p.actors.flatMap(a=>ACTOR_FIELDS.map(k=>a[k]))),secondaryApplied:g.cast(skipApplied,'float32')};
    }
  });
}
export async function writeImpactStateAction(){
  const audit=await readDispelMasks(),prior=await readFile(new URL('rom-weapon-tension-action-core2.onnx',dir)),regenerated=buildWeaponTensionActionCore(audit).model();
  if(hash(prior)!==hash(regenerated))throw Error('Existing weapon/tension caller changed while adding optional hook arguments');
  const g=await buildImpactStateAction(),b=g.model();auditModelBytes(b,{name:g.name});
  const report={schema:'dq9-impact-state-action-v1',name:g.name,sha256:hash(b),nodes:g.nodes.length,bytes:b.length,actionIds:IMPACT_STATE_ACTION_IDS,unchangedPreviousSha256:hash(prior),unchangedPreviousRegenerated:true,scope:g.contract.scope};
  for(const[file,value]of[[g.name+'.onnx',b],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n'],['impact-state-action-model.json',JSON.stringify(report,null,2)+'\n']]){await writeFile(new URL(file+'.tmp',dir),value);await rename(new URL(file+'.tmp',dir),new URL(file,dir));}
  return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await writeImpactStateAction(),null,2));
