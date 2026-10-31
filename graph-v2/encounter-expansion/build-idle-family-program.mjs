// Add original577 by typed routing, retaining every frozen48 numeric module.
// The event call reads the initial state into separate temporary outputs; its
// result is selected only after the masked48-family schedule has completed.
import {Graph} from '../graph-builder.mjs';
import {ACTOR_FIELDS} from '../rules.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex');
async function load(name){for(const prefix of['','../'])try{const bytes=await readFile(new URL(prefix+name+'.onnx',dir)),ir=JSON.parse(await readFile(new URL(prefix+name+'.json',dir),'utf8'));auditModelBytes(bytes,{name});return{ir,module:{name,onnx:prefix+name+'.onnx',ir:prefix+name+'.json',sha256:hash(bytes),bytes:bytes.length,nodes:ir.nodes.length,routingOnly:!!ir.contract.routingOnly}};}catch(e){if(e.code!=='ENOENT')throw e;}throw Error('Missing '+name);}
async function save(g){const bytes=g.model();auditModelBytes(bytes,{name:g.name});for(const[file,value]of[[g.name+'.onnx',bytes],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n']]){await writeFile(new URL(file+'.tmp',dir),value);await rename(new URL(file+'.tmp',dir),new URL(file,dir));}}
function routeGraph(base,core,idle){
  const contract={...structuredClone(base.contract),actionIds:[...base.actionIds,577],routingOnly:true,feedback:{},
    scope:'The immutable48-action family plus original577 healthy enemy self. The original577 operation0 numerical words are verified equal to the existing503 event kernel, whose actual physical0/1/2 draws, optional zero-damage roll and weapon draw remain intact. The577 source must be enemy, without paralysis/sleep/confusion/skip or an appealMode. All other48 admission limits remain. Unknown or unsupported combinations preserve represented state and RNG. Raw presentation/event buffers are not modeled.',
    scopeJa:'既存48行動に、実ROMの「不敵に笑っている」を追加します。敵の主状態と魅了モードに制限があり、乱数消費は既存の演算グラフで分岐を保ちます。',
    recordEquivalence:idle.contract.recordEquivalence,authority:idle.contract.authority};
  const g=new Graph('rom-idle-family-route2',contract),x=Object.fromEntries(core.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)])),a=g.split(x.actors,66),p=g.split(x.preparationState,10),source=k=>a[33+ACTOR_FIELDS.indexOf(k)],selected=g.eq(x.actionId,577),valid=g.and(g.eq(x.sourceIndex,1),g.eq(p[5],0),...['sleep','paralysis','confusion','skip'].map(k=>g.eq(source(k),0)));
  const out={idleSelected:selected,idleValid:g.cast(valid,'float32'),idleEnabled:g.and(x.enabled,selected,valid),familyEnabled:g.and(x.enabled,g.not(selected)),familyAction:g.where(selected,1,x.actionId)};
  for(const[n,v]of Object.entries(out))g.output(v,n);return g;
}
function resultGraph(base,event){
  const slots=new Map(base.slots.map(s=>[s.name,s])),g=new Graph('rom-idle-family-result2',{routingOnly:true,scope:'Select all numerical/state outputs from either the immutable48-family or the original577 event call. Both receive only initial inputs. The unselected call cannot overwrite selected state. No arithmetic battle rule or RNG is evaluated on the host.',inputDomains:{idleValid:{min:0,max:1,integer:true},idleSelected:{values:[false,true,0,1]}}}),selected=g.input('idleSelected',['N',1],'bool'),valid=g.input('idleValid'),eventByName=new Map(event.outputs.map(d=>[d.name,d]));
  const usedEvent=new Map();
  function e(name){if(!usedEvent.has(name)){const d=eventByName.get(name);if(!d)throw Error('Missing event output '+name);usedEvent.set(name,g.input('idle_'+name,d.shape,d.dtype));}return usedEvent.get(name);}
  for(const[name,slot]of Object.entries(base.outputs)){
    const d=slots.get(slot),old=g.input('family_'+name,['N',d.width],d.dtype);let value;
    if(name==='supported')value=valid;
    else if(name==='accuracyPassed')value=e('active');
    else if(eventByName.has(name))value=e(name);
    else if(['nextStatus','nextWakeSkip'].includes(name))value=old;
    else value=g.constant([0],d.dtype,[1,1]);
    g.output(g.where(selected,value,old),name);
  }
  return g;
}
export async function buildIdleFamilyProgram(){
  const baseBytes=await readFile(new URL('tension-family-program.json',dir)),base=JSON.parse(baseBytes),event=(await load('rom-tension-event-core2')).ir,core=(await load('rom-weapon-tension-action-core2')).ir,idle=(await load('rom-idle577-action-core2')).ir;
  const route=routeGraph(base,core,idle),result=resultGraph(base,event);for(const g of[route,result])await save(g);
  const additions=await Promise.all([route.name,event.name,result.name].map(load)),program=structuredClone(base),slots=new Map(program.slots.map(s=>[s.name,s]));
  function slot(name,d,initial){const width=d.width??d.shape[1],old=slots.get(name);if(old){if(old.dtype!==d.dtype||old.width!==width)throw Error('Slot mismatch '+name);}else{const s={name,width,dtype:d.dtype,initial:initial??{kind:'zero'}};program.slots.push(s);slots.set(name,s);}return name;}
  function call(ir,id,inputs,outputs={}){return{op:'call',id,model:ir.name,inputs:Object.fromEntries(ir.inputs.map(d=>{if(!inputs[d.name])throw Error('Missing '+id+'.'+d.name);return[d.name,slot(inputs[d.name],d)];})),outputs:Object.fromEntries(ir.outputs.map(d=>[d.name,slot(outputs[d.name]??'work.'+id+'.'+d.name,d)]))};}
  slot('constant.idle503',{width:1,dtype:'float32'},{kind:'constant',values:[503]});
  const routeCall=call(route.json(),'idle-route',program.inputs,{idleSelected:'work.idleSelected',idleValid:'work.idleValid',idleEnabled:'work.idleEnabled',familyEnabled:'work.idleFamilyEnabled',familyAction:'work.idleFamilyAction'});
  const eventCall=call(event,'idle-event',{...program.inputs,sourceIndex:'constant.enemy',actionId:'constant.idle503',enabled:'work.idleEnabled'});
  const familyRoute=program.steps.find(s=>s.op==='call'&&s.id==='family-route');if(!familyRoute)throw Error('Missing frozen48 route');familyRoute.inputs.actionId='work.idleFamilyAction';familyRoute.inputs.enabled='work.idleFamilyEnabled';
  const bindings={idleSelected:'work.idleSelected',idleValid:'work.idleValid'};for(const[name,target]of Object.entries(base.outputs))bindings['family_'+name]=target;for(const d of event.outputs)bindings['idle_'+d.name]='work.idle-event.'+d.name;
  const select=call(result.json(),'idle-result',bindings);program.outputs=Object.fromEntries(result.outputs.map(d=>[d.name,'work.idle-result.'+d.name]));
  program.name='dq9-idle-action-family49-caller';program.version=1;program.steps=[routeCall,eventCall,...program.steps,select];program.modules.push(...additions.map(x=>x.module));program.actionIds=route.contract.actionIds;program.scope=route.contract.scope;program.contract=route.contract;program.authority='Frozen48 numeric modules plus frozen503 event module. The actual577 rule-word equality and107 through-return callers validate the reuse; only typed routing/selection is new. Prepared577 is separately verified by its16 actual same-memory chains.';
  const text=JSON.stringify(program,null,2)+'\n',report={schema:'dq9-idle-family49-build-v1',programSha256:hash(text),baseProgramSha256:hash(baseBytes),actionIds:program.actionIds,modules:program.modules,newRoutingNodes:route.nodes.length+result.nodes.length,immutableNumericModules:true,scope:program.scope,proofStatus:'New composition requires original577 endpoint checks and frozen48 all-output-bit regression.'};
  for(const[file,value]of[['idle-family-program.json',program],['idle-family-program-build.json',report]]){await writeFile(new URL(file+'.tmp',dir),JSON.stringify(value,null,2)+'\n');await rename(new URL(file+'.tmp',dir),new URL(file,dir));}return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildIdleFamilyProgram(),null,2));
