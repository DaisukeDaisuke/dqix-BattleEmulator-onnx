// New318 composition. Immutable module bindings change; numerical battle work
// remains in ONNX, including dynamic definition selection and MP precheck.
import {Graph} from '../graph-builder.mjs';
import {buildCommonCommandOpen} from './build-anonn-program.mjs';
import {inlineResidentProgram} from './compose-resident-program.mjs';
import {decodeBossActionRule} from '../boss-action-rules.mjs';
import {makeBaruborosuRow,baruborosuProfileAudit,MONSTER318_DEFINITIONS} from './baruborosu-profiles.mjs';
import {MONSTER318_EXECUTED_IDS as EXECUTED} from './build-monster318-preparation.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
async function load(name){for(const prefix of['','../'])try{const b=await readFile(new URL(prefix+name+'.onnx',dir)),ir=JSON.parse(await readFile(new URL(prefix+name+'.json',dir),'utf8'));auditModelBytes(b,{name});return{ir,module:{name,onnx:prefix+name+'.onnx',ir:prefix+name+'.json',sha256:hash(b),bytes:b.length,nodes:ir.nodes.length,routingOnly:!!ir.contract.routingOnly}};}catch(e){if(e.code!=='ENOENT')throw e;}throw Error('Missing '+name);}
async function save(g){const b=g.model();auditModelBytes(b,{name:g.name});const names=new Set(g.inputs.map(x=>x.name));for(const t of g.initializers){if(names.has(t.name))throw Error('Duplicate initializer '+t.name);names.add(t.name);}for(const n of g.nodes){for(const x of n.inputs)if(!names.has(x))throw Error('Missing producer '+x);for(const x of n.outputs){if(names.has(x))throw Error('Duplicate producer '+x);names.add(x);}}for(const[f,v]of[[g.name+'.onnx',b],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n']]){await writeFile(new URL(f+'.tmp',dir),v);await rename(new URL(f+'.tmp',dir),new URL(f,dir));}}
async function buildView(row){const old=(await load('rom-tension-state-view2')).ir,g=new Graph('rom-monster318-state-view2',{
 ...old.contract,defaults:{...old.contract.defaults,actors:row.actors,aux:row.aux,wakeSkip:row.wakeSkip,tension:row.tension,resistanceBytes:row.resistanceBytes,definitionId:318},inputDomains:{...old.contract.inputDomains,definitionId:{values:MONSTER318_DEFINITIONS.map(m=>m.id)}},
 scope:'Typed combat view for original318/750. All share judgment1, extra mode2 and current-combat config/resistances. The original monster ID318 and current HP/MP/stats survive definition changes; this view does not reconstruct unrelated raw effects or equipment.',scopeJa:'バルボロスの2種類のAI表を現在状態へ接続します。表切替でHP・MP・能力・耐性を初期化しません。'
 }),x=Object.fromEntries(old.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)])),definition=g.input('definitionId'),out=g.inline(old,x,'represented'),valid=g.or(...MONSTER318_DEFINITIONS.map(m=>g.eq(definition,m.id)));out.supported=g.and(valid,out.supported);for(const[n,v]of Object.entries(out))g.output(v,n);return g;}
function buildTargetGate(){
 const g=new Graph('rom-monster318-target-gate2',{routingOnly:true,inputDomains:{sourceIndex:{values:[0,1]},actionId:{min:0,max:65535,integer:true},targetCount:{min:0,max:8,integer:true},targets:{width:8,min:-1,max:255,integer:true},supported:{values:[0,1]},finished:{values:[0,1]}},scope:'Original318/750 planning contract: party normal1 selects enemy192; each of the six represented enemy records selects party0. Exactly one target is required. Callback146 may enumerate all eligible party, but the explicit roster has one party member. Unknown action or target stops before body RNG; inactive counts are bounded only for the frozen family input domain.'}),source=g.input('sourceIndex'),action=g.input('actionId'),count=g.input('targetCount'),targets=g.split(g.input('targets',['N',8]),8),enabled=g.input('enabled',['N',1],'bool'),supported=g.input('supported'),finished=g.input('finished'),party=g.eq(source,0),known=g.or(...EXECUTED.map(id=>g.eq(action,id))),valid=g.and(known,g.eq(count,1),g.or(g.and(party,g.eq(action,1),g.eq(targets[0],192)),g.and(g.not(party),g.eq(targets[0],0)))),bad=g.and(enabled,g.not(valid));
 for(const[n,v]of Object.entries({familyEnabled:g.and(enabled,valid),familyTargetCount:g.min(count,1),nextSupported:g.where(bad,0,supported),nextFinished:g.where(bad,1,finished)}))g.output(v,n);return g;
}
export async function buildBaruborosuProgram(){
 const baseBytes=await readFile(new URL('erusionn-resident-program.json',dir)),familyBytes=await readFile(new URL('darkwave-family-program.json',dir)),program=JSON.parse(baseBytes),family=JSON.parse(familyBytes),row=makeBaruborosuRow(),rules=EXECUTED.map(id=>({...decodeBossActionRule(id),effectElement:rom.actions.find(a=>a.id===id).w18>>>27&31}));
 for(const g of[await buildView(row),buildTargetGate(),await buildCommonCommandOpen(row,rules,'rom-monster318-route-command-open')])await save(g);
 const models=new Map(),locations=new Map();async function model(name){if(!models.has(name)){const x=await load(name);models.set(name,x.ir);locations.set(name,x.module);}return models.get(name);}
 const slots=new Map(program.slots.map(s=>[s.name,s]));function slot(name,d,initial){if(!name)throw Error('Unnamed slot');const width=d.width??d.shape[1],old=slots.get(name);if(old){if(old.width!==width||old.dtype!==d.dtype)throw Error('Slot type '+name);if(initial)old.initial=initial;}else{const s={name,width,dtype:d.dtype,initial:initial??{kind:'zero'}};slots.set(name,s);program.slots.push(s);}return name;}
 async function call(name,id,inputs,outputs={}){const m=await model(name);return{op:'call',id,model:name,inputs:Object.fromEntries(m.inputs.map(d=>{if(!inputs[d.name])throw Error('Missing '+id+'.'+d.name);return[d.name,slot(inputs[d.name],d)];})),outputs:Object.fromEntries(m.outputs.map(d=>[d.name,slot(outputs[d.name]??'work.'+name+'.'+d.name,d)]))};}
 const stateWrites=Object.fromEntries(['seed','position','actors','aux','status','wakeSkip','combo','context','preparationState','tension'].map(k=>['next'+k[0].toUpperCase()+k.slice(1),'state.'+k]));
 async function transform(steps){const out=[];for(let i=0;i<steps.length;i++){const s=steps[i];
  if(s.op==='repeat'){out.push({...s,body:await transform(s.body)});continue;}
  if(s.op!=='call'){out.push(s);continue;}
  if(s.model==='rom-erusionn-state-view2'){out.push(await call('rom-monster318-state-view2',s.id,s.inputs,s.outputs));continue;}
  if(s.model==='rom-erusionn-route-command-open'){out.push(await call('rom-monster318-route-command-open',s.id,s.inputs,s.outputs));continue;}
  if(s.model==='rom-tension-preparation2'){out.push(await call('rom-monster318-preparation2',s.id,s.inputs,s.outputs));continue;}
  if(s.model==='rom-boss-route-core-gates'){
   out.push(await call('rom-monster318-core-entry2',s.id.replace(':gates',':core-entry'),{actors:'state.actors',sourceIndex:'work.rom-boss-route-command-open.sourceIndex',actionId:s.inputs.action,targetCount:'work.rom-boss-command-route2.nextTargetCount',enabled:s.inputs.commandEnabled},{nextAction:s.inputs.action,nextTargetCount:'work.rom-boss-command-route2.nextTargetCount',ordinaryGate:s.inputs.ordinaryGate,eventGate:s.inputs.eventGate}));out.push(s);continue;
  }
  if(s.model==='rom-erusionn-target-gate2'){out.push(await call('rom-monster318-target-gate2',s.id,s.inputs,s.outputs));continue;}
  if(s.id.endsWith(':core:family:family-route')){
   const prefix=s.id.slice(0,-':family-route'.length),last=steps.find(x=>x.id===prefix+':result');if(!last)throw Error('Missing immutable family result');
   const feeds={...s.inputs,targetCount:'work.rom-monster318-target-gate2.familyTargetCount'},childSlots=new Map(family.slots.map(d=>[d.name,d]));for(const[k,inner]of Object.entries(family.inputs))slot(feeds[k],childSlots.get(inner));
   const selected={...stateWrites,...last.outputs};for(const k of Object.keys(selected))if(!family.outputs[k])delete selected[k];for(const[k,outer]of Object.entries(selected))slot(outer,childSlots.get(family.outputs[k]));
   out.push(...inlineResidentProgram({parent:program,child:family,prefix:prefix+'318',inputs:feeds,outputs:selected}));for(const d of program.slots)slots.set(d.name,d);while(i+1<steps.length&&steps[i+1].id?.startsWith(prefix+':'))i++;continue;
  }
  out.push(s);
 }return out;}
 program.steps[0].body=await transform(program.steps[0].body);
 const at=(v,path)=>path.reduce((x,k)=>x?.[k],v);for(const s of program.slots)if(s.initial.kind==='input'){const v=at(row,s.initial.path);if(v!==undefined)s.initial.default=Array.isArray(v)?v:[v];}
 const usedModels=new Set(),usedSlots=new Set(Object.values(program.outputs));function visit(ss){for(const s of ss){if(s.op==='repeat')visit(s.body);else if(s.op==='call'){usedModels.add(s.model);Object.values(s.inputs).forEach(x=>usedSlots.add(x));Object.values(s.outputs).forEach(x=>usedSlots.add(x));}else if(s.op==='capture')Object.values(s.tensors).forEach(x=>usedSlots.add(x));}}visit(program.steps);program.slots=program.slots.filter(s=>usedSlots.has(s.name));for(const[k,v]of Object.entries(program.inputs))if(!usedSlots.has(v))delete program.inputs[k];program.modules=[];for(const n of usedModels){await model(n);program.modules.push(locations.get(n));}
 function validate(ss){for(const s of ss){if(s.op==='repeat')validate(s.body);if(s.op!=='call')continue;const m=models.get(s.model);for(const k of['inputs','outputs'])for(const d of m[k]){const x=slots.get(s[k][d.name]);if(!x||x.width!==d.shape[1]||x.dtype!==d.dtype)throw Error('Final binding '+s.id+'.'+d.name);}}}validate(program.steps);
 Object.assign(program,{name:'dq9-monster318-definition-combat-resident',version:1,scope:'One manual-normal party0 and original enemy318 with two commands and persistent AI definitions318/750. OriginalMonsterId318, current stats/resistances and cursors survive operation34 reselection. The58-action family supplies six executed records including560 AGI/DEF reduction. Preparation and core-entry MP validation are explicit separate phases. Declared charm304/res5 and target susceptibility75 for160,50 for560 reproduce source integer comparison classes without claiming item identity. Unsupported target/action/AI-budget exhaustion remains visible for every lane. No camera/menu/items/extra actors or arbitrary raw effects.',provenance:{baseProgramSha256:hash(baseBytes),actionFamilyProgramSha256:hash(familyBytes),originalMonsterId:318,definitions:MONSTER318_DEFINITIONS,profile:baruborosuProfileAudit(),camera:'Absent from combat comparison sides.',retryBudget:{candidatesPerDecision:32,meaning:'Finite computation budget; unfinished decisions stop as unsupported, not a completed battle.'}}});
 const text=JSON.stringify(program,null,2)+'\n',report={schema:'dq9-baruborosu-program-build-v1',name:program.name,programSha256:hash(text),baseProgramSha256:hash(baseBytes),actionFamilyProgramSha256:hash(familyBytes),modules:program.modules,profile:baruborosuProfileAudit()};for(const[f,v]of[['baruborosu-resident-program.json',program],['baruborosu-program-build.json',report],['baruborosu-initial-profile-audit.json',baruborosuProfileAudit()]]){await writeFile(new URL(f+'.tmp',dir),JSON.stringify(v,null,2)+'\n');await rename(new URL(f+'.tmp',dir),new URL(f,dir));}return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const r=await buildBaruborosuProgram();console.log(JSON.stringify({name:r.name,sha256:r.programSha256,modules:r.modules.length},null,2));}

