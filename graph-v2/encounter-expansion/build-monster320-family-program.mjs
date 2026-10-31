// Add three new records to immutable54 using small typed ONNX routing graphs.
// Every branch reads initial state, writes temporaries, then one whole result
// is selected. Host scheduling adds no arithmetic or seed-based filtering.
import {Graph} from '../graph-builder.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
const extensions=[{id:558,key:'mpfull',name:'rom-mpfull-action-core2'},{id:563,key:'hypnotic',name:'rom-hypnotic-sleep-action-core2'},{id:583,key:'magicburst',name:'rom-magicburst-action-core2'}];
async function load(name){const b=await readFile(new URL(name+'.onnx',dir)),ir=JSON.parse(await readFile(new URL(name+'.json',dir),'utf8'));auditModelBytes(b,{name});return{ir,module:{name,onnx:name+'.onnx',ir:name+'.json',sha256:hash(b),bytes:b.length,nodes:ir.nodes.length,routingOnly:!!ir.contract.routingOnly}};}
async function save(g){const b=g.model();auditModelBytes(b,{name:g.name});for(const[f,v]of[[g.name+'.onnx',b],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n']]){await writeFile(new URL(f+'.tmp',dir),v);await rename(new URL(f+'.tmp',dir),new URL(f,dir));}}
export async function buildMonster320FamilyProgram(){
  const original=await readFile(new URL('impact-family-program.json',dir)),base=JSON.parse(original),loaded=await Promise.all(extensions.map(e=>load(e.name))),cores=loaded.map(m=>m.ir),oldSlots=new Map(base.slots.map(s=>[s.name,s]));
  const contract={...structuredClone(base.contract),routingOnly:true,feedback:{},actionIds:[...base.actionIds,...extensions.map(e=>e.id)],
    scope:'Immutable54-record caller family plus original558 self MP-full,563 hypnotic sleep and583 magic burst. New records require enemy source1 and one explicit target;558 target identity is enemy192,563/583 party0. The enclosing caller must validate that identity. Each numerical component keeps its admission contract; MP0 magicburst replacement504 and target-high inputs remain unsupported controls. No old caller rule is regenerated and no whole encounter is implied.',
    scopeJa:'既存54行動にMP全回復・あやしいひとみ・マダンテを接続します。敵からの実行と対象数を確認し、数値処理は各ONNX核で行います。',
    targetContract:'Exactly one selected target. The public family carries targetCount only; a containing turn program separately validates actual target IDs. SourceIndex1/action558 means self192, action563/583 means party0.',
    inactiveBranchDomain:'Only when a newly added record is selected, the unused frozen54 input actor level is capped99 to satisfy its nested legacy inactive branch domains. The selected new component receives original unchanged level0..127; ordinary54 calls remain bit-identical.',
    componentScopes:Object.fromEntries(extensions.map((e,i)=>[e.id,{model:e.name,scope:cores[i].contract.scope}]))};
  const route=new Graph('rom-monster320-family-route2',contract),x=Object.fromEntries(Object.entries(base.inputs).map(([name,slot])=>{const d=oldSlots.get(slot);return[name,route.input(name,['N',d.width],d.dtype)];})),selected=extensions.map(e=>route.eq(x.actionId,e.id)),any=route.or(...selected),valid=route.and(route.eq(x.sourceIndex,1),route.eq(x.targetCount,1));
  for(let i=0;i<extensions.length;i++){const key=extensions[i].key;route.output(selected[i],key+'Selected');route.output(valid,key+'Valid');route.output(route.and(x.enabled,selected[i],valid),key+'Enabled');}
  const actors=route.split(x.actors,66);actors[61]=route.where(any,route.min(actors[61],99),actors[61]);route.output(route.cat(actors),'baseActors');route.output(route.and(x.enabled,route.not(any)),'baseEnabled');route.output(route.where(any,1,x.actionId),'baseAction');
  const result=new Graph('rom-monster320-family-result2',{routingOnly:true,scope:'Select all output tensors from the one declared branch. Unsupported shape/source returns supported0 and leaves state untouched; inactive numerical branches never commit.'}),sels=extensions.map(e=>result.input(e.key+'Selected',['N',1],'bool')),oks=extensions.map(e=>result.input(e.key+'Valid',['N',1],'bool')),maps=cores.map(c=>new Map(c.outputs.map(d=>[d.name,d]))),used=cores.map(()=>new Map());
  function take(i,name){if(!used[i].has(name)){const d=maps[i].get(name);if(!d)throw Error('Missing '+extensions[i].name+'.'+name);used[i].set(name,result.input(extensions[i].key+'_'+name,d.shape,d.dtype));}return used[i].get(name);}
  for(const[name,slot]of Object.entries(base.outputs)){
    const d=oldSlots.get(slot);let value=result.input('base_'+name,['N',d.width],d.dtype);
    for(let i=0;i<extensions.length;i++){let next=maps[i].has(name)?take(i,name):result.constant(Array(d.width).fill(0),d.dtype,[1,d.width]);if(name==='supported')next=result.mul(next,result.cast(oks[i],'float32'));value=result.where(sels[i],next,value);}result.output(value,name);
  }
  result.output(result.where(sels[0],take(0,'mpRecovered'),0),'mpRecovered');
  for(const g of[route,result])await save(g);
  const program=structuredClone(base),slots=new Map(program.slots.map(s=>[s.name,s]));
  function slot(name,d,initial){const width=d.width??d.shape[1],old=slots.get(name);if(old){if(old.width!==width||old.dtype!==d.dtype)throw Error('Incompatible '+name);}else{const s={name,width,dtype:d.dtype,initial:initial??{kind:'zero'}};program.slots.push(s);slots.set(name,s);}return name;}
  function call(ir,id,inputs,outputs={}){return{op:'call',id,model:ir.name,inputs:Object.fromEntries(ir.inputs.map(d=>{if(!inputs[d.name])throw Error('Missing '+id+'.'+d.name);return[d.name,slot(inputs[d.name],d)];})),outputs:Object.fromEntries(ir.outputs.map(d=>[d.name,slot(outputs[d.name]??'work.'+id+'.'+d.name,d)]))};}
  const routeOutputs=Object.fromEntries(route.outputs.map(d=>[d.name,'work.monster320Family.'+d.name])),first=call(route.json(),'monster320-family-route',program.inputs,routeOutputs),extra=cores.map((ir,i)=>{const e=extensions[i],action=slot('constant.monster320Action'+e.id,{width:1,dtype:'float32'},{kind:'constant',values:[e.id]});return call(ir,'monster320-'+e.key,{...program.inputs,actionId:action,sourceIndex:'constant.enemy',enabled:routeOutputs[e.key+'Enabled']});});
  function routeOldActors(steps){for(const s of steps){for(const k of['inputs','outputs','tensors'])for(const[n,v]of Object.entries(s[k]??{}))if(v===program.inputs.actors)s[k][n]=routeOutputs.baseActors;if(s.body)routeOldActors(s.body);}}
  routeOldActors(program.steps);const oldEntry=program.steps.find(s=>s.op==='call'&&s.id==='impact-family-route');if(!oldEntry)throw Error('Missing frozen54 entry');oldEntry.inputs.enabled=routeOutputs.baseEnabled;oldEntry.inputs.actionId=routeOutputs.baseAction;
  const bindings={};for(const e of extensions){bindings[e.key+'Selected']=routeOutputs[e.key+'Selected'];bindings[e.key+'Valid']=routeOutputs[e.key+'Valid'];}for(const[name,s]of Object.entries(base.outputs))bindings['base_'+name]=s;for(let i=0;i<cores.length;i++)for(const d of cores[i].outputs)bindings[extensions[i].key+'_'+d.name]='work.monster320-'+extensions[i].key+'.'+d.name;
  const last=call(result.json(),'monster320-family-result',bindings);program.steps=[first,...extra,...program.steps,last];program.outputs=Object.fromEntries(result.outputs.map(d=>[d.name,'work.monster320-family-result.'+d.name]));program.name='dq9-monster320-action-family57-caller';program.version=1;program.modules.push((await load(route.name)).module,...loaded.map(x=>x.module),(await load(result.name)).module);program.actionIds=contract.actionIds;program.contract=contract;program.scope=contract.scope;program.authority='New explicit three-record caller union; actual probes/boundaries and frozen54 full-output regression are separate reports. Composition does not create new independent ROM executions.';
  const text=JSON.stringify(program,null,2)+'\n',report={schema:'dq9-monster320-family57-build-v1',programSha256:hash(text),baseProgramSha256:hash(original),modules:program.modules,actionIds:program.actionIds,newRoutingNodes:route.nodes.length+result.nodes.length,immutablePreviousModules:true,scope:program.scope};
  for(const[f,v]of[['monster320-family-program.json',program],['monster320-family-program-build.json',report]]){await writeFile(new URL(f+'.tmp',dir),JSON.stringify(v,null,2)+'\n');await rename(new URL(f+'.tmp',dir),new URL(f,dir));}return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildMonster320FamilyProgram(),null,2));
