#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {COMMON_CAMERA_FRAME_MODELS,createCommonCameraFrameRunner,cameraGeometryFromMemory} from '../runtime/common-camera-frame.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {BATTLE_DEFINITIONS} from '../data/common-battle.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];},hash=b=>createHash('sha256').update(b).digest('hex');
if(!option('--source'))throw Error('Use --source ORIGINAL_TRACE_RESPONSE --ort-dir ORT_DIR [--report REPORT]');
const bytes=await readFile(option('--source')),source=JSON.parse(bytes);
if(!source.executionComplete||!source.programUnmodified||source.romSHA256!==BATTLE_DEFINITIONS.romSha256)throw Error('A complete unmodified matching-ROM trace is required');
const models=new Map();
for(const name of COMMON_CAMERA_FRAME_MODELS){
  const ir=JSON.parse(await readFile(resolve(root,'graph-v2',name+'.json'))),onnx=await readFile(resolve(root,'graph-v2',name+'.onnx'));
  models.set(name,{name,ir,onnx,executionProvider:name==='rom-camera-reverse-polar-values-cpu3'?'wasm-explicit-cpu':undefined});
}
const ort=await loadLocalOrt(option('--ort-dir')??process.env.ORT_RUNTIME_DIR),executor=createGraphExecutor({models,ortRuntime:ort});
const runner=await createCommonCameraFrameRunner({runGraph:executor.runGraph,runDoubleGraph:executor.runGraph,getModel:async name=>models.get(name).ir});
const report={schema:'dq9-common-camera-frame-verification-v1',sourceSHA256:hash(bytes),romSHA256:source.romSHA256,modelSHA256:Object.fromEntries([...models].map(([name,m])=>[name,hash(m.onnx)])),cases:[],fields:0,mismatches:0,examples:[],frames:0,feedbackSequences:0,scope:'Original world camera component entries, admitted no-manual/no-polar-interpolation/no-spin/no-active-fade branch. Exact 640-byte camera, all seven globals, first-camera flag, nested row+4 and RNG. Within each computed-command segment, camera state feeds back from ONNX outputs only; other-component row+4 writes and actor motion remain explicit frame-entry operands. This is not a whole-world-frame or UI/resource proof.'};
const limbs=words=>words.flatMap(x=>[x%65536,Math.floor(x/65536)]);
function check(id,key,want,got){
  if(Array.isArray(want)){if(!Array.isArray(got)||want.length!==got.length)throw Error('Output width differs '+key);want.forEach((x,i)=>check(id,key+'.'+i,x,got[i]));return;}
  report.fields++;if(Object.is(want,got))return;report.mismatches++;if(report.examples.length<24)report.examples.push({id,key,want,got});
}
try{
  for(const original of source.results){
    if(!original.ok||!original.strictInitializedMemory||!original.case.traceNaturalProducers)throw Error('Unqualified original component trace');
    const entries=original.phaseInitials.filter(x=>/^original_world_camera_\d+$/.test(x.name)),ends=new Map(original.phases.map(x=>[x.name,x]));
    const directEntry=original.trace.find(x=>x.function==='camera_presentation_admission');
    if(!directEntry?.r0||!entries.length)throw Error('Missing original direct entry ABI');
    const scene=parseInt(directEntry.r0,16),bridge=(await executor.runGraph('rom-common-camera-first-stack',[{sceneBaseU16:[scene%65536,Math.floor(scene/65536)],priorU16:Array(8).fill(0),enabled:[true]}]))[0];
    check(original.case.id,'firstNestedStack',limbs(entries[0].nestedRow4Words),bridge.nextU16);
    const initialObjects=new Map([...(original.case.roster??[]),...(original.case.lookupObjects??[])].map(x=>[x.id,x]));
    let last=null,retainedRecordPointer=-1,priorCommandIndex=-1;
    for(const entry of entries){
      const c=entry.camera,id=original.case.id+'/'+entry.name,frame=Number(entry.name.split('_').at(-1)),cameraU16=limbs(c.cameraWords160);
      if(!Array.isArray(c.globals7)||!Array.isArray(c.fadeObjectPresent)||!Array.isArray(c.fadeFlags6c)||!Array.isArray(c.fadeByte40))throw Error('Original phase must capture seven globals and real fade-object inputs');
      const geometry=cameraGeometryFromMemory(cameraU16,c.globals7,c.firstCameraFlag),objects=new Map(c.objects.map(x=>[x.id,x])),src=objects.get(geometry.sourceId),dst=objects.get(geometry.targetId);
      const recordPointer=c.cameraWords160[0x27c/4],record=original.generatedPresentationQueue.records.find(x=>parseInt(x.address,16)===recordPointer);
      if(recordPointer&&!record)throw Error('Camera initial record pointer is not in the captured initial command arena');
      if(c.fadeObjectPresent.length!==12||c.fadeFlags6c.length!==12||c.fadeByte40.length!==12)throw Error('Fade roster width differs from original capacity');
      const input={cameraU16,cameraGeometry:geometry,sourcePosition:src?.positionXYZ??[0,0,0],targetPosition:dst?.positionXYZ??[0,0,0],sourceHeight:initialObjects.get(geometry.sourceId)?.height??4096,targetHeight:initialObjects.get(geometry.targetId)?.height??4096,sourcePresent:!!src,targetPresent:!!dst,recordPresent:!!record,recordFirstU16:record?.action??0,nestedRow4U16:limbs(entry.nestedRow4Words),worldDispatchStackAbi:'jpn-component-world-dispatch-v1',seed:c.seed,
        fadeObjectPresent:c.fadeObjectPresent.map(Boolean),fadeObjectVisible:c.fadeFlags6c.map(x=>!(x&1)),fadeInheritedAlpha:c.fadeByte40.map(x=>x>>>3)};
      if(last&&c.currentActionIndex>priorCommandIndex){
        // Explicit observed cleanup-call boundary. Its scheduling is verified
        // by the separate UI/controller composition, not by this camera test.
        last=(await runner.cleanupRows([{...last,commandCleanup:true,turnCleanup:c.currentActionIndex>=original.generatedPresentationQueue.count}]))[0];
        retainedRecordPointer=last.cameraU16[0x27c/2]+65536*last.cameraU16[0x27e/2];
        check(id,'cleanupCameraU16',cameraU16,last.cameraU16);
      }
      if(last&&retainedRecordPointer===recordPointer){
        // Retain ONNX feedback, not the original after-frame camera snapshot.
        input.cameraU16=last.cameraU16;input.cameraGeometry=last.cameraGeometry;
      }else report.feedbackSequences++;
      const beforeMismatch=report.mismatches,result=await runner.runRows([input]);
      if(!result.complete)throw Error('Observed frame was rejected '+id+': '+result.reason);
      const out=result.states[0],end=ends.get(entry.name);if(!end?.outerState)throw Error('Missing original return boundary '+entry.name);
      // Completed original values are read only at this comparison boundary.
      const expected=end.outerState;
      check(id,'cameraU16',limbs(expected.cameraWords160),out.cameraU16);
      check(id,'globals7',expected.globals7,out.cameraGeometry.globals7);
      check(id,'firstCameraFlag',expected.firstCameraFlag,out.cameraGeometry.firstCameraFlag);
      check(id,'nestedRow4U16',limbs(end.nestedRow4Words),out.nestedRow4U16);
      check(id,'seed',expected.seed,out.seed);
      report.frames++;report.cases.push({id,frame,commandIndex:c.currentActionIndex,recordPointer:'0x'+recordPointer.toString(16),mismatches:report.mismatches-beforeMismatch});last=out;retainedRecordPointer=recordPointer;priorCommandIndex=c.currentActionIndex;
    }
  }
}finally{await executor.release();}
report.passed=report.mismatches===0&&report.frames>0;report.runtime={version:ort.env.versions.web,counts:executor.counts};
if(option('--report'))await writeFile(option('--report'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,frames:report.frames,feedbackSequences:report.feedbackSequences,fields:report.fields,mismatches:report.mismatches,examples:report.examples,runtime:report.runtime},null,2));if(!report.passed)process.exitCode=1;
