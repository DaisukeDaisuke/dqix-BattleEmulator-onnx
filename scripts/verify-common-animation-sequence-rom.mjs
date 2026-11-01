#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {buildCommonAnimationDispatch} from '../graph-v2/build-common-animation-dispatch.mjs';
import {buildCommonAnimationState} from '../graph-v2/build-common-animation-state.mjs';
import {COMMON_ANIMATION_STATE_OFFSETS} from '../graph-v2/common-animation-fields.mjs';
import {createCommonAnimationExecutionRunner} from '../runtime/common-animation-execution.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
import {BATTLE_DEFINITIONS} from '../data/common-battle.mjs';

const args=process.argv.slice(2),opt=n=>{const i=args.indexOf(n);return i<0?undefined:args[i+1];},hash=x=>createHash('sha256').update(x).digest('hex');
if(!opt('--source'))throw Error('Use --source ORIGINAL_SEQUENCE_CALLERS --ort-dir PATH --out REPORT');
const bytes=await readFile(resolve(opt('--source'))),source=JSON.parse(bytes);if(source.romSHA256!==BATTLE_DEFINITIONS.romSha256||!source.programUnmodified)throw Error('Matching unmodified original ROM evidence required');
const graphs=[buildCommonAnimationDispatch(),buildCommonAnimationState()],models=new Map(graphs.map(g=>[g.name,{name:g.name,ir:g.json(),onnx:g.model()}])),ortRuntime=await loadLocalOrt(opt('--ort-dir')??process.env.ORT_RUNTIME_DIR),executor=createGraphExecutor({models,ortRuntime}),runner=createCommonAnimationExecutionRunner({runGraph:executor.runGraph,getModel:name=>models.get(name)?.ir}),report={schema:'dq9-common-animation-sequence-rom-v1',sourceSHA256:hash(bytes),modelSHA256:Object.fromEntries([...models].map(([k,v])=>[k,hash(v.onnx)])),cases:0,fieldsCompared:0,mismatches:0,examples:[],retainedResumes:0,scope:'Actual linked opcode loops through pure-state handlers, stopping before mandatory frame-tail helpers. All owner words and cursor are compared to original ARM execution. A second run stops after every graph transition, serializes to JSON, and resumes without replaying completed handlers.'};
const compare=(id,key,actual,expected)=>{report.fieldsCompared++;if(actual!==expected){report.mismatches++;if(report.examples.length<30)report.examples.push({id,key,actual,expected});}};
function check(r,result,mode){
 const id=r.case.id+':'+mode;compare(id,'tailReached',result.tailReached,true);compare(id,'complete',result.complete,true);const cursor=result.state.cursorIndex??-1;compare(id,'cursorIndex',cursor,r.cursorIndex);
 const actual=[...r.beforeScriptU16];COMMON_ANIMATION_STATE_OFFSETS.forEach((offset,i)=>actual[offset/2]=result.state.scriptStateU16[i]);const pointer=cursor<0?0:0x02390000+32*cursor;actual[2]=pointer%65536;actual[3]=Math.floor(pointer/65536);actual.forEach((value,i)=>compare(id,'owner+'+(i*2).toString(16),value,r.afterScriptU16[i]));
}
try{
 for(const r of source.results){
  if(!r.ok)throw Error('Original sequence failed '+r.case.id);const state={program:{schema:'dq9-computed-linked-animation-program-v1',codes:r.case.program},cursorIndex:r.case.program.length?0:null,scriptOwnerPresent:true,scriptStateU16:COMMON_ANIMATION_STATE_OFFSETS.map(offset=>r.beforeScriptU16[offset/2])};
  const result=await runner.run({state});check(r,result,'uninterrupted');let retained=state,resumed;
  for(let i=0;i<250;i++){resumed=await runner.run({state:retained,maxTransitions:1});if(resumed.complete)break;if(!resumed.budgetExhausted)throw Error(resumed.pending);retained=JSON.parse(JSON.stringify(resumed.state));report.retainedResumes++;}
  check(r,resumed,'serialized-every-transition');report.cases++;
 }
 report.runtimeCounts={...executor.counts};
}finally{await executor.release();}
report.passed=report.cases>0&&report.mismatches===0;if(opt('--out'))await writeFile(resolve(opt('--out')),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
