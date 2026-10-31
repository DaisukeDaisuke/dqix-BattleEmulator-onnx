// Immutable52 plus one new2-record caller. Routing and whole-output selection
// are ONNX, so no numerical action rule is evaluated by the program host.
import {Graph} from '../graph-builder.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
async function load(name){const b=await readFile(new URL(name+'.onnx',dir)),ir=JSON.parse(await readFile(new URL(name+'.json',dir),'utf8'));auditModelBytes(b,{name});return{ir,module:{name,onnx:name+'.onnx',ir:name+'.json',sha256:hash(b),bytes:b.length,nodes:ir.nodes.length,routingOnly:!!ir.contract.routingOnly}};}
async function save(g){const b=g.model();auditModelBytes(b,{name:g.name});for(const[f,v]of[[g.name+'.onnx',b],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n']]){await writeFile(new URL(f+'.tmp',dir),v);await rename(new URL(f+'.tmp',dir),new URL(f,dir));}}
export async function buildImpactFamilyProgram(){
  const baseBytes=await readFile(new URL('status-family-program.json',dir)),base=JSON.parse(baseBytes),loaded=await load('rom-impact-state-action-core2'),core=loaded.ir,bySlot=new Map(base.slots.map(s=>[s.name,s]));
  const contract={...structuredClone(base.contract),routingOnly:true,feedback:{},actionIds:[...base.actionIds,115,134],scope:'Frozen52 caller schedule plus the separately represented original115/134 enemy-to-party caller. For these new records, sourceIndex1 and one explicit party target are required; all other source, MP, primary and raw-state restrictions are enforced by the selected core. Every numeric branch reads the same initial state and writes temporaries. Only the selected entire output is committed. No new battle or arbitrary roster coverage is inferred.',scopeJa:'既存52行動を保持し、ハートブレイクとシールドアタックを選択・接続する54行動の共通プログラムです。新2行動は敵から味方1人への実行に限定します。',componentScope:core.contract.scope};
  contract.resistanceProjectionCorrection={actionId:272,input:'resistances[2]',element:17,arrayIndex:16,statsOffset:78,authority:'Original raw word18 bits27..31 and actual accuracy/effect-resistance call trace; independent index16/18/19 cohort emulation-paralysis-resistance-control-run.',historical:'The frozen paralysis kernel computes from a caller-supplied resolved susceptibility byte; its old element19 explanatory label and stats50 adapter were wrong. That old80-case cohort kept actual17 and mislabeled19 bytes both100 while varying index19, so it did not establish the mapping or varying actual susceptibility. This new composition uses17. Existing arithmetic modules and frozen52 artifacts are retained unchanged.'};
  const route=new Graph('rom-impact-family-route2',contract),x=Object.fromEntries(Object.entries(base.inputs).map(([name,s])=>{const d=bySlot.get(s);return[name,route.input(name,['N',d.width],d.dtype)];})),selected=route.or(route.eq(x.actionId,115),route.eq(x.actionId,134)),valid=route.and(route.eq(x.sourceIndex,1),route.eq(x.targetCount,1));
  for(const[name,value]of Object.entries({impactSelected:selected,impactValid:valid,impactEnabled:route.and(x.enabled,selected,valid),impactAction:route.where(selected,x.actionId,115),baseEnabled:route.and(x.enabled,route.not(selected)),baseAction:route.where(selected,1,x.actionId)}))route.output(value,name);
  const result=new Graph('rom-impact-family-result2',{routingOnly:true,scope:'Typed whole-output selection between frozen52 and new115/134. Unsupported source/target combinations freeze state and return supported0.'}),sel=result.input('impactSelected',['N',1],'bool'),ok=result.input('impactValid',['N',1],'bool'),newOutputs=new Map(core.outputs.map(d=>[d.name,d])),used=new Map();
  function take(name){if(!used.has(name)){const d=newOutputs.get(name);if(!d)throw Error('Missing new output '+name);used.set(name,result.input('impact_'+name,d.shape,d.dtype));}return used.get(name);}
  for(const[name,s]of Object.entries(base.outputs)){
    const d=bySlot.get(s),old=result.input('base_'+name,['N',d.width],d.dtype);let next=newOutputs.has(name)?take(name):result.constant([0],d.dtype,[1,1]);
    if(name==='supported')next=result.mul(next,result.cast(ok,'float32'));
    result.output(result.where(sel,next,old),name);
  }
  result.output(result.where(sel,take('secondaryApplied'),0),'secondaryApplied');
  for(const g of[route,result])await save(g);
  const program=structuredClone(base),slots=new Map(program.slots.map(s=>[s.name,s]));
  function slot(name,d){const width=d.width??d.shape[1];if(slots.has(name)){const s=slots.get(name);if(s.width!==width||s.dtype!==d.dtype)throw Error('Slot shape/type '+name);}else{const s={name,width,dtype:d.dtype,initial:{kind:'zero'}};program.slots.push(s);slots.set(name,s);}return name;}
  function call(ir,id,inputs,outputs={}){return{op:'call',id,model:ir.name,inputs:Object.fromEntries(ir.inputs.map(d=>{if(!inputs[d.name])throw Error('Missing input '+id+'.'+d.name);return[d.name,slot(inputs[d.name],d)];})),outputs:Object.fromEntries(ir.outputs.map(d=>[d.name,slot(outputs[d.name]??'work.'+id+'.'+d.name,d)]))};}
  const rOut=Object.fromEntries(route.outputs.map(d=>[d.name,'work.impactFamily.'+d.name])),rCall=call(route.json(),'impact-family-route',program.inputs,rOut),newCall=call(core,'impact-core',{...program.inputs,sourceIndex:'constant.enemy',actionId:rOut.impactAction,enabled:rOut.impactEnabled});
  const oldRoute=program.steps.find(s=>s.op==='call'&&s.id==='status-family-route');if(!oldRoute)throw Error('Missing frozen52 entry');oldRoute.inputs.enabled=rOut.baseEnabled;oldRoute.inputs.actionId=rOut.baseAction;
  const bindings={impactSelected:rOut.impactSelected,impactValid:rOut.impactValid};for(const[name,s]of Object.entries(base.outputs))bindings['base_'+name]=s;for(const d of core.outputs)bindings['impact_'+d.name]='work.impact-core.'+d.name;
  const last=call(result.json(),'impact-family-result',bindings);program.steps=[rCall,newCall,...program.steps,last];program.outputs=Object.fromEntries(result.outputs.map(d=>[d.name,'work.impact-family-result.'+d.name]));
  program.name='dq9-impact-action-family54-caller';program.version=1;program.modules.push((await load(route.name)).module,loaded.module,(await load(result.name)).module);program.actionIds=contract.actionIds;program.contract=contract;program.scope=contract.scope;program.authority='Frozen52 and a new two-record caller. Actual115/134 through-return and same-memory chain proofs are kept separately; composition reuses them without adding independent ROM executions.';
  const text=JSON.stringify(program,null,2)+'\n',report={schema:'dq9-impact-family54-build-v1',programSha256:hash(text),baseProgramSha256:hash(baseBytes),modules:program.modules,actionIds:program.actionIds,newRoutingNodes:route.nodes.length+result.nodes.length,immutablePriorModules:true,scope:program.scope};
  for(const[f,v]of[['impact-family-program.json',program],['impact-family-program-build.json',report]]){await writeFile(new URL(f+'.tmp',dir),JSON.stringify(v,null,2)+'\n');await rename(new URL(f+'.tmp',dir),new URL(f,dir));}return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildImpactFamilyProgram(),null,2));
