// The old tail's currentHP<=maxHP contract made its zero-amount Min harmless.
// Under explicit original319 HP305/max300, the actual amount>0 call gate must
// be represented. All other frozen tail nodes and weights remain unchanged.
import {Graph} from '../graph-builder.mjs';
import {copyPartyOvermaxModel} from './party-overmax-admission.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex');
export async function buildErugi1Tail(){
  const name='rom-boss-turn-tail2',onnx=await readFile(new URL('../'+name+'.onnx',dir)),original=JSON.parse(await readFile(new URL('../'+name+'.json',dir)));
  if(hash(onnx)!=='c946c6dca74abc9e9e8b38353df9144940228d8c700d26ed329c6b67f339483e')throw Error('Frozen tail changed');
  const copy=await copyPartyOvermaxModel({ir:original,onnx,module:{name},directory:dir}),ir=copy.ir;
  const expect=[['tail_add_91','Add',['tail_mul_85','tail_where_90']],['tail_add_92','Add',['tail_split_1','tail_add_91']],['tail_min_93','Min',['tail_add_92','tail_split_2']],['tail_where_94','Where',['tail_greater_83','tail_min_93','tail_split_1']]];
  for(const [output,op,inputs]of expect){const n=ir.nodes.find(n=>n.outputs[0]===output);if(!n||n.op!==op||JSON.stringify(n.inputs)!==JSON.stringify(inputs))throw Error('Frozen periodic HP topology changed');}
  if(ir.initializers.find(c=>c.name==='c10')?.values?.[0]!==0)throw Error('Expected zero initializer');
  const contract={...structuredClone(ir.contract),scope:ir.contract.scope+' For the new over-max partyHP admission, periodic HP healing is called only when its computed amount is positive. Zero-amount regeneration leaves currentHP intact, as actual finish_turn does.',scopeJa:'現在HPが最大HPを上回る入力を保持し、回復量が正の場合だけターン末HP回復を適用します。',periodicHpCallGate:{originalModel:name,originalOnnxSha256:hash(onnx),source:'matching finish_turn / restored/dq9-unified/core/turn_end.cpp periodic_changes: amount<=0 skips heal_hp',actualAuthority:'evidence-v2/ghidra/emulation-boss319-full-turn-run/response.json case boss319-turn-8 keeps HP305/max300 through finish_turn',change:'Only the party periodic-HP Where predicate becomes alive && hpAmount>0; no extra random draw, no maximum-vital mutation.'}};
  const g=new Graph('rom-erugi1-turn-tail2',contract);for(const k of['inputs','outputs','nodes','initializers','values'])g[k]=structuredClone(ir[k]);
  const index=g.nodes.findIndex(n=>n.outputs[0]==='tail_where_94'),amount='erugi1_live_hp_amount',positive='erugi1_positive_hp_amount';
  g.values[amount]={name:amount,dtype:'float32',shape:['N',1]};g.values[positive]={name:positive,dtype:'bool',shape:['N',1]};
  g.nodes.splice(index,0,{op:'Where',inputs:['tail_greater_83','tail_add_91','c10'],outputs:[amount],attributes:{},roundingSite:false},{op:'Greater',inputs:[amount,'c10'],outputs:[positive],attributes:{},roundingSite:false});
  g.nodes[index+2].inputs[0]=positive;
  const bytes=g.model();auditModelBytes(bytes,{name:g.name});const report={schema:'dq9-overmax-tail-extension-v1',sourceSha256:hash(onnx),model:g.name,sha256:hash(bytes),addedNodes:2,changedExistingNodes:1,originalAdmissionProof:copy.proof,scope:contract.periodicHpCallGate};
  for(const[f,v]of[[g.name+'.onnx',bytes],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n'],['erugi1-tail-build.json',JSON.stringify(report,null,2)+'\n']]){await writeFile(new URL(f+'.tmp',dir),v);await rename(new URL(f+'.tmp',dir),new URL(f,dir));}
  return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildErugi1Tail(),null,2));
