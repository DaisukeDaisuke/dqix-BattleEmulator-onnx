// Declarative union of the frozen58-record family and the new112/569 core.
// Routing selects whole outputs; no old numerical graph is regenerated.
import {Graph} from '../graph-builder.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
async function load(name){const bytes=await readFile(new URL(name+'.onnx',dir)),ir=JSON.parse(await readFile(new URL(name+'.json',dir),'utf8'));auditModelBytes(bytes,{name});return{ir,module:{name,onnx:name+'.onnx',ir:name+'.json',sha256:hash(bytes),bytes:bytes.length,nodes:ir.nodes.length,routingOnly:!!ir.contract.routingOnly}};}
async function save(g){if(new Set(g.outputs.map(d=>d.name)).size!==g.outputs.length)throw Error('Duplicate output '+g.name);const b=g.model();auditModelBytes(b,{name:g.name});for(const[f,v]of[[g.name+'.onnx',b],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n']]){await writeFile(new URL(f+'.tmp',dir),v);await rename(new URL(f+'.tmp',dir),new URL(f,dir));}}
export async function buildGiyumeiFamilyProgram(){
  const original=await readFile(new URL('darkwave-family-program.json',dir)),base=JSON.parse(original),loaded=await load('rom-giyumei-action-core2'),core=loaded.ir,oldSlots=new Map(base.slots.map(s=>[s.name,s])),added=[112,569];
  if(added.some(id=>base.actionIds.includes(id)))throw Error('New records already present');
  const contract={...structuredClone(base.contract),routingOnly:true,feedback:{},actionIds:[...base.actionIds,...added],
    scope:'Immutable58-record family plus the original enemy112/569 single-target core. These two records require source1 and targetCount1; the enclosing turn validates target party0. Selector45, critical impact, zero/tension behavior and subtype2 additional state are computed by numerical ONNX. Old numerical graphs are byte-preserved. This union is not a complete battle proof.',
    scopeJa:'既存58行動に、まじん斬りと斬り上げの行動本体を接続します。',
    targetContract:'112/569 require enemy source1 and exactly one existing party0 target; the enclosing turn validates the actual target ID.',
    inactiveBranchDomain:'Only on112/569, the unused frozen58 actor-level input is capped99 for nested legacy inactive branches. The selected numerical core receives the unchanged original actor state.',
    newComponent:{actionIds:added,model:core.name,scope:core.contract.scope},diagnostics:'Older diagnostics keep their previous branch meanings. selectorDamage is112 selector output on the new core and0 elsewhere; a zero on another branch is not a stat transition.'};
  const route=new Graph('rom-giyumei-family-route2',contract),x=Object.fromEntries(Object.entries(base.inputs).map(([name,s])=>{const d=oldSlots.get(s);return[name,route.input(name,['N',d.width],d.dtype)];})),selected=route.or(...added.map(id=>route.eq(x.actionId,id))),valid=route.and(route.eq(x.sourceIndex,1),route.eq(x.targetCount,1)),actors=route.split(x.actors,66);
  actors[61]=route.where(selected,route.min(actors[61],99),actors[61]);
  for(const[n,v]of Object.entries({giyumeiSelected:selected,giyumeiValid:valid,giyumeiEnabled:route.and(x.enabled,selected,valid),giyumeiAction:route.where(selected,x.actionId,112),baseActors:route.cat(actors),baseEnabled:route.and(x.enabled,route.not(selected)),baseAction:route.where(selected,1,x.actionId)}))route.output(v,n);
  const result=new Graph('rom-giyumei-family-result2',{routingOnly:true,scope:'Select complete branch outputs; invalid source/count has supported0 and an inactive identity state.'}),sel=result.input('giyumeiSelected',['N',1],'bool'),ok=result.input('giyumeiValid',['N',1],'bool'),descriptors=new Map(core.outputs.map(d=>[d.name,d])),used=new Map();
  function take(name){if(!used.has(name)){const d=descriptors.get(name);if(!d)throw Error('Missing new core output '+name);used.set(name,result.input('giyumei_'+name,d.shape,d.dtype));}return used.get(name);}
  for(const[name,s]of Object.entries(base.outputs)){const d=oldSlots.get(s),old=result.input('base_'+name,['N',d.width],d.dtype);let next=descriptors.has(name)?take(name):result.constant(Array(d.width).fill(0),d.dtype,[1,d.width]);if(name==='supported')next=result.mul(next,result.cast(ok,'float32'));result.output(result.where(sel,next,old),name);}
  if(!('selectorDamage'in base.outputs))result.output(result.where(sel,take('selectorDamage'),0),'selectorDamage');
  for(const g of[route,result])await save(g);
  const program=structuredClone(base),slots=new Map(program.slots.map(s=>[s.name,s]));
  function slot(name,d,initial){const width=d.width??d.shape[1],old=slots.get(name);if(old){if(old.width!==width||old.dtype!==d.dtype)throw Error('Incompatible slot '+name);}else{const s={name,width,dtype:d.dtype,initial:initial??{kind:'zero'}};program.slots.push(s);slots.set(name,s);}return name;}
  function call(ir,id,inputs,outputs={}){return{op:'call',id,model:ir.name,inputs:Object.fromEntries(ir.inputs.map(d=>{if(!inputs[d.name])throw Error('Missing '+id+'.'+d.name);return[d.name,slot(inputs[d.name],d)];})),outputs:Object.fromEntries(ir.outputs.map(d=>[d.name,slot(outputs[d.name]??'work.'+id+'.'+d.name,d)]))};}
  const routed=Object.fromEntries(route.outputs.map(d=>[d.name,'work.giyumeiFamily.'+d.name])),first=call(route.json(),'giyumei-family-route',program.inputs,routed),body=call(core,'giyumei-core',{...program.inputs,actionId:routed.giyumeiAction,sourceIndex:'constant.enemy',enabled:routed.giyumeiEnabled});
  function redirect(ss){for(const s of ss){for(const k of['inputs','outputs','tensors'])for(const[n,v]of Object.entries(s[k]??{}))if(v===program.inputs.actors)s[k][n]=routed.baseActors;if(s.body)redirect(s.body);}}
  redirect(program.steps);const oldEntry=program.steps.find(s=>s.op==='call'&&s.id==='darkwave-family-route');if(!oldEntry)throw Error('Missing frozen58 entry');oldEntry.inputs.enabled=routed.baseEnabled;oldEntry.inputs.actionId=routed.baseAction;
  const bindings={giyumeiSelected:routed.giyumeiSelected,giyumeiValid:routed.giyumeiValid};for(const[n,s]of Object.entries(base.outputs))bindings['base_'+n]=s;for(const d of core.outputs)bindings['giyumei_'+d.name]='work.giyumei-core.'+d.name;
  const last=call(result.json(),'giyumei-family-result',bindings);program.steps=[first,body,...program.steps,last];program.outputs=Object.fromEntries(result.outputs.map(d=>[d.name,'work.giyumei-family-result.'+d.name]));program.name='dq9-giyumei-action-family60-caller';program.version=1;program.modules.push((await load(route.name)).module,loaded.module,(await load(result.name)).module);program.actionIds=contract.actionIds;program.contract=contract;program.scope=contract.scope;program.authority='Original112/569 caller union. Independent core comparisons and all frozen58 output-bit regression are separate evidence; composition is not an additional ARM execution.';
  const text=JSON.stringify(program,null,2)+'\n',report={schema:'dq9-giyumei-family60-build-v1',programSha256:hash(text),baseProgramSha256:hash(original),modules:program.modules,actionIds:program.actionIds,newRoutingNodes:route.nodes.length+result.nodes.length,immutablePreviousModules:true,scope:program.scope};
  for(const[f,v]of[['giyumei-family-program.json',program],['giyumei-family-program-build.json',report]]){await writeFile(new URL(f+'.tmp',dir),JSON.stringify(v,null,2)+'\n');await rename(new URL(f+'.tmp',dir),new URL(f,dir));}return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const r=await buildGiyumeiFamilyProgram();console.log(JSON.stringify({sha256:r.programSha256,modules:r.modules.length,actionIds:r.actionIds},null,2));}
