// One common action-family schedule is connected to the original301 AI. This
// generator selects records and binds tensors; numeric rules stay in ONNX.
import {Graph} from '../graph-builder.mjs';
import {ACTOR_FIELDS} from '../rules.mjs';
import {buildCommonCommandOpen} from './build-anonn-program.mjs';
import {buildNushiPreparation} from './build-nushi-preparation.mjs';
import {buildFamilyTargetGate} from './build-family-target-gate.mjs';
import {inlineResidentProgram} from './compose-resident-program.mjs';
import {makeReokonnRow,reokonnProfileAudit,MONSTER301} from './reokonn-profiles.mjs';
import {REPEATED_RULE} from './build-repeated-action.mjs';
import {SELF_HEAL_RULES} from './build-self-heal-action.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
async function load(name){for(const prefix of['','../'])try{const text=await readFile(new URL(prefix+name+'.json',dir),'utf8'),bytes=await readFile(new URL(prefix+name+'.onnx',dir));return{ir:JSON.parse(text),module:{name,onnx:prefix+name+'.onnx',ir:prefix+name+'.json',sha256:hash(bytes),bytes:bytes.length}};}catch(e){if(e.code!=='ENOENT')throw e;}throw Error('Missing module '+name);}
function buildOneEnemyRoster(core){
  const g=new Graph('rom-one-enemy-roster8',{routingOnly:true,scope:'Exact representation boundary for one persistent enemy192 object in group0. Its live/dead flag agrees with represented HP0; no other enemy exists. This graph does not manufacture extra enemies from caller input or infer target RNG. It provides the fixed roster and current raw-death projection to the generic callback graph.',scopeJa:'1体だけの敵192を汎用AIの8枠へ接続します。死亡状態だけを現在HPと整合した表現から読み取ります。',fieldDomains:{actors:core.contract.fieldDomains.actors},defaults:{actors:makeReokonnRow().actors}}),a=g.split(g.input('actors',['N',66]),66),hp=a[33+ACTOR_FIELDS.indexOf('hp')],zero=g.mul(hp,0),one=g.add(zero,1),empty=g.eq(one,0),present=g.gt(g.cat([one,...Array(7).fill(zero)]),0);
  const out={enemyIds:g.cast(g.add(zero,g.constant(Array.from({length:8},(_,i)=>192+i),'float32',[1,8])),'int32'),enemyPresent:present,enemyCandidate:present,enemyDead:g.cat([g.le(hp,0),...Array(7).fill(empty)]),enemyExcluded:g.cat(Array(8).fill(empty)),enemyGroups:g.cast(g.cat(Array(8).fill(zero)),'int32'),actorGroup:g.cast(zero,'int32')};
  for(const[n,v]of Object.entries(out))g.output(v,n);return g;
}
export async function buildReokonnProgram(){
  const baseBytes=await readFile(new URL('anonn-resident-program.json',dir)),familyBytes=await readFile(new URL('action-family-program.json',dir)),program=JSON.parse(baseBytes),family=JSON.parse(familyBytes),row=makeReokonnRow(),core=(await load('rom-column-action-core2')).ir;
  const rules=[...core.contract.actionRules,REPEATED_RULE,...SELF_HEAL_RULES].map(r=>({...r,effectElement:rom.actions.find(a=>a.id===r.id).w18>>>27&31}));
  const prep=await buildNushiPreparation({name:'rom-family-preparation2',row,actionIds:rules.map(r=>r.id),actionRules:rules,contract:{
    scope:'Existing exact appeal/primary/cleanup/inability/MP preparation, parameterized by the42 explicitly implemented action-family records. This stage preserves the planned repeated/self target counts; the family target gate then validates their represented identities. Insufficient MP becomes504 and follows the existing event caller. Party manual normal1 only.',scopeJa:'単発・連続攻撃・自己回復のMPを実ROM表で確認し、同じ行動準備へ接続します。',
    actionRules:rules,defaults:{seed:row.seed,position:1,actors:row.actors,aux:row.aux,status:row.status,preparationState:row.preparationState,appeal:row.appeal,effectResistances:row.effectResistances,sourceIndex:1,actionId:73,targetCount:3,enabled:true}
  }});
  for(const g of[prep,await buildCommonCommandOpen(row,rules,'rom-family-route-command-open'),buildFamilyTargetGate(),buildOneEnemyRoster(core)])await g.save(dir);
  const models=new Map(),locations=new Map();async function model(name){if(!models.has(name)){const x=await load(name);models.set(name,x.ir);locations.set(name,x.module);}return models.get(name);}
  // Fail before changing the program artifact if the independently owned AI
  // variant has not yet completed its generation.
  const ai=await model('rom-ai-default-repeat-step');
  const slots=new Map(program.slots.map(s=>[s.name,s]));
  function slot(name,d,initial){const width=d.shape?.[1]??d.width,old=slots.get(name);if(old){if(old.width!==width||old.dtype!==d.dtype)throw Error('Reokonn type mismatch '+name);if(initial)old.initial=initial;}else{const s={name,width,dtype:d.dtype,initial:initial??{kind:'zero'}};program.slots.push(s);slots.set(name,s);}return name;}
  async function call(name,id,bindings,outputs={}){const m=await model(name);return{op:'call',id,model:name,inputs:Object.fromEntries(m.inputs.map(d=>{if(!bindings[d.name])throw Error('Missing '+id+'.'+d.name);return[d.name,slot(bindings[d.name],d)];})),outputs:Object.fromEntries(m.outputs.map(d=>[d.name,slot(outputs[d.name]??'work.'+name+'.'+d.name,d)]))};}
  const roster=await model('rom-one-enemy-roster8'),rosterBindings=Object.fromEntries(roster.outputs.map(d=>[d.name,slot('view.roster.'+d.name,d)]));
  async function transform(steps){const out=[];for(const s of steps){
    if(s.op==='repeat'){out.push({...s,body:await transform(s.body)});continue;}
    if(s.op!=='call'){out.push(s);continue;}
    if(s.model==='rom-ai-common-step'){out.push(await call(ai.name,s.id,{...s.inputs,...rosterBindings},s.outputs));continue;}
    if(s.model==='rom-common-preparation2'){out.push(await call('rom-family-preparation2',s.id,s.inputs,s.outputs));continue;}
    if(s.model==='rom-common-route-command-open'){out.push(await call('rom-family-route-command-open',s.id,s.inputs,s.outputs));continue;}
    if(s.model==='rom-incapacity-action-core2'){
      const gate=await call('rom-family-target-gate2',s.id+':target-check',{sourceIndex:s.inputs.sourceIndex,actionId:s.inputs.actionId,targetCount:'work.rom-boss-command-route2.nextTargetCount',targets:'work.rom-boss-route-command-open.targets',enabled:s.inputs.enabled,supported:'state.supported',finished:'state.finished'},{familyEnabled:'flow.familyEnabled',nextSupported:'state.supported',nextFinished:'state.finished'});
      out.push(gate,...inlineResidentProgram({parent:program,child:family,prefix:s.id+':family',inputs:{...s.inputs,enabled:'flow.familyEnabled'},outputs:s.outputs}));
      // Inlining adds private slots to the same array; later calls can use the
      // common mapped outputs without allocating new state tensors.
      for(const def of program.slots)slots.set(def.name,def);continue;
    }
    out.push(s);if(s.id==='turn:state')out.push(await call('rom-one-enemy-roster8','turn:enemy-roster',{actors:'state.actors'},rosterBindings));
  }return out;}
  program.steps=await transform(program.steps);
  const at=(v,path)=>path.reduce((x,k)=>x?.[k],v);for(const s of program.slots)if(s.initial.kind==='input'){const value=at(row,s.initial.path);if(value!==undefined)s.initial.default=Array.isArray(value)?value:[value];}
  const usedModels=new Set(),usedSlots=new Set([...Object.values(program.inputs),...Object.values(program.outputs)]);function visit(steps){for(const s of steps){if(s.op==='repeat')visit(s.body);if(s.op==='call'){usedModels.add(s.model);Object.values(s.inputs).forEach(v=>usedSlots.add(v));Object.values(s.outputs).forEach(v=>usedSlots.add(v));}if(s.op==='capture')Object.values(s.tensors).forEach(v=>usedSlots.add(v));}}visit(program.steps);program.slots=program.slots.filter(s=>usedSlots.has(s.name));
  program.modules=[];for(const name of usedModels){const m=await model(name);program.modules.push({...locations.get(name),nodes:m.nodes.length,routingOnly:!!m.contract.routingOnly});}
  Object.assign(program,{name:'dq9-monster301-family-combat-resident',version:1,scope:'One manual-normal party and actual monster301 six-slot AI[249,1,73,30,249,73], judgment0/scheme5/one action. Single-hit,3/4-hit and self-heal actions reuse immutable kernels through one declarative family. Exact preparation/event/post/tail, initial ready=true/duration0, real dodge2%, nonpositive appeal and complete22 resistance bytes are retained. Camera, items/menu, added actors, recoil/reflection/tension and arbitrary target lists are outside.',publicState:'Same four-boss represented state and persistent AI cursors/usedSlots. The generic AI enemy roster is generated from the one-enemy representation, not editable extra combatants. Optional per-command/per-hit captures are diagnostic and do not feed state.',provenance:{baseProgramSha256:hash(baseBytes),actionFamilyProgramSha256:hash(familyBytes),monster:MONSTER301,profile:reokonnProfileAudit(),numericProfile:'Original stats/ready state; explicitly declared level8/job1/deft0/shield5 and enemy level9 numerical representatives. Branch-name LV8 is not a recovered RAM field. Charm current/base/equipment0 retains the actual failed-appeal draw.',camera:'Excluded; unchanged original-camera adapters are separately labeled.'},scheduleDifference:'Action-family subprogram calls are inlined as typed binding operations, without duplicating their ONNX kernels. The target gate verifies self192 and repeatedparty0 planned identities; unsupported targets stop before body RNG.'});
  function validate(steps){for(const s of steps){if(s.op==='repeat')validate(s.body);if(s.op!=='call')continue;const m=models.get(s.model);for(const key of['inputs','outputs'])for(const d of m[key]){const def=slots.get(s[key][d.name]);if(!def||def.dtype!==d.dtype||def.width!==d.shape[1])throw Error('Final binding mismatch '+s.id+'.'+d.name);}}}validate(program.steps);
  const text=JSON.stringify(program,null,2)+'\n',report={schema:'dq9-reokonn-program-build-v1',programSha256:hash(text),name:program.name,modules:program.modules,actionFamilyProgramSha256:hash(familyBytes),baseProgramSha256:hash(baseBytes),profile:reokonnProfileAudit()};
  for(const[file,value]of[['reokonn-resident-program.json',program],['reokonn-program-build.json',report],['reokonn-initial-profile-audit.json',reokonnProfileAudit()]]){await writeFile(new URL(file+'.tmp',dir),JSON.stringify(value,null,2)+'\n');await rename(new URL(file+'.tmp',dir),new URL(file,dir));}
  return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const r=await buildReokonnProgram();console.log(JSON.stringify({name:r.name,programSha256:r.programSha256,modules:r.modules.length,newAI:r.modules.find(m=>m.name==='rom-ai-default-repeat-step')},null,2));}
