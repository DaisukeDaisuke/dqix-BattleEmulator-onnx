import {sourceSHA256} from '../../data/source-authority.mjs';
// New319/751 initial-state composition: deferred judgment2 selection and
// persistent definition changes use the same immutable AI and action kernels.
import {Graph} from '../graph-builder.mjs';
import {inlineResidentProgram} from './compose-resident-program.mjs';
import {decodeBossActionRule} from '../boss-action-rules.mjs';
import {makeErugi1Row,erugi1ProfileAudit,ERUGI1_ACTION_IDS,MONSTER319,MONSTER751} from './erugi1-profiles.mjs';
import {copyPartyOvermaxModel} from './party-overmax-admission.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
import {buildErugi1Tail} from './build-erugi1-tail.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex'),AI_BUDGET=32;
const boolean={values:[false,true,0,1]},flag={min:0,max:1,integer:true};
async function load(name){for(const prefix of['','../'])try{const onnx=await readFile(new URL(prefix+name+'.onnx',dir)),ir=JSON.parse(await readFile(new URL(prefix+name+'.json',dir)));auditModelBytes(onnx,{name});return{ir,onnx,module:{name,onnx:prefix+name+'.onnx',ir:prefix+name+'.json',sha256:hash(onnx),bytes:onnx.length,nodes:ir.nodes.length,routingOnly:!!ir.contract.routingOnly}};}catch(e){if(e.code!=='ENOENT')throw e;}throw Error('Missing '+name);}
async function save(g){const b=g.model();auditModelBytes(b,{name:g.name});for(const[f,v]of[[g.name+'.onnx',b],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n']]){await writeFile(new URL(f+'.tmp',dir),v);await rename(new URL(f+'.tmp',dir),new URL(f,dir));}}
async function buildView(row){const old=(await load('rom-tension-state-view2')).ir,g=new Graph('rom-erugi1-state-view2',{...old.contract,defaults:{...old.contract.defaults,actors:row.actors,aux:row.aux,wakeSkip:row.wakeSkip,tension:row.tension,resistanceBytes:row.resistanceBytes,definitionId:319},inputDomains:{...old.contract.inputDomains,definitionId:{values:[319,751]}},scope:'Current represented combat state feeds original319/751 deferred dynamic AI. Both records share judgment2/mode2/anger/resistance rules. Tension is preserved and supplied to callback96; HP/MP/stats never reset on a definition switch. The separate admission copy permits original partyHP305/max300.',scopeJa:'319/751のAI表を現在状態へ接続し、テンションと能力値を表切替後も保持します。'}),x=Object.fromEntries(old.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)])),definition=g.input('definitionId'),o=g.inline(old,x,'view');o.supported=g.and(o.supported,g.or(g.eq(definition,319),g.eq(definition,751)));for(const[n,v]of Object.entries(o))g.output(v,n);return g;}
function buildPreparedCommand(rules){
  const g=new Graph('rom-erugi1-prepared-command2',{routingOnly:true,inputDomains:{wasEnabled:boolean,plannedAction:{min:0,max:65535,integer:true},plannedCount:{min:0,max:8,integer:true},plannedTargets:{width:8,min:-1,max:255,integer:true},selectedAction:{min:0,max:65535,integer:true},selectedCount:{min:0,max:8,integer:true},selectedTargets:{width:8,min:-1,max:255,integer:true},supported:flag,finished:flag,sourceIndex:{values:[0,1]},resistanceBytes:{width:44,min:0,max:255,integer:true}},scope:'Select an actually completed deferred-AI command, then gather exact original action damage/effect-element columns. No host random or damage arithmetic. Unknown action IDs are rejected by the subsequent target gate.',scopeJa:'準備時AIが確定した行動と対象を受け取り、ROM行の属性に対応する耐性を接続します。'});
  const x={wasEnabled:g.input('wasEnabled',['N',1],'bool'),plannedAction:g.input('plannedAction'),plannedCount:g.input('plannedCount'),plannedTargets:g.input('plannedTargets',['N',8]),selectedAction:g.input('selectedAction'),selectedCount:g.input('selectedCount'),selectedTargets:g.input('selectedTargets',['N',8]),supported:g.input('supported'),finished:g.input('finished'),sourceIndex:g.input('sourceIndex'),resistanceBytes:g.input('resistanceBytes',['N',44])};
  const action=g.where(x.wasEnabled,x.selectedAction,x.plannedAction),count=g.where(x.wasEnabled,x.selectedCount,x.plannedCount),targets=g.where(x.wasEnabled,x.selectedTargets,x.plannedTargets),res=g.split(x.resistanceBytes,44),self=g.or(g.eq(action,161),g.eq(action,577)),enemyTarget=g.or(g.eq(x.sourceIndex,0),self),target=res.slice(0,22).map((v,i)=>g.where(enemyTarget,res[22+i],v));
  let index=g.constant(0);rules.forEach((r,i)=>index=g.where(g.eq(action,r.id),i,index));const col=k=>g.op('Gather',[g.constant(rules.map(r=>r[k]),'float32',[rules.length]),g.cast(index,'int32')],{axis:0},{shape:['N',1]}),byElement=e=>target.reduce((v,b,i)=>g.where(g.eq(e,i+1),b,v),g.constant(100));
  for(const[n,v]of Object.entries({action,targetCount:count,targets,continueEnabled:g.and(g.gt(x.supported,0),g.eq(x.finished,0)),resistances:g.cat([target[18],target[19],byElement(col('effectElement')),target[15],byElement(col('damageElement'))])}))g.output(v,n);return g;
}
function buildTargetGate(){
  const g=new Graph('rom-erugi1-target-gate2',{routingOnly:true,inputDomains:{sourceIndex:{values:[0,1]},actionId:{min:0,max:65535,integer:true},targetCount:{min:0,max:8,integer:true},targets:{width:8,min:-1,max:255,integer:true},enabled:boolean,supported:flag,finished:flag},scope:'Only manual party normal1 and the seven executed original319/751 records. Enemy161/577 target self192;1/540/189/20/286 target party0. Exactly one completed AI target is required. Party normal may have the original empty planned list and collects its only enemy in the immutable caller. Operation34 must finish reselection before this gate.',scopeJa:'元の319/751で実行される7行動と1対象を確認し、表切替行動は再選択が完了してから通します。'}),source=g.input('sourceIndex'),action=g.input('actionId'),count=g.input('targetCount'),target=g.split(g.input('targets',['N',8]),8)[0],enabled=g.input('enabled',['N',1],'bool'),supported=g.input('supported'),finished=g.input('finished'),party=g.eq(source,0),self=g.or(g.eq(action,161),g.eq(action,577)),known=g.or(...ERUGI1_ACTION_IDS.map(id=>g.eq(action,id))),valid=g.and(known,g.or(g.and(party,g.eq(action,1),g.or(g.eq(count,0),g.and(g.eq(count,1),g.eq(target,192)))),g.and(g.not(party),g.eq(count,1),g.eq(target,g.where(self,192,0))))),bad=g.and(enabled,g.not(valid));
  for(const[n,v]of Object.entries({familyEnabled:g.and(enabled,valid),nextSupported:g.where(bad,0,supported),nextFinished:g.where(bad,1,finished)}))g.output(v,n);return g;
}
export async function buildErugi1Program(){
  const baseBytes=await readFile(new URL('jadama-resident-program.json',dir)),familyBytes=await readFile(new URL('idle-family-program.json',dir)),program=JSON.parse(baseBytes),family=JSON.parse(familyBytes),row=makeErugi1Row(),cut=JSON.parse(await readFile(new URL('erugi1-preparation-cut.json',dir))),profile=erugi1ProfileAudit();
  const tailExtension=await buildErugi1Tail();
  const rules=[...ERUGI1_ACTION_IDS,2].map(id=>({...decodeBossActionRule(id),effectElement:rom.actions.find(a=>a.id===id).w18>>>27&31}));
  for(const g of[await buildView(row),buildPreparedCommand(rules),buildTargetGate()])await save(g);
  const models=new Map(),locations=new Map(),slots=new Map(program.slots.map(s=>[s.name,s]));async function model(name){if(!models.has(name)){const x=await load(name);models.set(name,x.ir);locations.set(name,x.module);}return models.get(name);}
  function slot(name,d,initial){if(!name)throw Error('Missing slot name');const width=d.width??d.shape[1],old=slots.get(name);if(old){if(old.width!==width||old.dtype!==d.dtype)throw Error('319 slot type '+name);if(initial)old.initial=initial;}else{const s={name,width,dtype:d.dtype,initial:initial??{kind:'zero'}};slots.set(name,s);program.slots.push(s);}return name;}
  async function call(name,id,inputs,outputs={}){const m=await model(name);return{op:'call',id,model:name,inputs:Object.fromEntries(m.inputs.map(d=>{if(!inputs[d.name])throw Error('Missing '+id+'.'+d.name);return[d.name,slot(inputs[d.name],d)];})),outputs:Object.fromEntries(m.outputs.map(d=>[d.name,slot(outputs[d.name]??'work.'+name+'.'+d.name,d)]))};}
  const mode2=slot('constant.erugi1.mode2',{width:1,dtype:'float32'},{kind:'constant',values:[2]}),ai=await model('rom-ai-definition-expanded-step');
  for(const key of['definitionId','storedTransitionId','transitionCount']){const d=ai.inputs.find(d=>d.name===key);slot('ai.'+key,d,{kind:'input',path:['ai',key],default:row.ai[key]});program.inputs['ai.'+key]='ai.'+key;program.outputs['ai.'+key]='ai.'+key;}
  const original=program.steps[0].body,body=[],preOutputs={};
  async function replaceAi(s){const dynamic=Object.fromEntries(['definitionId','storedTransitionId','transitionCount'].map(k=>[k,'ai.'+k])),feedback=Object.fromEntries(Object.entries(ai.contract.feedback).map(([k,v])=>[v,['seed','position'].includes(k)?'state.'+k:'ai.'+k]));return call(ai.name,s.id,{...s.inputs,...dynamic},{...s.outputs,...feedback});}
  for(let i=0;i<original.length;i++){
    const s=original[i];
    if(s.op==='repeat'){const inner=[];for(const c of s.body)inner.push(c.model==='rom-ai-jadama-step'?await replaceAi(c):c);body.push({...s,count:s.id.includes(':remaining')?AI_BUDGET-1:s.count,body:inner});continue;}
    if(s.op==='capture'){body.push({...s,tensors:{...s.tensors,'ai.definitionId':'ai.definitionId','ai.storedTransitionId':'ai.storedTransitionId','ai.transitionCount':'ai.transitionCount'}});continue;}
    if(s.op!=='call'){body.push(s);continue;}
    if(s.model==='rom-boss-turn-tail2'){body.push(await call(tailExtension.model,s.id,s.inputs,s.outputs));continue;}
    if(s.model==='rom-jadama-state-view2'){body.push(await call('rom-erugi1-state-view2',s.id,{...s.inputs,definitionId:'ai.definitionId'},s.outputs));continue;}
    if(s.id==='turn:extra'){body.push(await call(s.model,s.id,{...s.inputs,mode:mode2},s.outputs));continue;}
    if(s.model==='rom-ai-jadama-step'){body.push(await replaceAi(s));continue;}
    if(s.model==='rom-jadama-prepared-command2'){body.push(await call('rom-erugi1-prepared-command2',s.id,s.inputs,s.outputs));continue;}
    if(s.model==='rom-jadama-prepare-appeal2'){
      const m=await model(cut.prefix),outputs=Object.fromEntries(m.outputs.map(d=>[d.name,s.outputs[d.name]??'work.erugi1.pre.'+d.name]));
      for(const f of cut.frontier)outputs[f.input]='work.erugi1.pre.'+f.input;
      Object.assign(preOutputs,outputs);body.push(await call(cut.prefix,s.id,{...s.inputs,tension:'state.tension'},outputs));continue;
    }
    if(s.model==='rom-jadama-prepare-primary2'){
      const feeds={...s.inputs,tension:'state.tension'};for(const f of cut.frontier)feeds[f.input]=preOutputs[f.input];
      body.push(await call(cut.suffix,s.id,feeds,{...s.outputs,nextTension:'state.tension'}));continue;
    }
    if(s.model==='rom-jadama-target-gate2'){
      const id=s.id.replace(':target-check',''),prefix=id+':family52:',oldGroup=original.filter(x=>x.id?.startsWith(prefix)),single=oldGroup.find(x=>x.model==='rom-weapon-tension-action-core2'),result=oldGroup.find(x=>x.model==='rom-status-family-result2');if(!single||!result)throw Error('Missing frozen52 composition boundary');
      body.push(await call('rom-erugi1-target-gate2',s.id,s.inputs,{familyEnabled:'flow.erugi1Family',nextSupported:'state.supported',nextFinished:'state.finished'}));
      const feeds=Object.fromEntries(['seed','position','actors','aux','config','combo','context','status','wakeSkip','tension','weapon','preparationState'].map(k=>[k,'state.'+k]));Object.assign(feeds,{sourceIndex:s.inputs.sourceIndex,actionId:s.inputs.actionId,enabled:'flow.erugi1Family',resistances:single.inputs.resistances,elementResistances:single.inputs.elementResistances});
      const childSlots=new Map(family.slots.map(d=>[d.name,d]));for(const[k,n]of Object.entries(family.inputs))slot(feeds[k],childSlots.get(n));
      const outputs=Object.fromEntries(Object.entries(result.outputs).filter(([k])=>family.outputs[k]));for(const[k,n]of Object.entries(outputs))slot(n,childSlots.get(family.outputs[k]));
      body.push(...inlineResidentProgram({parent:program,child:family,prefix:id+':family49',inputs:feeds,outputs}));for(const d of program.slots)slots.set(d.name,d);
      while(i+1<original.length&&original[i+1].id?.startsWith(prefix))i++;continue;
    }
    body.push(s);
  }
  program.steps[0].body=body;
  const at=(v,path)=>path.reduce((x,k)=>x?.[k],v),fixedAi=monsterReadonly(row.ai);
  for(const s of program.slots){if(s.initial.kind==='input'){const v=at(row,s.initial.path);if(v!==undefined)s.initial.default=Array.isArray(v)?v:[v];}if(s.name.startsWith('ai.')&&s.initial.kind==='constant'&&Object.hasOwn(fixedAi,s.name.slice(3)))s.initial={kind:'constant',values:fixedAi[s.name.slice(3)]};}
  function monsterReadonly(ai){return Object.fromEntries(Object.entries(ai).map(([k,v])=>[k,Array.isArray(v)?v:[v]]));}
  const usedNames=new Set(),usedSlots=new Set(Object.values(program.outputs));function visit(ss,fn){for(const s of ss){if(s.op==='repeat')visit(s.body,fn);else if(s.op==='call'){usedNames.add(s.model);Object.values(s.inputs).forEach(v=>usedSlots.add(v));Object.values(s.outputs).forEach(v=>usedSlots.add(v));fn?.(s);}else if(s.op==='capture')Object.values(s.tensors).forEach(v=>usedSlots.add(v));}}visit(program.steps);
  const variants=new Map(),admissionProofs=[];for(const name of usedNames){const originalModel=await load(name),copy=await copyPartyOvermaxModel({...originalModel,directory:dir});if(copy.proof){variants.set(name,copy.module.name);models.set(copy.module.name,copy.ir);locations.set(copy.module.name,copy.module);admissionProofs.push(copy.proof);}else await model(name);}
  visit(program.steps,s=>{if(variants.has(s.model))s.model=variants.get(s.model);});usedNames.clear();visit(program.steps);
  program.slots=program.slots.filter(s=>usedSlots.has(s.name));for(const[k,v]of Object.entries(program.inputs))if(!usedSlots.has(v))delete program.inputs[k];program.modules=[...usedNames].map(n=>locations.get(n));
  visit(program.steps,s=>{const m=models.get(s.model);if(!m)throw Error('Missing final model '+s.model);for(const k of['inputs','outputs'])for(const d of m[k]){const slotDef=slots.get(s[k][d.name]);if(!slotDef||slotDef.width!==d.shape[1]||slotDef.dtype!==d.dtype)throw Error('Final319 binding '+s.id+'.'+d.name);}});
  Object.assign(program,{name:'dq9-monster319-deferred-definition-combat-resident',version:1,scope:'One manually normal-attacking party0 and original319 enemy192. Judgment2 leaves action2 placeholders and selects during preparation after appeal. Operation34 reselects dynamically from original319/751 definitions, preserving current combat state/cursors; originalMonsterId319 remains fixed. Extra mode2 executes two enemy commands with the mandatory random draw. Exact49 kernels supply1/540/189/20/161/286/577, including persistent tension. Original initial partyHP305/max300 is admitted by numerical-byte-identical kernel copies; the separate new tail restores the actual positive-healing-amount gate. Unsupported target/state or finite AI retry exhaustion stops explicitly. Camera/menu/items/other rosters and raw presentation arenas remain outside.',publicState:'Decoded combat/tension/preparation state plus AI definitionId/storedTransitionId/transitionCount. Current partyHP may exceed maxHP within the unchanged signed-vital individual bounds. This is not a full raw save-state decoder.',provenance:{baseProgramSha256:hash(baseBytes),actionFamilyProgramSha256:hash(familyBytes),originalMonsterId:319,definitions:[MONSTER319,MONSTER751],profile,sourceAuditSha256:sourceSHA256(profile.sourceAudit),preparationCut:cut,tailExtension,retryBudget:{candidatesPerDecision:AI_BUDGET,meaning:'A finite computation limit, never a success filter.'},admissionCopies:admissionProofs,camera:'Absent from both actual combat comparison sides.'}});
  const text=JSON.stringify(program,null,2)+'\n',report={schema:'dq9-erugi1-program-build-v1',programSha256:hash(text),modules:program.modules,profile,tailExtension,admissionCopies:admissionProofs};
  for(const[f,v]of[['erugi1-resident-program.json',program],['erugi1-program-build.json',report],['erugi1-initial-profile-audit.json',profile],['erugi1-admission-proof.json',{schema:'dq9-party-overmax-numerical-copy-v1',sourceProgramSha256:hash(baseBytes),copies:admissionProofs,allNumericalGraphsByteIdentical:admissionProofs.every(p=>p.numericalGraphByteIdentical),scope:'Only admission/name/metadata change. Individual field bounds and every numerical ONNX node, initializer, input/output descriptor are byte-identical to the frozen source modules. Actual whole319 initial-input proof is separate.'}]]){await writeFile(new URL(f+'.tmp',dir),JSON.stringify(v,null,2)+'\n');await rename(new URL(f+'.tmp',dir),new URL(f,dir));}
  return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const r=await buildErugi1Program();console.log(JSON.stringify({sha256:r.programSha256,modules:r.modules.length,admissionCopies:r.admissionCopies.length},null,2));}
