// Parameterized existing preparation for original41/272/469. This new entry
// retains the frozen positive-appeal and tension handling without modifying it.
import {Graph} from '../graph-builder.mjs';
import {buildNushiPreparation} from './build-nushi-preparation.mjs';
import {decodeBossActionRule} from '../boss-action-rules.mjs';
import {ACTOR_FIELDS} from '../rules.mjs';
import {tensorContract,tensionState,packTension} from './build-tension-actions.mjs';
import {TENSION_FIELDS} from './build-tension-primitives.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
import {writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const ids=[41,272,469],k=(await buildNushiPreparation({name:'rom-status-preparation-kernel2',actionIds:ids,actionRules:ids.map(decodeBossActionRule),appealObjectFlags(g,flags){const f=[...g.split(flags,8)],t=tensionState(g);f[3]=t[0].high;f[7]=t[1].high;return g.cat(f);}})).json();
const g=new Graph('rom-status-preparation2',{
  ...k.contract,inputDomains:{...k.contract.inputDomains,sourceIndex:{values:[1]},actionId:{values:ids},targetCount:{min:0,max:1,integer:true}},fieldDomains:{...k.contract.fieldDomains,tension:tensorContract.fieldDomains},defaults:{...k.contract.defaults,tension:Array(6).fill(0),sourceIndex:1,actionId:41,targetCount:1},feedback:{...k.contract.feedback,tension:'nextTension'},tensionFields:TENSION_FIELDS,
  scope:'Original41/272/469 planned enemy command, initially no source paralysis/sleep/confusion/skip or appealMode. Existing exact appeal, primary recovery, cleanup and MP-cost replacement run before the caller. Target state may contain the represented primary/skip/tension flags. Planned targetCount is preserved and is not replaced by actual-oracle target lists. Event503/504 replacements must execute the existing event core. Only one enemy and one party are represented.',
  scopeJa:'スカラ・やけつくいき・マホトラを既存の行動準備へ接続し、対象数とMP不足・魅了による行動置換を保持します。数値処理と乱数は既存グラフの規則を使います。',
  sourceScope:'New record-parameterized entry only; original successful allocation, no force/reflection/counter/extra actors. The healthy source restriction matches the three new caller contracts.'
}),x=Object.fromEntries(k.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)])),a=g.split(x.actors,66),p=g.split(x.preparationState,10),valid=g.and(g.eq(x.sourceIndex,1),g.or(...ids.map(id=>g.eq(x.actionId,id))),g.eq(p[5],0),...['sleep','paralysis','confusion','skip'].map(name=>g.eq(a[33+ACTOR_FIELDS.indexOf(name)],0))),out=g.inline(k,{...x,enabled:g.and(x.enabled,valid)},'prepare'),t=g.split(x.tension,6),state=[0,1].map(i=>({stage:t[i*3],low:t[i*3+1],high:t[i*3+2]})),apply=g.and(out.active,g.not(out.recovered),out.appealSuccess,g.eq(out.appealType,1));
for(let i=0;i<2;i++){const selected=g.and(apply,g.eq(x.sourceIndex,i));state[i].stage=g.where(selected,0,state[i].stage);state[i].low=g.where(selected,0,state[i].low);}
out.nextTension=packTension(g,state);out.supported=g.and(valid,out.supported);for(const[n,v]of Object.entries(out))g.output(v,n);
const bytes=g.model();auditModelBytes(bytes,{name:g.name});const report={schema:'dq9-status-preparation-v1',name:g.name,sha256:createHash('sha256').update(bytes).digest('hex'),actionIds:ids,nodes:g.nodes.length,bytes:bytes.length,scope:g.contract.scope};
for(const[f,v]of[[g.name+'.onnx',bytes],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n'],['status-preparation-model.json',JSON.stringify(report,null,2)+'\n']]){await writeFile(new URL(f+'.tmp',import.meta.url),v);await rename(new URL(f+'.tmp',import.meta.url),new URL(f,import.meta.url));}console.log(JSON.stringify(report,null,2));
