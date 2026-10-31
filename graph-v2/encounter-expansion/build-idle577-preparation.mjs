// A newly named preparation entry uses the existing parameterized rules.
// The numerical preparation and appeal machinery is not reimplemented.
import {Graph} from '../graph-builder.mjs';
import {buildNushiPreparation} from './build-nushi-preparation.mjs';
import {decodeBossActionRule} from '../boss-action-rules.mjs';
import {ACTOR_FIELDS} from '../rules.mjs';
import {tensorContract,tensionState,packTension} from './build-tension-actions.mjs';
import {TENSION_FIELDS} from './build-tension-primitives.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
import {writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
const k=(await buildNushiPreparation({name:'rom-idle577-preparation-kernel2',actionIds:[577],actionRules:[decodeBossActionRule(577)],appealObjectFlags(g,flags){const f=[...g.split(flags,8)],t=tensionState(g);f[3]=t[0].high;f[7]=t[1].high;return g.cat(f);}})).json();
const g=new Graph('rom-idle577-preparation2',{
  ...k.contract,inputDomains:{...k.contract.inputDomains,sourceIndex:{values:[1]},actionId:{values:[577]}},fieldDomains:{...k.contract.fieldDomains,tension:tensorContract.fieldDomains},defaults:{...k.contract.defaults,tension:Array(6).fill(0),sourceIndex:1,actionId:577,targetCount:1},feedback:{...k.contract.feedback,tension:'nextTension'},tensionFields:TENSION_FIELDS,
  scope:'Original577 planned enemy self command, initially no source paralysis/sleep/confusion/skip or appealMode. Existing exact appeal then primary recovery/cleanup runs even for a healthy actor. Original rule MPcost0 is read from the577 record. Successful appeal may replace the command with503; that event must use the immutable event core, not skip RNG. Six tension fields follow the established type1 setter/high admission rules.',
  scopeJa:'敵の「不敵に笑っている」を、魅了・主状態回復・行動前整理へ接続します。健康な状態でも必要な乱数を実行します。',constraints:'Healthy existing enemy192 and one living party0; successful allocator, no force/reflection/counter/extra actors. Unrepresented initial source primary or appealMode returns unsupported before RNG.'
}),x=Object.fromEntries(k.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)])),a=g.split(x.actors,66),p=g.split(x.preparationState,10),valid=g.and(g.eq(x.sourceIndex,1),g.eq(x.actionId,577),g.eq(p[5],0),...['sleep','paralysis','confusion','skip'].map(name=>g.eq(a[33+ACTOR_FIELDS.indexOf(name)],0))),out=g.inline(k,{...x,enabled:g.and(x.enabled,valid)},'prepare'),t=g.split(x.tension,6),state=[0,1].map(i=>({stage:t[i*3],low:t[i*3+1],high:t[i*3+2]})),apply=g.and(out.active,g.not(out.recovered),out.appealSuccess,g.eq(out.appealType,1));
for(let i=0;i<2;i++){const selected=g.and(apply,g.eq(x.sourceIndex,i));state[i].stage=g.where(selected,0,state[i].stage);state[i].low=g.where(selected,0,state[i].low);}
out.nextTension=packTension(g,state);out.supported=g.and(valid,out.supported);for(const[n,v]of Object.entries(out))g.output(v,n);
const bytes=g.model();auditModelBytes(bytes,{name:g.name});const report={schema:'dq9-idle577-preparation-v1',name:g.name,sha256:hash(bytes),nodes:g.nodes.length,bytes:bytes.length,scope:g.contract.scope};
for(const[f,v]of[[g.name+'.onnx',bytes],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n'],['idle577-preparation-model.json',JSON.stringify(report,null,2)+'\n']]){await writeFile(new URL(f+'.tmp',dir),v);await rename(new URL(f+'.tmp',dir),new URL(f,dir));}
console.log(JSON.stringify(report,null,2));
