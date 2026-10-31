// Declarative composition of verified modules. Original300/303 programs and
// their models remain byte-identical; no seed-dependent branch is on the host.
import {Graph} from '../graph-builder.mjs';
import {PACKED_APPEAL_FIELDS,PREPARATION_DOMAINS,PREPARATION_FIELDS} from './build-nushi-preparation.mjs';
import {makeNushiRow,MONSTER305,nushiProfileAudit} from './nushi-profiles.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const directory=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');

export async function buildNushiTurnOpen(){
  const old=JSON.parse(await readFile(new URL('../rom-boss-route-turn-open.json',import.meta.url),'utf8')),row=makeNushiRow();
  const g=new Graph('rom-nushi-route-turn-open',{
    ...old.contract,scope:'The checked one-party/one-enemy turn-open connection, with actual22nd resistance and positive type1 appeal preparation included. config.enemyAppealGate must match the explicit appeal resistance. This305 program supports the original zero type2/type3 susceptibility bytes and no pending appeal mode at turn entry; it never silently drops an unsupported effect.',
    scopeJa:'正の魅了成功を含むぬしさま戦の開始。元ROMの効果2/3係数0と魅了係数の整合を確認してから乱数を進めます。',
    fieldDomains:{...old.contract.fieldDomains,appeal:PACKED_APPEAL_FIELDS,effectResistances:[{name:'stats4e',min:0,max:255,integer:true},{name:'stats4a',min:0,max:255,integer:true}],preparationState:PREPARATION_DOMAINS},
    defaults:{...old.contract.defaults,actors:row.actors,config:row.config,appeal:row.appeal,effectResistances:row.effectResistances,preparationState:row.preparationState},preparationFields:PREPARATION_FIELDS,
    charmDomain:'All three decoded charm values are10-bit in the actual packed structures. This is narrower than the historical monster300 nonpositive abstract numeric contract; its saved model/hash is not changed.'
  });
  const x=Object.fromEntries(old.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)])),appeal=g.split(g.input('appeal',['N',4]),4),effects=g.split(g.input('effectResistances',['N',2]),2),state=g.split(g.input('preparationState',['N',10]),10),config=g.split(x.config,7);
  const valid=g.and(x.viewSupported,g.eq(config[6],g.cast(g.gt(appeal[3],0),'float32')),g.eq(effects[0],0),g.eq(effects[1],0),g.eq(state[0],0),g.eq(state[5],0));
  const out=g.inline(old,{...x,viewSupported:valid,config:g.cat([...config.slice(0,6),g.mul(config[6],0)])},'turn_open');for(const d of old.outputs)g.output(out[d.name],d.name);return g;
}

export async function buildNushiProgram(){
  const sourceBytes=await readFile(new URL('burudoga-appeal-resident-program.json',directory)),program=JSON.parse(sourceBytes),row=makeNushiRow(),turnOpen=await buildNushiTurnOpen();await turnOpen.save(directory);
  const models=new Map(),locations=new Map();
  async function model(name){if(!models.has(name)){for(const path of['','../']){try{models.set(name,JSON.parse(await readFile(new URL(path+name+'.json',directory),'utf8')));locations.set(name,path);break;}catch(error){if(error.code!=='ENOENT')throw error;}}if(!models.has(name))throw Error('Missing model '+name);}return models.get(name);}
  const slots=new Map(program.slots.map(s=>[s.name,s]));
  function slot(name,d,initial){const width=d.width??d.shape[1],old=slots.get(name);if(old){if(old.dtype!==d.dtype||old.width!==width)throw Error('Incompatible slot '+name);if(initial)old.initial=initial;return name;}const s={name,dtype:d.dtype,width,initial:initial??{kind:'zero'}};slots.set(name,s);program.slots.push(s);return name;}
  for(const key of['preparationState','effectResistances']){const name=slot('state.'+key,{dtype:'float32',width:row[key].length},{kind:'input',path:[key],default:row[key]});program.inputs[key]=name;program.outputs[key]=name;}
  async function call(name,id,inputs,outputs={}){const m=await model(name);return{op:'call',id,model:name,inputs:Object.fromEntries(m.inputs.map(d=>{const binding=inputs[d.name];if(!binding)throw Error(`${id} missing ${d.name}`);return[d.name,slot(binding,d)];})),outputs:Object.fromEntries(m.outputs.map(d=>[d.name,slot(outputs[d.name]??`work.${name}.${d.name}`,d)]))};}
  const state=['seed','position','actors','aux','status','wakeSkip','config','combo','context','preparationState','appeal','effectResistances'],stateInput=Object.fromEntries(state.map(k=>[k,'state.'+k])),stateOutput=Object.fromEntries(state.map(k=>['next'+k[0].toUpperCase()+k.slice(1),'state.'+k]));
  async function transform(steps){const out=[];for(const s of steps){
    if(s.op==='repeat'){out.push({...s,body:await transform(s.body)});continue;}
    if(s.op==='capture'){out.push({...s,tensors:{...s.tensors,preparationState:'state.preparationState',effectResistances:'state.effectResistances',...s.id.startsWith('command')?{actors:'state.actors',aux:'state.aux',status:'state.status',appealSuccess:'work.rom-nushi-preparation2.appealSuccess'}:{}}});continue;}
    if(s.op!=='call'){out.push(s);continue;}
    if(/:primary$|:route$/.test(s.id))continue;
    if(s.id==='turn:open'){out.push(await call('rom-nushi-route-turn-open',s.id,{...s.inputs,...Object.fromEntries(['preparationState','effectResistances'].map(k=>[k,stateInput[k]]))},s.outputs));continue;}
    if(s.model==='rom-ai-boss-step'){out.push(await call('rom-ai-nushi-step',s.id,s.inputs,s.outputs));continue;}
    if(/:appeal$/.test(s.id)){
      const w='work.rom-boss-route-command-open.',route='work.rom-boss-command-route2.';
      out.push(await call('rom-nushi-preparation2',s.id.replace(/:appeal$/,':preparation'),{...stateInput,sourceIndex:w+'sourceIndex',actionId:w+'action',targetCount:w+'targetCount',enabled:w+'enabled'},{...stateOutput,...Object.fromEntries(['nextAction','nextTargetCount','ordinaryGate','eventGate','supported','insufficientMp','active'].map(k=>[k,route+k]))}));continue;
    }
    if(s.model==='rom-rubble-action-core2'){out.push(await call('rom-nushi-action-core2',s.id,s.inputs,s.outputs));continue;}
    if(s.model==='rom-boss-event-core2'){
      out.push(await call('rom-nushi-event-core2',s.id,{...s.inputs,preparationState:stateInput.preparationState},{...s.outputs,nextPreparationState:stateInput.preparationState}));
      out.push(await call('rom-preparation-death-sync2',s.id.replace(/:event$/,':death-state'),{actors:stateInput.actors,preparationState:stateInput.preparationState,enabled:'work.rom-boss-route-command-open.enabled'},{nextPreparationState:stateInput.preparationState}));continue;
    }
    if(s.model==='rom-boss-post-status2'){out.push(await call('rom-nushi-post-status2',s.id,{...s.inputs,preparationState:stateInput.preparationState},{...s.outputs,nextPreparationState:stateInput.preparationState}));continue;}
    out.push(s);
    if(s.id==='turn:tail')out.push(await call('rom-preparation-death-sync2','turn:tail-death-state',{actors:stateInput.actors,preparationState:stateInput.preparationState,enabled:'flow.enteredTurn'},{nextPreparationState:stateInput.preparationState}));
  }return out;}
  program.steps=await transform(program.steps);
  const valueAt=(object,path)=>path.reduce((v,k)=>v?.[k],object);
  for(const s of program.slots)if(s.initial.kind==='input'){const v=valueAt(row,s.initial.path);if(v!==undefined)s.initial.default=Array.isArray(v)?v:[v];}
  const used=new Set();const visit=steps=>{for(const s of steps){if(s.op==='repeat')visit(s.body);else if(s.op==='call')used.add(s.model);}};visit(program.steps);program.modules=[];
  for(const name of used){const m=await model(name),path=locations.get(name),bytes=await readFile(new URL(path+name+'.onnx',directory));program.modules.push({name,onnx:path+name+'.onnx',ir:path+name+'.json',sha256:hash(bytes),nodes:m.nodes.length,bytes:bytes.length,routingOnly:!!m.contract.routingOnly});}
  Object.assign(program,{name:'dq9-monster305-appeal-combat-resident',version:1,scope:'One manual-normal party actor and original monster305 with one action from all6 real slots[1,1,548,1,94,1]. Positive appeal success, primary recovery, type1 event503, post cleanup, full turn tail and death/terminal masks are explicit ONNX connections. Judgment0 uses callback0; callback62 exists for separately supported judgments. Camera, party healing/items, extra actors, tension, equipment procs and type2/type3 appeal effects remain outside this program.',
    publicState:program.publicState+' preparationState adds ten explicit type/target/skip/bit1/pending fields; readonly charm/effect bytes are preserved.',
    provenance:{baseProgramSha256:hash(sourceBytes),monster:MONSTER305,profiles:nushiProfileAudit(),defaultProfile:'nusisama1_v2_new_arugo/nusisama1_v6_tamahane',camera:'Excluded from both combat schedules and their actual-ROM comparison. Original camera adapters must be labeled separately.',numericProfile:'Original product actor stats, compile LV17 provenance, real monster305 AI and22resistances. EnemyMP255 overrides record32 as the original does. Charm102/job1/resolved rates are explicit behavioral representatives, not full equipment/RAM recovery.'},
    scheduleDifference:'The verified two-command layout and mandatory enemy extra-action draw remain unchanged. One preparation model replaces the old separate appeal/primary/router calls. Event/post wrappers preserve the existing numerical kernels and carry explicit preparation metadata. No per-module CPU readback or seed filtering is needed.'});
  function validate(steps){for(const s of steps){if(s.op==='repeat'){validate(s.body);continue;}if(s.op!=='call')continue;const m=models.get(s.model);for(const key of['inputs','outputs'])for(const d of m[key]){const a=slots.get(s[key][d.name]);if(!a||a.dtype!==d.dtype||a.width!==d.shape[1])throw Error(`${s.id}.${key}.${d.name} binding mismatch`);}}}validate(program.steps);
  const programText=JSON.stringify(program,null,2)+'\n',report={schema:'dq9-nushi-program-build-v1',name:program.name,programSha256:hash(programText),baseProgramSha256:hash(sourceBytes),modules:program.modules,preparationFields:PREPARATION_FIELDS};
  for(const[file,value]of[['nushi-resident-program.json',program],['nushi-program-build.json',report],['nushi-initial-profile-audit.json',{schema:'dq9-initial-profile-field-audit-v1',profiles:nushiProfileAudit()}]]){await writeFile(new URL(file+'.tmp',directory),JSON.stringify(value,null,2)+'\n');await rename(new URL(file+'.tmp',directory),new URL(file,directory));}
  return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const r=await buildNushiProgram();console.log(JSON.stringify({name:r.name,sha256:r.programSha256,modules:r.modules.length,baseProgramSha256:r.baseProgramSha256},null,2));}
