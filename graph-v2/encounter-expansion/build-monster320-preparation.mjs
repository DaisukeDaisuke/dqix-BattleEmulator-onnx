// New preparation identity for the dynamic320 definition closure. The old
// common preparation kernel leaves MP validation to the actual core boundary.
import {Graph} from '../graph-builder.mjs';
import {buildNushiPreparation} from './build-nushi-preparation.mjs';
import {decodeBossActionRule} from '../boss-action-rules.mjs';
import {tensorContract,tensionState,packTension} from './build-tension-actions.mjs';
import {TENSION_FIELDS} from './build-tension-primitives.mjs';
import {ACTOR_FIELDS} from '../rules.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
export const MONSTER320_DEFINITION_IDS=[320,752,753,754,755];
export const MONSTER320_EXECUTED_IDS=[...new Set(MONSTER320_DEFINITION_IDS.flatMap(id=>rom.monsters.find(m=>m.id===id).actions).filter(id=>rom.actions.find(a=>a.id===id).operation!==34))];
export async function buildMonster320Preparation(){
  const rawRules=MONSTER320_EXECUTED_IDS.map(decodeBossActionRule),admissionRules=rawRules.map(r=>({...r,mpCost:0}));
  const kernel=await buildNushiPreparation({name:'rom-monster320-preparation-kernel2',actionIds:MONSTER320_EXECUTED_IDS,actionRules:admissionRules,appealObjectFlags(g,flags){const f=[...g.split(flags,8)],t=tensionState(g);f[3]=t[0].high;f[7]=t[1].high;return g.cat(f);}}),k=kernel.json();
  const g=new Graph('rom-monster320-preparation2',{
    ...k.contract,actionRules:rawRules,fieldDomains:{...k.contract.fieldDomains,tension:tensorContract.fieldDomains},defaults:{...k.contract.defaults,sourceIndex:1,actionId:558,targetCount:1,tension:Array(6).fill(0)},feedback:{...k.contract.feedback,tension:'nextTension'},tensionFields:TENSION_FIELDS,
    scope:'Separate actual preparation for executed records in original definitions320/752/753/754/755 and party normal1. Existing exact appeal→primary recovery→cleanup/event routing is reused. MP is neither validated nor paid here: even MP0 retains583 until the actual core precheck. Tension high flag enters actual appeal eligibility; successful type1 clears only ordinary tension/stage. No AI selection occurs inside this model. nextTargetCount retains planned semantic target count; nextActualTargetCount exposes the separate fresh command buffer count0 before core collection.',
    scopeJa:'320系の計画済み行動を、魅了・主状態回復・行動前整理へ接続します。MP不足時の置換は、実ROMと同じく後続の行動本体入口で処理します。',
    minimumMpAdmission:rawRules.map(r=>({actionId:r.id,rawCost:r.mpCost,preparationChecksMp:false})),
    mpAuthority:{matching:'func_ov024_021eaa50.cpp',rule:'Validation belongs to the core caller, after preparation. Cost255 requires nonzero MP; enemyMP>=255 remains exempt.',actual:'evidence-v2/ghidra/emulation-monster320-prepared-run/response.json'},
    constraints:'One stable party0 and enemy192, successful event allocation, no force/reflection/excluded roster. Source confusion selection is unsupported. Ordinary record target identity is validated by the containing family/turn program.'
  }),x=Object.fromEntries(k.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)])),out=g.inline(k,x,'prepare'),t=g.split(x.tension,6),state=[0,1].map(i=>({stage:t[i*3],low:t[i*3+1],high:t[i*3+2]})),apply=g.and(out.active,g.not(out.recovered),out.appealSuccess,g.eq(out.appealType,1));
  for(let i=0;i<2;i++){const selected=g.and(apply,g.eq(x.sourceIndex,i));state[i].stage=g.where(selected,0,state[i].stage);state[i].low=g.where(selected,0,state[i].low);}
  out.nextTension=packTension(g,state);out.nextActualTargetCount=g.mul(out.nextTargetCount,0);for(const[n,v]of Object.entries(out))g.output(v,n);return g;
}
export function buildMonster320CoreEntry(){
  const rules=MONSTER320_EXECUTED_IDS.map(decodeBossActionRule),g=new Graph('rom-monster320-core-entry2',{
    routingOnly:true,scope:'Original core-entry MP precheck for the declared one-party/one-enemy320 action closure. The caller retains583 during preparation, replaces it by504 at MP0, then collects one self target. Cost255 tests zero, ordinary costs test insufficiency, and enemyMP>=255 bypasses payment. Payment and all collection RNG remain in the selected body/event kernels. The stable one-target roster is explicit, not an arbitrary target enumerator.',
    inputDomains:{actors:{min:-65535,max:65535,integer:false,width:66},sourceIndex:{values:[0,1]},actionId:{min:0,max:65535,integer:true},targetCount:{min:0,max:8,integer:true},enabled:{values:[0,1,false,true]}},
    defaults:{actors:Array(66).fill(0),sourceIndex:1,actionId:583,targetCount:1,enabled:true},authority:{caller:'JPN021ebd9c',precheck:'USA021eaa50',actual:'evidence-v2/ghidra/emulation-monster320-prepared-run/response.json'}
  }),actors=g.split(g.input('actors',['N',66]),66),source=g.input('sourceIndex'),action=g.input('actionId'),count=g.input('targetCount'),enabled=g.input('enabled',['N',1],'bool'),party=g.eq(source,0),value=k=>g.where(party,actors[ACTOR_FIELDS.indexOf(k)],actors[33+ACTOR_FIELDS.indexOf(k)]),active=g.and(enabled,g.gt(value('hp'),0)),mp=value('mp'),known=g.or(...rules.map(r=>g.eq(action,r.id))),oldEvent=g.or(...[503,504,900,901,938].map(id=>g.eq(action,id)));
  let cost=g.constant(0);for(const r of rules)cost=g.where(g.eq(action,r.id),r.mpCost,cost);
  const insufficient=g.and(active,known,g.or(party,g.lt(mp,255)),g.or(g.and(g.eq(cost,255),g.eq(mp,0)),g.and(g.not(g.eq(cost,255)),g.lt(mp,cost)))),nextAction=g.where(insufficient,504,action),event=g.or(oldEvent,insufficient),supported=g.or(known,oldEvent),self=g.or(event,...[161,587,558,577].map(id=>g.eq(nextAction,id)));
  for(const[n,v]of Object.entries({nextAction,nextTargetCount:g.where(insufficient,0,count),nextActualTargetCount:g.where(active,1,0),nextTarget:g.where(party,192,g.where(self,192,0)),ordinaryGate:g.and(active,supported,g.not(event)),eventGate:g.and(active,supported,event),insufficientMp:insufficient,supported,active}))g.output(v,n);return g;
}
export async function writeMonster320Preparation(){const models=[];for(const g of[await buildMonster320Preparation(),buildMonster320CoreEntry()]){const b=g.model();auditModelBytes(b,{name:g.name});models.push({name:g.name,sha256:hash(b),nodes:g.nodes.length,bytes:b.length,scope:g.contract.scope});for(const[f,v]of[[g.name+'.onnx',b],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n']]){await writeFile(new URL(f+'.tmp',dir),v);await rename(new URL(f+'.tmp',dir),new URL(f,dir));}}const report={schema:'dq9-monster320-preparation-v2',models,actionIds:MONSTER320_EXECUTED_IDS};await writeFile(new URL('monster320-preparation-model.json.tmp',dir),JSON.stringify(report,null,2)+'\n');await rename(new URL('monster320-preparation-model.json.tmp',dir),new URL('monster320-preparation-model.json',dir));return report;}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await writeMonster320Preparation(),null,2));
