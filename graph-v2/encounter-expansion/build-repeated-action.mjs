// A repeated action has one collection/MP phase and several target-loop steps.
// All numeric rules remain in ONNX; the declarative program reuses one hit
// kernel. The immutable single-hit cores keep their original phase boundary.
import {Graph} from '../graph-builder.mjs';
import {RandomGraph} from '../transition-graphs.mjs';
import {ACTOR_FIELDS} from '../rules.mjs';
import {BOSS_STATUS_FIELDS,decodeBossActionRule} from '../boss-action-rules.mjs';
import {buildRomColumnActionCore} from './build-shared-action.mjs';
import {physicalSelectorDamage} from './build-physical-selectors.mjs';
import {buildIncapacityActionCore} from './build-incapacity-action.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
const record=rom.actions.find(a=>a.id===73),raw=Buffer.from(record.raw,'hex');
export const REPEATED_RULE={...decodeBossActionRule(73),damageId:record.damageId,damageCap:raw.readUInt32LE(28)&0x3fff,forcedCritical:record.w08>>>29&1,selector:record.selector};
if(REPEATED_RULE.operation!==1||REPEATED_RULE.selector!==11||(raw.readUInt32LE(28)>>>14&31)!==3||REPEATED_RULE.preCritical!==0||REPEATED_RULE.mpCost!==4||REPEATED_RULE.combo!==0)throw Error('Unexpected action73 table record');
const authority={
  caller:'JPN021ebd9c / USA021eb5d0',
  targetCollection:'USA0215440c calls repeat helper0215fbe0, which always draws inclusive3..4 and6..8. RepeatCode3 selects the first, then one bounded(candidateCount) draw per repeated target.',
  loop:'The per-target shared bounded100 is before the target-dead test. A dead target skips all subsequent hit arithmetic but its already planned iteration still consumes that shared draw. Source-dead/incapacitated breaks before it.',
  boundary:'Gather and MP spending occur once before the target loop. Enemy-only action73 has no party after-action coup/critical-anger phase. One caller context token is committed after the loop.',
  source:'restored/dqix-decomp-decomp-matching/src/Combat/Overlay_24/func_ov024_021eb5d0.cpp',
  actualProbe:'evidence-v2/ghidra/emulation-physical-selector-probe-run/response.json'
};
function contract(){
  const c=structuredClone(buildIncapacityActionCore().contract);
  delete c.fieldDomains.preparationState;delete c.defaults.preparationState;delete c.feedback.preparationState;
  return{...c,actionRules:[REPEATED_RULE],inputDomains:{...c.inputDomains,actionId:{values:[73]},sourceIndex:{values:[1]}},fieldDomains:{...c.fieldDomains,actors:c.fieldDomains.actors.map(r=>r.name==='actor1.level'?{...r,max:99}:r)},
    defaults:{...c.defaults,actionId:73,sourceIndex:1},repeatedAuthority:authority,
    scope:'Enemy action73 only, exactly one initially live party target and live eligible enemy source, successful target/event allocation, no reflection/counter/redirect/equipment procs. Existing actor/aux/status projections and exclusions remain. The initial caller requires MP>=4 or the actual enemy unlimited-MP255 convention. Later hit steps accept the already spent MP. No party73, insufficient-MP substitution, multiple target identities, or enclosing turn claim.',
    scopeJa:'敵のさみだれづき1行動を、対象収集1回と3〜4回のヒットに分けて処理します。死亡後の予定ヒットも共通乱数1回を消費します。',
    repeatedActionExclusion:undefined,extensionStatus:'New repeated-action component; exact formal caller comparison is required before encounter integration.'};
}
const unpack=(g,input)=>{const a=g.split(input,66);return[0,1].map(i=>Object.fromEntries(ACTOR_FIELDS.map((k,j)=>[k,a[33*i+j]])));};
export function buildRepeatedEntry(){
  const c=contract(),names=['seed','position','actors','status','enabled'];
  const g=new Graph('rom-repeated-action-entry2',{...c,feedback:{seed:'nextSeed',position:'nextPosition',actors:'nextActors'},phase:'One whole-action collection and MP phase; repeat count0 is an inactive identity.',defaults:Object.fromEntries(names.map(k=>[k,c.defaults[k]]))});
  const seed=g.input('seed',['N',8]),position=g.input('position',['N',1],'int32'),actorsInput=g.input('actors',['N',66]),status=g.split(g.input('status',['N',14]),14),enabled=g.input('enabled',['N',1],'bool'),actors=unpack(g,actorsInput),source=actors[1],target=actors[0];
  const supported=g.and(g.eq(target.acrobat,0),g.eq(source.criticalThreshold,0),...['sleep','paralysis','confusion','skip'].map(k=>g.eq(source[k],0)),g.ge(source.mp,4),...[0,1].map(i=>g.or(g.eq(actors[i].poison,0),g.eq(status[BOSS_STATUS_FIELDS.indexOf(`a${i}_poisonKind`)],2))));
  const active=g.and(enabled,supported,g.gt(source.hp,0),g.gt(target.hp,0)),rng=new RandomGraph(g,seed,position),count=g.add(rng.bounded(active,2),3);
  rng.bounded(active,3); // The6..8 table entry is populated even for repeatCode3.
  for(let i=0;i<4;i++)rng.raw(g.and(active,g.gt(count,i))); // bounded1 target draws.
  source.mp=g.where(g.and(active,g.lt(source.mp,255)),g.sub(source.mp,4),source.mp);
  const out={nextSeed:rng.seed,nextPosition:rng.position,nextActors:g.cat(actors.flatMap(a=>ACTOR_FIELDS.map(k=>a[k]))),hitCount:g.where(active,count,0),hitIndex:g.mul(count,0),damageTotal:g.mul(count,0),entered:g.cast(active,'float32'),activeFlag:active,supported:g.cast(supported,'float32'),consumed:g.sub(rng.position,position)};
  for(const[n,v]of Object.entries(out))g.output(v,n);return g;
}
function buildTargetKernel(){
  return buildRomColumnActionCore({name:'rom-repeated-target-kernel2',actionIds:[73],actionRules:[REPEATED_RULE],contract:contract(),
    gatherTargets:false,checkMp:false,spendMp:false,advanceContext:false,sharedBeforeTargetCheck:true,
    criticalCheck(g,rng,rule,gate,{source}){return g.and(gate,g.lt(rng.bounded(gate,10000),source.criticalThreshold));},
    transformBaseDamage(g,rng,rule,hit,base,{source}){return physicalSelectorDamage(g,rng,rule.selector,base,source.baseAttack,source.level,hit);}
  });
}
export function buildRepeatedHit(){
  const kernel=buildTargetKernel().json(),c=contract(),g=new Graph('rom-repeated-action-hit2',{
    ...c,phase:'One already gathered target-loop iteration. Shared RNG precedes the target-dead gate; MP and context are unchanged.',
    inputDomains:{...c.inputDomains,hitCount:{min:0,max:4,integer:true},hitIndex:{min:0,max:4,integer:true},damageTotal:{min:0,max:7996,integer:true}},
    defaults:{...c.defaults,hitCount:3,hitIndex:0,damageTotal:0},feedback:{...c.feedback,hitIndex:'nextHitIndex',damageTotal:'nextDamageTotal'}
  }),x=Object.fromEntries(kernel.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)])),count=g.input('hitCount'),index=g.input('hitIndex'),total=g.input('damageTotal'),entered=g.and(x.enabled,g.lt(index,count));
  const out=g.inline(kernel,{...x,enabled:entered},'target');
  Object.assign(out,{nextHitIndex:g.where(entered,g.add(index,1),index),nextDamageTotal:g.add(total,out.damage),hitEntered:g.cast(entered,'float32')});
  for(const[n,v]of Object.entries(out))g.output(v,n);return g;
}
export function buildRepeatedFinish(){
  const g=new Graph('rom-repeated-action-finish2',{scope:'Commit one caller context token after the repeated action. Integer two-limb counter, no RNG and no battle arithmetic.',scopeJa:'連続ヒット全体を1行動としてcontextを1回だけ進めます。',
    inputDomains:{entered:{values:[0,1]},context:{min:0,max:65535,integer:true,width:2},damageTotal:{min:0,max:7996,integer:true},startPosition:{min:1,max:4990,integer:true},position:{min:1,max:4990,integer:true}},defaults:{entered:1,context:[1,0],damageTotal:0,startPosition:1,position:1},feedback:{context:'nextContext'}});
  const entered=g.input('entered'),context=g.split(g.input('context',['N',2]),2),total=g.input('damageTotal'),start=g.input('startPosition',['N',1],'int32'),position=g.input('position',['N',1],'int32'),low=g.add(context[0],entered),carry=g.floor(g.mul(low,1/65536)),high=g.add(context[1],carry);
  g.output(g.cat([g.sub(low,g.mul(carry,65536)),g.sub(high,g.mul(g.floor(g.mul(high,1/65536)),65536))]),'nextContext');g.output(total,'damage');g.output(g.sub(position,start),'consumed');return g;
}
export async function buildRepeatedProgram(){
  const names=['rom-repeated-action-entry2','rom-repeated-action-hit2','rom-preparation-death-sync2','rom-repeated-action-finish2'],models=new Map(),modules=[];
  for(const name of names){const [text,bytes]=await Promise.all([readFile(new URL(name+'.json',dir),'utf8'),readFile(new URL(name+'.onnx',dir))]);const ir=JSON.parse(text);models.set(name,ir);modules.push({name,onnx:name+'.onnx',ir:name+'.json',sha256:hash(bytes),nodes:ir.nodes.length,bytes:bytes.length});}
  const core=models.get(names[1]),death=models.get(names[2]),c=contract(),slots=[],byName=new Map(),inputs={},outputs={};
  function slot(name,d,initial){if(!byName.has(name)){const s={name,width:d.shape[1],dtype:d.dtype,initial:initial??{kind:'zero'}};byName.set(name,s);slots.push(s);}else if(byName.get(name).dtype!==d.dtype||byName.get(name).width!==d.shape[1])throw Error('Invalid repeated binding '+name);return name;}
  for(const d of core.inputs.filter(d=>!['hitCount','hitIndex','damageTotal'].includes(d.name))){const v=c.defaults[d.name];inputs[d.name]=slot('state.'+d.name,d,{kind:'input',path:[d.name],default:Array.isArray(v)?v:[v]});}
  const prep=death.inputs.find(d=>d.name==='preparationState');inputs.preparationState=slot('state.preparationState',prep,{kind:'input',path:['preparationState'],default:Array(10).fill(0)});
  slot('initial.position',{shape:['N',1],dtype:'int32'},{kind:'input',path:['position'],default:[1]});
  function call(name,id,inputMap,outputMap){const m=models.get(name);return{op:'call',id,model:name,inputs:Object.fromEntries(m.inputs.map(d=>{if(!inputMap[d.name])throw Error('Missing repeated input '+id+'.'+d.name);slot(inputMap[d.name],d);return[d.name,inputMap[d.name]];})),outputs:Object.fromEntries(m.outputs.map(d=>[d.name,slot(outputMap[d.name]??'work.'+id+'.'+d.name,d)]))};}
  const stateInput=Object.fromEntries(core.inputs.map(d=>[d.name,inputs[d.name]??'work.'+d.name]));
  const entry=call(names[0],'entry',inputs,{nextSeed:'state.seed',nextPosition:'state.position',nextActors:'state.actors',hitCount:'work.hitCount',hitIndex:'work.hitIndex',damageTotal:'work.damageTotal',entered:'work.entered',activeFlag:'work.active',supported:'result.supported'});
  const feedback={nextSeed:'state.seed',nextPosition:'state.position',nextActors:'state.actors',nextAux:'state.aux',nextStatus:'state.status',nextWakeSkip:'state.wakeSkip',nextCombo:'state.combo',nextContext:'state.context',nextHitIndex:'work.hitIndex',nextDamageTotal:'work.damageTotal'};
  const hit=call(names[1],'hit',{...stateInput,enabled:'work.active'},feedback),sync=call(names[2],'death-sync',{actors:'state.actors',preparationState:'state.preparationState',enabled:'work.active'},{nextPreparationState:'state.preparationState'}),finish=call(names[3],'finish',{context:'state.context',damageTotal:'work.damageTotal',entered:'work.entered',position:'state.position',startPosition:'initial.position'},{nextContext:'state.context',damage:'result.damage',consumed:'result.consumed'});
  Object.assign(outputs,{nextSeed:'state.seed',nextPosition:'state.position',nextActors:'state.actors',nextAux:'state.aux',nextStatus:'state.status',nextWakeSkip:'state.wakeSkip',nextCombo:'state.combo',nextContext:'state.context',nextPreparationState:'state.preparationState',damage:'result.damage',consumed:'result.consumed',supported:'result.supported',active:'work.entered',hitCount:'work.hitCount',iterations:'work.hitIndex'});
  const capture={op:'capture',id:'hit-end',tensors:{...outputs,hitDamage:'work.hit.damage'}};
  // Do not capture unfinished result-only slots before the final commit.
  delete capture.tensors.damage;delete capture.tensors.consumed;
  return{schema:'dq9-resident-onnx-program-v1',name:'dq9-enemy-repeated73-caller',version:1,parameters:{},modules,slots,inputs,outputs,steps:[entry,{op:'repeat',id:'target',count:4,body:[hit,capture]},sync,finish],scope:c.scope,authority,seedFiltering:false,cameraIncluded:false,phase:'One action body only, before outer post-action processing.'};
}
async function main(){
  const frozen=await readFile(new URL('rom-incapacity-action-core2.onnx',dir));if(hash(frozen)!==hash(buildIncapacityActionCore().model()))throw Error('Frozen33 core changed');
  const graphs=[buildRepeatedEntry(),buildRepeatedHit(),buildRepeatedFinish()],models=[];
  for(const g of graphs){const b=g.model();models.push({name:g.name,sha256:hash(b),nodes:g.nodes.length,bytes:b.length});for(const[file,value]of[[g.name+'.onnx',b],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n']]){await writeFile(new URL(file+'.tmp',dir),value);await rename(new URL(file+'.tmp',dir),new URL(file,dir));}}
  const program=await buildRepeatedProgram(),text=JSON.stringify(program,null,2)+'\n';await writeFile(new URL('repeated-action-program.json.tmp',dir),text);await rename(new URL('repeated-action-program.json.tmp',dir),new URL('repeated-action-program.json',dir));
  const report={schema:'dq9-repeated-action-models-v1',models,programSha256:hash(text),actionId:73,immutableSingleHitSha256:hash(frozen),authority,proofStatus:'Pending actual fullcaller comparison; this program is one action body, not yet attached to an encounter.'};
  await writeFile(new URL('repeated-action-models.json.tmp',dir),JSON.stringify(report,null,2)+'\n');await rename(new URL('repeated-action-models.json.tmp',dir),new URL('repeated-action-models.json',dir));console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]===fileURLToPath(import.meta.url))await main();
