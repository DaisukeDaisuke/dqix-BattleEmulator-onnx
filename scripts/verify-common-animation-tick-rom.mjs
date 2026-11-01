#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {buildCommonAnimationDispatch} from '../graph-v2/build-common-animation-dispatch.mjs';
import {buildCommonAnimationState} from '../graph-v2/build-common-animation-state.mjs';
import {buildCommonAnimationTick} from '../graph-v2/build-common-animation-tick.mjs';
import {buildCommonPresentationDelay} from '../graph-v2/build-common-presentation-scheduler.mjs';
import {buildCommonPresentationDelayCommit} from '../graph-v2/build-common-message-controller.mjs';
import {COMMON_ANIMATION_STATE_OFFSETS} from '../graph-v2/common-animation-fields.mjs';
import {createCommonAnimationTickRunner} from '../runtime/common-animation-tick.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
import {BATTLE_DEFINITIONS} from '../data/common-battle.mjs';

const args=process.argv.slice(2),opt=n=>{const i=args.indexOf(n);return i<0?undefined:args[i+1]},hash=x=>createHash('sha256').update(x).digest('hex'),scalar=(o,k)=>Number(o[k]?.[0]),limbs=x=>[x%65536,Math.floor(x/65536)];
if(!opt('--source'))throw Error('Use --source ORIGINAL_COMPLETE_TICKS --ort-dir PATH --out REPORT');
const bytes=await readFile(resolve(opt('--source'))),source=JSON.parse(bytes);
if(source.romSHA256!==BATTLE_DEFINITIONS.romSha256||!source.programUnmodified||!source.executionComplete)throw Error('Complete unchanged original ROM ticks are required');
const graphs=[buildCommonAnimationDispatch(),buildCommonAnimationState(),buildCommonAnimationTick(),buildCommonPresentationDelay(),buildCommonPresentationDelayCommit()],models=new Map(graphs.map(g=>[g.name,{name:g.name,onnx:g.model(),ir:g.json()}])),executor=createGraphExecutor({models,ortRuntime:await loadLocalOrt(opt('--ort-dir')??process.env.ORT_RUNTIME_DIR),backend:'onnxruntime-wasm'}),runner=createCommonAnimationTickRunner({runGraph:executor.runGraph,getModel:name=>models.get(name)?.ir});
const report={schema:'dq9-common-complete-animation-tick-rom-v1',sourceSHA256:hash(bytes),modelSHA256:Object.fromEntries([...models].map(([name,m])=>[name,hash(m.onnx)])),cases:0,fieldsCompared:0,mismatches:0,examples:[],retainedResumes:0,tailCalls:0,earlyReturns:0,scope:'Complete original021e9c0c caller including actual delay expiry, resource prechecks, linked opcode loop and all mandatory quiet tails. Full1056-halfword owner, globals, cursor and original control path are compared. Initial operands alone enter ONNX; original after-states are comparison targets. Active device/timeline effects remain unsupported.'};
const compare=(id,key,a,b)=>{report.fieldsCompared++;if(a!==b){report.mismatches++;if(report.examples.length<35)report.examples.push({id,key,actual:a,expected:b})}};
async function call(name,input){const ir=models.get(name).ir,values={...ir.contract.defaults,...input};return(await executor.runGraph(name,[Object.fromEntries(ir.inputs.map(v=>[v.name,Array.isArray(values[v.name])?values[v.name]:[values[v.name]]]))]))[0]}
function check(r,result,delay,flags,mode){
 const id=r.case.id+':'+mode;compare(id,'complete',result.complete,true);if(!result.complete){report.examples.push({id,pending:result.pending});return}
 const actual=[...r.before.scriptU16],s=result.state;COMMON_ANIMATION_STATE_OFFSETS.forEach((at,i)=>actual[at/2]=s.scriptStateU16[i]);
 const cursor=s.cursorIndex===null?0:0x02340000+32*s.cursorIndex;actual[2]=cursor%65536;actual[3]=Math.floor(cursor/65536);actual[0x1c4/2]=flags;actual[0x5ce/2]=delay;
 actual.forEach((v,i)=>compare(id,'owner+'+(2*i).toString(16),v,r.after.scriptU16[i]));
 compare(id,'eventFlags',s.eventFlagsU16[0]+65536*s.eventFlagsU16[1],r.after.eventFlags);compare(id,'ownerGlobal',s.scriptOwnerGlobalU16[0]+65536*s.scriptOwnerGlobalU16[1],r.after.scriptOwnerGlobal);
 compare(id,'tailExecuted',result.tailExecuted,r.executedPCs.includes('0x021ec018'));compare(id,'seedRetained',r.case.seed,r.after.seed);
}
try{
 for(const r of source.results){
  const c=r.case;if(!r.ok||!r.strictInitializedMemory||c.kind!=='script_update')throw Error('Original complete script caller failed '+c.id);
  const delay=await call('rom-common-presentation-delay',{delay:c.delay,deltaU16:limbs(c.deltaTicks),scriptEnabled:!!c.scriptEnabled,enabled:true});let flags=c.scriptFlags;
  if(scalar(delay,'requiresDelayCommit')){const o=await call('rom-common-presentation-delay-commit',{scriptFlagsLow:flags,actionId:1,actionRowPresent:false,participantPresent:true,sourceId:c.sourceId??192,soundGlobalWordU16:[0,0],argument:0});if(!scalar(o,'supported'))throw Error('Quiet original delay commit rejected');flags=scalar(o,'nextScriptFlagsLow')}
  const state={program:{schema:'dq9-computed-linked-animation-program-v1',codes:structuredClone(c.program)},cursorIndex:c.program.length?0:null,scriptStateU16:[...c.scriptStateU16]},input={scriptBaseU16:limbs(0x02370224),scriptOwnerGlobalU16:limbs(r.before.scriptOwnerGlobal),scriptEnabled:!!c.scriptEnabled,delayReturned:!!scalar(delay,'returnedForDelay'),actorResourcePrecheckComplete:true,actorResourceReturned:false,scriptFlagsLow:flags,resourceStates:[0,0,0,0],feedbackSelector:c.feedbackSelector,feedbackCount:c.feedbackCount,timelinePointersPresent:Array(12).fill(false),timelineExtraByte:0,actionRecordPresent:false,actionCategory:0,eventFlagsU16:limbs(c.eventFlags),enabled:true};
  const result=await runner.run({state,input});check(r,result,scalar(delay,'nextDelay'),flags,'uninterrupted');if(result.tailExecuted)report.tailCalls++;else report.earlyReturns++;
  let retained=state,resumed;for(let i=0;i<256;i++){resumed=await runner.run({state:retained,input,maxTransitions:1});if(resumed.complete)break;if(!resumed.budgetExhausted)throw Error(resumed.pending);retained=JSON.parse(JSON.stringify(resumed.state));report.retainedResumes++}
  check(r,resumed,scalar(delay,'nextDelay'),flags,'serialized-every-transition');report.cases++;
 }
 report.runtimeCounts={...executor.counts};
}finally{await executor.release()}
report.passed=report.cases>0&&report.mismatches===0;if(opt('--out'))await writeFile(resolve(opt('--out')),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
