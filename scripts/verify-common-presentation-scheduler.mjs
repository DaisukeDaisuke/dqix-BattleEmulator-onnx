#!/usr/bin/env node
// Inputs are reconstructed exclusively from each strict ARM case's initial data.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildCommonPresentationCompletion,buildCommonPresentationDelay} from '../graph-v2/build-common-presentation-scheduler.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
export async function verifyCommonPresentationScheduler({sourcePath,ortDirectory}={}){
  if(!sourcePath)throw Error('Supply --source with original ARM scheduler evidence');
  const bytes=await readFile(resolve(sourcePath)),source=JSON.parse(bytes);
  if(!source.executionComplete||!source.programUnmodified||!source.results?.length||source.results.some(r=>!r.ok||!r.strictInitializedMemory))throw Error('Only complete unmodified strict ARM evidence is admitted');
  const models=new Map(),builds=[buildCommonPresentationCompletion(),buildCommonPresentationDelay()];
  for(const graph of builds){const onnx=graph.model(),ir=graph.json();models.set(graph.name,{name:graph.name,ir,onnx,sha256:hash(onnx)});}
  const executor=createGraphExecutor({models,backend:'onnxruntime-wasm',ortRuntime:await loadLocalOrt(ortDirectory)}),reports=[];
  try{
    for(const[name,model]of models){
      const completion=name.endsWith('-completion'),records=source.results.filter(r=>completion?['script_complete','controller_complete','timeline_complete'].includes(r.case.kind):r.case.kind==='script_update');
      if(!records.length)throw Error('No actual ARM cases for '+name);
      const inputs=records.map(({case:c})=>completion?{
        cursorPresent:[!!c.cursorPresent],controllerActive:[c.controllerActive??0],controllerWait:[c.controllerWait??0],timelineCount:[c.timelineCount??0]
      }:{delay:[c.delay??0],deltaU16:[Number(BigInt(c.deltaTicks??17)&65535n),Number(BigInt(c.deltaTicks??17)>>16n&65535n)],scriptEnabled:[(c.scriptEnabled??1)!==0],enabled:[true]});
      const outputs=await executor.runGraph(name,inputs),report={name,cases:records.length,sha256:model.sha256,nodes:model.ir.nodes.length,bytes:model.onnx.length,fieldsCompared:0,mismatches:0,examples:[]};
      for(let i=0;i<records.length;i++){
        const r=records[i],field={script_complete:'scriptComplete',controller_complete:'controllerComplete',timeline_complete:'timelineComplete'}[r.case.kind];
        const expected=completion?{[field]:[r.returnValue]}:{nextDelay:[r.after.delay],requiresDelayCommit:[+r.executedPCs.includes('0x021ebb84')]};
        for(const[key,want]of Object.entries(expected))for(let j=0;j<want.length;j++){
          report.fieldsCompared++;
          if(Number(outputs[i][key]?.[j])!==Number(want[j])){report.mismatches++;if(report.examples.length<16)report.examples.push({id:r.case.id,key,index:j,expected:want[j],actual:outputs[i][key]?.[j]});}
        }
        if(r.before.seed!==r.after.seed)throw Error('Unexpected RNG change in pure scheduler-prefix evidence '+r.case.id);
      }
      reports.push(report);
    }
    return{schema:'dq9-common-presentation-scheduler-arm-verification-v1',passed:reports.every(r=>r.mismatches===0),source:resolve(sourcePath),sourceSHA256:hash(bytes),romSHA256:source.romSHA256,actualArmCases:source.results.length,modeledArmCases:reports.reduce((n,r)=>n+r.cases,0),fieldsCompared:reports.reduce((n,r)=>n+r.fieldsCompared,0),mismatches:reports.reduce((n,r)=>n+r.mismatches,0),backend:'onnxruntime-wasm',ortVersion:executor.ortVersion??'1.31.1',models:reports,scope:'Exact completed predicate functions and script-update timer prefix against actual ARM execution. Additional scene/scheduler records are retained in the authority artifact and do not claim equivalence for the full scene lifecycle. Neither graph returns natural advancement or next numeric-turn readiness.'};
  }finally{await executor.release();}
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),options={ortDirectory:process.env.ORT_RUNTIME_DIR};let out;
  for(let i=0;i<args.length;i++){if(args[i]==='--source')options.sourcePath=args[++i];else if(args[i]==='--ort-dir')options.ortDirectory=args[++i];else if(args[i]==='--out')out=args[++i];else throw Error('Unknown argument '+args[i]);}
  const report=await verifyCommonPresentationScheduler(options);if(out)await writeFile(resolve(out),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
}
