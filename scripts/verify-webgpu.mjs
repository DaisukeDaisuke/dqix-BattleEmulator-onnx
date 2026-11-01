#!/usr/bin/env node
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,basename} from 'node:path';
import {pathToFileURL} from 'node:url';

// Existing browser/runtime files only. --software-adapter checks correctness
// through SwiftShader; its timings are never a hardware performance result.
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i++){
  if(args[i]==='--software-adapter'){options.softwareAdapter=true;continue;}
  if(!['--html','--browser','--ort-dir','--out','--playwright-dir'].includes(args[i])||!args[i+1])throw Error('Use --html FILE --browser EXISTING_CHROMIUM --ort-dir EXISTING_ORT_DIST --out JSON [--playwright-dir EXISTING_NODE_MODULES] [--software-adapter]');
  options[args[i].slice(2)]=args[++i];
}
for(const name of ['html','browser','ort-dir','out'])if(!options[name])throw Error('Missing --'+name);
const require=createRequire(import.meta.url),playwrightDirectory=options['playwright-dir']??process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const {chromium}=require(playwrightDirectory?resolve(playwrightDirectory,'playwright'):'playwright');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),runtimeFiles={},errors=[],warnings=[];
const browser=await chromium.launch({executablePath:resolve(options.browser),headless:true,args:['--no-sandbox',...(options.softwareAdapter?['--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan','--disable-vulkan-surface']:[])]});
const page=await browser.newPage();page.setDefaultTimeout(180000);
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='warning'||message.type()==='error')warnings.push(message.text());});
await page.route('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/*',async route=>{
  const name=basename(new URL(route.request().url()).pathname);
  if(!['ort.webgpu.min.mjs','ort.wasm.min.mjs','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm','ort-wasm-simd-threaded.jsep.mjs','ort-wasm-simd-threaded.jsep.wasm','ort-wasm-simd-threaded.asyncify.mjs','ort-wasm-simd-threaded.asyncify.wasm'].includes(name)){await route.abort();errors.push('Unexpected runtime '+name);return;}
  try{const bytes=await readFile(resolve(options['ort-dir'],name));runtimeFiles[name]=hash(bytes);await route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:name.endsWith('.wasm')?'application/wasm':'text/javascript',body:bytes});}
  catch(error){await route.abort();errors.push(error.message);}
});
let adapter,result,mixed,noAdapter;
try{
  await page.goto(pathToFileURL(resolve(options.html)).href);await page.waitForFunction(()=>window.DQ9Release?.ready);
  adapter=await page.evaluate(async()=>{const a=await navigator.gpu?.requestAdapter({powerPreference:'high-performance'}),i=a?.info;return{available:!!navigator.gpu,adapter:!!a,info:i?{vendor:i.vendor,architecture:i.architecture,device:i.device,description:i.description,isFallbackAdapter:i.isFallbackAdapter}:null};});
  await page.evaluate(()=>{
    window.DQ9Release.selectMode('zilyadama_new_arugo__zilyadama_v6_tamahane');
    document.getElementById('warmup').checked=false;document.getElementById('trace').checked=false;
    document.getElementById('batch').value='2';document.getElementById('chunk').value='2';document.getElementById('limit').value='1';document.getElementById('transitions').value='100000';
    document.getElementById('backend').value='onnxruntime-webgpu';
  });
  if(!adapter.adapter){
    noAdapter=await page.evaluate(async()=>{try{await window.DQ9Release.run();return{rejected:false};}catch(error){return{rejected:true,message:error.message,status:document.getElementById('status').textContent,resultProduced:!!window.DQ9Release.lastResult,busy:window.DQ9Release.busy};}});
  }else{
    // Execute the exact public executor with both providers present in one
    // instance, including a real DOUBLE camera module after GPU RNG dispatch.
    mixed=await page.evaluate(async()=>{
      const assets=window.DQ9Release.assets,urls=new Map();
      async function sourceUrl(path){if(urls.has(path))return urls.get(path);let source=assets.sources[path];if(typeof source!=='string')throw Error('Missing bundled source '+path);for(const match of [...source.matchAll(/\bfrom\s*(['"])(\.[^'"]+)\1/g)]){const dependency=new URL(match[2],new URL(path,'https://dq9.invalid/')).pathname.slice(1);source=source.replace(match[0],'from '+JSON.stringify(await sourceUrl(dependency)));}const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));urls.set(path,url);return url;}
      const {createGraphExecutor}=await import(await sourceUrl('web/graph-executor.mjs'));
      const gpu=createGraphExecutor({models:assets.models,backend:'onnxruntime-webgpu'}),cpu=createGraphExecutor({models:assets.models,backend:'onnxruntime-wasm'}),rows=[
        {seed:[1,0,0,0,0,0,0,0],position:[1],maximum:[1000],enabled:[true]},
        {seed:Array(8).fill(255),position:[100],maximum:[1000],enabled:[true]},
        {seed:Array(8).fill(0),position:[7],maximum:[100],enabled:[false]}
      ];
      try{
        const randomGpu=await gpu.runGraph('rom-common-random',rows),randomCpu=await cpu.runGraph('rom-common-random',rows);
        const cameraRows=[{position:[20000,4096,30000],lookAt:[0,204,0]},{position:[-30000,-4096,18000],lookAt:[10,-255,99]}];
        const cameraGpu=await gpu.runGraph('rom-camera-reverse-polar-values-cpu3',cameraRows),cameraCpu=await cpu.runGraph('rom-camera-reverse-polar-values-cpu3',cameraRows);
        return{randomExact:JSON.stringify(randomGpu)===JSON.stringify(randomCpu),cameraExact:JSON.stringify(cameraGpu)===JSON.stringify(cameraCpu),counts:gpu.counts,explicitCpuModels:[...gpu.explicitCpuModels],providers:Object.fromEntries(gpu.executedModelProviders),adapterInfo:gpu.gpuAdapterInfo};
      }finally{await gpu.release();await cpu.release();for(const url of urls.values())URL.revokeObjectURL(url);}
    });
    console.error('Mixed actual GPU/WASM module comparison completed.');
    result=await page.evaluate(async()=>{
      const record=await window.DQ9Release.compare(),r=record.result;
      return{programHash:record.programHash,comparison:record.comparison,complete:r.complete,wholeBattleComplete:r.wholeBattleComplete,numericOnly:r.numericOnly,requestedInputs:r.requestedInputs,completedInputs:r.completedInputs,counts:r.graphExecutionCounts,providers:r.executedModelProviders,explicitCpuModels:r.explicitCpuModels,gpuAdapterInfo:r.gpuAdapterInfo,deviceLabel:document.getElementById('device').textContent,states:r.rows.map(row=>({seed:row.seed,position:row.position,completedTurns:row.completedTurns,supported:row.supported})),implicitCpuFallback:r.implicitCpuFallback};
    });
  }
}catch(error){errors.push(error.stack??String(error));}
finally{await browser.close();}
const passed=errors.length===0&&(adapter?.adapter?mixed?.randomExact&&mixed?.cameraExact&&mixed.counts.webgpuCalls===1&&mixed.counts.wasmCalls===1&&mixed.explicitCpuModels.length===1&&result?.comparison?.differences===0&&result.complete&&result.completedInputs===2&&result.counts.webgpuCalls>0&&result.counts.wasmCalls===0&&result.implicitCpuFallback===false:noAdapter?.rejected&&!noAdapter.resultProduced&&!noAdapter.busy);
const report={schema:'dq9-public-webgpu-verification-v1',passed:!!passed,htmlSha256:hash(await readFile(options.html)),adapter,softwareAdapterRequested:!!options.softwareAdapter,hardwarePerformanceMeasured:false,gpuExecutionVerified:!!result?.counts?.webgpuCalls,mixed,result,noAdapter,runtimeFiles,errors,warnings};
await writeFile(resolve(options.out),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,warnings:warnings.length},null,2));if(!passed)process.exitCode=1;
