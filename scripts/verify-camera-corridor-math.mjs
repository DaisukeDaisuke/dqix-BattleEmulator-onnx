#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createGraphExecutor} from '../web/graph-executor.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
import cameraConstants from '../data/camera-constants.mjs';
const args=process.argv.slice(2),option=k=>{const i=args.indexOf(k);return i<0?undefined:args[i+1];},root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),modelDir=option('--model-dir')??resolve(root,'graph-v2');
const name='rom-camera-corridor-distance81',onnx=await readFile(resolve(modelDir,name+'.onnx')),ir=JSON.parse(await readFile(resolve(modelDir,name+'.json'))),ort=await loadLocalOrt(option('--ort-dir')),executor=createGraphExecutor({models:new Map([[name,{name,onnx,ir}]]),ortRuntime:ort});
function sqrt(n){if(n<2n)return n;let x=1n<<BigInt((n.toString(2).length+1)>>1);for(;;){const next=(x+n/x)>>1n;if(next>=x)return x;x=next;}}
const distance=(a,b)=>(sqrt(4n*a.reduce((n,x,i)=>n+(x-b[i])**2n,0n))+1n)>>1n,scale=(a,s)=>a.map(x=>BigInt.asIntN(32,(x*s+2048n)>>12n)),subtract=(a,b)=>a.map((x,i)=>x-b[i]),add=(a,b)=>a.map((x,i)=>BigInt.asIntN(32,x+b[i])),reciprocal=d=>d===0n?0n:(16777216n+d/2n)/d;
function original(a,b,c){const ab=distance(a,b),ac=distance(a,c);if(ab===0n)return Number(ac);if(ac===0n)return 0;const u=scale(subtract(b,a),reciprocal(ab)),v=scale(subtract(c,a),reciprocal(ac)),dot=(u.reduce((n,x,i)=>n+x*v[i],0n)+2048n)>>12n;if(dot<=0n)return Number(ac);const projection=(ac*dot+2048n)>>12n;if(ab<projection)return Number(distance(c,b));return Number(distance(c,add(a,scale(u,projection))));}
const rows=option('--source')?JSON.parse(await readFile(option('--source'))).cases.map(c=>({sourcePosition:c.roster[0].position,targetPosition:c.roster[4].position})):[{sourcePosition:[0,0,0],targetPosition:[0,0,0]},{sourcePosition:[0,6144,0],targetPosition:[0,6144,0]},{sourcePosition:[-42566,0,-36864],targetPosition:[42566,0,36864]}];
let state=123456789;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};for(let i=0;i<96;i++)rows.push({sourcePosition:Array.from({length:3},()=>random()%8388607-4194303),targetPosition:Array.from({length:3},()=>random()%8388607-4194303)});
let count=0;try{const output=await executor.runGraph(name,rows);for(let lane=0;lane<rows.length;lane++)for(let node=0;node<81;node++){const[x,z]=cameraConstants.coordinates.coords[node],want=original(rows[lane].sourcePosition.map(BigInt),rows[lane].targetPosition.map(BigInt),[BigInt(x),0n,BigInt(z)]);assert.equal(output[lane].distances[node],want,`distance lane${lane} node${node}`);assert.equal(!!output[lane].selectedMask[node],node%18!==17&&want<6144,`threshold lane${lane} node${node}`);count+=2;}}finally{await executor.release();}
const proof={schema:'dq9-camera-corridor-independent-integer-proof-v1',passed:true,cases:rows.length,comparisons:count,modelSHA256:createHash('sha256').update(onnx).digest('hex'),inputSHA256:createHash('sha256').update(JSON.stringify(rows)).digest('hex'),inputs:rows,scope:'Actual ONNX versus independent BigInt evaluation of the decompiled fixed-point point-to-segment formula. The separate full-dispatch Ghidra cohort verifies original instruction behavior.'};if(option('--out'))await writeFile(option('--out'),JSON.stringify(proof,null,2)+'\n');const{inputs,...summary}=proof;console.log(JSON.stringify(summary));
