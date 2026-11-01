#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import rom from '../restored/dq9-unified/data/rom.mjs';
import {buildCommonPopulationInsert,COMMON_POPULATION_PENDING_FIELDS} from '../graph-v2/build-common-population.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),raw=(hex,width)=>{const bytes=Array.from(Buffer.from(hex,'hex'));if(bytes.length!==width)throw Error('Incorrect original initial/final byte width');return bytes;};
const seedBytes=value=>Array.from({length:8},(_,i)=>Number(BigInt(value)>>BigInt(8*i)&255n));
const pendingKeys=['pendingMonsterId','pendingHp','pendingMp','pendingGroup','pendingLetter'];
function countDraws(initial,final){let seed=BigInt(initial),target=BigInt(final);for(let n=0;n<=256;n++){if(seed===target)return n;seed=BigInt.asUintN(64,seed*0x5d588b656c078965n+0x269ec3n);}throw Error('Original random state exceeds narrow probe bound');}
export async function verifyCommonPopulationRom({sourcePath,ortDirectory}={}){
  const bytes=await readFile(resolve(sourcePath)),source=JSON.parse(bytes);
  if(!source.executionComplete||!source.programUnmodified||source.romSHA256!==rom.romSha256||!source.results?.length||source.results.some(row=>!row.ok||!row.strictInitializedMemory))throw Error('Require complete unmodified strict original ARM evidence');
  const originals=source.results.filter(row=>row.case.kind==='summon_population');if(!originals.length)throw Error('No original population helpers');
  const graph=buildCommonPopulationInsert(),ir=graph.json(),onnx=graph.model(),ort=await loadLocalOrt(ortDirectory),executor=createGraphExecutor({models:new Map([[graph.name,{name:graph.name,ir,onnx}]]),ortRuntime:ort,backend:'onnxruntime-wasm'}),report={schema:'dq9-common-population-arm-verification-v1',source:resolve(sourcePath),sourceSHA256:hash(bytes),romSHA256:source.romSHA256,model:{name:graph.name,sha256:hash(onnx),nodes:ir.nodes.length,bytes:onnx.length},backend:'onnxruntime-wasm',ortVersion:ort.env.versions.web,cases:originals.length,excludedInitialKinds:source.results.length-originals.length,fieldsCompared:0,mismatches:0,examples:[],scope:'Complete original population helper only. Raw initial actor/roster readback is captured before the first original instruction; definitions, resource availability and seeds come from the initial request. No post-entry intermediate or final output is a graph input. Enclosing command callers are retained for independent integration verification.'};
  try{
    const rows=originals.map(({case:c,beforePopulation:before})=>{
      if(BigInt(before.contextRandomState)!==BigInt(c.seed)||BigInt(before.globalRandomState)!==BigInt(c.globalSeed)||before.actors.length!==8)throw Error('Initial population snapshot does not agree with supplied random state');
      const id=c.spawnMonsterId,definition=(c.allMonsterRecords??[]).find(hex=>(Buffer.from(hex,'hex').readUInt16LE(0)&0x7fff)===id),auxiliary=(c.allMonsterAuxRecords??[]).some(hex=>Buffer.from(hex,'hex').readUInt16LE(8)===id),actors=before.actors;
      return{seed:seedBytes(c.seed),position:[1],globalSeed:seedBytes(c.globalSeed),globalPosition:[1],enabled:[true],monsterId:[id],requestedGroup:[c.spawnGroup??-1],resourceLoaded:[(c.loadedMonsterIds??[]).includes(id)],definitionPresent:[!!definition],auxiliaryPresent:[auxiliary],definitionRaw:definition?raw(definition,132):Array(132).fill(0),rosterRaw:raw(before.rosterRaw,108),actorPresent:actors.map(a=>Number(a.present)),actorSpawnPending:actors.map(a=>a.spawnPending??0),actorMonsterIds:actors.map(a=>a.monsterId??0),actorGroups:actors.map(a=>a.group??0),actorRawStats:actors.flatMap(a=>a.present?raw(a.statsRaw,164):Array(164).fill(0)),storageRawStats:before.storageRaw?raw(before.storageRaw,1312):Array(1312).fill(0),...Object.fromEntries(COMMON_POPULATION_PENDING_FIELDS.map((name,i)=>[name,actors.map(a=>a[pendingKeys[i]]??0)]))};
    }),outputs=await executor.runGraph(graph.name,rows);
    originals.forEach((original,i)=>{
      const c=original.case,pop=original.population,actual=outputs[i],expected={supported:[1],actorId:[original.integerResult],nextSeed:seedBytes(original.nextState),nextPosition:[1+original.consumed],nextGlobalSeed:seedBytes(pop.globalRandomState),nextGlobalPosition:[1+countDraws(c.globalSeed,pop.globalRandomState)],consumed:[original.consumed],globalConsumed:[countDraws(c.globalSeed,pop.globalRandomState)],nextRosterRaw:raw(pop.rosterRaw,108),nextActorPresent:pop.actors.map(a=>Number(a.present)),nextActorSpawnPending:pop.actors.map(a=>a.spawnPending??0),nextActorMonsterIds:pop.actors.map(a=>a.monsterId??0),nextActorGroups:pop.actors.map(a=>a.group??0),nextActorRawStats:pop.actors.flatMap(a=>a.present?raw(a.statsRaw,164):Array(164).fill(0)),...Object.fromEntries(COMMON_POPULATION_PENDING_FIELDS.map((name,j)=>['next'+name[0].toUpperCase()+name.slice(1),pop.actors.map(a=>a[pendingKeys[j]]??0)]))};
      if(pop.storageRaw)expected.nextStorageRawStats=raw(pop.storageRaw,1312);
      for(const[name,wanted]of Object.entries(expected))for(let j=0;j<wanted.length;j++){report.fieldsCompared++;if(Number(actual[name]?.[j])!==Number(wanted[j])){report.mismatches++;if(report.examples.length<120)report.examples.push({id:c.id,name,index:j,expected:wanted[j],actual:actual[name]?.[j]});}}
    });
    report.counts={...executor.counts};report.passed=report.mismatches===0;return report;
  }finally{await executor.release();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),options={ortDirectory:process.env.ORT_RUNTIME_DIR};let output;for(let i=0;i<args.length;i++){if(args[i]==='--source')options.sourcePath=args[++i];else if(args[i]==='--ort-dir')options.ortDirectory=args[++i];else if(args[i]==='--out')output=args[++i];else throw Error('Unknown argument '+args[i]);}
  if(!options.sourcePath)throw Error('Use --source STRICT_ARM_RESPONSE --ort-dir EXISTING_ORT_DIST');const report=await verifyCommonPopulationRom(options),text=JSON.stringify(report,null,2)+'\n';if(output)await writeFile(resolve(output),text);console.log(text);if(!report.passed)process.exitCode=1;
}
