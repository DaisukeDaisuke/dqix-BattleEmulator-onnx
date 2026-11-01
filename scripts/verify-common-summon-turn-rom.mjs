#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BATTLE_DEFINITIONS,seedBytes} from '../data/common-battle.mjs';
import {ACTOR_FIELDS} from '../graph-v2/common-battle-schema.mjs';
import {projectedActor} from '../graph-v2/verify-common-action-arm.mjs';
import {multiActorArmInput,projectActor} from './verify-common-multi-actor-rom.mjs';
import {createCommonBattleRunner} from '../runtime/common-battle.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),hash=b=>createHash('sha256').update(b).digest('hex'),raw=hex=>Array.from(Buffer.from(hex,'hex'));
const pending=['spawnPending','pendingMonsterId','pendingHp','pendingMp','pendingGroup','pendingLetter'];
function drawCount(from,to){let state=BigInt(from),target=BigInt(to);for(let n=0;n<10000;n++){if(state===target)return n;state=BigInt.asUintN(64,state*0x5d588b656c078965n+0x269ec3n);}throw Error('Original random state exceeds bounded counter observation');}
export function summonTurnArmInput(original){
  const c=original.case,compat={...c,definitionProvenance:c.definitionProvenance.map(p=>({baseId:p.id,baseRecordSHA256:p.originalSHA256,raw:p.raw,ramChanges:{actions:p.initialChanges.actions,extraMode:p.initialChanges.extraMode,angerTriggers:p.initialChanges.anger}}))},input=multiActorArmInput(compat),{row}=input,before=original.beforePopulation;
  if(BigInt(before.contextRandomState)!==BigInt(c.seed)||BigInt(before.globalRandomState)!==BigInt(c.globalSeed))throw Error('Pre-entry random state differs from supplied request');
  for(const a of row.actors.filter(a=>a.actorId>=192)){
    const memory=before.actors[a.actorId-192],b=Buffer.from(memory.statsRaw,'hex'),projection=projectActor(b,a),extra=projectedActor(b);Object.assign(a,projection,{preparation:extra.preparation,populationRawStats:Array.from(b),populationStored:BigInt(memory.statsPointer)===0x02350158n+BigInt(a.actorId-192)*164n});a.ai.cursor=memory.actorCursor??b[0x38];a.ai.revengeId=extra.history[0];a.ai.previousId=extra.history[1];for(const key of pending)a[key]=memory[key]??0;
  }
  row.enemyPopulation={rosterRaw:raw(before.rosterRaw),storageRawStats:raw(before.storageRaw),loadedMonsterIds:Array.from({length:4},(_,i)=>c.loadedMonsterIds[i]??-1),globalSeed:seedBytes(c.globalSeed),globalPosition:1};return input;
}
export async function verifyCommonSummonTurnRom({sourcePath,programPath=resolve(root,'graph-v2/common-battle-program.json'),ortDirectory,observedPath,onlyId}={}){
  const sourceBytes=await readFile(sourcePath),source=JSON.parse(sourceBytes);if(!source.executionComplete||!source.programUnmodified||source.romSHA256!==BATTLE_DEFINITIONS.romSha256||source.results.some(r=>!r.ok||!r.strictInitializedMemory))throw Error('Complete strict original ARM execution required');
  const cases=source.results.filter(r=>!onlyId||r.case.id===onlyId);if(!cases.length)throw Error('No explicit original cases');
  const program=JSON.parse(await readFile(programPath,'utf8')),models=new Map();for(const module of program.modules){const ir=JSON.parse(await readFile(resolve(dirname(programPath),module.ir),'utf8')),onnx=await readFile(resolve(dirname(programPath),module.onnx));if(hash(onnx)!==module.sha256)throw Error('Changed program binding '+module.name);models.set(module.name,{name:module.name,ir,onnx});}
  const ort=await loadLocalOrt(ortDirectory),executor=createGraphExecutor({models,ortRuntime:ort,backend:'onnxruntime-wasm'}),report={schema:'dq9-common-summon-turn-arm-verification-v1',source:resolve(sourcePath),sourceSHA256:hash(sourceBytes),romSHA256:source.romSHA256,programSHA256:hash(JSON.stringify(program)),runtimeSHA256:hash(await readFile(resolve(root,'runtime/common-battle.mjs'))),cases:[],turnEndpoints:0,fieldsCompared:0,mismatches:0,examples:[],scope:'Complete original begin/ProcessCombatTurn/finish calls, with dynamic population across turns. Only initial request and pre-entry RAM initialize the first graph; subsequent turns receive only the graph runner own state. Independent expected endpoints never feed inference. Visual lifecycle remains outside this numeric boundary.'},observations=[];
  const compare=(id,key,want,got)=>{if(Array.isArray(want)){if(!Array.isArray(got)||got.length!==want.length){report.mismatches++;report.examples.push({id,key,shape:[want.length,got?.length]});return;}want.forEach((v,i)=>compare(id,key+'['+i+']',v,got[i]));return;}report.fieldsCompared++;if(Number(want)!==Number(got)){report.mismatches++;if(report.examples.length<120)report.examples.push({id,key,expected:want,actual:got});}};
  try{for(const original of cases){
    const {row:initial,definitions}=summonTurnArmInput(original),runner=await createCommonBattleRunner({program,definitions,getModel:name=>models.get(name)?.ir,runGraph:executor.runGraph}),finishes=original.phases.filter(p=>p.name.endsWith('full_finish_turn')),start=report.mismatches;let row=initial,complete=true;
    for(const[turn,finish]of finishes.entries()){
      const result=await runner.run({rows:[row],maxTurns:1,maxTransitions:20000,trace:!!observedPath});row=result.rows[0];complete&&=result.complete;const id=original.case.id+'/turn'+(turn+1),want=finish.state,pop=finish.population;
      compare(id,'complete',1,Number(result.complete));compare(id,'seed',seedBytes(finish.seed),row.seed);compare(id,'position',1+drawCount(original.case.seed,finish.seed),row.position);compare(id,'turn',want.turn,row.turn);compare(id,'outcome',want.outcome,row.outcome);compare(id,'combo',[want.comboSide,want.comboCount,want.comboAction,want.comboTarget],row.combo.slice(0,4));
      compare(id,'globalSeed',seedBytes(pop.globalRandomState),row.enemyPopulation.globalSeed);compare(id,'globalPosition',1+drawCount(original.case.globalSeed,pop.globalRandomState),row.enemyPopulation.globalPosition);compare(id,'rosterRaw',raw(pop.rosterRaw),row.enemyPopulation.rosterRaw);compare(id,'storageRaw',raw(pop.storageRaw),row.enemyPopulation.storageRawStats);
      const endpoints=[{actorId:0,present:true,statsRaw:finish.party.statsRaw,actorCursor:0},...pop.actors];
      for(const memory of endpoints){
        const a=row.actors.find(a=>a.actorId===memory.actorId);compare(id,'actor'+memory.actorId+'.present',Number(memory.present),Number(!!a&&a.present!==false));if(!memory.present||!a)continue;
        const m=definitions.monsters[memory.monsterId],prior=initial.actors.find(a=>a.actorId===memory.actorId),base=prior??{actor:ACTOR_FIELDS.map(key=>({id:memory.actorId,baseAttack:m.attack,baseDefense:m.defense,baseAgility:m.agility,level:m.level,dodgeRate:m.dodgeRate,guardRate:m.guardRate})[key]??0)},b=Buffer.from(memory.statsRaw,'hex'),expected=projectActor(b,base),extra=projectedActor(b),prefix='actor'+memory.actorId;
        for(const key of['actor','aux','status','tension','wakeSkip','rawStatus','rawFlags','rawRanks','rawTimers','state3c','statusKinds','dead','excluded','coverById','coverTargetId'])compare(id,prefix+'.'+key,expected[key],a[key]);compare(id,prefix+'.preparation',extra.preparation,a.preparation);compare(id,prefix+'.history',extra.history,[a.ai.revengeId,a.ai.previousId]);compare(id,prefix+'.resistances',extra.resistances,a.resistances);
        if(memory.actorId>=192){compare(id,prefix+'.cursor',memory.actorCursor,a.ai.cursor);compare(id,prefix+'.definitionId',memory.definitionId,a.definitionId);compare(id,prefix+'.monsterId',memory.monsterId,a.originalMonsterId);compare(id,prefix+'.group',memory.group,a.group);for(const key of pending)compare(id,prefix+'.'+key,memory[key]??0,a[key]??0);}
      }
      for(let group=0;group<3;group++){compare(id,'group'+group+'.cursor',pop.rosterRaw?raw(pop.rosterRaw)[16+group*24]:0,row.groups[group].cursor);compare(id,'group'+group+'.usedSlots',raw(pop.rosterRaw)[15+group*24],row.groups[group].usedSlots.reduce((bits,v,i)=>bits|(v?1<<i:0),0));}
      report.turnEndpoints++;if(observedPath)observations.push({id,result});if(!result.complete)break;
    }
    report.cases.push({id:original.case.id,complete,turns:finishes.length,mismatches:report.mismatches-start,unresolvedEffects:row.unresolvedEffects});
  }}finally{await executor.release();}
  report.passed=report.mismatches===0&&report.cases.every(c=>c.complete);report.counts={...executor.counts};report.ortVersion=ort.env.versions.web;if(observedPath)await writeFile(resolve(observedPath),JSON.stringify({report,observations},null,2)+'\n');return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const options={ortDirectory:process.env.ORT_RUNTIME_DIR},keys={'--source':'sourcePath','--program':'programPath','--ort-dir':'ortDirectory','--observed-out':'observedPath','--only-id':'onlyId'},args=process.argv.slice(2);let output;
  for(let i=0;i<args.length;i++){if(args[i]==='--out')output=args[++i];else if(keys[args[i]])options[keys[args[i]]]=args[++i];else throw Error('Unknown option '+args[i]);}if(!options.sourcePath)throw Error('Use --source STRICT_ARM_RESPONSE --ort-dir EXISTING_ORT_DIST');const report=await verifyCommonSummonTurnRom(options),text=JSON.stringify(report,null,2)+'\n';if(output)await writeFile(resolve(output),text);console.log(text);if(!report.passed)process.exitCode=1;
}
