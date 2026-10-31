// Original selector45, present-combatant branch only. The enclosing action
// separately computes its fallback before invoking this helper.
import {Graph} from '../graph-builder.mjs';
import {RandomGraph} from '../transition-graphs.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
export function buildCriticalOrMissSelector(){
  const g=new Graph('rom-critical-or-miss-selector45',{
    scope:'Original damage selector45 JPN021d9f14 / USA021d9654, present-source branch. One bounded2 decides zero versus a second FloatBetween(.95,1.05) multiplied by unsigned base attack and truncated. Missing source returns the earlier fallback and is outside this explicit present-source ABI. No physical fallback, critical amplification, resistance, HP/state mutation or whole action is included.',
    scopeJa:'まじん斬りの専用補正。ゼロまたは基礎攻撃力から求めた値と、正確な次の乱数状態を返します。',
    inputDomains:{seed:{min:0,max:255,integer:true,width:8},position:{min:1,max:4990,integer:true},baseAttack:{min:0,max:65535,integer:true},enabled:{values:[false,true,0,1]}},
    defaults:{seed:[1,0,0,0,0,0,0,0],position:1,baseAttack:220,enabled:true},feedback:{seed:'nextSeed',position:'nextPosition'},
    authority:{table:'JPN021ff9c0 +45*8',pointer:'JPN021d9f14',source:'restored/dqix-decomp-decomp-matching/src/Combat/Overlay_24/func_ov024_021d9654.cpp',audit:'giyumei-action-source-audit.json'},
    rounding:'FloatBetween and multiplication use separate binary32 nodes. Nonnegative unsigned attack/range make Floor identical to the original integer truncation. Disabled input returns damage0 and preserves RNG; that is a graph scheduling contract, not an additional ARM branch.',
    labels:{baseAttack:'現在値ではなく基礎攻撃力'}
  });
  const seed=g.input('seed',['N',8]),position=g.input('position',['N',1],'int32'),attack=g.input('baseAttack'),enabled=g.input('enabled',['N',1],'bool'),rng=new RandomGraph(g,seed,position),choice=rng.bounded(enabled,2),positive=g.and(enabled,g.eq(choice,0)),range=rng.range(positive,Math.fround(.95),Math.fround(1.05)),damage=g.where(positive,g.floor(g.mul(attack,range)),0);
  for(const[name,value]of Object.entries({damage,nextSeed:rng.seed,nextPosition:rng.position,consumed:g.sub(rng.position,position),active:g.cast(enabled,'float32')}))g.output(value,name);
  return g;
}
export async function writeCriticalOrMissSelector(){
  const g=buildCriticalOrMissSelector(),bytes=g.model();auditModelBytes(bytes,{name:g.name});
  const source='../../restored/dqix-decomp-decomp-matching/src/Combat/Overlay_24/func_ov024_021d9654.cpp',report={schema:'dq9-critical-or-miss-selector45-build-v1',model:g.name,modelSha256:hash(bytes),nodes:g.nodes.length,bytes:bytes.length,source,sourceSha256:sourceSHA256(source),scope:g.contract.scope,proofStatus:'Independent actual helper boundary comparison is a separate report.'};
  for(const[f,v]of[[g.name+'.onnx',bytes],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n'],['critical-or-miss-selector-model.json',JSON.stringify(report,null,2)+'\n']]){await writeFile(new URL(f+'.tmp',dir),v);await rename(new URL(f+'.tmp',dir),new URL(f,dir));}
  return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await writeCriticalOrMissSelector(),null,2));
import {sourceSHA256} from '../../data/source-authority.mjs';
