#!/usr/bin/env node
// Read actual strict ARM callback executions. Only case inputs are projected
// into the ONNX model; observed ROM outputs are used exclusively for comparison.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=value=>createHash('sha256').update(typeof value==='string'||ArrayBuffer.isView(value)?value:JSON.stringify(value)).digest('hex');
const seedBytes=value=>Array.from({length:8},(_,i)=>Number((BigInt(value)>>BigInt(i*8))&255n));
const wordBytes=value=>Array.from({length:4},(_,i)=>(Number(value)>>>i*8)&255);
const ranks=value=>Array.from({length:10},(_,i)=>{const v=Number(value)>>>i*3&7;return v>=4?v-8:v;});
const status=a=>((a.status??0)|((a.hp??100)===0?1:0)|((a.hpRegen??0)?0x80000000:0)|((a.mpRegen??0)?0x40000000:0)|((a.poison??0)?2:0))>>>0;

export function projectSmartTargetCase(c){
  if(!['smart_target','summon_target'].includes(c.kind)||![46,47,56,72,79,80,81,90,116,147,159].includes(c.selector))throw Error('This initial-memory adapter supports smart_target callbacks46/47/56/72/79/80/81/90/116/147/159 only');
  if(!Array.isArray(c.party)||c.party.length>4||(c.enemies?.length??0)>8)throw Error('Initial roster exceeds the explicit ROM population');
  const initialOrder=c.partyOrder??[0,1,2,3],order=[...initialOrder,...[0,1,2,3].filter(id=>!initialOrder.includes(id))];
  if(order.length!==4||new Set(order).size!==4||order.some(id=>id<0||id>3))throw Error('partyOrder must contain distinct ROM party IDs');
  const party=order.map(id=>c.party[id]??{}),partyRank=a=>ranks(a.ranksPacked??(((a.defenseRank??0)&7)<<3|((a.agilityRank??0)&7)<<6));
  const initialSource={...(c.actors?.[1]??{}),flags18:(c.sourceFlags18??0)|(Object.hasOwn(c,'anger')?0x1000:0),angerTarget:c.anger??-1,present:c.sourcePresent??1};
  const roster=c.enemies??[initialSource],enemies=Array.from({length:8},(_,i)=>roster[i]??(i===0?initialSource:{}));
  const sourceId=c.sourceId??192,actor=sourceId<4?c.party[sourceId]??{}:enemies[sourceId-192];
  if(!actor)throw Error('Source object is outside the represented lookup population');
  const actorFlags=actor.flags18??0,enemyPresent=enemies.map((a,i)=>(i<roster.length||i===0)&&(a.present??1)!==0);
  return{
    seed:seedBytes(c.seed),position:[1],selectorIndex:[c.selector],enabled:[true],repeatCode:[c.repeatMode??0],ids:order,
    hp:party.map(a=>a.hp??100),present:party.map(a=>(a.present??1)!==0),candidate:order.map(id=>id<c.party.length&&initialOrder.includes(id)),dead:party.map(a=>!!(status(a)&1)),excluded:party.map(a=>!!((a.flags18??0)&0x2000)),
    baseHalf:party.map(a=>!!a.backrow),attracted:party.map(a=>!!(status(a)&0x08000000)),status26:party.map(a=>!!(status(a)&0x04000000)),status9:party.map(a=>!!(status(a)&0x200)),asleep:party.map(a=>!!(status(a)&16)),paralyzed:party.map(a=>!!(status(a)&8)),
    defense:party.map(a=>a.defense??1),agility:party.map(a=>a.agility??1),defenseRank:party.map(a=>partyRank(a)[1]),agilityRank:party.map(a=>partyRank(a)[2]),
    partyStatusBytes:party.flatMap(a=>wordBytes(status(a))),partyFlagBytes:party.flatMap(a=>wordBytes(a.flags18??0)),partyRankFields:party.flatMap(partyRank),
    partyMp:party.map(a=>a.mp??10),partyAuxiliaryPresent:party.map((a,i)=>Object.hasOwn(a,'spellKnowledge')||order[i]===0),partyAuxiliaryBytes:party.flatMap(a=>a.spellKnowledge??Array(9).fill(0)),
    actorId:[sourceId],actorPresent:[sourceId<4?(actor.present??1)!==0:enemyPresent[sourceId-192]],actorType400:[sourceId>=192],actorDead:[!!(status(actor)&1)],actorExcluded:[!!(actorFlags&0x2000)],actorParalyzed:[!!(status(actor)&8)],actorBlind:[!!(status(actor)&0x40)],
    actorStatusBytes:wordBytes(status(actor)),actorFlagBytes:wordBytes(actorFlags),actorAttack:[c.sourceAttack??actor.attack??0],actorDefense:[actor.defense??0],actorGroup:[actor.group??0],actorHp:[actor.hp??100],actorMaxHp:[actor.maxHp??100],rageEnabled:[!!(actorFlags&0x1000)],rageId:[actor.angerTarget??-1],priorityEnabled:[!!c.preferRecent],revengeId:[c.lastAttacker??-1],previousId:[c.previousAttacker??-1],
    enemyIds:Array.from({length:8},(_,i)=>192+i),enemyPresent,enemyCandidate:enemies.map((_,i)=>i<roster.length),enemyDead:enemies.map(a=>!!(status(a)&1)),enemyExcluded:enemies.map(a=>!!((a.flags18??0)&0x2000)),enemyGroups:enemies.map(a=>a.group??0),enemyGroupCount:[roster.reduce((n,a)=>Math.max(n,(a.group??0)+1),0)],
    enemyDefense:enemies.map(a=>a.defense??0),enemyDefenseRank:enemies.map(a=>ranks(a.ranksPacked??0)[1]),enemyBarrierRank:enemies.map(a=>ranks(a.ranksPacked??0)[6]),enemyStatus9:enemies.map(a=>!!(status(a)&0x200)),
    enemyOriginalMonsterIds:enemies.map(a=>a.monsterId??1),enemyCoverSources:enemies.map(a=>a.coverById??-1),enemyHp:enemies.map(a=>a.hp??100),enemyMaxHp:enemies.map(a=>a.maxHp??100),actorBarrierRank:[ranks(actor.ranksPacked??0)[6]],actorBreathJudgment:[!!((actor.statBytes?.['0x3c']??actor.statBytes?.['60']??0)&4)],enemyBreathBarrierRank:enemies.map(a=>ranks(a.ranksPacked??0)[7]),
    previousTargetCount:[c.previousCount??3],previousTargets:c.previousTargets??Array.from({length:8},(_,i)=>70+i)
  };
}

function populationInitial(r){
  if(r.case.selector!==116)return{};
  const p=r.beforePopulation,c=r.case;if(!p)throw Error('Population callback requires observed pre-entry initial memory');
  const raw=Array.from(Buffer.from(p.rosterRaw,'hex')),action=Buffer.from(c.actionRaw,'hex'),source=p.actors[(c.sourceId??192)-192];
  return{candidateActionId:[action.readUInt32LE(4)&4095],candidateOperation:[action.readUInt32LE(24)>>>5&127],populationContextAvailable:[true],populationBtPresent:[c.btPresent!==0],populationLiveCount:[raw[1]&15],populationGroupCount:[raw[1]>>>4&3],populationGroupMonsterIds:Array.from({length:3},(_,i)=>raw[4+i*24]|raw[5+i*24]<<8),populationGroupLiveCounts:Array.from({length:3},(_,i)=>raw[14+i*24]>>>4),populationLoadedMonsterIds:Array.from({length:4},(_,i)=>c.loadedMonsterIds[i]??-1),actorOriginalMonsterId:[source?.monsterId??-1]};
}

export async function verifyCommonTargetCallbacks({sourcePath,ortDirectory,backend='onnxruntime-wasm',observedPath,modelsDirectory=resolve(root,'graph-v2')}={}){
  if(!sourcePath)throw Error('Supply --source with a complete strict ARM response artifact');
  const bytes=await readFile(resolve(sourcePath)),source=JSON.parse(bytes);
  if(source.executionComplete!==true||source.programUnmodified!==true||!source.results?.length||source.results.some(r=>!r.ok||!r.strictInitializedMemory))throw Error('Incomplete, modified or non-strict ARM evidence');
  const ort=await loadLocalOrt(ortDirectory),models=new Map();
  for(const name of['rom-common-ai-target','rom-common-ai-step']){
    const irBytes=await readFile(resolve(modelsDirectory,name+'.json')),onnx=await readFile(resolve(modelsDirectory,name+'.onnx'));
    models.set(name,{name,ir:JSON.parse(irBytes),onnx,sha256:hash(onnx),irSha256:hash(irBytes)});
  }
  const executor=createGraphExecutor({models,backend,ortRuntime:ort}),reports=[],observations=[];
  try{
    for(const[name,model]of models){
      const closed=name.endsWith('-step'),inputs=source.results.map(r=>{
        const row={...Object.fromEntries(model.ir.inputs.map(d=>{const v=model.ir.contract.defaults[d.name];if(v===undefined)throw Error(name+': missing default '+d.name);return[d.name,Array.isArray(v)?[...v]:[v]];})),...projectSmartTargetCase(r.case),...populationInitial(r)};
        if(closed){
          Object.assign(row,{initialized:[false],attempt:[0],phase:[0],selectedAction:[-1],selectedSlot:[-1],scheme:[3],judgment:[2],actorCursor:[0],groupCursor:[0],actionIds:Array(6).fill(1),mpCosts:Array(6).fill(0),operations:Array(6).fill(1),spell:Array(6).fill(false),ability:Array(6).fill(false),limited:Array(6).fill(false),usedSlots:Array(6).fill(false),smartTarget:Array(6).fill(r.case.selector),wiseTarget:Array(6).fill(r.case.selector),targetSide:Array(6).fill(1),targetScope:Array(6).fill(3),repeatCode:Array(6).fill(r.case.repeatMode??0)});
          delete row.selectorIndex;
          if(r.case.selector===116){row.actionIds=Array(6).fill(row.candidateActionId[0]);row.operations=Array(6).fill(row.candidateOperation[0]);}
        }
        return Object.fromEntries(model.ir.inputs.map(d=>[d.name,row[d.name]]));
      });
      const outputs=await executor.runGraph(name,inputs),report={name,sha256:model.sha256,irSha256:model.irSha256,cases:inputs.length,fieldsCompared:0,mismatches:0,bySelector:{},examples:[]};
      source.results.forEach((r,i)=>{
        const expected={nextSeed:seedBytes(r.nextState),nextPosition:[1+r.consumed],consumed:[r.consumed],targetCount:[r.targetCount],targets:r.targets,supported:[1]};
        if(closed)Object.assign(expected,{finished:[+!!r.integerResult],targetInvoked:[1],eligibilityCallbackInvoked:[1]});else expected.callbackSuccess=[+!!r.integerResult];
        const tally=report.bySelector[r.case.selector]??={cases:0,fieldsCompared:0,mismatches:0};tally.cases++;
        for(const[key,want]of Object.entries(expected))want.forEach((value,j)=>{
          report.fieldsCompared++;tally.fieldsCompared++;
          if(Number(value)!==Number(outputs[i][key]?.[j])){report.mismatches++;tally.mismatches++;if(report.examples.length<40)report.examples.push({id:r.case.id,key,index:j,expected:value,observed:outputs[i][key]?.[j]});}
        });
        if(observedPath)observations.push({id:r.case.id,model:name,inputs:inputs[i],expected,observed:outputs[i]});
      });reports.push(report);
    }
    const report={schema:'dq9-common-target-arm-verification-v1',passed:reports.every(r=>r.mismatches===0),authority:source.method,romSha256:source.romSHA256,source:resolve(sourcePath),sourceSha256:hash(bytes),actualArmCases:source.results.length,backend,ortVersion:ort.env.versions.web,counts:executor.counts,models:reports,fieldsCompared:reports.reduce((n,r)=>n+r.fieldsCompared,0),mismatches:reports.reduce((n,r)=>n+r.mismatches,0),scope:'All actual strict ARM input cases are used unfiltered. Target callback output and a controlled no-draw scheme3 AI-step composition are compared. The latter is composition regression, not a second ARM whole-AI execution. No expected endpoint is fed into any input.'};
    if(observedPath)await writeFile(resolve(observedPath),JSON.stringify({report,cases:observations},null,2)+'\n');
    return report;
  }finally{await executor.release();}
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),options={ortDirectory:process.env.ORT_RUNTIME_DIR};let out;
  const keys={'--source':'sourcePath','--ort-dir':'ortDirectory','--backend':'backend','--observed-out':'observedPath','--models-dir':'modelsDirectory'};
  for(let i=0;i<args.length;i++){if(args[i]==='--out')out=args[++i];else if(keys[args[i]])options[keys[args[i]]]=args[++i];else throw Error('Unknown option: '+args[i]);}
  const report=await verifyCommonTargetCallbacks(options);if(out)await writeFile(resolve(out),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
}
