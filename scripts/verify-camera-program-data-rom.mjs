#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {COMMON_CAMERA_PROGRAM_DATA} from '../data/common-camera-program-data.mjs';
const args=process.argv.slice(2),option=k=>{const i=args.indexOf(k);return i<0?undefined:args[i+1];},hash=b=>createHash('sha256').update(b).digest('hex');
const data=option('--data')?(await import(pathToFileURL(resolve(option('--data'))))).COMMON_CAMERA_ACTOR_PROGRAM_DATA:COMMON_CAMERA_PROGRAM_DATA;
const sourceBytes=await readFile(option('--source')),source=JSON.parse(sourceBytes),members=data.entries??data.archives.flatMap(a=>a.members.map(m=>({id:a.path+'/'+m.path,...m})));
if(source.programUnmodified!==true||source.executionComplete!==true||source.romSHA256!==data.romSHA256)throw Error('An unmodified complete matching original execution is required');
const report={schema:'dq9-camera-program-data-original-proof-v1',createdAt:new Date().toISOString(),sourceSHA256:hash(sourceBytes),dataSHA256:hash(JSON.stringify(data)),files:0,programs:0,fieldsCompared:0,mismatches:0,examples:[],observedOutputsUsedAsInput:false};
function compare(id,got,want){
 if(Array.isArray(want)){if(!Array.isArray(got)||got.length!==want.length){report.mismatches++;report.examples.push({id,reason:'shape',got:got?.length,want:want.length});return;}want.forEach((v,i)=>compare(id+'['+i+']',got[i],v));}
 else if(want&&typeof want==='object'){for(const[k,v]of Object.entries(want))compare(id+'.'+k,got?.[k],v);}
 else{report.fieldsCompared++;if(got!==want){report.mismatches++;if(report.examples.length<30)report.examples.push({id,got,want});}}
}
for(const member of members){
 const original=source.results.find(r=>r.id===member.id);if(!original?.ok||!original.strictInitializedMemory||original.inputSHA256!==member.sha256)throw Error('Missing independently executed original definition '+member.id);
 const programs=original.programs.map(({totalLinkedNodes,...p})=>p);compare(member.id,member.programs,programs);report.files++;report.programs+=programs.length;
}
compare('sceneFallbackArchive',source.sourceStrings.sceneFallbackArchive,'data/bin/actdef.nsarc');compare('sceneFallbackMember',source.sourceStrings.sceneFallbackMember,'default.bact');
report.passed=report.mismatches===0&&source.results.length===members.length;
if(option('--out')){await mkdir(dirname(resolve(option('--out'))),{recursive:true});await writeFile(option('--out'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
