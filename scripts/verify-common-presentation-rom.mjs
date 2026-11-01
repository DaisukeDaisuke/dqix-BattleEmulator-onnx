#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import rom from '../restored/dq9-unified/data/rom.mjs';
import {BATTLE_DEFINITIONS,seedBytes} from '../data/common-battle.mjs';
import {ACTOR_FIELDS} from '../graph-v2/rules.mjs';
import {initialStats,projectState} from '../graph-v2/rom-state-projection.mjs';
import {armFixtureInput,legacyEndpoint} from './verify-common-battle-rom.mjs';
import {createCommonBattleRunner} from '../runtime/common-battle.mjs';
import {createCommonPresentationRunner} from '../runtime/common-presentation.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),hash=x=>createHash('sha256').update(x).digest('hex');
const visualKeys=['roster','lookupObjects','battleType','sceneFlags','residentPrograms','fallbackProgram','counter','sample100','appliedMode','heightQ12','angleQ12','cameraInitialized','resourceFlags04','sceneByte71c5','programFlags3e8','cameraPosition','cameraLookAt','cameraPolar','cameraRoll','cameraRollScratch','cameraRange','cameraMode','camera261','cameraSourceId','cameraTargetId','firstCameraFlag','initialPresentationState','queuedPresentationRecords'];

export function commonPresentationArmInput(c){
  if(c.kind!=='full_turn'||c.actors.length!==2||!c.includeFinish)throw Error('The independent ARM fixture adapter requires its declared two-actor full-turn input layout');
  const monster=rom.monsters.find(m=>m.raw===c.monsterRaw);if(!monster)throw Error('Initial monster record does not match the permanent ROM data');
  const definition=BATTLE_DEFINITIONS.monsters[monster.id];
  const baseActors=c.actors.flatMap((a,i)=>ACTOR_FIELDS.map(name=>({hp:a.hp,maxHp:a.maxHp,mp:a.mp,maxMp:a.maxMp,baseAttack:a.baseAttack??a.attack,baseDefense:a.baseDefense??a.defense,baseAgility:a.baseAgility??a.agility,level:a.level,party:i===0?1:0,id:i===0?0:192,dodgeRate:i===0?2:definition.dodgeRate,guardRate:i===0?(c.partyShieldGuardTenths??0)/10:definition.guardRate,criticalThreshold:i===0?Math.trunc(100*(2+.01*Math.max((c.deftness??150)-150,0))):0})[name]??0));
  const baseAux=Array(35).fill(0);baseAux[6]=-1;
  const numeric={...projectState(c.actors.map(initialStats),baseActors,baseAux),config:[1,0,0,0,definition.config[4],definition.config[5],0],seed:seedBytes(c.seed),position:[1],turn:[c.turn??1],combo:[c.comboSide??0,c.comboCount??0,c.comboAction??0,c.comboTarget??-1,0,0],context:[1,0]};
  const row=armFixtureInput({id:c.id,input:numeric,includesFinish:true},c),initial=Object.fromEntries(visualKeys.filter(k=>c[k]!==undefined).map(k=>[k,structuredClone(c[k])]));
  // These fixture ABI addresses were initialized before any guest execution.
  // No observed intermediate pointer/stack/queue value is reused as input.
  initial.stackAbi={sameStack:true,gameStateSingletonU16:[0x33d8,0x020f],objectAddressU16:Object.fromEntries(initial.roster.map(a=>{const slot=a.id<=3?a.id:4+a.id-192;return[a.id,[0x400*slot,0x0230]];}))};
  initial.commandBaseU16=[0x821c,0x023e];initial.cameraRngPointerU16=[0,0x023e];
  row.camera={mode:'camera-projection',row4Words:[...c.row4Words],initial,records:[],state:null};
  return{row,numeric};
}

export async function verifyCommonPresentationRom({sourcePath,sourceRoot,ortDirectory,outputPath,observedPath,trace=false}={}){
  const sourceBytes=await readFile(sourcePath),source=JSON.parse(sourceBytes);
  if(!source.executionComplete||!source.programUnmodified||source.romSHA256!==rom.romSha256)throw Error('The independent source must be a complete unmodified matching-ROM run');
  const programPath=resolve(root,'graph-v2/common-battle-program.json'),program=JSON.parse(await readFile(programPath)),models=new Map();
  for(const module of program.modules){const onnx=await readFile(resolve(dirname(programPath),module.onnx)),ir=JSON.parse(await readFile(resolve(dirname(programPath),module.ir)));if(hash(onnx)!==module.sha256)throw Error('Program/model hash differs: '+module.name);models.set(module.name,{name:module.name,onnx,ir,executionProvider:ir.schema==='dq9-cpu-double-graph-ir-v1'?'wasm-explicit-cpu':undefined});}
  const ortRuntime=await loadLocalOrt(ortDirectory),executor=createGraphExecutor({models,ortRuntime,backend:'onnxruntime-wasm'}),presentationRunner=createCommonPresentationRunner({definitions:BATTLE_DEFINITIONS}),runner=await createCommonBattleRunner({program,definitions:BATTLE_DEFINITIONS,getModel:name=>models.get(name)?.ir,runGraph:executor.runGraph,presentationRunner});
  const report={schema:'dq9-common-presentation-arm-v1',sourceSha256:hash(sourceBytes),romSha256:rom.romSha256,programHash:runner.programHash,moduleHashes:runner.moduleHashes,runtimeHashes:Object.fromEntries(await Promise.all(['runtime/common-battle.mjs','runtime/common-presentation.mjs'].map(async p=>[p,hash(await readFile(resolve(root,p)))]))),cases:[],fieldsCompared:0,mismatches:0,examples:[],scope:{initialInputsOnly:true,expectedEndpointFeedback:false,wholeCameraComplete:false,nextNumericTurnReady:false,explicitScheduledOuterCalls:true}},observed=[];
  function compare(id,key,got,want){
    if(Array.isArray(want)){if(!Array.isArray(got)||got.length!==want.length){report.mismatches++;report.examples.push({id,key,shape:[got?.length,want.length]});return;}for(let i=0;i<want.length;i++)compare(id,key+'['+i+']',got[i],want[i]);return;}
    report.fieldsCompared++;if(!Object.is(got,want)){report.mismatches++;if(report.examples.length<80)report.examples.push({id,key,got,want});}
  }
  const words=raw=>Array.from({length:160},(_,i)=>raw[i*2]+65536*raw[i*2+1]);
  try{for(const r of source.results){
    if(!r.ok||!r.strictInitializedMemory||!r.numericalTurnComplete||!r.handoffPreservesSeed||!r.handoffPreservesNumericStateAndQueue||!r.samePresentationStackWithoutReinitialization)throw Error('Missing strict initial-only joint proof: '+r.case.id);
    const provenance=r.case.joinedInputProvenance;if(!provenance?.initialInputsOnly)throw Error('Initial input provenance is missing');
    let initialPath;
    if(provenance.sourceRelativePath){
      if(provenance.sourceRelativePath!=='initial-inputs.json')throw Error('Unknown independent initial input file');
      initialPath=resolve(dirname(sourcePath),provenance.sourceRelativePath);
    }else{
      const marker=provenance.source?.indexOf('evidence-v2/')??-1;if(marker<0)throw Error('Unknown independent input path');
      initialPath=resolve(sourceRoot,provenance.source.slice(marker));
    }
    const initialBytes=await readFile(initialPath);if(hash(initialBytes)!==provenance.sourceSHA256)throw Error('Independent initial inputs changed');
    const initial=JSON.parse(initialBytes).cases.find(x=>x.id===provenance.sourceCaseId);if(!initial||initial.provenance.expectedOutputsUsed!==false)throw Error('Missing independent initial case');
    for(const[k,v]of Object.entries(initial.numeric))if(k!=='id'&&JSON.stringify(r.case[k])!==JSON.stringify(v))throw Error('Initial numeric values differ: '+k);
    const {row,numeric}=commonPresentationArmInput(r.case),result=await runner.run({rows:[row],maxTurns:1,maxTransitions:100000,trace}),actual=result.rows[0],before=report.mismatches;
    compare(r.case.id,'complete',result.complete,true);compare(r.case.id,'projectionComplete',actual.camera.projectionComplete,true);
    const n=r.numericTurnFinalState,expectedNumeric=projectState([n.party,n.enemy].map(a=>Buffer.from(a.statsRaw,'hex')),numeric.actors,numeric.aux),endpoint=legacyEndpoint(actual).state;
    for(const key of ['actors','aux','status','wakeSkip'])compare(r.case.id,'numeric.'+key,endpoint[key],expectedNumeric[key]);
    const turn=actual.nowstate[0],finish=r.phases.find(p=>p.name==='full_finish_turn');compare(r.case.id,'numeric.seed',turn?.seed,seedBytes(finish.seed));
    compare(r.case.id,'numeric.position',turn?.position,1+r.trace.filter(x=>x.function==='NextRandom'&&x.instruction<=finish.instructions).length);
    compare(r.case.id,'final.seed',actual.seed,seedBytes(r.nextState));compare(r.case.id,'final.position',actual.position,1+r.consumed);
    const outputs=actual.camera.projection?.outputs??[],commands=actual.camera.projection?.commands??[];compare(r.case.id,'outerCount',outputs.length,r.presentationOuterReturns.length);compare(r.case.id,'commandCount',commands.length,r.generatedPresentationQueue.count);
    for(let i=0;i<Math.min(commands.length,r.generatedPresentationQueue.count);i++){const expected=Buffer.from(r.generatedPresentationQueue.records[i].raw40,'hex'),got=commands[i];for(const[k,w]of Object.entries({actionId:expected.readUInt16LE(0),messageId:expected.readInt16LE(4),flagsA:expected[10],flagsB:expected[11]}))compare(r.case.id,`command${i}.${k}`,got[k],w);}
    for(let i=0;i<Math.min(outputs.length,r.presentationOuterReturns.length);i++){
      const got=outputs[i],want=r.presentationOuterReturns[i],s=got.world,g=got.geometry,population=[...s.roster,...s.lookupObjects??[]];
      compare(r.case.id,`outer${i}.seed`,got.seed,seedBytes(want.outerState.seed));compare(r.case.id,`outer${i}.row4`,got.row4Words,want.row4Words);compare(r.case.id,`outer${i}.camera160`,words(got.cameraU16),want.outerState.cameraWords160);
      compare(r.case.id,`outer${i}.cameraState`,[g.counter,g.globals7[0],g.globals7[1],g.globals7[3],g.globals7[4]],want.outerState.cameraState);
      for(const[k,w]of [['sceneByte','sceneFlags'],['presentationState','presentationState'],['programFlags3e8','programFlags3e8'],['resourceFlags04','resourceFlags04'],['sceneByte71c5','sceneByte71c5'],['currentActionIndex','currentActionIndex']])compare(r.case.id,`outer${i}.${k}`,s[k],want.outerState[w]);
      for(const v of want.outerState.rows){const a=population.find(x=>x.id===v.id);for(const[k,w]of [['start','startNode'],['goal','goalNode'],['auxiliaryNode','auxiliaryNode'],['faceNode','faceNode'],['routeCount','routeCount'],['routeStep','routeStep'],['routeTime','routeTime'],['visualFlags','visualFlags'],['routePositionXYZ','routePositionXYZ'],['resetPositionXYZ','resetPositionXYZ'],['storedRoute','routeBytes16']])compare(r.case.id,`outer${i}.actor${v.id}.${k}`,a?.[k],v[w]);}
    }
    report.cases.push({id:r.case.id,complete:result.complete,fields:report.fieldsCompared,mismatches:report.mismatches-before,unresolvedEffects:result.unresolvedEffects,graphCalls:result.graphCalls});observed.push({id:r.case.id,input:row,result});
  }}finally{await executor.release();}
  report.passed=report.mismatches===0&&report.cases.every(x=>x.complete);report.runtime={version:ortRuntime.env.versions.web,counts:executor.counts};
  if(outputPath)await writeFile(outputPath,JSON.stringify(report,null,2)+'\n');if(observedPath)await writeFile(observedPath,JSON.stringify({report,cases:observed},null,2)+'\n');return report;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i++){if(args[i]==='--trace'){options.trace=true;continue;}const key=({'--source':'sourcePath','--source-root':'sourceRoot','--ort-dir':'ortDirectory','--out':'outputPath','--observed-out':'observedPath'})[args[i]];if(!key||!args[i+1])throw Error('Use --source JSON --source-root DIR --ort-dir DIR --out JSON [--observed-out JSON]');options[key]=resolve(args[++i]);}
  const report=await verifyCommonPresentationRom(options);console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
}
