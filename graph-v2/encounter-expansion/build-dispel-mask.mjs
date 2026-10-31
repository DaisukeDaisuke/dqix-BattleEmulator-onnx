// All32 actual clear helpers are data: one176-byte AND mask. The graph does
// not reconstruct their C++ control flow or claim the following buff recalc.
import {Graph} from '../graph-builder.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import savedMask from '../../data/dispel-mask.mjs';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
export async function readDispelMasks(){
  const audit=structuredClone(savedMask);
  if(audit.andMaskBytes176.length!==176||audit.andMaskBytes176.some(x=>!Number.isInteger(x)||x<0||x>255))throw Error('Invalid actual176-byte mask');
  return audit;
}
export function byteAndMask(g,input,masks){
  if(masks.some(x=>!Number.isInteger(x)||x<0||x>255))throw Error('Nonbyte mask');
  let result;
  for(let bit=0;bit<8;bit++){
    const low=g.floor(g.mul(input,2**-bit)),high=g.floor(g.mul(input,2**(-bit-1))),digit=g.sub(low,g.mul(high,2));
    const weight=g.constant(masks.map(x=>x&(1<<bit)),'float32',[1,masks.length]),term=g.mul(digit,weight);
    result=result===undefined?term:g.add(result,term);
  }
  return result;
}
export function buildDispelByteMask(audit){
  const g=new Graph('rom-dispel-byte-mask176',{
    scope:'Exactly the direct writes of the32 distinct actual helpers called by JPN021eb028, ending at ApplyCombatantBuffs entry. Arbitrary176 raw input bytes are allowed. Subsequent derived-stat recalculation, tension event allocation, target admission, hit checks, action RNG and whole action189 are separate boundaries.',
    scopeJa:'いてつくはどうの32解除関数による176バイトへの直接書込みを保持マスクで実行します。能力値の再計算・命中判定・乱数を含む行動全体は別の境界です。',
    inputDomains:{bytes:{min:0,max:255,integer:true,width:176},enabled:{values:[false,true,0,1]}},
    defaults:{bytes:Array(176).fill(255),enabled:true},feedback:{bytes:'nextBytes'},
    labels:{bytes:'ROM戦闘状態176バイト',enabled:'解除を適用'},
    authority:{maskFile:audit.path,maskSha256:audit.sha256,source:audit.source,sourceSha256:audit.sourceSha256,clearFunction:'JPN021eb028 / USA021ea85c',nextBoundary:'JPN021575c4 ApplyCombatantBuffs entry',distinctHelpers:audit.helperCount,wordMasks:audit.wordMasks},
    maskBytes:audit.andMaskBytes176,
    arithmeticProof:'Each input is an integer0..255. Division by powers of two is exact binary32; floor(x/2^b)-2*floor(x/2^(b+1)) is a bit0/1. Weights are the retained powers of two. Products and all partial sums are integers0..255 and therefore exactly represented. Disabled lanes return every original byte. AND-idempotence gives an invariant byte domain under feedback.',
    preservation:'The original masks preserve primary low status bits, poison subtype, coup byte and anger fields where their individual bytes permit. This graph does not substitute a blanket status reset.'
  });
  const bytes=g.input('bytes',['N',176]),enabled=g.input('enabled',['N',1],'bool');
  g.output(g.where(enabled,byteAndMask(g,bytes,audit.andMaskBytes176),bytes),'nextBytes');
  return g;
}
async function main(){
  const audit=await readDispelMasks(),g=buildDispelByteMask(audit),bytes=g.model(),report={schema:'dq9-dispel-byte-mask-model-v1',name:g.name,sha256:hash(bytes),bytes:bytes.length,nodes:g.nodes.length,maskSha256:audit.sha256,actualDistinctHelpers:audit.helperCount,proofStatus:'Independent arithmetic and actual pre-buff snapshot comparisons are separate reports.'};
  for(const[file,value]of[[g.name+'.onnx',bytes],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n'],['dispel-byte-mask-model.json',JSON.stringify(report,null,2)+'\n']]){await writeFile(new URL(file+'.tmp',dir),value);await rename(new URL(file+'.tmp',dir),new URL(file,dir));}
  console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]===fileURLToPath(import.meta.url))await main();
