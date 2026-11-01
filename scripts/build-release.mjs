#!/usr/bin/env node
import {readFile,writeFile,mkdir,readdir,rm,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,join,relative,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildGraphs} from './build-graphs.mjs';
import {buildHtml} from './build-html.mjs';
import {ENCOUNTER_DEFINITIONS,BATTLE_DEFINITIONS,makeEncounterInput} from '../data/common-battle.mjs';
import {COMMON_PRESENTATION_EXAMPLE} from '../data/common-presentation-example.mjs';
import {COMMON_FUNCTIONAL_FRAME_EXAMPLE} from '../data/common-functional-frame-example.mjs';
import {CAMERA_MODES} from '../data/camera-modes.mjs';
import {ACTOR_FIELDS} from '../graph-v2/rules.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=value=>createHash('sha256').update(value).digest('hex');
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const PUBLIC_MODELS=['rom-rng-normalize','rom-physical','rom-buff-stats','rom-vital-effect','rom-extra-actions','rom-weighted-ai6'];
async function files(directory){
  const result=[];
  for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    const path=join(directory,entry.name);
    if(entry.isDirectory())result.push(...await files(path));
    else if(entry.isFile())result.push(path);
    else throw Error('Unsupported release entry '+path);
  }
  return result;
}

export async function buildRelease({out=join(root,'dist'),reuseGenerated=false}={}){
  out=resolve(out);
  const outputRoot=relative(root,out).split(/[\\/]/)[0];
  if(outputRoot!=='dist'&&!outputRoot.startsWith('dist-'))throw Error('Output must be inside dist or dist-* under the source checkout');
  if(!reuseGenerated)buildGraphs({root});
  // This directory contains generated output only; source paths are never removed.
  await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
  const models=new Map(),publicNames=new Set(PUBLIC_MODELS);
  const explicitCpu=new Set(CAMERA_MODES.flatMap(mode=>mode.explicitCpuModels??[]));
  async function loadModel(irPath,onnxPath,expectedHash){
    const ir=await json(irPath),onnx=await readFile(onnxPath),sha256=hash(onnx);
    const supportedSchema=ir.schema==='dq9-graph-ir-v2'||ir.schema==='dq9-cpu-double-graph-ir-v1'&&explicitCpu.has(ir.name);
    if(!supportedSchema||!ir.name||expectedHash&&expectedHash!==sha256)throw Error('Generated model binding differs '+irPath);
    const old=models.get(ir.name);
    if(old){if(old.sha256!==sha256||JSON.stringify(old.ir)!==JSON.stringify(ir))throw Error('Conflicting graph identity '+ir.name);return old;}
    const model={name:ir.name,ir,onnx,sha256,public:publicNames.has(ir.name),executionProvider:explicitCpu.has(ir.name)?'wasm-explicit-cpu':undefined};
    models.set(ir.name,model);return model;
  }
  const programPath=join(root,'graph-v2/common-battle-program.json'),commonProgram=await json(programPath),actionCoverage=await json(join(root,'graph-v2/common-action-coverage.json'));
  if(!Array.isArray(commonProgram.modules)||!commonProgram.modules.length)throw Error('The shared battle program has no modules');
  for(const module of commonProgram.modules)await loadModel(resolve(dirname(programPath),module.ir),resolve(dirname(programPath),module.onnx),module.sha256);
  const commonProgramHash=hash(JSON.stringify(commonProgram));
  const encounters=ENCOUNTER_DEFINITIONS.map(definition=>({id:definition.id,titleJa:definition.titleJa??definition.name??String(definition.id),scopeJa:definition.scopeJa??'',inputs:makeEncounterInput(definition.id)}));
  encounters.push(structuredClone(COMMON_PRESENTATION_EXAMPLE));
  encounters.push(structuredClone(COMMON_FUNCTIONAL_FRAME_EXAMPLE));
  const required=new Set([...publicNames,...CAMERA_MODES.flatMap(mode=>mode.models)]);
  for(const name of required){
    if(models.has(name))continue;
    let found=false;
    for(const dir of ['graph-v2','graph-v2/encounter-expansion']){
      const path=join(root,dir,name+'.json');
      try{await readFile(path);}catch(error){if(error.code==='ENOENT')continue;throw error;}
      const model=await loadModel(path,join(root,dir,name+'.onnx'));
      if(model.name!==name)throw Error('Graph filename and name differ '+name);
      found=true;break;
    }
    if(!found)throw Error('Required graph has not been generated '+name);
  }
  const ordered=[...models.values()].sort((a,b)=>a.name.localeCompare(b.name));
  await mkdir(join(out,'models'),{recursive:true});await mkdir(join(out,'programs'),{recursive:true});
  for(const model of ordered){
    await writeFile(join(out,'models',model.name+'.onnx'),model.onnx);
    await writeFile(join(out,'models',model.name+'.json'),JSON.stringify(model.ir)+'\n');
  }
  // Keep the exact common definition unchanged in the HTML and JSON artifact.
  // Model locations are resolved by name using runtime-index.json, never by boss.
  await writeFile(join(out,'programs/common-battle.json'),JSON.stringify(commonProgram)+'\n');
  await mkdir(join(out,'data'),{recursive:true});
  await writeFile(join(out,'data/definitions.json'),JSON.stringify(BATTLE_DEFINITIONS)+'\n');
  await writeFile(join(out,'data/encounters.json'),JSON.stringify(encounters,null,2)+'\n');
  await writeFile(join(out,'data/action-coverage.json'),JSON.stringify(actionCoverage,null,2)+'\n');
  const html=await buildHtml({root,out,models:ordered,commonProgram,definitions:BATTLE_DEFINITIONS,encounters,actionCoverage,cameras:CAMERA_MODES,actorFields:ACTOR_FIELDS});
  const coverage={battlePrograms:1,bossSpecificPrograms:false,commonProgramHash,encounterInputs:encounters.length,cameraModes:CAMERA_MODES.length,publicPrimitiveGraphs:PUBLIC_MODELS.length,totalGraphs:ordered.length,seedFiltering:false,learnedApproximation:false,implicitCpuFallback:false,fullGameComplete:false,authority:'Original ROM execution and matching decompile; previous emulator is an independent comparator.',limitations:['An encounter is input data, not a separately verified battle. Definition counts do not claim full action-effect or whole-game coverage.','Unsupported effects, controls and camera state are reported in the execution result rather than replaced with approximations.','Turn/transition budget exhaustion preserves the unfinished state and is never counted as a win or loss.','WASM is the default. Optional WebGPU is strict with no CPU fallback, apart from separately declared DOUBLE models executed by standalone WASM. Adapter identity and actual provider counts are reported; hardware speedup is not inferred.']};
  const runtimeIndex={schema:'dq9-runtime-index-v2',coverage,
    models:ordered.map(({name,sha256,public:visible,executionProvider})=>({name,sha256,public:visible,executionProvider,onnx:'models/'+name+'.onnx',ir:'models/'+name+'.json'})),
    commonProgram:{id:'common-battle',programHash:commonProgramHash,path:'programs/common-battle.json',moduleHashes:Object.fromEntries(commonProgram.modules.map(module=>[module.name,module.sha256]))},
    definitions:'data/definitions.json',actionCoverage:'data/action-coverage.json',
    encounters:encounters.map(({id,titleJa})=>({id,titleJa,programHash:commonProgramHash,program:'common-battle'})),
    encounterInputs:'data/encounters.json',cameras:CAMERA_MODES,html:'dq9-battle-emulator.html'};
  await writeFile(join(out,'runtime-index.json'),JSON.stringify(runtimeIndex,null,2)+'\n');
  await copyFile(join(root,'README.md'),join(out,'README.md'));
  await copyFile(join(root,'LICENSE'),join(out,'LICENSE'));
  const types={'.onnx':'application/octet-stream','.json':'application/json','.html':'text/html; charset=utf-8','.md':'text/markdown; charset=utf-8'};
  const artifacts=[];
  for(const path of await files(out)){const bytes=await readFile(path);artifacts.push({path:relative(out,path).replaceAll('\\','/'),size_bytes:bytes.length,sha256:hash(bytes),media_type:types[extname(path)]??'text/plain; charset=utf-8'});}
  const manifest={schema:'dq9-onnx-release-v1',sourceCommit:process.env.GITHUB_SHA??'local-unpublished',coverage,html:{bytes:html.bytes,sha256:html.sha256},artifacts};
  await writeFile(join(out,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify({output:out,artifacts:artifacts.length,bytes:artifacts.reduce((n,a)=>n+a.size_bytes,0),coverage,html}));
  return manifest;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),value=args.indexOf('--out');
  if(args.some((x,i)=>!['--out','--reuse-generated'].includes(x)&&i!==value+1))throw Error('Use --out DIR and optionally --reuse-generated for local packaging.');
  await buildRelease({out:value<0?undefined:resolve(root,args[value+1]),reuseGenerated:args.includes('--reuse-generated')});
}
