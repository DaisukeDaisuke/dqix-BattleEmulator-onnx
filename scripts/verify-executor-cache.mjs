#!/usr/bin/env node
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,basename} from 'node:path';
import {pathToFileURL} from 'node:url';

// Runs the exact bundled executor with the existing official runtime. This
// verifies lifecycle/provider boundaries; full battle/frame QA is separate.
const options={};
for(let i=2;i<process.argv.length;i++){
  const key=process.argv[i];if(key==='--software-adapter'){options.softwareAdapter=true;continue;}
  if(!['--html','--browser','--ort-dir','--out','--playwright-dir'].includes(key)||!process.argv[i+1])throw Error('Use --html FILE --browser EXISTING_CHROMIUM --ort-dir EXISTING_ORT --out JSON [--playwright-dir EXISTING_NODE_MODULES] [--software-adapter]');
  options[key.slice(2)]=process.argv[++i];
}
for(const key of ['html','browser','ort-dir','out'])if(!options[key])throw Error('Missing --'+key);
const require=createRequire(import.meta.url),modules=options['playwright-dir']??process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const {chromium}=require(modules?resolve(modules,'playwright'):'playwright');
const hash=value=>createHash('sha256').update(value).digest('hex'),errors=[],warnings=[],runtimeFiles={};
const browser=await chromium.launch({executablePath:resolve(options.browser),headless:true,args:['--no-sandbox',...(options.softwareAdapter?['--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan','--disable-vulkan-surface']:[])]});
const page=await browser.newPage();page.setDefaultTimeout(180000);
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error'||message.type()==='warning')warnings.push(message.text());});
await page.route('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/*',async route=>{
  const name=basename(new URL(route.request().url()).pathname);
  if(!['ort.webgpu.min.mjs','ort.wasm.min.mjs','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm','ort-wasm-simd-threaded.jsep.mjs','ort-wasm-simd-threaded.jsep.wasm','ort-wasm-simd-threaded.asyncify.mjs','ort-wasm-simd-threaded.asyncify.wasm'].includes(name)){await route.abort();errors.push('Unexpected runtime '+name);return;}
  try{const bytes=await readFile(resolve(options['ort-dir'],name));runtimeFiles[name]=hash(bytes);await route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:name.endsWith('.wasm')?'application/wasm':'text/javascript',body:bytes});}
  catch(error){await route.abort();errors.push(error.message);}
});
let result;
try{
  await page.goto(pathToFileURL(resolve(options.html)).href);await page.waitForFunction(()=>window.DQ9Release?.ready);
  result=await page.evaluate(async()=>{
    const assets=window.DQ9Release.assets,urls=new Map(),checks=[];
    const check=(name,passed,detail)=>checks.push({name,passed:!!passed,detail});
    async function sourceUrl(path){
      if(urls.has(path))return urls.get(path);let source=assets.sources[path];if(typeof source!=='string')throw Error('Missing source '+path);
      for(const match of [...source.matchAll(/\bfrom\s*(['"])(\.[^'"]+)\1/g)]){const dependency=new URL(match[2],new URL(path,'https://dq9.invalid/')).pathname.slice(1);source=source.replace(match[0],'from '+JSON.stringify(await sourceUrl(dependency)));}
      const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));urls.set(path,url);return url;
    }
    const {createGraphExecutorCache,createGraphExecutor}=await import(await sourceUrl('web/graph-executor.mjs'));
    const cache=createGraphExecutorCache(),base={models:assets.models,programHash:assets.commonProgramHash,ortVersion:assets.ortVersion};
    const random='rom-common-random',camera='rom-camera-reverse-polar-values-cpu3';
    const randomRows=[{seed:[1,0,0,0,0,0,0,0],position:[1],maximum:[1000],enabled:[true]},{seed:Array(8).fill(255),position:[100],maximum:[1000],enabled:[true]},{seed:Array(8).fill(0),position:[7],maximum:[100],enabled:[false]}];
    const cameraRows=[{position:[20000,4096,30000],lookAt:[0,204,0]},{position:[-30000,-4096,18000],lookAt:[10,-255,99]}];
    const requests=[[random,randomRows],[camera,cameraRows]];
    async function run(backend,work=requests,extra={}){
      return cache.withExecutor({...base,backend,...extra},async(executor,info)=>{
        const output=[];for(const [name,rows]of work)output.push(await executor.runGraph(name,rows));
        return{info,output,counts:{...executor.counts},providers:Object.fromEntries(executor.executedModelProviders),explicitCpu:[...executor.explicitCpuModels],explicitOrt:[...executor.explicitOrtModels],sessions:executor.sessionStats,adapter:executor.gpuAdapterInfo};
      });
    }
    const observations={};
    try{
      const cold=observations.cold=await run('onnxruntime-wasm');
      const warm=observations.warm=await run('onnxruntime-wasm',requests.slice(0,1));
      check('same-identity-retains-two-actual-ORT-sessions',!cold.info.reused&&cold.sessions.created===2&&warm.info.reused&&warm.info.executorId===cold.info.executorId&&warm.sessions.created===2&&JSON.stringify(cold.output[0])===JSON.stringify(warm.output[0]),{cold:cold.info,warm:warm.info,sessions:warm.sessions});
      check('per-operation-counts-and-provider-list-reset',warm.counts.ortCalls===1&&warm.counts.rows===3&&Object.keys(warm.providers).length===1&&warm.providers[random]==='onnxruntime-wasm',warm);
      const reversed=await run('onnxruntime-wasm',requests.slice(0,1),{models:[...assets.models].reverse()});
      check('model-order-is-not-an-identity-change',reversed.info.reused&&reversed.info.executorId===cold.info.executorId,reversed.info);
      const changed=structuredClone(randomRows);changed[0].seed=[9,8,7,6,5,4,3,2];
      const changedResult=await run('onnxruntime-wasm',[[random,changed]]);
      const fresh=createGraphExecutor({models:assets.models,backend:'onnxruntime-wasm'});let freshOutput;
      try{freshOutput=await fresh.runGraph(random,changed);}finally{await fresh.release();}
      check('new-inputs-use-retained-sessions-without-retained-row-state',changedResult.info.reused&&JSON.stringify(changedResult.output[0])===JSON.stringify(freshOutput)&&JSON.stringify(changedResult.output[0])!==JSON.stringify(cold.output[0])&&randomRows[0].seed[0]===1,changedResult.info);
      const native=observations.native=await run('native-wasm');
      check('backend-change-releases-prior-sessions',!native.info.reused&&native.info.releasedPreviousSessions===2&&native.info.executorId!==cold.info.executorId&&JSON.stringify(native.output)===JSON.stringify(cold.output),native.info);
      check('native-explicit-ORT-provider-is-actual',native.counts.nativeCalls===1&&native.counts.wasmCalls===1&&native.explicitOrt.length===1&&native.explicitOrt[0]===camera,native);
      const nativeRandom=await run('native-wasm',requests.slice(0,1));
      const nativeCamera=await run('native-wasm',requests.slice(1));
      check('cached-explicit-provider-is-reported-only-when-executed',nativeRandom.info.reused&&nativeRandom.explicitOrt.length===0&&nativeRandom.counts.nativeCalls===1&&nativeRandom.counts.wasmCalls===0&&nativeCamera.info.reused&&nativeCamera.explicitOrt[0]===camera&&nativeCamera.counts.wasmCalls===1&&nativeCamera.counts.nativeCalls===0,{random:nativeRandom,camera:nativeCamera});
      let canceled=false;
      try{await run('native-wasm',requests.slice(0,1),{shouldStop:()=>true});}catch(error){canceled=error.message==='停止しました。';}
      const canceledState=cache.snapshot();
      const afterCancel=await run('onnxruntime-wasm',requests.slice(0,1));
      check('cancellation-does-not-leak-to-next-operation',canceled&&canceledState.active===null&&JSON.stringify(afterCancel.output[0])===JSON.stringify(cold.output[0])&&afterCancel.counts.ortCalls===1,{canceledState,next:afterCancel.info});
      const differentHash=(base.programHash[0]==='0'?'1':'0')+base.programHash.slice(1);
      const identity=await run('onnxruntime-wasm',requests.slice(0,1),{programHash:differentHash});
      check('program-identity-change-releases-session',!identity.info.reused&&identity.info.releasedPreviousSessions===1&&identity.info.executorId!==afterCancel.info.executorId,identity.info);
      const subset=await run('onnxruntime-wasm',requests.slice(0,1),{programHash:differentHash,models:assets.models.filter(model=>model.name===random)});
      check('model-manifest-change-releases-session',!subset.info.reused&&subset.info.releasedPreviousSessions===1,subset.info);
      const order=[];
      const operations=[0,1].map(index=>cache.withExecutor({...base,backend:'onnxruntime-wasm'},async(executor,info)=>{order.push(index+' start');const output=await executor.runGraph(random,randomRows);order.push(index+' end');return{info,counts:{...executor.counts},output};}));
      const parallel=await Promise.all(operations);
      check('concurrent-requests-own-separate-metrics-and-callback-leases',JSON.stringify(order)===JSON.stringify(['0 start','0 end','1 start','1 end'])&&parallel.every(item=>item.counts.ortCalls===1&&item.counts.rows===3)&&parallel[1].info.reused&&JSON.stringify(parallel[0].output)===JSON.stringify(parallel[1].output),{order,operations:parallel.map(({info,counts})=>({info,counts}))});
      const closing=createGraphExecutor({models:assets.models,backend:'onnxruntime-wasm'});
      const queued=[closing.runGraph(random,randomRows),closing.runGraph(random,randomRows)],release=closing.release();
      const rejected=await Promise.allSettled([closing.runGraph(random,randomRows),closing.getSession(camera)]);
      const completed=await Promise.all(queued);await release;
      check('release-finishes-queued-transitions-and-rejects-new-submissions',rejected.every(item=>item.status==='rejected')&&completed.every(output=>JSON.stringify(output)===JSON.stringify(cold.output[0]))&&closing.counts.ortCalls===2&&closing.sessionStats.loaded===0&&closing.sessionStats.released===1,{rejected:rejected.map(item=>item.status),counts:closing.counts,sessions:closing.sessionStats});
      const adapter=await navigator.gpu?.requestAdapter({powerPreference:'high-performance'});
      if(adapter){
        const gpu=observations.gpu=await run('onnxruntime-webgpu');
        const gpuRandom=observations.gpuRandom=await run('onnxruntime-webgpu',requests.slice(0,1));
        check('strict-GPU-and-explicit-DOUBLE-WASM-share-a-retained-executor',JSON.stringify(gpu.output)===JSON.stringify(cold.output)&&gpu.counts.webgpuCalls===1&&gpu.counts.wasmCalls===1&&gpu.explicitCpu.length===1&&gpu.explicitCpu[0]===camera,gpu);
        check('cached-GPU-run-does-not-inherit-DOUBLE-provider-counts',gpuRandom.info.reused&&gpuRandom.sessions.created===2&&gpuRandom.counts.webgpuCalls===1&&gpuRandom.counts.wasmCalls===0&&gpuRandom.explicitCpu.length===0&&Object.keys(gpuRandom.providers).length===1,gpuRandom);
        const cpu=await run('onnxruntime-wasm',requests.slice(0,1));
        check('switching-away-from-GPU-releases-both-provider-sessions',cpu.info.releasedPreviousSessions===2&&cpu.counts.webgpuCalls===0&&cpu.counts.wasmCalls===1,cpu.info);
      }else{
        let rejected=false;try{await run('onnxruntime-webgpu',requests.slice(0,1));}catch(error){rejected=/WebGPU/.test(error.message);}
        const failed=cache.snapshot(),cpu=await run('onnxruntime-wasm',requests.slice(0,1));
        observations.noAdapter={rejected,failed,next:cpu.info};
        check('missing-GPU-adapter-never-caches-an-implicit-CPU-result',rejected&&failed.active===null&&cpu.counts.wasmCalls===1&&cpu.counts.webgpuCalls===0&&JSON.stringify(cpu.output[0])===JSON.stringify(cold.output[0]),observations.noAdapter);
      }
      const before=cache.snapshot(),after=await cache.release();
      check('explicit-release-disposes-last-live-executor',before.active?.sessionStats.loaded===1&&after.active===null&&after.releasedExecutors===after.createdExecutors,{before,after});
      return{checks,observations,finalCacheState:after,hardwarePerformanceMeasured:false};
    }finally{await cache.release();for(const url of urls.values())URL.revokeObjectURL(url);}
  });
}catch(error){errors.push(error.stack??String(error));}
finally{await browser.close();}
const report={schema:'dq9-executor-cache-verification-v1',passed:errors.length===0&&!!result?.checks.length&&result.checks.every(check=>check.passed),htmlSha256:hash(await readFile(options.html)),softwareAdapterRequested:!!options.softwareAdapter,runtimeFiles,...result,errors,warnings};
await writeFile(resolve(options.out),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,warnings:warnings.length},null,2));if(!report.passed)process.exitCode=1;
