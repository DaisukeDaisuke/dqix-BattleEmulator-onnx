import {createCommonBattleRunner,commonProgramHash} from './common-battle.mjs';
import {createCommonPresentationRunner} from './common-presentation.mjs';
import {createCameraEnclosingPhaseRunner,CAMERA_ENCLOSING_PHASE_MODELS} from '../graph-v2/camera-enclosing-phase-runner.mjs';
import {createCameraRetainedMemoryRunner} from '../graph-v2/camera-retained-memory-runner.mjs';
import {cameraEnclosingGeometryInitial} from '../graph-v2/camera-enclosing-geometry-runner.mjs';
import {createCameraRow4BoundaryPlanner} from '../graph-v2/camera-parent-runner.mjs';
import {createCameraProgramResourceRunner,COMMON_CAMERA_RESOURCE_MODELS,COMMON_CAMERA_PROGRAM_DATA,withPackagedCameraPrograms,retainCameraResult} from './common-camera-program-resources.mjs';

export const COMMON_BATTLE_CAMERA_ADAPTER_ID='dq9-common-battle-camera-v1';
export const COMMON_BATTLE_CAMERA_MODELS=[...new Set([...CAMERA_ENCLOSING_PHASE_MODELS,...COMMON_CAMERA_RESOURCE_MODELS,'rom-common-camera-command','rom-common-periodic-presentation','rom-common-presentation-advance','rom-common-camera-turn'])];
const IDS=[0,1,2,3,192,193,194,195,196,197,198,199],clone=x=>structuredClone(x),array=x=>Array.isArray(x)?x:[x],seedHex=s=>'0x'+s.slice().reverse().map(x=>x.toString(16).padStart(2,'0')).join('');
const pad=(a,n,v=0)=>Array.from({length:n},(_,i)=>a[i]??v),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
class Budget extends Error{constructor(){super('Atomic camera or command preparation exceeded the transition budget');this.code='DQ9_CAMERA_BUDGET';}}
function wordInput(input){if(!input||typeof input.boundaryId!=='string'||!Array.isArray(input.words)||input.words.length<1||input.words.length>12||input.words.some(x=>!Number.isInteger(x)||x<0||x>4294967295))throw Error('row4Input requires boundaryId and the declared actual-row uint32 words');return clone(input);}
const cameraId=s=>`turn:${s.battle.completedTurns}/camera:${s.commandIndex}`;
function boundary(s){if(!s.pendingBoundary?.required)throw Error('No external row+4 input is declared at this camera entry');return{id:cameraId(s),...clone(s.pendingBoundary)};}
function snapshot(s){return clone({seed:s.battle.seed,position:s.battle.position,actors:s.battle.actors,combo:s.battle.combo,context:s.battle.context,usedSlots:s.battle.groups.map(g=>g.usedSlots),groups:s.battle.groups,completedTurns:s.battle.completedTurns,turn:s.battle.turn,outcome:s.battle.outcome,finished:s.battle.finished,nowstate:s.battle.nowstate,turnRecords:s.battle.turnRecords??[],periodicPresentationRecords:s.battle.periodicPresentationRecords??[],camera:{cameraU16:s.world?.cameraU16??null,cameraState:s.world?.cameraState??null,cameraGeometry:s.world?.cameraGeometry??null,world:s.world,row4Words:s.world?.row4Words??null}});}

export function createInitialBattleCameraState({input,maxTurns=1}={}){
  if(input?.schema!=='dq9-common-battle-state-v1')throw Error('A common battle input is required');
  if(!Number.isInteger(maxTurns)||maxTurns<1)throw Error('maxTurns must be a positive integer');
  if(!input.camera?.initial)throw Error('Packaged or explicit initial camera conditions are required');
  if(Object.hasOwn(input.camera,'row4Words'))throw Error('Supply row+4 only at needs-row4 boundaries, not in the initial battle state');
  const battle=clone(input);battle.camera.mode='battle-camera';battle.camera.nextNumericTurnReady=true;
  battle.camera.initial=withPackagedCameraPrograms(battle.camera.initial);
  return{schema:'dq9-battle-camera-state-v1',adapterId:null,battle,phase:'numeric',targetCompletedTurns:(battle.completedTurns??0)+maxTurns,world:null,commands:[],commandIndex:0,turnEntryPending:false,pendingCamera:null,pendingBoundary:null,acceptedRow4:null,row4History:[],observationsCompleted:0};
}

export async function createCommonBattleCameraAdapter({program,definitions,getModel,runGraph,cpuDoubleProvider='onnxruntime-wasm'}={}){
  if(cpuDoubleProvider!=='onnxruntime-wasm')throw Error('The camera DOUBLE graph requires the explicitly selected ONNX Runtime WASM provider');
  if(program.cameraProgramData?.sha256!==await commonProgramHash(COMMON_CAMERA_PROGRAM_DATA))throw Error('Packaged camera definition identity differs from the common program');
  const modelCache=new Map(),get=async name=>{if(!modelCache.has(name))modelCache.set(name,Promise.resolve(getModel(name)));return modelCache.get(name);};
  const numeric=await createCommonBattleRunner({program,definitions,getModel:get,runGraph}),prepare=createCommonPresentationRunner({definitions,cpuDoubleProvider});
  const adapterId=COMMON_BATTLE_CAMERA_ADAPTER_ID+':'+numeric.programHash+':'+await commonProgramHash(definitions);
  // Join independent lanes that reach the same model at the same microtask.
  // Hosts schedule and copy fields; the numerical/camera decisions stay ONNX.
  const queues=new Map();let scheduled=false;
  async function flush(){scheduled=false;const pending=[...queues];queues.clear();await Promise.all(pending.map(async([name,jobs])=>{try{const rows=jobs.flatMap(j=>j.rows),out=await runGraph(name,rows,{phase:'common-battle-camera'});if(out.length!==rows.length)throw Error(name+': output batch length changed');let offset=0;for(const job of jobs){job.resolve(out.slice(offset,offset+job.rows.length));offset+=job.rows.length;}}catch(error){for(const j of jobs)j.reject(error);}}));}
  const batched=(name,rows)=>new Promise((resolve,reject)=>{if(!queues.has(name))queues.set(name,[]);queues.get(name).push({rows,resolve,reject});if(!scheduled){scheduled=true;queueMicrotask(flush);}});
  const scoped=limit=>{let calls=0;return async(name,rows)=>{if(++calls>limit)throw new Budget();return batched(name,rows);};};
  async function call(exec,name,values){const ir=await get(name),feed={};for(const f of ir.inputs){const v=values[f.name]??ir.contract?.defaults?.[f.name];if(v===undefined)throw Error(name+'.'+f.name+': missing computed operand');feed[f.name]=array(v);}return(await exec(name,[feed]))[0];}
  function syncNumeric(row,battle){const byId=new Map(battle.actors.map(a=>[a.actorId,a]));for(const object of row.roster){const a=byId.get(object.id);if(!a)throw Error('Visual object '+object.id+' has no numerical actor');object.dead=!!a.dead;object.stats18Low16=a.rawFlags%65536;object.numericStatsPresent=true;}row.seed=[...battle.seed];row.position=[battle.position];}
  async function turnEntry(exec,row){
    const objects=new Map([...row.roster,...row.lookupObjects??[]].map(a=>[a.id,a])),records=row.commands.flatMap(c=>c.participants.map(id=>({id,target:c.targets[0],has:c.targets.length>0})));
    if(records.length>72)throw Error('Camera turn-entry record capacity exceeded');
    for(const a of objects.values())if(a.lookupPresent!==false&&(!Number.isInteger(a.typeFlagsLow16)||a.typeFlagsLow16<0||a.typeFlagsLow16>65535))throw Error('Camera initial object '+a.id+' needs explicit typeFlagsLow16');
    const out=await call(exec,'rom-common-camera-turn',{actorLookupPresent:IDS.map(id=>objects.has(id)&&objects.get(id).lookupPresent!==false),actorTypeFlagsLow16:IDS.map(id=>objects.get(id)?.typeFlagsLow16??0),actorDead:IDS.map(id=>!!objects.get(id)?.dead),actorVisualPresent:IDS.map(id=>objects.has(id)&&objects.get(id).visualPresent!==false),actorBehavior:IDS.map(id=>objects.get(id)?.behaviorBE??0),actorPreviousBehavior:IDS.map(id=>objects.get(id)?.behaviorPrevious??0),actorPreferredTarget:IDS.map(id=>objects.get(id)?.preferredTarget??255),partyTacticsPresent:IDS.slice(0,4).map(id=>objects.get(id)?.tacticsPresent===true),partyTactics:IDS.slice(0,4).map(id=>objects.get(id)?.tactics??5),recordCount:records.length,recordSourceIds:pad(records.map(r=>r.id),72,-1),recordFirstTargetIds:pad(records.map(r=>r.target??-1),72,-1),recordHasTarget:pad(records.map(r=>r.has),72,false),currentActionIndex:row.currentActionIndex,presentationState:row.presentationState,sceneByte71c5:row.sceneByte71c5??0,enabled:true});
    if(!out.supported[0]||!out.completed[0])throw Error('Unsupported common camera turn-entry operands');
    for(const[i,id]of IDS.entries()){const a=objects.get(id);if(a){a.behaviorBE=out.nextActorBehavior[i];a.behaviorPrevious=out.nextActorPreviousBehavior[i];a.preferredTarget=out.nextActorPreferredTarget[i];}}
    row.currentActionIndex=out.nextCurrentActionIndex[0];row.presentationState=out.nextPresentationState[0];row.sceneByte71c5=out.nextSceneByte71c5[0];return row;
  }
  async function advanceBatch(lanes,{maxTransitions=100000,maxRouteAttempts=10861}={}){
    if(!Array.isArray(lanes)||!lanes.length)throw Error('A nonempty lane batch is required');
    if(!Number.isInteger(maxTransitions)||maxTransitions<1||!Number.isInteger(maxRouteAttempts)||maxRouteAttempts<1)throw Error('Budgets must be positive integers');
    const work=lanes.map(l=>{const s=clone(l.state);if(s?.schema!=='dq9-battle-camera-state-v1')throw Error('Unknown battle/camera state schema');if(s.adapterId&&s.adapterId!==adapterId)throw Error('Saved adapter/model/definition identity differs');s.adapterId=adapterId;return{id:l.id,state:s,input:l.row4Input===undefined?null:wordInput(l.row4Input),consumed:false,result:null};});
    const finish=(w,status,extra={})=>w.result={id:w.id,state:w.state,status,row4Consumed:w.consumed,...extra};
    const blocked=(w,reason)=>{w.state.blockedReason=clone(reason);finish(w,'unsupported',{reason});};
    const budget=(w,reason)=>finish(w,'budget',{reason,atomicRetry:true});
    // A result at an observation is a boundary, not an instruction to replace
    // state. The next invocation continues from its computed state unchanged.
    await Promise.all(work.map(async w=>{try{
      const s=w.state;
      if(w.input&&s.acceptedRow4&&same(w.input,s.acceptedRow4)){w.consumed=true;}
      else if(w.input){if(s.phase!=='needs-row4'||w.input.boundaryId!==boundary(s).id||w.input.words.length!==boundary(s).wordCount)throw Error('row+4 input does not match the current declared boundary and actual row count');s.acceptedRow4=clone(w.input);s.phase='camera';w.consumed=true;}
      if(s.blockedReason){blocked(w,s.blockedReason);return;}
      if(s.phase==='complete'){finish(w,'complete',{snapshot:snapshot(s)});return;}
      if(s.phase==='after-observation'){
        if(s.commandIndex+1<s.commands.length){const out=await call(scoped(maxTransitions),'rom-common-presentation-advance',{queueCount:0,currentIndex:s.world.currentActionIndex,presentationState:s.world.presentationState,overridePresent:false,enabled:true});if(out.requiresAuxiliaryProducer[0]){blocked(w,'Unimplemented auxiliary camera command producer');return;}s.commandIndex++;s.world.currentActionIndex=out.nextCurrentIndex[0];s.world.presentationState=out.nextPresentationState[0];s.acceptedRow4=null;s.pendingCamera=null;s.pendingBoundary=null;s.phase='camera-boundary';}
        else{s.battle.camera.nextNumericTurnReady=true;s.battle.camera.numericTurnPending=false;s.battle.camera.complete=true;s.battle.camera.scope='Completed requested battle/camera call schedule; drawing and resource execution are outside this state.';s.acceptedRow4=null;if(s.battle.finished||s.battle.completedTurns>=s.targetCompletedTurns){s.phase='complete';finish(w,'complete',{snapshot:snapshot(s)});return;}s.phase='numeric';}
      }
    }catch(error){if(error.code==='DQ9_CAMERA_BUDGET')budget(w,error.message);else blocked(w,error.message);}}));
    const numericWork=work.filter(w=>!w.result&&w.state.phase==='numeric');
    if(numericWork.length){
      const out=await numeric.runNumericTurn({rows:numericWork.map(w=>w.state.battle),maxTransitions});
      out.rows.forEach((battle,i)=>{const w=numericWork[i];if(battle.budgetExhausted){budget(w,battle.stopReason);return;}w.state.battle=battle;if(!battle.supported||!battle.requestedTurnsComplete){blocked(w,battle.unresolvedEffects);return;}if(battle.phase==='terminal'&&!battle.turnRecords?.length){w.state.phase='complete';finish(w,'complete',{snapshot:snapshot(w.state)});return;}w.state.phase='prepare';});
    }
    await Promise.all(work.filter(w=>!w.result&&w.state.phase==='prepare').map(async w=>{try{
      const s=w.state,exec=scoped(maxTransitions),out=await prepare({state:clone(s.battle),records:clone(s.battle.turnRecords),runGraph:exec,getModel:get});
      if(!out.complete){blocked(w,out.unresolvedEffects);return;}s.battle.camera=out.camera;s.commands=clone(out.camera.preparedCommands);delete s.battle.camera.preparedRawActions;s.commandIndex=0;s.turnEntryPending=true;s.acceptedRow4=null;s.pendingCamera=null;s.pendingBoundary=null;
      if(s.commands.length===0){s.phase='after-observation';s.observationsCompleted++;finish(w,'observation',{observationId:`turn:${s.battle.completedTurns}/numeric`,snapshot:snapshot(s)});return;}
      s.phase='camera-boundary';
    }catch(error){if(error.code==='DQ9_CAMERA_BUDGET')budget(w,error.message);else blocked(w,error.message);}}));
    await Promise.all(work.filter(w=>!w.result&&w.state.phase==='camera-boundary').map(async w=>{try{
      const s=w.state,exec=scoped(maxTransitions),initial=s.world===null;
      let row=initial?cameraEnclosingGeometryInitial({...clone(s.battle.camera.initial),commands:clone(s.commands),rawActions:Object.values(definitions.actions).map(a=>a.raw),seed:seedHex(s.battle.seed),currentActionIndex:0,row4Words:[]}):{...clone(s.world),row4Words:[]};
      if(!initial&&s.turnEntryPending)row.commands=s.commands.map(c=>({...clone(c),targetId:c.targets[0]??-1,targetPresent:c.targets.length>0}));
      syncNumeric(row,s.battle);if(s.turnEntryPending)row=await turnEntry(exec,row);
      const planner=await createCameraRow4BoundaryPlanner({getModel:get,runGraph:exec,capacity:12}),out=await planner.run({rows:[row]});
      s.pendingCamera={initial,row};s.pendingBoundary=clone(out.boundaries[0]);s.phase=s.pendingBoundary.required?'needs-row4':'camera';
    }catch(error){if(error.code==='DQ9_CAMERA_BUDGET')budget(w,error.message);else blocked(w,error.message);}}));
    await Promise.all(work.filter(w=>!w.result&&w.state.phase==='camera').map(async w=>{try{
      const s=w.state,exec=scoped(maxTransitions),initial=s.pendingCamera.initial,row=clone(s.pendingCamera.row);row.row4Words=clone(s.acceptedRow4?.words??[]);
      const runner=await(initial?createCameraEnclosingPhaseRunner:createCameraRetainedMemoryRunner)({getModel:get,runGraph:exec,runDoubleGraph:exec}),out=await runner.run({rows:[row],maxRouteAttempts});
      if(!out.complete){const reason=out.reason??'Camera boundary not supported';if(/budget|attempt|limit/i.test(JSON.stringify(reason)))budget(w,reason);else blocked(w,reason);return;}
      let current=retainCameraResult(out,row);
      if(current.presentationState===4){
        const resources=await createCameraProgramResourceRunner({getModel:get,runGraph:exec,runDoubleGraph:exec}),continued=await resources.run({row:current,maxRouteAttempts});
        current=continued.row;if(!continued.complete){s.world=current;s.battle.seed=[...current.seed];s.battle.position=current.position[0];blocked(w,continued.reason);return;}
      }
      s.world=current;
      s.battle.seed=[...current.seed];s.battle.position=current.position[0];s.turnEntryPending=false;if(s.acceptedRow4)s.row4History.push({...clone(s.acceptedRow4),rowIds:[...s.pendingBoundary.rowIds],computedSeed:[...s.battle.seed],computedPosition:s.battle.position});s.phase='after-observation';s.observationsCompleted++;
      s.pendingCamera=null;finish(w,'observation',{observationId:cameraId(s),snapshot:snapshot(s)});
    }catch(error){if(error.code==='DQ9_CAMERA_BUDGET')budget(w,error.message);else blocked(w,error.message);}}));
    for(const w of work)if(!w.result){if(w.state.phase==='needs-row4')finish(w,'needs-row4',{boundary:boundary(w.state)});else blocked(w,'Unknown common battle/camera phase '+w.state.phase);}
    return work.map(w=>w.result);
  }
  return{adapterId,advanceBatch,createInitialState:createInitialBattleCameraState,models:COMMON_BATTLE_CAMERA_MODELS,programHash:numeric.programHash};
}
