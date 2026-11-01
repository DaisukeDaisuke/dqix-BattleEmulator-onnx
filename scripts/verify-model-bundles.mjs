#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createModelBundleLoader,decodeModelBundle} from '../runtime/model-bundle.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {GRAPH_INITIAL_INPUTS} from '../data/graph-inputs.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2);
const option=key=>{const at=args.indexOf(key);return at<0?undefined:args[at+1];};
const directory=resolve(option('--dist')??resolve(root,'dist')),hash=x=>createHash('sha256').update(x).digest('hex');
const index=JSON.parse(await readFile(resolve(directory,'runtime-index.json'),'utf8')),requests=[],checks=[];
const check=(name,passed,detail)=>{checks.push({name,passed:!!passed,detail});if(!passed)throw Error(name);};
const loader=createModelBundleLoader({index,fetchBytes:async path=>{requests.push(path);return new Uint8Array(await readFile(resolve(directory,path)));}});
const first=index.models[0].name;
const same=await Promise.all([loader.getModel(first),loader.getModel(first)]);
check('concurrent-model-load-downloads-one-bundle',same[0]===same[1]&&requests.length===1,requests.slice());
const models=await loader.loadAll();
check('all-models-use-at-most-three-downloads',models.size===index.models.length&&requests.length===index.bundles.length&&requests.length<=3,{models:models.size,requests:requests.slice()});
for(const model of models.values())check('unchanged-onnx-'+model.name,hash(model.onnx)===model.sha256);
const before=requests.length;await loader.loadAll();await loader.getModel(first);
check('warm-loader-performs-no-downloads',requests.length===before);

const descriptor=index.bundles[0],corrupt=new Uint8Array(await readFile(resolve(directory,descriptor.path)));corrupt[corrupt.length-1]^=1;
let rejected=false;try{await decodeModelBundle(corrupt,descriptor);}catch{rejected=true;}
check('corrupted-transfer-is-rejected-before-inference',rejected);
let attempts=0;
const retry=createModelBundleLoader({index,fetchBytes:async path=>{attempts++;if(attempts===1)throw Error('simulated transfer failure');return new Uint8Array(await readFile(resolve(directory,path)));}});
try{await retry.getModel(first);}catch{}
check('failed-transfer-can-retry',hash((await retry.getModel(first)).onnx)===models.get(first).sha256&&attempts===2);

const ort=await loadLocalOrt(option('--ort-dir')??process.env.ORT_RUNTIME_DIR);
const bundled=createGraphExecutor({models,ortRuntime:ort}),original=new Map();
const names=['rom-rng-normalize','rom-physical'];
for(const name of names){const ir=JSON.parse(await readFile(resolve(root,'graph-v2',name+'.json'),'utf8')),onnx=await readFile(resolve(root,'graph-v2',name+'.onnx'));original.set(name,{name,ir,onnx});}
const unbundled=createGraphExecutor({models:original,ortRuntime:ort});
let fieldsCompared=0;
try{
  for(const name of names){
    const input=structuredClone(GRAPH_INITIAL_INPUTS[name]);if(!input)throw Error('Missing primitive initial data '+name);
    const rows=[input,structuredClone(input),structuredClone(input)];
    if(rows[1].seed)rows[1].seed=[255,255,255,255,255,255,255,255];
    if(rows[2].seed)rows[2].seed=[0,1,2,3,4,5,6,7];
    const want=await unbundled.runGraph(name,rows),actual=await bundled.runGraph(name,rows);
    check('actual-ORT-results-unchanged-'+name,JSON.stringify(actual)===JSON.stringify(want));
    for(const row of actual)for(const values of Object.values(row))fieldsCompared+=values.length;
  }
}finally{await bundled.release();await unbundled.release();}
const result={schema:'dq9-model-bundle-verification-v1',passed:checks.every(c=>c.passed),models:models.size,bundleDownloads:requests.length,previousIndividualModelAndIrDownloads:models.size*2,fieldsCompared,checks,scope:'Transfer grouping and exact bytes; actual ORT output equality for two shared numerical modules. This is not independent ROM or whole-battle proof.'};
if(option('--out'))await writeFile(resolve(option('--out')),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result,checks:checks.filter(c=>!c.name.startsWith('unchanged-onnx-'))},null,2));
