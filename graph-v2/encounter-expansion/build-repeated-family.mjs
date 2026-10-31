// A table-driven repeated caller. Target collection and target duplication
// remain separate ROM phases; one immutable hit graph is dispatched four times.
import {Graph} from '../graph-builder.mjs';
import {RandomGraph} from '../transition-graphs.mjs';
import {ACTOR_FIELDS} from '../rules.mjs';
import {BOSS_STATUS_FIELDS,decodeBossActionRule,bossRuleColumns} from '../boss-action-rules.mjs';
import {buildRomColumnActionCore} from './build-shared-action.mjs';
import {columnSelectorDamage} from './build-selector-columns.mjs';
import {buildRepeatedEntry,buildRepeatedHit} from './build-repeated-action.mjs';
import {buildDispelActionCore} from './build-dispel-action.mjs';
import {readDispelMasks} from './build-dispel-mask.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
export const REPEATED_FAMILY_IDS=[73,292,539,542,555];
export const REPEATED_FAMILY_RULES=REPEATED_FAMILY_IDS.map(id=>{
  const a=rom.actions.find(x=>x.id===id),b=Buffer.from(a.raw,'hex'),r={...decodeBossActionRule(id),damageId:a.damageId,damageCap:b.readUInt32LE(28)&0x3fff,forcedCritical:a.w08>>>29&1,selector:a.selector};
  if(r.operation!==1||r.damageId!==0||r.additional!==0||r.preCritical!==0||r.forcedCritical!==0)throw Error('Unsupported repeated action '+id);
  return r;
});
export const REPEATED_FAMILY_PHASE_COLUMNS=REPEATED_FAMILY_IDS.map(id=>{
  const r=REPEATED_FAMILY_RULES.find(x=>x.id===id),b=Buffer.from(r.raw,'hex'),code=b.readUInt32LE(28)>>>14&31;
  if(![1,3,4,5].includes(code))throw Error('Repeat code not covered by the bounded family '+code);
  return{id,mpCost:r.mpCost,repeatCode:code,resampleTargets:Number(code!==1),fixedCollectionCount:code===5?4:code===4?2:1,randomCollectionCount:Number(code===3),targetCopies:code===1?2:1};
});
const authority={
  caller:'JPN021ebd9c / USA021eb5d0',
  collection:'USA0215440c→0215fbe0 always materializes two random entries3..4/6..8. Repeat3 uses the first,4 uses2,5 uses4; each positive repeated target count draws bounded(originalCandidateCount). Repeat1 leaves the collected target list unchanged.',
  duplication:'USA021e8dc0 runs after collection and before MP/target loop. RepeatCode1 copies the collected target list twice, without RNG. This is separate from repeat-table count0; the remaining represented codes copy once.',
  combo:'USA021ea584 returns before combo context update when repeatCode is nonzero and hitIndex>0. Every hit still executes postprocess021e6a90, including combo clearing for a blocked/zero result.',
  loop:'Each planned iteration consumes its shared bounded100 before the dead-target test. Dead targets then skip damage/status/coup. The one source must remain eligible; this family has no represented self-effect.',
  source:'restored/dqix-decomp-decomp-matching/src/Combat/Overlay_24/func_ov024_021eb5d0.cpp',
  actualProbe:'evidence-v2/ghidra/emulation-repeated-family-probe-run/response.json'
};
function contract(){
  const c=structuredClone(buildRepeatedHit().contract);
  for(const k of ['hitCount','hitIndex','damageTotal']){delete c.inputDomains[k];delete c.defaults[k];delete c.feedback[k];}
  return{...c,actionRules:REPEATED_FAMILY_RULES,
    inputDomains:{...c.inputDomains,actionId:{values:REPEATED_FAMILY_IDS},sourceIndex:{values:[1]}},
    defaults:{...c.defaults,actionId:73,sourceIndex:1},repeatedAuthority:authority,repeatPhaseColumns:REPEATED_FAMILY_PHASE_COLUMNS,
    scope:'One enemy action body for the exact ROM records73/292/539/542/555, one initially live party target, one eligible enemy source, available target/event buffers, sufficient MP or unlimited enemy255. Both collection/resampling and later target duplication are represented. All four per-hit invocations share state/RNG and one caller context. No party variants, arbitrary repeat codes, multiple target identities, counter/reflection/redirect/equipment procs, insufficient-MP replacement, outer preparation/post, whole turn or camera claim.',
    scopeJa:'さみだれづき・さみだれぎり・おうふくビンタ・ラッシュ・念じボールの対象収集と複製を実ROM表で選び、同じヒット核を最大4回実行します。',
    totalDamageBound:'Source u16 attack/current values, binary32 physical damage and the represented selector/resistance/combo/cap order are retained. Uncapped292 has half physical damage, no combo and at most4 hits, total below262144. Other records use their raw caps:73/539/542 at1999,555 at999. All cumulative integer additions in the reset-at-entry program remain below2^24.',
    extensionStatus:'Separate repeated-family variant; the published73 and all five encounter programs remain immutable. Formal actual caller boundaries and shared73 regression are independent proof requirements.'};
}
const unpack=(g,x)=>{const a=g.split(x,66);return[0,1].map(i=>Object.fromEntries(ACTOR_FIELDS.map((k,j)=>[k,a[33*i+j]])));};
export function buildRepeatedFamilyEntry(){
  const c=contract(),names=['seed','position','actors','status','actionId','enabled'];
  const g=new Graph('rom-repeated-family-entry2',{...c,feedback:{seed:'nextSeed',position:'nextPosition',actors:'nextActors'},phase:'Whole-action collection, duplication and MP phase only.',defaults:Object.fromEntries(names.map(k=>[k,c.defaults[k]]))});
  const seed=g.input('seed',['N',8]),position=g.input('position',['N',1],'int32'),actorInput=g.input('actors',['N',66]),status=g.split(g.input('status',['N',14]),14),actionId=g.input('actionId'),enabled=g.input('enabled',['N',1],'bool'),actors=unpack(g,actorInput),source=actors[1],target=actors[0],r=bossRuleColumns(g,actionId,REPEATED_FAMILY_PHASE_COLUMNS);
  const supported=g.and(g.or(...REPEATED_FAMILY_IDS.map(id=>g.eq(actionId,id))),g.eq(target.acrobat,0),g.eq(source.criticalThreshold,0),...['sleep','paralysis','confusion','skip'].map(k=>g.eq(source[k],0)),g.ge(source.mp,r.mpCost),...[0,1].map(i=>g.or(g.eq(actors[i].poison,0),g.eq(status[BOSS_STATUS_FIELDS.indexOf(`a${i}_poisonKind`)],2))));
  const active=g.and(enabled,supported,g.gt(source.hp,0),g.gt(target.hp,0)),rng=new RandomGraph(g,seed,position),randomCount=g.add(rng.bounded(active,2),3);
  rng.bounded(active,3);
  const collectionCount=g.where(g.gt(r.randomCollectionCount,0),randomCount,r.fixedCollectionCount);
  for(let i=0;i<4;i++)rng.raw(g.and(active,g.gt(r.resampleTargets,0),g.gt(collectionCount,i)));
  const count=g.mul(collectionCount,r.targetCopies);
  source.mp=g.where(g.and(active,g.lt(source.mp,255)),g.sub(source.mp,r.mpCost),source.mp);
  for(const[n,v]of Object.entries({nextSeed:rng.seed,nextPosition:rng.position,nextActors:g.cat(actors.flatMap(a=>ACTOR_FIELDS.map(k=>a[k]))),hitCount:g.where(active,count,0),collectedTargetCount:g.where(active,collectionCount,0),hitIndex:g.mul(count,0),damageTotal:g.mul(count,0),entered:g.cast(active,'float32'),activeFlag:active,supported:g.cast(supported,'float32'),consumed:g.sub(rng.position,position)}))g.output(v,n);
  return g;
}
function targetKernel(){
  return buildRomColumnActionCore({name:'rom-repeated-family-target-kernel2',actionIds:REPEATED_FAMILY_IDS,actionRules:REPEATED_FAMILY_RULES,contract:contract(),
    gatherTargets:false,checkMp:false,spendMp:false,advanceContext:false,sharedBeforeTargetCheck:true,
    criticalCheck(g,rng,rule,gate,{source}){return g.and(gate,g.lt(rng.bounded(gate,10000),source.criticalThreshold));},
    comboUpdateGate(g,active){return g.and(active,g.eq(g.input('hitIndex'),0));},
    transformBaseDamage(g,rng,rule,hit,base,{source}){return columnSelectorDamage(g,rng,rule.selector,base,source.baseAttack,source.level,hit).damage;}
  });
}
export function buildRepeatedFamilyHit(){
  const k=targetKernel().json(),c=contract(),g=new Graph('rom-repeated-family-hit2',{
    ...c,phase:'One already planned target iteration; later hits preserve the combo context update gate, while blocked/zero postprocess can still clear it.',
    inputDomains:{...c.inputDomains,hitCount:{min:0,max:4,integer:true},hitIndex:{min:0,max:4,integer:true},damageTotal:{min:0,max:262144,integer:true}},
    defaults:{...c.defaults,hitCount:3,hitIndex:0,damageTotal:0},feedback:{...c.feedback,hitIndex:'nextHitIndex',damageTotal:'nextDamageTotal'}
  }),x=Object.fromEntries(k.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)])),count=g.input('hitCount'),index=x.hitIndex,total=g.input('damageTotal'),entered=g.and(x.enabled,g.lt(index,count));
  const out=g.inline(k,{...x,enabled:entered},'target');
  Object.assign(out,{nextHitIndex:g.where(entered,g.add(index,1),index),nextDamageTotal:g.add(total,out.damage),hitEntered:g.cast(entered,'float32')});
  for(const[n,v]of Object.entries(out))g.output(v,n);return g;
}
export function buildRepeatedFamilyFinish(){
  const g=new Graph('rom-repeated-family-finish2',{scope:'Commit one caller context token after the repeated-family action. No RNG, no arithmetic damage approximation.',
    inputDomains:{entered:{values:[0,1]},context:{min:0,max:65535,integer:true,width:2},damageTotal:{min:0,max:262144,integer:true},startPosition:{min:1,max:4990,integer:true},position:{min:1,max:4990,integer:true}},defaults:{entered:1,context:[1,0],damageTotal:0,startPosition:1,position:1},feedback:{context:'nextContext'}});
  const entered=g.input('entered'),context=g.split(g.input('context',['N',2]),2),total=g.input('damageTotal'),start=g.input('startPosition',['N',1],'int32'),position=g.input('position',['N',1],'int32'),low=g.add(context[0],entered),carry=g.floor(g.mul(low,1/65536)),high=g.add(context[1],carry);
  g.output(g.cat([g.sub(low,g.mul(carry,65536)),g.sub(high,g.mul(g.floor(g.mul(high,1/65536)),65536))]),'nextContext');g.output(total,'damage');g.output(g.sub(position,start),'consumed');return g;
}
export async function buildRepeatedFamilyProgram(){
  const names=['rom-repeated-family-entry2','rom-repeated-family-hit2','rom-preparation-death-sync2','rom-repeated-family-finish2'],models=new Map(),modules=[];
  for(const name of names){const [text,bytes]=await Promise.all([readFile(new URL(name+'.json',dir),'utf8'),readFile(new URL(name+'.onnx',dir))]);const ir=JSON.parse(text);models.set(name,ir);modules.push({name,onnx:name+'.onnx',ir:name+'.json',sha256:hash(bytes),nodes:ir.nodes.length,bytes:bytes.length});}
  const core=models.get(names[1]),death=models.get(names[2]),c=contract(),slots=[],byName=new Map(),inputs={},outputs={};
  function slot(name,d,initial){if(!byName.has(name)){const s={name,width:d.shape[1],dtype:d.dtype,initial:initial??{kind:'zero'}};byName.set(name,s);slots.push(s);}else if(byName.get(name).dtype!==d.dtype||byName.get(name).width!==d.shape[1])throw Error('Invalid repeated-family binding '+name);return name;}
  for(const d of core.inputs.filter(d=>!['hitCount','hitIndex','damageTotal'].includes(d.name))){const v=c.defaults[d.name];inputs[d.name]=slot('state.'+d.name,d,{kind:'input',path:[d.name],default:Array.isArray(v)?v:[v]});}
  const prep=death.inputs.find(d=>d.name==='preparationState');inputs.preparationState=slot('state.preparationState',prep,{kind:'input',path:['preparationState'],default:Array(10).fill(0)});
  slot('initial.position',{shape:['N',1],dtype:'int32'},{kind:'input',path:['position'],default:[1]});
  function call(name,id,inputMap,outputMap){const m=models.get(name);return{op:'call',id,model:name,inputs:Object.fromEntries(m.inputs.map(d=>{if(!inputMap[d.name])throw Error('Missing repeated-family binding '+id+'.'+d.name);slot(inputMap[d.name],d);return[d.name,inputMap[d.name]];})),outputs:Object.fromEntries(m.outputs.map(d=>[d.name,slot(outputMap[d.name]??'work.'+id+'.'+d.name,d)]))};}
  const stateInput=Object.fromEntries(core.inputs.map(d=>[d.name,inputs[d.name]??'work.'+d.name])),entry=call(names[0],'entry',inputs,{nextSeed:'state.seed',nextPosition:'state.position',nextActors:'state.actors',hitCount:'work.hitCount',hitIndex:'work.hitIndex',damageTotal:'work.damageTotal',entered:'work.entered',activeFlag:'work.active',supported:'result.supported'}),feedback={nextSeed:'state.seed',nextPosition:'state.position',nextActors:'state.actors',nextAux:'state.aux',nextStatus:'state.status',nextWakeSkip:'state.wakeSkip',nextCombo:'state.combo',nextContext:'state.context',nextHitIndex:'work.hitIndex',nextDamageTotal:'work.damageTotal'},hit=call(names[1],'hit',{...stateInput,enabled:'work.active'},feedback),sync=call(names[2],'death-sync',{actors:'state.actors',preparationState:'state.preparationState',enabled:'work.active'},{nextPreparationState:'state.preparationState'}),finish=call(names[3],'finish',{context:'state.context',damageTotal:'work.damageTotal',entered:'work.entered',position:'state.position',startPosition:'initial.position'},{nextContext:'state.context',damage:'result.damage',consumed:'result.consumed'});
  Object.assign(outputs,{nextSeed:'state.seed',nextPosition:'state.position',nextActors:'state.actors',nextAux:'state.aux',nextStatus:'state.status',nextWakeSkip:'state.wakeSkip',nextCombo:'state.combo',nextContext:'state.context',nextPreparationState:'state.preparationState',damage:'result.damage',consumed:'result.consumed',supported:'result.supported',active:'work.entered',hitCount:'work.hitCount',iterations:'work.hitIndex',collectedTargetCount:'work.entry.collectedTargetCount'});
  const capture={op:'capture',id:'hit-end',tensors:{...outputs,hitDamage:'work.hit.damage'}};delete capture.tensors.damage;delete capture.tensors.consumed;
  return{schema:'dq9-resident-onnx-program-v1',name:'dq9-enemy-repeated-family-caller',version:1,parameters:{},modules,slots,inputs,outputs,steps:[entry,{op:'repeat',id:'target',count:4,body:[hit,capture]},sync,finish],scope:c.scope,authority,actionIds:REPEATED_FAMILY_IDS,seedFiltering:false,cameraIncluded:false,phase:'One action body before outer post-action; target collection and duplication are both represented.'};
}
async function main(){
  const audit=await readDispelMasks(),frozen=[['rom-repeated-action-entry2',buildRepeatedEntry()],['rom-repeated-action-hit2',buildRepeatedHit()],['rom-dispel-action-core2',buildDispelActionCore(audit)]],baselines=[];
  for(const[name,g]of frozen){const b=await readFile(new URL(name+'.onnx',dir));if(hash(b)!==hash(g.model()))throw Error('Frozen generator changed '+name);baselines.push({name,sha256:hash(b),regeneratedEqual:true});}
  const models=[];for(const g of [buildRepeatedFamilyEntry(),buildRepeatedFamilyHit(),buildRepeatedFamilyFinish()]){const b=g.model();models.push({name:g.name,sha256:hash(b),nodes:g.nodes.length,bytes:b.length});for(const[file,value]of[[g.name+'.onnx',b],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n']]){await writeFile(new URL(file+'.tmp',dir),value);await rename(new URL(file+'.tmp',dir),new URL(file,dir));}}
  const p=await buildRepeatedFamilyProgram(),s=JSON.stringify(p,null,2)+'\n',report={schema:'dq9-repeated-family-models-v1',models,programSha256:hash(s),actionIds:REPEATED_FAMILY_IDS,phaseColumns:REPEATED_FAMILY_PHASE_COLUMNS,baselines,authority,proofStatus:'Pending complete actual caller and old73 exact comparison.'};
  for(const[file,value]of[['repeated-family-program.json',s],['repeated-family-models.json',JSON.stringify(report,null,2)+'\n']]){await writeFile(new URL(file+'.tmp',dir),value);await rename(new URL(file+'.tmp',dir),new URL(file,dir));}console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]===fileURLToPath(import.meta.url))await main();
