// Original tension helpers as small explicit-state graphs. These are not a
// replacement for the action caller or its eligibility/consumption phases.
import {Graph} from '../graph-builder.mjs';
import {RandomGraph} from '../transition-graphs.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {sourceSHA256} from '../../data/source-authority.mjs';
const dir=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
export const TENSION_COEFFICIENT_HEX='0000803f0000803f0000c03f6666a63f000020400000004000008040000040400000c04000009040';
export const TENSION_COEFFICIENTS=Array.from({length:10},(_,i)=>Buffer.from(TENSION_COEFFICIENT_HEX,'hex').readFloatLE(i*4));
export const TENSION_FIELDS=['a0_stage','a0_low','a0_high','a1_stage','a1_low','a1_high'];
export const TENSION_AUTHORITY={query:'evidence-v2/ghidra/tension-defined/response.json',table:'JPN020e8a0c',tableHex:TENSION_COEFFICIENT_HEX,raise:'JPN02088b04 →02087f78',highEligible:'JPN02088a08',setHigh:'JPN02088a4c',coefficient:'JPN020758c4',bonus:'JPN020758f0',clearHigh:'JPN02088aa8',clearLow:'JPN02088b30'};
const flag=(g,byte,mask)=>{const q=g.floor(g.mul(byte,1/mask));return g.sub(q,g.mul(g.floor(g.mul(q,.5)),2));};
const clear=(g,byte,mask)=>g.sub(byte,g.mul(flag(g,byte,mask),mask));
const set=(g,byte,mask)=>g.add(clear(g,byte,mask),mask);
const gather=(g,values,index)=>g.op('Gather',[g.constant(values,'float32',[values.length]),g.cast(index,'int32')],{axis:0},{shape:['N',1]});

export function tensionCoefficient(g,stage,enemy){return gather(g,TENSION_COEFFICIENTS,g.add(g.mul(stage,2),enemy));}
export function tensionBonus(g,stage,signedLevel){
  // The actual helper performs signed INTEGER division by10 before conversion
  // to float. A256-row exact integer column also preserves negative-level -0
  // when a negative multiplier is multiplied by stage0.
  const multiplier=gather(g,Array.from({length:256},(_,i)=>Math.trunc((i-128)/10)+1),g.add(signedLevel,128));
  return g.mul(multiplier,stage);
}
export function raiseTension(g,rng,{stage,low,high,poison,poisonKind,dead,asleep,paralyzed,skip},enabled){
  const chanceGate=g.and(enabled,g.eq(stage,3)),roll=rng.bounded(chanceGate,2),failed=g.and(chanceGate,g.gt(roll,0));
  const increased=g.and(enabled,g.lt(stage,4),g.not(failed)),nextStage=g.where(increased,g.add(stage,1),stage);
  const highSet=g.and(increased,g.ge(nextStage,4),... [dead,high,asleep,paralyzed,skip].map(x=>g.eq(x,0)));
  return{stage:nextStage,low:g.where(enabled,g.where(highSet,0,1),low),high:g.where(highSet,1,high),poison:g.where(highSet,0,poison),poisonKind:g.where(highSet,0,poisonKind),highSet,
    result:g.where(enabled,g.where(g.ge(stage,4),-2,g.where(failed,-1,nextStage)),0)};
}
export function buildTensionRaiseModel(){
  const g=new Graph('rom-tension-raise-raw',{
    scope:'Actual low-level JPN02088b04/02087f78 only. Explicit four raw status14 bytes and unsigned stage24 byte preserve otherwise inconsistent raw states. Caller eligibility, action RNG, event allocation and derived stat recomputation are outside.',
    scopeJa:'テンション上昇helperの単体核。段階3だけ乱数を使い、高段階への移行可否と毒の解除を元の状態ビットに従って計算します。',authority:TENSION_AUTHORITY,
    inputDomains:{seed:{min:0,max:255,integer:true,width:8},position:{min:1,max:4990,integer:true},statusBytes:{min:0,max:255,integer:true,width:4},stage:{min:0,max:255,integer:true},poisonKind:{min:0,max:3,integer:true},enabled:{values:[false,true,0,1]}},
    defaults:{seed:[1,0,0,0,0,0,0,0],position:1,statusBytes:[0,0,0,0],stage:0,poisonKind:2,enabled:true},feedback:{seed:'nextSeed',position:'nextPosition',statusBytes:'nextStatusBytes',stage:'nextStage',poisonKind:'nextPoisonKind'},
    phaseContract:'The helper always sets ordinary tension first when enabled. Stage>=4 returns-2 with no draw. Stage3 consumes bounded2, returns-1 on nonzero, otherwise increments. A successful increment to4 sets high tension only if not dead/high/asleep/paralyzed/skipping; successful high setup clears ordinary tension, poison flag and poison subtype. Inhibited high setup still leaves stage4/ordinary flag. Disabled is explicit graph identity, not an ARM execution.',
    stateEncoding:'statusBytes are little-endian bytes of raw word14. Every unrelated bit is preserved; poisonKind is word22 low2, and the remaining word22 bits are outside this projected primitive. No u32 is stored in one float32 scalar.',
    rounding:'Status bit planes and byte recombination are exact integer/power-of-two operations below2^24. Current LCG seed is eight byte limbs; position is a counter, not skip-ahead.'
  });
  const seed=g.input('seed',['N',8]),position=g.input('position',['N',1],'int32'),bytes=g.split(g.input('statusBytes',['N',4]),4),stage=g.input('stage'),poisonKind=g.input('poisonKind'),enabled=g.input('enabled',['N',1],'bool'),rng=new RandomGraph(g,seed,position);
  const r=raiseTension(g,rng,{stage,low:flag(g,bytes[2],128),high:flag(g,bytes[3],1),poison:flag(g,bytes[0],2),poisonKind,dead:flag(g,bytes[0],1),asleep:flag(g,bytes[0],16),paralyzed:flag(g,bytes[0],8),skip:flag(g,bytes[2],8)},enabled);
  const nextBytes=[g.add(clear(g,bytes[0],2),g.mul(r.poison,2)),bytes[1],g.add(clear(g,bytes[2],128),g.mul(r.low,128)),g.add(clear(g,bytes[3],1),r.high)];
  for(const[name,value]of Object.entries({nextSeed:rng.seed,nextPosition:rng.position,nextStatusBytes:g.cat(nextBytes),nextStage:r.stage,nextPoisonKind:r.poisonKind,result:r.result,highSet:g.cast(r.highSet,'float32'),consumed:g.sub(rng.position,position)}))g.output(value,name);
  return g;
}
export function buildTensionNumericModel(){
  const g=new Graph('rom-tension-numeric',{
    scope:'Original five-by-two coefficient table and signed-integer level bonus, plus their two separate binary32 incoming-damage rounding sites. This does not check action tension flags or apply critical/resistance/defend/combo/cap, HP, RNG or tension consumption.',
    scopeJa:'テンション倍率とレベル加算の単体核。レベルを整数除算してから加算し、元の単精度演算順を保ちます。',authority:TENSION_AUTHORITY,
    inputDomains:{stage:{min:0,max:4,integer:true},enemy:{values:[0,1]},signedLevel:{min:-128,max:127,integer:true},incoming:{min:0,max:16777215,integer:true}},
    defaults:{stage:2,enemy:1,signedLevel:9,incoming:24},
    rounding:'Integer quotient truncates toward0. coefficient is the actual40 ROM bytes, including enemy1.3 binary32. scaled=F32(F32(incoming*coefficient)+bonus). Bonus preserves signed negative zero for stage0 and level<=-20; it is not simplified to a constant zero.',
    labels:{stage:'テンション段階0〜4',enemy:'敵=1 /味方=0',signedLevel:'signed byteとして読んだレベル',incoming:'テンション補正前ダメージ'}
  });
  const stage=g.input('stage'),enemy=g.input('enemy'),level=g.input('signedLevel'),incoming=g.input('incoming'),coefficient=tensionCoefficient(g,stage,enemy),bonus=tensionBonus(g,stage,level),scaled=g.add(g.mul(incoming,coefficient),bonus);
  for(const[name,value]of Object.entries({coefficient,bonus,scaled}))g.output(value,name);return g;
}
async function main(){
  // The literal table was checked against the complete Ghidra memory read.
  if(hash(Buffer.from(TENSION_COEFFICIENT_HEX,'hex'))!=='e0e6dd75cbc4f314e2b2dcfcb037e5821d2301fb64f9b25b7f6a4fe744052757')throw Error('Pinned tension coefficient bits differ');
  const models=[];
  for(const g of[buildTensionRaiseModel(),buildTensionNumericModel()]){
    const bytes=g.model();models.push({name:g.name,sha256:hash(bytes),bytes:bytes.length,nodes:g.nodes.length});
    for(const[file,value]of[[g.name+'.onnx',bytes],[g.name+'.json',JSON.stringify(g.json(),null,2)+'\n']]){await writeFile(new URL(file+'.tmp',dir),value);await rename(new URL(file+'.tmp',dir),new URL(file,dir));}
  }
  const report={schema:'dq9-tension-primitives-v1',models,source:TENSION_AUTHORITY.query,sourceSha256:sourceSHA256(TENSION_AUTHORITY.query),coefficientBits:TENSION_COEFFICIENT_HEX,proofStatus:'New components; actual helper verification is a separate report. Existing47-action and encounter hashes are unchanged.'};
  await writeFile(new URL('tension-primitive-models.json.tmp',dir),JSON.stringify(report,null,2)+'\n');await rename(new URL('tension-primitive-models.json.tmp',dir),new URL('tension-primitive-models.json',dir));console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]===fileURLToPath(import.meta.url))await main();
