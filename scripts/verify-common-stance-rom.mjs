#!/usr/bin/env node
// Actual original stance handlers supplied as private strict ARM evidence.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import rom from '../restored/dq9-unified/data/rom.mjs';
import {COMMON_AUX_FIELDS} from '../graph-v2/common-battle-schema.mjs';
import {buildCommonStanceCreation} from '../graph-v2/common-stance-rules.mjs';
import {commonArmActorTableInput,projectedActor} from '../graph-v2/verify-common-action-arm.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),timerFields=['doubleDodgeDuration','doubleDodgeRecovery','doubleGuardDuration','doubleGuardRecovery'],timers=a=>timerFields.map(field=>a.aux[COMMON_AUX_FIELDS.indexOf(field)]);
export async function verifyCommonStanceRom({sourcePath,ortDirectory}={}){
  const bytes=await readFile(resolve(sourcePath)),source=JSON.parse(bytes);
  if(!source.executionComplete||!source.programUnmodified||source.romSHA256!==rom.romSha256||!source.results?.length||source.results.some(r=>!r.ok||!r.strictInitializedMemory))throw Error('Complete unmodified strict ARM evidence required');
  const graph=buildCommonStanceCreation(),ir=graph.json(),onnx=graph.model(),ort=await loadLocalOrt(ortDirectory),executor=createGraphExecutor({models:new Map([[graph.name,{name:graph.name,ir,onnx}]]),ortRuntime:ort,backend:'onnxruntime-wasm'}),actions=new Map(rom.actions.map(a=>[a.id,a]));
  const report={schema:'dq9-common-stance-arm-verification-v1',source:resolve(sourcePath),sourceSHA256:hash(bytes),romSHA256:rom.romSha256,model:{name:graph.name,sha256:hash(onnx)},backend:'onnxruntime-wasm',ortVersion:ort.env.versions.web,cases:source.results.length,fieldsCompared:0,mismatches:0,examples:[],scope:'Original operation25/37 body state and zero RNG. Initial signed16 parameter overrides are explicit fixture data. Expected memory is comparison-only; all other supplied raw flags/ranks/timer fields are preserved by the graph.'};
  try{
    const inputs=source.results.map(({case:c})=>{
      const action=actions.get(c.actionId);if(c.kind!=='stance_creation'||!action||action.raw!==c.actionRaw)throw Error('Unexpected original body/record');
      const actor=commonArmActorTableInput({...c,kind:'normal_action'}).actors[c.sourceIndex??0];
      return{operation:[action.operation],parameter:[c.parameterOverride??Buffer.from(action.raw,'hex').readInt16LE(48)],hit:[(c.operationHit??1)!==0],present:[!c.missingTarget],rawStatusBytes:actor.rawStatusBytes,rawFlagsBytes:actor.rawFlagsBytes,rawRanks:actor.rawRanks,stanceTimers:timers(actor)};
    }),outputs=await executor.runGraph(graph.name,inputs);
    const compare=(id,key,actual,expected)=>{report.fieldsCompared++;if(actual!==expected){report.mismatches++;if(report.examples.length<80)report.examples.push({id,key,actual,expected});}};
    source.results.forEach((row,i)=>{
      const state=projectedActor(Buffer.from(row.actors[row.case.sourceIndex??0].statsRaw,'hex')),expected={rawStatusBytes:state.rawStatusBytes,rawFlagsBytes:state.rawFlagsBytes,rawRanks:state.rawRanks,stanceTimers:timers(state)};
      for(const[key,values]of Object.entries(expected))values.forEach((value,j)=>compare(row.case.id,key+'['+j+']',Number(outputs[i]['next'+key[0].toUpperCase()+key.slice(1)]?.[j]),value));
      compare(row.case.id,'original.consumed',row.consumed,0);compare(row.case.id,'original.seed',BigInt(row.nextState).toString(),BigInt(row.case.seed).toString());
    });
    report.counts={...executor.counts};report.passed=report.mismatches===0;return report;
  }finally{await executor.release();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),options={ortDirectory:process.env.ORT_RUNTIME_DIR};let output;
  for(let i=0;i<args.length;i++){if(args[i]==='--source')options.sourcePath=args[++i];else if(args[i]==='--ort-dir')options.ortDirectory=args[++i];else if(args[i]==='--out')output=args[++i];else throw Error('Unknown argument '+args[i]);}
  if(!options.sourcePath)throw Error('Use --source STRICT_ARM_RESPONSE --ort-dir EXISTING_ORT_DIST');const report=await verifyCommonStanceRom(options),text=JSON.stringify(report,null,2)+'\n';if(output)await writeFile(resolve(output),text);console.log(text);if(!report.passed)process.exitCode=1;
}
