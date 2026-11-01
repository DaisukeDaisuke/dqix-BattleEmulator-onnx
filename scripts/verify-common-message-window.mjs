#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {buildCommonMessageWindowBegin,buildCommonMessageFontStep,buildCommonMessageConsumeStep} from '../graph-v2/build-common-message-window.mjs';
import {createCommonMessageWindowRunner,initialCommonMessageWindow} from '../runtime/common-message-window.mjs';
import {parseOriginalStaticFontTables,compileStaticMessage} from '../runtime/common-message-data.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

export async function verifyCommonMessageWindow({sourcePath,ortDirectory}={}){
  const bytes=await readFile(resolve(sourcePath)),source=JSON.parse(bytes);
  if(!source.programUnmodified||!source.initialDataOnly||!source.results?.length||source.results.some(r=>!r.ok||!r.strictInitializedMemory))throw Error('Complete strict original ARM message-window evidence required');
  const models=new Map();for(const g of[buildCommonMessageWindowBegin(),buildCommonMessageFontStep(),buildCommonMessageConsumeStep()]){const onnx=g.model(),ir=g.json();models.set(g.name,{name:g.name,onnx,ir,sha256:hash(onnx)});}
  const executor=createGraphExecutor({models,backend:'onnxruntime-wasm',ortRuntime:await loadLocalOrt(ortDirectory)}),fonts=parseOriginalStaticFontTables(source.initialFontTables),runner=createCommonMessageWindowRunner({runGraph:executor.runGraph,fonts}),results=[];
  try{
    for(const record of source.results){
      const c=record.case,initial={...initialCommonMessageWindow(),windowActive:!!(c.windowActive??1),windowState:c.windowState??5,glyphCount:c.glyphCount??14};
      for(const key of['rawTokens','outputTokens','produced','total','index','slotReferences','allocationBits','glyphCount','fontSize'])if(c[key]!==undefined)initial[key]=c[key];initial.rubyMode=!!c.rubyMode;
      let actual;
      if(c.kind==='show_text'){
        const substitutions={ACTER:c.formatFields?.['23c']??'',SEL:c.formatFields?.['27c']??'',TARGET:c.formatFields?.['2bc']??'',ACTION:c.formatFields?.['2fc']??'',REFLEX:c.formatFields?.['33c']??'',VAL:Uint8Array.from(String(c.numericValue??0),x=>x.charCodeAt(0))};
        actual=await runner.begin(initial,compileStaticMessage(c.textHex,{substitutions}));
      }else actual=c.kind==='ui_frame'?await runner.consume(initial,{ticks:c.argument??16,fastText:!!(c.fastText??1)}):await runner.font(initial,{argument:c.argument??16,tickCount:c.tickCount??1,oneCall:c.kind==='font_step'});
      const report={id:c.id,kind:c.kind,fieldsCompared:0,mismatches:0,examples:[]};
      for(const key of['rawTokens','outputTokens','produced','total','index','windowActive','windowState','glyphCount','rubyMode','slotReferences','allocationBits']){
        const want=Array.isArray(record.after[key])?record.after[key]:[record.after[key]],got=Array.isArray(actual[key])?actual[key]:[actual[key]];
        for(let i=0;i<want.length;i++){report.fieldsCompared++;if(Number(want[i])!==Number(got[i])){report.mismatches++;if(report.examples.length<10)report.examples.push({field:key,index:i,want:want[i],actual:got[i]});}}
      }
      results.push(report);
    }
    return{schema:'dq9-common-message-window-arm-verification-v1',passed:results.every(r=>r.mismatches===0),source:resolve(sourcePath),sourceSHA256:hash(bytes),romSHA256:source.romSHA256,cases:results.length,fieldsCompared:results.reduce((n,r)=>n+r.fieldsCompared,0),mismatches:results.reduce((n,r)=>n+r.mismatches,0),backend:'onnxruntime-wasm',models:[...models.values()].map(m=>({name:m.name,sha256:m.sha256,nodes:m.ir.nodes.length,bytes:m.onnx.length})),scope:'Original admitted show-text, full font-inner-loop/font-frame and quiet full UI frame compared on token buffers, counters, references and allocator state. Every test begins with request data and original static-font assets; no observed intermediate or expected output is fed into ONNX. Show-text coverage includes real original messages, named substitutions, ASCII normalization and balanced ruby under the explicit static-font/null-renderer contract. No full world/render timing claim.',results};
  }finally{await executor.release();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),options={ortDirectory:process.env.ORT_RUNTIME_DIR};let out;
  for(let i=0;i<args.length;i++){if(args[i]==='--source')options.sourcePath=args[++i];else if(args[i]==='--ort-dir')options.ortDirectory=args[++i];else if(args[i]==='--out')out=args[++i];else throw Error('Unknown argument '+args[i]);}
  const report=await verifyCommonMessageWindow(options);if(out)await writeFile(resolve(out),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
}
