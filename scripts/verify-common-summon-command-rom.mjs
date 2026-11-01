#!/usr/bin/env node
// Complete original command callers through the production shared runner.
// Only original request data and the before-first-instruction RAM snapshot
// initialize the inference state. Dynamic final actors remain expected data.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BATTLE_DEFINITIONS,seedBytes} from '../data/common-battle.mjs';
import {ACTOR_FIELDS} from '../graph-v2/common-battle-schema.mjs';
import {actorFromStats,projectedActor} from '../graph-v2/verify-common-action-arm.mjs';
import {armCommandInput} from './verify-common-command-rom.mjs';
import {createCommonBattleRunner} from '../runtime/common-battle.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
import {buildCommonCommandBegin,buildCommonTargetEffect,buildCommonCommandEnemyReaction,buildCommonCommandEnd} from '../graph-v2/build-common-action.mjs';
import {buildCommonPopulationRequest,buildCommonPopulationPlan,buildCommonPopulationInsert,buildCommonPopulationRoster} from '../graph-v2/build-common-population.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),hash=bytes=>createHash('sha256').update(bytes).digest('hex'),word=bytes=>bytes.reduce((v,b,i)=>v+b*2**(8*i),0),raw=hex=>Array.from(Buffer.from(hex,'hex')),bytes=(value,n=4)=>Array.from({length:n},(_,i)=>value>>>i*8&255);
const pendingFields=['spawnPending','pendingMonsterId','pendingHp','pendingMp','pendingGroup','pendingLetter'];

export function summonCommandInput(original,lane,definitions){
  const c=original.case,before=original.beforePopulation;
  if(BigInt(before.contextRandomState)!==BigInt(c.seed)||BigInt(before.globalRandomState)!==BigInt(c.globalSeed))throw Error('Initial random snapshot differs from request');
  const row=armCommandInput(c,lane,definitions);
  for(const a of row.actors.filter(a=>a.actorId>=192)){
    const memory=before.actors[a.actorId-192],m=definitions.monsters[memory.monsterId];if(!memory.present||!m)throw Error('Initial enemy definition is missing');
    const b=Buffer.from(memory.statsRaw,'hex'),projected=projectedActor(b);
    Object.assign(a,projected,{definitionId:m.id,originalMonsterId:m.id,group:memory.group,populationRawStats:Array.from(b),rawStatus:word(projected.rawStatusBytes),rawFlags:word(projected.rawFlagsBytes),statusKinds:word(projected.statusKindsBytes),config:[...m.config],species:m.species,metal:m.metal});
    for(const field of pendingFields)a[field]=memory[field]??0;
    a.actor=ACTOR_FIELDS.map(key=>actorFromStats(a.initialActor,b)[key]);a.actor[ACTOR_FIELDS.indexOf('dodgeRate')]=m.dodgeRate;a.actor[ACTOR_FIELDS.indexOf('guardRate')]=m.guardRate;
    a.initialActor=Object.fromEntries(ACTOR_FIELDS.map((key,i)=>[key,a.actor[i]]));a.ai.revengeId=projected.history[0];a.ai.previousId=projected.history[1];
  }
  const rosterRaw=raw(before.rosterRaw);
  row.groups=Array.from({length:3},(_,i)=>({cursor:rosterRaw[16+i*24],usedSlots:Array.from({length:6},(_,j)=>!!(rosterRaw[15+i*24]&(1<<j)))}));
  row.enemyPopulation={rosterRaw,storageRawStats:raw(before.storageRaw),globalSeed:seedBytes(c.globalSeed),globalPosition:1,loadedMonsterIds:Array.from({length:4},(_,i)=>c.loadedMonsterIds[i]??-1)};
  return row;
}

export async function verifyCommonSummonCommandRom({sourcePath,programPath=resolve(root,'graph-v2/common-battle-program.json'),ortDirectory,buildCurrent=false,observedPath}={}){
  const sourceBytes=await readFile(resolve(sourcePath)),source=JSON.parse(sourceBytes);
  if(!source.executionComplete||!source.programUnmodified||source.romSHA256!==BATTLE_DEFINITIONS.romSha256||source.results.some(r=>!r.ok||!r.strictInitializedMemory))throw Error('Complete unmodified strict original ARM evidence required');
  const originals=source.results.filter(r=>r.case.kind==='normal_action');if(!originals.length)throw Error('No complete original summon callers');
  const program=JSON.parse(await readFile(programPath,'utf8')),models=new Map();
  for(const module of program.modules){const onnx=await readFile(resolve(dirname(programPath),module.onnx)),ir=JSON.parse(await readFile(resolve(dirname(programPath),module.ir),'utf8'));if(hash(onnx)!==module.sha256)throw Error('Program model changed: '+module.name);models.set(module.name,{name:module.name,ir,onnx});}
  if(buildCurrent){
    for(const build of[buildCommonCommandBegin,buildCommonTargetEffect,buildCommonCommandEnemyReaction,buildCommonCommandEnd,buildCommonPopulationRequest,buildCommonPopulationPlan,buildCommonPopulationInsert,buildCommonPopulationRoster]){const graph=build(),onnx=graph.model(),ir=graph.json(),entry={name:graph.name,ir:'./'+graph.name+'.json',onnx:'./'+graph.name+'.onnx',sha256:hash(onnx)},i=program.modules.findIndex(m=>m.name===graph.name);models.set(graph.name,{name:graph.name,ir,onnx});if(i<0)program.modules.push(entry);else program.modules[i]=entry;}
    Object.assign(program.operations,{populationRequest:'rom-common-population-request',populationPlan:'rom-common-population-plan',populationInsert:'rom-common-population-insert',populationRoster:'rom-common-population-roster'});
  }
  const definitions=structuredClone(BATTLE_DEFINITIONS),rows=originals.map((row,i)=>summonCommandInput(row,i,definitions)),ort=await loadLocalOrt(ortDirectory),executor=createGraphExecutor({models,ortRuntime:ort,backend:'onnxruntime-wasm'}),runner=await createCommonBattleRunner({program,definitions,getModel:name=>models.get(name)?.ir,runGraph:executor.runGraph});
  const report={schema:'dq9-common-summon-command-arm-verification-v1',source:resolve(sourcePath),sourceSHA256:hash(sourceBytes),romSHA256:source.romSHA256,cases:originals.length,excludedInitialKinds:source.results.length-originals.length,fieldsCompared:0,mismatches:0,examples:[],backend:'onnxruntime-wasm',ortVersion:ort.env.versions.web,buildCurrent,programHash:runner.programHash,runtimeSHA256:hash(await readFile(resolve(root,'runtime/common-battle.mjs'))),scope:'Complete original operation11/12 command callers including dynamic actor population, both random streams, roster/type/backing-storage bytes and original existing/new actor state. Initial request and pre-entry RAM only; planning, post-status, turn finish and visual activation remain separate boundaries.'};
  try{
    const result=await runner.runCommandEffects({rows,maxTransitions:10000,trace:!!observedPath});
    const compare=(id,key,wanted,got)=>{wanted=Array.isArray(wanted)?wanted:[wanted];got=Array.isArray(got)?got:[got];for(let i=0;i<wanted.length;i++){report.fieldsCompared++;if(Number(wanted[i])!==Number(got[i])){report.mismatches++;if(report.examples.length<120)report.examples.push({id,key,index:i,expected:wanted[i],actual:got[i]});}}};
    originals.forEach((original,lane)=>{
      const got=result.rows[lane],c=original.case,pop=original.population,id=c.id;
      compare(id,'supported',1,Number(got.supported));compare(id,'seed',seedBytes(original.nextState),got.seed);compare(id,'position',1+original.consumed,got.position);compare(id,'globalSeed',seedBytes(pop.globalRandomState),got.enemyPopulation.globalSeed);
      compare(id,'rosterRaw',raw(pop.rosterRaw),got.enemyPopulation.rosterRaw);compare(id,'storageRaw',raw(pop.storageRaw),got.enemyPopulation.storageRawStats);compare(id,'combo',[original.comboSide,original.comboCount,original.comboAction,original.comboTarget],got.combo.slice(0,4));
      const originalActors=[{actorId:0,present:true,statsRaw:original.actors[0].statsRaw},...pop.actors];
      for(const memory of originalActors){
        const a=got.actors.find(a=>a.actorId===memory.actorId);compare(id,'actor'+memory.actorId+'.present',Number(memory.present),Number(!!a&&a.present!==false));if(!memory.present||!a)continue;
        const initial=rows[lane].actors.find(a=>a.actorId===memory.actorId),m=definitions.monsters[memory.monsterId],template=initial?.initialActor??Object.fromEntries(ACTOR_FIELDS.map(key=>[key,({id:memory.actorId,baseAttack:m.attack,baseDefense:m.defense,baseAgility:m.agility,level:m.level,dodgeRate:m.dodgeRate,guardRate:m.guardRate})[key]??0])),b=Buffer.from(memory.statsRaw,'hex'),projected=projectedActor(b),expected={...projected,actor:ACTOR_FIELDS.map(key=>actorFromStats(template,b)[key])},observed={...a,history:[a.ai.revengeId,a.ai.previousId],rawStatusBytes:bytes(a.rawStatus),rawFlagsBytes:bytes(a.rawFlags),statusKindsBytes:bytes(a.statusKinds,2)};
        for(const key of['actor','aux','status','tension','preparation','history','wakeSkip','state3c','rawStatusBytes','rawFlagsBytes','statusKindsBytes','rawRanks','rawTimers','resistances'])compare(id,'actor'+memory.actorId+'.'+key,expected[key],observed[key]);
        if(memory.actorId>=192){compare(id,'actor'+memory.actorId+'.monsterId',memory.monsterId,a.originalMonsterId);compare(id,'actor'+memory.actorId+'.group',memory.group,a.group);for(const key of pendingFields)compare(id,'actor'+memory.actorId+'.'+key,memory[key]??0,a[key]??0);if(a.spawnPending)compare(id,'actor'+memory.actorId+'.statsRaw',raw(memory.statsRaw),a.populationRawStats);}
      }
    });
    report.complete=result.complete;report.unresolvedEffects=result.unresolvedEffects;report.passed=result.complete&&report.mismatches===0;report.counts={...executor.counts};report.moduleHashes=result.moduleHashes;
    if(observedPath)await writeFile(resolve(observedPath),JSON.stringify({report,rows:result.rows,traces:result.traces},null,2)+'\n');return report;
  }finally{await executor.release();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),options={ortDirectory:process.env.ORT_RUNTIME_DIR},keys={'--source':'sourcePath','--program':'programPath','--ort-dir':'ortDirectory','--observed-out':'observedPath'};let output;
  for(let i=0;i<args.length;i++){if(args[i]==='--build-current')options.buildCurrent=true;else if(args[i]==='--out')output=args[++i];else if(keys[args[i]])options[keys[args[i]]]=args[++i];else throw Error('Unknown option '+args[i]);}
  if(!options.sourcePath)throw Error('Use --source STRICT_ARM_RESPONSE --ort-dir EXISTING_ORT_DIST [--build-current]');const report=await verifyCommonSummonCommandRom(options),text=JSON.stringify(report,null,2)+'\n';if(output)await writeFile(resolve(output),text);console.log(text);if(!report.passed)process.exitCode=1;
}
