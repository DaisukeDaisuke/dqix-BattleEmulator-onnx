#!/usr/bin/env node
// Public first-frame inputs -> natural presentation -> retained numeric state.
import {openAsBlob} from 'node:fs';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {BATTLE_DEFINITIONS,seedBytes} from '../data/common-battle.mjs';
import {COMMON_FUNCTIONAL_FRAME_EXAMPLE} from '../data/common-functional-frame-example.mjs';
import {extractCommonPresentationAssets} from '../runtime/common-rom-assets.mjs';
import {createCommonFunctionalPresentationRunner} from '../runtime/common-functional-presentation.mjs';
import {createCommonBattleRunner} from '../runtime/common-battle.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
import {projectActor} from './verify-common-multi-actor-rom.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),hash=x=>createHash('sha256').update(x).digest('hex'),clone=x=>structuredClone(x),hex=x=>'0x'+[...x].reverse().map(v=>v.toString(16).padStart(2,'0')).join('');
export async function verifyCommonNaturalNextTurn({sourcePath,romPath,ortDirectory}={}){
  const sourceBytes=await readFile(sourcePath),source=JSON.parse(sourceBytes);
  if(!source.executionComplete||!source.programUnmodified||source.romSHA256!==BATTLE_DEFINITIONS.romSha256)throw Error('Complete unchanged original-ROM evidence required');
  const programPath=resolve(root,'graph-v2/common-battle-program.json'),program=JSON.parse(await readFile(programPath)),models=new Map();
  for(const m of program.modules){const onnx=await readFile(resolve(dirname(programPath),m.onnx)),ir=JSON.parse(await readFile(resolve(dirname(programPath),m.ir)));if(hash(onnx)!==m.sha256)throw Error('Model closure mismatch '+m.name);models.set(m.name,{name:m.name,onnx,ir,executionProvider:ir.schema==='dq9-cpu-double-graph-ir-v1'?'wasm-explicit-cpu':undefined});}
  const ort=await loadLocalOrt(ortDirectory),executor=createGraphExecutor({models,ortRuntime:ort}),frameResources=await extractCommonPresentationAssets(await openAsBlob(romPath)),presentationRunner=createCommonFunctionalPresentationRunner({definitions:BATTLE_DEFINITIONS,frameResources}),runner=await createCommonBattleRunner({program,definitions:BATTLE_DEFINITIONS,getModel:name=>models.get(name)?.ir,runGraph:executor.runGraph,presentationRunner});
  const report={schema:'dq9-common-natural-next-turn-rom-v1',sourceSHA256:hash(sourceBytes),romSHA256:source.romSHA256,programHash:runner.programHash,runtimeVersion:ort.env.versions.web,runtimeSHA256:hash(await readFile(resolve(root,'runtime/common-battle.mjs'))),fieldsCompared:0,mismatches:0,examples:[],cases:[],scope:'The public initial example and actual local ROM assets drive one numeric turn and the complete qualified natural component-frame schedule. Its computed state, including the final camera RNG, then enters runNumericTurn with only the explicit new menu. Original snapshot/restore and second numerical endpoints are comparison-only. No actor, frame, seed or auxiliary state is rebuilt from original outputs. The second presentation and original overlay26 command-menu/visual preparation remain outside this boundary.'};
  const compare=(id,key,got,want)=>{if(Array.isArray(want)){if(!Array.isArray(got)||got.length!==want.length){report.mismatches++;if(report.examples.length<100)report.examples.push({id,key,shape:[got?.length,want.length]});return;}want.forEach((v,i)=>compare(id,key+'['+i+']',got[i],v));return;}report.fieldsCompared++;if(got!==want){report.mismatches++;if(report.examples.length<100)report.examples.push({id,key,got,want});}};
  function endpoint(id,actual,expected,initial){
    compare(id,'seed',hex(actual.seed),expected.seed);compare(id,'position',actual.position,expected.positionFromInitial);compare(id,'turn',actual.turn,expected.state.turn);compare(id,'outcome',actual.outcome,expected.state.outcome);
    compare(id,'combo',actual.combo.slice(0,4),[expected.state.comboSide,expected.state.comboCount,expected.state.comboAction,expected.state.comboTarget]);
    compare(id,'group0.cursor',actual.groups[0].cursor,expected.state.groupCursor);compare(id,'group0.usedSlots',actual.groups[0].usedSlots.reduce((bits,v,i)=>bits|(v?1<<i:0),0),expected.state.usedSlots);
    for(const[index,actorId]of[0,192].entries()){
      const a=actual.actors.find(a=>a.actorId===actorId),base=initial.actors.find(a=>a.actorId===actorId),want=projectActor(Buffer.from(expected.actorStatsHex[index],'hex'),base);
      for(const key of['actor','aux','status','tension','wakeSkip','rawStatus','rawFlags','rawRanks','rawTimers','state3c','statusKinds','dead','excluded','coverById','coverTargetId','currentStats'])compare(id,'actor'+actorId+'.'+key,a[key],want[key]);
      compare(id,'actor'+actorId+'.history',[a.ai.revengeId??0,a.ai.previousId??0],want.history);
      if(actorId===192){compare(id,'actor192.cursor',a.ai.cursor,expected.state.actorCursor);compare(id,'actor192.definitionId',a.definitionId,expected.definitionState.definitionId);compare(id,'actor192.originalMonsterId',a.originalMonsterId,expected.definitionState.originalMonsterId);}
    }
  }
  try{
    for(const original of source.results){
      const c=original.case;if(!original.ok||!original.strictInitializedMemory||!original.naturalTurnPresentationComplete||!original.secondNumericTurnComplete||!original.secondNumericHandoffPreservesComputedState||c.naturalSecondTurn!==1||!c.secondMenu)throw Error('Incomplete natural next-turn source '+c.id);
      const before=report.mismatches,input=clone(COMMON_FUNCTIONAL_FRAME_EXAMPLE.inputs);input.seed=seedBytes(c.seed);
      const first=await runner.run({rows:[input],maxTurns:1,maxTransitions:100000}),presented=first.rows[0];
      compare(c.id,'first.complete',first.complete,true);compare(c.id,'first.frames',presented.camera.frameSummary?.frames,original.naturalFrames);compare(c.id,'first.nextNumericTurnReady',presented.camera.nextNumericTurnReady,true);endpoint(c.id+'/after-frame',presented,original.secondNumericBoundaryBeforeMenu,input);
      const snapshot=original.phases.find(p=>p.name==='second_numeric:original_seed_snapshot')?.continuation,restore=original.phases.find(p=>p.name==='second_numeric:original_seed_restore')?.continuation;
      if(!snapshot||!restore)throw Error('Missing original snapshot/restore '+c.id);
      const value=BigInt(hex(presented.seed));compare(c.id,'snapshot.high32',Number(value>>32n),snapshot.snapshotHigh32);compare(c.id,'snapshot.low32',Number(value&0xffffffffn),snapshot.snapshotLow32);compare(c.id,'snapshot.seedUnchanged',hex(presented.seed),snapshot.seed);compare(c.id,'restore.seed',hex(presented.seed),restore.seed);compare(c.id,'restore.position',presented.position,restore.positionFromInitial);
      const continuation=clone(presented),party=continuation.actors.find(a=>a.actorId===0);party.commands=[...party.commands,{actionId:c.secondMenu.actionId,targets:[c.secondMenu.targetId],parameter:c.secondMenu.parameter,targetGroup:0}];
      const firstFrameState=JSON.stringify(continuation.camera.frameState),second=await runner.runNumericTurn({rows:[continuation],maxTransitions:100000,trace:true}),actual=second.rows[0];
      compare(c.id,'second.complete',second.complete,true);compare(c.id,'second.boundary',second.boundary,'numeric-turn');compare(c.id,'second.phase',actual.phase,'numeric-turn-complete');compare(c.id,'second.pendingPresentation',actual.camera.numericTurnPending,true);compare(c.id,'second.nextNumericTurnReady',actual.camera.nextNumericTurnReady,false);compare(c.id,'second.retainedFrameState',JSON.stringify(actual.camera.frameState),firstFrameState);endpoint(c.id+'/after-second-numeric',actual,original.secondNumericTurnFinal,input);
      const begin=second.traces[0].find(t=>t.phase==='turn-begin'&&t.model===program.operations.turnBegin)?.output,originalBegin=original.phases.find(p=>p.name==='second_numeric:turn_begin')?.continuation;
      if(!begin||!originalBegin)throw Error('Missing original/computed turn begin '+c.id);
      compare(c.id,'begin.combo',begin.nextCombo.slice(0,4),[originalBegin.state.comboSide,originalBegin.state.comboCount,originalBegin.state.comboAction,originalBegin.state.comboTarget]);compare(c.id,'begin.usedSlots',begin.nextUsedSlots.slice(0,6).reduce((bits,v,i)=>bits|(v?1<<i:0),0),originalBegin.state.usedSlots);
      const third=await runner.runNumericTurn({rows:[actual],maxTransitions:100000}),blocked=third.rows[0];compare(c.id,'third.rejected',third.complete,false);compare(c.id,'third.graphCalls',third.graphCalls,0);compare(c.id,'third.seedPreserved',hex(blocked.seed),hex(actual.seed));compare(c.id,'third.positionPreserved',blocked.position,actual.position);compare(c.id,'third.actorStatePreserved',JSON.stringify(blocked.actors),JSON.stringify(actual.actors));compare(c.id,'third.frameStatePreserved',JSON.stringify(blocked.camera.frameState),firstFrameState);compare(c.id,'third.reason',third.unresolvedEffects[0]?.reason,'presentation-to-next-turn');
      report.cases.push({id:c.id,firstFrames:presented.camera.frameSummary?.frames,nextMenu:clone(c.secondMenu),firstSeed:hex(presented.seed),firstPosition:presented.position,secondSeed:hex(actual.seed),secondPosition:actual.position,secondNumericComplete:second.complete,secondUnresolvedEffects:second.unresolvedEffects,thirdRejected:!third.complete,thirdReason:third.unresolvedEffects[0]?.reason,mismatches:report.mismatches-before});
    }
  }finally{await executor.release();}
  report.passed=report.mismatches===0&&report.cases.every(c=>c.secondNumericComplete&&c.thirdRejected);return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const args=process.argv.slice(2),options={};let out;for(let i=0;i<args.length;i++){if(args[i]==='--source')options.sourcePath=args[++i];else if(args[i]==='--rom')options.romPath=args[++i];else if(args[i]==='--ort-dir')options.ortDirectory=args[++i];else if(args[i]==='--out')out=args[++i];else throw Error('Unknown argument '+args[i]);}const report=await verifyCommonNaturalNextTurn(options);if(out)await writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;}
