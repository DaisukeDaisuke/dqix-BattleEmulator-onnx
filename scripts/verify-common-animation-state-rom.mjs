#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {buildCommonAnimationState,COMMON_ANIMATION_STATE_OFFSETS} from '../graph-v2/build-common-animation-state.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
import {BATTLE_DEFINITIONS} from '../data/common-battle.mjs';

const args=process.argv.slice(2),opt=n=>{const i=args.indexOf(n);return i<0?undefined:args[i+1];},hash=x=>createHash('sha256').update(x).digest('hex');
if(!opt('--source'))throw Error('Use --source ORIGINAL_CALLERS --ort-dir PATH --out REPORT');
const bytes=await readFile(resolve(opt('--source'))),source=JSON.parse(bytes);if(source.romSHA256!==BATTLE_DEFINITIONS.romSha256||!source.programUnmodified)throw Error('Matching unmodified original ROM evidence required');
const graph=buildCommonAnimationState(),ir=graph.json(),onnx=graph.model(),ort=await loadLocalOrt(opt('--ort-dir')??process.env.ORT_RUNTIME_DIR),session=await ort.InferenceSession.create(onnx,{executionProviders:['wasm']}),report={schema:'dq9-common-animation-state-rom-v1',sourceSHA256:hash(bytes),modelSHA256:hash(onnx),modelBytes:onnx.length,runtimeVersion:ort.env.versions.web,cases:0,fieldsCompared:0,mismatches:0,examples:[],scope:'Complete original pure-state handlers, all1056 u16 owner words compared per call, including nonzero untouched bytes. Actual constructor payload bit masks gate execution. No original after-state enters the graph.'};
const compare=(id,key,actual,expected)=>{report.fieldsCompared++;if(actual!==expected){report.mismatches++;if(report.examples.length<30)report.examples.push({id,key,actual,expected});}};
try{
 for(const r of source.results){
  if(!r.ok)throw Error('Original handler failed '+r.case.id);const input={...ir.contract.defaults,...r.case,stateU16:COMMON_ANIMATION_STATE_OFFSETS.map(offset=>r.beforeScriptU16[offset/2])},feeds={};
  for(const f of ir.inputs){const raw=input[f.name],a=Array.isArray(raw)?raw:[raw];feeds[f.name]=new ort.Tensor(f.dtype==='bool'?'bool':'float32',f.dtype==='bool'?Uint8Array.from(a):Float32Array.from(a),[1,a.length]);}
  const o=await session.run(feeds),after=[...r.beforeScriptU16];COMMON_ANIMATION_STATE_OFFSETS.forEach((offset,i)=>after[offset/2]=o.nextStateU16.data[i]);
  compare(r.case.id,'supported',Number(o.supported.data[0]),1);compare(r.case.id,'completed',Number(o.handlerCompleted.data[0]),1);compare(r.case.id,'return',o.handlerReturnU16.data[0]+o.handlerReturnU16.data[1]*65536,r.returnU32);compare(r.case.id,'consumed',o.consumed.data[0],0);
  after.forEach((value,i)=>compare(r.case.id,'owner+'+(i*2).toString(16),value,r.afterScriptU16[i]));report.cases++;
 }
}finally{await session.release();}
report.passed=report.cases>0&&report.mismatches===0;if(opt('--models-out')){const dir=resolve(opt('--models-out'));await mkdir(dir,{recursive:true});await graph.save(pathToFileURL(dir+'/'));}if(opt('--out'))await writeFile(resolve(opt('--out')),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
