#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {buildCommonAnimationDispatch} from '../graph-v2/build-common-animation-dispatch.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
import {BATTLE_DEFINITIONS} from '../data/common-battle.mjs';

const args=process.argv.slice(2),opt=n=>{const i=args.indexOf(n);return i<0?undefined:args[i+1];},hash=x=>createHash('sha256').update(x).digest('hex');
if(!opt('--source'))throw Error('Use --source ORIGINAL_BOUNDARIES --ort-dir PATH --out REPORT');
const bytes=await readFile(resolve(opt('--source'))),source=JSON.parse(bytes);
if(source.romSHA256!==BATTLE_DEFINITIONS.romSha256||!source.programUnmodified)throw Error('Matching unmodified original ROM evidence required');
const graph=buildCommonAnimationDispatch(),ir=graph.json(),onnx=graph.model(),ort=await loadLocalOrt(opt('--ort-dir')??process.env.ORT_RUNTIME_DIR),session=await ort.InferenceSession.create(onnx,{executionProviders:['wasm']}),report={schema:'dq9-common-animation-dispatch-rom-v1',sourceSHA256:hash(bytes),modelSHA256:hash(onnx),modelBytes:onnx.length,runtimeVersion:ort.env.versions.web,cases:0,fieldsCompared:0,mismatches:0,examples:[],scope:ir.contract.scope};
function compare(id,key,actual,expected){report.fieldsCompared++;if(actual!==expected){report.mismatches++;if(report.examples.length<30)report.examples.push({id,key,actual,expected});}}
try{
 for(const r of source.results){
  if(!r.ok)throw Error('Original block failed '+r.case.id);const feeds={};
  for(const f of ir.inputs){const raw=r.case[f.name]??ir.contract.defaults[f.name],a=Array.isArray(raw)?raw:[raw];feeds[f.name]=new ort.Tensor(f.dtype==='bool'?'bool':'float32',f.dtype==='bool'?Uint8Array.from(a):Float32Array.from(a),[1,a.length]);}
  const o=await session.run(feeds),get=name=>Number(o[name].data[0]);
  compare(r.case.id,'supported',get('supported'),1);compare(r.case.id,'cursor',get('resultCursorIndex'),r.resultCursorIndex);compare(r.case.id,'handler',get('requiresHandler'),Number(r.boundary==='handler'));compare(r.case.id,'continue',get('continueLoop'),Number(r.boundary==='continue'));compare(r.case.id,'tail',get('tailReached'),Number(r.boundary==='tail'));compare(r.case.id,'consumed',get('consumed'),0);report.cases++;
 }
}finally{await session.release();}
report.passed=report.cases>0&&report.mismatches===0;
if(opt('--models-out')){const dir=resolve(opt('--models-out'));await mkdir(dir,{recursive:true});await graph.save(pathToFileURL(dir+'/'));}
if(opt('--out'))await writeFile(resolve(opt('--out')),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
