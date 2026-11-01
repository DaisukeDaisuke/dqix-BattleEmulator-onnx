import {writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {join} from 'node:path';

const hash=value=>createHash('sha256').update(value).digest('hex');
const MAGIC=Buffer.from('DQ9ONNX1','ascii');

// This changes transfer granularity only. Every enclosed ONNX model remains
// byte-identical to the checked common module; no new dispatch graph or boss
// program is introduced. A loader can download each semantic group once.
export async function buildModelBundles({out,models,commonProgram,primitiveNames=[]}){
  const numerical=new Set([...Object.values(commonProgram.operations),...primitiveNames]);
  const groups=new Map([['battle',[]],['presentation',[]],['cpu-double',[]]]);
  for(const model of models){
    const group=model.executionProvider==='wasm-explicit-cpu'?'cpu-double':numerical.has(model.name)?'battle':'presentation';
    groups.get(group).push(model);
  }
  await mkdir(join(out,'models'),{recursive:true});
  const bundles=[],entries=[];
  for(const [id,list]of groups){
    if(!list.length)continue;
    const chunks=[],records=[];let offset=0;
    for(const model of list){
      const onnx=Buffer.from(model.onnx),ir=Buffer.from(JSON.stringify(model.ir)+'\n','utf8');
      if(model.ir.name!==model.name||hash(onnx)!==model.sha256)throw Error('Bundle model binding differs: '+model.name);
      const record={name:model.name,sha256:model.sha256,offset,length:onnx.length,irOffset:offset+onnx.length,irLength:ir.length,irSha256:hash(ir),executionProvider:model.executionProvider??null,public:model.public===true};
      records.push(record);chunks.push(onnx,ir);offset+=onnx.length+ir.length;
    }
    const header=Buffer.from(JSON.stringify({schema:'dq9-onnx-bundle-v1',id,models:records}),'utf8');
    const prefix=Buffer.alloc(12);MAGIC.copy(prefix);prefix.writeUInt32LE(header.length,8);
    const raw=Buffer.concat([prefix,header,...chunks]),compressed=gzipSync(raw,{level:9});
    const path='models/'+id+'.onnxbundle.gz';await writeFile(join(out,path),compressed);
    bundles.push({id,path,sha256:hash(compressed),sizeBytes:compressed.length,expandedBytes:raw.length,models:records.map(record=>record.name)});
    for(const record of records)entries.push({name:record.name,sha256:record.sha256,irSha256:record.irSha256,public:record.public,executionProvider:record.executionProvider,bundle:path});
  }
  return{bundles,models:entries.sort((a,b)=>a.name.localeCompare(b.name)),modelRequests:bundles.length};
}
