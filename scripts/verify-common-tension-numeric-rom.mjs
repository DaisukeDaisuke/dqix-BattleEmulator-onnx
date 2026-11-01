#!/usr/bin/env node
// Compare signed consumer semantics and actual static coefficient bytes.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import rom from '../restored/dq9-unified/data/rom.mjs';
import {buildCommonTensionNumericBoundary,COMMON_TENSION_NUMERIC_STAGES,COMMON_TENSION_REDUCTION_AUTHORITY} from '../graph-v2/common-tension-reduction.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),floatBits=value=>{const bytes=Buffer.alloc(4);bytes.writeFloatLE(value);return bytes.readUInt32LE();};
export async function verifyCommonTensionNumericRom({sourcePath,ortDirectory}={}){
  const bytes=await readFile(resolve(sourcePath)),source=JSON.parse(bytes),cases=source.results;
  if(!source.executionComplete||!source.programUnmodified||source.romSHA256!==rom.romSha256||cases?.length!==512||cases.some(row=>!row.ok||!row.strictInitializedMemory||row.case.kind!=='tension_coefficient_bits'))throw Error('All512 strict unmodified signed-index originals are required');
  const admitted=new Set(COMMON_TENSION_NUMERIC_STAGES),table=Buffer.from(COMMON_TENSION_REDUCTION_AUTHORITY.coefficientHex,'hex');
  for(const row of cases){const c=row.case,signed=c.rawStage>=128?c.rawStage-256:c.rawStage;if(c.stage!==signed||Number(row.tableAddress)!==0x020e8a0c+signed*8+c.enemy*4)throw Error('The original call must receive the signed initial stage');if(admitted.has(c.rawStage)&&table.readUInt32LE((signed+7)*8+c.enemy*4)!==Number(row.tableBits))throw Error('A coefficient literal differs from its actual original ROM bytes');}
  const graph=buildCommonTensionNumericBoundary(),ir=graph.json(),onnx=graph.model(),ort=await loadLocalOrt(ortDirectory),executor=createGraphExecutor({models:new Map([[graph.name,{name:graph.name,ir,onnx}]]),ortRuntime:ort,backend:'onnxruntime-wasm'});
  const report={schema:'dq9-common-tension-signed-coefficient-proof-v1',source:resolve(sourcePath),sourceSHA256:hash(bytes),modelSHA256:hash(onnx),originalCases:512,admittedCoefficientCases:0,unsupportedCoefficientCases:0,fieldsCompared:0,mismatches:0,examples:[],backend:'onnxruntime-wasm',ortVersion:ort.env.versions.web,scope:'The graph reads only initial raw stage/side. All512 signed inputs and support classifications are compared; the24 represented finite coefficient returns are checked bit-for-bit. Other original NaN/overflow/adjacent-table returns remain explicitly outside the numeric admission. Original table observations validate source constants; expected return values never enter inference.'};
  const compare=(id,key,actual,expected)=>{report.fieldsCompared++;if(actual!==expected){report.mismatches++;if(report.examples.length<30)report.examples.push({id,key,actual,expected});}};
  try{const outputs=await executor.runGraph(graph.name,cases.map(({case:c})=>({stage:[c.rawStage],enemy:[c.enemy]})));cases.forEach((row,i)=>{const c=row.case,out=outputs[i],supported=admitted.has(c.rawStage);compare(c.id,'signedStage',Number(out.signedStage[0]),c.stage);compare(c.id,'supported',Number(out.supported[0]),Number(supported));if(supported){report.admittedCoefficientCases++;compare(c.id,'coefficientBits',floatBits(out.coefficient[0]),row.integerResult>>>0);}else report.unsupportedCoefficientCases++;});report.counts={...executor.counts};report.passed=report.mismatches===0;return report;}finally{await executor.release();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2),options={ortDirectory:process.env.ORT_RUNTIME_DIR};let output;for(let i=0;i<args.length;i++){if(args[i]==='--source')options.sourcePath=args[++i];else if(args[i]==='--ort-dir')options.ortDirectory=args[++i];else if(args[i]==='--out')output=args[++i];else throw Error('Unknown argument '+args[i]);}if(!options.sourcePath)throw Error('Use --source SIGNED_COEFFICIENT_RESPONSE --ort-dir EXISTING_ORT_DIST');const report=await verifyCommonTensionNumericRom(options),text=JSON.stringify(report,null,2)+'\n';if(output)await writeFile(resolve(output),text);console.log(text);if(!report.passed)process.exitCode=1;}
