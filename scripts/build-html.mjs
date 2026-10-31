import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {resolve,dirname,relative,join} from 'node:path';
import {GRAPH_INITIAL_INPUTS} from '../data/graph-inputs.mjs';
import {validateModelInput} from '../web/input-validation.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const roots=[
  'web/input-validation.mjs',
  'graph-v2/input-domains.mjs',
  'poc-v2/graph-runtime.mjs',
  'poc-v2/native-graph-wasm-prototype.mjs',
  'poc-v2/native-resident-runtime-prototype.mjs',
  'poc-v2/resident-runtime.mjs',
  'poc-v2/constant-gather-resident-runtime.mjs',
  'poc-v2/wide-literal-constant-gather-resident.mjs'
];

function setPath(object,path,value){
  if(!Array.isArray(path)||!path.length)throw Error('Missing initial input path');
  let target=object;
  for(let i=0;i<path.length-1;i++)target=target[path[i]]??=(Number.isInteger(path[i+1])?[]:{});
  target[path.at(-1)]=structuredClone(value);
}

function initialProgramInput(program){
  const slots=new Map(program.slots.map(slot=>[slot.name,slot])),input={};
  for(const name of Object.values(program.inputs)){
    const slot=slots.get(name);
    if(!slot||slot.initial?.kind!=='input'||slot.initial.default===undefined)throw Error('Program initial input missing: '+name);
    setPath(input,slot.initial.path,slot.initial.default);
  }
  return input;
}

function initialGraphInput(ir){
  if(GRAPH_INITIAL_INPUTS[ir.name]){
    const row=structuredClone(GRAPH_INITIAL_INPUTS[ir.name]);
    for(const input of ir.inputs)if(!Array.isArray(row[input.name])||row[input.name].length!==input.shape.slice(1).reduce((a,b)=>a*b,1))throw Error('Public graph initial input differs: '+ir.name+'.'+input.name);
    const failures=validateModelInput(ir,row);if(failures.length)throw Error('Public graph initial input violates its contract: '+ir.name+': '+failures.join('; '));
    return row;
  }
  const row={};
  for(const input of ir.inputs){
    const width=input.shape.slice(1).reduce((a,b)=>a*b,1);
    if(!Number.isInteger(width)||width<1)throw Error('Public graph input has an unbounded width: '+ir.name+'.'+input.name);
    const declared=ir.contract?.defaults?.[input.name];
    if(declared!==undefined){row[input.name]=Array.isArray(declared)?structuredClone(declared):[declared];continue;}
    row[input.name]=Array.from({length:width},(_,i)=>{
      const rules=[ir.contract?.inputDomains?.[input.name],ir.contract?.fieldDomains?.[input.name]?.[i]].filter(Boolean);
      let value=input.name==='seed'&&i===0||input.name==='position'?1:0;
      for(const rule of rules){
        if(rule.values&&!rule.values.includes(value))value=rule.values[0];
        if(rule.min!==undefined)value=Math.max(value,rule.min);
        if(rule.max!==undefined)value=Math.min(value,rule.max);
        if(rule.integer)value=Math.ceil(value);
      }
      return input.dtype==='bool'?Boolean(value):value;
    });
  }
  return row;
}

// Rebuild the standalone document from source and freshly generated models.
// No verification JSON, observed output, checkpoint or local absolute path is
// needed by this builder or included in its generated browser assets.
export async function buildHtml({root,out,models,programs,cameras=[],actorFields=[]}){
  root=resolve(root);out=resolve(out);
  const sourceHashes={},sources={},visiting=new Set();
  sourceHashes['data/graph-inputs.mjs']=hash(await readFile(join(root,'data/graph-inputs.mjs')));
  async function source(path){
    path=path.replaceAll('\\','/');
    if(Object.hasOwn(sources,path))return;
    if(visiting.has(path))throw Error('Cyclic browser source imports: '+path);
    const absolute=resolve(root,path),local=relative(root,absolute);
    if(local.startsWith('..')||local!==path)throw Error('Browser source escapes release root: '+path);
    visiting.add(path);
    const text=await readFile(absolute,'utf8');
    if(/\b(?:from\s*|import\s*)['"]node:/.test(text))throw Error('Node dependency in browser source: '+path);
    for(const match of text.matchAll(/\bfrom\s*(['"])(\.[^'"]+)\1/g)){
      const dependency=relative(root,resolve(dirname(absolute),match[2])).replaceAll('\\','/');
      await source(dependency);
    }
    sources[path]=text;sourceHashes[path]=hash(text);visiting.delete(path);
  }
  for(const path of roots)await source(path);
  for(const camera of cameras)await source(camera.runner.path);
  const names=new Set(),packedModels=models.map(model=>{
    if(names.has(model.name)||model.ir?.name!==model.name)throw Error('Invalid/duplicate model identity: '+model.name);
    names.add(model.name);
    const bytes=typeof model.onnx==='string'?Buffer.from(model.onnx,'base64'):Buffer.from(model.onnx);
    const sha256=hash(bytes);
    if(model.sha256&&model.sha256!==sha256)throw Error('Model hash changed: '+model.name);
    const cpuExecutionProvider=model.executionProvider==='wasm-explicit-cpu'||model.ir.nodes.some(node=>node.op==='GatherElements')?'onnxruntime-wasm':'native-wasm';
    return{name:model.name,onnx:bytes.toString('base64'),ir:model.ir,sha256,bytes:bytes.length,public:model.public===true,titleJa:model.titleJa??model.name,executionProvider:model.executionProvider??null,cpuExecutionProvider,defaultInput:model.public===true?initialGraphInput(model.ir):undefined};
  });
  const byName=new Map(packedModels.map(model=>[model.name,model]));
  const packedPrograms=programs.map(definition=>{
    for(const module of definition.program.modules){
      if(byName.get(module.name)?.sha256!==module.sha256)throw Error('Program model binding differs: '+definition.id+'/'+module.name);
    }
    const presets=definition.presets?.length?structuredClone(definition.presets):[{id:'default',labelJa:'標準の初期条件',inputs:initialProgramInput(definition.program)}];
    return{id:definition.id,titleJa:definition.titleJa??definition.id,program:definition.program,runtimeAdapter:definition.runtimeAdapter??null,presets,scopeJa:definition.scopeJa??definition.program.scope??''};
  });
  for(const camera of cameras){
    if(!camera.presets?.length)throw Error('Camera initial input is absent: '+camera.id);
    for(const name of camera.models)if(!byName.has(name))throw Error('Camera model absent: '+name);
    for(const name of camera.explicitCpuModels??[])if(byName.get(name)?.executionProvider!=='wasm-explicit-cpu')throw Error('Camera CPU model must be declared: '+name);
  }
  const ids=[...packedPrograms.map(x=>x.id),...cameras.map(x=>x.id),...packedModels.filter(x=>x.public).map(x=>x.name)];
  if(new Set(ids).size!==ids.length)throw Error('Duplicate browser mode ID');
  const assets={schema:'dq9-source-release-html-v1',models:packedModels,programs:packedPrograms,cameras,actorFields,sources,sourceHashes,ortVersion:'1.31.1',policy:{seedFiltering:false,implicitCpuFallback:false,learnedApproximation:false,fullGameComplete:false}};
  const template=await readFile(join(root,'web/template.html'),'utf8'),app=await readFile(join(root,'web/app.mjs'),'utf8');
  sourceHashes['web/template.html']=hash(template);sourceHashes['web/app.mjs']=hash(app);
  const compressed=gzipSync(Buffer.from(JSON.stringify(assets)));
  if(!template.includes('__DQ9_ASSETS__')||!template.includes('__DQ9_APP__'))throw Error('HTML template marker is missing');
  const html=template.replace('__DQ9_ASSETS__',compressed.toString('base64')).replace('__DQ9_APP__',app.replace(/<\/script/gi,'<\\/script'));
  const htmlPath=out.endsWith('.html')?out:join(out,'dq9-battle-emulator.html');
  await mkdir(dirname(htmlPath),{recursive:true});await writeFile(htmlPath,html,'utf8');
  return{htmlPath,sha256:hash(html),bytes:Buffer.byteLength(html),compressedAssetsBytes:compressed.length,models:packedModels.length,programs:packedPrograms.length,cameras:cameras.length,publicGraphs:packedModels.filter(x=>x.public).length,sourceHashes,externalRuntime:{version:'1.31.1',purpose:'CPU-selected GatherElements models, and the explicitly declared float64 camera model for either selected backend',cpuModels:packedModels.filter(model=>model.cpuExecutionProvider==='onnxruntime-wasm').map(model=>model.name),implicitCpuFallback:false},temporaryDebugRecordsIncluded:false,originalRomImageIncluded:false};
}
