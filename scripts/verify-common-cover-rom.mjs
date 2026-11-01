#!/usr/bin/env node
// A verification-only initial-RAM adapter for the original ARM cover helper.
// Observed results are comparisons; they are never input to the ONNX graph.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BATTLE_DEFINITIONS,seedBytes} from '../data/common-battle.mjs';
import {ACTOR_FIELDS} from '../graph-v2/rules.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const wordBytes=word=>Array.from({length:4},(_,i)=>Number(word)>>>i*8&255);
const pad=(values,n,fill)=>Array.from({length:n},(_,i)=>values[i]??fill);
function initialActor(raw,id){
  const bytes=Buffer.alloc(0xb0),party=id<4;
  for(const[key,offset,fallback]of [['hp',0,100],['mp',2,10],['maxHp',4,100],['maxMp',6,100],['attack',8,0],['defense',10,0],['agility',12,0]])bytes.writeUInt16LE(raw[key]??fallback,offset);
  bytes.writeUInt32LE(((raw.status??0)|((raw.hp??100)===0?1:0))>>>0,0x14);bytes.writeUInt32LE(raw.flags18??0,0x18);bytes[0x21]=raw.defend??0;
  bytes.writeInt16LE(raw.coverTargetId??-1,0x2a);
  for(const[offset,value]of Object.entries(raw.statBytes??{}))bytes[Number(offset)]=value;
  const values={hp:bytes.readUInt16LE(0),maxHp:bytes.readUInt16LE(4),defend:bytes[0x21],id,party:Number(party)};
  return{actor:ACTOR_FIELDS.map(key=>values[key]??0),present:raw.present!==0,member:raw.roster!==0,status:bytes.readUInt32LE(0x14),flags:bytes.readUInt32LE(0x18),coverTargetId:bytes.readInt16LE(0x2a),id,group:raw.group??0};
}

export function projectCoverCase(c){
  if(c.kind!=='cover_target'||!Array.isArray(c.party)||!Array.isArray(c.enemies)||c.party.length>4||c.enemies.length>8)throw Error(c.id+': invalid cover-helper initial roster');
  const party=c.party.map((a,i)=>initialActor(a,i)),enemies=c.enemies.map((a,i)=>initialActor(a,192+i)),actors=[...party,...enemies],rows=pad(actors,12,null);
  const initialOrder=c.partyOrder??party.map(a=>a.id);
  if(new Set(initialOrder).size!==initialOrder.length||initialOrder.some(id=>!Number.isInteger(id)||id<0||id>3))throw Error(c.id+': invalid party roster order');
  const orderedParty=initialOrder.map(id=>party.find(a=>a.id===id)).filter(Boolean),orderedEnemies=[0,1,2].flatMap(group=>enemies.filter(a=>a.group===group));
  const targetId=c.targetId??0,side=(targetId>=0&&targetId<=3?orderedParty:orderedEnemies).filter(a=>a.present&&a.member&&!(a.status&1)&&!(a.flags&0x2000));
  const action=BATTLE_DEFINITIONS.actions[c.actionId??1];if(!action)throw Error(c.id+': unknown initial action record');
  return{seed:seedBytes(c.seed),position:[1],enabled:[true],actors:rows.flatMap(a=>a?.actor??ACTOR_FIELDS.map(key=>key==='id'?-1:0)),actorPresent:rows.map(a=>!!a?.present),
    rawStatusBytes:rows.flatMap(a=>wordBytes(a?.status??0)),rawFlagBytes:rows.flatMap(a=>wordBytes(a?.flags??0)),coverTargetIds:rows.map(a=>a?.coverTargetId??-1),
    rosterIds:pad(side.map(a=>a.id),8,-1),rosterCount:[side.length],targetId:[targetId],hitPresent:[!c.missingHit],coverAllowed:[!!action.coverAllowed],priorCovered:[!!c.priorCovered]};
}

export async function verifyCommonCoverRom({sourcePath,ortDirectory,backend='onnxruntime-wasm',observedPath}={}){
  const sourceBytes=await readFile(resolve(sourcePath)),source=JSON.parse(sourceBytes);
  if(source.executionComplete!==true||source.programUnmodified!==true||source.romSHA256!==BATTLE_DEFINITIONS.romSha256||!source.results?.length||source.results.some(r=>!r.ok||!r.strictInitializedMemory))throw Error('Complete unmodified strict ARM evidence is required');
  const name='rom-common-cover-target',irBytes=await readFile(resolve(root,'graph-v2',name+'.json')),onnx=await readFile(resolve(root,'graph-v2',name+'.onnx')),ir=JSON.parse(irBytes);
  const ort=await loadLocalOrt(ortDirectory),executor=createGraphExecutor({models:new Map([[name,{name,ir,onnx}]]),ortRuntime:ort,backend});
  const report={schema:'dq9-common-cover-arm-verification-v1',source:resolve(sourcePath),sourceSha256:hash(sourceBytes),romSha256:source.romSHA256,authority:source.method,
    model:{name,sha256:hash(onnx),irSha256:hash(irBytes)},cases:source.results.length,fieldsCompared:0,mismatches:0,examples:[],backend,ortVersion:ort.env.versions.web,
    scope:'Every strict original ARM cover-helper case, using only the initial RAM definition. The surrounding command loop is verified separately; no expected endpoint is fed into inference.'};
  try{
    const inputs=source.results.map(r=>projectCoverCase(r.case)),outputs=await executor.runGraph(name,inputs),observations=[];
    source.results.forEach((result,i)=>{
      const expected={nextSeed:seedBytes(result.nextState),nextPosition:[1+result.consumed],consumed:[result.consumed],nextTargetId:[result.nextTargetId],covered:[Number(!!result.integerResult)],nextCovered:[Number(!!result.covered)],routeKind:[result.routeKind],supported:[1],skipTarget:[Number(!!result.case.priorCovered&&!result.integerResult)]};
      for(const[key,want]of Object.entries(expected))want.forEach((value,j)=>{report.fieldsCompared++;if(Number(value)!==Number(outputs[i][key]?.[j])){report.mismatches++;if(report.examples.length<50)report.examples.push({id:result.case.id,key,index:j,expected:value,observed:outputs[i][key]?.[j]});}});
      if(observedPath)observations.push({id:result.case.id,input:inputs[i],expected,observed:outputs[i]});
    });
    report.passed=report.mismatches===0;report.counts={...executor.counts};
    if(observedPath)await writeFile(resolve(observedPath),JSON.stringify({report,cases:observations},null,2)+'\n');return report;
  }finally{await executor.release();}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),options={ortDirectory:process.env.ORT_RUNTIME_DIR};let output;
  const keys={'--source':'sourcePath','--ort-dir':'ortDirectory','--backend':'backend','--observed-out':'observedPath'};
  for(let i=0;i<args.length;i++){if(args[i]==='--out')output=args[++i];else if(keys[args[i]])options[keys[args[i]]]=args[++i];else throw Error('Unknown option '+args[i]);}
  if(!options.sourcePath)throw Error('Use --source STRICT_ARM_RESPONSE --ort-dir EXISTING_ORT_DIST');
  const report=await verifyCommonCoverRom(options),text=JSON.stringify(report,null,2)+'\n';if(output)await writeFile(resolve(output),text);console.log(text);if(!report.passed)process.exitCode=1;
}
