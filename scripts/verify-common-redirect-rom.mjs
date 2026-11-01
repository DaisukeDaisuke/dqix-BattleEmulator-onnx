#!/usr/bin/env node
// Strict ARM initial-memory projection; observed endpoints only compare.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BATTLE_DEFINITIONS,seedBytes} from '../data/common-battle.mjs';
import {ACTOR_FIELDS} from '../graph-v2/rules.mjs';
import {projectCoverCase} from './verify-common-cover-rom.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function projectRedirectCase(c){
  if(!['redirect_target','reflection_target'].includes(c.kind))throw Error('Expected original redirect helper evidence');
  const party=projectCoverCase({...c,kind:'cover_target',targetId:0}),enemy=projectCoverCase({...c,kind:'cover_target',targetId:192}),sourceId=c.sourceId??192,targetId=c.targetId??0,idIndex=ACTOR_FIELDS.indexOf('id'),defendIndex=ACTOR_FIELDS.indexOf('defend');
  let slot=-1;for(let i=0;i<12;i++)if(party.actors[i*33+idIndex]===targetId)slot=i;
  const action=BATTLE_DEFINITIONS.actions[c.actionId],bytes=Buffer.from(action.raw,'hex'),word10=c.actionFlags??bytes.readUInt32LE(16),source=sourceId<4?c.party[sourceId]:c.enemies[sourceId-192],target=(targetId<4?c.party[targetId]:c.enemies[targetId-192])??{};
  return{seed:seedBytes(c.seed),position:[1],enabled:[true],sourceId:[sourceId],targetId:[targetId],targetPresent:[slot>=0&&party.actorPresent[slot]],hitPresent:[c.hitPresent===undefined?!c.missingHit:!!c.hitPresent],
    targetRawStatusBytes:slot>=0?party.rawStatusBytes.slice(slot*4,slot*4+4):[0,0,0,0],targetRawFlagsBytes:slot>=0?party.rawFlagBytes.slice(slot*4,slot*4+4):[0,0,0,0],targetDefend:[slot>=0?party.actors[slot*33+defendIndex]:0],
    actionId:[c.actionId],targetSide:[c.targetSide??action.targetSide],magicReflectable:[!!(word10&0x400)],breathReflectable:[!!(word10&4)],counterable:[!!(word10&0x80)],sourceWideWeapon:[sourceId<4&&!!((source?.weaponWide??source?.weaponBits??0)&3)],
    targetMagicReflectEquipment:[!!target.equipmentReflect],targetCounterSkill:[!!target.counterSkill],targetJob:[target.job??1],scenarioId:[c.scriptRestricted?0x320:c.scenarioId??0],sharedRoll:[c.sharedRoll??0],priorCounterState:[c.priorCounterState??c.counterState??0],priorRedirectTarget:[c.priorRedirectTarget??c.cachedTarget??-1],allowTension:[!!(c.allowTension??1)],substitute:[!!(c.substitute??c.redirected)],specialReflect:[!!(c.specialReflect??c.spellReflected)],
    partyRosterIds:party.rosterIds.slice(0,4),partyRosterCount:party.rosterCount,enemyRosterIds:enemy.rosterIds,enemyRosterCount:enemy.rosterCount};
}
export async function verifyCommonRedirectRom({sourcePath,ortDirectory,backend='onnxruntime-wasm',observedPath}={}){
  const bytes=await readFile(resolve(sourcePath)),source=JSON.parse(bytes);
  if(!source.executionComplete||!source.programUnmodified||source.romSHA256!==BATTLE_DEFINITIONS.romSha256||!source.results?.length||source.results.some(r=>!r.ok||!r.strictInitializedMemory))throw Error('Complete unmodified strict ARM response required');
  const name='rom-common-redirect-target',irBytes=await readFile(resolve(root,'graph-v2',name+'.json')),onnx=await readFile(resolve(root,'graph-v2',name+'.onnx')),ir=JSON.parse(irBytes),ort=await loadLocalOrt(ortDirectory),executor=createGraphExecutor({models:new Map([[name,{name,ir,onnx}]]),ortRuntime:ort,backend});
  const report={schema:'dq9-common-redirect-arm-verification-v1',source:resolve(sourcePath),sourceSha256:hash(bytes),romSha256:source.romSHA256,authority:source.method,model:{name,sha256:hash(onnx),irSha256:hash(irBytes)},cases:source.results.length,fieldsCompared:0,mismatches:0,examples:[],backend,ortVersion:ort.env.versions.web,
    scope:'Every strict original redirect-helper case. Ordered roster, equipment property, counter skill and job projection uses only initial actor state; no observed endpoint enters inference. Full command routing is a separate proof.'};
  try{
    const inputs=source.results.map(r=>projectRedirectCase(r.case)),outputs=await executor.runGraph(name,inputs),observations=[];
    source.results.forEach((r,i)=>{
      const expected={nextSeed:seedBytes(r.nextState),nextPosition:[1+r.consumed],consumed:[r.consumed],nextSourceId:[r.nextSourceId],nextTargetId:[r.nextTargetId],nextCounterState:[r.nextCounterState],nextRedirectTarget:[r.nextRedirectTarget??r.nextCachedTarget],nextAllowTension:[r.allowTension??r.nextAllowTension],nextSubstitute:[r.substitute??r.nextRedirected],nextSpecialReflect:[r.specialReflect??r.nextSpellReflected],counter:[r.integerResult],supported:[1]},observed={...outputs[i]};
      if(r.case.kind==='reflection_target'){
        let count=r.case.routeCount??0;const routeIds=[71,72,73],routeKinds=[11,12,13];
        if(observed.routeCount[0]&&count<3){routeIds[count]=observed.routeTargetId[0];routeKinds[count]=observed.routeKind[0];count++;}
        Object.assign(expected,{routeCount:[r.routeCount],routeIds:r.routeIds,routeKinds:r.routeKinds});Object.assign(observed,{routeCount:[count],routeIds,routeKinds});
      }else Object.assign(expected,{routeKind:[r.routeKind],routeTargetId:[r.routeTargetId],routeCount:[r.routeCount]});
      for(const[key,want]of Object.entries(expected))want.forEach((value,j)=>{report.fieldsCompared++;if(Number(value)!==Number(observed[key]?.[j])){report.mismatches++;if(report.examples.length<60)report.examples.push({id:r.case.id,key,index:j,expected:value,observed:observed[key]?.[j]});}});
      if(observedPath)observations.push({id:r.case.id,input:inputs[i],expected,observed});
    });
    report.passed=report.mismatches===0;report.counts={...executor.counts};if(observedPath)await writeFile(resolve(observedPath),JSON.stringify({report,cases:observations},null,2)+'\n');return report;
  }finally{await executor.release();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),options={ortDirectory:process.env.ORT_RUNTIME_DIR},keys={'--source':'sourcePath','--ort-dir':'ortDirectory','--backend':'backend','--observed-out':'observedPath'};let out;
  for(let i=0;i<args.length;i++){if(args[i]==='--out')out=args[++i];else if(keys[args[i]])options[keys[args[i]]]=args[++i];else throw Error('Unknown option '+args[i]);}
  if(!options.sourcePath)throw Error('Use --source STRICT_ARM_RESPONSE --ort-dir EXISTING_ORT_DIST');
  const report=await verifyCommonRedirectRom(options),content=JSON.stringify(report,null,2)+'\n';if(out)await writeFile(resolve(out),content);console.log(content);if(!report.passed)process.exitCode=1;
}
