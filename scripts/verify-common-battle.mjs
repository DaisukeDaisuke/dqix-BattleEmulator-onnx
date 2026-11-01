#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {BATTLE_DEFINITIONS,ENCOUNTER_DEFINITIONS,makeEncounterInput} from '../data/common-battle.mjs';
import {createCommonBattleRunner} from '../runtime/common-battle.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';

// This is an integration check of the common program and actual ORT Web WASM.
// Scalar-compiler agreement is a regression check, not independent ROM proof.
// No runtime, generated graph, captured result, or debug JSON is fetched here.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=value=>createHash('sha256').update(typeof value==='string'||ArrayBuffer.isView(value)?value:JSON.stringify(value)).digest('hex');
const clone=value=>structuredClone(value);
const DEFAULT_SEEDS=[1n,2n,0xffffffffffffffffn,0x1d0a01b4b43d706cn];
const DEFAULT_ENCOUNTERS=['zilyadama_new_arugo__zilyadama_v6_tamahane','burudoga_v9_new_arugo__burudoga_v9_tate'];
const EXPECTED_ORT_VERSION='1.31.1';

function differences(want,got,path='$',out=[]){
  if(Object.is(want,got))return out;
  if(out.length>=12)return out;
  if(want&&got&&typeof want==='object'&&typeof got==='object'&&Array.isArray(want)===Array.isArray(got)){
    const keys=[...new Set([...Object.keys(want),...Object.keys(got)])];
    for(const key of keys){
      if(!Object.hasOwn(want,key)||!Object.hasOwn(got,key))out.push({path:path+'.'+key,want:want[key],got:got[key],missing:true});
      else differences(want[key],got[key],path+'.'+key,out);
      if(out.length>=12)break;
    }
  }else out.push({path,want,got});
  return out;
}

function nonfiniteValues(value,path='$',out=[]){
  if(out.length>=12)return out;
  if(typeof value==='number'&&!Number.isFinite(value))out.push({path,value:String(value)});
  else if(value&&typeof value==='object')for(const[key,item]of Object.entries(value)){nonfiniteValues(item,path+'.'+key,out);if(out.length>=12)break;}
  return out;
}

async function loadModels(program,programPath){
  const models=new Map();
  for(const module of program.modules){
    const ir=JSON.parse(await readFile(resolve(dirname(programPath),module.ir),'utf8'));
    const onnx=await readFile(resolve(dirname(programPath),module.onnx));
    if(ir.name!==module.name||hash(onnx)!==module.sha256)throw Error('Module binding differs: '+module.name);
    models.set(module.name,{name:module.name,ir,onnx,sha256:module.sha256});
  }
  return models;
}

export async function loadLocalOrt(runtimeDirectory){
  if(!runtimeDirectory)throw Error('Supply --ort-dir DIR or ORT_RUNTIME_DIR pointing to the existing ONNX Runtime Web '+EXPECTED_ORT_VERSION+' distribution. No dependency is downloaded.');
  const directory=resolve(runtimeDirectory),entry=pathToFileURL(resolve(directory,'ort.wasm.min.mjs')).href;
  const ort=await import(entry);
  const version=ort.env.versions?.web;
  if(version!==EXPECTED_ORT_VERSION)throw Error('Expected ORT Web '+EXPECTED_ORT_VERSION+', received '+String(version));
  ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.wasmPaths=directory+sep;
  return ort;
}

function rekeyDefinitions(definitions,rows){
  const next=clone(definitions),forward=new Map(),inverse=new Map();
  for(const key of Object.keys(definitions.monsters)){
    const id=Number(key),replacement=id+10000;
    if(definitions.monsters[String(replacement)])throw Error('Definition remap ID is already in use: '+replacement);
    forward.set(id,replacement);inverse.set(replacement,id);
  }
  next.monsters=Object.fromEntries(Object.entries(next.monsters).map(([id,record])=>{
    const replacement=forward.get(Number(id));return[String(replacement),{...record,id:replacement}];
  }));
  for(const record of Object.values(next.actions))if(record.operation===34&&record.parameter!==0&&forward.has(record.parameter))record.parameter=forward.get(record.parameter);
  const mappedRows=clone(rows);
  for(const row of mappedRows){
    row.encounterId='rekeyed-definition:'+row.encounterId;
    for(const actor of row.actors){
      if(forward.has(actor.definitionId))actor.definitionId=forward.get(actor.definitionId);
      if(forward.has(actor.ai?.storedTransitionId))actor.ai.storedTransitionId=forward.get(actor.ai.storedTransitionId);
    }
  }
  function normalize(value,key){
    if(Array.isArray(value))return value.map(item=>normalize(item));
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v,k)]));
    if(['definitionId','storedTransitionId'].includes(key))return inverse.get(value)??value;
    if(key==='encounterId'&&typeof value==='string')return value.replace(/^rekeyed-definition:/,'');
    return value;
  }
  return{definitions:next,rows:mappedRows,normalize,definitionCount:forward.size};
}

const summary=result=>({complete:result.complete,wholeBattleComplete:result.wholeBattleComplete,numericOnly:result.numericOnly,
  budgetExhausted:result.budgetExhausted,unresolvedEffects:result.unresolvedEffects,graphCalls:result.graphCalls,batchRows:result.batchRows,
  rows:result.rows.map(row=>({position:row.position,seed:row.seed,completedTurns:row.completedTurns,finished:row.finished,outcome:row.outcome,
    supported:row.supported,budgetExhausted:row.budgetExhausted,requestedTurnsComplete:row.requestedTurnsComplete,transitions:row.transitions,
    records:row.nowstate?.reduce((n,turn)=>n+(turn.records?.length??0),0),stateHash:hash(row)}))});

export async function verifyCommonBattle({programPath=resolve(root,'graph-v2/common-battle-program.json'),ortRuntime,
  encounterIds=DEFAULT_ENCOUNTERS,seeds=DEFAULT_SEEDS,maxTurns=1,maxTransitions=100000,compareNative=true,trace=false,graphProgress=false,onProgress}={}){
  if(!ortRuntime)throw Error('An actual ONNX Runtime Web module must be supplied.');
  if(!encounterIds.length||!seeds.length)throw Error('At least one encounter and seed are required.');
  const program=JSON.parse(await readFile(programPath,'utf8')),models=await loadModels(program,programPath);
  const programHash=hash(program),moduleHashes=Object.fromEntries(program.modules.map(module=>[module.name,module.sha256]));
  const runtimeSourceHashes=Object.fromEntries(await Promise.all(['runtime/common-battle.mjs','web/graph-executor.mjs','data/common-battle.mjs'].map(async path=>[path,hash(await readFile(resolve(root,path)))])));
  const ortExecutor=createGraphExecutor({models,ortRuntime}),nativeExecutor=compareNative?createGraphExecutor({models,ortRuntime,backend:'native-wasm'}):null;
  const runnerFor=(definitions,executor)=>createCommonBattleRunner({program,definitions,getModel:name=>models.get(name)?.ir,runGraph:async(name,rows)=>{
    if(graphProgress)onProgress?.({name:'graph/start/'+name,rows:rows.length});
    const result=await executor.runGraph(name,rows);
    if(graphProgress)onProgress?.({name:'graph/finish/'+name,rows:rows.length});return result;
  }});
  const runner=await runnerFor(BATTLE_DEFINITIONS,ortExecutor),nativeRunner=nativeExecutor?await runnerFor(BATTLE_DEFINITIONS,nativeExecutor):null;
  const checks=[],failures=[],cases=[];let activeCase;
  const check=(name,want,got)=>{
    const delta=differences(want,got);checks.push({name,passed:!delta.length});
    if(delta.length)failures.push({name,differences:delta});
  };
  const binding=(name,result)=>{
    check(name+'/program-hash',programHash,result.programHash);
    check(name+'/module-hashes',moduleHashes,result.moduleHashes);
  };
  const perform=async(name,activeRunner,rows,options={})=>{
    activeCase=name;onProgress?.({name,rows:rows.length});const start=performance.now();
    const result=await activeRunner.run({rows,maxTurns,maxTransitions,trace,...options});
    binding(name,result);check(name+'/finite-state',[],nonfiniteValues(result.rows));cases.push({name,elapsedMs:performance.now()-start,...summary(result)});return result;
  };
  try{
    for(const encounterId of encounterIds){
      if(!ENCOUNTER_DEFINITIONS.some(encounter=>encounter.id===encounterId))throw Error('Unknown encounter '+encounterId);
      const rows=seeds.map(seed=>makeEncounterInput(encounterId,{seed,overrides:{camera:{mode:'numeric-only',row4Words:[],records:[],state:null}}}));
      const batch=await perform(encounterId+'/ort-batch',runner,rows);
      check(encounterId+'/requested-numeric-scope',true,batch.complete);
      check(encounterId+'/numeric-only-marked',true,batch.numericOnly);
      check(encounterId+'/camera-not-claimed-complete',false,batch.wholeBattleComplete);
      const singleRows=[],singleTraces=[];
      for(let lane=0;lane<rows.length;lane++){
        const single=await perform(encounterId+'/ort-single-'+lane,runner,[rows[lane]]);
        singleRows.push(single.rows[0]);singleTraces.push(single.traces?.[0]);
      }
      check(encounterId+'/batch-equals-single',singleRows,batch.rows);
      if(trace)check(encounterId+'/batch-trace-equals-single',singleTraces,batch.traces);
      const rekeyed=rekeyDefinitions(BATTLE_DEFINITIONS,rows),rekeyedRunner=await runnerFor(rekeyed.definitions,ortExecutor);
      const remapped=await perform(encounterId+'/rekeyed-definitions',rekeyedRunner,rekeyed.rows);
      check(encounterId+'/definition-id-is-data',batch.rows,rekeyed.normalize(remapped.rows));
      check(encounterId+'/changed-input-hash',true,batch.inputHash!==remapped.inputHash);
      if(trace)check(encounterId+'/definition-id-trace',batch.traces,rekeyed.normalize(remapped.traces));
      if(nativeRunner){
        const native=await perform(encounterId+'/native-comparison',nativeRunner,rows);
        check(encounterId+'/ort-equals-native',batch.rows,native.rows);
        if(trace)check(encounterId+'/ort-trace-equals-native',batch.traces,native.traces);
      }
      const limited=await perform(encounterId+'/transition-budget',runner,[rows[0]],{maxTransitions:1,trace:false});
      check(encounterId+'/budget-is-incomplete',false,limited.complete);
      check(encounterId+'/budget-explicit',true,limited.budgetExhausted);
      check(encounterId+'/budget-does-not-finish-battle',false,limited.rows[0].finished);
      check(encounterId+'/budget-preserves-ongoing-outcome',0,limited.rows[0].outcome);
    }
  }catch(error){failures.push({name:'execution',case:activeCase,message:error.message,stack:error.stack});}
  finally{await ortExecutor.release();await nativeExecutor?.release();}
  return{schema:'dq9-common-battle-verification-v1',passed:failures.length===0,programHash,moduleHashes,runtimeSourceHashes,
    runtime:{name:'ONNX Runtime Web',version:ortRuntime.env.versions?.web,executionProvider:'wasm',threads:1},
    scope:{encounters:encounterIds,seeds:seeds.map(value=>String(value)),maxTurns,maxTransitions,trace,cameraMode:'numeric-only',independentRomVerification:false},
    comparison:{enabled:compareNative,kind:'scalar-compiler regression',sharedOrtModels:[...(nativeExecutor?.explicitOrtModels??[])],independentOfOrt:compareNative&&nativeExecutor.explicitOrtModels.size===0},
    executionCounts:{ort:{...ortExecutor.counts},native:nativeExecutor?{...nativeExecutor.counts}:null},checks,cases,failures};
}

function optionsFrom(args){
  const options={encounterIds:[]};
  const take=(arg,index)=>{if(index+1>=args.length||args[index+1].startsWith('--'))throw Error('Missing value for '+arg);return args[index+1];};
  for(let i=0;i<args.length;i++){
    const arg=args[i];
    if(arg==='--ort-dir')options.ortDirectory=take(arg,i++);
    else if(arg==='--program')options.programPath=resolve(take(arg,i++));
    else if(arg==='--encounter')options.encounterIds.push(take(arg,i++));
    else if(arg==='--out')options.outputPath=resolve(take(arg,i++));
    else if(arg==='--turns')options.maxTurns=Number(take(arg,i++));
    else if(arg==='--max-transitions')options.maxTransitions=Number(take(arg,i++));
    else if(arg==='--all-encounters')options.allEncounters=true;
    else if(arg==='--skip-native')options.compareNative=false;
    else if(arg==='--trace')options.trace=true;
    else if(arg==='--graph-progress')options.graphProgress=true;
    else if(arg==='--help')options.help=true;
    else throw Error('Unknown option '+arg);
  }
  if(options.allEncounters&&options.encounterIds.length)throw Error('Use either --all-encounters or --encounter.');
  options.encounterIds=options.allEncounters?ENCOUNTER_DEFINITIONS.map(encounter=>encounter.id):options.encounterIds.length?options.encounterIds:DEFAULT_ENCOUNTERS;
  for(const key of ['maxTurns','maxTransitions'])if(options[key]!==undefined&&(!Number.isSafeInteger(options[key])||options[key]<1))throw Error(key+' must be a positive safe integer');
  return options;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const options=optionsFrom(process.argv.slice(2));
    if(options.help)console.log('node scripts/verify-common-battle.mjs --ort-dir EXISTING_ORT_1_31_1_DIST [--encounter ID | --all-encounters] [--turns N] [--max-transitions N] [--trace] [--graph-progress] [--skip-native] [--out PATH]\nThe default checks Jadama and Bull-Dog, four exact uint64 seeds, single/batch equivalence, definition-ID remapping and explicit budgets. JSON is printed, and written only with --out.');
    else{
      const ortRuntime=await loadLocalOrt(options.ortDirectory??process.env.ORT_RUNTIME_DIR);
      const result=await verifyCommonBattle({...options,ortRuntime,onProgress:progress=>console.error(progress.name+' ('+progress.rows+' rows)')});
      const content=JSON.stringify(result,null,2)+'\n';if(options.outputPath)await writeFile(options.outputPath,content);
      console.log(content);if(!result.passed)process.exitCode=1;
    }
  }catch(error){console.error(error.stack??String(error));process.exitCode=1;}
}
