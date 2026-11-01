#!/usr/bin/env node
// Full original preprocessing callers, with the actual twelve actor slots.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {BATTLE_DEFINITIONS} from '../data/common-battle.mjs';
import {buildPreprocessScan,buildPreprocessCommit} from '../graph-v2/build-camera-preprocess.mjs';
import {buildCameraParentControl} from '../graph-v2/build-camera-parent-control.mjs';
import {buildCameraGeometry} from '../graph-v2/build-camera-geometry.mjs';
import {createCameraPreprocessRunner} from '../graph-v2/camera-preprocess-runner.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';

const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];},hash=x=>createHash('sha256').update(x).digest('hex'),clone=x=>structuredClone(x),pad=(a,n,v=0)=>[...a,...Array(n-a.length).fill(v)];
if(!option('--source'))throw Error('Use --source original-camera-preprocessing.json --ort-dir ORT_DIR [--report JSON]');
const sourceBytes=await readFile(resolve(option('--source'))),source=JSON.parse(sourceBytes);
if(!source.executionComplete||!source.programUnmodified||source.romSHA256!==BATTLE_DEFINITIONS.romSha256)throw Error('Complete unchanged matching-ROM evidence is required');
const graphs=[await buildPreprocessScan({capacity:12,commandCapacity:72}),await buildPreprocessCommit({capacity:12,commandCapacity:72}),await buildCameraParentControl({capacity:12}),await buildCameraGeometry()],models=new Map(graphs.map(g=>[g.name,{name:g.name,ir:g.json(),onnx:g.model()}]));
const ort=await loadLocalOrt(option('--ort-dir')??process.env.ORT_RUNTIME_DIR),executor=createGraphExecutor({models,ortRuntime:ort}),runner=await createCameraPreprocessRunner({runGraph:executor.runGraph,getModel:name=>models.get(name)?.ir,capacity:12});
const report={schema:'dq9-common-camera-population-rom-v1',romSHA256:source.romSHA256,sourceSHA256:hash(sourceBytes),runtimeVersion:ort.env.versions.web,moduleHashes:Object.fromEntries([...models].map(([name,m])=>[name,hash(m.onnx)])),cases:[],fieldsCompared:0,mismatches:0,examples:[],scope:'Initial actor/linked command data alone drives shared roster inclusion, full twelve-actor preprocessing and exact distance graphs. Every final raw visual/cache field and unchanged RNG is compared to the complete original preprocessing function. Special battle exclusions are computed by the shared parent graph before structural compaction. This proves neither the enclosing dispatcher nor the correlated row+4 producer.'};
const compare=(id,key,got,want)=>{if(Array.isArray(want)){if(!Array.isArray(got)||got.length!==want.length){report.mismatches++;if(report.examples.length<80)report.examples.push({id,key,shape:[got?.length,want.length]});return;}want.forEach((x,i)=>compare(id,key+'['+i+']',got[i],x));return;}report.fieldsCompared++;if(got!==want){report.mismatches++;if(report.examples.length<80)report.examples.push({id,key,got,want});}};
try{
  for(const row of source.results){
    const c=row.case;if(!row.ok||!row.strictInitializedMemory||!row.completeFunctionExecuted||c.kind!=='camera_preprocess_math')throw Error('Unqualified original case '+c.id);
    const before=report.mismatches,flags=pad(c.roster.flatMap(a=>Array.from({length:4},(_,i)=>Math.floor(a.visualFlags/2**(8*i))%256)),48),parent=(await executor.runGraph('rom-camera-parent-control12',[{battleType:[c.battleType??0],sourceId:[c.commands[c.currentActionIndex]?.participants?.[0]??0],sourcePresent:[!!c.commands[c.currentActionIndex]?.participants?.length],sceneByte:[0],dispatcherReturn:[0],commit:[false],enabled:[true],ids:pad(c.roster.map(a=>a.id),12),rosterCount:[c.roster.length],visualFlagsBytes:flags}]))[0];
    const included=c.roster.filter((_,i)=>parent.includedRows[i]),excluded=c.roster.filter((_,i)=>!parent.includedRows[i]),input={...clone(c),roster:clone(included),lookupObjects:[...clone(c.lookupObjects??[]),...clone(excluded)]},result=await runner.run({rows:[input]}),actual=new Map(result.rows[0].roster.map(a=>[a.id,a]));
    for(const actor of excluded)actual.set(actor.id,clone(actor));
    for(const expected of row.rows){const got=actual.get(expected.id);if(!got)throw Error('Missing computed actor '+expected.id);for(const[key,value]of Object.entries(expected))compare(c.id,'actor'+expected.id+'.'+key,key==='visualPresent'?got.visualPresent!==false&&got.visualPresent!==0:got[key],value);}
    compare(c.id,'nextState',row.nextState.toLowerCase(),'0x'+BigInt(c.seed).toString(16).padStart(16,'0'));compare(c.id,'consumed',result.consumed[0],row.consumed);
    report.cases.push({id:c.id,actors:c.roster.length,compactedActors:included.length,commands:c.commands.length,mismatches:report.mismatches-before,originalInstructions:row.instructions});
  }
}finally{await executor.release();}
report.passed=report.mismatches===0;const json=JSON.stringify(report,null,2)+'\n';if(option('--report'))await writeFile(resolve(option('--report')),json);console.log(json);if(!report.passed)process.exitCode=1;
