// Original selector47: resolved enemy auxiliary low7 level. A reusable
// numeric kernel; RNG and caller fallback computation are outside this entry.
import {Graph} from '../graph-builder.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
import {writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const g=new Graph('rom-drain-selector47',{inputDomains:{resolvedLevel:{min:0,max:127,integer:true}},defaults:{resolvedLevel:18},sourceScope:'Enemy direct selector47 at JPN021d9f90. Input is the original object auxiliary resolved-level low7 field, not AI current-definition level. No party branch, fallback computation, resistance, MP transfer or full caller is asserted.',scopeJa:'ROMの敵レベル0〜127からマホトラの基礎量を求める小さな演算グラフです。乱数と行動全体の処理は別の共通核で行います。',authority:[{artifact:'evidence-v2/ghidra/rank-paralysis-drain-defined/response.json',address:'0x021d9f90'},{artifact:'evidence-v2/ghidra/emulation-drain-selector47-run/response.json',cases:128}]});
g.output(g.add(g.floor(g.mul(g.input('resolvedLevel'),.25)),5),'amount');
const bytes=g.model();auditModelBytes(bytes,{name:g.name});const report={schema:'dq9-drain-selector47-model-v1',name:g.name,sha256:createHash('sha256').update(bytes).digest('hex'),nodes:g.nodes.length,bytes:bytes.length,contract:g.contract};
for(const[f,v]of[[g.name+'.onnx',bytes],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n'],['drain-selector-model.json',JSON.stringify(report,null,2)+'\n']]){await writeFile(new URL(f+'.tmp',import.meta.url),v);await rename(new URL(f+'.tmp',import.meta.url),new URL(f,import.meta.url));}
console.log(JSON.stringify(report,null,2));
