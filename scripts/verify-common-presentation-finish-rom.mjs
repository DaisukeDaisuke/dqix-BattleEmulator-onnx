#!/usr/bin/env node
// Independent initial scene inputs -> actual ONNX Runtime -> original ARM stores.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {BATTLE_DEFINITIONS} from '../data/common-battle.mjs';
import {buildCommonSceneFinish,buildCommonScriptCleanup,buildCommonTurnCleanup,buildCommonPresentationTail} from '../graph-v2/build-common-presentation-finish.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
const args=process.argv.slice(2),option=n=>{const i=args.indexOf(n);return i<0?undefined:args[i+1];},hash=b=>createHash('sha256').update(b).digest('hex');
if(!option('--source'))throw Error('Use --source original-finish-response.json --ort-dir ORT_DIR [--report JSON]');
const bytes=await readFile(resolve(option('--source'))),original=JSON.parse(bytes);
if(!original.executionComplete||!original.programUnmodified||original.romSHA256!==BATTLE_DEFINITIONS.romSha256)throw Error('Complete unmodified matching-ROM evidence required');
const builders={scene:buildCommonSceneFinish,script:buildCommonScriptCleanup,turn:buildCommonTurnCleanup,tail:buildCommonPresentationTail},models=new Map(),ort=await loadLocalOrt(option('--ort-dir')??process.env.ORT_RUNTIME_DIR);
const report={schema:'dq9-common-presentation-finish-rom-v1',romSHA256:original.romSHA256,sourceSHA256:hash(bytes),runtimeVersion:ort.env.versions.web,models:{},fieldsCompared:0,mismatches:0,cases:[],examples:[],scope:'Complete original scene, script and turn cleanup functions plus a separately labelled original terminal-frame suffix. Initial case data alone feeds the ONNX models; original final fields and return values are comparisons only. This does not claim an enclosing asynchronous frame or unimplemented loaded-animation/resource cleanup.'};
const compare=(id,key,actual,expected)=>{if(Array.isArray(expected)){if(!Array.isArray(actual)||actual.length!==expected.length){report.mismatches++;report.examples.push({id,key,actualLength:actual?.length,expectedLength:expected.length});return;}expected.forEach((v,i)=>compare(id,key+'['+i+']',actual[i],v));return;}report.fieldsCompared++;if(actual!==expected){report.mismatches++;if(report.examples.length<80)report.examples.push({id,key,actual,expected});}};
try{
  for(const[type,build]of Object.entries(builders)){const graph=build(),ir=graph.json(),onnx=graph.model(),session=await ort.InferenceSession.create(onnx,{executionProviders:['wasm']});models.set(type,{ir,session});report.models[type]={name:graph.name,sha256:hash(onnx)};}
  for(const row of original.results){
    const c=row.case,type=c.finishType,model=models.get(type);if(!row.ok||!row.strictInitializedMemory||!row.completeFunctionExecuted||!model||c.kind!=='presentation_finish')throw Error('Unqualified original case '+c.id);
    const feeds={};for(const input of model.ir.inputs){const supplied=c.finishInput[input.name];if(supplied===undefined)throw Error('Missing initial '+input.name);const values=Array.isArray(supplied)?supplied:[supplied];if(values.length!==input.shape[1])throw Error('Initial shape differs '+input.name);feeds[input.name]=new ort.Tensor(input.dtype==='bool'?'bool':'float32',input.dtype==='bool'?Uint8Array.from(values):Float32Array.from(values),[1,values.length]);}
    const result=await model.session.run(feeds),outputs=Object.fromEntries(Object.entries(result).map(([key,value])=>[key,Array.from(value.data)])),before=report.mismatches;compare(c.id,'supported',outputs.supported[0],1);
    for(const[name,actual]of Object.entries(outputs))if(Object.hasOwn(row.finish,name))compare(c.id,name,Array.isArray(row.finish[name])?actual:actual[0],row.finish[name]);
    if(type==='scene'){compare(c.id,'returnValue',outputs.returnValue[0],row.finishReturn);compare(c.id,'requestCameraCleanup',outputs.requestCameraCleanup[0],row.finishReturn!==0?1:0);}
    report.cases.push({id:c.id,type,mismatches:report.mismatches-before,originalInstructions:row.steps??row.instructions});
  }
}finally{for(const{session}of models.values())await session.release();}
report.passed=report.mismatches===0;const json=JSON.stringify(report,null,2)+'\n';if(option('--report'))await writeFile(resolve(option('--report')),json);console.log(json);if(!report.passed)process.exitCode=1;
