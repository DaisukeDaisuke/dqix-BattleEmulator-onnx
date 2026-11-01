#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
import {createCommonAnimation3DTimerRunner,COMMON_ANIMATION3D_TIMER_MODELS} from '../runtime/common-animation3d-timer.mjs';

const args=process.argv.slice(2),option=n=>{const at=args.indexOf(n);return at<0?undefined:args[at+1];},root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),hash=b=>createHash('sha256').update(b).digest('hex'),word=p=>p[0]+65536*p[1],clone=x=>structuredClone(x),sourceBytes=await readFile(option('--source')),source=JSON.parse(sourceBytes);
if(source.schema!=='dq9-original-animation3d-timer-evidence-v1'||!source.programUnmodified||!source.executionComplete||source.romSHA256!=='b7a7f82f9da6f5bd08b5ae436d67cbde020f15e79534e0d34853201cd24d775d')throw Error('Unmodified original timer evidence is required');
const models=new Map();for(const name of COMMON_ANIMATION3D_TIMER_MODELS){const onnx=await readFile(resolve(root,'graph-v2',name+'.onnx')),ir=JSON.parse(await readFile(resolve(root,'graph-v2',name+'.json')));models.set(name,{name,onnx,ir,sha256:hash(onnx)});}
const ort=await loadLocalOrt(option('--ort-dir')),executor=createGraphExecutor({models,ortRuntime:ort});
const report={schema:'dq9-common-animation3d-timer-rom-verification-v1',sourceSHA256:hash(sourceBytes),models:[...models.values()].map(({name,sha256})=>({name,sha256})),runtimeSHA256:hash(await readFile(resolve(root,'runtime/common-animation3d-timer.mjs'))),builderSHA256:hash(await readFile(resolve(root,'graph-v2/build-common-animation3d-timer.mjs'))),fieldsCompared:0,mismatches:0,examples:[],cases:[],jsonResumes:0,originalCompleteCalls:source.results.filter(r=>r.completeFunctionExecuted).length,originalBoundedPrefixes:source.results.filter(r=>!r.completeFunctionExecuted).length,scope:'Whole supplied Animation3D, AnimationData26-byte header and raw64-byte input match original ARM execution. Every32-bit signed dt/playbackSpeed/time is represented without float rounding; loops, non-loop clamp, negative time, overflow, null data and SetAnimationTime are included. Budget1 JSON restoration occurs after the actual computed time store and before raw-frame-count lookup. Zero-frame looping cases compare explicit4096-instruction nonreturning prefixes and remain pending; mathematical nontermination follows the unchanged original subtraction-of-zero loop, not a claim that a bounded observation proves arbitrary nontermination. Caller stack, animation evaluation and rendering are outside this proof.'};
function compare(id,key,actual,expected){if(Array.isArray(expected)){if(!Array.isArray(actual)||actual.length!==expected.length)throw Error('Shape mismatch '+id+' '+key);expected.forEach((x,i)=>compare(id,key+'['+i+']',actual[i],x));return;}report.fieldsCompared++;if(actual!==expected){report.mismatches++;if(report.examples.length<30)report.examples.push({id,key,actual,expected});}}
try{
  for(const original of source.results){const c=original.case;if(!original.ok||!original.strictInitializedMemory)throw Error('Original case is incomplete '+c.id);if(!original.completeFunctionExecuted&&(!c.nonreturningPrefix||!original.instructionBoundReached))throw Error('An unclassified original stop is not a proof '+c.id);
    for(const budgeted of[false,true]){
      let memory=[{base:0x02380000,bytes:[...c.animationBytes]},{base:0x02390000,bytes:[...c.dataBytes]},{base:0x023a0000,bytes:[...c.rawBytes]}];const before=report.mismatches;
      function locate(pointer,length){const address=word(pointer),r=memory.find(r=>address>=r.base&&address+length<=r.base+r.bytes.length);if(!r)throw Error('Missing supplied timer backing '+address.toString(16));return{r,at:address-r.base};}
      const runner=createCommonAnimation3DTimerRunner({getModel:name=>models.get(name)?.ir,runGraph:executor.runGraph,read:(p,n)=>{const{r,at}=locate(p,n);return r.bytes.slice(at,at+n);},write:(p,b,m)=>{const{r,at}=locate(p,b.length);for(let i=0;i<b.length;i++)r.bytes[at+i]=(r.bytes[at+i]&~m[i])|(b[i]&m[i]);}});
      const input={animationPointerU16:[...c.animationPointerU16],valueU16:[...c.valueU16],operation:c.operation};let result=await runner.run({...input,maxTransitions:budgeted?1:2}),jsonResumed=false;
      if(budgeted&&result.budgetExhausted){const restored=JSON.parse(JSON.stringify({memory,state:result.state}));memory=restored.memory;result=await runner.run({...input,state:restored.state,maxTransitions:1});report.jsonResumes++;jsonResumed=true;}
      compare(c.id,'complete',result.complete,original.completeFunctionExecuted);if(c.nonreturningPrefix)compare(c.id,'nonterminating',result.nonterminating,true);
      compare(c.id,'animationBytes',memory[0].bytes,original.animationBytes);compare(c.id,'dataBytes',memory[1].bytes,original.dataBytes);compare(c.id,'rawBytes',memory[2].bytes,original.rawBytes);
      report.cases.push({id:c.id,budgeted,jsonResumed,completeOriginal:original.completeFunctionExecuted,transitions:result.state.transitions,mismatches:report.mismatches-before});
    }
  }
}finally{await executor.release();}
report.passed=report.mismatches===0&&report.cases.length===source.results.length*2;await writeFile(option('--out'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,originalCompleteCalls:report.originalCompleteCalls,originalBoundedPrefixes:report.originalBoundedPrefixes,jsonResumes:report.jsonResumes,fields:report.fieldsCompared,mismatches:report.mismatches,examples:report.examples}));if(!report.passed)process.exitCode=1;
