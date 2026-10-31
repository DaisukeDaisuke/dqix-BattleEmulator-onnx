import {writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildAiDefinitionStep} from './build-ai-definition.mjs';
const dir=new URL('./',import.meta.url),g=await buildAiDefinitionStep({baseName:'rom-ai-dispel-step',name:'rom-ai-definition-dispel-step'}),bytes=g.model(),sha256=createHash('sha256').update(bytes).digest('hex');
for(const[ext,value]of[['onnx',bytes],['json',JSON.stringify(g.json(),null,2)+'\n']]){const name=`${g.name}.${ext}`,tmp=new URL(`${name}.pending-${process.pid}`,dir);await writeFile(tmp,value);await rename(tmp,new URL(name,dir));}
const report={name:g.name,sha256,nodes:g.nodes.length,bytes:bytes.length};await writeFile(new URL('ai-definition-dispel-model.json',dir),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
