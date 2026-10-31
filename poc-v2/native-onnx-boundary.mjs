// The public parser intentionally omits ONNX operator-set metadata. Native
// execution therefore checks original bytes first, before using that parser.
import {readOnnx} from './graph-runtime.mjs';
const validated=new WeakSet(),decode=bytes=>new TextDecoder().decode(bytes??new Uint8Array());
function fields(bytes){
  const a=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);let position=0;
  function integer(){let value=0n,shift=0n;for(let count=0;count<10;count++){if(position>=a.length)throw Error('Truncated native ONNX varint');const byte=a[position++];value|=BigInt(byte&127)<<shift;if(!(byte&128))return value;shift+=7n;}throw Error('Invalid native ONNX varint');}
  const result=[];while(position<a.length){const tag=Number(integer()),wire=tag&7;let value;if(wire===0)value=integer();else if([1,2,5].includes(wire)){const length=wire===1?8:wire===5?4:Number(integer());if(!Number.isSafeInteger(length)||length<0||position+length>a.length)throw Error('Truncated native ONNX field');value=a.subarray(position,position+length);position+=length;}else throw Error('Unsupported native ONNX wire');result.push({id:tag>>>3,value});}return result;
}
const all=(entries,id)=>entries.filter(e=>e.id===id).map(e=>e.value);
function single(entries,id,required=false){const values=all(entries,id);if(values.length>1||required&&!values.length)throw Error('Ambiguous or missing native ONNX field '+id);return values[0];}
export function readNativeOnnx(bytes){
  const model=fields(bytes),opsets=all(model,8).map(x=>{const f=fields(x);return{domain:decode(single(f,1)),version:Number(single(f,2,true))};});
  if(Number(single(model,1,true))!==8||opsets.length!==1||opsets[0].domain!==''||opsets[0].version!==18)throw Error('Native prototype accepts only IR8/default-domain opset18');
  if(all(model,25).length)throw Error('Local ONNX functions are outside the native prototype');
  const graphFields=fields(single(model,7,true));for(const nodeBytes of all(graphFields,1)){const node=fields(nodeBytes);if(decode(single(node,7))!==''||decode(single(node,8))!=='')throw Error('Custom-domain/overloaded native ONNX nodes are unsupported');}
  const graph=readOnnx(bytes);validated.add(graph);return graph;
}
export function assertNativeGraphBoundary(graph){
  if(!validated.has(graph))throw Error('Native graph must be parsed from original ONNX bytes by readNativeOnnx');
  const allowed={Split:['axis','num_outputs'],Concat:['axis'],Cast:['to'],Gather:['axis']};
  for(const node of graph.nodes)for(const key of Object.keys(node.attributes??{}))if(!(allowed[node.op]??[]).includes(key))throw Error('Unsupported native operator attribute '+node.op+'.'+key);
}
export function assertNativeContract(graph,contract){
  let stored;try{stored=JSON.parse(graph.doc);}catch{throw Error('Native resident graph lacks a bound ONNX input contract');}
  if(!stored||typeof stored!=='object'||Array.isArray(stored)||!contract||typeof contract!=='object'||Array.isArray(contract))throw Error('Native resident contract must be an object');
  const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
  if(JSON.stringify(canonical(stored))!==JSON.stringify(canonical(contract)))throw Error('Native resident IR contract differs from the hashed ONNX contract');
}
