#!/usr/bin/env node
// Initial original turn inputs -> production numerical graph -> computed
// ordinary/periodic records. Original completed bytes are comparison only.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BATTLE_DEFINITIONS,seedBytes} from '../data/common-battle.mjs';
import {createCommonBattleRunner} from '../runtime/common-battle.mjs';
import {createCommonOrdinaryArenaRunner} from '../runtime/common-ordinary-presentation.mjs';
import {createCommonPresentationRunner} from '../runtime/common-presentation.mjs';
import {buildCommonOrdinaryImpact} from '../graph-v2/build-common-ordinary-impact.mjs';
import {buildCommonOrdinaryArena} from '../graph-v2/build-common-ordinary-arena.mjs';
import {buildCommonPeriodicArena} from '../graph-v2/build-common-periodic-arena.mjs';
import {buildCommonPeriodicPresentation} from '../graph-v2/build-common-presentation.mjs';
import {commonPresentationArmInput} from './verify-common-presentation-rom.mjs';
import {multiActorArmInput} from './verify-common-multi-actor-rom.mjs';
import {legacyEndpoint} from './verify-common-battle-rom.mjs';
import {projectState} from '../graph-v2/rom-state-projection.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];},hash=x=>createHash('sha256').update(x).digest('hex');
const integrated=args.includes('--integrated');
if(!option('--source'))throw Error('Use --source original-full-turn-response.json --ort-dir ORT_DIR [--report JSON] [--observed-out JSON]');
const sourcePath=resolve(option('--source')),sourceBytes=await readFile(sourcePath),source=JSON.parse(sourceBytes);
if(!source.executionComplete||!source.programUnmodified||source.romSHA256!==BATTLE_DEFINITIONS.romSha256)throw Error('Require complete unmodified matching-ROM evidence');
const programPath=resolve(root,'graph-v2/common-battle-program.json'),program=JSON.parse(await readFile(programPath)),models=new Map();
for(const module of program.modules){const onnx=await readFile(resolve(dirname(programPath),module.onnx)),ir=JSON.parse(await readFile(resolve(dirname(programPath),module.ir)));if(hash(onnx)!==module.sha256)throw Error('Module hash differs '+module.name);models.set(module.name,{name:module.name,onnx,ir});}
const added=[buildCommonOrdinaryImpact(),buildCommonOrdinaryArena(),buildCommonPeriodicPresentation(),buildCommonPeriodicArena()].map(g=>({name:g.name,ir:g.json(),onnx:g.model()}));for(const m of added)models.set(m.name,m);
const ort=await loadLocalOrt(option('--ort-dir')??process.env.ORT_RUNTIME_DIR),executor=createGraphExecutor({models,ortRuntime:ort}),ordinary=createCommonOrdinaryArenaRunner({definitions:BATTLE_DEFINITIONS}),observed=[];
const report={schema:'dq9-common-ordinary-arena-rom-v1',sourceSHA256:hash(sourceBytes),romSHA256:source.romSHA256,moduleHashes:Object.fromEntries(added.map(m=>[m.name,hash(m.onnx)])),integratedCameraProjection:integrated,cases:[],fieldsCompared:0,mismatches:0,examples:[],scope:'Complete original numerical turn inputs drive the production numerical modules, then the shared ordinary/periodic semantic and arena models. All generated command/participant/target/impact/message bytes, counters and linked addresses are compared. No completed record, message choice, damage, seed or queue is an execution input. When integratedCameraProjection is true, the existing production enclosing-camera projection runs after queue generation and its final RNG is also compared; asynchronous rendering remains outside this proof.'};
const compare=(id,key,got,want)=>{if(Array.isArray(want)){if(!Array.isArray(got)||got.length!==want.length){report.mismatches++;if(report.examples.length<80)report.examples.push({id,key,shape:[got?.length,want.length]});return;}for(let i=0;i<want.length;i++)compare(id,key+'['+i+']',got[i],want[i]);return;}report.fieldsCompared++;if(!Object.is(got,want)){report.mismatches++;if(report.examples.length<80)report.examples.push({id,key,got,want});}};
const raw=(id,key,got,want)=>compare(id,key,got,Array.from(Buffer.from(want,'hex')));
const word=(id,offset)=>Buffer.from(BATTLE_DEFINITIONS.actions[id].raw,'hex').readUInt32LE(offset),messageData=[930,931,932,933].map(id=>word(id,32)&1023);messageData.push(word(934,32)&1023,word(934,32)>>>20&1023,word(934,40)&1023);
const presentationRunner=async({state,records,runGraph,getModel})=>{
  const buffers=[],base=[0,0x023e];let counters=[0,0,0,0,0];
  const call=async(name,input)=>{const ir=await getModel(name),feed={};for(const field of ir.inputs){const value=input[field.name]??ir.contract.defaults?.[field.name];if(value===undefined)throw Error('Missing '+name+'.'+field.name);feed[field.name]=Array.isArray(value)?value:[value];}return(await runGraph(name,[feed]))[0];};
  for(const record of records){
    const result=await ordinary({record,arenaBaseU16:base,counters,terminal:state.outcome!==0,runGraph,getModel});
    if(!result.complete)return{complete:false,unresolvedEffects:[result]};counters=result.arena.nextCounters;buffers.push({kind:'ordinary',...result});
  }
  const groups=new Map();for(const record of state.periodicPresentationRecords??[]){if(record.operation===0)continue;if(!groups.has(record.groupKey))groups.set(record.groupKey,[]);groups.get(record.groupKey).push(record);}
  let scratch=Array(32).fill(0);
  for(const[groupKey,group]of groups){
    const first=group[0],key=['','hpRequested','mpRequested','poisonRequested'][first.operation],input={operation:first.operation,partyGroup:first.side==='party',enabled:true,metadataInputsComplete:group.every(r=>Array.isArray(r.output?.[key])),messageData,scratchFlagsU16:scratch,
      present:Array.from({length:8},(_,i)=>i<group.length),requestedAmounts:Array.from({length:8},(_,i)=>group[i]?.output?.[key]?.[0]??0),rawStatusU16:Array.from({length:8},(_,i)=>{const value=group[i]?.after?.rawStatus??0;return[value%65536,Math.floor(value/65536)];}).flat(),statusKinds:Array.from({length:8},(_,i)=>group[i]?.after?.statusKinds??0)};
    if(group.length>8)throw Error('Periodic group capacity');
    for(const when of['before','after'])for(const[field,width,key]of[['Actors',33,'actor'],['Status',7,'status']])input[when+field]=[...group.flatMap(row=>row[when][key]),...Array((8-group.length)*width).fill(0)];
    const output=await call('rom-common-periodic-presentation',input);if(!output.supported[0]||!output.metadataSupported[0])return{complete:false,unresolvedEffects:[{reason:'periodic-semantics',groupKey}]};
    scratch=output.nextScratchFlagsU16;if(output.wrote[0]){
      const arena=await call('rom-common-periodic-arena',{arenaBaseU16:base,counters,actionId:output.command[0],startMessage:output.initialStartMessage[0],clearStartMessageOnImpact:output.clearStartMessageOnImpact[0],targetCount:output.targetCount[0],targetIds:output.targets,participantVitals:output.participantVitals,impactPayloadBytes:output.impactPayloadBytes,impactMessageIds:output.impactMessageIds,impactMessageCount:output.impactMessageCount[0],messagePaddingBytes:Array(504).fill(0),enabled:true});
      if(!arena.supported[0]||!arena.created[0])return{complete:false,unresolvedEffects:[{reason:'periodic-arena',groupKey}]};counters=arena.nextCounters;buffers.push({kind:'periodic',arena,output});
    }
  }
  return{complete:true,periodicComplete:true,seed:[...state.seed],position:state.position,camera:{...state.camera,complete:false,wholeCameraComplete:false,nextNumericTurnReady:false,buffers,counters,arenaOnly:true}};
};
const integratedPresenter=createCommonPresentationRunner({definitions:BATTLE_DEFINITIONS});
const runner=await createCommonBattleRunner({program,definitions:BATTLE_DEFINITIONS,getModel:name=>models.get(name)?.ir,runGraph:executor.runGraph,presentationRunner:integrated?integratedPresenter:presentationRunner});report.programHash=runner.programHash;
try{for(const original of source.results){
  const c=original.case,multi=Array.isArray(c.definitionProvenance);
  if(!original.ok||!original.strictInitializedMemory||c.kind!=='full_turn'||!c.includeFinish||(c.turnCount??1)!==1)throw Error('Unqualified original full turn '+c.id);
  if(!multi){
    if(!original.numericalTurnComplete||!c.joinedInputProvenance?.initialInputsOnly)throw Error('Missing joined initial provenance');
    const provenance=c.joinedInputProvenance;if(provenance.sourceRelativePath!=='initial-inputs.json')throw Error('Expected portable independent initial inputs');
    const initialBytes=await readFile(resolve(dirname(sourcePath),provenance.sourceRelativePath));if(hash(initialBytes)!==provenance.sourceSHA256)throw Error('Initial input hash differs');
    const initial=JSON.parse(initialBytes).cases.find(row=>row.id===provenance.sourceCaseId);if(!initial||initial.provenance.expectedOutputsUsed!==false)throw Error('Missing independent initial case');
    for(const[key,value]of Object.entries(initial.numeric))if(key!=='id'&&JSON.stringify(c[key])!==JSON.stringify(value))throw Error('Initial numeric field differs '+key);
  }else if(!c.capturePresentationRecords)throw Error('Missing initial queue-capture request');
  if(multi&&integrated)throw Error('The independent multi-actor cohort contains no initial visual program data');
  const adapted=multi?multiActorArmInput(c):commonPresentationArmInput(c),{row,numeric}=adapted;row.camera.mode=integrated?'camera-projection':'arena-proof';
  const caseRunner=multi?await createCommonBattleRunner({program,definitions:adapted.definitions,getModel:name=>models.get(name)?.ir,runGraph:executor.runGraph,presentationRunner}):runner;
  const result=await caseRunner.run({rows:[row],maxTurns:1,maxTransitions:100000}),actual=result.rows[0],before=report.mismatches;
  compare(c.id,'complete',result.complete,true);
  if(!multi){
    const n=original.numericTurnFinalState,expectedNumeric=projectState([n.party,n.enemy].map(a=>Buffer.from(a.statsRaw,'hex')),numeric.actors,numeric.aux),endpoint=legacyEndpoint(actual).state;
    for(const key of['actors','aux','status','wakeSkip'])compare(c.id,'numeric.'+key,endpoint[key],expectedNumeric[key]);
  }else for(const want of original.turnState.actorRows){
    const got=actual.actors.find(a=>a.actorId===want.actorId),stats=Buffer.from(want.statsRaw,'hex');
    compare(c.id,`numeric.actor${want.actorId}.vitals`,[got.actor[0],got.actor[2],got.rawStatus,got.rawFlags,got.statusKinds],[stats.readUInt16LE(0),stats.readUInt16LE(2),stats.readUInt32LE(0x14),stats.readUInt32LE(0x18),stats.readUInt16LE(0x22)]);
  }
  const finish=original.phases.find(p=>p.name.endsWith('full_finish_turn')),numericEndpoint=integrated?actual.nowstate[0]:actual;compare(c.id,'numeric.seed',numericEndpoint.seed,seedBytes(finish.seed));compare(c.id,'numeric.position',numericEndpoint.position,1+original.trace.filter(x=>x.function==='NextRandom'&&x.instruction<=finish.instructions).length);
  if(integrated){compare(c.id,'projectionComplete',actual.camera.projectionComplete,true);compare(c.id,'arenaComplete',actual.camera.arena?.complete,true);compare(c.id,'preCamera.seed',actual.camera.projectionInitial?.seed,seedBytes(finish.seed));compare(c.id,'projection.seed',actual.seed,seedBytes(original.nextState));compare(c.id,'projection.position',actual.position,1+original.consumed);}
  // The expected arena is first read here, after all computations complete.
  const expected=multi?finish.presentationQueue:original.generatedPresentationQueue,buffers=integrated?(actual.camera.arena?.records??[]).map(record=>({kind:record.kind,arena:record})):(actual.camera.buffers??[]),counters=integrated?actual.camera.arena?.counters:actual.camera.counters;
  compare(c.id,'commandCount',buffers.length,expected.count);['count','participantSlotsUsed','targetSlotsUsed','impactSlotsUsed','messageSlotsUsed'].forEach((key,i)=>compare(c.id,'arena.'+key,counters?.[i],expected[key]));
  for(let i=0;i<Math.min(buffers.length,expected.count);i++){
    const got=buffers[i],want=expected.records[i],arena=got.arena;
    raw(c.id,`command${i}.header40`,arena.commandBytes,want.raw40);raw(c.id,`command${i}.participant52`,arena.participantBytes,want.participantRaw52[0]);
    for(let j=0;j<want.targets.length;j++){
      raw(c.id,`command${i}.target${j}.raw36`,arena.targetBytes.slice(j*36,(j+1)*36),want.targetRaw36[j]);
      compare(c.id,`command${i}.target${j}.address`,0x023e0000+0xec0+arena.targetIndices[j]*36,Number(want.targetImpacts[j].targetAddress));
      const categories=want.targetImpacts[j].categories;
      for(let category=0;category<3;category++){
        const patch=got.kind==='ordinary'?j*2+(category===0?1:0):j,index=category===2?-1:category===1&&got.kind==='periodic'?-1:arena.impactIndices[patch],exists=index>=0;
        compare(c.id,`command${i}.target${j}.category${category}.count`,Number(exists),categories[category].length);if(!exists||!categories[category][0])continue;
        const impact=categories[category][0];raw(c.id,`command${i}.target${j}.category${category}.impact36`,arena.impactBytes.slice(patch*36,(patch+1)*36),impact.raw36);
        compare(c.id,`command${i}.target${j}.category${category}.address`,0x023e0000+0x21e0+index*36,Number(impact.address));
        const messagePatches=got.kind==='ordinary'?[patch]:[j*2,j*2+1],messages=messagePatches.filter(k=>arena.messageIndices[k]>=0);
        compare(c.id,`command${i}.target${j}.category${category}.messageCount`,messages.length,impact.messages.length);
        for(let m=0;m<Math.min(messages.length,impact.messages.length);m++){const at=messages[m];raw(c.id,`command${i}.target${j}.category${category}.message${m}.raw8`,arena.messageBytes.slice(at*8,(at+1)*8),impact.messages[m].raw8);compare(c.id,`command${i}.target${j}.category${category}.message${m}.address`,0x023e0000+0x5480+arena.messageIndices[at]*8,Number(impact.messages[m].address));}
      }
    }
  }
  report.cases.push({id:c.id,complete:result.complete,commands:buffers.length,mismatches:report.mismatches-before,unresolvedEffects:result.unresolvedEffects});observed.push({id:c.id,input:row,result});
}}finally{await executor.release();}
report.passed=report.mismatches===0&&report.cases.every(row=>row.complete);report.runtime={version:ort.env.versions.web,counts:executor.counts};
if(option('--report'))await writeFile(option('--report'),JSON.stringify(report,null,2)+'\n');if(option('--observed-out'))await writeFile(option('--observed-out'),JSON.stringify({report,cases:observed},null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
