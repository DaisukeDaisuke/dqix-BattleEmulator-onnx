#!/usr/bin/env node
// Inputs are reconstructed exclusively from each strict ARM case's initial data.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildCommonPresentationCompletion,buildCommonPresentationDelay,buildCommonCameraReadiness,buildCommonWorldCameraDispatch,buildCommonPresentationControllerWait} from '../graph-v2/build-common-presentation-scheduler.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
export async function verifyCommonPresentationScheduler({sourcePath,ortDirectory}={}){
  if(!sourcePath)throw Error('Supply --source with original ARM scheduler evidence');
  const bytes=await readFile(resolve(sourcePath)),source=JSON.parse(bytes);
  if(!source.executionComplete||!source.programUnmodified||!source.results?.length||source.results.some(r=>!r.ok||!r.strictInitializedMemory))throw Error('Only complete unmodified strict ARM evidence is admitted');
  const models=new Map(),builds=[buildCommonPresentationCompletion(),buildCommonPresentationDelay(),buildCommonCameraReadiness(),buildCommonWorldCameraDispatch(),buildCommonPresentationControllerWait()];
  for(const graph of builds){const onnx=graph.model(),ir=graph.json();models.set(graph.name,{name:graph.name,ir,onnx,sha256:hash(onnx)});}
  const executor=createGraphExecutor({models,backend:'onnxruntime-wasm',ortRuntime:await loadLocalOrt(ortDirectory)}),reports=[];
  try{
    for(const[name,model]of models){
      const kindByModel={
        'rom-common-presentation-completion':['script_complete','controller_complete','timeline_complete'],
        'rom-common-presentation-delay':['script_update'],
        'rom-common-camera-readiness':['camera_complete'],
        'rom-common-world-camera-dispatch':['camera_dispatch'],
        'rom-common-presentation-controller-wait':['controller_wait']
      };
      const records=source.results.filter(r=>kindByModel[name].includes(r.case.kind));
      if(!records.length)throw Error('No actual ARM cases for '+name);
      const limbs=x=>[Number(BigInt(x)&65535n),Number(BigInt(x)>>16n&65535n)];
      const inputs=records.map(({case:c})=>{
        if(name==='rom-common-presentation-completion')return{cursorPresent:[!!c.cursorPresent],controllerActive:[c.controllerActive??0],controllerWait:[c.controllerWait??0],timelineCount:[c.timelineCount??0]};
        if(name==='rom-common-presentation-delay')return{delay:[c.delay??0],deltaU16:limbs(c.deltaTicks??17),scriptEnabled:[(c.scriptEnabled??1)!==0],enabled:[true]};
        if(name==='rom-common-camera-readiness')return{initialized:[c.cameraInitialized??0],completionByte:[c.cameraReadyByte??0]};
        if(name==='rom-common-world-camera-dispatch')return{cameraPresent:[(c.cameraPresent??1)!==0],flagsByte:[Number(BigInt(c.cameraFlags??8)&255n)]};
        return{active:[c.controllerActive??0],phase:[c.controllerWait??0],commandPresent:[(c.commandPresent??1)!==0],messageWindowIdle:[(c.messageWindowState??0)===0],holdTimer:[c.holdTimer??750],deltaU16:limbs(c.deltaTicks??17),savedSource:[c.savedSource??-1234],contextU16:limbs(c.contextPointer??0x02366600)};
      });
      const outputs=await executor.runGraph(name,inputs),report={name,cases:records.length,sha256:model.sha256,nodes:model.ir.nodes.length,bytes:model.onnx.length,fieldsCompared:0,mismatches:0,examples:[]};
      for(let i=0;i<records.length;i++){
        const r=records[i],field={script_complete:'scriptComplete',controller_complete:'controllerComplete',timeline_complete:'timelineComplete'}[r.case.kind];
        let expected;
        if(name==='rom-common-presentation-completion')expected={[field]:[r.returnValue]};
        else if(name==='rom-common-presentation-delay')expected={nextDelay:[r.after.delay],requiresDelayCommit:[+r.executedPCs.includes('0x021ebb84')]};
        else if(name==='rom-common-camera-readiness')expected={returnByte:[r.returnValue],ready:[r.returnValue!==0]};
        else if(name==='rom-common-world-camera-dispatch')expected={selectedRoute:[r.selectedRoute],requiresBattleCameraUpdate:[r.selectedRoute===8]};
        else expected={nextHoldTimer:[r.after.holdTimer],nextPhase:[r.after.controllerWait],nextSavedSource:[r.after.savedSource],nextContextU16:limbs(r.after.contextPointer),waitBranchSupported:[true]};
        for(const[key,want]of Object.entries(expected))for(let j=0;j<want.length;j++){
          report.fieldsCompared++;
          if(Number(outputs[i][key]?.[j])!==Number(want[j])){report.mismatches++;if(report.examples.length<16)report.examples.push({id:r.case.id,key,index:j,expected:want[j],actual:outputs[i][key]?.[j]});}
        }
        if(r.before.seed!==r.after.seed)throw Error('Unexpected RNG change in pure scheduler-prefix evidence '+r.case.id);
      }
      reports.push(report);
    }
    return{schema:'dq9-common-presentation-scheduler-arm-verification-v1',passed:reports.every(r=>r.mismatches===0),source:resolve(sourcePath),sourceSHA256:hash(bytes),romSHA256:source.romSHA256,actualArmCases:source.results.length,modeledArmCases:reports.reduce((n,r)=>n+r.cases,0),fieldsCompared:reports.reduce((n,r)=>n+r.fieldsCompared,0),mismatches:reports.reduce((n,r)=>n+r.mismatches,0),backend:'onnxruntime-wasm',ortVersion:executor.ortVersion??'1.31.1',models:reports,scope:'Exact completed predicate functions, script-update timer prefix, original world camera dispatch and message-controller wait branch against actual ARM execution. Additional scene/scheduler records are retained in the authority artifact and do not claim equivalence for the full scene lifecycle. No graph returns natural advancement or next numeric-turn readiness.'};
  }finally{await executor.release();}
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),options={ortDirectory:process.env.ORT_RUNTIME_DIR};let out;
  for(let i=0;i<args.length;i++){if(args[i]==='--source')options.sourcePath=args[++i];else if(args[i]==='--ort-dir')options.ortDirectory=args[++i];else if(args[i]==='--out')out=args[++i];else throw Error('Unknown argument '+args[i]);}
  const report=await verifyCommonPresentationScheduler(options);if(out)await writeFile(resolve(out),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
}
