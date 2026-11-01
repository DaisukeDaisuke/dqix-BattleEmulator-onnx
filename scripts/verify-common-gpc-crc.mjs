#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildCommonFilenameCRC} from '../graph-v2/build-common-gpc-archive.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';

const args=process.argv.slice(2),option=k=>{const i=args.indexOf(k);return i<0?undefined:args[i+1];},hash=b=>createHash('sha256').update(b).digest('hex');
if(!option('--source')||!option('--ort-dir')||!option('--out'))throw Error('Use --source original-GPC-process.json --ort-dir DIR --out FILE');
const sourceBytes=await readFile(option('--source')),source=JSON.parse(sourceBytes),row=source.results?.find(x=>x.ok&&x.originalCRCTableHex);
if(!source.executionComplete||!source.programUnmodified||!row?.strictInitializedMemory||source.romSHA256!=='b7a7f82f9da6f5bd08b5ae436d67cbde020f15e79534e0d34853201cd24d775d')throw Error('Unchanged original ROM CRC table evidence is required');
const tableBytes=Buffer.from(row.originalCRCTableHex,'hex');if(tableBytes.length!==1024||hash(tableBytes)!=='12f3e0576d447eb37b36d82ba0c1c5481b8f0d12fdc70347ce4a076b229d4c86')throw Error('Original CRC table differs');
const table=Array.from({length:256},(_,i)=>tableBytes.readUInt32LE(i*4));
function reference(bytes,present){if(!present)return 0;let crc=0xffffffff;for(const byte of bytes){if(!byte)break;crc=(crc>>>8)^table[(crc^byte)&255];}return(~crc)>>>0;}
const inputs=[];for(let byte=0;byte<256;byte++)inputs.push({nameBytes:[byte,...Array(23).fill(0)],pointerPresent:[true],enabled:[true]});
for(let pattern=0;pattern<512;pattern++){const length=pattern%24,bytes=Array.from({length:24},(_,i)=>i<length?1+((pattern*61+i*137+i*i*17)%255):0);inputs.push({nameBytes:bytes,pointerPresent:[true],enabled:[true]});}
for(const c of source.results.flatMap(r=>r.case.outerNames??[]).filter(Boolean))if(!inputs.some(x=>Buffer.from(x.nameBytes).subarray(0,c.length).toString()===c)){inputs.push({nameBytes:[...Buffer.from(c),...Array(24-c.length).fill(0)],pointerPresent:[true],enabled:[true]});}
inputs.push({nameBytes:Array(24).fill(255),pointerPresent:[false],enabled:[true]},{nameBytes:Array(24).fill(1),pointerPresent:[true],enabled:[true]});
const g=buildCommonFilenameCRC(),onnx=g.model(),ir=g.json(),models=new Map([[g.name,{name:g.name,onnx,ir}]]),ort=await loadLocalOrt(option('--ort-dir')),executor=createGraphExecutor({models,ortRuntime:ort});
const report={schema:'dq9-common-gpc-crc-table-verification-v1',sourceSHA256:hash(sourceBytes),originalTableSHA256:hash(tableBytes),modelSHA256:hash(onnx),modelBytes:onnx.length,cases:inputs.length,fieldsCompared:0,mismatches:0,examples:[],scope:'Batched common CRC outputs compared with the unchanged original256-word table and its decompiled unsigned recurrence. This is a table/recurrence check, not a claim that every test name was separately executed by the ARM CPU. Whole original Process evidence independently exercises real CRC calls. Includes all single bytes,512 bounded multi-byte names, null pointer and explicit missing-terminator rejection.'};
function compare(i,key,actual,expected){report.fieldsCompared++;if(actual!==expected){report.mismatches++;if(report.examples.length<20)report.examples.push({i,key,actual,expected});}}
try{for(let start=0;start<inputs.length;start+=64){const batch=inputs.slice(start,start+64),out=await executor.runGraph(g.name,batch);for(let i=0;i<batch.length;i++){const x=batch[i],supported=!x.pointerPresent[0]||x.nameBytes.includes(0);compare(start+i,'supported',!!out[i].supported[0],supported);if(supported){const expected=reference(x.nameBytes,x.pointerPresent[0]);compare(start+i,'crcLow',out[i].crcU16[0],expected%65536);compare(start+i,'crcHigh',out[i].crcU16[1],Math.floor(expected/65536));}}}}finally{await executor.release();}
report.passed=report.mismatches===0;await writeFile(option('--out'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
