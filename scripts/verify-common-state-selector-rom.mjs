#!/usr/bin/env node
// Original selector helper outputs remain comparison-only. Full callers use
// the separate common-action verifier, including RNG and actor raw state.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import rom from '../restored/dq9-unified/data/rom.mjs';
import {Graph} from '../graph-v2/graph-builder.mjs';
import {COMMON_STATE_SELECTOR_RULES,commonStateSelectorDamage} from '../graph-v2/common-state-selector-rules.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function selectorGraph(){
  const g=new Graph('rom-common-state-selector-verification',{scope:'Independent original selector helper boundary; physical fallback and complete damage caller are outside this primitive.',rules:COMMON_STATE_SELECTOR_RULES});
  const selector=g.input('selector'),fallback=g.input('fallback'),targetParty=g.input('targetParty'),targetSpecies=g.input('targetSpecies'),targetMetal=g.input('targetMetal',['N',1],'bool'),targetStatusBytes=g.split(g.input('targetStatusBytes',['N',4]),4),targetKindsBytes=g.split(g.input('targetKindsBytes',['N',2]),2),result=commonStateSelectorDamage(g,selector,fallback,{targetParty,targetSpecies,targetMetal,targetStatusBytes,targetKindsBytes});
  g.output(result.damage,'damage');g.output(result.supported,'supported');return g;
}
export async function verifyCommonStateSelectorRom({sourcePath,ortDirectory,backend='onnxruntime-wasm'}={}){
  const bytes=await readFile(resolve(sourcePath)),source=JSON.parse(bytes);
  if(!source.executionComplete||!source.programUnmodified||source.romSHA256!==rom.romSha256||!source.results?.length||source.results.some(r=>!r.ok||!r.strictInitializedMemory))throw Error('Complete unmodified strict ARM evidence is required');
  const graph=selectorGraph(),ir=graph.json(),onnx=graph.model(),ort=await loadLocalOrt(ortDirectory),executor=createGraphExecutor({models:new Map([[graph.name,{name:graph.name,ir,onnx}]]),ortRuntime:ort,backend}),report={schema:'dq9-common-state-selector-arm-verification-v1',source:resolve(sourcePath),sourceSHA256:hash(bytes),romSHA256:source.romSHA256,model:{name:graph.name,sha256:hash(onnx)},backend,ortVersion:ort.env.versions.web,cases:source.results.length,selectors:[...new Set(source.results.map(row=>row.case.selector))].sort((a,b)=>a-b),fields:0,differences:0,examples:[],scope:'Original state-dependent helpers with conditional0..65535 fallback rounding, species and ailment predicates and the separate metal+1 helper. Complete metal-target damage behavior is not admitted by the common action module.'};
  try{
    const inputs=source.results.map(({case:c})=>{if(c.kind!=='damage_selector')throw Error('Wrong initial boundary kind');const target=c.actors[1-(c.sourceIndex??1)],status=(target.status??0)>>>0,kinds=target.poisonKind??0;return{selector:[c.selector],fallback:[c.fallback],targetParty:[Number((c.sourceIndex??1)===1)],targetSpecies:[target.species??0],targetMetal:[!!target.metal],targetStatusBytes:Array.from({length:4},(_,i)=>status>>>i*8&255),targetKindsBytes:[target.statBytes?.['0x22']??kinds&255,target.statBytes?.['0x23']??kinds>>>8]};}),outputs=await executor.runGraph(graph.name,inputs);
    source.results.forEach((row,i)=>{const expected={damage:row.integerResult,supported:1,consumed:0,seedUnchanged:1},observed={damage:outputs[i].damage[0],supported:Number(outputs[i].supported[0]),consumed:row.consumed,seedUnchanged:Number(BigInt(row.nextState)===BigInt(row.case.seed))};for(const[key,want]of Object.entries(expected)){report.fields++;if(Number(want)!==Number(observed[key])){report.differences++;if(report.examples.length<60)report.examples.push({id:row.case.id,key,expected:want,actual:observed[key]});}}});
    report.passed=report.differences===0;return report;
  }finally{await executor.release();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),options={ortDirectory:process.env.ORT_RUNTIME_DIR};let output;
  const keys={'--source':'sourcePath','--ort-dir':'ortDirectory','--backend':'backend'};for(let i=0;i<args.length;i++){if(args[i]==='--out')output=args[++i];else if(keys[args[i]])options[keys[args[i]]]=args[++i];else throw Error('Unknown option '+args[i]);}
  if(!options.sourcePath)throw Error('Use --source STRICT_ARM_RESPONSE --ort-dir EXISTING_ORT_DIST');
  const report=await verifyCommonStateSelectorRom(options),text=JSON.stringify(report,null,2)+'\n';if(output)await writeFile(resolve(output),text);console.log(text);if(!report.passed)process.exitCode=1;
}
