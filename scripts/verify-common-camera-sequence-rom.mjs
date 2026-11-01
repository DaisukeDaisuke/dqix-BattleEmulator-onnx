#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
import {cameraEnclosingGeometryInitial} from '../graph-v2/camera-enclosing-geometry-runner.mjs';
import {createCameraEnclosingPhaseRunner,CAMERA_ENCLOSING_PHASE_MODELS} from '../graph-v2/camera-enclosing-phase-runner.mjs';
import {createCameraRetainedMemoryRunner} from '../graph-v2/camera-retained-memory-runner.mjs';
import {createCameraRow4BoundaryPlanner} from '../graph-v2/camera-parent-runner.mjs';
const args=process.argv.slice(2),option=k=>{const i=args.indexOf(k);return i<0?undefined:args[i+1];},clone=x=>JSON.parse(JSON.stringify(x)),hash=x=>createHash('sha256').update(x).digest('hex'),hex=a=>'0x'+[...a].reverse().map(x=>x.toString(16).padStart(2,'0')).join('');
const IDS=[0,1,2,3,192,193,194,195,196,197,198,199],pad=(a,n,v=0)=>Array.from({length:n},(_,i)=>a[i]??v),models=new Map(),sourceBytes=await readFile(option('--source')),source=JSON.parse(sourceBytes);
if(source.programUnmodified!==true||source.executionComplete!==true)throw Error('Complete unmodified original execution is required');
async function modelBytes(name,ext){if(option('--overlay-dir'))try{return await readFile(resolve(option('--overlay-dir'),name+ext));}catch(error){if(error.code!=='ENOENT')throw error;}return readFile(resolve(option('--model-dir'),name+ext));}
for(const name of new Set([...CAMERA_ENCLOSING_PHASE_MODELS,'rom-common-camera-turn','rom-common-presentation-advance','rom-camera-admission-entry4'])){
 const onnx=await modelBytes(name,'.onnx'),ir=JSON.parse(await modelBytes(name,'.json'));models.set(name,{name,onnx,ir,sha256:hash(onnx)});
}
const ort=await loadLocalOrt(option('--ort-dir')),executor=createGraphExecutor({models,ortRuntime:ort}),getModel=async name=>{if(!models.has(name))throw Error('Model missing '+name);return models.get(name).ir;},runtime={getModel,runGraph:executor.runGraph,runDoubleGraph:executor.runGraph};
const initialRunner=await createCameraEnclosingPhaseRunner(runtime),retainedRunner=await createCameraRetainedMemoryRunner(runtime),boundary=await createCameraRow4BoundaryPlanner(runtime);
const report={schema:'dq9-common-camera-two-turn-original-v1',createdAt:new Date().toISOString(),sourceSHA256:hash(sourceBytes),romSHA256:source.romSHA256,models:[...models.values()].map(m=>({name:m.name,sha256:m.sha256})),provider:'ONNX Runtime Web WASM',gpuExecuted:false,scope:'Independent two-turn camera sequence from initial conditions, declared per-turn commands and external uint32 row4 at actual dispatcher entry. Common initializer, parent/goal/route, selector/RNG, world/facing and retained camera memory execute with computed state only. Observations are compared after execution and are never runtime operands. Numerical command production, renderer and asynchronous resource completion are outside this test.',fieldsCompared:0,mismatches:0,examples:[],cases:[],jsonResumes:0};
function compare(id,field,got,want){
 if(Array.isArray(want)){if(!Array.isArray(got)||got.length!==want.length){report.mismatches++;if(report.examples.length<60)report.examples.push({id,field,got,want,reason:'shape'});return;}want.forEach((v,i)=>compare(id,field+'['+i+']',got[i],v));return;}
 report.fieldsCompared++;if(got!==want){report.mismatches++;if(report.examples.length<60)report.examples.push({id,field,got,want});}
}
async function call(name,values){const ir=await getModel(name),input=Object.fromEntries(ir.inputs.map(f=>{const v=values[f.name]??ir.contract.defaults?.[f.name];if(v===undefined)throw Error(name+'.'+f.name+' missing');return[f.name,Array.isArray(v)?v:[v]];}));return(await executor.runGraph(name,[input]))[0];}
async function turnEntry(row){
 const byId=new Map([...row.roster,...row.lookupObjects??[]].map(a=>[a.id,a])),records=row.commands.flatMap(c=>c.participants.map(id=>({id,target:c.targets[0]??-1,has:c.targets.length>0})));
 const out=await call('rom-common-camera-turn',{actorLookupPresent:IDS.map(id=>byId.has(id)&&byId.get(id).lookupPresent!==false),actorTypeFlagsLow16:IDS.map(id=>byId.get(id)?.typeFlagsLow16??0),actorDead:IDS.map(id=>!!byId.get(id)?.dead),actorVisualPresent:IDS.map(id=>byId.has(id)&&byId.get(id).visualPresent!==false),actorBehavior:IDS.map(id=>byId.get(id)?.behaviorBE??0),actorPreviousBehavior:IDS.map(id=>byId.get(id)?.behaviorPrevious??0),actorPreferredTarget:IDS.map(id=>byId.get(id)?.preferredTarget??255),partyTacticsPresent:IDS.slice(0,4).map(id=>!!byId.get(id)?.tacticsPresent),partyTactics:IDS.slice(0,4).map(id=>byId.get(id)?.tactics??5),recordCount:records.length,recordSourceIds:pad(records.map(r=>r.id),72,-1),recordFirstTargetIds:pad(records.map(r=>r.target),72,-1),recordHasTarget:pad(records.map(r=>r.has),72,false),currentActionIndex:row.currentActionIndex,presentationState:row.presentationState,sceneByte71c5:row.sceneByte71c5,enabled:true});
 if(!out.supported[0]||!out.completed[0])throw Error('Turn initializer unsupported');
 IDS.forEach((id,i)=>{const a=byId.get(id);if(a){a.behaviorBE=out.nextActorBehavior[i];a.behaviorPrevious=out.nextActorPreviousBehavior[i];a.preferredTarget=out.nextActorPreferredTarget[i];}});
 row.currentActionIndex=out.nextCurrentActionIndex[0];row.presentationState=out.nextPresentationState[0];row.sceneByte71c5=out.nextSceneByte71c5[0];return row;
}
function rngPosition(original,phase){return 1+original.trace.filter(t=>t.function==='NextRandom'&&t.instruction<phase.instructions).length;}
function compareState(id,row,phase,original,{initializer=false}={}){
 const want=phase.outerState;compare(id,'seed',hex(row.seed),want.seed);compare(id,'position',row.position[0],rngPosition(original,phase));
 compare(id,'sceneMovementEnabled',Number(row.sceneMovementEnabled),want.cameraWords160[0x260/4]%256);
 for(const [got,key]of[[row.currentActionIndex,'currentActionIndex'],[row.presentationState,'presentationState'],[row.sceneByte,'sceneFlags'],[row.sceneByte71c5,'sceneByte71c5']])compare(id,key,got,want[key]);
 for(const a of row.roster){const w=want.rows.find(w=>w.id===a.id),o=want.objects.find(w=>w.id===a.id);if(!w||!o)throw Error('Original roster shape differs');
  for(const [key,actual]of Object.entries({startNode:a.start,goalNode:a.goal,auxiliaryNode:a.auxiliaryNode,faceNode:a.faceNode,preferredTarget:a.preferredTarget,secondaryTarget:a.secondaryTarget,movementPresence:a.movementPresence,routeCount:a.routeCount,routeStep:a.routeStep,routeTime:a.routeTime,visualFlags:a.visualFlags,routePositionXYZ:a.routePositionXYZ,resetPositionXYZ:a.resetPositionXYZ,routeBytes16:a.storedRoute}))compare(id,`object:${a.id}.${key}`,actual,w[key]);
  for(const [key,actual]of Object.entries({positionXYZ:a.position,rotationXYZ:a.rotation,orientationAE:a.orientationAE,objectIndex:a.objectIndex,behaviorBE:a.behaviorBE,flagsC4:a.flagsC4,pendingFacingTarget:a.pendingFacingTarget}))compare(id,`object:${a.id}.${key}`,actual,o[key]);
  compare(id,`object:${a.id}.behaviorBF`,a.behaviorPrevious,want.behaviorBF12[IDS.indexOf(a.id)]);
 }
 if(row.cameraU16){compare(id,'cameraWords160',Array.from({length:160},(_,i)=>row.cameraU16[2*i]+65536*row.cameraU16[2*i+1]),want.cameraWords160);compare(id,'globals7',row.cameraGeometry.globals7,want.globals7);compare(id,'firstCameraFlag',row.cameraGeometry.firstCameraFlag,want.firstCameraFlag);compare(id,'cameraState',row.cameraState,want.cameraState);}
 if(!initializer){compare(id,'programFlags3e8',row.programFlags3e8,want.programFlags3e8);if(phase.observations?.stackRow4WordsAfterDispatcher)compare(id,'computedGoalRow4Words',row.row4Words,phase.observations.stackRow4WordsAfterDispatcher);}
}
try{
 for(const original of source.results){
  const c=original.case;if(!c.sequenceTurns)continue;if(!original.ok||!original.sequenceComplete||!original.strictInitializedMemory)throw Error('Incomplete original sequence '+c.id+': '+original.error);
  let row=cameraEnclosingGeometryInitial(c);
  row.roster.forEach(a=>{const input=c.roster.find(r=>r.id===a.id);a.typeFlagsLow16=(a.id<4?0x180:0x280)|(input.flag400?0x400:0);a.behaviorPrevious=input.behaviorBF??0;a.tacticsPresent=input.partyTacticsPresent!==0;a.tactics=input.tactics??5;a.dead=!!input.dead;});
  const before=report.mismatches,caseReport={id:c.id,inputSHA256:hash(JSON.stringify(c)),turns:c.sequenceTurns.length,cameraCalls:0,phases:[],boundaries:[]};let first=true;
  for(let ti=0;ti<c.sequenceTurns.length;ti++){
   const turn=c.sequenceTurns[ti];row.commands=turn.commands.map(r=>({...clone(r),targetId:r.targets[0]??-1,targetPresent:r.targets.length>0}));row=await turnEntry(row);
   const key=`turn:${ti}/initializer`,expected=original.phases.find(p=>p.name===key);compareState(c.id+'/'+key,row,expected,original,{initializer:true});caseReport.phases.push({name:key,seed:hex(row.seed),position:row.position[0]});row=clone(row);report.jsonResumes++;
   for(let ci=0;ci<turn.commands.length;ci++){
    const key=`turn:${ti}/camera:${ci}`,b=(await boundary.run({rows:[row]})).boundaries[0],words=turn.row4Inputs[ci];
    if(words.length!==b.wordCount)throw Error(c.id+'/'+key+': supplied external word width '+words.length+' differs from genuine boundary '+b.wordCount);
    row.row4Words=clone(words);caseReport.boundaries.push({name:key,...b,words:clone(words)});
    const result=await(first?initialRunner:retainedRunner).run({rows:[row]});if(!result.complete)throw Error(c.id+'/'+key+': incomplete '+JSON.stringify(result.reason));
    const g=clone(result.cameraGeometry[0]),current=clone(result.states[0]);
    row={...current,cameraGeometry:g,cameraU16:[...result.cameraU16[0]],cameraState:[g.counter,g.globals7[0],g.globals7[1],g.globals7[3],g.globals7[4]],cameraInitialized:!!g.initialized,commandBaseU16:[...row.commandBaseU16],cameraRngPointerU16:[...row.cameraRngPointerU16],retainedMemoryOrigin:'computed-previous-outer-v1'};first=false;
    const expected=original.phases.find(p=>p.name===key);compareState(c.id+'/'+key,row,expected,original);caseReport.cameraCalls++;caseReport.phases.push({name:key,seed:hex(row.seed),position:row.position[0],stateSHA256:hash(JSON.stringify(row))});row=clone(row);report.jsonResumes++;
    if(ci+1<turn.commands.length){const out=await call('rom-common-presentation-advance',{queueCount:0,currentIndex:row.currentActionIndex,presentationState:row.presentationState,overridePresent:false,enabled:true});row.currentActionIndex=out.nextCurrentIndex[0];row.presentationState=out.nextPresentationState[0];const phase=original.phases.find(p=>p.name===`turn:${ti}/advance:${ci}`);compareState(c.id+'/'+phase.name,row,phase,original,{initializer:true});}
   }
  }
  caseReport.mismatches=report.mismatches-before;caseReport.finalState=row;report.cases.push(caseReport);
 }
}catch(error){report.error=error.stack;report.mismatches++;}finally{await executor.release();}
report.executionCounts=executor.counts;report.passed=report.cases.length>0&&report.mismatches===0;
if(option('--out')){await mkdir(dirname(resolve(option('--out'))),{recursive:true});await writeFile(option('--out'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({passed:report.passed,cases:report.cases.map(c=>({id:c.id,turns:c.turns,cameraCalls:c.cameraCalls,mismatches:c.mismatches})),fieldsCompared:report.fieldsCompared,mismatches:report.mismatches,jsonResumes:report.jsonResumes,executionCounts:report.executionCounts,error:report.error,examples:report.examples}));if(!report.passed)process.exitCode=1;
