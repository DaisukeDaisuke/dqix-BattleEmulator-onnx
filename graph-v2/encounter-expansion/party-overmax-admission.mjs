// A new artifact identity may admit the original319 HP305/max300 literal.
// The numerical ONNX graph is copied byte-for-byte. Only its graph name and
// human/machine-readable input contract change; no input is clamped.
import {Graph} from '../graph-builder.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
function fields(bytes){
  const b=Buffer.from(bytes),out=[];let at=0;
  const varint=()=>{let n=0n,shift=0n;for(let k=0;k<10;k++){if(at>=b.length)throw Error('Truncated protobuf');const v=b[at++];n|=BigInt(v&127)<<shift;if(!(v&128))return n;shift+=7n;}throw Error('Invalid protobuf varint');};
  while(at<b.length){const start=at,key=Number(varint()),field=key>>>3,wire=key&7;let data;
    if(wire===0){const p=at;varint();data=b.subarray(p,at);}
    else if(wire===2){const length=Number(varint());if(!Number.isSafeInteger(length)||length<0||at+length>b.length)throw Error('Invalid protobuf length');data=b.subarray(at,at+length);at+=length;}
    else if(wire===1||wire===5){const length=wire===1?8:4;if(at+length>b.length)throw Error('Truncated fixed protobuf');data=b.subarray(at,at+length);at+=length;}
    else throw Error('Unsupported protobuf wire '+wire);
    out.push({field,wire,data,record:b.subarray(start,at)});
  }
  return out;
}
function numericalGraph(bytes){
  const graph=fields(bytes).filter(f=>f.field===7);if(graph.length!==1||graph[0].wire!==2)throw Error('Expected one ONNX graph');
  const parts=fields(graph[0].data);if(parts.some(f=>![1,2,5,11,12].includes(f.field)))throw Error('Unexpected GraphProto field in exact admission copy');
  return Buffer.concat(parts.filter(f=>f.field!==2).map(f=>f.record));
}
export function partyOvermaxRelation(rule){return rule?.op==='<='&&rule.left?.input==='actors'&&rule.right?.input==='actors'&&rule.left.index===0&&rule.right.index===1;}
export async function copyPartyOvermaxModel({ir,onnx,module,directory}){
  const removed=(ir.contract.relations??[]).filter(partyOvermaxRelation);
  if(!removed.length)return{ir,module,proof:null};
  if(!ir.inputs.some(d=>d.name==='actors'&&d.dtype==='float32'&&d.shape[1]===66))throw Error('Unexpected actor relation layout');
  const f=ir.contract.fieldDomains?.actors;if(!f||f[0].min!==0||f[0].max!==32767||f[1].min!==1||f[1].max!==32767)throw Error('Individual HP domains must remain the established finite bounds');
  const name='rom-erugi1-hp-'+ir.name.replace(/^rom-/,''),contract=structuredClone(ir.contract);
  contract.relations=contract.relations.filter(r=>!partyOvermaxRelation(r));
  contract.partyOvermaxAdmission={originalModel:ir.name,originalOnnxSha256:hash(onnx),removedRelations:removed,unchangedIndividualBounds:{hp:[0,32767],maxHp:[1,32767]},scope:'New319 admission identity only. Current party HP may exceed maxHP; original HP305/max300 is retained verbatim. Enemy HP/max and both MP/max relations stay in force. This artifact alone is not proof of whole combat or of arbitrary save-file initialization.'};
  const g=new Graph(name,contract);for(const key of['inputs','outputs','nodes','initializers','values'])g[key]=structuredClone(ir[key]);
  const bytes=g.model();auditModelBytes(bytes,{name});
  const semanticHeader=b=>{const f=fields(b);if(f.some(v=>v.field===25))throw Error('Local ONNX functions are outside this exact-copy adapter');return Buffer.concat(f.filter(v=>v.field===1||v.field===8).map(v=>v.record));};
  if(!semanticHeader(onnx).equals(semanticHeader(bytes)))throw Error('Admission copy changed ONNX IR version or opset imports: '+ir.name);
  const originalNumeric=numericalGraph(onnx),newNumeric=numericalGraph(bytes);
  if(!originalNumeric.equals(newNumeric))throw Error('Admission copy changed ONNX nodes, weights or public tensor descriptors: '+ir.name);
  const result=g.json(),proof={original:ir.name,variant:name,originalOnnxSha256:hash(onnx),variantOnnxSha256:hash(bytes),numericalGraphSha256:hash(originalNumeric),numericalGraphBytes:originalNumeric.length,numericalGraphByteIdentical:true,removedRelations:removed,unchangedIndividualBounds:true,otherRelationsUnchanged:true};
  for(const[file,data]of[[name+'.onnx',bytes],[name+'.json',JSON.stringify(result,null,2)+'\n']]){await writeFile(new URL(file+'.tmp',directory),data);await rename(new URL(file+'.tmp',directory),new URL(file,directory));}
  return{ir:result,module:{...module,name,onnx:name+'.onnx',ir:name+'.json',sha256:hash(bytes),bytes:bytes.length,nodes:result.nodes.length},proof};
}
