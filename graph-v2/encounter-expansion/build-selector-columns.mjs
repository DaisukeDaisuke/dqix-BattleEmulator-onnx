// A separate selector-column prototype. The immutable four-selector primitive
// and all published action/encounter programs remain untouched.
import {Graph} from '../graph-builder.mjs';
import {RandomGraph} from '../transition-graphs.mjs';
import rom from '../../restored/dq9-unified/data/rom.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const F=Math.fround,dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');

// mode0: fallback identity; mode1: f32 multiply then truncate;
// mode2: exact signed-int shift by1 (restricted nonnegative input);
// mode3: integer divide by2 then add37; mode4/5: already audited
// base-attack/level range rules. These order tags are semantics, not training.
export const SELECTOR_COLUMN_RULES=[
  [0,0,1,0,0,0],[3,1,1.25,0,0,0],[5,4,1,0,.85,.95],
  [6,1,2.5,0,0,0],[7,1,1.25,0,0,0],[9,1,.75,0,0,0],
  [11,1,.5,0,0,0],[14,0,1,0,0,0],[17,2,2,0,0,0],
  [19,1,.3,0,0,0],[24,1,1.3,0,0,0],[25,1,1.2,0,0,0],
  [27,1,.8,0,0,0],[31,0,1,0,0,0],[33,1,1.5,0,0,0],
  [36,1,1.5,0,0,0],[37,0,1,0,0,0],[38,1,.7,0,0,0],
  [41,5,2.5,0,.9,1.1],[57,3,.5,37,0,0]
].map(([selector,mode,scale,bias,low,high])=>({selector,mode,scale:F(scale),bias,low:F(low),high:F(high)}));
export const SELECTOR_COLUMN_IDS=SELECTOR_COLUMN_RULES.map(r=>r.selector);
export function selectorColumns(g,selector){
  const index=g.cast(selector,'int32'),rows=new Map(SELECTOR_COLUMN_RULES.map(r=>[r.selector,r]));
  const get=key=>g.op('Gather',[g.constant(Array.from({length:67},(_,i)=>rows.get(i)?.[key]??0),'float32',[67]),index],{axis:0},{shape:['N',1]});
  return{supported:g.gt(g.op('Gather',[g.constant(Array.from({length:67},(_,i)=>Number(rows.has(i))),'float32',[67]),index],{axis:0},{shape:['N',1]}),0),mode:get('mode'),scale:get('scale'),bias:get('bias'),low:get('low'),high:get('high')};
}
export function columnSelectorDamage(g,rng,selector,fallback,baseAttack,resolvedLevel,enabled){
  const c=selectorColumns(g,selector),active=g.and(enabled,c.supported),randomMode=g.or(g.eq(c.mode,4),g.eq(c.mode,5)),range=rng.range(g.and(active,randomMode),c.low,c.high);
  const product=g.mul(g.where(g.eq(c.mode,4),baseAttack,g.where(g.eq(c.mode,5),resolvedLevel,fallback)),c.scale);
  const fixed=g.add(g.floor(product),c.bias),random=g.floor(g.mul(product,range));
  // No rounding-site contraction: level first multiplies by2.5, then range.
  const value=g.where(g.eq(c.mode,0),fallback,g.where(randomMode,random,fixed));
  return{damage:g.where(active,value,fallback),supported:c.supported,active};
}
export function buildSelectorColumnModel(){
  const g=new Graph('rom-physical-selector-columns',{
    scope:'A present-actor damage-selector primitive only. Twenty represented indices share coefficient/mode columns; every other index is supported0 with fallback/RNG identity. No species checks, state-conditioned multipliers, recoils, drains, auxiliary writes, target collection, hit loop or full action is inferred from selector similarity.',
    scopeJa:'20個の物理補正selectorを係数と演算順の表で選びます。技全体の副作用や連続攻撃の対応とは別の単体核です。',
    inputDomains:{seed:{min:0,max:255,integer:true,width:8},position:{min:1,max:4990,integer:true},selector:{min:0,max:66,integer:true},fallback:{min:0,max:16777215,integer:true},baseAttack:{min:0,max:65535,integer:true},resolvedLevel:{min:0,max:127,integer:true},enabled:{values:[false,true,0,1]}},
    defaults:{seed:[1,0,0,0,0,0,0,0],position:1,selector:33,fallback:24,baseAttack:68,resolvedLevel:9,enabled:true},feedback:{seed:'nextSeed',position:'nextPosition'},
    authority:{table:'evidence-v2/ghidra/damage-selector-table67.json',address:'JPN021ff9c0',matchingDirectory:'restored/dqix-decomp-decomp-matching/src/Combat/Overlay_24',rules:SELECTOR_COLUMN_RULES},
    integerBounds:'Input fallback is an exactly represented integer below2^24. Selector17 doubles it below2^25 and below signed-int overflow; the even result is exact binary32. Selector57 truncates division by2 before adding37, whose maximum8388644 is below2^24. Ordinary coefficient products deliberately retain binary32 rounding and truncation. All represented results are nonnegative and signed-int representable, so Floor equals truncation.',
    proofStatus:'New table representation; compare independently to scalar arithmetic and actual ARM before claiming newly added selectors are ROM-verified. Existing selector/encounter artifacts are unchanged.'
  });
  const seed=g.input('seed',['N',8]),position=g.input('position',['N',1],'int32'),selector=g.input('selector'),fallback=g.input('fallback'),baseAttack=g.input('baseAttack'),level=g.input('resolvedLevel'),enabled=g.input('enabled',['N',1],'bool'),rng=new RandomGraph(g,seed,position);
  const d=columnSelectorDamage(g,rng,selector,fallback,baseAttack,level,enabled);
  for(const[name,value]of Object.entries({damage:d.damage,nextSeed:rng.seed,nextPosition:rng.position,consumed:g.sub(rng.position,position),supported:g.cast(d.supported,'float32'),active:g.cast(d.active,'float32')}))g.output(value,name);
  return g;
}
async function audit(){
  const tablePath='evidence-v2/ghidra/damage-selector-table67.json',tableBytes=await readFile(new URL('../../'+tablePath,import.meta.url)),table=JSON.parse(tableBytes),rows=[];
  for(const e of table.entries){
    const path=e.symbol?'restored/dqix-decomp-decomp-matching/src/Combat/Overlay_24/'+e.symbol+'.cpp':null;
    const bytes=path?await readFile(new URL('../../'+path,import.meta.url)):null;
    rows.push({...e,source:path,sourceSha256:bytes?hash(bytes):null,representedRule:SELECTOR_COLUMN_RULES.find(r=>r.selector===e.index)??null});
  }
  const blockers=JSON.parse(await readFile(new URL('../configuration-blockers.json',import.meta.url),'utf8'));
  const affected=blockers.missingActions.filter(x=>x.group==='physical-damage-selector').map(a=>{
    const action=rom.actions.find(r=>r.id===a.key),b=Buffer.from(action.raw,'hex'),w2c=b.readUInt32LE(44),repeat=b.readUInt32LE(28)>>>14&31;
    return{id:a.key,name:a.name,selector:a.damageSelector,configurationCount:a.configurationCount,bosses:a.bosses,repeatCode:repeat,additional:action.w18&31,word2c:'0x'+w2c.toString(16).padStart(8,'0'),numericSelectorRepresented:SELECTOR_COLUMN_IDS.includes(action.selector),callerStatus:'Not implemented or verified by this primitive. Repeat/additional/drain/recoil/self-defense and other caller flags require separate evidence.'};
  });
  return{table:tablePath,tableSha256:hash(tableBytes),romSha256:rom.romSha256,entries:rows,remainingConfigurationActions:affected,decision:'Continue301 self-heal/target scheduling as the shortest next complete encounter. In parallel, pure coefficient selectors and existing5/41 cover numeric portions of many records. Do not mark all22 physical-blocked configurations complete or infer wholecaller support from a coefficient match.'};
}
async function main(){
  const frozenPath=new URL('rom-incapacity-action-core2.onnx',dir),frozen=hash(await readFile(frozenPath)),g=buildSelectorColumnModel(),bytes=g.model();
  const report={schema:'dq9-selector-column-model-v1',name:g.name,sha256:hash(bytes),bytes:bytes.length,nodes:g.nodes.length,selectorIds:SELECTOR_COLUMN_IDS,immutable33Sha256:frozen,proofStatus:'Pending independent verification.'};
  const outputs=[[g.name+'.onnx',bytes],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n'],['selector-column-model.json',JSON.stringify(report,null,2)+'\n']];
  if(process.argv.includes('--private-audit'))outputs.push(['selector-family-audit.json',JSON.stringify(await audit(),null,2)+'\n']);
  for(const[file,value]of outputs){await writeFile(new URL(file+'.tmp',dir),value);await rename(new URL(file+'.tmp',dir),new URL(file,dir));}
  if(frozen!==hash(await readFile(frozenPath)))throw Error('Frozen33 kernel changed concurrently');
  console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]===fileURLToPath(import.meta.url))await main();
