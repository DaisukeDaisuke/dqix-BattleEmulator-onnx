#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadLocalOrt} from './verify-common-battle.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {validateGraphInputs} from '../graph-v2/input-domains.mjs';
import {BATTLE_DEFINITIONS} from '../data/common-battle.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];},hash=b=>createHash('sha256').update(b).digest('hex');
if(!option('--source'))throw Error('Use --source ORIGINAL_STATE6_RESPONSE --ort-dir ORT_DIR [--report REPORT]');
const bytes=await readFile(option('--source')),source=JSON.parse(bytes);
if(!source.executionComplete||!source.programUnmodified||source.romSHA256!==BATTLE_DEFINITIONS.romSha256)throw Error('Complete unmodified matching-ROM source required');
const name='rom-common-presentation-state6',ir=JSON.parse(await readFile(resolve(root,'graph-v2',name+'.json'))),onnx=await readFile(resolve(root,'graph-v2',name+'.onnx')),models=new Map([[name,{name,ir,onnx}]]),ort=await loadLocalOrt(option('--ort-dir')??process.env.ORT_RUNTIME_DIR),executor=createGraphExecutor({models,ortRuntime:ort});
const faceName='rom-common-actor-facing',faceIR=JSON.parse(await readFile(resolve(root,'graph-v2',faceName+'.json'))),faceONNX=await readFile(resolve(root,'graph-v2',faceName+'.onnx'));models.set(faceName,{name:faceName,ir:faceIR,onnx:faceONNX});
const report={schema:'dq9-common-state6-verification-v1',sourceSHA256:hash(bytes),modelSHA256:hash(onnx),romSHA256:source.romSHA256,cases:[],fields:0,mismatches:0,examples:[],scope:'Actual original state6 full calls. Marker geometry, camera readiness, exact unsigned movement countdown, face and message helper dispatch, indicator stores and RNG are compared. Original script flags9 select already-started message/delay paths; queue/UI/animation internals are separate modules, not validated by this probe.'};
report.facingModelSHA256=hash(faceONNX);
function check(id,key,want,got){if(Array.isArray(want)){if(!Array.isArray(got)||want.length!==got.length)throw Error('Width differs '+key);want.forEach((v,i)=>check(id,key+'.'+i,v,got[i]));return;}report.fields++;if(want===got)return;report.mismatches++;if(report.examples.length<32)report.examples.push({id,key,want,got});}
try{
  for(let offset=0;offset<source.results.length;offset+=32){
    const group=source.results.slice(offset,offset+32),rows=group.map(x=>{if(!x.ok||!x.strictInitializedMemory)throw Error('Incomplete original case '+x.case.id);const c=Object.fromEntries(ir.inputs.map(i=>[i.name,x.case[i.name]])),errors=validateGraphInputs(ir.contract,c);if(errors.length)throw Error(x.case.id+': '+errors.join('; '));return c;}),out=await executor.runGraph(name,rows);
    const faceInputs=group.map((r,i)=>{const c=r.case,b=r.before.faces.find(x=>x.id===c.targetId[0]);return{selfId:c.targetId,sourceId:c.sourceId,sourceObjectPresent:c.sourceObjectPresent,selfPosition:c.targetXYZ,sourcePosition:c.sourceXYZ,rotationY:[b.rotationY],orientationAE:[b.orientationAE],animationB0:[b.animationB0],behaviorBE:[b.behaviorBE],flagsC4:[b.flagsC4],objectFlagsU16:[c.targetFlags6cLow16[0],0],modelPresent:[false],animationPackageListPresent:[false],descriptorPresent:c.targetDescriptorPresent,pendingFacingTarget:[b.pendingTarget],pendingRequest:out[i].requestPendingFace,immediateRequest:out[i].requestImmediateFace};});
    for(const input of faceInputs){const errors=validateGraphInputs(faceIR.contract,input);if(errors.length)throw Error(errors.join('; '));}const faces=await executor.runGraph(faceName,faceInputs);
    for(let i=0;i<group.length;i++){
      const r=group[i],v=out[i],id=r.case.id,before=report.mismatches,pc=new Set(r.executedPCs),a=r.after;
      if(!v.supported[0])throw Error('Model rejects defined original input '+id);
      check(id,'state',a.presentationState,v.nextPresentationState[0]);check(id,'wait',a.waitFlagU16,v.nextWaitFlagU16);check(id,'timer',a.movementTimer,v.nextMovementTimer[0]);check(id,'markerCount',a.markerCount,v.nextMarkerCount[0]);
      check(id,'indicatorFlags',a.indicatorFlags,r.before.indicatorFlags.map(x=>v.hideIndicators[0]?x|1:x));check(id,'delay',a.delay,v.setDelay750[0]?750:r.before.delay);check(id,'seed',a.seed,r.before.seed);
      for(const[key,address]of Object.entries({initializeMarkers:'0x021dfef4',queueStartMessages:'0x021ea8fc',delayCommit:'0x021ebb84',requestPendingFace:'0x0204ae50',requestImmediateFace:'0x02033458'}))check(id,key,pc.has(address),!!v[key][0]);
      check(id,'markerOrigin',a.markerOrigin,v.markerCountWritten[0]?v.markerOrigin:r.before.markerOrigin);
      const expectedFace=a.faces.find(x=>x.id===r.case.targetId[0]),face=faces[i];if(!face.supported[0])throw Error('Unsupported face '+id);for(const[key,output]of Object.entries({rotationY:'nextRotationY',orientationAE:'nextOrientationAE',flagsC4:'nextFlagsC4',pendingTarget:'nextPendingFacingTarget'}))check(id,'face.'+key,expectedFace[key],face[output][0]);
      report.cases.push({id,steps:r.steps,mismatches:report.mismatches-before,markerCount:v.nextMarkerCount[0]});
    }
  }
}finally{await executor.release();}
report.passed=report.mismatches===0&&report.cases.length>0;report.runtime={version:ort.env.versions.web,counts:executor.counts};if(option('--report'))await writeFile(option('--report'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,cases:report.cases.length},null,2));if(!report.passed)process.exitCode=1;
