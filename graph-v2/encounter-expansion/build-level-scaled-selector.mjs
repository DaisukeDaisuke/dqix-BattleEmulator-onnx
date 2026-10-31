// Original selector43 (しんくうは): present-source, one-draw component.
import {Graph} from '../graph-builder.mjs';
import {RandomGraph} from '../transition-graphs.mjs';
import {auditModelBytes} from './audit-model-artifacts.mjs';
import {writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const directory=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
export function levelScaledSelectorDamage(g,rng,level,enabled){
  const base=g.min(g.add(30,g.mul(level,2)),150),variation=rng.range(enabled,Math.fround(-.1),Math.fround(.1));
  return g.where(enabled,g.floor(g.add(base,g.mul(base,variation))),0);
}
export function buildLevelScaledSelector(){
  const g=new Graph('rom-level-scaled-selector43',{
    scope:'Original present-source damage selector43 JPN021d9ddc / USA021d951c. A source job level or independently resolved enemy low7-bit auxiliary level gives min(30+2*level,150); one original FloatBetween(-.1,.1) supplies a separate binary32 multiply then add before integer truncation. Physical fallback was evaluated by the caller and is outside this helper. Missing-party fallback, resistance, HP/state effects and complete action300 are outside this explicit present-source contract.',
    scopeJa:'しんくうはのレベル依存補正。専用ダメージと1回分進んだ乱数状態を返します。',
    inputDomains:{seed:{min:0,max:255,integer:true,width:8},position:{min:1,max:4990,integer:true},level:{min:0,max:65535,integer:true},enabled:{values:[false,true,0,1]}},
    defaults:{seed:[1,0,0,0,0,0,0,0],position:1,level:47,enabled:true},
    feedback:{seed:'nextSeed',position:'nextPosition'},
    authority:{table:'JPN021ff9c0 +43*8',pointer:'JPN021d9ddc',source:'restored/dqix-decomp-decomp-matching/src/Combat/Overlay_24/func_ov024_021d951c.cpp',sourceSha256:'615285ff7a6bebcfe1a6b40bf87b90d14cbe6478c0b4adec2b4d0b695ce6cd66'},
    rounding:'Each ONNX arithmetic node is a separate binary32 rounding site. Source levels are unsigned; damage stays nonnegative, so Floor equals the original float-to-int truncation. The disabled scheduling lane returns damage0 and preserves RNG, rather than representing an additional ARM branch.',
    labels:{level:'攻撃元のレベル'}
  });
  const seed=g.input('seed',['N',8]),position=g.input('position',['N',1],'int32'),level=g.input('level'),enabled=g.input('enabled',['N',1],'bool'),rng=new RandomGraph(g,seed,position);
  const damage=levelScaledSelectorDamage(g,rng,level,enabled);
  for(const[name,value]of Object.entries({damage,nextSeed:rng.seed,nextPosition:rng.position,consumed:g.sub(rng.position,position),active:g.cast(enabled,'float32')}))g.output(value,name);
  return g;
}
export async function writeLevelScaledSelector(){
  const g=buildLevelScaledSelector(),bytes=g.model();auditModelBytes(bytes,{name:g.name});
  const report={schema:'dq9-level-scaled-selector43-build-v1',model:g.name,modelSha256:hash(bytes),nodes:g.nodes.length,bytes:bytes.length,authority:g.contract.authority,scope:g.contract.scope,proofStatus:'Independent actual helper boundary comparison is a separate report.'};
  for(const[f,value]of[[g.name+'.onnx',bytes],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n'],['level-scaled-selector-model.json',JSON.stringify(report,null,2)+'\n']]){await writeFile(new URL(f+'.tmp',directory),value);await rename(new URL(f+'.tmp',directory),new URL(f,directory));}
  return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await writeLevelScaledSelector(),null,2));
