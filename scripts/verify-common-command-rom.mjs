#!/usr/bin/env node
// The production actor-array command loop, compared with complete original
// action callers. Initial fixture memory is the only inference input.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BATTLE_DEFINITIONS,seedBytes} from '../data/common-battle.mjs';
import {ACTOR_FIELDS} from '../graph-v2/common-battle-schema.mjs';
import {commonArmActorTableInput,actorFromStats,projectedActor} from '../graph-v2/verify-common-action-arm.mjs';
import {createCommonBattleRunner} from '../runtime/common-battle.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),hash=bytes=>createHash('sha256').update(bytes).digest('hex'),word=bytes=>bytes.reduce((value,byte,i)=>value+byte*2**(8*i),0),bytes=(value,n=4)=>Array.from({length:n},(_,i)=>value>>>i*8&255);

export function armCommandInput(c,lane,definitions){
  const projected=commonArmActorTableInput(c),rawActors=c.enemies?[c.actors[0],...c.enemies]:c.actors;
  const actors=projected.actors.map((a,i)=>{
    const actorId=a.initialActor.id,party=a.initialActor.party!==0,raw=rawActors[i],rawStatus=word(a.rawStatusBytes),rawFlags=word(a.rawFlagsBytes),definitionId=65000+lane*8+i;
    const suppliedRecord=party?null:(raw.monsterRaw??(i===1?c.monsterRaw:null)),monster=suppliedRecord?Object.values(definitions.monsters).find(m=>m.raw===suppliedRecord):null;
    if(suppliedRecord&&!monster)throw Error('A supplied original monster record must resolve to the immutable definition table');
    if(monster){
      for(const key of['dodgeRate','guardRate']){a.initialActor[key]=monster[key];a.actor[ACTOR_FIELDS.indexOf(key)]=monster[key];}
      a.config=[...monster.config];a.otherAngerChances=[...monster.otherAngerChances];
    }
    const suppliedAux=party?null:(raw.monsterAuxRaw??(i===1?c.monsterAuxRaw:null));
    if(suppliedAux){const flags=Buffer.from(suppliedAux,'hex').readUInt16LE(10);a.metal=!!(flags&0x1000);a.species=flags>>>7&15;}
    if(!party)definitions.monsters[definitionId]={id:definitionId,actions:[1,1,1,1,1,1],scheme:0,judgment:0,limitedSlots:0,flags:monster?.flags??raw.definitionFlags??c.enemyDefinitionFlags??0,otherAngerChances:a.otherAngerChances};
    // Definition keys isolate each fixture's input table. They are not the
    // original object's halfword2: the base initializer writes monster1,
    // optionally replaced by monsterRaw, and the expanded enemy initializer
    // explicitly writes1 for every listed enemy.
    const originalMonsterId=party?null:c.enemies?1:monster?.id??1;
    return{...a,actorId,group:party?-1:a.group,present:true,roster:true,dead:!!(rawStatus&1),excluded:!!(rawFlags&0x2000),definitionId:party?null:definitionId,originalMonsterId,
      rawStatus,rawFlags,statusKinds:word(a.statusKindsBytes),weapon:[0,0,10,0],weaponMetalBonus:party&&(c.partyWeaponPresent??1)>0&&!!((c.partyWeaponProperty0??0)&16),charm:[0,0,0],job:party?(c.job??0):0,equipmentReflect:!!raw.equipmentReflect,counterSkill:!!raw.counterSkill,weaponWide:(raw.weaponBits??raw.weaponWide??0)&3,doubleHitWeapon:!!raw.doubleHitWeapon,extraHitSkill:!!raw.extraHitSkill,
      coverById:raw.coverById??-1,coverTargetId:raw.coverTargetId??-1,ai:{cursor:0,alternate:!!(a.state3c&1),revengeId:a.history[0],previousId:a.history[1],previousTargetCount:0,previousTargets:Array(8).fill(-1)},commands:[]};
  });
  const listed=c.targetId??(projected.sourceId<4?192:0);
  return{schema:'dq9-common-battle-state-v1',encounterId:'strict-command:'+c.id,seed:projected.seed,position:1,turn:1,completedTurns:0,firstTurn:true,surprise:0,scenarioId:c.scriptRestricted?0x320:c.scenarioId??-1,actors,
    combo:projected.combo,context:projected.context,outcome:0,finished:false,supported:true,camera:{mode:'numeric-only',records:[],row4Words:[],state:null},nowstate:[],
    pendingCommands:[{sourceId:projected.sourceId,sources:[projected.sourceId],actionId:c.actionId,targets:[listed,...Array(7).fill(-1)],targetCount:1,deferred:false}],initialAuthority:{kind:'strict original action caller',id:c.id,expectedStateUsed:false}};
}

export async function verifyCommonCommandRom({sourcePath,programPath=resolve(root,'graph-v2/common-battle-program.json'),ortDirectory,backend='onnxruntime-wasm',observedPath,onlyId,limit}={}){
  const sourceBytes=await readFile(resolve(sourcePath)),source=JSON.parse(sourceBytes);
  if(!source.executionComplete||!source.programUnmodified||source.romSHA256!==BATTLE_DEFINITIONS.romSha256||!source.results?.length||source.results.some(r=>!r.ok||!r.strictInitializedMemory))throw Error('Complete unmodified strict ARM evidence is required');
  let cases=source.results;if(onlyId)cases=cases.filter(row=>row.case.id===onlyId);if(limit)cases=cases.slice(0,limit);if(!cases.length)throw Error('No original caller cases selected');
  const program=JSON.parse(await readFile(programPath,'utf8')),models=new Map();
  for(const module of program.modules){const ir=JSON.parse(await readFile(resolve(dirname(programPath),module.ir),'utf8')),onnx=await readFile(resolve(dirname(programPath),module.onnx));if(hash(onnx)!==module.sha256)throw Error('Program model hash changed: '+module.name);models.set(module.name,{name:module.name,ir,onnx});}
  const definitions=structuredClone(BATTLE_DEFINITIONS),rows=cases.map((row,i)=>armCommandInput(row.case,i,definitions)),ort=await loadLocalOrt(ortDirectory),executor=createGraphExecutor({models,ortRuntime:ort,backend}),runner=await createCommonBattleRunner({program,definitions,getModel:name=>models.get(name)?.ir,runGraph:executor.runGraph});
  const report={schema:'dq9-common-command-arm-verification-v1',source:resolve(sourcePath),sourceSha256:hash(sourceBytes),romSha256:source.romSHA256,authority:source.method,cases:cases.length,fieldsCompared:0,mismatches:0,examples:[],backend,ortVersion:ort.env.versions.web,programHash:runner.programHash,runtimeSha256:hash(await readFile(resolve(root,'runtime/common-battle.mjs'))),scope:'Complete original action callers compared to the production shared command-effects boundary. The initial command and actor records are inputs. Planning, primary/post recovery, turn finish and cameras are outside this explicitly declared boundary. Expected endpoints and trace intermediates never initialize inference.'};
  try{
    const result=await runner.runCommandEffects({rows,maxTransitions:10000,trace:!!observedPath}),observations=[];
    cases.forEach((original,lane)=>{
      const got=result.rows[lane],observed={nextSeed:got.seed,nextPosition:[got.position],consumed:[got.position-1],supported:[Number(got.supported)],combo:got.combo.slice(0,4)},expected={nextSeed:seedBytes(original.nextState),nextPosition:[original.consumed+1],consumed:[original.consumed],supported:[1],combo:[original.comboSide,original.comboCount,original.comboAction,original.comboTarget]},actualRaw=original.case.enemies?[original.actors[0],...original.enemyActors]:original.actors;
      if(actualRaw.length!==got.actors.length)throw Error('Original final actor count differs from initialized roster');
      actualRaw.forEach((raw,i)=>{
        const b=Buffer.from(raw.statsRaw,'hex'),state=projectedActor(b),a=got.actors[i],wanted={...state,actor:ACTOR_FIELDS.map(key=>actorFromStats(rows[lane].actors[i].initialActor,b)[key])},actual={...a,history:[a.ai.revengeId,a.ai.previousId],rawStatusBytes:bytes(a.rawStatus),rawFlagsBytes:bytes(a.rawFlags),statusKindsBytes:bytes(a.statusKinds,2)};
        for(const key of['actor','aux','status','tension','preparation','history','wakeSkip','state3c','rawStatusBytes','rawFlagsBytes','statusKindsBytes','rawRanks','rawTimers']){expected['actor'+i+'.'+key]=Array.isArray(wanted[key])?wanted[key]:[wanted[key]];observed['actor'+i+'.'+key]=Array.isArray(actual[key])?actual[key]:[actual[key]];}
      });
      for(const[key,want]of Object.entries(expected))want.forEach((value,i)=>{report.fieldsCompared++;if(Number(value)!==Number(observed[key]?.[i])){report.mismatches++;if(report.examples.length<100)report.examples.push({id:original.case.id,key,index:i,expected:value,observed:observed[key]?.[i]});}});
      if(observedPath)observations.push({id:original.case.id,input:rows[lane],state:got,expected,observed,trace:result.traces[lane]});
    });
    report.complete=result.complete;report.unresolvedEffects=result.unresolvedEffects;report.passed=result.complete&&report.mismatches===0;report.counts={...executor.counts};report.moduleHashes=result.moduleHashes;
    if(observedPath)await writeFile(resolve(observedPath),JSON.stringify({report,cases:observations},null,2)+'\n');return report;
  }finally{await executor.release();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),options={ortDirectory:process.env.ORT_RUNTIME_DIR},keys={'--source':'sourcePath','--program':'programPath','--ort-dir':'ortDirectory','--backend':'backend','--observed-out':'observedPath','--only-id':'onlyId','--limit':'limit'};let out;
  for(let i=0;i<args.length;i++){if(args[i]==='--out')out=args[++i];else if(keys[args[i]])options[keys[args[i]]]=args[++i];else throw Error('Unknown option '+args[i]);}
  if(!options.sourcePath)throw Error('Use --source STRICT_ARM_RESPONSE --ort-dir EXISTING_ORT_DIST [--program COMMON_PROGRAM]');
  const report=await verifyCommonCommandRom(options),text=JSON.stringify(report,null,2)+'\n';if(out)await writeFile(resolve(out),text);console.log(text);if(!report.passed)process.exitCode=1;
}
