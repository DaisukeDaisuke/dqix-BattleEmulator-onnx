import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildCameraMemberPrepare,buildCameraMemberCommit} from './build-camera-member-goal.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
for(const build of [buildCameraMemberPrepare,buildCameraMemberCommit]){
  const original=await build(),saved=await readFile(new URL(`${original.name}.onnx`,import.meta.url));if(hash(original.model())!==hash(saved))throw Error(`Default depth0 graph changed: ${original.name}`);
  const graph=await build({wide:true}),bytes=graph.model();for(const [extension,data]of [['onnx',bytes],['json',JSON.stringify(graph.json(),null,2)+'\n']]){const name=`${graph.name}.${extension}`,tmp=new URL(`${name}.pending-${process.pid}`,import.meta.url);await writeFile(tmp,data);await rename(tmp,new URL(name,import.meta.url));}console.log(JSON.stringify({model:graph.name,nodes:graph.nodes.length,bytes:bytes.length,sha256:hash(bytes),unchangedDepth0Sha256:hash(saved)}));
}
