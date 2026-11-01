#!/usr/bin/env node
// Compare the common post-status ONNX to explicitly sequenced real ARM
// recovery and duration calls. Expected memory never initializes inference.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import rom from '../restored/dq9-unified/data/rom.mjs';
import {ACTOR_FIELDS} from '../graph-v2/common-battle-schema.mjs';
import {buildCommonPostStatus} from '../graph-v2/build-common-control.mjs';
import {actorFromStats,projectedActor,commonArmActorTableInput} from '../graph-v2/verify-common-action-arm.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const seedBytes=value=>Array.from({length:8},(_,i)=>Number(BigInt(value)>>BigInt(8*i)&255n));
export async function verifyCommonModifierRom({sourcePath,ortDirectory,backend='onnxruntime-wasm',observedPath}={}){
  const sourceBytes=await readFile(resolve(sourcePath)),source=JSON.parse(sourceBytes);
  if(!source.executionComplete||!source.programUnmodified||source.romSHA256!==rom.romSha256||!source.results?.length||source.results.some(r=>!r.ok||!r.strictInitializedMemory))throw Error('Complete unmodified strict ARM evidence is required');
  const graph=buildCommonPostStatus(),ir=graph.json(),onnx=graph.model(),ort=await loadLocalOrt(ortDirectory),executor=createGraphExecutor({models:new Map([[graph.name,{name:graph.name,ir,onnx}]]),ortRuntime:ort,backend});
  const report={schema:'dq9-common-modifier-arm-verification-v1',source:resolve(sourcePath),sourceSha256:hash(sourceBytes),romSha256:source.romSHA256,model:{name:graph.name,sha256:hash(onnx)},backend,ortVersion:ort.env.versions.web,cases:source.results.length,fieldsCompared:0,mismatches:0,examples:[],scope:'Original ARM status recovery followed by original ARM duration decrement. Only each case initial RAM definition initializes the ONNX input; final raw memory is comparison-only. Covered modifiers are Force, fire/ice shields and magic/breath barriers, interleaved with the typed statuses.'};
  try{
    const initials=source.results.map(({case:c})=>{
      if(c.kind!=='primary_post'||c.includeDurationTick!==1)throw Error(c.id+': require explicit original recovery+duration helper sequence');
      const projected=commonArmActorTableInput({...c,kind:'normal_action'}),actor=projected.actors[c.sourceIndex??0];
      return{actor,inputs:{seed:seedBytes(c.seed),position:[1],enabled:[true],present:[!c.missingActor],actor:actor.actor,aux:actor.aux,status:actor.status,preparation:actor.preparation,rawStatusBytes:actor.rawStatusBytes,rawFlagBytes:actor.rawFlagsBytes,rawRanks:actor.rawRanks,statusKindsBytes:actor.statusKindsBytes,rawTimers:actor.rawTimers,targetValid:[true]}};
    }),outputs=await executor.runGraph(graph.name,initials.map(row=>row.inputs)),observations=[];
    source.results.forEach((result,i)=>{
      const b=Buffer.from(result.actors[result.case.sourceIndex??0].statsRaw,'hex'),state=projectedActor(b),actor=actorFromStats(initials[i].actor.initialActor,b),expected={nextSeed:seedBytes(result.nextState),nextPosition:[1+result.consumed],consumed:[result.consumed],nextActor:ACTOR_FIELDS.map(name=>actor[name]),nextAux:state.aux,nextStatus:state.status,nextPreparation:state.preparation,nextRawStatusBytes:state.rawStatusBytes,nextRawFlagBytes:state.rawFlagsBytes,nextRawRanks:state.rawRanks,nextStatusKindsBytes:state.statusKindsBytes,nextRawTimers:state.rawTimers};
      for(const[key,values]of Object.entries(expected))values.forEach((value,j)=>{report.fieldsCompared++;if(Number(value)!==Number(outputs[i][key]?.[j])){report.mismatches++;if(report.examples.length<80)report.examples.push({id:result.case.id,key,index:j,expected:value,observed:outputs[i][key]?.[j]});}});
      if(observedPath)observations.push({id:result.case.id,input:initials[i].inputs,expected,observed:outputs[i]});
    });
    report.passed=report.mismatches===0;report.counts={...executor.counts};
    if(observedPath)await writeFile(resolve(observedPath),JSON.stringify({report,cases:observations},null,2)+'\n');return report;
  }finally{await executor.release();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),options={ortDirectory:process.env.ORT_RUNTIME_DIR};let output;
  const keys={'--source':'sourcePath','--ort-dir':'ortDirectory','--backend':'backend','--observed-out':'observedPath'};
  for(let i=0;i<args.length;i++){if(args[i]==='--out')output=args[++i];else if(keys[args[i]])options[keys[args[i]]]=args[++i];else throw Error('Unknown option '+args[i]);}
  if(!options.sourcePath)throw Error('Use --source STRICT_ARM_RESPONSE --ort-dir EXISTING_ORT_DIST');
  const report=await verifyCommonModifierRom(options),text=JSON.stringify(report,null,2)+'\n';if(output)await writeFile(resolve(output),text);console.log(text);if(!report.passed)process.exitCode=1;
}
