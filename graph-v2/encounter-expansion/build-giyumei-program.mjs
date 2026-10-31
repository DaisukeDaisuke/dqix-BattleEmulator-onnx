import {sourceSHA256} from '../../data/source-authority.mjs';
// New319/751 initial-state composition: deferred judgment2 selection and
// persistent definition changes use the same immutable AI and action kernels.
import {Graph} from '../graph-builder.mjs';
import {inlineResidentProgram} from './compose-resident-program.mjs';
import {decodeBossActionRule} from '../boss-action-rules.mjs';
import {makeGiyumeiRow,giyumeiProfileAudit,GIYUMEI_ACTION_IDS,GIYUMEI_DEFINITIONS} from './giyumei-profiles.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex'),AI_BUDGET=32;
const boolean={values:[false,true,0,1]},flag={min:0,max:1,integer:true};
async function load(name){for(const prefix of['','../'])try{const onnx=await readFile(new URL(prefix+name+'.onnx',dir)),ir=JSON.parse(await readFile(new URL(prefix+name+'.json',dir)));auditModelBytes(onnx,{name});return{ir,onnx,module:{name,onnx:prefix+name+'.onnx',ir:prefix+name+'.json',sha256:hash(onnx),bytes:onnx.length,nodes:ir.nodes.length,routingOnly:!!ir.contract.routingOnly}};}catch(e){if(e.code!=='ENOENT')throw e;}throw Error('Missing '+name);}
async function save(g){const b=g.model();auditModelBytes(b,{name:g.name});for(const[f,v]of[[g.name+'.onnx',b],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n']]){await writeFile(new URL(f+'.tmp',dir),v);await rename(new URL(f+'.tmp',dir),new URL(f,dir));}}
async function buildView(row){const old=(await load('rom-tension-state-view2')).ir,g=new Graph('rom-giyumei-state-view2',{...old.contract,defaults:{...old.contract.defaults,actors:row.actors,aux:row.aux,wakeSkip:row.wakeSkip,tension:row.tension,resistanceBytes:row.resistanceBytes,definitionId:315},inputDomains:{...old.contract.inputDomains,definitionId:{values:[315,346]}},scope:'Current represented combat state feeds original315 or346 deferred AI. Both records share judgment2/mode2 and six actions. Each input row retains its independently specified current stats, config, resistance and definition; the six action records contain no definition transition.',scopeJa:'315/346のAI表を現在状態へ接続し、準備時に選択した行動を実行します。'}),x=Object.fromEntries(old.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)])),definition=g.input('definitionId'),o=g.inline(old,x,'view');o.supported=g.and(o.supported,g.or(g.eq(definition,315),g.eq(definition,346)));for(const[n,v]of Object.entries(o))g.output(v,n);return g;}
function buildPreparedCommand(rules){
  const g=new Graph('rom-giyumei-prepared-command2',{routingOnly:true,inputDomains:{wasEnabled:boolean,plannedAction:{min:0,max:65535,integer:true},plannedCount:{min:0,max:8,integer:true},plannedTargets:{width:8,min:-1,max:255,integer:true},selectedAction:{min:0,max:65535,integer:true},selectedCount:{min:0,max:8,integer:true},selectedTargets:{width:8,min:-1,max:255,integer:true},supported:flag,finished:flag,sourceIndex:{values:[0,1]},resistanceBytes:{width:44,min:0,max:255,integer:true}},scope:'Select an actually completed deferred-AI command, then gather exact original action damage/effect-element columns. No host random or damage arithmetic. Unknown action IDs are rejected by the subsequent target gate.',scopeJa:'準備時AIが確定した行動と対象を受け取り、ROM行の属性に対応する耐性を接続します。'});
  const x={wasEnabled:g.input('wasEnabled',['N',1],'bool'),plannedAction:g.input('plannedAction'),plannedCount:g.input('plannedCount'),plannedTargets:g.input('plannedTargets',['N',8]),selectedAction:g.input('selectedAction'),selectedCount:g.input('selectedCount'),selectedTargets:g.input('selectedTargets',['N',8]),supported:g.input('supported'),finished:g.input('finished'),sourceIndex:g.input('sourceIndex'),resistanceBytes:g.input('resistanceBytes',['N',44])};
  const action=g.where(x.wasEnabled,x.selectedAction,x.plannedAction),count=g.where(x.wasEnabled,x.selectedCount,x.plannedCount),targets=g.where(x.wasEnabled,x.selectedTargets,x.plannedTargets),res=g.split(x.resistanceBytes,44),self=g.or(g.eq(action,161),g.eq(action,577)),enemyTarget=g.or(g.eq(x.sourceIndex,0),self),target=res.slice(0,22).map((v,i)=>g.where(enemyTarget,res[22+i],v));
  let index=g.constant(0);rules.forEach((r,i)=>index=g.where(g.eq(action,r.id),i,index));const col=k=>g.op('Gather',[g.constant(rules.map(r=>r[k]),'float32',[rules.length]),g.cast(index,'int32')],{axis:0},{shape:['N',1]}),byElement=e=>target.reduce((v,b,i)=>g.where(g.eq(e,i+1),b,v),g.constant(100));
  for(const[n,v]of Object.entries({action,targetCount:count,targets,continueEnabled:g.and(g.gt(x.supported,0),g.eq(x.finished,0)),resistances:g.cat([target[18],target[19],byElement(col('effectElement')),target[15],byElement(col('damageElement'))])}))g.output(v,n);return g;
}
function buildTargetGate(){
  const g=new Graph('rom-giyumei-target-gate2',{routingOnly:true,inputDomains:{sourceIndex:{values:[0,1]},actionId:{min:0,max:65535,integer:true},targetCount:{min:0,max:8,integer:true},targets:{width:8,min:-1,max:255,integer:true},enabled:boolean,supported:flag,finished:flag},scope:'Manual party normal1 accepts its empty planned target list or singleton192. Enemy original1/569/112/279/280 requires singleton0;292 requires four actual planned target entries all0. The immutable repeated caller then collects the four hits itself, with exactly the verified inputTargetCount1 boundary. No target filtering, expected count or seed is injected.'}),source=g.input('sourceIndex'),action=g.input('actionId'),count=g.input('targetCount'),targets=g.split(g.input('targets',['N',8]),8),enabled=g.input('enabled',['N',1],'bool'),supported=g.input('supported'),finished=g.input('finished'),party=g.eq(source,0),repeat=g.eq(action,292),known=g.or(...GIYUMEI_ACTION_IDS.map(id=>g.eq(action,id))),enemyTargets=g.or(g.and(repeat,g.eq(count,4),...targets.slice(0,4).map(t=>g.eq(t,0))),g.and(g.not(repeat),g.eq(count,1),g.eq(targets[0],0))),valid=g.and(known,g.or(g.and(party,g.eq(action,1),g.or(g.eq(count,0),g.and(g.eq(count,1),g.eq(targets[0],192)))),g.and(g.not(party),enemyTargets))),bad=g.and(enabled,g.not(valid));
  for(const[n,v]of Object.entries({familyEnabled:g.and(enabled,valid),coreTargetCount:g.add(g.mul(count,0),1),nextSupported:g.where(bad,0,supported),nextFinished:g.where(bad,1,finished)}))g.output(v,n);return g;
}
export async function buildGiyumeiProgram(){
  const baseBytes=await readFile(new URL('jadama-resident-program.json',dir)),familyBytes=await readFile(new URL('giyumei-family-program.json',dir)),program=JSON.parse(baseBytes),family=JSON.parse(familyBytes),row=makeGiyumeiRow(),cut=JSON.parse(await readFile(new URL('giyumei-preparation-cut.json',dir))),profile=giyumeiProfileAudit();
  const rules=[...GIYUMEI_ACTION_IDS,2].map(id=>({...decodeBossActionRule(id),effectElement:rom.actions.find(a=>a.id===id).w18>>>27&31}));
  for(const g of[await buildView(row),buildPreparedCommand(rules),buildTargetGate()])await save(g);
  const models=new Map(),locations=new Map(),slots=new Map(program.slots.map(s=>[s.name,s]));async function model(name){if(!models.has(name)){const x=await load(name);models.set(name,x.ir);locations.set(name,x.module);}return models.get(name);}
  function slot(name,d,initial){if(!name)throw Error('Missing slot name');const width=d.width??d.shape[1],old=slots.get(name);if(old){if(old.width!==width||old.dtype!==d.dtype)throw Error('315/346 slot type '+name);if(initial)old.initial=initial;}else{const s={name,width,dtype:d.dtype,initial:initial??{kind:'zero'}};slots.set(name,s);program.slots.push(s);}return name;}
  async function call(name,id,inputs,outputs={}){const m=await model(name);return{op:'call',id,model:name,inputs:Object.fromEntries(m.inputs.map(d=>{if(!inputs[d.name])throw Error('Missing '+id+'.'+d.name);return[d.name,slot(inputs[d.name],d)];})),outputs:Object.fromEntries(m.outputs.map(d=>[d.name,slot(outputs[d.name]??'work.'+name+'.'+d.name,d)]))};}
  const mode2=slot('constant.giyumei.mode2',{width:1,dtype:'float32'},{kind:'constant',values:[2]}),ai=await model('rom-ai-definition-expanded-step');
  for(const key of['definitionId','storedTransitionId','transitionCount']){const d=ai.inputs.find(d=>d.name===key);slot('ai.'+key,d,{kind:'input',path:['ai',key],default:row.ai[key]});program.inputs['ai.'+key]='ai.'+key;program.outputs['ai.'+key]='ai.'+key;}
  const original=program.steps[0].body,body=[],preOutputs={};
  async function replaceAi(s){const dynamic=Object.fromEntries(['definitionId','storedTransitionId','transitionCount'].map(k=>[k,'ai.'+k])),feedback=Object.fromEntries(Object.entries(ai.contract.feedback).map(([k,v])=>[v,['seed','position'].includes(k)?'state.'+k:'ai.'+k]));return call(ai.name,s.id,{...s.inputs,...dynamic},{...s.outputs,...feedback});}
  for(let i=0;i<original.length;i++){
    const s=original[i];
    if(s.op==='repeat'){const inner=[];for(const c of s.body)inner.push(c.model==='rom-ai-jadama-step'?await replaceAi(c):c);body.push({...s,count:s.id.includes(':remaining')?AI_BUDGET-1:s.count,body:inner});continue;}
    if(s.op==='capture'){body.push({...s,tensors:{...s.tensors,'ai.definitionId':'ai.definitionId','ai.storedTransitionId':'ai.storedTransitionId','ai.transitionCount':'ai.transitionCount'}});continue;}
    if(s.op!=='call'){body.push(s);continue;}
    if(s.model==='rom-jadama-state-view2'){body.push(await call('rom-giyumei-state-view2',s.id,{...s.inputs,definitionId:'ai.definitionId'},s.outputs));continue;}
    if(s.id==='turn:extra'){body.push(await call(s.model,s.id,{...s.inputs,mode:mode2},s.outputs));continue;}
    if(s.model==='rom-ai-jadama-step'){body.push(await replaceAi(s));continue;}
    if(s.model==='rom-jadama-prepared-command2'){body.push(await call('rom-giyumei-prepared-command2',s.id,s.inputs,s.outputs));continue;}
    if(s.model==='rom-jadama-prepare-appeal2'){
      const m=await model(cut.prefix),outputs=Object.fromEntries(m.outputs.map(d=>[d.name,s.outputs[d.name]??'work.giyumei.pre.'+d.name]));
      for(const f of cut.frontier)outputs[f.input]='work.giyumei.pre.'+f.input;
      Object.assign(preOutputs,outputs);body.push(await call(cut.prefix,s.id,{...s.inputs,tension:'state.tension'},outputs));continue;
    }
    if(s.model==='rom-jadama-prepare-primary2'){
      const feeds={...s.inputs,tension:'state.tension'};for(const f of cut.frontier)feeds[f.input]=preOutputs[f.input];
      body.push(await call(cut.suffix,s.id,feeds,{...s.outputs,nextTension:'state.tension'}));continue;
    }
    if(s.model==='rom-boss-route-core-gates'){
      body.push(await call('rom-giyumei-core-entry2',s.id.replace(':gates',':core-entry'),{actors:'state.actors',sourceIndex:'work.rom-boss-route-command-open.sourceIndex',actionId:s.inputs.action,targetCount:'work.rom-boss-command-route2.nextTargetCount',enabled:s.inputs.commandEnabled},{nextAction:s.inputs.action,nextTargetCount:'work.rom-boss-command-route2.nextTargetCount',ordinaryGate:s.inputs.ordinaryGate,eventGate:s.inputs.eventGate}));body.push(s);continue;
    }
    if(s.model==='rom-tension-event-core2'){body.push(await call('rom-collection-tension-event-core2',s.id,s.inputs,s.outputs));continue;}
    if(s.model==='rom-jadama-target-gate2'){
      const id=s.id.replace(':target-check',''),prefix=id+':family52:',oldGroup=original.filter(x=>x.id?.startsWith(prefix)),single=oldGroup.find(x=>x.model==='rom-weapon-tension-action-core2'),result=oldGroup.find(x=>x.model==='rom-status-family-result2');if(!single||!result)throw Error('Missing frozen52 composition boundary');
      body.push(await call('rom-giyumei-target-gate2',s.id,s.inputs,{familyEnabled:'flow.giyumeiFamily',coreTargetCount:'work.giyumei.coreTargetCount',nextSupported:'state.supported',nextFinished:'state.finished'}));
      const feeds=Object.fromEntries(['seed','position','actors','aux','config','combo','context','status','wakeSkip','tension','weapon','preparationState'].map(k=>[k,'state.'+k]));Object.assign(feeds,{sourceIndex:s.inputs.sourceIndex,actionId:s.inputs.actionId,enabled:'flow.giyumeiFamily',targetCount:'work.giyumei.coreTargetCount',resistances:single.inputs.resistances,elementResistances:single.inputs.elementResistances});
      const childSlots=new Map(family.slots.map(d=>[d.name,d]));for(const[k,n]of Object.entries(family.inputs))slot(feeds[k],childSlots.get(n));
      const outputs=Object.fromEntries(Object.entries(result.outputs).filter(([k])=>family.outputs[k]));for(const[k,n]of Object.entries(outputs))slot(n,childSlots.get(family.outputs[k]));
      body.push(...inlineResidentProgram({parent:program,child:family,prefix:id+':family60',inputs:feeds,outputs}));for(const d of program.slots)slots.set(d.name,d);
      while(i+1<original.length&&original[i+1].id?.startsWith(prefix))i++;continue;
    }
    body.push(s);
  }
  program.steps[0].body=body;
  const at=(v,path)=>path.reduce((x,k)=>x?.[k],v),fixedAi=monsterReadonly(row.ai);
  for(const s of program.slots){if(s.initial.kind==='input'){const v=at(row,s.initial.path);if(v!==undefined)s.initial.default=Array.isArray(v)?v:[v];}if(s.name.startsWith('ai.')&&s.initial.kind==='constant'&&Object.hasOwn(fixedAi,s.name.slice(3)))s.initial={kind:'constant',values:fixedAi[s.name.slice(3)]};}
  function monsterReadonly(ai){return Object.fromEntries(Object.entries(ai).map(([k,v])=>[k,Array.isArray(v)?v:[v]]));}
  const usedNames=new Set(),usedSlots=new Set(Object.values(program.outputs));function visit(ss,fn){for(const s of ss){if(s.op==='repeat')visit(s.body,fn);else if(s.op==='call'){usedNames.add(s.model);Object.values(s.inputs).forEach(v=>usedSlots.add(v));Object.values(s.outputs).forEach(v=>usedSlots.add(v));fn?.(s);}else if(s.op==='capture')Object.values(s.tensors).forEach(v=>usedSlots.add(v));}}visit(program.steps);
  for(const name of usedNames)await model(name);
  program.slots=program.slots.filter(s=>usedSlots.has(s.name));for(const[k,v]of Object.entries(program.inputs))if(!usedSlots.has(v))delete program.inputs[k];program.modules=[...usedNames].map(n=>locations.get(n));
  visit(program.steps,s=>{const m=models.get(s.model);if(!m)throw Error('Missing final model '+s.model);for(const k of['inputs','outputs'])for(const d of m[k]){const slotDef=slots.get(s[k][d.name]);if(!slotDef||slotDef.width!==d.shape[1]||slotDef.dtype!==d.dtype)throw Error('Final315/346 binding '+s.id+'.'+d.name);}});
  Object.assign(program,{name:'dq9-monster315-346-deferred-combat-resident',version:1,scope:'One manually normal-attacking party0 and original315 or346 enemy192. Judgment2 leaves action2 placeholders and selects during preparation after appeal. Extra mode2 executes two enemy commands and its mandatory RNG. Shared60 exact caller includes112 selector45,569 subtype2 and292 four hits; planned target identity/count is checked before body execution. MP insufficiency is handled at core entry after preparation. The new five-event caller accounts for party residual confusion without changing enemy target collection. Finite AI retry exhaustion or unsupported state remains explicit. Camera/menu/items/extra rosters/raw presentation arenas are excluded.',publicState:'Decoded combat/tension/preparation state with unchanged actor bounds, explicit initial weapon and resistance values, and original315/346 definition ID. Each initial row is source audited; no definition transition occurs in this six-action closure.',provenance:{baseProgramSha256:hash(baseBytes),actionFamilyProgramSha256:hash(familyBytes),definitions:GIYUMEI_DEFINITIONS,profiles:[315,346].map(giyumeiProfileAudit),sourceAuditSha256:sourceSHA256(profile.sourceAudit),preparationCut:cut,retryBudget:{candidatesPerDecision:AI_BUDGET,meaning:'A finite computation limit, never a success filter.'},camera:'Absent from both actual combat comparison sides.'}});
  const text=JSON.stringify(program,null,2)+'\n',report={schema:'dq9-giyumei-program-build-v1',programSha256:hash(text),modules:program.modules,profiles:[315,346].map(giyumeiProfileAudit)};
  for(const[f,v]of[['giyumei-resident-program.json',program],['giyumei-program-build.json',report],['giyumei-initial-profile-audit.json',[315,346].map(giyumeiProfileAudit)]]){await writeFile(new URL(f+'.tmp',dir),JSON.stringify(v,null,2)+'\n');await rename(new URL(f+'.tmp',dir),new URL(f,dir));}
  return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const r=await buildGiyumeiProgram();console.log(JSON.stringify({sha256:r.programSha256,modules:r.modules.length},null,2));}

