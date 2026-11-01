#!/usr/bin/env node
// Optional strict-ARM operation-body evidence, supplied outside the source
// repository. Actual ROM endpoints never initialize the model.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import rom from '../restored/dq9-unified/data/rom.mjs';
import {buildCommonModifierCreation} from '../graph-v2/common-modifier-create.mjs';
import {commonArmActorTableInput,projectedActor} from '../graph-v2/verify-common-action-arm.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function verifyCommonModifierCreationRom({sourcePath,ortDirectory}={}){
  const sourceBytes=await readFile(resolve(sourcePath)),source=JSON.parse(sourceBytes);if(!source.executionComplete||!source.programUnmodified||source.romSHA256!==rom.romSha256||!source.results?.length||source.results.some(row=>!row.ok||!row.strictInitializedMemory))throw Error('Require complete unmodified strict ARM evidence');
  const graph=buildCommonModifierCreation(),ir=graph.json(),onnx=graph.model(),ort=await loadLocalOrt(ortDirectory),executor=createGraphExecutor({models:new Map([[graph.name,{name:graph.name,ir,onnx}]]),ortRuntime:ort,backend:'onnxruntime-wasm'}),rules=new Map(rom.actions.map(a=>[a.id,a])),report={schema:'dq9-common-modifier-creation-arm-verification-v1',source:resolve(sourcePath),sourceSha256:hash(sourceBytes),romSha256:rom.romSha256,backend:'onnxruntime-wasm',ortVersion:ort.env.versions.web,model:{name:graph.name,sha256:hash(onnx)},cases:source.results.length,fieldsCompared:0,mismatches:0,examples:[],scope:'Original Force, fire/ice shield, magic-reflection and ailment-resistance operation bodies. Initial record and actor bytes alone initialize the graph; expected memory is comparison-only. Caller selection, MP spending, inventory and presentation are outside this direct-body boundary.'};
  try{
    const inputs=source.results.map(({case:c})=>{
      if(c.kind!=='modifier_creation')throw Error('Require explicit original operation-body boundary');const action=rules.get(c.actionId);if(!action||action.raw!==c.actionRaw)throw Error('Action record differs from pinned ROM');
      const initial=commonArmActorTableInput({...c,kind:'normal_action'}),actor=initial.actors[c.sourceIndex??0];return{operation:[action.operation],parameter:[Buffer.from(action.raw,'hex').readInt16LE(48)],hit:[(c.operationHit??1)!==0],present:[!c.missingTarget],rawStatusBytes:actor.rawStatusBytes,rawFlagsBytes:actor.rawFlagsBytes,statusKindsBytes:actor.statusKindsBytes,rawTimers:actor.rawTimers};
    }),outputs=await executor.runGraph(graph.name,inputs);
    source.results.forEach((row,i)=>{
      const expected=projectedActor(Buffer.from(row.actors[row.case.sourceIndex??0].statsRaw,'hex'));
      for(const name of['rawStatusBytes','rawFlagsBytes','statusKindsBytes','rawTimers'])expected[name].forEach((value,j)=>{report.fieldsCompared++;const actual=outputs[i]['next'+name[0].toUpperCase()+name.slice(1)]?.[j];if(Number(actual)!==value){report.mismatches++;if(report.examples.length<80)report.examples.push({id:row.case.id,name,index:j,expected:value,actual});}});
      // The actual body must independently confirm its zero-RNG contract.
      for(const[name,actual,expectedValue]of[['consumed',row.consumed,0],['seed',BigInt(row.nextState).toString(),BigInt(row.case.seed).toString()]]){report.fieldsCompared++;if(actual!==expectedValue){report.mismatches++;if(report.examples.length<80)report.examples.push({id:row.case.id,name,expected:expectedValue,actual});}}
    });
    report.counts={...executor.counts};report.passed=report.mismatches===0;return report;
  }finally{await executor.release();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),options={ortDirectory:process.env.ORT_RUNTIME_DIR};let output;for(let i=0;i<args.length;i++){if(args[i]==='--source')options.sourcePath=args[++i];else if(args[i]==='--ort-dir')options.ortDirectory=args[++i];else if(args[i]==='--out')output=args[++i];else throw Error('Unknown argument '+args[i]);}
  if(!options.sourcePath)throw Error('Use --source STRICT_ARM_RESPONSE --ort-dir EXISTING_ORT_DIST');const report=await verifyCommonModifierCreationRom(options),text=JSON.stringify(report,null,2)+'\n';if(output)await writeFile(resolve(output),text);console.log(text);if(!report.passed)process.exitCode=1;
}
