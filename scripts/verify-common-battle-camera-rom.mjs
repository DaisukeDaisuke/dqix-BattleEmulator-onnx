#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2),option=k=>{const i=args.indexOf(k);return i<0?undefined:args[i+1];},clone=x=>JSON.parse(JSON.stringify(x)),hash=x=>createHash('sha256').update(x).digest('hex'),hex=a=>'0x'+[...a].reverse().map(x=>x.toString(16).padStart(2,'0')).join('');
const runtimeRoot=resolve(option('--runtime-root')??resolve(dirname(fileURLToPath(import.meta.url)),'..'));
const [{createCommonBattleCameraAdapter,COMMON_BATTLE_CAMERA_MODELS},{createGraphExecutor},{loadLocalOrt}]=await Promise.all(['runtime/common-battle-camera.mjs','web/graph-executor.mjs','scripts/verify-common-battle.mjs'].map(p=>import(pathToFileURL(resolve(runtimeRoot,p)))));
// Optional independent initial-data binding check. This resolves only declared
// packaged actor definitions before the adapter starts. It never sees outcomes.
// Production automatic binding is a separate integration claim.
const bindActorDefinitions=args.includes('--bind-actor-definitions');
const actorBinder=bindActorDefinitions?await import(pathToFileURL(resolve(runtimeRoot,'runtime/common-camera-actor-programs.mjs'))):null;
const actorBinding=actorBinder?{externalInitialResolution:true,sourceSHA256:hash(await readFile(resolve(runtimeRoot,'runtime/common-camera-actor-programs.mjs'))),dataSHA256:hash(await readFile(resolve(runtimeRoot,'data/common-camera-actor-program-data.mjs'))),scope:'Declared initial definition resolution only; this flag does not assert automatic production binding.'}:null;
const sourceBytes=await readFile(option('--source')),source=JSON.parse(sourceBytes),initialBytes=await readFile(option('--inputs')),initial=JSON.parse(initialBytes),modelRoot=resolve(option('--model-dir'));
const selectedCaseId=option('--case-id'),sourceResults=selectedCaseId?source.results.filter(r=>r.case?.id===selectedCaseId):source.results;
if(selectedCaseId&&sourceResults.length!==1)throw Error('The selected original case must exist exactly once');
if((source.executionComplete!==true&&!selectedCaseId)||source.programUnmodified!==true||initial.expectedOutputsUsed!==false)throw Error('Complete unmodified original execution and initial-only inputs are required');
const program=JSON.parse(await readFile(resolve(modelRoot,'common-battle-program.json'))),baseProgramSHA256=hash(JSON.stringify(program)),models=new Map(),overlayModels=new Set();
async function modelBytes(name,ext){if(option('--overlay-dir'))try{const bytes=await readFile(resolve(option('--overlay-dir'),name+ext));overlayModels.add(name);return bytes;}catch(error){if(error.code!=='ENOENT')throw error;}return readFile(resolve(modelRoot,name+ext));}
for(const name of new Set([...program.modules.map(m=>m.name),...COMMON_BATTLE_CAMERA_MODELS,'rom-camera-admission-entry4'])){const onnx=await modelBytes(name,'.onnx'),ir=JSON.parse(await modelBytes(name,'.json'));models.set(name,{name,onnx,ir,sha256:hash(onnx)});}
for(const m of program.modules)if(models.get(m.name).sha256!==m.sha256){if(!overlayModels.has(m.name))throw Error('Model binding mismatch '+m.name);m.sha256=models.get(m.name).sha256;}
for(const name of models.keys())if(!program.modules.some(m=>m.name===name))program.modules.push({name,onnx:name+'.onnx',ir:name+'.json',sha256:models.get(name).sha256});
const ort=await loadLocalOrt(option('--ort-dir')),executor=createGraphExecutor({models,ortRuntime:ort}),getModel=async name=>{if(!models.has(name))throw Error('Missing model '+name);return models.get(name).ir;};
const report={schema:'dq9-common-battle-camera-joint-rom-v1',createdAt:new Date().toISOString(),sourceSHA256:hash(sourceBytes),sourceBatchComplete:source.executionComplete===true,selectedCaseId:selectedCaseId??null,initialActorDefinitionBinding:actorBinding,initialInputsSHA256:hash(initialBytes),baseProgramSHA256,explicitOverlayModels:[...overlayModels],programSHA256:hash(JSON.stringify(program)),modelHashes:Object.fromEntries([...models.values()].map(m=>[m.name,m.sha256])),romSHA256:source.romSHA256,provider:'ONNX Runtime Web WASM',gpuExecuted:false,scope:'Actual numeric turn/finish produces commands; common ONNX command projection, turn entry, camera and next numeric turn run from the same initial conditions and external row4 candidates. Observed outputs are compared only, never fed into adapter state.',fieldsCompared:0,mismatches:0,examples:[],cases:[],jsonResumes:0};
const IDS=[0,1,2,3,192,193,194,195,196,197,198,199];
function compare(id,field,got,want){
 if(Array.isArray(want)){if(!Array.isArray(got)||got.length!==want.length){report.mismatches++;if(report.examples.length<60)report.examples.push({id,field,got,want,reason:'shape'});return;}want.forEach((v,i)=>compare(id,field+'['+i+']',got[i],v));return;}
 if(want&&typeof want==='object'){for(const[k,v]of Object.entries(want))compare(id,field+'.'+k,got?.[k],v);return;}
 report.fieldsCompared++;if(got!==want){report.mismatches++;if(report.examples.length<60)report.examples.push({id,field,got,want});}
}
function rngPosition(original,phase){return 1+original.trace.filter(t=>t.function==='NextRandom'&&t.instruction<phase.instructions).length;}
function compareWorld(id,row,phase,original){
 const want=phase.outerState;compare(id,'seed',hex(row.seed),want.seed);compare(id,'position',row.position[0],rngPosition(original,phase));compare(id,'sceneMovementEnabled',Number(row.sceneMovementEnabled),want.cameraWords160[0x260/4]%256);
 for(const[got,key]of[[row.currentActionIndex,'currentActionIndex'],[row.presentationState,'presentationState'],[row.sceneByte,'sceneFlags'],[row.sceneByte71c5,'sceneByte71c5']])compare(id,key,got,want[key]);
 for(const a of row.roster){const w=want.rows.find(w=>w.id===a.id),o=want.objects.find(w=>w.id===a.id);if(!w||!o)throw Error('Original roster shape differs');
  for(const[key,actual]of Object.entries({startNode:a.start,goalNode:a.goal,auxiliaryNode:a.auxiliaryNode,faceNode:a.faceNode,preferredTarget:a.preferredTarget,secondaryTarget:a.secondaryTarget,movementPresence:a.movementPresence,routeCount:a.routeCount,routeStep:a.routeStep,routeTime:a.routeTime,visualFlags:a.visualFlags,routePositionXYZ:a.routePositionXYZ,resetPositionXYZ:a.resetPositionXYZ,routeBytes16:a.storedRoute}))compare(id,`object:${a.id}.${key}`,actual,w[key]);
  for(const[key,actual]of Object.entries({positionXYZ:a.position,rotationXYZ:a.rotation,orientationAE:a.orientationAE,objectIndex:a.objectIndex,behaviorBE:a.behaviorBE,flagsC4:a.flagsC4,pendingFacingTarget:a.pendingFacingTarget}))compare(id,`object:${a.id}.${key}`,actual,o[key]);compare(id,`object:${a.id}.behaviorBF`,a.behaviorPrevious,want.behaviorBF12[IDS.indexOf(a.id)]);if(Object.hasOwn(o,'flagsC1'))compare(id,`object:${a.id}.flagsC1`,a.flagsC1,o.flagsC1);
 }
 compare(id,'cameraWords160',Array.from({length:160},(_,i)=>row.cameraU16[2*i]+65536*row.cameraU16[2*i+1]),want.cameraWords160);compare(id,'globals7',row.cameraGeometry.globals7,want.globals7);compare(id,'firstCameraFlag',row.cameraGeometry.firstCameraFlag,want.firstCameraFlag);compare(id,'cameraState',row.cameraState,want.cameraState);compare(id,'programFlags3e8',row.programFlags3e8,want.programFlags3e8);
 if(phase.observations?.stackRow4WordsAfterDispatcher)compare(id,'computedGoalRow4Words',row.row4Words,phase.observations.stackRow4WordsAfterDispatcher);
}
function compareNumeric(id,state,phase,original,{finish=false}={}){
 const battle=state.battle,w=phase.state,turn=state.battle.completedTurns-1,checkpoint=battle.nowstate[turn];
 if(finish){compare(id,'numeric.seed',hex(checkpoint.seed),phase.seed);compare(id,'numeric.position',checkpoint.position,rngPosition(original,phase));}
 compare(id,'numeric.turn',battle.turn,w.turn);compare(id,'numeric.outcome',battle.outcome,w.outcome);compare(id,'numeric.combo',battle.combo.slice(0,4),[w.comboSide,w.comboCount,w.comboAction,w.comboTarget]);
 for(const want of w.actorRows){const a=battle.actors.find(a=>a.actorId===want.actorId);if(!a)throw Error('Missing computed actor '+want.actorId);const bytes=Array.from(Buffer.from(want.statsRaw,'hex'));
  compare(id,'actor.'+want.actorId,{hp:a.actor[0],mp:a.actor[2],maxHp:a.actor[1],maxMp:a.actor[3],status:a.rawStatus,flags18:a.rawFlags,rawRanks:a.rawRanks,tension:a.tension[0],rawTimers:a.rawTimers,actorCursor:a.ai.cursor},{hp:want.hp,mp:want.mp,maxHp:want.maxHp,maxMp:want.maxMp,status:want.status,flags18:want.flags18,rawRanks:Array.from({length:10},(_,i)=>{const v=(want.ranksPacked>>>(i*3))&7;return v<4?v:v-8;}),tension:bytes[0x24],rawTimers:program.rawTimerOffsets.map(o=>bytes[o]),actorCursor:want.actorCursor});
 }
 compare(id,'groups',battle.groups.map(g=>({cursor:g.cursor,usedSlots:g.usedSlots.reduce((n,v,i)=>n+(v?2**i:0),0)})),w.groupRows.map(g=>({cursor:g.cursor,usedSlots:g.usedSlots})));
 if(finish)compare(id,'generatedCommands',state.commands,phase.presentationQueue.records.map(r=>({actionId:r.action,messageId:r.messageId,participants:r.sources,targets:r.targets,flagsA:r.flagsA,flagsB:r.flagsB})));
}
try{
 for(const original of sourceResults){
  const c=original.case;if(!original.ok||!original.jointSequenceComplete||!original.strictInitializedMemory)throw Error('Incomplete original joint sequence '+c.id+': '+original.error);const item=initial.cases.find(x=>x.id===c.id);if(!item||item.expectedOutputsUsed!==false)throw Error('Missing initial-only fixture '+c.id);
  const input=clone(item.input);for(const actor of input.actors){const raw=actor.actorId<4?c.actors[actor.actorId]:c.enemies[actor.actorId-192],bytes=new Uint8Array(176);for(const[k,v]of Object.entries(raw.statBytes??{}))bytes[Number(k)]=v;actor.rawTimers=program.rawTimerOffsets.map(offset=>bytes[offset]);}
  let camera=clone(c);delete camera.row4Words;delete camera.allActionRecords;delete camera.allMonsterRecords;delete camera.actors;delete camera.enemies;delete camera.damageTables;delete camera.battleSequenceTurns;delete camera.initialCameraArchives;delete camera.initialDefaultFallback;delete camera.initialActorPrograms;
  camera.roster=camera.roster.map(a=>({...a,typeFlagsLow16:a.id<4?0x180:0x680,behaviorPrevious:a.behaviorBF??0,tacticsPresent:a.id<4&&a.partyTacticsPresent!==0,tactics:a.id<4?c.partyTactic:0,partyStatePresent:a.id<4}));if(actorBinder)camera=actorBinder.withPackagedActorPrograms(camera);input.camera={mode:'battle-camera',initial:camera,nextNumericTurnReady:true};
  const adapter=await createCommonBattleCameraAdapter({program,definitions:item.definitions,getModel,runGraph:executor.runGraph}),before=report.mismatches,cr={id:c.id,initialInputSHA256:hash(JSON.stringify(input)),definitionsSHA256:hash(JSON.stringify(item.definitions)),turns:0,cameraCalls:0,boundaries:[],phases:[]};let state=adapter.createInitialState({input,maxTurns:c.battleSequenceTurns.length}),request=null,complete=false;const checked=new Set();
  for(let step=0;step<400;step++){
   const result=(await adapter.advanceBatch([{id:c.id,state,...request?{row4Input:request}:{}}],{maxTransitions:100000,maxRouteAttempts:13033}))[0];state=clone(result.state);report.jsonResumes++;request=null;
   if(result.status==='unsupported'||result.status==='budget')throw Error(c.id+': '+JSON.stringify(result.reason));
   const ti=state.battle.completedTurns-1;if(ti>=0&&!checked.has(ti)){
    const phase=original.phases.find(p=>p.jointTurn===ti&&p.name.endsWith('full_finish_turn'));if(!phase)throw Error('Missing original numerical finish');compareNumeric(c.id+'/turn:'+ti,state,phase,original,{finish:true});checked.add(ti);cr.turns++;
   }
   if(result.status==='needs-row4'){
    const words=c.battleSequenceTurns[ti].row4Candidate;if(words.length!==result.boundary.wordCount)throw Error('Declared candidate differs from required row count');request={boundaryId:result.boundary.id,words:clone(words)};cr.boundaries.push({...result.boundary,words:clone(words)});continue;
   }
   if(result.status==='observation'){
    const ci=state.commandIndex,phase=original.phases.find(p=>p.name===`joint:${ti}/camera:${ci}`);if(!phase)throw Error('Missing actual camera phase '+ti+'/'+ci);compareWorld(c.id+'/'+phase.name,state.world,phase,original);compareNumeric(c.id+'/'+phase.name,state,phase,original);cr.cameraCalls++;cr.phases.push({name:phase.name,seed:hex(state.battle.seed),position:state.battle.position,stateSHA256:hash(JSON.stringify(state))});
   }
   if(result.status==='complete'){complete=true;break;}
  }
  if(!complete)throw Error('Joint verifier step budget exhausted');cr.mismatches=report.mismatches-before;cr.finalState=state;report.cases.push(cr);
 }
}catch(error){report.error=error.stack;report.mismatches++;}finally{await executor.release();}
report.executionCounts=executor.counts;report.passed=report.cases.length===sourceResults.length&&report.mismatches===0;
if(option('--out')){await mkdir(dirname(resolve(option('--out'))),{recursive:true});await writeFile(option('--out'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({passed:report.passed,cases:report.cases.map(c=>({id:c.id,turns:c.turns,cameraCalls:c.cameraCalls,mismatches:c.mismatches})),fieldsCompared:report.fieldsCompared,mismatches:report.mismatches,jsonResumes:report.jsonResumes,executionCounts:report.executionCounts,error:report.error,examples:report.examples}));if(!report.passed)process.exitCode=1;
