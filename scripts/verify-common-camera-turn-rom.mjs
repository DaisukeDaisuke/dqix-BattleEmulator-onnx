#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
const args=process.argv.slice(2),option=k=>{const i=args.indexOf(k);return i<0?undefined:args[i+1];},root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),hash=b=>createHash('sha256').update(b).digest('hex');
const sourceBytes=await readFile(option('--source')),source=JSON.parse(sourceBytes);
if(source.executionComplete!==true||source.programUnmodified!==true)throw Error('Complete unmodified original initializer evidence is required');
const name='rom-common-camera-turn',modelDir=option('--model-dir')??resolve(root,'graph-v2'),onnx=await readFile(resolve(modelDir,name+'.onnx')),ir=JSON.parse(await readFile(resolve(modelDir,name+'.json'))),models=new Map([[name,{name,onnx,ir}]]),ort=await loadLocalOrt(option('--ort-dir')),executor=createGraphExecutor({models,ortRuntime:ort});
const report={schema:'dq9-common-camera-turn-original-projection-v1',createdAt:new Date().toISOString(),sourceSHA256:hash(sourceBytes),romSHA256:source.romSHA256,modelSHA256:hash(onnx),cases:[],fieldsCompared:0,mismatches:0,examples:[],contractChecks:0,scope:'Only camera-relevant initializer outputs: behavior, previous behavior and cached target for12 objects, presentation state and scene+71c5. Inputs are the original explicitly declared initializer operands, not observed intermediate state. The combined graph also resets the accepted-command cursor; this store is checked against the decompiled accepted-command contract separately because the isolated initializer preserves that cursor. No rendering, heap, font or resource reconstruction is executed by this verification.'};
function compare(id,field,got,want){if(Array.isArray(want)){if(!Array.isArray(got)||got.length!==want.length)throw Error('Shape differs '+field);want.forEach((x,i)=>compare(id,field+'['+i+']',got[i],x));return;}report.fieldsCompared++;if(got!==want){report.mismatches++;if(report.examples.length<32)report.examples.push({id,field,got,want});}}
const selected=source.results.filter(r=>r.case.kind==='presentation_entry'&&r.case.finishType==='entry');
try{const inputs=selected.map(r=>{if(!r.ok||!r.strictInitializedMemory||!r.completeFunctionExecuted)throw Error('Incomplete original initializer '+r.case.id);const raw=Buffer.from(r.case.sceneHex,'hex'),values={...r.case.entryInput,currentActionIndex:raw.readInt32LE(0x57c8),presentationState:raw.readInt32LE(0xe28),sceneByte71c5:raw[0x71c5]};return Object.fromEntries(ir.inputs.map(f=>{if(values[f.name]===undefined)throw Error('Original initial operand missing '+f.name);return[f.name,Array.isArray(values[f.name])?values[f.name]:[values[f.name]]];}));});
  const outputs=await executor.runGraph(name,inputs);for(let i=0;i<selected.length;i++){
    const original=selected[i],o=outputs[i],id=original.case.id,before=report.mismatches,raw=Buffer.from(original.entryAfter.sceneHex,'hex');
    for(const key of['nextActorBehavior','nextActorPreviousBehavior','nextActorPreferredTarget'])compare(id,key,o[key],original.entryAfter[key]);
    compare(id,'nextPresentationState',o.nextPresentationState[0],raw.readInt32LE(0xe28));compare(id,'nextSceneByte71c5',o.nextSceneByte71c5[0],raw[0x71c5]);
    for(const[key,want]of[['nextCurrentActionIndex',0],['supported',1],['completed',1]]){report.contractChecks++;if(Number(o[key][0])!==want)throw Error('Accepted-command contract mismatch '+id+' '+key);}
    report.cases.push({id,mismatches:report.mismatches-before});
  }
}finally{await executor.release();}
report.passed=selected.length>0&&report.mismatches===0;if(option('--out')){await mkdir(dirname(resolve(option('--out'))),{recursive:true});await writeFile(option('--out'),JSON.stringify(report,null,2)+'\n');}console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,fieldsCompared:report.fieldsCompared,mismatches:report.mismatches,contractChecks:report.contractChecks,examples:report.examples,scope:report.scope}));if(!report.passed)process.exitCode=1;
