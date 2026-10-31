// Enemy self-rank caller reuses the immutable no-damage self arithmetic.
// Numeric record fields determine MP cost/rank delta/target scope; no C++ copy.
import {Graph} from '../graph-builder.mjs';
import {RandomGraph,buffStat} from '../transition-graphs.mjs';
import {ACTOR_FIELDS} from '../rules.mjs';
import {AUX_FIELDS} from '../extended-rules.mjs';
import {decodeBossActionRule,bossRuleColumns} from '../boss-action-rules.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
export const SELF_RANK_IDS=[41];
export const SELF_RANK_RULES=SELF_RANK_IDS.map(id=>{const a=rom.actions.find(x=>x.id===id),r={...decodeBossActionRule(id),targetScope:Buffer.from(a.raw,'hex').readUInt32LE(20)>>>28};if(r.operation!==4||r.parameter!==1||r.preCritical!==0||r.damageElement!==0||r.accuracyMode!==3||r.criticalWeight!==0||r.additional||r.dodge||r.guard||r.blind||r.defend||r.buffAttack||r.recover||r.combo)throw Error('Unrepresented self rank rule '+id);return r;});
export async function buildSelfRank(){
  const event=JSON.parse(await readFile(new URL('rom-tension-event-core2.json',dir),'utf8')),body=JSON.parse(await readFile(new URL('rom-weapon-tension-action-core2.json',dir),'utf8'));
  const g=new Graph('rom-self-rank-action-core2',{
    ...body.contract,actionRules:SELF_RANK_RULES,inputDomains:{...body.contract.inputDomains,actionId:{values:SELF_RANK_IDS},sourceIndex:{values:[1]},targetCount:{min:0,max:1,integer:true}},defaults:{...body.contract.defaults,actionId:41,sourceIndex:1,targetCount:1},
    scope:'Enemy self target192, original41 positive defense rank only, both actors alive and source without primary/skip/appeal modes. targetCount1 denotes the one supplied self target. targetCount0 runs the original side2/scope2 uniform enemy selection (one live enemy) before repeat materialization. MP must cover cost unless it is255. Enemy weapon callbacks have no extra effect, so the rank/MP output writes commute with the reused self kernel after its pre-rank physical computation. The actual write is before weapon RNG; that RNG and represented outputs do not read rank or MP under this explicit scope. All tension fields persist; no ordinary/high consumption flag is set by this row.',
    scopeJa:'敵の自己スカラを実ROMの行動表から実行します。対象未選択時の追加乱数、MP消費、強化上限と期限、更新前の守備力を使う内部物理計算を保持します。',
    sourceScope:'Actual JPN021dc06c operation4, JPN020881b0 rank setter and preceding eligibility check; physical precedes the rank change, and weapon callback follows it. No reflection, failed allocation, redirected target, extra weapons, raw unrelated status flags or party self-cast is admitted.',
    targetContract:'Existing target list is exactly empty or [192]. One live enemy is the entire eligible enemy roster. This model is not general target collection for multiple enemies.',
    rankRule:'Positive delta from original signed parameter; rank<2 eligibility, next clamped[-2,2], rank0 clears duration/recovery, otherwise duration6/recovery0. Current DEF is recomputed by the existing f32→u16-before-cap buff kernel; base/current input consistency is an input contract.',
    authority:[{artifact:'evidence-v2/ghidra/rank-paralysis-drain-defined/response.json',handler:'JPN021dc06c',setter:'JPN020881b0'},{artifact:'evidence-v2/ghidra/emulation-rank-paralysis-drain-run/response.json',subset:'Original41 through-return callers, initial targetCount0'}],
    labels:{...body.contract.labels,targetCount:'初期自己対象数0または1'},feedback:body.contract.feedback
  }),x=Object.fromEntries(body.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)])),targetCount=g.input('targetCount'),a=[...g.split(x.actors,66)],aux=[...g.split(x.aux,35)],p=g.split(x.preparationState,10),get=k=>a[33+ACTOR_FIELDS.indexOf(k)],rule=bossRuleColumns(g,x.actionId,SELF_RANK_RULES),valid=g.and(g.eq(x.sourceIndex,1),g.or(...SELF_RANK_IDS.map(id=>g.eq(x.actionId,id))),g.eq(p[5],0),...['sleep','paralysis','confusion','skip'].map(k=>g.eq(get(k),0)),g.or(g.ge(get('mp'),255),g.ge(get('mp'),rule.mpCost))),active=g.and(x.enabled,valid,g.gt(a[ACTOR_FIELDS.indexOf('hp')],0),g.gt(get('hp'),0)),rng=new RandomGraph(g,x.seed,x.position);
  rng.bounded(g.and(active,g.eq(targetCount,0),g.eq(rule.targetScope,2)),1);
  const r=g.inline(event,{...x,seed:rng.seed,position:rng.position,actionId:g.constant(503),enabled:active},'self-arithmetic'),changed=g.and(active,g.lt(get('defenseRank'),2)),nextRank=g.where(changed,g.min(2,g.max(-2,g.add(get('defenseRank'),rule.parameter))),get('defenseRank'));
  a[33+ACTOR_FIELDS.indexOf('defenseRank')]=nextRank;a[33+ACTOR_FIELDS.indexOf('mp')]=g.where(g.and(active,g.lt(get('mp'),255)),g.sub(get('mp'),rule.mpCost),get('mp'));
  for(const[field,value]of[['a1_defenseRankDuration',g.where(g.eq(nextRank,0),0,6)],['a1_defenseRankRecovery',g.constant(0)]]){const i=AUX_FIELDS.indexOf(field);if(i<0)throw Error('Missing rank aux field');aux[i]=g.where(changed,value,aux[i]);}
  const zero=g.mul(get('hp'),0),out={...r,nextActors:g.cat(a),nextAux:g.cat(aux),nextStatus:x.status,nextWakeSkip:x.wakeSkip,supported:g.cast(valid,'float32'),consumed:g.sub(r.nextPosition,x.position),accuracyPassed:g.cast(active,'float32'),effectApplied:g.cast(changed,'float32'),poisoned:zero,angerActivated:zero,tensionConsumed:zero};
  for(const d of body.outputs){if(!out[d.name])throw Error('Missing shared output '+d.name);g.output(out[d.name],d.name);}g.output(buffStat(g,get('baseDefense'),nextRank,'defense',true,get('party')),'currentDefense');return g;
}
export async function writeSelfRank(){const g=await buildSelfRank(),b=g.model();auditModelBytes(b,{name:g.name});const report={schema:'dq9-self-rank-action-v1',name:g.name,sha256:hash(b),bytes:b.length,nodes:g.nodes.length,actionIds:SELF_RANK_IDS,sharedEventSha256:hash(await readFile(new URL('rom-tension-event-core2.onnx',dir))),scope:g.contract.scope};for(const[file,value]of[[g.name+'.onnx',b],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n'],['self-rank-action-model.json',JSON.stringify(report,null,2)+'\n']]){await writeFile(new URL(file+'.tmp',dir),value);await rename(new URL(file+'.tmp',dir),new URL(file,dir));}return report;}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await writeSelfRank(),null,2));
