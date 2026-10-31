// Small typed routing around immutable numeric kernels. The schedule does not
// duplicate a large core for every hit, infer decisions on the host, or filter
// seeds. Four target-loop calls share one already verified ONNX model.
import {Graph} from '../graph-builder.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
const FLAGS=['critical','accuracyPassed','effectApplied','poisoned','charged','angerActivated'];
const STATES={seed:'nextSeed',position:'nextPosition',actors:'nextActors',aux:'nextAux',status:'nextStatus',wakeSkip:'nextWakeSkip',combo:'nextCombo',context:'nextContext',preparationState:'nextPreparationState'};
const flagRule={min:0,max:1,integer:true};
async function read(name){for(const prefix of['','../'])try{const bytes=await readFile(new URL(prefix+name+'.onnx',dir)),text=await readFile(new URL(prefix+name+'.json',dir),'utf8');return{ir:JSON.parse(text),module:{name,onnx:prefix+name+'.onnx',ir:prefix+name+'.json',sha256:hash(bytes),bytes:bytes.length}};}catch(e){if(e.code!=='ENOENT')throw e;}throw Error('Missing family module '+name);}
function buildRoute(core,options={}){
  const c=structuredClone(core.contract),ids=c.actionRules.map(r=>r.id),repeatedIds=options.repeatedIds??[73],g=new Graph(options.routeName??'rom-action-family-route2',{
    ...c,routingOnly:true,actionRules:[...c.actionRules],
    inputDomains:{...c.inputDomains,actionId:{min:0,max:680,integer:true},position:{min:1,max:4900,integer:true}},
    fieldDomains:{...c.fieldDomains,actors:c.fieldDomains.actors.map(r=>r.name==='actor1.level'?{...r,max:99}:r)},
    scope:options.scope??'Pure family dispatch and front-loaded input contract checks. Single-hit records use the immutable39 core; enemy73 uses collection plus up to4 existing hit calls; enemy30/587 use self-target healing. Unknown action/source combinations are supported0 and preserve every state and RNG. The common family is restricted to enemy level0..99 and entry position<=4900 so every unselected kernel is also in its declared input domain.',
    scopeJa:options.scopeJa??'単発39行動・敵の連続攻撃73・自己回復30/587を選び、全バッチを同じ小核へ接続します。未対応の行動は状態を進めません。',
    defaultFamily:'normal',defaults:{...c.defaults,actionId:1},feedback:{},...(options.routeContract??{})
  }),x=Object.fromEntries(core.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)]));
  const normal=g.and(g.or(...ids.map(id=>g.eq(x.actionId,id))),g.or(g.eq(x.sourceIndex,1),g.eq(x.actionId,1))),repeated=g.and(g.eq(x.sourceIndex,1),g.or(...repeatedIds.map(id=>g.eq(x.actionId,id)))),heal=g.and(g.eq(x.sourceIndex,1),g.or(g.eq(x.actionId,30),g.eq(x.actionId,587))),known=g.or(normal,repeated,heal);
  const zero=g.mul(x.actionId,0),out={family:g.where(repeated,1,g.where(heal,2,0)),known:g.cast(known,'float32'),normalAction:g.where(normal,x.actionId,1),normalEnabled:g.and(x.enabled,normal),repeatedEnabled:g.and(x.enabled,repeated),healAction:g.where(heal,x.actionId,30),healEnabled:g.and(x.enabled,heal),startPosition:x.position,zeroFlags:g.cat(Array(6).fill(zero))};
  if(options.repeatedIds)out.repeatedAction=g.where(repeated,x.actionId,repeatedIds[0]);
  for(const[n,v]of Object.entries(out))g.output(v,n);return g;
}
function buildFlagUnion(){
  const g=new Graph('rom-action-family-flags2',{routingOnly:true,scope:'Pure OR reduction of the existing per-hit0/1 diagnostics. No combat probability or branch is evaluated here.',scopeJa:'各ヒットで出たフラグを行動全体の記録へまとめます。',inputDomains:{flags:{...flagRule,width:6},...Object.fromEntries(FLAGS.map(n=>[n,flagRule]))},defaults:{flags:Array(6).fill(0),...Object.fromEntries(FLAGS.map(n=>[n,0]))}}),old=g.split(g.input('flags',['N',6]),6);
  g.output(g.cat(FLAGS.map((n,i)=>g.max(old[i],g.input(n)))),'nextFlags');return g;
}
function buildResult(options={}){
  const diagnostics=['damage','internalDamage','active','supported',...FLAGS],g=new Graph(options.resultName??'rom-action-family-result2',{routingOnly:true,scope:'Select diagnostics from the selected immutable action family and measure the total position delta. State tensors are already committed by their numeric kernels. Repeated damage is the sum of the original per-hit damage values, with flags OR-reduced over the hit loop.',scopeJa:'選んだ行動の結果と全乱数消費数を返します。各状態値は元の数値核が更新した値を保持します。',inputDomains:{family:{values:[0,1,2]},known:flagRule,startPosition:{min:1,max:4900,integer:true},position:{min:1,max:4990,integer:true},repeatFlags:{...flagRule,width:6},repeatDamage:{min:0,max:options.totalDamageMax??7996,integer:true},repeatActive:flagRule,repeatSupported:flagRule,repeatCount:{min:0,max:4,integer:true},repeatIterations:{min:0,max:4,integer:true}},fieldDomains:{combo:[{min:0,max:2,integer:true},{min:0,max:127,integer:true},{min:0,max:65535,integer:true},{min:-1,max:255,integer:true},{min:0,max:65535,integer:true},{min:0,max:65535,integer:true}]}});
  const family=g.input('family'),known=g.input('known'),start=g.input('startPosition',['N',1],'int32'),position=g.input('position',['N',1],'int32'),combo=g.split(g.input('combo',['N',6]),6),repeatFlags=g.split(g.input('repeatFlags',['N',6]),6),repeatDamage=g.input('repeatDamage'),repeatActive=g.input('repeatActive'),repeatSupported=g.input('repeatSupported'),repeatCount=g.input('repeatCount'),repeatIterations=g.input('repeatIterations');
  const normal=Object.fromEntries(diagnostics.map(n=>[n,g.input('normal_'+n)])),heal=Object.fromEntries([...diagnostics,'recoveryAmount','healed'].map(n=>[n,g.input('heal_'+n)]));
  const select=(n,repeated)=>g.where(g.eq(family,1),repeated,g.where(g.eq(family,2),heal[n],normal[n]));
  const out={damage:select('damage',repeatDamage),internalDamage:select('internalDamage',repeatDamage),active:select('active',repeatActive),supported:g.mul(known,select('supported',repeatSupported)),consumed:g.sub(position,start),comboSide:combo[0],comboCount:combo[1],comboAction:combo[2],comboTarget:combo[3],hitCount:g.where(g.eq(family,1),repeatCount,0),iterations:g.where(g.eq(family,1),repeatIterations,0),recoveryAmount:g.where(g.eq(family,2),heal.recoveryAmount,0),healed:g.where(g.eq(family,2),heal.healed,0)};
  if(options.repeatedIds){g.contract.inputDomains.repeatCollected={min:0,max:4,integer:true};out.collectedTargetCount=g.where(g.eq(family,1),g.input('repeatCollected'),0);}
  for(let i=0;i<FLAGS.length;i++)out[FLAGS[i]]=select(FLAGS[i],repeatFlags[i]);
  for(const[n,v]of Object.entries(out))g.output(v,n);return g;
}
export async function buildActionFamilyProgram(options={}){
  const coreName=options.coreName??'rom-column-action-core2',core=(await read(coreName)).ir,newGraphs=[buildRoute(core,options),buildFlagUnion(),buildResult(options)];
  if(options.persist!==false)for(const g of newGraphs){let existing;try{existing=await readFile(new URL(g.name+'.onnx',dir));}catch(e){if(e.code!=='ENOENT')throw e;}if(existing&&hash(existing)===hash(g.model()))continue;await g.save(dir);}
  const names=[newGraphs[0].name,coreName,options.entryName??'rom-repeated-action-entry2',options.hitName??'rom-repeated-action-hit2','rom-action-family-flags2',options.finishName??'rom-repeated-action-finish2','rom-self-heal-action-core2','rom-preparation-death-sync2',newGraphs[2].name],loaded=await Promise.all(names.map(read)),models=new Map(loaded.map(x=>[x.ir.name,x.ir])),slots=[],byName=new Map(),inputs={},outputs={};
  function slot(name,d,initial){if(byName.has(name)){const old=byName.get(name);if(old.dtype!==d.dtype||old.width!==d.shape[1])throw Error('Family type mismatch '+name);if(initial)old.initial=initial;}else{const s={name,width:d.shape[1],dtype:d.dtype,initial:initial??{kind:'zero'}};slots.push(s);byName.set(name,s);}return name;}
  for(const d of core.inputs){const v=core.contract.defaults[d.name];inputs[d.name]=slot('state.'+d.name,d,{kind:'input',path:[d.name],default:Array.isArray(v)?v:[v]});}
  slot('constant.enemy',{shape:['N',1],dtype:'float32'},{kind:'constant',values:[1]});slot('constant.action73',{shape:['N',1],dtype:'float32'},{kind:'constant',values:[73]});
  function call(name,id,bindings,out={}){const m=models.get(name);return{op:'call',id,model:name,inputs:Object.fromEntries(m.inputs.map(d=>{const s=bindings[d.name];if(!s)throw Error('Missing family binding '+id+'.'+d.name);return[d.name,slot(s,d)];})),outputs:Object.fromEntries(m.outputs.map(d=>[d.name,slot(out[d.name]??'work.'+id+'.'+d.name,d)]))};}
  const feedback=Object.fromEntries(Object.entries(STATES).map(([n,out])=>[out,'state.'+n]));
  const route=call(names[0],'family-route',inputs,{family:'work.family',known:'work.known',normalAction:'work.normalAction',normalEnabled:'work.normalEnabled',repeatedEnabled:'work.repeatedEnabled',healAction:'work.healAction',healEnabled:'work.healEnabled',startPosition:'work.startPosition',zeroFlags:'work.repeatFlags'});
  const normal=call(names[1],'single',{...inputs,actionId:'work.normalAction',enabled:'work.normalEnabled'},feedback);
  const repeatedAction=options.repeatedIds?'work.family-route.repeatedAction':'constant.action73';
  const entry=call(names[2],'repeat-entry',{...inputs,...(options.repeatedIds?{actionId:repeatedAction}:{}),enabled:'work.repeatedEnabled'},{nextSeed:'state.seed',nextPosition:'state.position',nextActors:'state.actors',hitCount:'work.hitCount',hitIndex:'work.hitIndex',damageTotal:'work.damageTotal',entered:'work.repeatedEntered',activeFlag:'work.repeatActive',supported:'work.repeatSupported'});
  const hit=call(names[3],'repeat-hit',{...inputs,sourceIndex:'constant.enemy',actionId:repeatedAction,enabled:'work.repeatActive',hitCount:'work.hitCount',hitIndex:'work.hitIndex',damageTotal:'work.damageTotal'},{...feedback,nextHitIndex:'work.hitIndex',nextDamageTotal:'work.damageTotal'});
  const flags=call(names[4],'repeat-flags',{flags:'work.repeatFlags',...Object.fromEntries(FLAGS.map(n=>[n,'work.repeat-hit.'+n]))},{nextFlags:'work.repeatFlags'});
  const finish=call(names[5],'repeat-finish',{context:'state.context',damageTotal:'work.damageTotal',entered:'work.repeatedEntered',position:'state.position',startPosition:'work.startPosition'},{nextContext:'state.context',damage:'work.repeatedDamage'});
  const heal=call(names[6],'self-heal',{...inputs,sourceIndex:'constant.enemy',actionId:'work.healAction',enabled:'work.healEnabled'},feedback);
  const death=call(names[7],'death-sync',{actors:'state.actors',preparationState:'state.preparationState',enabled:'work.repeatActive'},{nextPreparationState:'state.preparationState'});
  const selection={family:'work.family',known:'work.known',startPosition:'work.startPosition',position:'state.position',combo:'state.combo',repeatFlags:'work.repeatFlags',repeatDamage:'work.repeatedDamage',repeatActive:'work.repeatedEntered',repeatSupported:'work.repeatSupported',repeatCount:'work.hitCount',repeatIterations:'work.hitIndex'};
  if(options.repeatedIds)selection.repeatCollected='work.repeat-entry.collectedTargetCount';
  for(const d of models.get(names[8]).inputs){if(d.name.startsWith('normal_'))selection[d.name]='work.single.'+d.name.slice(7);if(d.name.startsWith('heal_'))selection[d.name]='work.self-heal.'+d.name.slice(5);}
  const result=call(names[8],'result',selection);
  Object.assign(outputs,Object.fromEntries(Object.entries(STATES).map(([n,out])=>[out,'state.'+n])),Object.fromEntries(models.get(names[8]).outputs.map(d=>[d.name,'work.result.'+d.name])));
  const capture={op:'capture',id:'family-hit-end',tensors:{nextSeed:'state.seed',nextPosition:'state.position',nextActors:'state.actors',nextAux:'state.aux',nextStatus:'state.status',hitDamage:'work.repeat-hit.damage',hitIndex:'work.hitIndex',damageTotal:'work.damageTotal'}};
  const program={schema:'dq9-resident-onnx-program-v1',name:options.programName??'dq9-action-family-caller',version:1,parameters:{},modules:loaded.map(x=>({...x.module,nodes:x.ir.nodes.length,routingOnly:!!x.ir.contract.routingOnly})),slots,inputs,outputs,steps:[route,normal,entry,{op:'repeat',id:'target',count:4,body:[hit,flags,capture]},finish,heal,death,result],scope:models.get(names[0]).contract.scope,actionIds:[...core.contract.inputDomains.actionId.values,...(options.repeatedIds??[73]),30,587],contract:models.get(names[0]).contract,authority:'Only typed connections and selection are new. Each numeric action family keeps its immutable ONNX bytes and original actual-ROM proof. The single body is not primary/post/turn/camera.',seedFiltering:false,cameraIncluded:false};
  const text=JSON.stringify(program,null,2)+'\n',report={schema:'dq9-action-family-program-build-v1',programSha256:hash(text),name:program.name,modules:program.modules,calls:15,actionIds:program.actionIds,newRoutingNodes:newGraphs.reduce((s,g)=>s+g.nodes.length,0),newRoutingBytes:newGraphs.reduce((s,g)=>s+g.model().length,0),proofStatus:'Pending connection checks against existing actual caller fixtures.'};
  if(options.persist!==false)for(const[file,value]of[[(options.outputBase??'action-family')+'-program.json',program],[(options.outputBase??'action-family')+'-program-build.json',report]]){await writeFile(new URL(file+'.tmp',dir),JSON.stringify(value,null,2)+'\n');await rename(new URL(file+'.tmp',dir),new URL(file,dir));}
  return options.returnProgram?{program,report}:report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const r=await buildActionFamilyProgram();console.log(JSON.stringify({...r,modules:r.modules.map(m=>({name:m.name,sha256:m.sha256,nodes:m.nodes}))},null,2));}
