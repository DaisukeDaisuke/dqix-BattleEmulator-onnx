#!/usr/bin/env node
import {readFile,writeFile,mkdir,readdir,rm,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,join,relative,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildGraphs} from './build-graphs.mjs';
import {buildHtml} from './build-html.mjs';
import {PROGRAM_DEFINITIONS,INPUT_PRESETS,ENEMY_LEVEL_OVERRIDES,PUBLIC_MODELS} from '../data/battle-presets.mjs';
import {CAMERA_MODES} from '../data/camera-modes.mjs';
import {ACTOR_FIELDS} from '../graph-v2/rules.mjs';
import {makeGiyumeiRow} from '../graph-v2/encounter-expansion/giyumei-profiles.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=value=>createHash('sha256').update(value).digest('hex');
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const getPath=(row,path)=>row[path.join('.')]??path.reduce((value,key)=>value?.[key],row);
function setPath(row,path,value){
  let current=row;
  for(let i=0;i<path.length-1;i++)current=current[path[i]]??={};
  current[path.at(-1)]=structuredClone(value);
}
function initialRow(program,override={}){
  const slots=new Map(program.slots.map(slot=>[slot.name,slot])),row={};
  for(const [input,name]of Object.entries(program.inputs)){
    const slot=slots.get(name);
    if(!slot||slot.initial?.kind!=='input'||slot.initial.default===undefined)throw Error('Missing declared initial input '+name);
    const value=Object.hasOwn(override,input)?override[input]:getPath(override,slot.initial.path);
    const chosen=value===undefined?slot.initial.default:value;
    const values=Array.isArray(chosen)?chosen:[chosen];
    if(values.length!==slot.width)throw Error('Initial input width differs '+name);
    setPath(row,slot.initial.path,values);
  }
  return row;
}
function presetsFor(definition,program){
  let presets=INPUT_PRESETS[definition.id]?.presets??[{id:'default',labelJa:'標準の初期条件',inputs:{}}];
  if(definition.id==='giyumei-combat')presets=[315,346].map(monsterId=>({id:'monster'+monsterId,labelJa:monsterId===315?'初戦315 · 原本の初期値':'再戦346 · 原本の初期値',inputs:makeGiyumeiRow({monsterId})}));
  return presets.map(preset=>{
    const inputs=initialRow(program,preset.inputs),level=ENEMY_LEVEL_OVERRIDES[definition.id];
    if(level){
      if(!Array.isArray(inputs[level.input])||inputs[level.input].length<=level.index)throw Error('Enemy level override input missing');
      inputs[level.input][level.index]=level.value;
    }
    return{id:preset.id,labelJa:preset.labelJa,inputs};
  });
}
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
  const programs=[];
  for(const definition of PROGRAM_DEFINITIONS){
    const path=join(root,definition.sourcePath),program=await json(path);
    for(const module of program.modules)await loadModel(resolve(dirname(path),module.ir),resolve(dirname(path),module.onnx),module.sha256);
    programs.push({...definition,program,presets:presetsFor(definition,program)});
  }
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
  for(const definition of programs){
    const portable=structuredClone(definition.program);
    for(const module of portable.modules){module.onnx='../models/'+module.name+'.onnx';module.ir='../models/'+module.name+'.json';}
    await writeFile(join(out,'programs',definition.id+'.json'),JSON.stringify({id:definition.id,titleJa:definition.titleJa,runtimeAdapter:definition.runtimeAdapter,scopeJa:definition.scopeJa,program:portable,presets:definition.presets},null,2)+'\n');
  }
  const html=await buildHtml({root,out,models:ordered,programs,cameras:CAMERA_MODES,actorFields:ACTOR_FIELDS});
  const coverage={battlePrograms:programs.length,battlePresets:programs.reduce((n,p)=>n+p.presets.length,0),cameraModes:CAMERA_MODES.length,publicPrimitiveGraphs:PUBLIC_MODELS.length,totalGraphs:ordered.length,seedFiltering:false,learnedApproximation:false,implicitCpuFallback:false,fullGameComplete:false,authority:'Original ROM execution and matching decompile; previous emulator is an independent comparator.',limitations:['Represented one-party/one-enemy numerical battle profiles only; arbitrary party rosters, all commands/items and all old configurations are not complete.','The six camera modes remain explicit phases; their RNG effects are not silently omitted from a claim of complete game equivalence.','The binary64 camera model uses explicitly labelled ONNX Runtime Web WASM; there is no silent GPU fallback.','Finite AI retry and turn budgets are reported as unsupported or unfinished, never as a win/loss.']};
  await writeFile(join(out,'runtime-index.json'),JSON.stringify({schema:'dq9-runtime-index-v1',coverage,models:ordered.map(({name,sha256,public:visible,executionProvider})=>({name,sha256,public:visible,executionProvider,onnx:'models/'+name+'.onnx',ir:'models/'+name+'.json'})),programs:programs.map(({id,titleJa,scopeJa})=>({id,titleJa,scopeJa,path:'programs/'+id+'.json'})),cameras:CAMERA_MODES,html:'dq9-battle-emulator.html'},null,2)+'\n');
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
