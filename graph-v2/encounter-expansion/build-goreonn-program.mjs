// A new encounter connects immutable rule modules; it never changes their
// published behavior. No battle arithmetic or random selection is on the host.
import {Graph} from '../graph-builder.mjs';
import {ACTOR_FIELDS} from '../rules.mjs';
import {buildCommonCommandOpen} from './build-anonn-program.mjs';
import {tensorContract} from './build-tension-actions.mjs';
import {TENSION_FIELDS} from './build-tension-primitives.mjs';
import {decodeBossActionRule} from '../boss-action-rules.mjs';
import {makeGoreonnRow,goreonnProfileAudit,MONSTER313} from './goreonn-profiles.mjs';
import {monsterAiInputs} from './profiles.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
async function load(name){for(const prefix of['','../'])try{const b=await readFile(new URL(prefix+name+'.onnx',dir)),j=JSON.parse(await readFile(new URL(prefix+name+'.json',dir),'utf8'));auditModelBytes(b,{name});return{ir:j,module:{name,onnx:prefix+name+'.onnx',ir:prefix+name+'.json',sha256:hash(b),bytes:b.length,nodes:j.nodes.length,routingOnly:!!j.contract.routingOnly}};}catch(e){if(e.code!=='ENOENT')throw e;}throw Error('Missing '+name);}
async function save(g){const b=g.model();auditModelBytes(b,{name:g.name});for(const[f,v]of[[g.name+'.onnx',b],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n']]){await writeFile(new URL(f+'.tmp',dir),v);await rename(new URL(f+'.tmp',dir),new URL(f,dir));}}

async function buildView(row){
  const old=(await load('rom-common-state-view2')).ir,roster=(await load('rom-one-enemy-roster8')).ir,g=new Graph('rom-tension-state-view2',{
    ...old.contract,fieldDomains:{...old.contract.fieldDomains,tension:tensorContract.fieldDomains},inputDomains:{...old.contract.inputDomains,resistanceBytes:{width:44,min:0,max:255,integer:true}},defaults:{...old.contract.defaults,actors:row.actors,aux:row.aux,wakeSkip:row.wakeSkip,tension:row.tension,resistanceBytes:row.resistanceBytes},
    scope:'Typed connection for a fixed original313 AI record: existing current stats/roster plus explicit high-tension bit24 for callback96. Additional generic-AI fields are projected from represented stats or neutral placeholders for callbacks not selected by this frozen judgment0/six-action record. They are not a claim to reconstruct all raw party ability/equipment metadata. This program fixes the action-table columns and cannot use those placeholders for arbitrary callbacks.',
    scopeJa:'現在能力とテンションをAIへ接続します。「ためる」の自己対象判定には実際の高テンションbitを渡します。',tensionFields:TENSION_FIELDS
  }),x=Object.fromEntries(old.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)])),t=g.split(g.input('tension',['N',6]),6),res=g.split(g.input('resistanceBytes',['N',44]),44),a=g.split(x.actors,66),get=(i,k)=>a[i*33+ACTOR_FIELDS.indexOf(k)],out=g.inline(old,x,'view'),zero=g.mul(get(0,'hp'),0),one=g.add(zero,1),falseValue=g.eq(one,0),trueValue=g.gt(one,0);
  const rosterOut=g.inline(roster,{actors:x.actors},'roster');for(const[k,v]of Object.entries(rosterOut))out[k==='enemyDead'?'enemyRosterDead':k]=v;
  const addTerms=terms=>terms.reduce((s,v)=>g.add(s,v),zero),raw=i=>[
    addTerms([g.cast(g.le(get(i,'hp'),0),'float32'),g.mul(get(i,'poison'),2),g.mul(get(i,'paralysis'),8),g.mul(get(i,'sleep'),16),g.mul(get(i,'confusion'),32),g.mul(get(i,'blind'),64)]),
    zero,g.add(g.mul(get(i,'skip'),8),g.mul(t[i*3+1],128)),addTerms([t[i*3+2],g.mul(get(i,'doubleDodge'),2),g.mul(get(i,'mpRegen'),64),g.mul(get(i,'hpRegen'),128)])
  ];
  Object.assign(out,{
    actorType400:trueValue,actorStatusBytes:g.cat(raw(1)),partyStatusBytes:g.cat([...raw(0),...Array(12).fill(zero)]),partyFlagBytes:g.cat([get(0,'doubleGuard'),g.mul(get(0,'acrobat'),4),zero,zero,...Array(12).fill(zero)]),partyRankFields:g.cat([get(0,'attackRank'),get(0,'defenseRank'),get(0,'agilityRank'),...Array(37).fill(zero)]),
    enemyDefense:g.cat([out.actorDefense,...Array(7).fill(zero)]),enemyDefenseRank:g.cat([get(1,'defenseRank'),...Array(7).fill(zero)]),enemyBarrierRank:g.cat(Array(8).fill(zero)),enemyGroupCount:g.cast(g.gt(get(1,'hp'),0),'float32'),partyMp:g.cat([get(0,'mp'),zero,zero,zero]),partyAuxiliaryPresent:g.cat([trueValue,falseValue,falseValue,falseValue]),partyAuxiliaryBytes:g.cat(Array(36).fill(zero)),
    elementResistances:g.cat([...res.slice(0,7),...res.slice(22,29)])
  });
  for(const[n,v]of Object.entries(out))g.output(v,n);return g;
}
function buildRoute(){
  const g=new Graph('rom-tension-opponent-self-route2',{routingOnly:true,scope:'One normal-party opponent or original313 enemy action1/244/550 againstparty0, or self161 againstenemy192. Validate actual planned target identity before body RNG. Disabled lanes still receive legal fallback IDs for both kernels. No target selection or random operation occurs here.',scopeJa:'自己対象の「ためる」と相手への攻撃を分岐し、対象が表現範囲内かを確認します。',inputDomains:{sourceIndex:{values:[0,1]},actionId:{min:0,max:65535,integer:true},targetCount:{min:0,max:8,integer:true},targets:{width:8,min:-1,max:255,integer:true},supported:{values:[0,1]},finished:{values:[0,1]}}}),source=g.input('sourceIndex'),action=g.input('actionId'),count=g.input('targetCount'),targets=g.split(g.input('targets',['N',8]),8),enabled=g.input('enabled',['N',1],'bool'),supported=g.input('supported'),finished=g.input('finished'),self=g.eq(action,161),normal=g.or(...[1,244,550].map(id=>g.eq(action,id))),party=g.eq(source,0),valid=g.and(g.eq(count,1),g.or(g.and(self,g.not(party),g.eq(targets[0],192)),g.and(normal,g.or(g.not(party),g.eq(action,1)),g.eq(targets[0],g.where(party,192,0))))),bad=g.and(enabled,g.not(valid)),active=g.and(enabled,valid),out={nextSupported:g.where(bad,0,supported),nextFinished:g.where(bad,1,finished),selfSelected:self,normalEnabled:g.and(active,g.not(self)),selfEnabled:g.and(active,self),normalAction:g.where(normal,action,1),selfAction:g.add(g.mul(source,0),161),selfSource:g.add(g.mul(source,0),1)};for(const[n,v]of Object.entries(out))g.output(v,n);return g;
}
async function buildObserve(){
  const core=(await load('rom-weapon-tension-action-core2')).ir,self=(await load('rom-tension-self-core2')).ir,observables=core.outputs.filter(d=>!d.name.startsWith('next')&&self.outputs.some(x=>x.name===d.name));
  const g=new Graph('rom-tension-core-observe2',{routingOnly:true,scope:'Select diagnostics of the enabled opponent or self kernel. Both kernels already mask their state writes, so no expected state or battle arithmetic is recomputed here.',scopeJa:'実行した自己技または攻撃の結果欄を選択します。'}),selected=g.input('selfSelected',['N',1],'bool');
  for(const d of observables)g.output(g.where(selected,g.input('self_'+d.name,d.shape,d.dtype),g.input('normal_'+d.name,d.shape,d.dtype)),d.name);return g;
}
async function buildDeathSync(row){const core=(await load('rom-weapon-tension-action-core2')).ir,g=new Graph('rom-tension-death-sync2',{routingOnly:true,fieldDomains:{actors:core.contract.fieldDomains.actors,tension:tensorContract.fieldDomains},defaults:{actors:row.actors,tension:row.tension,enabled:true},scope:'Actual death setter clears ordinary/high tension and stage. Called only after an entered event/body/tail boundary; disabled terminal lanes are unchanged. Other death fields remain in the existing exact kernels.',scopeJa:'死亡時のテンション解除を既存の死亡処理に接続します。',feedback:{tension:'nextTension'}}),a=g.split(g.input('actors',['N',66]),66),t=g.split(g.input('tension',['N',6]),6),enabled=g.input('enabled',['N',1],'bool');g.output(g.cat(t.map((v,i)=>g.where(g.and(enabled,g.le(a[Math.floor(i/3)*33+ACTOR_FIELDS.indexOf('hp')],0)),0,v))),'nextTension');return g;}

export async function buildGoreonnProgram(){
  const baseBytes=await readFile(new URL('anonn-resident-program.json',dir)),program=JSON.parse(baseBytes),row=makeGoreonnRow(),rules=[1,550,244,161].map(id=>({...decodeBossActionRule(id),effectElement:rom.actions.find(a=>a.id===id).w18>>>27&31}));
  for(const g of[await buildView(row),buildRoute(),await buildObserve(),await buildDeathSync(row),await buildCommonCommandOpen(row,rules,'rom-goreonn-route-command-open')])await save(g);
  const models=new Map(),modules=new Map();async function model(name){if(!models.has(name)){const x=await load(name);models.set(name,x.ir);modules.set(name,x.module);}return models.get(name);}
  const slots=new Map(program.slots.map(s=>[s.name,s]));function slot(name,d,initial){const width=d.width??d.shape[1],prior=slots.get(name);if(prior){if(prior.width!==width||prior.dtype!==d.dtype)throw Error('Slot type '+name);if(initial)prior.initial=initial;}else{const value={name,width,dtype:d.dtype,initial:initial??{kind:'zero'}};slots.set(name,value);program.slots.push(value);}return name;}
  async function call(name,id,inputs,outputs={}){const m=await model(name);return{op:'call',id,model:name,inputs:Object.fromEntries(m.inputs.map(d=>{if(!inputs[d.name])throw Error('Missing '+id+'.'+d.name);return[d.name,slot(inputs[d.name],d)];})),outputs:Object.fromEntries(m.outputs.map(d=>[d.name,slot(outputs[d.name]??'work.'+name+'.'+d.name,d)]))};}
  for(const key of['tension','weapon']){const s=slot('state.'+key,{dtype:'float32',width:row[key].length},{kind:'input',path:[key],default:row[key]});program.inputs[key]=s;program.outputs[key]=s;}
  const view=await model('rom-tension-state-view2'),oldView=(await load('rom-common-state-view2')).ir,extras=Object.fromEntries(view.outputs.filter(d=>!oldView.outputs.some(x=>x.name===d.name)).map(d=>[d.name,slot('view.tension.'+d.name,d)]));
  const core=await model('rom-weapon-tension-action-core2'),self=await model('rom-tension-self-core2'),observe=await model('rom-tension-core-observe2');
  async function transform(steps){const out=[];for(const s of steps){
    if(s.op==='repeat'){out.push({...s,body:await transform(s.body)});continue;}
    if(s.op==='capture'){out.push({...s,tensors:{...s.tensors,tension:'state.tension',weapon:'state.weapon'}});continue;}
    if(s.op!=='call'){out.push(s);continue;}
    if(s.model==='rom-common-state-view2'){out.push(await call(view.name,s.id,{...s.inputs,tension:'state.tension',resistanceBytes:'state.resistanceBytes'},{...s.outputs,...extras}));continue;}
    if(s.model==='rom-ai-common-step'){out.push(await call('rom-ai-transition-step',s.id,{...s.inputs,...extras,enemyDead:extras.enemyRosterDead},s.outputs));continue;}
    if(s.model==='rom-common-route-command-open'){out.push(await call('rom-goreonn-route-command-open',s.id,s.inputs,s.outputs));continue;}
    if(s.model==='rom-common-preparation2'){out.push(await call('rom-tension-preparation2',s.id,{...s.inputs,tension:'state.tension'},{...s.outputs,nextTension:'state.tension'}));continue;}
    if(s.model==='rom-incapacity-action-core2'){
      const prefix=s.id,gate=await call('rom-tension-opponent-self-route2',prefix+':target-check',{actionId:s.inputs.actionId,sourceIndex:s.inputs.sourceIndex,targetCount:'work.rom-boss-command-route2.nextTargetCount',targets:'work.rom-boss-route-command-open.targets',enabled:s.inputs.enabled,supported:'state.supported',finished:'state.finished'},{nextSupported:'state.supported',nextFinished:'state.finished'}),flow=gate.outputs;
      out.push(gate);
      const stateOutputs=Object.fromEntries(Object.entries(s.outputs).filter(([k])=>k.startsWith('next'))),normalOutputs=Object.fromEntries(core.outputs.filter(d=>!d.name.startsWith('next')).map(d=>[d.name,slot(prefix+'.normal.'+d.name,d)])),selfOutputs=Object.fromEntries(self.outputs.filter(d=>!d.name.startsWith('next')).map(d=>[d.name,slot(prefix+'.self.'+d.name,d)]));
      out.push(await call(core.name,prefix+':opponent',{...s.inputs,enabled:flow.normalEnabled,actionId:flow.normalAction,tension:'state.tension',weapon:'state.weapon',elementResistances:extras.elementResistances},{...stateOutputs,nextTension:'state.tension',...normalOutputs}));
      out.push(await call(self.name,prefix+':self',{...s.inputs,enabled:flow.selfEnabled,actionId:flow.selfAction,sourceIndex:flow.selfSource,tension:'state.tension'},{...stateOutputs,nextTension:'state.tension',...selfOutputs}));
      const feeds={selfSelected:flow.selfSelected};for(const d of observe.inputs){if(d.name.startsWith('normal_'))feeds[d.name]=normalOutputs[d.name.slice(7)];if(d.name.startsWith('self_'))feeds[d.name]=selfOutputs[d.name.slice(5)];}
      out.push(await call(observe.name,prefix+':observe',feeds,s.outputs));continue;
    }
    if(s.model==='rom-nushi-event-core2'){out.push(await call('rom-tension-event-core2',s.id,{...s.inputs,tension:'state.tension'},{...s.outputs,nextTension:'state.tension'}));continue;}
    if(s.model==='rom-nushi-post-status2'){out.push(await call('rom-tension-post-status2',s.id,{...s.inputs,tension:'state.tension'},{...s.outputs,nextTension:'state.tension'}));continue;}
    out.push(s);if(s.model==='rom-preparation-death-sync2')out.push(await call('rom-tension-death-sync2',s.id+':tension',{actors:'state.actors',tension:'state.tension',enabled:s.inputs.enabled},{nextTension:'state.tension'}));
  }return out;}
  program.steps=await transform(program.steps);
  const at=(x,path)=>path.reduce((v,k)=>v?.[k],x),fixedAi=monsterAiInputs(MONSTER313);delete fixedAi.mp;fixedAi.status9=[false,false,false,false];
  for(const s of program.slots)if(s.initial.kind==='input'){
    const value=at(row,s.initial.path);if(value!==undefined)s.initial.default=Array.isArray(value)?value:[value];
    if(s.initial.path[0]==='ai'&&Object.hasOwn(fixedAi,s.initial.path[1])){const key=s.initial.path[1];s.initial={kind:'constant',values:fixedAi[key]};delete program.inputs['ai.'+key];}
  }
  const usedModels=new Set(),usedSlots=new Set([...Object.values(program.inputs),...Object.values(program.outputs)]);function visit(ss){for(const s of ss){if(s.op==='repeat')visit(s.body);else if(s.op==='call'){usedModels.add(s.model);Object.values(s.inputs).forEach(v=>usedSlots.add(v));Object.values(s.outputs).forEach(v=>usedSlots.add(v));}else if(s.op==='capture')Object.values(s.tensors).forEach(v=>usedSlots.add(v));}}visit(program.steps);program.slots=program.slots.filter(s=>usedSlots.has(s.name));
  program.modules=[];for(const name of usedModels){await model(name);program.modules.push(modules.get(name));}
  function validate(ss){for(const s of ss){if(s.op==='repeat')validate(s.body);if(s.op!=='call')continue;const m=models.get(s.model);for(const k of['inputs','outputs'])for(const d of m[k]){const x=slots.get(s[k][d.name]);if(!x||x.width!==d.shape[1]||x.dtype!==d.dtype)throw Error('Final binding '+s.id+'.'+d.name);}}}validate(program.steps);
  Object.assign(program,{name:'dq9-monster313-weapon-tension-combat-resident',version:1,scope:'One manually normal-attacking party and the original fixed313 six-slot AI. Single enemy action per turn with mandatory extra-action draw. Original1/244/550 use the shared40-action tension/weapon kernel; self161 uses its separate exact caller. Tension persists across turns and all hit/state paths, high tension informs AI96 and appeal admission, and death clears it. Original fixed AI columns are immutable weights; only cursors/usedSlots and represented combat state change. Camera, menu/items, extra actors, force/counter/reflection/metal/barriers and unrelated callbacks remain outside.',publicState:'Previous represented actors/aux/status/preparation/44resistance bytes plus six independent tension fields and four explicit readonly resolved weapon fields. Raw176-byte state, equipment identity and event/presentation memory are not claimed.',provenance:{baseProgramSha256:hash(baseBytes),monster:MONSTER313,profile:goreonnProfileAudit(),camera:'Absent from both combat comparison sides.',staticAi:'ROM313 scheme/judgment/six action-table columns are constant slots. Generic AI inputs for inactive callbacks are neutral and cannot be enabled by mutating these fixed columns.'},scheduleDifference:'New small connection graphs route normal opponent and self161 calls with masks, preserving all lanes. Numerical rules stay in immutable ONNX modules. Only initial/final program transfer is required by the resident runtime.'});
  const text=JSON.stringify(program,null,2)+'\n',report={schema:'dq9-goreonn-program-build-v1',name:program.name,programSha256:hash(text),baseProgramSha256:hash(baseBytes),modules:program.modules,profile:goreonnProfileAudit()};
  for(const[f,v]of[['goreonn-resident-program.json',program],['goreonn-program-build.json',report],['goreonn-initial-profile-audit.json',goreonnProfileAudit()]]){await writeFile(new URL(f+'.tmp',dir),JSON.stringify(v,null,2)+'\n');await rename(new URL(f+'.tmp',dir),new URL(f,dir));}return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const r=await buildGoreonnProgram();console.log(JSON.stringify({name:r.name,sha256:r.programSha256,modules:r.modules.length},null,2));}
