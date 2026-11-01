#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
import {cameraAdmissionInitial} from '../graph-v2/camera-admission-initial.mjs';
import {cameraProgramAdmissionInput} from '../graph-v2/camera-admission-runner.mjs';
import {createCameraProgramRunner,CAMERA_PROGRAM_MODELS} from '../graph-v2/camera-program-runner.mjs';

const args=process.argv.slice(2),option=k=>{const i=args.indexOf(k);return i<0?undefined:args[i+1];},hash=b=>createHash('sha256').update(b).digest('hex'),clone=x=>JSON.parse(JSON.stringify(x)),models=new Map();
for(const name of['rom-camera-program-admission4',...CAMERA_PROGRAM_MODELS]){
 const onnx=await readFile(resolve(option('--model-dir')??'graph-v2',name+'.onnx')),ir=JSON.parse(await readFile(resolve(option('--model-dir')??'graph-v2',name+'.json'),'utf8'));models.set(name,{name,onnx,ir,sha256:hash(onnx)});
}
const ort=await loadLocalOrt(option('--ort-dir')),executor=createGraphExecutor({models,ortRuntime:ort}),runtime={getModel:async name=>models.get(name).ir,runGraph:executor.runGraph},runner=await createCameraProgramRunner(runtime);
const report={schema:'dq9-common-camera-program-stream-proof-v1',createdAt:new Date().toISOString(),models:[...models.values()].map(m=>({name:m.name,sha256:m.sha256})),sources:[],legacyRows:0,fieldsCompared:0,mismatches:0,examples:[],wideCases:[],provider:'ONNX Runtime Web WASM',scope:'Shared streaming program selection and opcode projection. Regression compares all outputs against the earlier independently ROM-verified graph on actual original fixture structures; wider synthetic cases exercise original linked-order semantics beyond the historical12-header/12-opcode limits. This is not a full-battle original-ROM proof.'};
function check(id,key,got,want){if(Array.isArray(want)){if(!Array.isArray(got)||got.length!==want.length){report.mismatches++;report.examples.push({id,key,got,want});return;}want.forEach((v,i)=>check(id,key+'['+i+']',got[i],v));return;}report.fieldsCompared++;if(got!==want){report.mismatches++;if(report.examples.length<30)report.examples.push({id,key,got,want});}}
try{
 const rows=[];
 for(let i=0;i<args.length;i++)if(args[i]==='--source'){
  const bytes=await readFile(args[++i]),source=JSON.parse(bytes);report.sources.push({sha256:hash(bytes),path:args[i]});
  for(const original of source.results??[]){const c=original.case;if(!c?.residentPrograms||c.residentPrograms.length>12||c.residentPrograms.some(p=>p.codes.length>12||p.actions.length>32))continue;const row=cameraAdmissionInitial(c);rows.push({id:c.id,row,enabled:true},{id:c.id+'/disabled',row:clone(row),enabled:false});}
 }
 if(!rows.length)throw Error('At least one original fixture source is required');
 for(let start=0;start<rows.length;start+=16){
  const batch=rows.slice(start,start+16),legacy=await executor.runGraph('rom-camera-program-admission4',batch.map(x=>cameraProgramAdmissionInput(x.row,x.enabled))),actual=await runner.run({rows:batch.map(x=>x.row),enabled:batch.map(x=>x.enabled)});
  batch.forEach((r,i)=>{for(const[k,v]of Object.entries(legacy[i]))check(r.id,k,actual.outputs[i][k],v);});report.legacyRows+=batch.length;
 }
 const programs=Array.from({length:70},(_,i)=>({actions:[1000+i],codes:[],next:i+1<70?i+1:-1}));programs[0].actions=[1,1];programs[37].actions=[1];programs[5].actions=[221];
 programs[37].codes=Array.from({length:105},()=>({opcode:3,parameter:0}));for(const[index,opcode,parameter]of[[0,7,0],[64,12,5],[90,32,0],[100,34,0]])programs[37].codes[index]={opcode,parameter};programs[5].codes=[{opcode:12,parameter:7},{opcode:7,parameter:0}];
 const base={residentPrograms:programs,fallbackProgram:0,roster:[{id:0,residentProgram:0,visualFlags:128,objectFlags:0},{id:192,residentProgram:-1,visualFlags:0,objectFlags:0}],lookupObjects:[],commands:[{actionId:1,participants:[0],targets:[192]},{actionId:1,participants:[0],targets:[192]}],currentActionIndex:1,battleType:0,presentationState:0,rawActions:[],enabled:true};
 const fixtures=[{id:'second-match-after37-headers-and105-opcodes',row:clone(base),expected:{selectedProgram:[37],membershipCount:[2],resetOverride:[1],programProjection:[15,5]}},{id:'special221-search-across-large-table',row:{...clone(base),battleType:800},expected:{selectedProgram:[5],membershipCount:[2],specialOverride:[1],programProjection:[1,7]}},{id:'first-match-no-current-history',row:{...clone(base),currentActionIndex:0},expected:{selectedProgram:[0],membershipCount:[2],resetOverride:[0],programProjection:[0,0]}}];
 const actual=await runner.run({rows:fixtures.map(f=>f.row)});fixtures.forEach((f,i)=>{const before=report.mismatches;for(const[k,v]of Object.entries(f.expected))check(f.id,k,actual.outputs[i][k],v);report.wideCases.push({id:f.id,programs:f.row.residentPrograms.length,maximumOpcodes:105,passed:before===report.mismatches});});
}catch(error){report.error=error.stack;report.mismatches++;}finally{await executor.release();}
report.passed=report.mismatches===0;report.executionCounts=executor.counts;
if(option('--out')){await mkdir(dirname(resolve(option('--out'))),{recursive:true});await writeFile(option('--out'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
