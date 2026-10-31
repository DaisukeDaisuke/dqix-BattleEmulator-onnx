// New310/747 composition: immutable arithmetic kernels and dynamic ROM tables.
// This file performs typed graph connections only, never host battle arithmetic.
import {Graph} from '../graph-builder.mjs';
import {buildCommonCommandOpen} from './build-anonn-program.mjs';
import {inlineResidentProgram} from './compose-resident-program.mjs';
import {decodeBossActionRule} from '../boss-action-rules.mjs';
import {makeErusionnRow,erusionnProfileAudit,MONSTER310,MONSTER747} from './erusionn-profiles.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex'),EXECUTED=[1,14,16,539,161],AI_BUDGET=32;
async function load(name){for(const prefix of['','../'])try{const b=await readFile(new URL(prefix+name+'.onnx',dir)),j=JSON.parse(await readFile(new URL(prefix+name+'.json',dir),'utf8'));auditModelBytes(b,{name});return{ir:j,module:{name,onnx:prefix+name+'.onnx',ir:prefix+name+'.json',sha256:hash(b),bytes:b.length,nodes:j.nodes.length,routingOnly:!!j.contract.routingOnly}};}catch(e){if(e.code!=='ENOENT')throw e;}throw Error('Missing '+name);}
async function save(g){const b=g.model();auditModelBytes(b,{name:g.name});for(const[f,v]of[[g.name+'.onnx',b],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n']]){await writeFile(new URL(f+'.tmp',dir),v);await rename(new URL(f+'.tmp',dir),new URL(f,dir));}}
async function buildView(row){
  const old=(await load('rom-tension-state-view2')).ir,g=new Graph('rom-erusionn-state-view2',{
    ...old.contract,defaults:{...old.contract.defaults,actors:row.actors,aux:row.aux,wakeSkip:row.wakeSkip,tension:row.tension,resistanceBytes:row.resistanceBytes,definitionId:310},
    inputDomains:{...old.contract.inputDomains,definitionId:{values:[310,747]}},
    scope:'Typed combat view for the original310/747 definition pair. Both records have judgment1, extra mode2 and identical anger rules; current stats/resistances remain represented state when the definition pointer changes. Only callbacks selected by these original two records may use this view. Neutral generic metadata is not a reconstruction of unrelated abilities/equipment.',
    scopeJa:'魔教師エルシオンの310/747 AI表を現在状態へ接続します。表切替でHP・MP・能力・耐性を初期化しません。'
  }),x=Object.fromEntries(old.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)])),definition=g.input('definitionId'),out=g.inline(old,x,'represented'),valid=g.or(g.eq(definition,310),g.eq(definition,747));
  out.supported=g.and(valid,out.supported);for(const[n,v]of Object.entries(out))g.output(v,n);return g;
}
function buildTargetGate(){
  const g=new Graph('rom-erusionn-target-gate2',{routingOnly:true,inputDomains:{sourceIndex:{values:[0,1]},actionId:{min:0,max:65535,integer:true},targetCount:{min:0,max:8,integer:true},targets:{width:8,min:-1,max:255,integer:true},supported:{values:[0,1]},finished:{values:[0,1]}},scope:'Original310/747 planning target contract: party normal1 targets192, enemy1/14/16/539 targets0, enemy161 targets192. All have one collected target here. Record539 duplicates that collected target in the immutable execution-target kernel, so its planned count remains1. Unknown actions/targets stop before body RNG.',scopeJa:'計画時の1対象を確認します。「おうふくビンタ」の2発への展開は共通の行動核で実行します。'}),source=g.input('sourceIndex'),action=g.input('actionId'),count=g.input('targetCount'),target=g.split(g.input('targets',['N',8]),8)[0],enabled=g.input('enabled',['N',1],'bool'),supported=g.input('supported'),finished=g.input('finished'),party=g.eq(source,0),self=g.eq(action,161),known=g.or(...EXECUTED.map(id=>g.eq(action,id))),valid=g.and(known,g.eq(count,1),g.or(g.and(party,g.eq(action,1),g.eq(target,192)),g.and(g.not(party),g.eq(target,g.where(self,192,0))))),bad=g.and(enabled,g.not(valid));
  for(const[n,v]of Object.entries({familyEnabled:g.and(enabled,valid),nextSupported:g.where(bad,0,supported),nextFinished:g.where(bad,1,finished)}))g.output(v,n);return g;
}
function replaceStrings(x,from,to){if(typeof x==='string')return x.replaceAll(from,to);if(Array.isArray(x))return x.map(v=>replaceStrings(v,from,to));if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,replaceStrings(v,from,to)]));return x;}
export async function buildErusionnProgram(){
  const baseBytes=await readFile(new URL('goreonn-resident-program.json',dir)),familyBytes=await readFile(new URL('tension-family-program.json',dir)),program=JSON.parse(baseBytes),family=JSON.parse(familyBytes),row=makeErusionnRow();
  const rules=EXECUTED.map(id=>({...decodeBossActionRule(id),effectElement:rom.actions.find(a=>a.id===id).w18>>>27&31}));
  for(const g of[await buildView(row),buildTargetGate(),await buildCommonCommandOpen(row,rules,'rom-erusionn-route-command-open')])await save(g);
  const models=new Map(),locations=new Map();async function model(name){if(!models.has(name)){const x=await load(name);models.set(name,x.ir);locations.set(name,x.module);}return models.get(name);}
  const slots=new Map(program.slots.map(s=>[s.name,s]));function slot(name,d,initial){const width=d.width??d.shape[1],old=slots.get(name);if(old){if(old.width!==width||old.dtype!==d.dtype)throw Error('Erusionn slot type '+name);if(initial)old.initial=initial;}else{const s={name,width,dtype:d.dtype,initial:initial??{kind:'zero'}};slots.set(name,s);program.slots.push(s);}return name;}
  async function call(name,id,inputs,outputs={}){const m=await model(name);return{op:'call',id,model:name,inputs:Object.fromEntries(m.inputs.map(d=>{if(!inputs[d.name])throw Error('Missing '+id+'.'+d.name);return[d.name,slot(inputs[d.name],d)];})),outputs:Object.fromEntries(m.outputs.map(d=>[d.name,slot(outputs[d.name]??'work.'+name+'.'+d.name,d)]))};}
  const ai=await model('rom-ai-definition-expanded-step');
  for(const key of['definitionId','storedTransitionId','transitionCount']){const d=ai.inputs.find(d=>d.name===key),s=slot('ai.'+key,d,{kind:'input',path:['ai',key],default:row.ai[key]});program.inputs['ai.'+key]=s;program.outputs['ai.'+key]=s;}
  const mode2=slot('constant.erusionn-mode2',{width:1,dtype:'float32'},{kind:'constant',values:[2]}),slot2=slot('constant.erusionn-slot2',{width:1,dtype:'float32'},{kind:'constant',values:[2]});
  const original=program.steps[0].body,ai0=original.filter(s=>s.id?.startsWith('turn:ai0:')),command1=original.filter(s=>s.id?.startsWith('turn:command1:')||s.id==='command1'),expanded=[];
  for(const s of original){
    if(s.id==='turn:layout-feed')expanded.push(...ai0.map(x=>replaceStrings(replaceStrings(x,'ai0','ai1'),'enemy0.','enemy1.')));
    if(s.id==='turn:tail-gate')expanded.push(...command1.map(x=>{const v=replaceStrings(x,'command1','command2');if(v.id==='turn:command2:open')v.inputs.slot=slot2;return v;}));
    expanded.push(s);
  }
  const stateWrites=Object.fromEntries(['seed','position','actors','aux','status','wakeSkip','combo','context','preparationState','tension'].map(k=>['next'+k[0].toUpperCase()+k.slice(1),'state.'+k]));
  async function transform(steps){const out=[];for(let index=0;index<steps.length;index++){
    const s=steps[index];
    if(s.op==='repeat'){out.push({...s,count:s.id.includes(':remaining')?AI_BUDGET-1:s.count,body:await transform(s.body)});continue;}
    if(s.op==='capture'){out.push({...s,tensors:{...s.tensors,'ai.definitionId':'ai.definitionId','ai.storedTransitionId':'ai.storedTransitionId','ai.transitionCount':'ai.transitionCount'}});continue;}
    if(s.op!=='call'){out.push(s);continue;}
    if(s.model==='rom-tension-state-view2'){out.push(await call('rom-erusionn-state-view2',s.id,{...s.inputs,definitionId:'ai.definitionId'},s.outputs));continue;}
    if(s.model==='rom-ai-transition-step'){
      const dynamic=Object.fromEntries(['definitionId','storedTransitionId','transitionCount'].map(k=>[k,'ai.'+k])),feedback=Object.fromEntries(Object.entries(ai.contract.feedback).map(([k,v])=>[v,k==='seed'||k==='position'?'state.'+k:'ai.'+k]));
      out.push(await call(ai.name,s.id,{...s.inputs,...dynamic},{...s.outputs,...feedback}));continue;
    }
    if(s.id==='turn:extra'){out.push(await call(s.model,s.id,{...s.inputs,mode:mode2},s.outputs));continue;}
    if(s.model==='rom-duel-route-extra-check'){out.push(await call('rom-boss-route-extra-check',s.id,s.inputs,s.outputs));continue;}
    if(s.model==='rom-duel-plan-layout2'){out.push(await call('rom-boss-plan-layout3',s.id,s.inputs,s.outputs));continue;}
    if(s.model==='rom-goreonn-route-command-open'){out.push(await call('rom-erusionn-route-command-open',s.id,s.inputs,s.outputs));continue;}
    if(s.model==='rom-tension-opponent-self-route2'){
      const next=steps[index+1],observe=steps[index+3];if(next.model!=='rom-weapon-tension-action-core2'||observe.model!=='rom-tension-core-observe2')throw Error('Unexpected immutable body pattern');
      const gate=await call('rom-erusionn-target-gate2',s.id,s.inputs,{nextSupported:'state.supported',nextFinished:'state.finished',familyEnabled:'flow.erusionnFamilyEnabled'});out.push(gate);
      const feeds={...next.inputs,actionId:s.inputs.actionId,sourceIndex:s.inputs.sourceIndex,enabled:'flow.erusionnFamilyEnabled'};
      // Every child public input/output is typed before composing aliases.
      const childSlots=new Map(family.slots.map(d=>[d.name,d]));for(const[k,inner]of Object.entries(family.inputs))slot(feeds[k],childSlots.get(inner));
      const selected={...stateWrites,...observe.outputs};for(const k of Object.keys(selected))if(!family.outputs[k])delete selected[k];
      for(const[k,outer]of Object.entries(selected))slot(outer,childSlots.get(family.outputs[k]));
      out.push(...inlineResidentProgram({parent:program,child:family,prefix:s.id.replace(':target-check',':family'),inputs:feeds,outputs:selected}));for(const d of program.slots)slots.set(d.name,d);index+=3;continue;
    }
    out.push(s);
  }return out;}
  program.steps[0].body=await transform(expanded);
  const at=(v,path)=>path.reduce((x,k)=>x?.[k],v);for(const s of program.slots)if(s.initial.kind==='input'){const value=at(row,s.initial.path);if(value!==undefined)s.initial.default=Array.isArray(value)?value:[value];}
  const usedModels=new Set(),usedSlots=new Set(Object.values(program.outputs));function visit(ss){for(const s of ss){if(s.op==='repeat')visit(s.body);else if(s.op==='call'){usedModels.add(s.model);Object.values(s.inputs).forEach(v=>usedSlots.add(v));Object.values(s.outputs).forEach(v=>usedSlots.add(v));}else if(s.op==='capture')Object.values(s.tensors).forEach(v=>usedSlots.add(v));}}visit(program.steps);
  program.slots=program.slots.filter(s=>usedSlots.has(s.name));for(const[k,v]of Object.entries(program.inputs))if(!usedSlots.has(v))delete program.inputs[k];
  program.modules=[];for(const name of usedModels){await model(name);program.modules.push(locations.get(name));}
  function validate(ss){for(const s of ss){if(s.op==='repeat')validate(s.body);if(s.op!=='call')continue;const m=models.get(s.model);for(const k of['inputs','outputs'])for(const d of m[k]){const x=slots.get(s[k][d.name]);if(!x||x.width!==d.shape[1]||x.dtype!==d.dtype)throw Error('Final binding '+s.id+'.'+d.name);}}}validate(program.steps);
  Object.assign(program,{name:'dq9-monster310-definition-combat-resident',version:1,scope:'One manually normal-attacking party0 and original enemy310/747 with two actions. Dynamic ONNX ROM tables handle operation34 reselection and persist definitionId/storedTransitionId across actions and turns. OriginalMonsterId310, current stats/resistances and cursors are preserved. The48-action immutable family supplies executed1/14/16/539/161; unsupported target/action/AI retry exhaustion remains explicit. Camera, menu/items, extra actors and unrepresented raw presentation memory are outside.',publicState:'Previous represented combat/tension state plus current AI definitionId/storedTransitionId and diagnostic cumulative transitionCount. Definition switching is not simulated by resetting a fresh encounter.',provenance:{baseProgramSha256:hash(baseBytes),actionFamilyProgramSha256:hash(familyBytes),originalMonsterId:310,definitions:[MONSTER310,MONSTER747],profile:erusionnProfileAudit(),camera:'Absent from both combat comparison sides.',retryBudget:{candidatesPerDecision:AI_BUDGET,meaning:'Finite computation budget; unfinished decisions stop with supported0, never count as a completed battle.'}},scheduleDifference:'The same large AI and action kernels are reused through typed binding tables. Every input lane executes the masked schedule, retaining all seeds and keeping intermediate state resident.'});
  const text=JSON.stringify(program,null,2)+'\n',report={schema:'dq9-erusionn-program-build-v1',name:program.name,programSha256:hash(text),baseProgramSha256:hash(baseBytes),actionFamilyProgramSha256:hash(familyBytes),modules:program.modules,profile:erusionnProfileAudit()};
  for(const[f,v]of[['erusionn-resident-program.json',program],['erusionn-program-build.json',report],['erusionn-initial-profile-audit.json',erusionnProfileAudit()]]){await writeFile(new URL(f+'.tmp',dir),JSON.stringify(v,null,2)+'\n');await rename(new URL(f+'.tmp',dir),new URL(f,dir));}return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const r=await buildErusionnProgram();console.log(JSON.stringify({name:r.name,sha256:r.programSha256,modules:r.modules.length},null,2));}
