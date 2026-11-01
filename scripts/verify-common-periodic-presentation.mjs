#!/usr/bin/env node
// Independent original periodic caller -> shared numeric/grouped record path.
// Only initial party/enemy data is used as input. Expected buffers are read
// after all graph execution for the corresponding case has completed.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildCommonPeriodic} from '../graph-v2/build-common-control.mjs';
import {buildCommonPeriodicPresentation} from '../graph-v2/build-common-presentation.mjs';
import {buildCommonPeriodicArena} from '../graph-v2/build-common-periodic-arena.mjs';
import {ACTOR_FIELDS} from '../graph-v2/rules.mjs';
import {BATTLE_DEFINITIONS,seedBytes} from '../data/common-battle.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';

const args=process.argv.slice(2),option=name=>{const at=args.indexOf(name);return at<0?undefined:args[at+1];},hash=value=>createHash('sha256').update(value).digest('hex');
if(!option('--source'))throw Error('Use --source strict-original-response.json --ort-dir ORT_DIR [--report REPORT]');
const bytes=await readFile(option('--source')),source=JSON.parse(bytes),ort=await loadLocalOrt(option('--ort-dir')??process.env.ORT_RUNTIME_DIR);
if(!source.executionComplete||!source.programUnmodified||source.romSHA256!==BATTLE_DEFINITIONS.romSha256)throw Error('Require complete unmodified matching-ROM evidence');
const models=new Map([buildCommonPeriodic(),buildCommonPeriodicPresentation(),buildCommonPeriodicArena()].map(g=>[g.name,{name:g.name,ir:g.json(),onnx:g.model()}]));
const executor=createGraphExecutor({models,ortRuntime:ort}),report={schema:'dq9-common-periodic-presentation-parity-v1',sourceSHA256:hash(bytes),romSHA256:source.romSHA256,moduleHashes:Object.fromEntries([...models].map(([name,m])=>[name,hash(m.onnx)])),cases:[],fieldsCompared:0,mismatches:0,examples:[],scope:'Complete original periodic-vitals caller; shared numeric states, retained scratch flags, all command/participant/target/impact/message bytes, arena counters and linked pointers. The harness initializes the arena to zero before entry; expected buffers are never execution inputs. Asynchronous rendering and camera completion are excluded.'};
const check=(id,path,got,want)=>{report.fieldsCompared++;if(Object.is(got,want))return;report.mismatches++;if(report.examples.length<24)report.examples.push({id,path,got,want});};
const checkBytes=(id,path,got,hex)=>{const want=Buffer.from(hex,'hex');check(id,path+'.length',got.length,want.length);for(let i=0;i<Math.min(got.length,want.length);i++)check(id,path+'.byte'+i,got[i],want[i]);};
const call=async(name,input)=>{const ir=models.get(name).ir,feed={};for(const field of ir.inputs){const value=input[field.name]??ir.contract.defaults[field.name];feed[field.name]=Array.isArray(value)?value:[value];}return(await executor.runGraph(name,[feed]))[0];};
const word=(id,offset)=>Buffer.from(BATTLE_DEFINITIONS.actions[id].raw,'hex').readUInt32LE(offset);
const messages=[930,931,932,933].map(id=>word(id,32)&1023);messages.push(word(934,32)&1023,word(934,32)>>>20&1023,word(934,40)&1023);
try{for(const original of source.results){
  if(!original.ok||!original.strictInitializedMemory||original.case.kind!=='periodic_group')throw Error('Unqualified original group');
  const c=original.case,beforeMismatches=report.mismatches,records=[];
  const actors=[...c.parties.map((a,i)=>({...a,party:1,id:i})),...c.enemies.map((a,i)=>({...a,party:0,id:192+i}))].map(a=>({actor:ACTOR_FIELDS.map(key=>a[key]??0),aux:models.get('rom-common-periodic').ir.contract.defaults.aux.slice(),status:[a.poisonKind??0,0,0,0,0,0,0],tension:[0,0,0],preparation:[0,0,0,0,0],rawStatus:((a.status??0)|((a.hpRegen??0)?0x80000000:0)|((a.mpRegen??0)?0x40000000:0)|((a.poison??0)?2:0))>>>0,statusKinds:a.poisonKind??0}));
  let seed=seedBytes(c.seed),position=1,scratch=Array(32).fill(0),counters=[0,0,0,0,0];
  for(const [party,operations]of [[1,[1,2,3]],[0,[2,3]]])for(const operation of operations){
    const group=actors.filter(a=>a.actor[17]===party&&a.actor[0]>0),snapshots=[];
    for(const actor of group){
      const before=structuredClone(actor),out=await call('rom-common-periodic',{...actor,seed,position,operation,enabled:true,present:true});
      seed=out.nextSeed;position=out.nextPosition[0];for(const key of ['Actor','Aux','Status','Tension','Preparation'])actor[key[0].toLowerCase()+key.slice(1)]=out['next'+key];
      snapshots.push({before,after:structuredClone(actor),out});
    }
    const key=['','hpRequested','mpRequested','poisonRequested'][operation];
    if(snapshots.some(s=>!s.out[key]))throw Error('Numeric periodic requested-amount output is missing');
    const input={operation,partyGroup:!!party,enabled:true,metadataInputsComplete:true,messageData:messages,scratchFlagsU16:scratch,present:Array.from({length:8},(_,i)=>i<snapshots.length),requestedAmounts:Array.from({length:8},(_,i)=>snapshots[i]?.out[key][0]??0),rawStatusU16:Array.from({length:8},(_,i)=>{const raw=snapshots[i]?.after.rawStatus??0;return[raw%65536,Math.floor(raw/65536)];}).flat(),statusKinds:Array.from({length:8},(_,i)=>snapshots[i]?.after.statusKinds??0)};
    for(const when of ['before','after'])for(const [field,width,vector]of [['Actors',33,'actor'],['Status',7,'status']])input[when+field]=[...snapshots.flatMap(s=>s[when][vector]),...Array((8-snapshots.length)*width).fill(0)];
    const output=await call('rom-common-periodic-presentation',input);if(!output.supported[0]||!output.metadataSupported[0])throw Error('Shared periodic producer rejected '+c.id);
    scratch=output.nextScratchFlagsU16;if(output.wrote[0]){
      const arena=await call('rom-common-periodic-arena',{arenaBaseU16:[0,0x023e],counters,actionId:output.command[0],startMessage:output.initialStartMessage[0],clearStartMessageOnImpact:output.clearStartMessageOnImpact[0],targetCount:output.targetCount[0],targetIds:output.targets,participantVitals:output.participantVitals,impactPayloadBytes:output.impactPayloadBytes,impactMessageIds:output.impactMessageIds,impactMessageCount:output.impactMessageCount[0],messagePaddingBytes:Array(504).fill(0),enabled:true});
      if(!arena.supported[0]||!arena.created[0])throw Error('Shared periodic arena rejected '+c.id);
      counters=arena.nextCounters;records.push({...output,arena});
    }
  }
  // Expected state is accessed only at this comparison boundary.
  const wanted=original.generatedPresentationQueue.records;
  check(c.id,'commandCount',records.length,wanted.length);check(c.id,'rngConsumed',position-1,original.consumed);
  ['count','participantSlotsUsed','targetSlotsUsed','impactSlotsUsed','messageSlotsUsed'].forEach((key,i)=>check(c.id,'arena.'+key,counters[i],original.generatedPresentationQueue[key]));
  for(let i=0;i<8;i++)check(c.id,'seed'+i,seed[i],seedBytes(original.nextState)[i]);
  for(let i=0;i<actors.length;i++)for(const [key,index]of [['hp',0],['mp',2]])check(c.id,`actor${i}.${key}`,actors[i].actor[index],original.actors[i][key]);
  for(let i=0;i<Math.min(records.length,wanted.length);i++){
    const got=records[i],want=wanted[i],raw=Buffer.from(want.raw40,'hex');
    checkBytes(c.id,`command${i}.raw40`,got.arena.commandBytes,want.raw40);
    checkBytes(c.id,`command${i}.participant52`,got.arena.participantBytes,want.participantRaw52[0]);
    for(const [key,value]of [['action',got.command[0]],['flagsA',got.command[4]],['flagsB',got.command[5]],['targetCount',got.targetCount[0]]])check(c.id,`command${i}.${key}`,value,want[key]);
    check(c.id,`command${i}.startMessage`,got.startMessage[0],raw.readUInt16LE(24));
    for(let j=0;j<got.targetCount[0];j++){
      check(c.id,`command${i}.target${j}`,got.targets[j],want.targets[j]);
      const impacts=want.targetImpacts[j].categories[0];check(c.id,`command${i}.impactCount${j}`,impacts.length,1);
      checkBytes(c.id,`command${i}.target${j}.raw36`,got.arena.targetBytes.slice(j*36,(j+1)*36),want.targetRaw36[j]);
      checkBytes(c.id,`command${i}.impact${j}.raw36`,got.arena.impactBytes.slice(j*36,(j+1)*36),impacts[0].raw36);
      check(c.id,`command${i}.targetAddress${j}`,0x023e0000+0xec0+got.arena.targetIndices[j]*36,Number(want.targetImpacts[j].targetAddress));
      check(c.id,`command${i}.impactAddress${j}`,0x023e0000+0x21e0+got.arena.impactIndices[j]*36,Number(impacts[0].address));
      const expected=Buffer.from(impacts[0].raw36,'hex'),actual=got.impactPayloadBytes.slice(j*36,(j+1)*36);
      for(let k=0;k<36;k++)if(!(k>=8&&k<12)&&!(k>=31))check(c.id,`command${i}.impact${j}.byte${k}`,actual[k],expected[k]);
      check(c.id,`command${i}.messageCount${j}`,got.impactMessageCount[0],impacts[0].messages.length);
      impacts[0].messages.forEach((message,k)=>{
        check(c.id,`command${i}.message${j}.${k}`,got.impactMessageIds[k],Buffer.from(message.raw8,'hex').readUInt16LE(0));
        checkBytes(c.id,`command${i}.message${j}.${k}.raw8`,got.arena.messageBytes.slice((j*2+k)*8,(j*2+k+1)*8),message.raw8);
        check(c.id,`command${i}.message${j}.${k}.address`,0x023e0000+0x5480+got.arena.messageIndices[j*2+k]*8,Number(message.address));
      });
    }
  }
  report.cases.push({id:c.id,commands:records.length,mismatches:report.mismatches-beforeMismatches});
}}finally{await executor.release();}
report.passed=report.mismatches===0;report.runtime={version:ort.env.versions.web,counts:executor.counts};if(option('--report'))await writeFile(option('--report'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
