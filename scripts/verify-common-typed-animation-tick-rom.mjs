#!/usr/bin/env node
// Actual typed file -> common constructor -> common opcode loop -> full tail,
// compared with an unchanged original parser followed by its original update.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildCommonAnimationNode} from '../graph-v2/build-common-animation-node.mjs';
import {buildCommonAnimationDispatch} from '../graph-v2/build-common-animation-dispatch.mjs';
import {buildCommonAnimationState} from '../graph-v2/build-common-animation-state.mjs';
import {buildCommonAnimationTick} from '../graph-v2/build-common-animation-tick.mjs';
import {buildCommonAnimationReset} from '../graph-v2/build-common-animation-reset.mjs';
import {COMMON_ANIMATION_STATE_OFFSETS,COMMON_ANIMATION_RESET_BASE} from '../graph-v2/common-animation-fields.mjs';
import {createCommonAnimationProgramBuilder} from '../runtime/common-animation-program.mjs';
import {createCommonAnimationTickRunner} from '../runtime/common-animation-tick.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
import {BATTLE_DEFINITIONS} from '../data/common-battle.mjs';
const args=process.argv.slice(2),opt=n=>{const i=args.indexOf(n);return i<0?undefined:args[i+1]},hash=x=>createHash('sha256').update(x).digest('hex');
if(!opt('--source')||!opt('--ort-dir'))throw Error('Use --source ORIGINAL_TYPED_PARSER_AND_UPDATE --ort-dir DIR --out REPORT');
const bytes=await readFile(opt('--source')),source=JSON.parse(bytes);if(!source.executionComplete||!source.programUnmodified||source.romSHA256!==BATTLE_DEFINITIONS.romSha256)throw Error('Complete unchanged original typed parser/update proof required');
const graphs=[buildCommonAnimationNode(),buildCommonAnimationDispatch(),buildCommonAnimationState(),buildCommonAnimationReset(),buildCommonAnimationTick()],models=new Map(graphs.map(g=>[g.name,{name:g.name,onnx:g.model(),ir:g.json()}])),executor=createGraphExecutor({models,ortRuntime:await loadLocalOrt(opt('--ort-dir'))}),runtime={runGraph:executor.runGraph,getModel:name=>models.get(name)?.ir},builder=createCommonAnimationProgramBuilder(runtime),runner=createCommonAnimationTickRunner(runtime);
const report={schema:'dq9-typed-parser-update-rom-verification-v1',sourceSHA256:hash(bytes),models:Object.fromEntries([...models].map(([n,m])=>[n,hash(m.onnx)])),cases:0,fieldsCompared:0,mismatches:0,examples:[],retainedResumes:0,scope:'Original SafeAllocator creation and typed parser execute before the unchanged original full script update. Runtime uses only the same original file bytes and initial script fields. Constructor written bits and sequential links, then every owner halfword except the structurally represented program/cursor pointers, globals and completion are compared. Original pointer values and after-state never feed ONNX.'};
function compare(id,key,a,b){report.fieldsCompared++;if(a!==b){report.mismatches++;if(report.examples.length<35)report.examples.push({id,key,actual:a,expected:b});}}
function check(r,result,mode){
 const id=r.case.id+':'+mode;compare(id,'complete',result.complete,true);if(!result.complete){report.examples.push({id,pending:result.pending});return;}
 const actual=[...r.before.scriptU16];if(result.state.scriptResetU16)result.state.scriptResetU16.forEach((v,i)=>actual[COMMON_ANIMATION_RESET_BASE/2+i]=v);COMMON_ANIMATION_STATE_OFFSETS.forEach((at,i)=>actual[at/2]=result.state.scriptStateU16[i]);
 for(let i=4;i<actual.length;i++)compare(id,'owner+'+(2*i).toString(16),actual[i],r.after.scriptU16[i]);
 compare(id,'cursorExhausted',result.state.cursorIndex===null,r.after.cursor==='0x00000000');compare(id,'eventFlags',result.state.eventFlagsU16[0]+65536*result.state.eventFlagsU16[1],r.after.eventFlags);compare(id,'ownerGlobal',result.state.scriptOwnerGlobalU16[0]+65536*result.state.scriptOwnerGlobalU16[1],r.after.scriptOwnerGlobal);compare(id,'tailExecuted',result.tailExecuted,r.executedPCs.includes('0x021ec018'));
}
try{
 for(const r of source.results){
  const c=r.case;if(!r.ok||!r.strictInitializedMemory||!r.parsedNodes||r.parserInstructions<=0||r.allocatorInstructions<=0)throw Error('Original parser/update failed '+c.id);
  const built=await builder.build(Buffer.from(c.scriptHex,'hex'));if(!built.complete||built.programs.length!==1)throw Error(built.pending??'Expected one actual program');
  const codes=built.program.codes;compare(c.id,'nodeCount',codes.length,r.parsedNodes.length);
  for(let i=0;i<codes.length;i++){const a=codes[i],e=r.parsedNodes[i];compare(c.id,'node'+i+'.opcode',a.opcode,e.opcode);compare(c.id,'node'+i+'.sequentialLink',e.next,i+1<codes.length?r.parsedNodes[i+1].pointer:0);compare(c.id,'node'+i+'.payloadBaseOffset',a.payloadBaseOffset,0);for(let j=0;j<a.nodeByteLength/2;j++)if(a.payloadMaskU16[j])compare(c.id,'node'+i+'.rawHalfword'+j,a.payloadU16[j]&a.payloadMaskU16[j],e.rawNodeU16[j]&a.payloadMaskU16[j]);}
  const state={program:built.program,cursorIndex:codes.length?0:null,scriptStateU16:[...c.scriptStateU16],...(c.scriptResetU16?{scriptResetU16:[...c.scriptResetU16],commandPointerU16:[...c.commandPointerU16]}:{})},input={scriptBaseU16:[0x224,0x237],scriptOwnerGlobalU16:[0,0],scriptEnabled:!!c.scriptEnabled,delayReturned:false,actorResourcePrecheckComplete:true,actorResourceReturned:false,scriptFlagsLow:c.scriptFlags,resourceStates:[0,0,0,0],feedbackSelector:c.feedbackSelector,feedbackCount:c.feedbackCount,timelinePointersPresent:Array(12).fill(false),timelineExtraByte:0,actionRecordPresent:false,actionCategory:0,eventFlagsU16:[c.eventFlags,0],enabled:true};
  const result=await runner.run({state,input});check(r,result,'uninterrupted');let retained=state,resumed;
  for(let i=0;i<256;i++){resumed=await runner.run({state:retained,input,maxTransitions:1});if(resumed.complete)break;if(!resumed.budgetExhausted)throw Error(resumed.pending);retained=JSON.parse(JSON.stringify(resumed.state));report.retainedResumes++;}
  check(r,resumed,'serialized-every-transition');report.cases++;
 }
}finally{await executor.release();}
report.passed=report.cases>0&&report.mismatches===0;if(opt('--out'))await writeFile(opt('--out'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
