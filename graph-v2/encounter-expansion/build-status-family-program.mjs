// Compose the three independently verified status/MP kernels with frozen49.
// Every branch reads initial state and stores temporary outputs. The final
// ONNX selection commits one branch; the host performs no battle arithmetic.
import {Graph} from '../graph-builder.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
const extensions=[{id:41,key:'rank',name:'rom-self-rank-action-core2'},{id:272,key:'paralysis',name:'rom-paralysis-action-core2'},{id:469,key:'drain',name:'rom-drain-action-core2'}];
async function load(name){for(const prefix of['','../'])try{const bytes=await readFile(new URL(prefix+name+'.onnx',dir)),ir=JSON.parse(await readFile(new URL(prefix+name+'.json',dir),'utf8'));auditModelBytes(bytes,{name});return{ir,module:{name,onnx:prefix+name+'.onnx',ir:prefix+name+'.json',sha256:hash(bytes),bytes:bytes.length,nodes:ir.nodes.length,routingOnly:!!ir.contract.routingOnly}};}catch(e){if(e.code!=='ENOENT')throw e;}throw Error('Missing '+name);}
async function save(g){const b=g.model();auditModelBytes(b,{name:g.name});for(const[f,v]of[[g.name+'.onnx',b],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n']]){await writeFile(new URL(f+'.tmp',dir),v);await rename(new URL(f+'.tmp',dir),new URL(f,dir));}}
function route(base,core){
  const contract={...structuredClone(base.contract),routingOnly:true,actionIds:[...base.actionIds,...extensions.map(x=>x.id)],feedback:{},inputDomains:{...base.contract.inputDomains,targetCount:{min:0,max:1,integer:true}},defaults:{...base.contract.defaults,targetCount:1},
    scope:'Frozen49 caller records plus original41 enemy self-defense,272 enemy paralysis and469 enemy MP drain. Added branches accept sourceIndex1 only. The41 targetCount0/1 distinguishes collection of the only eligible enemy from an already supplied self target. The272/469 targetCount must be1 for the existing party target. Their full component admission contracts remain mandatory. All branches read the same initial state and only the selected ONNX result is returned. No phase planning, additional roster, arbitrary operation or complete new encounter claim.',
    scopeJa:'既存49行動にスカラ・やけつくいき・マホトラを接続します。新3行動は敵からの実行に限定し、初期対象数と各状態の条件を検査します。すべての数値処理は既存の演算グラフにあります。',
    targetContract:'For41, targetCount0 is empty before fallback uniform enemy selection; targetCount1 denotes exactly[192]. For272/469 it is exactly1 and denotes party0. For frozen49 records the field is unused and defaults to1.',
    inactiveBranchDomain:'Added records accept enemy level0..127; the frozen49 branch retains its old level0..99 admission. Only when an added record is selected, its inactive frozen49 branch receives an ONNX-projected level capped99. Its entire result is discarded. All selected new kernels receive the unchanged original level, and ordinary49 calls retain their original domain checks.',
    componentScope:Object.fromEntries(core.map((c,i)=>[extensions[i].id,{model:c.name,scope:c.contract.scope,sourceScope:c.contract.sourceScope}]))};
  contract.fieldDomains=structuredClone(base.contract.fieldDomains);contract.fieldDomains.actors[61].max=127;
  const g=new Graph('rom-status-family-route2',contract),x=Object.fromEntries(core[0].inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)])),selected=extensions.map(e=>g.eq(x.actionId,e.id)),any=g.or(...selected),source=g.eq(x.sourceIndex,1);
  for(let i=0;i<extensions.length;i++){const e=extensions[i],valid=g.and(source,e.id===41?g.ge(x.targetCount,0):g.eq(x.targetCount,1));g.output(selected[i],e.key+'Selected');g.output(valid,e.key+'Valid');g.output(g.and(x.enabled,selected[i],valid),e.key+'Enabled');}
  const actors=[...g.split(x.actors,66)];actors[61]=g.where(any,g.min(actors[61],99),actors[61]);g.output(g.cat(actors),'baseActors');
  g.output(g.and(x.enabled,g.not(any)),'baseEnabled');g.output(g.where(any,1,x.actionId),'baseAction');return g;
}
function result(base,cores){
  const slots=new Map(base.slots.map(s=>[s.name,s])),g=new Graph('rom-status-family-result2',{routingOnly:true,scope:'Typed whole-output selection. Each new status caller computed from the initial state into its own temporary outputs. Unsupported source or target lists preserve initial represented state and report supported0; no unselected branch updates selected state.'}),selected=extensions.map(e=>g.input(e.key+'Selected',['N',1],'bool')),valid=extensions.map(e=>g.input(e.key+'Valid',['N',1],'bool')),maps=cores.map(c=>new Map(c.outputs.map(d=>[d.name,d]))),used=cores.map(()=>new Map());
  function extra(i,name){if(!used[i].has(name)){const d=maps[i].get(name);if(!d)throw Error('Missing output '+extensions[i].name+'.'+name);used[i].set(name,g.input(extensions[i].key+'_'+name,d.shape,d.dtype));}return used[i].get(name);}
  for(const[name,slot]of Object.entries(base.outputs)){
    const d=slots.get(slot);let value=g.input('base_'+name,['N',d.width],d.dtype);
    for(let i=0;i<extensions.length;i++){
      let v=maps[i].has(name)?extra(i,name):g.constant([0],d.dtype,[1,1]);
      if(name==='supported')v=g.mul(v,g.cast(valid[i],'float32'));
      if(g.values[v].dtype!==d.dtype)throw Error('Output type '+name);
      value=g.where(selected[i],v,value);
    }g.output(value,name);
  }
  for(const[i,name]of[[0,'currentDefense'],[2,'drainedAmount'],[2,'recoveredMp']])g.output(g.where(selected[i],extra(i,name),0),name);
  return g;
}
export async function buildStatusFamilyProgram(){
  const baseBytes=await readFile(new URL('idle-family-program.json',dir)),base=JSON.parse(baseBytes),loaded=await Promise.all(extensions.map(e=>load(e.name))),cores=loaded.map(x=>x.ir),router=route(base,cores),selector=result(base,cores);
  for(const g of[router,selector])await save(g);
  const program=structuredClone(base),slots=new Map(program.slots.map(s=>[s.name,s]));
  function slot(name,d,initial){const width=d.width??d.shape[1],old=slots.get(name);if(old){if(old.dtype!==d.dtype||old.width!==width)throw Error('Incompatible slot '+name);}else{const s={name,width,dtype:d.dtype,initial:initial??{kind:'zero'}};program.slots.push(s);slots.set(name,s);}return name;}
  function call(ir,id,inputs,outputs={}){return{op:'call',id,model:ir.name,inputs:Object.fromEntries(ir.inputs.map(d=>{if(!inputs[d.name])throw Error('Missing '+id+'.'+d.name);return[d.name,slot(inputs[d.name],d)];})),outputs:Object.fromEntries(ir.outputs.map(d=>[d.name,slot(outputs[d.name]??'work.'+id+'.'+d.name,d)]))};}
  program.inputs.targetCount=slot('state.targetCount',{width:1,dtype:'float32'},{kind:'input',path:['targetCount'],default:[1]});
  const routeOutputs=Object.fromEntries(router.outputs.map(d=>[d.name,'work.statusFamily.'+d.name])),routeCall=call(router.json(),'status-family-route',program.inputs,routeOutputs),extraCalls=cores.map((ir,i)=>{
    const e=extensions[i],constant=slot('constant.statusAction'+e.id,{width:1,dtype:'float32'},{kind:'constant',values:[e.id]});
    return call(ir,'status-'+e.key,{...program.inputs,actionId:constant,sourceIndex:'constant.enemy',enabled:routeOutputs[e.key+'Enabled']});
  });
  function remapOldActorState(steps){for(const s of steps){for(const key of['inputs','outputs','tensors'])for(const[name,value]of Object.entries(s[key]??{}))if(value===program.inputs.actors)s[key][name]=routeOutputs.baseActors;if(s.body)remapOldActorState(s.body);}}
  remapOldActorState(program.steps);
  const initialRoute=program.steps.find(s=>s.op==='call'&&s.id==='idle-route');if(!initialRoute)throw Error('Missing frozen49 input route');initialRoute.inputs.actionId=routeOutputs.baseAction;initialRoute.inputs.enabled=routeOutputs.baseEnabled;
  const bindings={};for(const e of extensions){bindings[e.key+'Selected']=routeOutputs[e.key+'Selected'];bindings[e.key+'Valid']=routeOutputs[e.key+'Valid'];}
  for(const[name,s]of Object.entries(base.outputs))bindings['base_'+name]=s;
  for(let i=0;i<cores.length;i++)for(const d of cores[i].outputs)bindings[extensions[i].key+'_'+d.name]='work.status-'+extensions[i].key+'.'+d.name;
  const final=call(selector.json(),'status-family-result',bindings);program.steps=[routeCall,...extraCalls,...program.steps,final];program.outputs=Object.fromEntries(selector.outputs.map(d=>[d.name,'work.status-family-result.'+d.name]));
  program.name='dq9-status-action-family52-caller';program.version=1;program.modules.push((await load(router.name)).module,...loaded.map(x=>x.module),(await load(selector.name)).module);program.actionIds=router.contract.actionIds;program.scope=router.contract.scope;program.contract=router.contract;program.authority='Frozen49 plus separately actual-ROM-verified41/272/469 kernels; only typed routing and output selection are new. New component proof covers248 disjoint callers and24 target-list controls. This composition reuses those ROM executions; it is not additional ROM battle coverage.';
  const text=JSON.stringify(program,null,2)+'\n',report={schema:'dq9-status-family52-build-v1',programSha256:hash(text),baseProgramSha256:hash(baseBytes),actionIds:program.actionIds,modules:program.modules,newRoutingNodes:router.nodes.length+selector.nodes.length,immutableNumericModules:true,scope:program.scope};
  for(const[f,v]of[['status-family-program.json',program],['status-family-program-build.json',report]]){await writeFile(new URL(f+'.tmp',dir),JSON.stringify(v,null,2)+'\n');await rename(new URL(f+'.tmp',dir),new URL(f,dir));}return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildStatusFamilyProgram(),null,2));
