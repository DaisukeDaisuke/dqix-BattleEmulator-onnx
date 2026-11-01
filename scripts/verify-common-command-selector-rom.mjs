#!/usr/bin/env node
// Original helper endpoints remain comparison-only; no observed intermediate
// state or RNG is fed to the graph. Whole callers have a separate verifier.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import rom from '../restored/dq9-unified/data/rom.mjs';
import {buildCommonCommandSelectors} from '../graph-v2/common-command-selector-rules.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function verifyCommonCommandSelectorRom({sourcePath,ortDirectory}={}){
  const bytes=await readFile(resolve(sourcePath)),source=JSON.parse(bytes);
  if(!source.executionComplete||!source.programUnmodified||source.romSHA256!==rom.romSha256||!source.results?.length||source.results.some(row=>!row.ok||!row.strictInitializedMemory))throw Error('Require complete unmodified strict ARM evidence');
  const graph=buildCommonCommandSelectors(),ir=graph.json(),onnx=graph.model(),ort=await loadLocalOrt(ortDirectory),executor=createGraphExecutor({models:new Map([[graph.name,{name:graph.name,ir,onnx}]]),ortRuntime:ort,backend:'onnxruntime-wasm'}),
    report={schema:'dq9-common-command-selector-arm-verification-v1',source:resolve(sourcePath),sourceSHA256:hash(bytes),romSHA256:source.romSHA256,model:{name:graph.name,sha256:hash(onnx)},backend:'onnxruntime-wasm',ortVersion:ort.env.versions.web,cases:source.results.length,fieldsCompared:0,mismatches:0,examples:[],scope:'Original selectors34/35, including exact target-count integer division and the selector-side source recoil scratch write. Initial actor HP and target count alone are graph inputs. Complete action/RNG/presentation is a separate boundary.'};
  try{
    const rows=source.results.map(({case:c})=>{if(c.kind!=='damage_selector'||![34,35].includes(c.selector))throw Error('Unsupported initial helper boundary');const sourceIndex=c.sourceIndex??1;return{selector:[c.selector],fallback:[c.fallback],sourceHp:[c.actors[sourceIndex].hp??100],targetHp:[c.actors[1-sourceIndex].hp??100],targetCount:[c.selectorTargetCount??1],sourcePresent:[true],targetPresent:[true],enabled:[true],priorScratch:[c.initialRecoilScratch??37]};}),outputs=await executor.runGraph(graph.name,rows);
    source.results.forEach((original,i)=>{
      const expected={damage:original.integerResult,nextScratch:original.afterActionScratch,supported:1,consumed:0,seedUnchanged:1},actual={damage:outputs[i].damage[0],nextScratch:outputs[i].nextScratch[0],supported:outputs[i].supported[0],consumed:original.consumed,seedUnchanged:Number(BigInt(original.nextState)===BigInt(original.case.seed))};
      for(const[name,want]of Object.entries(expected)){report.fieldsCompared++;if(Number(actual[name])!==Number(want)){report.mismatches++;if(report.examples.length<80)report.examples.push({id:original.case.id,name,expected:want,actual:actual[name]});}}
    });
    report.counts={...executor.counts};report.passed=report.mismatches===0;return report;
  }finally{await executor.release();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),options={ortDirectory:process.env.ORT_RUNTIME_DIR};let output;for(let i=0;i<args.length;i++){if(args[i]==='--source')options.sourcePath=args[++i];else if(args[i]==='--ort-dir')options.ortDirectory=args[++i];else if(args[i]==='--out')output=args[++i];else throw Error('Unknown argument '+args[i]);}
  if(!options.sourcePath)throw Error('Use --source STRICT_ARM_RESPONSE --ort-dir EXISTING_ORT_DIST');const report=await verifyCommonCommandSelectorRom(options),text=JSON.stringify(report,null,2)+'\n';if(output)await writeFile(resolve(output),text);console.log(text);if(!report.passed)process.exitCode=1;
}
