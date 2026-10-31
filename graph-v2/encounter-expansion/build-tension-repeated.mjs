// Reuse one hit kernel with caller-scoped tension. The already verified
// repeated family remains immutable; only this variant carries six new fields.
import {Graph} from '../graph-builder.mjs';
import {buildRomColumnActionCore} from './build-shared-action.mjs';
import {columnSelectorDamage} from './build-selector-columns.mjs';
import {buildRepeatedFamilyEntry,buildRepeatedFamilyHit,buildRepeatedFamilyFinish,REPEATED_FAMILY_IDS,REPEATED_FAMILY_RULES} from './build-repeated-family.mjs';
import {createTensionDamageHooks,tensorContract,tensionState,packTension} from './build-tension-actions.mjs';
import {TENSION_FIELDS,TENSION_AUTHORITY} from './build-tension-primitives.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
for(const r of REPEATED_FAMILY_RULES)if(!(Buffer.from(r.raw,'hex').readUInt32LE(16)&0x2000))throw Error('Repeated tension flag absent '+r.id);
function contract(){
  const c=structuredClone(buildRepeatedFamilyHit().contract);
  for(const k of ['hitCount','hitIndex','damageTotal']){delete c.inputDomains[k];delete c.defaults[k];delete c.feedback[k];}
  return{...c,fieldDomains:{...c.fieldDomains,tension:tensorContract.fieldDomains},defaults:{...c.defaults,tension:Array(6).fill(0)},feedback:{...c.feedback,tension:'nextTension'},tensionFields:TENSION_FIELDS,tensionAuthority:TENSION_AUTHORITY,
    scope:'Five exact enemy repeated records73/292/539/542/555 with caller-scoped source tension. One initially live party target, one eligible enemy source, enough MP or enemy255. Collection and duplication are unchanged. Every hit reads the same source stage/ordinary/high fields; source tension is cleared once after the complete target loop, including remaining shared-only iterations after target death. Target high tension is explicitly outside this repeated variant; target ordinary tension is retained until death. No enclosing turn, camera, party repeat, redirect/counter/reflection or multiple target identities.',
    scopeJa:'共通5連続攻撃で、同じテンションを全ヒットに適用し、行動全体の終了時だけ解除します。対象死亡後の残り共有乱数も保持します。',
    totalDamageBound:'Enemy critical threshold0, level<=99, u16 base/current attack and resistance<=255. The only uncapped action292 has selector floor(base/2); physical base<=34817, boosted amount<=17409*4.5+40, then resistance<=2.55 and at most4 hits, total<800000. Other actions cap each hit at1999 or999. The declared cumulative domain0..1048576 exceeds this reachable bound; all integer sums remain exactly representable below2^24.',
    stateProjection:'Six explicit fields stage0..4/ordinary flag/high flag per actor; no consistency is inferred. Target death clears its fields per hit. Source fields remain through every hit and clear at caller finish only when either source tension flag was present. Ordinary poison raw flag remains outside the decoded actor ABI, as in the prior repeated caller.',
    extensionStatus:'New separate program; immutable repeated-family and published encounters are not replaced. Actual-ROM full-caller and per-hit comparisons, and zero-tension regression, are separate proof requirements.'};
}
export function buildTensionRepeatedEntry(){
  const old=buildRepeatedFamilyEntry().json(),c=contract(),g=new Graph('rom-tension-repeated-entry2',{...c,feedback:{seed:'nextSeed',position:'nextPosition',actors:'nextActors'},phase:'Unchanged repeated collection/duplication/MP with explicit tension admission before any RNG.'}),x=Object.fromEntries(old.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)])),t=tensionState(g),allowed=g.eq(t[0].high,0),out=g.inline(old,{...x,enabled:g.and(x.enabled,allowed)},'collection');
  out.supported=g.mul(out.supported,g.cast(allowed,'float32'));
  for(const[n,v]of Object.entries(out))g.output(v,n);return g;
}
export function buildTensionRepeatedHit(){
  const c=contract(),kernel=buildRomColumnActionCore({name:'rom-tension-repeated-target-kernel2',actionIds:REPEATED_FAMILY_IDS,actionRules:REPEATED_FAMILY_RULES,contract:c,
    gatherTargets:false,checkMp:false,spendMp:false,advanceContext:false,sharedBeforeTargetCheck:true,
    criticalCheck(g,rng,rule,gate,{source}){return g.and(gate,g.lt(rng.bounded(gate,10000),source.criticalThreshold));},
    comboUpdateGate(g,active){return g.and(active,g.eq(g.input('hitIndex'),0));},
    transformBaseDamage(g,rng,rule,hit,base,{source}){return columnSelectorDamage(g,rng,rule.selector,base,source.baseAttack,source.level,hit).damage;},
    ...createTensionDamageHooks({deferConsumption:true})
  }).json();
  const g=new Graph('rom-tension-repeated-hit2',{...c,phase:'One target iteration, retaining source tension until the enclosing finish graph.',inputDomains:{...c.inputDomains,hitCount:{min:0,max:4,integer:true},hitIndex:{min:0,max:4,integer:true},damageTotal:{min:0,max:1048576,integer:true}},defaults:{...c.defaults,hitCount:3,hitIndex:0,damageTotal:0},feedback:{...c.feedback,hitIndex:'nextHitIndex',damageTotal:'nextDamageTotal'}}),x=Object.fromEntries(kernel.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)])),count=g.input('hitCount'),index=x.hitIndex,total=g.input('damageTotal'),entered=g.and(x.enabled,g.lt(index,count)),out=g.inline(kernel,{...x,enabled:entered},'target');
  Object.assign(out,{nextHitIndex:g.where(entered,g.add(index,1),index),nextDamageTotal:g.add(total,out.damage),hitEntered:g.cast(entered,'float32')});
  for(const[n,v]of Object.entries(out))g.output(v,n);return g;
}
export function buildTensionRepeatedFinish(){
  const old=buildRepeatedFamilyFinish().json(),g=new Graph('rom-tension-repeated-finish2',{...old.contract,inputDomains:{...old.contract.inputDomains,damageTotal:{min:0,max:1048576,integer:true}},fieldDomains:{tension:tensorContract.fieldDomains},defaults:{...old.contract.defaults,tension:Array(6).fill(0)},feedback:{...old.contract.feedback,tension:'nextTension'},scope:'Commit one repeated caller context and consume source tension once. All five represented records carry action word10 tension bit. No RNG. Source flags/stage were preserved throughout all target iterations.'}),x=Object.fromEntries(old.inputs.map(d=>[d.name,g.input(d.name,d.shape,d.dtype)])),out=g.inline(old,x,'finish'),t=tensionState(g),consume=g.and(g.gt(x.entered,0),g.or(g.gt(t[1].low,0),g.gt(t[1].high,0)));
  t[1]=Object.fromEntries(['stage','low','high'].map(k=>[k,g.where(consume,0,t[1][k])]));
  Object.assign(out,{nextTension:packTension(g,t),tensionConsumed:g.cast(consume,'float32')});
  for(const[n,v]of Object.entries(out))g.output(v,n);return g;
}
export async function buildTensionRepeatedProgram(){
  const p=JSON.parse(await readFile(new URL('repeated-family-program.json',dir),'utf8'));
  const replacement={'rom-repeated-family-entry2':'rom-tension-repeated-entry2','rom-repeated-family-hit2':'rom-tension-repeated-hit2','rom-repeated-family-finish2':'rom-tension-repeated-finish2'};
  for(const m of p.modules)if(replacement[m.name]){const name=replacement[m.name],b=await readFile(new URL(name+'.onnx',dir)),ir=JSON.parse(await readFile(new URL(name+'.json',dir),'utf8'));Object.assign(m,{name,onnx:name+'.onnx',ir:name+'.json',sha256:hash(b),nodes:ir.nodes.length,bytes:b.length});}
  p.slots.push({name:'state.tension',width:6,dtype:'float32',initial:{kind:'input',path:['tension'],default:Array(6).fill(0)}},{name:'work.hit.tensionConsumed',width:1,dtype:'float32',initial:{kind:'zero'}},{name:'result.tensionConsumed',width:1,dtype:'float32',initial:{kind:'zero'}});
  p.inputs.tension='state.tension';p.outputs.nextTension='state.tension';p.outputs.tensionConsumed='result.tensionConsumed';
  function walk(steps){for(const s of steps){if(s.op==='repeat')walk(s.body);else if(s.op==='capture')s.tensors.nextTension='state.tension';else if(s.op==='call'&&replacement[s.model]){s.model=replacement[s.model];s.inputs.tension='state.tension';if(s.id!=='entry'){s.outputs.nextTension='state.tension';s.outputs.tensionConsumed=s.id==='hit'?'work.hit.tensionConsumed':'result.tensionConsumed';}}}}
  walk(p.steps);p.name='dq9-enemy-tension-repeated-caller';p.version=1;p.scope=contract().scope;p.tensionAuthority=TENSION_AUTHORITY;p.phase='Complete repeated action body with caller-scoped tension, before outer post-action.';
  return p;
}
async function main(){
  const oldNames=['rom-repeated-family-entry2','rom-repeated-family-hit2','rom-repeated-family-finish2'],oldBuilders=[buildRepeatedFamilyEntry,buildRepeatedFamilyHit,buildRepeatedFamilyFinish],immutable=[];
  for(let i=0;i<oldNames.length;i++){const b=await readFile(new URL(oldNames[i]+'.onnx',dir));if(hash(b)!==hash(oldBuilders[i]().model()))throw Error('Frozen repeated graph changed '+oldNames[i]);immutable.push({name:oldNames[i],sha256:hash(b),regeneratedEqual:true});}
  const models=[];for(const g of[buildTensionRepeatedEntry(),buildTensionRepeatedHit(),buildTensionRepeatedFinish()]){const b=g.model();models.push({name:g.name,sha256:hash(b),nodes:g.nodes.length,bytes:b.length});for(const[f,v]of[[g.name+'.onnx',b],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n']]){await writeFile(new URL(f+'.tmp',dir),v);await rename(new URL(f+'.tmp',dir),new URL(f,dir));}}
  const p=await buildTensionRepeatedProgram(),text=JSON.stringify(p,null,2)+'\n',report={schema:'dq9-tension-repeated-models-v1',models,programSha256:hash(text),immutable,actionIds:REPEATED_FAMILY_IDS,proofStatus:'Pending actual forty repeated tension callers and zero-state regression.'};
  for(const[f,v]of[['tension-repeated-program.json',text],['tension-repeated-models.json',JSON.stringify(report,null,2)+'\n']]){await writeFile(new URL(f+'.tmp',dir),v);await rename(new URL(f+'.tmp',dir),new URL(f,dir));}console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]===fileURLToPath(import.meta.url))await main();
