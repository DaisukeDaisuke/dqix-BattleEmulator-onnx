#!/usr/bin/env node
// Cross-provider regression for the original critical-probability rounding
// site. This checks the optional scalar compiler, not independent ROM truth.
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Graph} from '../graph-v2/graph-builder.mjs';
import {commonCriticalThreshold} from '../graph-v2/common-critical-rules.mjs';
import {NativeGraphWasmSession} from '../poc-v2/native-graph-wasm-prototype.mjs';
import {compileNativeResidentGraphWasm} from '../poc-v2/native-resident-compiler-prototype.mjs';
import {readNativeOnnx} from '../poc-v2/native-onnx-boundary.mjs';
import {inferPureOnnxMetadata} from '../poc-v2/onnx-pure-value-metadata.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';

const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const ort=await loadLocalOrt(option('--ort-dir')??process.env.ORT_RUNTIME_DIR);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={schema:'dq9-native-f32-div-parity-v1',runtime:ort.env.versions.web,cases:[],fieldsCompared:0,mismatches:0,examples:[],scope:'Actual ORT WASM versus two scalar WebAssembly compilers; no independent ROM or hardware GPU-speed claim.'};

async function residentOutput(bytes,feeds){
  const graph=readNativeOnnx(bytes),inputWords=graph.inputs.reduce((n,v)=>n+v.shape[1],0),outputWords=graph.outputs.reduce((n,v)=>n+v.shape[1],0);
  const faultOffset=inputWords+outputWords,stateWords=faultOffset+2,compiled=compileNativeResidentGraphWasm(graph,{constantBase:0,stateWords,faultOffset,contract:{}});
  const n=Object.values(feeds)[0].dims[0],bindingBase=Math.ceil(compiled.constantEnd/64)*64,stateBase=Math.ceil((bindingBase+(graph.inputs.length+graph.outputs.length)*4)/64)*64;
  const memory=new WebAssembly.Memory({initial:Math.max(1,Math.ceil((stateBase+n*stateWords*4)/65536))});
  const instance=await WebAssembly.instantiate(await WebAssembly.compile(compiled.binary),{env:{memory}}),words=new Uint32Array(memory.buffer);
  let offset=0;
  for(const [i,v]of graph.inputs.entries()){
    words[bindingBase/4+i]=offset;const f=feeds[v.name],bits=new Uint32Array(f.data.buffer,f.data.byteOffset,f.data.length);
    for(let lane=0;lane<n;lane++)for(let j=0;j<v.shape[1];j++)words[stateBase/4+lane*stateWords+offset+j]=bits[lane*v.shape[1]+j];
    offset+=v.shape[1];
  }
  for(const [i,v]of graph.outputs.entries()){words[bindingBase/4+graph.inputs.length+i]=offset;offset+=v.shape[1];}
  instance.exports.run(stateBase,bindingBase,n,0);
  const result={};offset=inputWords;
  for(const v of graph.outputs){const data=new Float32Array(n*v.shape[1]),bits=new Uint32Array(data.buffer);for(let lane=0;lane<n;lane++)for(let j=0;j<v.shape[1];j++)bits[lane*v.shape[1]+j]=words[stateBase/4+lane*stateWords+offset+j];result[v.name]={data};offset+=v.shape[1];}
  const faults=[];
  for(let lane=0;lane<n;lane++)if(words[stateBase/4+lane*stateWords+faultOffset])faults.push(lane);
  Object.defineProperty(result,'domainFaultRows',{value:faults});
  return result;
}

async function compare(graph,feeds){
  const bytes=graph.model(),direct=await NativeGraphWasmSession.create({onnx:bytes}),session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm'],graphOptimizationLevel:'disabled'});
  const tensors=Object.fromEntries(Object.entries(feeds).map(([name,f])=>[name,new ort.Tensor(f.type,f.data,f.dims)]));
  let expected;
  try{
    expected=await session.run(tensors);
    const before=report.mismatches,fieldsBefore=report.fieldsCompared;
    const resident=await residentOutput(bytes,feeds),rowCount=Object.values(feeds)[0].dims[0],expectedFaultRows=[];
    for(let lane=0;lane<rowCount;lane++)if(Object.values(feeds).some(f=>{
      const bits=new Uint32Array(f.data.buffer,f.data.byteOffset,f.data.length);
      return Array.from(bits.subarray(lane*f.dims[1],(lane+1)*f.dims[1])).some(value=>(value&0x7fffffff)!==0&&(value&0x7f800000)===0);
    }))expectedFaultRows.push(lane);
    if(JSON.stringify(resident.domainFaultRows)!==JSON.stringify(expectedFaultRows))throw Error('Existing resident subnormal-input guard changed');
    const excluded=new Set(expectedFaultRows);
    for(const [provider,output]of [['native-scalar',direct.run(feeds)],['native-resident',resident]])for(const [name,want]of Object.entries(expected)){
      const got=output[name].data,wantBits=new Uint32Array(want.data.buffer,want.data.byteOffset,want.data.length),gotBits=new Uint32Array(got.buffer,got.byteOffset,got.length);
      if(got.length!==want.data.length)throw Error('Output width mismatch');
      for(let i=0;i<got.length;i++){
        if(provider==='native-resident'&&excluded.has(Math.floor(i/(got.length/rowCount))))continue;
        report.fieldsCompared++;
        // NaN payload choice is not an observable battle-state guarantee.
        if(wantBits[i]===gotBits[i]||Number.isNaN(want.data[i])&&Number.isNaN(got[i]))continue;
        report.mismatches++;if(report.examples.length<12)report.examples.push({graph:graph.name,provider,name,index:i,wantBits:wantBits[i],gotBits:gotBits[i]});
      }
    }
    report.cases.push({name:graph.name,onnxSHA256:hash(bytes),rows:rowCount,residentSubnormalInputGuardsVerified:expectedFaultRows.length,fields:report.fieldsCompared-fieldsBefore,mismatches:report.mismatches-before});
  }finally{for(const t of Object.values(expected??{}))t.dispose?.();for(const t of Object.values(tensors))t.dispose?.();await direct.release();await session.release();}
}

const div=new Graph('native-f32-div-regression'),a=div.input('a',['N',3]),b=div.input('b');div.output(div.op('Div',[a,b]),'quotient');
const fromBits=value=>new Float32Array(Uint32Array.of(value).buffer)[0];
const numerators=[0,-0,1,-1,fromBits(1),fromBits(0x80000001),fromBits(0x007fffff),fromBits(0x00800000),fromBits(0x3f7fffff),fromBits(0x3f800001),fromBits(0x7f7fffff),fromBits(0xff7fffff)];
const denominators=[0,-0,1,-1,2,3,7,8,31,32,100,1023,fromBits(1),fromBits(0x00800000),fromBits(0x7f7fffff)];
const av=[],bv=[];
for(const x of numerators)for(const y of denominators){av.push(x,Math.fround(x/2),-x);bv.push(y);}
await compare(div,{a:{type:'float32',dims:[bv.length,3],data:Float32Array.from(av)},b:{type:'float32',dims:[bv.length,1],data:Float32Array.from(bv)}});

const critical=new Graph('native-critical-hit-divisor-regression');
const keys=['baseThreshold','baseRate','weight','hitCount'],inputs=Object.fromEntries(keys.map(key=>[key,critical.input(key)]));
critical.output(commonCriticalThreshold(critical,inputs),'threshold');
const rows=[];
for(const rate of [-1,0,.1,.3,1,3.7,10,33.333332,50,99.99999,100,102.3])for(const weight of [0,1,17,50,100,125,200,255])for(let count=0;count<=32;count++)rows.push([370,rate,weight,count]);
await compare(critical,Object.fromEntries(keys.map((key,i)=>[key,{type:'float32',dims:[rows.length,1],data:Float32Array.from(rows,row=>row[i])}])));
const invalid=new Graph('unsupported-native-integer-div'),ia=invalid.input('a',['N',1],'int32'),ib=invalid.input('b',['N',1],'int32');invalid.output(invalid.op('Div',[ia,ib]),'result');
let rejected=false;try{inferPureOnnxMetadata(readNativeOnnx(invalid.model()));}catch(error){rejected=/Pure Div requires two float32 operands/.test(error.message);}
report.integerDivisionRejected=rejected;report.passed=report.mismatches===0&&rejected;
if(option('--report'))await writeFile(option('--report'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
