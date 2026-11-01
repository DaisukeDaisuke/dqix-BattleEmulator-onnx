#!/usr/bin/env node
// Only initial supplied level/fallback/availability enter inference. Original
// helper return values and final RNG are used solely for comparison.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import rom from '../restored/dq9-unified/data/rom.mjs';
import {seedBytes} from '../data/common-battle.mjs';
import {buildCommonLevelSelectors,COMMON_LEVEL_SELECTOR_RULES} from '../graph-v2/common-level-selector-rules.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function verifyCommonLevelSelectorRom({sourcePath,ortDirectory}={}){
  const bytes=await readFile(resolve(sourcePath)),source=JSON.parse(bytes);
  if(!source.executionComplete||!source.programUnmodified||source.romSHA256!==rom.romSha256||!source.results?.length||source.results.some(r=>!r.ok||!r.strictInitializedMemory||r.case.kind!=='damage_selector'))throw Error('Complete unmodified strict original selector evidence is required');
  const graph=buildCommonLevelSelectors(),ir=graph.json(),onnx=graph.model(),ort=await loadLocalOrt(ortDirectory),executor=createGraphExecutor({models:new Map([[graph.name,{name:graph.name,ir,onnx}]]),ortRuntime:ort,backend:'onnxruntime-wasm'});
  const report={schema:'dq9-common-level-selector-arm-v1',source:resolve(sourcePath),sourceSHA256:hash(bytes),romSHA256:source.romSHA256,model:{name:graph.name,sha256:hash(onnx),nodes:graph.nodes.length,bytes:onnx.length},backend:'onnxruntime-wasm',ortVersion:ort.env.versions.web,cases:source.results.length,fieldsCompared:0,mismatches:0,examples:[],scope:'Original helper through return, including party unsigned16 levels, enemy auxiliary low7-bit level and explicit missing-party auxiliary fallback. Full action-caller proof is separate; no expected endpoint or trace result initializes inference.'};
  try{
    const inputs=source.results.map(({case:c,selectorFunctionAddress})=>{
      const rule=COMMON_LEVEL_SELECTOR_RULES.find(rule=>rule.selector===c.selector);if(!rule||BigInt(selectorFunctionAddress)!==BigInt('0x'+rule.jpn))throw Error('Original selector table entry differs from authority');
      const sourceIndex=c.sourceIndex??1,initialLevel=c.actors[sourceIndex].level;
      return{seed:seedBytes(c.seed),position:[1],selector:[c.selector],level:[sourceIndex?initialLevel&127:initialLevel&65535],fallback:[c.fallback],levelAvailable:[!c.partyAuxMissing],enabled:[true]};
    }),outputs=await executor.runGraph(graph.name,inputs);
    for(let i=0;i<outputs.length;i++){
      const original=source.results[i],observed=outputs[i],expected={damage:[original.integerResult],nextSeed:seedBytes(original.nextState),nextPosition:[original.consumed+1],consumed:[original.consumed],supported:[1],active:[1]};
      for(const[name,values]of Object.entries(expected))for(let j=0;j<values.length;j++){report.fieldsCompared++;if(Number(observed[name][j])!==Number(values[j])){report.mismatches++;if(report.examples.length<60)report.examples.push({id:original.case.id,field:name,index:j,expected:values[j],actual:observed[name][j]});}}
    }
    report.executor=executor.stats;report.passed=report.mismatches===0;return report;
  }finally{await executor.release();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),options={ortDirectory:process.env.ORT_RUNTIME_DIR};let output;
  const keys={'--source':'sourcePath','--ort-dir':'ortDirectory'};for(let i=0;i<args.length;i++){if(args[i]==='--out')output=args[++i];else if(keys[args[i]])options[keys[args[i]]]=args[++i];else throw Error('Unknown option '+args[i]);}
  if(!options.sourcePath)throw Error('Use --source STRICT_ARM_RESPONSE --ort-dir EXISTING_ORT_DIST');
  const report=await verifyCommonLevelSelectorRom(options),text=JSON.stringify(report,null,2)+'\n';if(output)await writeFile(resolve(output),text,{flag:'wx'});console.log(text);if(!report.passed)process.exitCode=1;
}
