// Compose the verified shared caller and callback families. Numeric battle
// rules stay in ONNX; this file only constructs immutable table projections
// and typed connections. Frozen300/303/305 programs are not overwritten.
import {Graph} from '../graph-builder.mjs';
import {buffStat} from '../transition-graphs.mjs';
import {ACTOR_FIELDS} from '../rules.mjs';
import {buildNushiPreparation,PACKED_APPEAL_FIELDS,PREPARATION_DOMAINS,PREPARATION_FIELDS} from './build-nushi-preparation.mjs';
import {makeAnonnRow,MONSTER308,anonnProfileAudit} from './anonn-profiles.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const directory=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
const read=(name,prefix='../')=>readFile(new URL(prefix+name+'.json',directory),'utf8').then(JSON.parse);
const resistanceDomain={width:44,min:0,max:255,integer:true};
function selectedResistance(g,input,sourceIndex,actionId,rules){
  const values=g.split(input,44),target=values.slice(0,22).map((v,i)=>g.where(g.eq(sourceIndex,0),values[22+i],v));
  let index=g.constant(0);for(let i=1;i<rules.length;i++)index=g.where(g.eq(actionId,rules[i].id),i,index);
  const col=name=>g.op('Gather',[g.constant(rules.map(r=>r[name]),'float32',[rules.length]),g.cast(index,'int32')],{axis:0},{shape:['N',1]});
  const byElement=element=>target.reduce((value,b,i)=>g.where(g.eq(element,i+1),b,value),g.constant(100));
  return g.cat([target[18],target[19],byElement(col('effectElement')),target[15],byElement(col('damageElement'))]);
}
async function buildCommonStateView(row){
  const old=await read('rom-boss-state-view2'),g=new Graph('rom-common-state-view2',{
    ...old.contract,scopeJa:'共通の状態読出しに、AIの物理対象選択へ必要な現在攻撃力・守備力・暗闇を追加します。',
    scope:old.contract.scope+' Additional enemy attack/defense/blind outputs use the already audited buffStat function; no new RNG or action rule.',defaults:{...old.contract.defaults,actors:row.actors,aux:row.aux,wakeSkip:row.wakeSkip}
  }),x=Object.fromEntries(old.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)])),out=g.inline(old,x,'state'),a=g.split(x.actors,66),field=key=>a[33+ACTOR_FIELDS.indexOf(key)];
  Object.assign(out,{actorAttack:buffStat(g,field('baseAttack'),field('attackRank'),'quarter',true,field('party')),actorDefense:buffStat(g,field('baseDefense'),field('defenseRank'),'defense',true,field('party')),actorBlind:g.gt(field('blind'),0)});
  for(const[name,value]of Object.entries(out))g.output(value,name);return g;
}
async function buildCommonTurnOpen(row){
  const old=await read('rom-boss-route-turn-open'),g=new Graph('rom-common-route-turn-open',{
    ...old.contract,scopeJa:'行動不能種別を保持して次ターンへ進み、準備・イベント・行動後処理に渡します。魅了係数と全22耐性byteの整合も確認します。',
    scope:'Extension of the verified turn-open connection: party skip is permitted because its explicit subtype and preparation/post lifecycle are represented. The old skip0 check is neutralized only in the validation copy; the actual actor tensor is not mutated. Before initiative, actual no-charm-buff UpdateCombatantCharm sets currentCharm=min(baseCharm,999). Enemy primary ailments/skip, charm buffs, type2/3 appeal and pending appealMode at turn entry remain unsupported. Seed and terminal masks are preserved by their existing contracts.',
    inputDomains:{...old.contract.inputDomains,resistanceBytes:resistanceDomain},fieldDomains:{...old.contract.fieldDomains,appeal:PACKED_APPEAL_FIELDS,effectResistances:[{name:'stats4e',min:0,max:255,integer:true},{name:'stats4a',min:0,max:255,integer:true}],preparationState:PREPARATION_DOMAINS},
    defaults:{...old.contract.defaults,actors:row.actors,config:row.config,appeal:row.appeal,effectResistances:row.effectResistances,preparationState:row.preparationState,resistanceBytes:row.resistanceBytes},preparationFields:PREPARATION_FIELDS,
    stateAuthority:'Actual skip-followup chain preserves skipKind after primary recovery; actual preparation sets3b bit1 only on an unrecovered inability action, and post clears it according to that bit. Turn entry therefore cannot reject every pending party skip.',
    charmResetAuthority:{caller:'JPN0215edbc / USA0215d63c',function:'JPN02157398 UpdateCombatantCharm',source:'src/Combat/Overlay_0/UpdateCombatantBuffs.cpp',rule:'No-charm-buff rank0: base10-bit ×1, u16 conversion, cap999; current:=min(base,999) before initiative. Equipment charm is separate and unchanged.'}
  }),x=Object.fromEntries(old.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)])),a=g.split(x.actors,66),appeal=g.split(g.input('appeal',['N',4]),4),effects=g.split(g.input('effectResistances',['N',2]),2),meta=g.split(g.input('preparationState',['N',10]),10),res=g.split(g.input('resistanceBytes',['N',44]),44),cfg=g.split(x.config,7);
  const valid=g.and(x.viewSupported,g.eq(cfg[6],g.cast(g.gt(appeal[3],0),'float32')),g.eq(appeal[3],res[43]),g.eq(effects[0],res[38]),g.eq(effects[1],res[34]),g.eq(effects[0],0),g.eq(effects[1],0),g.eq(meta[0],0),g.eq(meta[5],0));
  a[ACTOR_FIELDS.indexOf('skip')]=g.mul(a[ACTOR_FIELDS.indexOf('skip')],0);
  const out=g.inline(old,{...x,actors:g.cat(a),viewSupported:valid,config:g.cat([...cfg.slice(0,6),g.mul(cfg[6],0)])},'turn_open');
  out.nextAppeal=g.cat([g.where(out.turnActive,g.min(appeal[1],999),appeal[0]),...appeal.slice(1)]);
  g.contract.feedback={...g.contract.feedback,appeal:'nextAppeal'};
  for(const d of old.outputs)g.output(out[d.name],d.name);g.output(out.nextAppeal,'nextAppeal');return g;
}
export async function buildCommonCommandOpen(row,rules,name='rom-common-route-command-open'){
  for(const rule of rules)for(const key of['effectElement','damageElement'])if(!Number.isInteger(rule[key])||rule[key]<0||rule[key]>31)throw Error('Missing/invalid ROM routing column '+rule.id+'.'+key);
  const old=await read('rom-boss-route-command-open'),contract=structuredClone(old.contract);delete contract.inputDomains.resistancesByActor;delete contract.defaults.resistancesByActor;
  contract.inputDomains.resistanceBytes=resistanceDomain;contract.defaults.resistanceBytes=row.resistanceBytes;
  Object.assign(contract,{scopeJa:'行動者・対象・行動番号を接続し、実ROMの効果属性とダメージ属性から対象の22耐性byteを選びます。',scope:'Existing command liveness/terminal routing plus a ROM-column selection of five core resistance inputs. All44 input bytes remain explicit and unchanged. This resolves fire/physical and primary incapacity/sleep independently; no host-side chance or damage rule.',resistanceLayout:'Two actors ×22 bytes, raw currentStats3e..53. Output slots are DEF rank, AGI rank, this action primary effect, poison and this action damage element. Element0 yields100. Event action fallback is only an unused routing value; its actual event core has no resistance input.',actionIds:rules.map(r=>r.id)});
  const g=new Graph(name,contract),x=Object.fromEntries(old.inputs.filter(d=>d.name!=='resistancesByActor').map(d=>[d.name,g.input(d.name,d.shape,d.dtype)])),res=g.input('resistanceBytes',['N',44]);
  const out=g.inline(old,{...x,resistancesByActor:g.constant(Array(10).fill(100),'float32',[1,10])},'command_open');out.resistances=selectedResistance(g,res,out.sourceIndex,out.action,rules);
  for(const d of old.outputs)g.output(out[d.name],d.name);return g;
}

export async function buildAnonnProgram(){
  const row=makeAnonnRow(),core=await read('rom-incapacity-action-core2',''),rules=core.contract.actionRules.map(r=>({...r,effectElement:rom.actions.find(a=>a.id===r.id).w18>>>27&31}));
  const preparation=await buildNushiPreparation({name:'rom-common-preparation2',row,actionIds:rules.map(r=>r.id),actionRules:rules,contract:{
    scope:'The verified appeal/primary/cleanup/inability/MP preparation graph parameterized by the explicit33 action rows in the shared core. Party manual normal1 only; enemy uses one represented single-hit record. All prior preparation exclusions and event semantics remain. No numeric rule is copied for a particular boss.',
    scopeJa:'実装済み33行動のMP表を共通の準備処理へ接続します。おたけびによる行動不能、魅了、主状態回復を同じ永続状態で処理します。',
    constraints:'One party0/enemy192, both present. No mental immunity, excluded objects, unrepresented tension/equipment effects or confusion-selected command. Primary events900/901/938 and503/504 use their separate exact event core. Skip metadata and3b bit1/3c bit6 must be supplied and carried.',
    actionRules:rules,defaults:{seed:row.seed,position:1,actors:row.actors,aux:row.aux,status:row.status,preparationState:row.preparationState,appeal:row.appeal,effectResistances:row.effectResistances,sourceIndex:1,actionId:160,targetCount:1,enabled:true}
  }});
  const newModels=[await buildCommonStateView(row),await buildCommonTurnOpen(row),await buildCommonCommandOpen(row,rules),preparation];
  for(const g of newModels)await g.save(directory);
  const source=await readFile(new URL('nushi-resident-program.json',directory)),program=JSON.parse(source),models=new Map(),locations=new Map(),slots=new Map(program.slots.map(s=>[s.name,s]));
  async function model(name){if(!models.has(name))for(const prefix of['','../']){try{models.set(name,await read(name,prefix));locations.set(name,prefix);break;}catch(e){if(e.code!=='ENOENT')throw e;}}if(!models.has(name))throw Error('Missing module '+name);return models.get(name);}
  function slot(name,d,initial){const width=d.width??d.shape[1],old=slots.get(name);if(old){if(old.width!==width||old.dtype!==d.dtype)throw Error('Slot type mismatch '+name);if(initial)old.initial=initial;}else{const s={name,width,dtype:d.dtype,initial:initial??{kind:'zero'}};slots.set(name,s);program.slots.push(s);}return name;}
  const resistance=slot('state.resistanceBytes',{dtype:'float32',width:44},{kind:'input',path:['resistanceBytes'],default:row.resistanceBytes});program.inputs.resistanceBytes=resistance;program.outputs.resistanceBytes=resistance;
  delete program.inputs.resistancesByActor;delete program.outputs.resistancesByActor;
  const status9=slot('ai.status9',{dtype:'bool',width:4},{kind:'input',path:['ai','status9'],default:row.ai.status9});program.inputs['ai.status9']=status9;
  async function call(name,id,inputs,outputs){const m=await model(name);return{op:'call',id,model:name,inputs:Object.fromEntries(m.inputs.map(d=>{if(!inputs[d.name])throw Error('Missing '+id+'.'+d.name);return[d.name,slot(inputs[d.name],d)];})),outputs:Object.fromEntries(m.outputs.map(d=>[d.name,slot(outputs[d.name]??`work.${name}.${d.name}`,d)]))};}
  async function transform(steps){const out=[];for(const s of steps){
    if(s.op==='repeat'){out.push({...s,body:await transform(s.body)});continue;}
    if(s.op==='capture'){const tensors={...s.tensors,resistanceBytes:resistance};delete tensors.resistancesByActor;out.push({...s,tensors});continue;}
    if(s.op!=='call'){out.push(s);continue;}
    if(s.model==='rom-boss-state-view2'){out.push(await call('rom-common-state-view2',s.id,s.inputs,{...s.outputs,actorAttack:'view.actorAttack',actorDefense:'view.actorDefense',actorBlind:'view.actorBlind'}));continue;}
    if(s.model==='rom-nushi-route-turn-open'){out.push(await call('rom-common-route-turn-open',s.id,{...s.inputs,resistanceBytes:resistance},{...s.outputs,nextAppeal:'state.appeal'}));continue;}
    if(s.model==='rom-boss-route-command-open'){out.push(await call('rom-common-route-command-open',s.id,{...s.inputs,resistanceBytes:resistance},s.outputs));continue;}
    if(s.model==='rom-ai-nushi-step'){out.push(await call('rom-ai-common-step',s.id,{...s.inputs,actorAttack:'view.actorAttack',actorDefense:'view.actorDefense',actorBlind:'view.actorBlind',status9},s.outputs));continue;}
    if(s.model==='rom-nushi-preparation2'){out.push(await call('rom-common-preparation2',s.id,s.inputs,s.outputs));continue;}
    if(s.model==='rom-nushi-action-core2'){out.push(await call('rom-incapacity-action-core2',s.id,{...s.inputs,preparationState:'state.preparationState'},{...s.outputs,nextPreparationState:'state.preparationState'}));continue;}
    out.push(s);
  }return out;}
  program.steps=await transform(program.steps);
  const at=(x,path)=>path.reduce((v,k)=>v?.[k],x);for(const s of program.slots)if(s.initial.kind==='input'){const value=at(row,s.initial.path);if(value!==undefined)s.initial.default=Array.isArray(value)?value:[value];}
  const usedModels=new Set(),usedSlots=new Set([...Object.values(program.inputs),...Object.values(program.outputs)]);function visit(steps){for(const s of steps){if(s.op==='repeat')visit(s.body);else if(s.op==='call'){usedModels.add(s.model);Object.values(s.inputs).forEach(v=>usedSlots.add(v));Object.values(s.outputs).forEach(v=>usedSlots.add(v));}else if(s.op==='capture')Object.values(s.tensors).forEach(v=>usedSlots.add(v));}}visit(program.steps);program.slots=program.slots.filter(s=>usedSlots.has(s.name));
  program.modules=[];for(const name of usedModels){const m=await model(name),prefix=locations.get(name),bytes=await readFile(new URL(prefix+name+'.onnx',directory));program.modules.push({name,onnx:prefix+name+'.onnx',ir:prefix+name+'.json',sha256:hash(bytes),nodes:m.nodes.length,bytes:bytes.length,routingOnly:!!m.contract.routingOnly});}
  Object.assign(program,{name:'dq9-monster308-common-combat-resident',version:1,
    scope:'One manual-normal party and original monster308 with real six-slot AI[227,227,1,160,1,309], judgment1 and one action with mandatory extra-action draw. Common33 core, shared callback AI, explicit44 resistance bytes, skip5 crossing turns, positive type1 appeal, primary/event/post/tail/death masks. Camera, party menu/items/healing/weapon changes, multiple actors, tension, reflections and type2/3 appeal remain outside.',
    publicState:'The previous persistent actor/aux/status/combo/preparation projection plus44 immutable resistance bytes. Current charm is recomputed from base at each entered turn before initiative; base/equipment charm are fixed. The old fixed five-resistance-per-actor public input is replaced by this complete two-actor byte list. ai.status9 is an explicit readonly raw status0x200 projection; no supported action mutates it.',
    provenance:{baseProgramSha256:hash(source),monster:MONSTER308,profile:anonnProfileAudit(),defaultProfile:'anonn_new_arugo/anonn_v6',camera:'Excluded; any original-camera adapter is labeled separately.',numericProfile:'Original actor and resolved equipment percentage/rate values; explicit currentCharm0/base0/equipment210 and incapacity byte75 represent the original integer thresholds and remain stable under current-stat recomputation. Full equipment/charm RAM is not reconstructed.'},
    scheduleDifference:'Same verified one-enemy-action schedule as305. The single shared33 core replaces the boss-specific core; common AI adds independently audited selectors. New routing modules only read/choose current stats and ROM-tagged resistance bytes. Pending party skip is accepted at turn entry and completed by existing exact lifecycle graphs.'});
  function validate(steps){for(const s of steps){if(s.op==='repeat')validate(s.body);if(s.op!=='call')continue;const m=models.get(s.model);for(const key of['inputs','outputs'])for(const d of m[key]){const v=slots.get(s[key][d.name]);if(!v||v.dtype!==d.dtype||v.width!==d.shape[1])throw Error('Binding type mismatch '+s.id+'.'+d.name);}}}validate(program.steps);
  const text=JSON.stringify(program,null,2)+'\n',report={schema:'dq9-anonn-program-build-v1',name:program.name,programSha256:hash(text),baseProgramSha256:hash(source),modules:program.modules,preparationFields:PREPARATION_FIELDS};
  for(const[file,value]of[['anonn-resident-program.json',program],['anonn-program-build.json',report],['anonn-initial-profile-audit.json',{schema:'dq9-anonn-profile-audit-v1',profile:anonnProfileAudit()}]]){await writeFile(new URL(file+'.tmp',directory),JSON.stringify(value,null,2)+'\n');await rename(new URL(file+'.tmp',directory),new URL(file,directory));}
  return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const r=await buildAnonnProgram();console.log(JSON.stringify({name:r.name,programSha256:r.programSha256,modules:r.modules.length,newModels:r.modules.filter(m=>m.name.startsWith('rom-common-')).map(m=>({name:m.name,sha256:m.sha256,nodes:m.nodes}))},null,2));}
