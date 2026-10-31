// A separate original577 caller reuses the already verified operation0 kernel.
// Its record equivalence is checked, not guessed from a no-damage outcome.
import {Graph} from '../graph-builder.mjs';
import {ACTOR_FIELDS} from '../rules.mjs';
import {decodeBossActionRule} from '../boss-action-rules.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
export async function buildIdle577(){
  const event=JSON.parse(await readFile(new URL('rom-tension-event-core2.json',dir),'utf8')),body=JSON.parse(await readFile(new URL('rom-weapon-tension-action-core2.json',dir),'utf8')),a=decodeBossActionRule(503),b=decodeBossActionRule(577),numericKeys=Object.keys(a).filter(k=>!['id','name','raw'].includes(k));
  for(const k of numericKeys)if(a[k]!==b[k])throw Error('Operation0 record mismatch '+k);
  const raw503=rom.actions.find(a=>a.id===503).raw,raw577=rom.actions.find(a=>a.id===577).raw;
  // Core rule words0x08..0x1f are identical; ID, message and presentation
  // fields are deliberately not claimed equivalent raw memory.
  if(raw503.slice(16,64)!==raw577.slice(16,64))throw Error('Operation0 core words differ');
  const g=new Graph('rom-idle577-action-core2',{
    ...body.contract,inputDomains:{...body.contract.inputDomains,actionId:{values:[577]}},
    defaults:{...body.contract.defaults,sourceIndex:1,actionId:577},actionRules:[b],
    scope:'Original577 healthy enemy self-target caller only. Identical operation0 numerical rule words to503 reuse the immutable event kernel: target-repeat2, shared, zero-weight critical, accuracy, physical self0/1/2 draws, optional bounded2 for zero internal damage, and weapon draw only for positive internal damage. No HP/MP effect; no fixed draw-count shortcut. Source paralysis/sleep/confusion/skip and appealMode are excluded; party and enemy remain alive. Tension and all represented fields persist. Raw message/event memory and arbitrary operation0 actions are outside.',
    scopeJa:'敵が自分を対象に「不敵に笑っている」を実行します。ダメージ0でも実際の物理計算分岐と乱数消費を共通核で処理します。',
    sourceScope:'Both stable objects exist, successful event allocation, original577 target collection resolves exactly enemy192. The caller has no additional weapon effect, force, reflection, counter or mental-immunity fields. Unrepresented source primary/appeal modes return supported0 before RNG.',
    recordEquivalence:{actualId:577,reusedKernelId:503,numericKeys,coreWordOffset:[8,31],raw503,raw577,excluded:'Action ID, display-message identifiers and raw event/presentation buffers. Only the declared numerical/state projection is reused.'},
    authority:[{source:'evidence-v2/ghidra/emulation-idle577-probe-run/response.json',scope:'Actual original577 through-return caller and prepared sequence probes.'},{jpnHandler:'0x021daf30',matching:'func_ov024_021da670',operation:0}],
    feedback:body.contract.feedback
  }),x=Object.fromEntries(body.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)])),actors=g.split(x.actors,66),prep=g.split(x.preparationState,10),source=k=>actors[33+ACTOR_FIELDS.indexOf(k)],valid=g.and(g.eq(x.actionId,577),g.eq(x.sourceIndex,1),g.eq(prep[5],0),...['sleep','paralysis','confusion','skip'].map(k=>g.eq(source(k),0))),r=g.inline(event,{...x,actionId:g.add(g.mul(x.actionId,0),503),enabled:g.and(x.enabled,valid)},'idle-event'),zero=g.mul(source('hp'),0),active=g.gt(r.active,0);
  const out={...r,nextStatus:x.status,nextWakeSkip:x.wakeSkip,supported:g.cast(valid,'float32'),accuracyPassed:g.cast(active,'float32'),effectApplied:zero,poisoned:zero,angerActivated:zero,tensionConsumed:zero};
  for(const d of body.outputs){if(!out[d.name])throw Error('Missing shared action output '+d.name);g.output(out[d.name],d.name);}return g;
}
export async function writeIdle577(){const g=await buildIdle577(),bytes=g.model();auditModelBytes(bytes,{name:g.name});const report={schema:'dq9-idle577-action-v1',name:g.name,sha256:hash(bytes),nodes:g.nodes.length,bytes:bytes.length,actionIds:[577],sharedEventSha256:hash(await readFile(new URL('rom-tension-event-core2.onnx',dir))),recordEquivalence:g.contract.recordEquivalence,scope:g.contract.scope};for(const[f,v]of[[g.name+'.onnx',bytes],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n'],['idle577-action-model.json',JSON.stringify(report,null,2)+'\n']]){await writeFile(new URL(f+'.tmp',dir),v);await rename(new URL(f+'.tmp',dir),new URL(f,dir));}return report;}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await writeIdle577(),null,2));
