// Compile a schedule and small tensor-connection graphs. The verified battle
// modules are loaded verbatim; no damage, RNG, AI or status rule is duplicated.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Graph} from './graph-builder.mjs';
import {BOSS_RUNNER_MODELS} from './boss-phase-runner.mjs';
import {ACTOR_FIELDS} from './rules.mjs';

const modules=new Map(await Promise.all(BOSS_RUNNER_MODELS.map(async name=>[name,JSON.parse(await readFile(new URL(`${name}.json`,import.meta.url)))])));
const core=modules.get('rom-boss-action-core2'),ai=modules.get('rom-ai-boss-step'),helpers=[];
const bool={dtype:'bool',width:1,domain:{values:[false,true,0,1]}},flag={dtype:'float32',width:1,domain:{min:0,max:1,integer:true}};
const f=(width=1,domain={})=>({dtype:'float32',width,domain}),i32=(domain={})=>({dtype:'int32',width:1,domain});
const turn=i32({min:1,max:1000,integer:true}),count=i32({min:0,max:1000,integer:true}),outcome=f(1,{min:0,max:2,integer:true});
const actorDef={...f(66),fields:core.contract.fieldDomains.actors},comboDef={...f(6),fields:core.contract.fieldDomains.combo};
const stateDefs={supported:flag,finished:flag,outcome,turn,maxTurns:turn};
function connection(name,defs,build){
  const contract={scopeJa:'検証済みバトルグラフ間のテンソル接続・有効レーン制御。新しい乱数・ダメージ・状態ルールを含みません。',scope:'Connection graph for the resident program: copies, indexed selections, supported/terminal masks and scheduling counters only.',defaults:{},inputDomains:{},fieldDomains:{},feedback:{},routingOnly:true};
  for(const [key,d]of Object.entries(defs)){contract.defaults[key]=d.width===1?(d.dtype==='bool'?false:0):Array(d.width).fill(0);if(d.fields)contract.fieldDomains[key]=d.fields;else contract.inputDomains[key]={...d.domain,width:d.width};}
  const g=new Graph(name,contract),x=Object.fromEntries(Object.entries(defs).map(([key,d])=>[key,g.input(key,['N',d.width],d.dtype)]));
  for(const [key,value]of Object.entries(build(g,x))){if(g.inputs.some(input=>input.name===key)&&value!==key)throw Error(`${name}: transformed output shadows input ${key}`);g.output(value,key);}
  modules.set(name,g.json());helpers.push(g);return name;
}
function status(g,x,valid=x.viewSupported){
  const nextOutcome=g.where(g.eq(x.outcome,0),x.viewOutcome,x.outcome),nextSupported=g.where(valid,x.supported,0),nextFinished=g.where(g.or(g.not(valid),g.gt(nextOutcome,0)),1,x.finished);
  const live=g.and(g.gt(nextSupported,0),g.eq(nextFinished,0),g.eq(nextOutcome,0),g.le(x.turn,x.maxTurns));return{nextOutcome,nextSupported,nextFinished,live};
}
function support(g,x,failed){return{nextSupported:g.where(failed,0,x.supported),nextFinished:g.where(failed,1,x.finished)};}
const emitStatus=s=>({nextOutcome:s.nextOutcome,nextSupported:s.nextSupported,nextFinished:s.nextFinished});
const pick=(g,columns,index)=>{const boolean=g.values[columns[0]].dtype==='bool',values=boolean?columns.map(v=>g.cast(v,'float32')):columns,result=values.slice(1).reduce((value,column,j)=>g.where(g.eq(index,j+1),column,value),values[0]);return boolean?g.gt(result,0):result;};
const gather=(g,input,from,width)=>g.op('Gather',[input,g.constant(Array.from({length:width},(_,j)=>from+j),'int32',[width])],{axis:1},{shape:['N',width],dtype:g.values[input].dtype});

const open=connection('rom-boss-route-turn-open',{...stateDefs,viewOutcome:outcome,viewSupported:bool,alive:{...bool,width:2},enemyCanPlan:bool,actors:actorDef,config:{...f(7),fields:core.contract.fieldDomains.config},combo:comboDef,usedSlots:{...bool,width:6}},(g,x)=>{
  const a=g.split(x.actors,66),cfg=g.split(x.config,7),column=(actor,key)=>a[actor*33+ACTOR_FIELDS.indexOf(key)];
  const profile=g.and(x.viewSupported,g.eq(cfg[6],0),...['paralysis','sleep','confusion'].map(key=>g.eq(column(1,key),0)),g.eq(column(0,'skip'),0),g.eq(column(1,'skip'),0));
  const s=status(g,x,profile),active=s.live;
  return{...emitStatus(s),turnActive:active,nextCombo:g.where(active,g.constant([0,0,0,-1,0,0],'float32',[1,6]),x.combo),nextUsedSlots:g.gt(g.where(active,0,g.cast(x.usedSlots,'float32')),0),initiativePresent:g.and(active,x.alive),firstTurn:g.eq(x.turn,g.constant(1,'int32'))};
});
const aiStart=connection('rom-boss-route-ai-start',{...stateDefs,turnActive:bool,enemyCanPlan:bool},(g,x)=>{const enabled=g.and(x.turnActive,g.gt(x.supported,0),g.eq(x.finished,0),g.eq(x.outcome,0),g.le(x.turn,x.maxTurns),x.enemyCanPlan);return{enabled,wasEnabled:enabled};});
const aiGuard=connection('rom-boss-route-ai-guard',{enabled:bool,modelSupported:bool,protocolError:bool,supported:flag,finished:flag},(g,x)=>{const valid=g.and(x.modelSupported,g.not(x.protocolError)),failed=g.and(x.enabled,g.not(valid));return{...support(g,x,failed),nextEnabled:g.and(x.enabled,valid)};});
const aiFinish=connection('rom-boss-route-ai-finish',{...stateDefs,turnActive:bool,wasEnabled:bool,phase:f(1,{min:0,max:2,integer:true}),selectedAction:f(1,{min:-1,max:65535,integer:true}),targetCount:f(1,{min:0,max:8,integer:true}),selectedTargets:f(8,{min:-1,max:255,integer:true})},(g,x)=>{
  const good=g.and(g.gt(x.supported,0),g.eq(x.phase,2)),failed=g.and(x.wasEnabled,g.not(good)),s=support(g,x,failed),accept=g.and(x.wasEnabled,good),continueTurn=g.and(x.turnActive,g.gt(s.nextSupported,0),g.eq(s.nextFinished,0),g.eq(x.outcome,0),g.le(x.turn,x.maxTurns));
  return{...s,action:g.where(accept,x.selectedAction,503),count:g.where(accept,x.targetCount,0),targets:g.where(accept,x.selectedTargets,g.constant(Array(8).fill(-1),'float32',[1,8])),continueTurn};
});
const extraCheck=connection('rom-boss-route-extra-check',{gate:bool,extraCount:f(1,{min:0,max:3,integer:true}),supported:flag,finished:flag},(g,x)=>support(g,x,g.and(x.gate,g.not(g.eq(x.extraCount,1)))));
const layoutFeed=connection('rom-boss-route-layout-feed',{active:bool,inputOrder:f(2,{min:-1,max:1,integer:true}),firstAction:f(),secondAction:f(),firstCount:f(),secondCount:f(),firstTargets:f(8),secondTargets:f(8),partyCount:f(1,{min:0,max:8,integer:true})},(g,x)=>({order:g.where(x.active,x.inputOrder,g.constant([0,1],'float32',[1,2])),enemyActions:g.cat([x.firstAction,x.secondAction]),enemyCounts:g.cat([x.firstCount,x.secondCount]),enemyTargets:g.cat([x.firstTargets,x.secondTargets]),partyTargets:g.where(g.gt(x.partyCount,0),g.constant([192,-1,-1,-1,-1,-1,-1,-1],'float32',[1,8]),g.constant(Array(8).fill(-1),'float32',[1,8]))}));
const assertion=connection('rom-boss-route-assert',{gate:bool,valid:bool,supported:flag,finished:flag},(g,x)=>support(g,x,g.and(x.gate,g.not(x.valid))));
const commandOpen=connection('rom-boss-route-command-open',{...stateDefs,viewOutcome:outcome,viewSupported:bool,canExecute:{...bool,width:2},turnActive:bool,slot:f(1,{min:0,max:2,integer:true}),planActions:f(3,{min:0,max:65535,integer:true}),planSources:f(3,{min:0,max:1,integer:true}),planCounts:f(3,{min:0,max:8,integer:true}),planTargets:f(24,{min:-1,max:255,integer:true}),resistancesByActor:f(10,{min:0,max:255,integer:true})},(g,x)=>{
  const s=status(g,x),sourceIndex=pick(g,g.split(x.planSources,3),x.slot),can=pick(g,g.split(x.canExecute,2),sourceIndex),enabled=g.and(x.turnActive,s.live,can);
  return{...emitStatus(s),enabled,sourceIndex,action:pick(g,g.split(x.planActions,3),x.slot),targetCount:pick(g,g.split(x.planCounts,3),x.slot),targets:pick(g,[0,8,16].map(start=>gather(g,x.planTargets,start,8)),x.slot),resistances:g.where(g.eq(sourceIndex,0),gather(g,x.resistancesByActor,5,5),gather(g,x.resistancesByActor,0,5))};
});
const coreGates=connection('rom-boss-route-core-gates',{...stateDefs,commandEnabled:bool,routeSupported:bool,ordinaryGate:bool,eventGate:bool,action:f(1,{min:0,max:65535,integer:true})},(g,x)=>{
  const s=support(g,x,g.and(x.commandEnabled,g.not(x.routeSupported))),live=g.and(g.gt(s.nextSupported,0),g.eq(s.nextFinished,0),g.eq(x.outcome,0),g.le(x.turn,x.maxTurns));
  return{...s,ordinaryEnabled:g.and(x.commandEnabled,x.ordinaryGate,live),eventEnabled:g.and(x.commandEnabled,x.eventGate,live),ordinaryAction:g.where(x.ordinaryGate,x.action,1),eventAction:g.where(x.eventGate,x.action,503)};
});
const postGates=connection('rom-boss-route-post-gates',{...stateDefs,viewOutcome:outcome,viewSupported:bool,commandEnabled:bool,ordinaryEnabled:bool,eventEnabled:bool,ordinarySupported:flag,eventSupported:flag,ordinaryDamage:f(),eventDamage:f(),ordinaryInternal:f(),eventInternal:f(),ordinaryCritical:flag,ordinaryCharged:flag,eventCharged:flag},(g,x)=>{
  const failed=g.or(g.and(x.ordinaryEnabled,g.eq(x.ordinarySupported,0)),g.and(x.eventEnabled,g.eq(x.eventSupported,0))),valid=g.and(x.viewSupported,g.not(failed)),s=status(g,x,valid);
  return{...emitStatus(s),postEnabled:g.and(x.commandEnabled,s.live),damage:g.where(x.eventEnabled,x.eventDamage,x.ordinaryDamage),internalDamage:g.where(x.eventEnabled,x.eventInternal,x.ordinaryInternal),critical:x.ordinaryCritical,charged:g.cast(g.or(g.gt(x.ordinaryCharged,0),g.gt(x.eventCharged,0)),'float32')};
});
const tailGate=connection('rom-boss-route-tail-gate',{turnActive:bool,supported:flag},(g,x)=>({enteredTurn:g.and(x.turnActive,g.gt(x.supported,0))}));
const commit=connection('rom-boss-route-turn-commit',{enteredTurn:bool,turnActive:bool,turn,maxTurns:turn,outcome,finished:flag,tailTurn:i32({min:1,max:1001,integer:true}),tailOutcome:outcome,tailFinished:flag,completedTurns:count},(g,x)=>({nextTurn:g.where(x.enteredTurn,x.tailTurn,x.turn),nextOutcome:g.where(x.enteredTurn,x.tailOutcome,x.outcome),nextFinished:g.where(x.enteredTurn,x.tailFinished,x.finished),nextCompletedTurns:g.add(x.completedTurns,g.cast(x.turnActive,'int32'))}));

const slots=new Map(),constants=new Map();
function slot(name,desc,initial){
  const width=desc.width??desc.shape?.[1],dtype=desc.dtype,old=slots.get(name);
  if(old&&(old.width!==width||old.dtype!==dtype))throw Error(`Incompatible slot ${name}: ${old.dtype}[${old.width}] versus ${dtype}[${width}]`);
  if(!old)slots.set(name,{name,dtype,width,initial:initial??{kind:'zero'}});else if(initial)old.initial=initial;
  return name;
}
function constant(value,desc){
  const values=Array.isArray(value)?value:[value],key=JSON.stringify([desc.dtype,desc.width??desc.shape?.[1],values]);
  if(constants.has(key))return constants.get(key);const name=`constant.${constants.size}`;constants.set(key,name);return slot(name,desc,{kind:'constant',values});
}
function inputSlot(name,desc,path,defaultValue){return slot(name,desc,{kind:'input',path,default:Array.isArray(defaultValue)?defaultValue:[defaultValue]});}
const stateWidths={seed:8,position:1,actors:66,aux:35,status:14,wakeSkip:2,combo:6,context:2,config:7};
for(const [key,width]of Object.entries(stateWidths))inputSlot(`state.${key}`,{dtype:key==='position'?'int32':'float32',width},[key],core.contract.defaults[key]);
for(const [key,value,dtype]of [['turn',1,'int32'],['maxTurns',8,'int32'],['outcome',0,'float32'],['supported',1,'float32'],['finished',0,'float32'],['completedTurns',0,'int32'],['extraAlternate',false,'bool']])inputSlot(`state.${key}`,{width:1,dtype},[key],value);
inputSlot('state.resistancesByActor',f(10),['resistancesByActor'],Array(10).fill(100));
for(const d of ai.inputs)if(!['seed','position','enabled'].includes(d.name))inputSlot(`ai.${d.name}`,d,['ai',d.name],ai.contract.defaults[d.name]);
const publicOutputs=[...Object.keys(stateWidths),'resistancesByActor','turn','maxTurns','outcome','supported','finished','completedTurns','extraAlternate'].map(key=>({path:[key],tensor:`state.${key}`,scalar:key==='completedTurns'}));
for(const key of ['actorCursor','groupCursor','usedSlots'])publicOutputs.push({path:['ai',key],tensor:`ai.${key}`});

const bTrue=constant(true,bool),bFalse=constant(false,bool),zero=constant(0,f()),minusOne=constant(-1,f()),emptyTargets=constant(Array(8).fill(-1),f(8)),zeroTargets=constant(0,f()),mode2=constant(2,f());
function call(modelName,inputs={},outputs={},id=modelName){
  const model=modules.get(modelName);if(!model)throw Error(`Missing module ${modelName}`);
  const ib={},ob={};
  for(const d of model.inputs){let binding=inputs[d.name];if(binding===undefined){const value=model.contract.defaults?.[d.name];if(value===undefined)throw Error(`${id}: missing binding/default ${d.name}`);binding=constant(value,d);}ib[d.name]=slot(binding,d);}
  for(const d of model.outputs)ob[d.name]=slot(outputs[d.name]??`work.${modelName}.${d.name}`,d);
  if(new Set(Object.values(ob)).size!==Object.keys(ob).length)throw Error(`${id}: multiple output writes to one slot`);
  return{op:'call',id,model:modelName,inputs:ib,outputs:ob};
}
const state=Object.fromEntries([...Object.keys(stateWidths),'turn','maxTurns','outcome','supported','finished','completedTurns'].map(key=>[key,`state.${key}`]));
const stateWrites=Object.fromEntries(['seed','position','actors','aux','status','wakeSkip','combo','context'].map(key=>[`next${key[0].toUpperCase()}${key.slice(1)}`,`state.${key}`]));
const statusWrites={nextSupported:'state.supported',nextFinished:'state.finished',nextOutcome:'state.outcome'};
const viewCall=id=>call('rom-boss-state-view2',state,{},id),v=name=>`work.rom-boss-state-view2.${name}`,w=(model,name)=>`work.${model}.${name}`;
const body=[viewCall('turn:state'),call(open,{...state,viewOutcome:v('outcome'),viewSupported:v('supported'),alive:v('alive'),enemyCanPlan:v('enemyCanPlan'),usedSlots:'ai.usedSlots'},{...statusWrites,turnActive:'flow.turnActive',nextCombo:'state.combo',nextUsedSlots:'ai.usedSlots',initiativePresent:'flow.initiativePresent',firstTurn:'flow.firstTurn'},'turn:open'),call('rom-turn-order2',{seed:state.seed,position:state.position,agility:v('initiativeAgility'),actorIds:v('actorIds'),present:'flow.initiativePresent',surprise:zero,firstTurn:'flow.firstTurn'},stateWrites,'turn:initiative')];
const aiDynamic={seed:state.seed,position:state.position,enabled:'flow.aiEnabled',mp:v('enemyMp'),hp:v('partyHp'),present:v('partyPresent'),candidate:v('partyPresent'),dead:v('partyDead'),paralyzed:v('partyParalyzed'),asleep:v('partyAsleep'),defense:v('partyDefense'),agility:v('partyAgility'),defenseRank:v('partyDefenseRank'),agilityRank:v('partyAgilityRank'),actorDead:v('enemyDead'),actorParalyzed:v('enemyParalyzed'),rageEnabled:v('rageEnabled'),rageId:v('rageId')};
const aiInputs=Object.fromEntries(ai.inputs.map(d=>[d.name,aiDynamic[d.name]??`ai.${d.name}`])),aiOutputs=Object.fromEntries(Object.entries(ai.contract.feedback).map(([input,output])=>[output,input==='seed'?state.seed:input==='position'?state.position:`ai.${input}`]));
const aiGuardCall=id=>call(aiGuard,{enabled:'flow.aiEnabled',modelSupported:w('rom-ai-boss-step','supported'),protocolError:w('rom-ai-boss-step','protocolError'),supported:state.supported,finished:state.finished},{nextSupported:state.supported,nextFinished:state.finished,nextEnabled:'flow.aiEnabled'},id);
for(let decision=0;decision<2;decision++){
  body.push(call(aiStart,{...state,turnActive:'flow.turnActive',enemyCanPlan:v('enemyCanPlan')},{enabled:'flow.aiEnabled',wasEnabled:'flow.aiWasEnabled'},`turn:ai${decision}:start`));
  body.push(call('rom-ai-boss-step',{...aiInputs,initialized:bFalse,attempt:zero,phase:zero,selectedAction:minusOne,selectedSlot:minusOne,previousTargetCount:zeroTargets,previousTargets:emptyTargets},aiOutputs,`turn:ai${decision}:first`),aiGuardCall(`turn:ai${decision}:guard-first`));
  body.push({op:'repeat',id:`turn:ai${decision}:remaining`,count:6,body:[call('rom-ai-boss-step',aiInputs,aiOutputs,`turn:ai${decision}:step`),aiGuardCall(`turn:ai${decision}:guard`)]});
  body.push(call(aiFinish,{...state,turnActive:'flow.turnActive',wasEnabled:'flow.aiWasEnabled',phase:'ai.phase',selectedAction:'ai.selectedAction',targetCount:'ai.previousTargetCount',selectedTargets:'ai.previousTargets'},{nextSupported:state.supported,nextFinished:state.finished,action:`enemy${decision}.action`,count:`enemy${decision}.count`,targets:`enemy${decision}.targets`,continueTurn:'flow.continueTurn'},`turn:ai${decision}:finish`));
  if(decision===0){body.push(call('rom-extra-actions',{seed:state.seed,position:state.position,party:bFalse,mode:mode2,alternate:'state.extraAlternate',enabled:'flow.continueTurn'},{...stateWrites,nextAlternate:'state.extraAlternate'},'turn:extra'));body.push(call(extraCheck,{gate:'flow.continueTurn',extraCount:w('rom-extra-actions','extraCount'),supported:state.supported,finished:state.finished},statusWrites,'turn:extra-check'));}
}
body.push(call(layoutFeed,{active:'flow.turnActive',inputOrder:w('rom-turn-order2','orderIndices'),firstAction:'enemy0.action',secondAction:'enemy1.action',firstCount:'enemy0.count',secondCount:'enemy1.count',firstTargets:'enemy0.targets',secondTargets:'enemy1.targets',partyCount:v('partyPlannedTargetCount')}, {},'turn:layout-feed'));
body.push(call('rom-boss-plan-layout3',{orderIndices:w(layoutFeed,'order'),partyAction:v('partyPlannedAction'),enemyActions:w(layoutFeed,'enemyActions'),partyTargetCount:v('partyPlannedTargetCount'),partyTargets:w(layoutFeed,'partyTargets'),enemyTargetCounts:w(layoutFeed,'enemyCounts'),enemyTargets:w(layoutFeed,'enemyTargets'),partyWeaponFirst:bFalse},{},'turn:layout'));
body.push(call(assertion,{gate:'flow.turnActive',valid:w('rom-boss-plan-layout3','supported'),supported:state.supported,finished:state.finished},statusWrites,'turn:layout-check'));
for(let command=0;command<3;command++){
  body.push(viewCall(`turn:command${command}:state`));
  body.push(call(commandOpen,{...state,viewOutcome:v('outcome'),viewSupported:v('supported'),canExecute:v('canExecute'),turnActive:'flow.turnActive',slot:constant(command,f()),planActions:w('rom-boss-plan-layout3','planActions'),planSources:w('rom-boss-plan-layout3','sourceIndices'),planCounts:w('rom-boss-plan-layout3','planTargetCounts'),planTargets:w('rom-boss-plan-layout3','planTargets'),resistancesByActor:'state.resistancesByActor'}, {...statusWrites},`turn:command${command}:open`));
  const commandSource=w(commandOpen,'sourceIndex'),commandEnabled=w(commandOpen,'enabled');
  body.push(call('rom-primary-recovery2',{...state,sourceIndex:commandSource,actionId:w(commandOpen,'action'),targetCount:w(commandOpen,'targetCount'),present:bTrue,pendingRecoveryMessage:bFalse,recoveryMessage:bFalse,enabled:commandEnabled},stateWrites,`turn:command${command}:primary`));
  body.push(call('rom-boss-command-route2',{actors:state.actors,aux:state.aux,sourceIndex:commandSource,actionId:w('rom-primary-recovery2','nextAction'),targetCount:w('rom-primary-recovery2','nextTargetCount'),recovered:w('rom-primary-recovery2','recovered'),enabled:commandEnabled},stateWrites,`turn:command${command}:route`));
  body.push(call(coreGates,{...state,commandEnabled,routeSupported:w('rom-boss-command-route2','supported'),ordinaryGate:w('rom-boss-command-route2','ordinaryGate'),eventGate:w('rom-boss-command-route2','eventGate'),action:w('rom-boss-command-route2','nextAction')},statusWrites,`turn:command${command}:gates`));
  body.push(call('rom-boss-action-core2',{...state,sourceIndex:commandSource,actionId:w(coreGates,'ordinaryAction'),resistances:w(commandOpen,'resistances'),enabled:w(coreGates,'ordinaryEnabled')},stateWrites,`turn:command${command}:core`));
  body.push(call('rom-boss-event-core2',{...state,sourceIndex:commandSource,actionId:w(coreGates,'eventAction'),enabled:w(coreGates,'eventEnabled')},stateWrites,`turn:command${command}:event`));
  body.push(viewCall(`turn:command${command}:after-core`));
  body.push(call(postGates,{...state,viewOutcome:v('outcome'),viewSupported:v('supported'),commandEnabled,ordinaryEnabled:w(coreGates,'ordinaryEnabled'),eventEnabled:w(coreGates,'eventEnabled'),ordinarySupported:w('rom-boss-action-core2','supported'),eventSupported:w('rom-boss-event-core2','supported'),ordinaryDamage:w('rom-boss-action-core2','damage'),eventDamage:w('rom-boss-event-core2','damage'),ordinaryInternal:w('rom-boss-action-core2','internalDamage'),eventInternal:w('rom-boss-event-core2','internalDamage'),ordinaryCritical:w('rom-boss-action-core2','critical'),ordinaryCharged:w('rom-boss-action-core2','charged'),eventCharged:w('rom-boss-event-core2','charged')},statusWrites,`turn:command${command}:post-gates`));
  body.push(call('rom-boss-post-status2',{...state,sourceIndex:commandSource,enabled:w(postGates,'postEnabled')},stateWrites,`turn:command${command}:post`));
  body.push({op:'capture',id:`command${command}`,tensors:{turnActive:'flow.turnActive',enabled:commandEnabled,sourceIndex:commandSource,actionId:w('rom-boss-command-route2','nextAction'),damage:w(postGates,'damage'),seed:state.seed,position:state.position}});
}
body.push(call(tailGate,{turnActive:'flow.turnActive',supported:state.supported},{enteredTurn:'flow.enteredTurn'},'turn:tail-gate'));
body.push(call('rom-boss-turn-tail2',{...state,enteredTurn:'flow.enteredTurn'},stateWrites,'turn:tail'));
body.push(call(commit,{enteredTurn:'flow.enteredTurn',turnActive:'flow.turnActive',turn:state.turn,maxTurns:state.maxTurns,outcome:state.outcome,finished:state.finished,tailTurn:w('rom-boss-turn-tail2','nextTurn'),tailOutcome:w('rom-boss-turn-tail2','nextOutcome'),tailFinished:w('rom-boss-turn-tail2','finished'),completedTurns:state.completedTurns},{nextTurn:state.turn,nextOutcome:state.outcome,nextFinished:state.finished,nextCompletedTurns:state.completedTurns},'turn:commit'));
body.push({op:'capture',id:'turn-end',tensors:{turnActive:'flow.turnActive',...Object.fromEntries(publicOutputs.map(x=>[x.path.join('.'),x.tensor]))}});

for(const graph of helpers)await graph.save();
const moduleList=[];for(const [name,m]of modules){const bytes=await readFile(new URL(`${name}.onnx`,import.meta.url));moduleList.push({name,onnx:`${name}.onnx`,ir:`${name}.json`,sha256:createHash('sha256').update(bytes).digest('hex'),nodes:m.nodes.length,bytes:bytes.length,routingOnly:!!m.contract.routingOnly});}
const program={schema:'dq9-resident-onnx-program-v1',name:'dq9-monster303-combat-resident',version:1,parameters:{turns:{default:8,min:1,max:32}},lanePolicy:'Every input lane is retained in original order. Terminal/unsupported lanes are masked by ONNX connections; no per-module readback or seed filtering is needed.',memory:{layout:'Each tensor is row-major[N,width]. bool uses0/1 and int32 preserves exact signed32-bit values; the runtime may store all slots in a u32 buffer with appropriate bitcasts.',aliasing:'A call reads all input values before committing any aliased output slot. For staged compilation, defer output commits until every stage has consumed the old inputs.',capture:'Optional capture instructions copy resident tensors into GPU history storage. They do not read data back to the CPU. Read final outputs/history only after the full schedule.'},domainPolicy:{initialInputs:'Validate every supplied input width/dtype/domain before upload.',perCall:'Before enabling automatic input-domain arithmetic proofs, validate every model input on GPU at its call boundary. On violation record the lane and call, disable that lane and return a fault; do not silently claim a supported result.',fallbackProofPolicy:'Without a per-call GPU domain guard, use only separately proved manual exactArithmetic tags; automatic one-call tags are not licensed merely by this composition.'},scope:'One party with normal command and monster303 with two actions, same verified combat modules as boss-phase-runner. Camera and raw presentation/event memory are outside this resident schedule.',publicState:'All represented combat state and persistent AI actorCursor/groupCursor/usedSlots are outputs. Temporary per-decision AI work caches and the host runner lastActions object are not battle-memory outputs; optional command captures provide execution history.',modules:moduleList,slots:[...slots.values()],steps:[{op:'repeat',id:'turn',count:{parameter:'turns'},body}],inputs:Object.fromEntries([...slots.values()].filter(s=>s.initial.kind==='input').map(s=>[s.initial.path.join('.'),s.name])),outputs:Object.fromEntries(publicOutputs.map(x=>[x.path.join('.'),x.tensor])),outputScalarKeys:publicOutputs.filter(x=>x.scalar).map(x=>x.path.join('.'))};
await writeFile(new URL('boss-resident-program.json',import.meta.url),JSON.stringify(program,null,2)+'\n');
await writeFile(new URL('boss-resident-routing-models.json',import.meta.url),JSON.stringify(moduleList.filter(m=>m.routingOnly),null,2)+'\n');
console.log(JSON.stringify({modules:moduleList.length,routingModules:helpers.length,routingNodes:helpers.reduce((n,g)=>n+g.nodes.length,0),slots:slots.size,wordsPerLane:[...slots.values()].reduce((n,s)=>n+s.width,0),programBytes:JSON.stringify(program).length},null,2));
