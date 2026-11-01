#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {buildCommonMessageQueue,buildCommonMessageController} from '../graph-v2/build-common-message-controller.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex'),suffix=x=>x[0].toUpperCase()+x.slice(1);
export async function verifyCommonMessageController({sourcePath,ortDirectory}={}){
 const bytes=await readFile(resolve(sourcePath)),source=JSON.parse(bytes);if(!source.programUnmodified||!source.initialDataOnly||!source.results.length||source.results.some(r=>!r.ok||!r.strictInitializedMemory))throw Error('Strict complete original ARM evidence required');
 const models=new Map([buildCommonMessageQueue(),buildCommonMessageController()].map(g=>{const onnx=g.model();return[g.name,{name:g.name,onnx,ir:g.json(),sha256:hash(onnx)}];})),executor=createGraphExecutor({models,backend:'onnxruntime-wasm',ortRuntime:await loadLocalOrt(ortDirectory)}),results=[];
 const call=async(name,values)=>{const m=models.get(name),d={...m.ir.contract.defaults,...values},feed=Object.fromEntries(m.ir.inputs.map(v=>[v.name,Array.isArray(d[v.name])?d[v.name]:[d[v.name]]]));return(await executor.runGraph(name,[feed]))[0];};
 try{for(const record of source.results){const c=record.case,actual=await call('rom-common-message-queue',c),report={id:c.id,operation:c.operation,fieldsCompared:0,mismatches:0,examples:[]};
   const compare=(key,want,got)=>{want=Array.isArray(want)?want:[want];got=Array.isArray(got)?got:[got];for(let i=0;i<want.length;i++){report.fieldsCompared++;if(want[i]!==got[i]){report.mismatches++;if(report.examples.length<12)report.examples.push({key,index:i,want:want[i],actual:got[i]});}}};
   for(const key of['messageIds','targets','extraSources','serials','holds','types','contextsU16','active','serialCounter','cursor'])compare(key,record.after[key],actual['next'+suffix(key)]);
   if(c.operation===0)compare('returnValue',record.returnValue,actual.returnValue);
   if(c.operation===2){const state=await call('rom-common-message-controller',{...c,operation:1,contextU16:c.priorContextU16});for(const key of['active','phase','holdTimer','defaultHold','savedSource','contextU16'])compare(key,record.after[key],state['next'+suffix(key)]);}
   results.push(report);
  }return{schema:'dq9-common-message-controller-arm-verification-v1',passed:results.every(r=>r.mismatches===0),cases:results.length,fieldsCompared:results.reduce((n,r)=>n+r.fieldsCompared,0),mismatches:results.reduce((n,r)=>n+r.mismatches,0),source:resolve(sourcePath),sourceSHA256:hash(bytes),romSHA256:source.romSHA256,backend:'onnxruntime-wasm',models:[...models.values()].map(m=>({name:m.name,sha256:m.sha256,nodes:m.ir.nodes.length,bytes:m.onnx.length})),scope:'Original JPN021ed62c initialization,021ed6f4 pop and021ed884 push execute unchanged on request-only initial arrays. Exact tail retention, zero-message/full-queue/type rejection, signed16 cursor truncation and serial wrap are checked. Resource dispatch and show commit branches require separate enclosing integration proof.',results};
 }finally{await executor.release();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const args=process.argv.slice(2),options={};let out;for(let i=0;i<args.length;i++){if(args[i]==='--source')options.sourcePath=args[++i];else if(args[i]==='--ort-dir')options.ortDirectory=args[++i];else if(args[i]==='--out')out=args[++i];else throw Error('Unknown argument '+args[i]);}const report=await verifyCommonMessageController(options);if(out)await writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;}
