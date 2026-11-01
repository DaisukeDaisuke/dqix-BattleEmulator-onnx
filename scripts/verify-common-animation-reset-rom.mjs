#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {buildCommonAnimationReset,COMMON_ANIMATION_RESET_BASE,COMMON_ANIMATION_RESET_WORDS} from '../graph-v2/build-common-animation-reset.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
import {BATTLE_DEFINITIONS} from '../data/common-battle.mjs';

const args=process.argv.slice(2),option=n=>{const i=args.indexOf(n);return i<0?undefined:args[i+1];},hash=x=>createHash('sha256').update(x).digest('hex');
if(!option('--source'))throw Error('Use --source ORIGINAL_CALLERS --ort-dir PATH --out REPORT');
const bytes=await readFile(resolve(option('--source'))),source=JSON.parse(bytes);if(source.romSHA256!==BATTLE_DEFINITIONS.romSha256||!source.programUnmodified)throw Error('Matching unchanged original ROM evidence required');
const graph=buildCommonAnimationReset(),ir=graph.json(),onnx=graph.model(),ort=await loadLocalOrt(option('--ort-dir')??process.env.ORT_RUNTIME_DIR),session=await ort.InferenceSession.create(onnx,{executionProviders:['wasm']}),report={schema:'dq9-common-animation-reset-rom-v1',sourceSHA256:hash(bytes),modelSHA256:hash(onnx),modelBytes:onnx.length,runtimeVersion:ort.env.versions.web,cases:0,fieldsCompared:0,mismatches:0,examples:[],scope:'Complete original opcode61 including original nested reset helper, all1056 owner halfwords compared. The command pointer comes from the actual second argument, independent of node payload. Original after-state is comparison only.'};
const compare=(id,key,a,b)=>{report.fieldsCompared++;if(a!==b){report.mismatches++;if(report.examples.length<30)report.examples.push({id,key,actual:a,expected:b});}};
try{
 for(const r of source.results){
  if(!r.ok||r.case.opcode!==61||!Number.isInteger(r.case.handlerArg1U32))throw Error('Complete original opcode61 call required');
  const pointer=r.case.handlerArg1U32,input={...ir.contract.defaults,scriptBlockU16:r.beforeScriptU16.slice(COMMON_ANIMATION_RESET_BASE/2,COMMON_ANIMATION_RESET_BASE/2+COMMON_ANIMATION_RESET_WORDS),commandPointerU16:[pointer%65536,Math.floor(pointer/65536)]},feeds={};
  for(const f of ir.inputs){const raw=input[f.name],a=Array.isArray(raw)?raw:[raw];feeds[f.name]=new ort.Tensor(f.dtype==='bool'?'bool':'float32',f.dtype==='bool'?Uint8Array.from(a):Float32Array.from(a),[1,a.length]);}
  const out=await session.run(feeds),after=[...r.beforeScriptU16];for(let i=0;i<COMMON_ANIMATION_RESET_WORDS;i++)after[COMMON_ANIMATION_RESET_BASE/2+i]=out.nextScriptBlockU16.data[i];
  compare(r.case.id,'supported',Number(out.supported.data[0]),1);compare(r.case.id,'completed',Number(out.handlerCompleted.data[0]),1);compare(r.case.id,'return',out.handlerReturnU16.data[0]+65536*out.handlerReturnU16.data[1],r.returnU32);compare(r.case.id,'consumed',out.consumed.data[0],0);after.forEach((value,i)=>compare(r.case.id,'owner+'+(i*2).toString(16),value,r.afterScriptU16[i]));report.cases++;
 }
}finally{await session.release();}
report.passed=report.cases>0&&report.mismatches===0;if(option('--models-out')){const dir=resolve(option('--models-out'));await mkdir(dir,{recursive:true});await graph.save(pathToFileURL(dir+'/'));}if(option('--out'))await writeFile(resolve(option('--out')),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
