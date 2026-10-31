// Byte endpoint support is a new variant of the shared route graph generator.
// Previously delivered models/runtimes are never rewritten by this entry.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildRoutePrepare,buildRouteAccept,buildRouteFinalize} from './build-camera-route-planner.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex'),bridge=[];
for(const build of [buildRoutePrepare,buildRouteAccept,buildRouteFinalize]){
 const old=await build(),prior=await readFile(new URL(`${old.name}.onnx`,import.meta.url)),rebuilt=old.model();
 if(sha(prior)!==sha(rebuilt))throw Error('Default shared builder changed frozen '+old.name);
 bridge.push({name:old.name,sha256:sha(prior),byteIdentical:true});
 const graph=await build({byteNodes:true}),model=graph.model();
 for(const[ext,value]of [['onnx',model],['json',JSON.stringify(graph.json(),null,2)+'\n']]){const p=new URL(`${graph.name}.${ext}`,import.meta.url),t=new URL(`${graph.name}.${ext}.pending-${process.pid}`,import.meta.url);await writeFile(t,value);await rename(t,p);}
 console.log(JSON.stringify({name:graph.name,nodes:graph.nodes.length,bytes:model.length,sha256:sha(model)}));
}
await writeFile(new URL('camera-route-byte-builder-bridge.json',import.meta.url),JSON.stringify({schema:'dq9-shared-route-byte-variant-bridge-v1',originalModelsUnchanged:true,models:bridge},null,2)+'\n');
