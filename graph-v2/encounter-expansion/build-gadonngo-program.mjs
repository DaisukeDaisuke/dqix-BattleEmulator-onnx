// New311 encounter composition. Frozen313 schedule and54 action modules are
// rebound through typed tensors; numerical battle rules remain inside ONNX.
import {Graph} from '../graph-builder.mjs';
import {ACTOR_FIELDS} from '../rules.mjs';
import {buildCommonCommandOpen} from './build-anonn-program.mjs';
import {inlineResidentProgram} from './compose-resident-program.mjs';
import {decodeBossActionRule} from '../boss-action-rules.mjs';
import {monsterAiInputs} from './profiles.mjs';
import {makeGadonngoRow,gadonngoProfileAudit,MONSTER311} from './gadonngo-profiles.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
const EXECUTED=[1,115,290,134,272,244];
async function load(name){
  for(const prefix of['','../'])try{
    const b=await readFile(new URL(prefix+name+'.onnx',dir)),ir=JSON.parse(await readFile(new URL(prefix+name+'.json',dir),'utf8'));
    auditModelBytes(b,{name});
    return{ir,module:{name,onnx:prefix+name+'.onnx',ir:prefix+name+'.json',sha256:hash(b),bytes:b.length,nodes:ir.nodes.length,routingOnly:!!ir.contract.routingOnly}};
  }catch(e){if(e.code!=='ENOENT')throw e;}
  throw Error('Missing module '+name);
}
async function save(g){
  const bytes=g.model();auditModelBytes(bytes,{name:g.name});
  for(const[file,value]of[[g.name+'.onnx',bytes],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n']]){
    await writeFile(new URL(file+'.tmp',dir),value);await rename(new URL(file+'.tmp',dir),new URL(file,dir));
  }
}
async function buildView(row){
  const old=(await load('rom-tension-state-view2')).ir;
  const g=new Graph('rom-gadonngo-state-view2',{
    ...old.contract,defaults:{...old.contract.defaults,actors:row.actors,aux:row.aux,wakeSkip:row.wakeSkip,tension:row.tension,resistanceBytes:row.resistanceBytes},
    scope:'Typed current-stat view for fixed original311 AI with judgment0 and six immutable original action columns. Current defend/primary/skip/tension state is retained. Neutral metadata for unselected generic callbacks cannot be used to claim unrelated ability or equipment reconstruction.',
    scopeJa:'大怪像ガドンゴの現在状態を固定311 AI表へ接続します。シールドアタック後の防御、行動不能と麻痺を次の行動へ持ち越します。'
  });
  const x=Object.fromEntries(old.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)]));
  for(const[name,value]of Object.entries(g.inline(old,x,'represented')))g.output(value,name);
  return g;
}
async function buildPlanDefense(row){
  const core=(await load('rom-impact-state-action-core2')).ir,raw=rom.actions.find(a=>a.id===134);
  if((raw.w08>>>28&1)!==1||raw.mpCost!==4)throw Error('Original134 prepayment record changed');
  const g=new Graph('rom-gadonngo-plan-defense2',{
    fieldDomains:{actors:core.contract.fieldDomains.actors},inputDomains:{actionId:{min:0,max:65535,integer:true},supported:{values:[0,1]},finished:{values:[0,1]}},
    defaults:{actors:row.actors,actionId:134,enabled:true,supported:1,finished:0},feedback:{actors:'nextActors'},
    scope:'Original ProcessCombatTurn pre-action pass USA0215f110 selects word08 bit28, then USA021537b8 prepays raw cost and resolves defense from its action table before priority/action execution. This fixed311 composition contains only134 with that flag. EnemyMP>=255 is free; MP4..254 spends4 and sets defend1. Insufficient prepaid MP0..3 is explicitly unsupported here because its earlier937 replacement and raw3c message flags are not represented by this small pass. No RNG or damage arithmetic is performed.',
    scopeJa:'行動計画後にシールドアタックの防御を先に有効にします。敵MP255以上は消費なし、4以上254以下は4を先払いします。先払い不足時の別経路は未対応として停止します。',
    authority:{caller:'src/Combat/Overlay_0/ProcessCombatTurn.cpp -> func_ov000_0215f110 -> func_ov000_021537b8',actual:'emulation-boss311-plan-defend-trace-run/response.json',prepayment:'emulation-planning134-prepayment-run/response.json',prepaymentSha256:'3ae0492063c80300ef01714dcefd9b622d902f3d6e559af6916e227f50a3ca05',tableAddress:'JPN02183edc',table134:[1,1],defendWritePC:'JPN021551d4',bodySeparateWritePC:'JPN021e6070',finishClearPC:'JPN0215ff48',recordId:134,word08:raw.w08,rawCost:raw.mpCost},
    boundary:'Before command priority sorting and all actual commands; whole311 initial-only32/12 comparisons establish this connection independently of direct body tests.'
  });
  const input=g.input('actors',['N',66]),a=[...g.split(input,66)],action=g.input('actionId'),enabled=g.input('enabled',['N',1],'bool'),supported=g.input('supported'),finished=g.input('finished'),mp=a[33+ACTOR_FIELDS.indexOf('mp')];
  const selected=g.and(enabled,g.eq(action,134)),enough=g.ge(mp,4),apply=g.and(selected,enough),bad=g.and(selected,g.not(enough));
  a[33+ACTOR_FIELDS.indexOf('mp')]=g.where(g.and(apply,g.lt(mp,255)),g.sub(mp,4),mp);
  a[33+ACTOR_FIELDS.indexOf('defend')]=g.where(apply,1,a[33+ACTOR_FIELDS.indexOf('defend')]);
  for(const[name,value]of Object.entries({nextActors:g.cat(a),nextSupported:g.where(bad,0,supported),nextFinished:g.where(bad,1,finished)}))g.output(value,name);
  return g;
}
function buildTargetGate(){
  const g=new Graph('rom-gadonngo-target-gate2',{
    routingOnly:true,inputDomains:{sourceIndex:{values:[0,1]},actionId:{min:0,max:65535,integer:true},targetCount:{min:0,max:8,integer:true},targets:{width:8,min:-1,max:255,integer:true},supported:{values:[0,1]},finished:{values:[0,1]}},
    scope:'One explicit target: manual party normal1 targets192; original311 enemy1/115/290/134/272/244 targets0. Unknown action or target identities stop before body RNG. Event replacements use their separate verified event caller.',
    scopeJa:'通常攻撃の味方から敵1体、または311の6行動から味方1人という対象契約を確認します。'
  });
  const source=g.input('sourceIndex'),action=g.input('actionId'),count=g.input('targetCount'),target=g.split(g.input('targets',['N',8]),8)[0],enabled=g.input('enabled',['N',1],'bool'),supported=g.input('supported'),finished=g.input('finished');
  const party=g.eq(source,0),known=g.or(...EXECUTED.map(id=>g.eq(action,id))),valid=g.and(known,g.eq(count,1),g.or(g.and(party,g.eq(action,1),g.eq(target,192)),g.and(g.not(party),g.eq(target,0)))),bad=g.and(enabled,g.not(valid));
  for(const[name,value]of Object.entries({familyEnabled:g.and(enabled,valid),nextSupported:g.where(bad,0,supported),nextFinished:g.where(bad,1,finished)}))g.output(value,name);
  return g;
}

export async function buildGadonngoProgram(){
  const baseBytes=await readFile(new URL('goreonn-resident-program.json',dir)),familyBytes=await readFile(new URL('impact-family-program.json',dir));
  const program=JSON.parse(baseBytes),family=JSON.parse(familyBytes),row=makeGadonngoRow();
  const rules=EXECUTED.map(id=>({...decodeBossActionRule(id),effectElement:rom.actions.find(a=>a.id===id).w18>>>27&31}));
  if(rules.find(r=>r.id===272).effectElement!==17||rules.find(r=>r.id===115).effectElement!==15)throw Error('Raw primary-effect resistance columns changed');
  for(const g of[await buildView(row),await buildPlanDefense(row),buildTargetGate(),await buildCommonCommandOpen(row,rules,'rom-gadonngo-route-command-open')])await save(g);
  const models=new Map(),locations=new Map();
  async function model(name){if(!models.has(name)){const x=await load(name);models.set(name,x.ir);locations.set(name,x.module);}return models.get(name);}
  const slots=new Map(program.slots.map(s=>[s.name,s]));
  function slot(name,d,initial){
    if(!name)throw Error('Missing outer tensor name');
    const width=d.width??d.shape[1],old=slots.get(name);
    if(old){if(old.width!==width||old.dtype!==d.dtype)throw Error('311 slot type '+name);if(initial)old.initial=initial;}
    else{const s={name,width,dtype:d.dtype,initial:initial??{kind:'zero'}};slots.set(name,s);program.slots.push(s);}
    return name;
  }
  async function call(name,id,inputs,outputs={}){
    const m=await model(name);
    return{op:'call',id,model:name,inputs:Object.fromEntries(m.inputs.map(d=>{if(!inputs[d.name])throw Error('Missing '+id+'.'+d.name);return[d.name,slot(inputs[d.name],d)];})),outputs:Object.fromEntries(m.outputs.map(d=>[d.name,slot(outputs[d.name]??'work.'+name+'.'+d.name,d)]))};
  }
  const stateWrites=Object.fromEntries(['seed','position','actors','aux','status','wakeSkip','combo','context','preparationState','tension'].map(k=>['next'+k[0].toUpperCase()+k.slice(1),'state.'+k]));
  async function transform(steps){
    const out=[];
    for(let index=0;index<steps.length;index++){
      const s=steps[index];
      if(s.op==='repeat'){out.push({...s,body:await transform(s.body)});continue;}
      if(s.op!=='call'){out.push(s);continue;}
      if(s.model==='rom-tension-state-view2'){out.push(await call('rom-gadonngo-state-view2',s.id,s.inputs,s.outputs));continue;}
      if(s.model==='rom-goreonn-route-command-open'){out.push(await call('rom-gadonngo-route-command-open',s.id,s.inputs,s.outputs));continue;}
      if(s.model==='rom-tension-preparation2'){out.push(await call('rom-impact-preparation2',s.id,s.inputs,s.outputs));continue;}
      if(s.id==='turn:layout-feed')out.push(await call('rom-gadonngo-plan-defense2','turn:pre-action-defense',{actors:'state.actors',actionId:'enemy0.action',enabled:'flow.continueTurn',supported:'state.supported',finished:'state.finished'},{nextActors:'state.actors',nextSupported:'state.supported',nextFinished:'state.finished'}));
      if(s.model==='rom-tension-opponent-self-route2'){
        const next=steps[index+1],self=steps[index+2],observe=steps[index+3];
        if(next?.model!=='rom-weapon-tension-action-core2'||self?.model!=='rom-tension-self-core2'||observe?.model!=='rom-tension-core-observe2')throw Error('Unexpected frozen opponent/self call sequence');
        const gate=await call('rom-gadonngo-target-gate2',s.id,s.inputs,{nextSupported:'state.supported',nextFinished:'state.finished',familyEnabled:'flow.gadonngoFamilyEnabled'});
        out.push(gate);
        const feeds={...next.inputs,sourceIndex:s.inputs.sourceIndex,actionId:s.inputs.actionId,targetCount:s.inputs.targetCount,enabled:'flow.gadonngoFamilyEnabled'},childSlots=new Map(family.slots.map(d=>[d.name,d]));
        for(const[key,inner]of Object.entries(family.inputs))slot(feeds[key],childSlots.get(inner));
        const selected={...stateWrites,...observe.outputs};
        for(const key of Object.keys(selected))if(!family.outputs[key])delete selected[key];
        for(const[key,outer]of Object.entries(selected))slot(outer,childSlots.get(family.outputs[key]));
        out.push(...inlineResidentProgram({parent:program,child:family,prefix:s.id.replace(':target-check',':family'),inputs:feeds,outputs:selected}));
        for(const d of program.slots)slots.set(d.name,d);
        index+=3;continue;
      }
      out.push(s);
    }
    return out;
  }
  program.steps=await transform(program.steps);
  const fixedAi=monsterAiInputs(MONSTER311);delete fixedAi.mp;fixedAi.status9=[false,false,false,false];
  const at=(v,path)=>path.reduce((x,k)=>x?.[k],v);
  for(const s of program.slots){
    if(s.initial.kind==='input'){
      const value=at(row,s.initial.path);if(value!==undefined)s.initial.default=Array.isArray(value)?value:[value];
    }
    // The inherited313 static table remains immutable; replace its entire
    // six-slot input weight set from the original311 record for this new copy.
    if(s.name.startsWith('ai.')&&s.initial.kind==='constant'&&Object.hasOwn(fixedAi,s.name.slice(3)))s.initial={kind:'constant',values:fixedAi[s.name.slice(3)]};
  }
  const usedModels=new Set(),usedSlots=new Set([...Object.values(program.inputs),...Object.values(program.outputs)]);
  function visit(steps){for(const s of steps){if(s.op==='repeat')visit(s.body);else if(s.op==='call'){usedModels.add(s.model);Object.values(s.inputs).forEach(v=>usedSlots.add(v));Object.values(s.outputs).forEach(v=>usedSlots.add(v));}else if(s.op==='capture')Object.values(s.tensors).forEach(v=>usedSlots.add(v));}}
  visit(program.steps);program.slots=program.slots.filter(s=>usedSlots.has(s.name));program.modules=[];
  for(const name of usedModels){await model(name);program.modules.push(locations.get(name));}
  function validate(steps){for(const s of steps){if(s.op==='repeat')validate(s.body);if(s.op!=='call')continue;for(const kind of['inputs','outputs'])for(const d of models.get(s.model)[kind]){const x=slots.get(s[kind][d.name]);if(!x||x.width!==d.shape[1]||x.dtype!==d.dtype)throw Error('Final binding '+s.id+'.'+d.name);}}}
  validate(program.steps);
  Object.assign(program,{
    name:'dq9-monster311-impact-combat-resident',version:1,
    scope:'One manual-normal party0 and original311 enemy192, judgment0/scheme1 with one enemy action and the mandatory extra-action draw. Fixed action columns[115,1,290,134,272,244] feed immutable AI. Before actions,134 prepays4MP when currentMP<255 and activates defense; MP0..3 prepayment replacement remains explicitly unsupported. Shared54 caller handles115 post-hit skip,134 no-second-MP-payment/post-action defense and272 paralysis; primary/preparation/post/tail carry these states through later actions and turns. Target/action/unsupported-state gates retain every seed. Camera/menu/items, extra actors, counter/reflection/force/metal/barrier and unrepresented raw presentation state remain outside.',
    publicState:'The existing decoded actor66/aux35/status14/wake2/preparation10/tension6 projection with44 resistance bytes and4 explicit resolved weapon fields. No full176-byte actor, item identity or presentation-arena reconstruction is claimed.',
    provenance:{baseProgramSha256:hash(baseBytes),actionFamilyProgramSha256:hash(familyBytes),monster:MONSTER311,profile:gadonngoProfileAudit(),camera:'Absent from both sides of actual combat comparisons.',staticAi:'ROM311 scheme/judgment/six action columns are constant program weights. Only represented cursors/usedSlots and combat state change.',resistanceAuthority:family.contract.resistanceProjectionCorrection},
    scheduleDifference:'The exact existing two-command resident schedule reuses a shared action-family program through typed bindings. No host RNG/arithmetic, no seed filtering and no intermediate transfer are needed.'
  });
  const text=JSON.stringify(program,null,2)+'\n',report={schema:'dq9-gadonngo-program-build-v1',name:program.name,programSha256:hash(text),baseProgramSha256:hash(baseBytes),actionFamilyProgramSha256:hash(familyBytes),modules:program.modules,profile:gadonngoProfileAudit()};
  for(const[file,value]of[['gadonngo-resident-program.json',program],['gadonngo-program-build.json',report],['gadonngo-initial-profile-audit.json',gadonngoProfileAudit()]]){
    await writeFile(new URL(file+'.tmp',dir),JSON.stringify(value,null,2)+'\n');await rename(new URL(file+'.tmp',dir),new URL(file,dir));
  }
  return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const r=await buildGadonngoProgram();console.log(JSON.stringify({name:r.name,programSha256:r.programSha256,modules:r.modules.length},null,2));}
