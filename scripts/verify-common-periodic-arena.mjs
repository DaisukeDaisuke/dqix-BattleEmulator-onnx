#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildCommonPeriodicArena} from '../graph-v2/build-common-periodic-arena.mjs';
import {BATTLE_DEFINITIONS} from '../data/common-battle.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';

const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];},hash=x=>createHash('sha256').update(x).digest('hex');
if(!option('--source'))throw Error('Use --source original-response.json --ort-dir ORT_DIR [--report REPORT]');
const sourceBytes=await readFile(option('--source')),source=JSON.parse(sourceBytes);
if(!source.executionComplete||!source.programUnmodified||source.romSHA256!==BATTLE_DEFINITIONS.romSha256)throw Error('Require complete, unmodified matching-ROM execution');
const graph=buildCommonPeriodicArena(),model={name:graph.name,ir:graph.json(),onnx:graph.model()},ort=await loadLocalOrt(option('--ort-dir')??process.env.ORT_RUNTIME_DIR);
const executor=createGraphExecutor({models:new Map([[model.name,model]]),ortRuntime:ort});
const report={schema:'dq9-common-periodic-arena-verification-v1',sourceSHA256:hash(sourceBytes),romSHA256:source.romSHA256,modelSHA256:hash(model.onnx),cases:[],arenaBytesCompared:0,changedBytesCompared:0,mismatches:0,examples:[],scope:'Actual original periodic record caller including real allocators. The arena snapshot is captured before guest entry; no completed record, index, pointer or byte is an input. Every final arena byte is compared, including nonwritten bytes. No asynchronous rendering or camera-completion claim.'};
const countersAt=[0x8e24,0x8e00,0x8e01,0x8e02,0x8e03];
try{for(const original of source.results){
  const c=original.case;
  if(!original.ok||!original.strictInitializedMemory||!original.initialSnapshotBeforeGuestEntry||c.kind!=='periodic_record')throw Error('Unqualified direct original record '+c.id);
  const initial=Buffer.from(original.initialArenaRaw,'hex');
  if(initial.length!==0x9000)throw Error('Initial arena extent differs');
  for(let i=0;i<5;i++)if((i===0?initial.readUInt32LE(countersAt[i]):initial[countersAt[i]])!==c.counters[i])throw Error('Initial counters differ from supplied inputs');
  const count=c.targets.length,actionId=c.groupKind===0?(count===1?930:931):c.groupKind===1?(count===1?932:933):934;
  const raw=(c.actionTable??[]).map(x=>Buffer.from(x,'hex')).find(x=>x.readUInt16LE(4)===actionId);
  if(!raw)throw Error('Missing supplied action table row');
  const actor=id=>id<4?c.parties[id]:c.enemies[id-192],payload=Array(288).fill(0);
  // Encode direct function operands and initial actor fields, not ROM outputs.
  // Numeric computation of these operands is independently exercised by the
  // complete periodic-vitals verifier.
  for(let i=0;i<count;i++){
    const a=actor(c.targets[i]),bytes=Buffer.alloc(36),write16=(at,value)=>bytes.writeUInt16LE(value&65535,at);
    for(let j=0;j<4;j++)write16(j*2,c.flagsU16[i*4+j]);
    write16(12,c.groupKind===2?c.amounts[i]:-c.amounts[i]);
    write16(14,c.groupKind===1?a.hp:c.values[i]);write16(16,c.groupKind===1?c.values[i]:a.mp);
    write16(18,a.maxHp);write16(20,a.maxMp);
    const status=((a.status??0)|(a.hp===0?1:0)|(a.hpRegen?0x80000000:0)|(a.mpRegen?0x40000000:0)|(a.poison?2:0))>>>0;
    bytes.writeUInt32LE(status,24);bytes[29]=(a.poisonKind??0)>>>2&15;bytes[30]=(a.poisonKind??0)&3;
    for(let j=0;j<36;j++)payload[i*36+j]=bytes[j];
  }
  const first=actor(c.targets[0]),feed={arenaBaseU16:[0,0x023e],counters:c.counters,actionId:[actionId],startMessage:[raw.readUInt32LE(32)&1023],clearStartMessageOnImpact:[c.groupKind===2],targetCount:[count],targetIds:[...c.targets,...Array(8-count).fill(-1)],participantVitals:[first.hp,first.mp],impactPayloadBytes:payload,impactMessageIds:c.groupKind===2?[raw.readUInt32LE(32)&1023,raw.readUInt32LE(32)>>>20&1023]:[0,0],impactMessageCount:[c.groupKind===2?2:0],messagePaddingBytes:Array.from({length:504},(_,i)=>initial[0x5480+Math.floor(i/2)*8+2+i%2]),enabled:[true]};
  const out=(await executor.runGraph(model.name,[feed]))[0];if(!out.supported[0])throw Error('Valid direct caller rejected '+c.id);
  const actual=Buffer.from(initial),patch=(offset,stride,indices,bytes)=>{for(let i=0;i<indices.length;i++)if(indices[i]>=0){if(offset+stride*(indices[i]+1)>actual.length)throw Error('Arena write exceeds input allocation');actual.set(bytes.slice(i*stride,(i+1)*stride),offset+stride*indices[i]);}};
  patch(0x821c,40,out.commandIndex,out.commandBytes);patch(0x20,52,out.participantIndex,out.participantBytes);
  patch(0xec0,36,out.targetIndices,out.targetBytes);patch(0x21e0,36,out.impactIndices,out.impactBytes);patch(0x5480,8,out.messageIndices,out.messageBytes);
  out.nextCounters.forEach((value,i)=>{if(i===0)actual.writeUInt32LE(value,countersAt[i]);else actual[countersAt[i]]=value;});
  // Only this boundary reads the original completed arena.
  const expected=Buffer.from(original.finalArenaRaw,'hex');if(expected.length!==initial.length)throw Error('Final arena extent differs');
  let mismatches=0,changed=0;
  for(let i=0;i<actual.length;i++){
    report.arenaBytesCompared++;if(expected[i]!==initial[i]){changed++;report.changedBytesCompared++;}
    if(actual[i]===expected[i])continue;mismatches++;report.mismatches++;
    if(report.examples.length<24)report.examples.push({id:c.id,offset:'0x'+i.toString(16),got:actual[i],want:expected[i]});
  }
  if(original.consumed!==0)throw Error('Record writer unexpectedly consumed RNG');
  report.cases.push({id:c.id,counters:c.counters,nextCounters:out.nextCounters,created:!!out.created[0],changedBytes:changed,mismatches});
}}finally{await executor.release();}
report.passed=report.mismatches===0;report.runtime={version:ort.env.versions.web,counts:executor.counts};
if(option('--report'))await writeFile(option('--report'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
