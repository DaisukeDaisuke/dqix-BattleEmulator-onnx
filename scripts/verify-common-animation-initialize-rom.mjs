#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {buildCommonAnimationInitialize} from '../graph-v2/build-common-animation-initialize.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
import {BATTLE_DEFINITIONS} from '../data/common-battle.mjs';

const args=process.argv.slice(2),opt=n=>{const i=args.indexOf(n);return i<0?undefined:args[i+1];},hash=x=>createHash('sha256').update(x).digest('hex');
if(!opt('--source'))throw Error('Use --source ORIGINAL_WHOLE_INITIALIZERS --ort-dir PATH --out REPORT');
const bytes=await readFile(resolve(opt('--source'))),source=JSON.parse(bytes);if(source.romSHA256!==BATTLE_DEFINITIONS.romSha256||!source.programUnmodified||!source.executionComplete)throw Error('Complete unchanged original ROM evidence required');
const g=buildCommonAnimationInitialize(),ir=g.json(),onnx=g.model(),ort=await loadLocalOrt(opt('--ort-dir')??process.env.ORT_RUNTIME_DIR),session=await ort.InferenceSession.create(onnx,{executionProviders:['wasm']}),report={schema:'dq9-common-animation-initialize-rom-v1',sourceSHA256:hash(bytes),modelSHA256:hash(onnx),modelBytes:onnx.length,runtimeVersion:ort.env.versions.web,cases:0,fieldsCompared:0,mismatches:0,examples:[],scope:'Eighteen exact raw u16 initializer stores compared with complete original021e91c0 calls. Only independent before-call operands enter ONNX. Other resource/audio/allocator effects execute in the original but are not claimed by this projection; each requires its own common producer.'};
function compare(id,key,actual,expected){report.fieldsCompared++;if(actual!==expected){report.mismatches++;if(report.examples.length<30)report.examples.push({id,key,actual,expected});}}
try{
  for(const r of source.results){
    if(!r.ok||!r.strictInitializedMemory||!r.initializerComplete)throw Error('Original whole initializer failed: '+r.case.id);
    const input=r.initializerInputs,feeds={};for(const field of ir.inputs){const raw=input[field.name],values=Array.isArray(raw)?raw:[raw];if(values.some(x=>x===undefined))throw Error('Missing initial operand '+field.name);feeds[field.name]=new ort.Tensor(field.dtype==='bool'?'bool':'float32',field.dtype==='bool'?Uint8Array.from(values):Float32Array.from(values),[1,values.length]);}
    const out=await session.run(feeds);compare(r.case.id,'supported',Number(out.supported.data[0]),1);compare(r.case.id,'storesCompleted',Number(out.storesCompleted.data[0]),1);compare(r.case.id,'consumed',Number(out.consumed.data[0]),0);compare(r.case.id,'originalRngRetained',r.initializerSeed,r.beforeInitializerSeed);
    Array.from(out.nextStateU16.data).forEach((value,i)=>compare(r.case.id,'script+'+ir.contract.stateOffsets[i].toString(16),value,r.initializerAfterU16[i]));compare(r.case.id,'tailOwnerPresent',!!out.tailOwnerPresent.data[0],!!(r.initializerAfterU16[3]||r.initializerAfterU16[4]));report.cases++;
  }
}finally{await session.release();}
report.passed=report.cases>0&&report.mismatches===0;if(opt('--models-out')){const dir=resolve(opt('--models-out'));await mkdir(dir,{recursive:true});await g.save(pathToFileURL(dir+'/'));}if(opt('--out'))await writeFile(resolve(opt('--out')),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
