#!/usr/bin/env node
// Optional direct original ARM proof. Only supplied initial actor bytes are
// model inputs; original floating-point return bits are comparison-only.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import rom from '../restored/dq9-unified/data/rom.mjs';
import {buildCommonEffectResistance} from '../graph-v2/common-effect-resistance.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const floatBits=value=>{const bytes=new ArrayBuffer(4),view=new DataView(bytes);view.setFloat32(0,value,true);return view.getUint32(0,true);};
export async function verifyCommonEffectResistanceRom({sourcePath,ortDirectory}={}){
  const bytes=await readFile(resolve(sourcePath)),source=JSON.parse(bytes);
  if(!source.executionComplete||!source.programUnmodified||source.romSHA256!==rom.romSha256||!source.results?.length||source.results.some(row=>!row.ok||!row.strictInitializedMemory))throw Error('Require complete unmodified strict ARM evidence');
  const graph=buildCommonEffectResistance(),ir=graph.json(),onnx=graph.model(),ort=await loadLocalOrt(ortDirectory),executor=createGraphExecutor({models:new Map([[graph.name,{name:graph.name,ir,onnx}]]),ortRuntime:ort,backend:'onnxruntime-wasm'}),
    report={schema:'dq9-common-effect-resistance-arm-verification-v1',source:resolve(sourcePath),sourceSHA256:hash(bytes),romSHA256:source.romSHA256,model:{name:graph.name,sha256:hash(onnx)},backend:'onnxruntime-wasm',ortVersion:ort.env.versions.web,cases:source.results.length,fieldsCompared:0,mismatches:0,examples:[],scope:graph.contract.authority.scope+' Actual binary32 return bits and unchanged seed/position are checked; full action callers are a separate boundary.'};
  try{
    const rows=source.results.map(({case:c})=>{
      if(c.kind!=='effect_resistance')throw Error('Require actual resistance-getter boundary');const actor=c.actors[c.sourceIndex??0],flags=Array.from({length:4},(_,i)=>(actor.flags18??0)>>>8*i&255),kinds=[actor.poisonKind??0,0];
      for(const[offset,value]of Object.entries(actor.statBytes??{})){const index=Number(offset);if(index>=0x18&&index<0x1c)flags[index-0x18]=value;if(index===0x22||index===0x23)kinds[index-0x22]=value;}
      return{rawResistances:actor.resistances??Array(22).fill(100),rawFlagsBytes:flags,statusKindsBytes:kinds,present:[!c.missingTarget],element:[c.element]};
    }),outputs=await executor.runGraph(graph.name,rows);
    source.results.forEach((original,i)=>{
      const comparisons={returnBits:[Number(BigInt(original.returnBits)),floatBits(outputs[i].selectedFraction[0])],consumed:[0,original.consumed],seed:[BigInt(original.case.seed).toString(),BigInt(original.nextState).toString()]};
      for(const[name,[expected,actual]]of Object.entries(comparisons)){report.fieldsCompared++;if(actual!==expected){report.mismatches++;if(report.examples.length<80)report.examples.push({id:original.case.id,name,expected,actual,selectedPercent:outputs[i].selectedPercent[0]});}}
    });report.counts={...executor.counts};report.passed=report.mismatches===0;return report;
  }finally{await executor.release();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),options={ortDirectory:process.env.ORT_RUNTIME_DIR};let output;for(let i=0;i<args.length;i++){if(args[i]==='--source')options.sourcePath=args[++i];else if(args[i]==='--ort-dir')options.ortDirectory=args[++i];else if(args[i]==='--out')output=args[++i];else throw Error('Unknown argument '+args[i]);}
  if(!options.sourcePath)throw Error('Use --source STRICT_ARM_RESPONSE --ort-dir EXISTING_ORT_DIST');const report=await verifyCommonEffectResistanceRom(options),text=JSON.stringify(report,null,2)+'\n';if(output)await writeFile(resolve(output),text);console.log(text);if(!report.passed)process.exitCode=1;
}
