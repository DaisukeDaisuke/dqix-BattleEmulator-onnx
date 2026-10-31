import {writeFile} from 'node:fs/promises';
import {Graph,normalized,bounded,physical} from './graph-builder.mjs';
import {buildBuffModel,buildStrikeModel,buildVitalModel,buildTurnTailModel} from './transition-graphs.mjs';
const reports=[];
{
  const g=new Graph('rom-rng-normalize',{authority:'ROM matching Util/Random.cpp and Ghidra ARM instruction evidence',raw:'4 unsigned base-256 digits, least significant first',maximum:'integer 1..65535',rounding:'Each float32 arithmetic node is separately rounded; no fused multiply-add permission.'});
  const raw=g.input('raw',['N',4]),maximum=g.input('maximum'),unit=normalized(g,g.split(raw,4));
  g.output(unit,'unit');g.output(bounded(g,unit,maximum),'bounded');reports.push(await g.save());
}
{
  const g=new Graph('rom-physical',{authority:'ROM matching BasicAttackCalculation.cpp followed by GetAttackBaseDamage integer conversion; differs from old Q32 source on demonstrated seeds',seed:'Current LCG state immediately before the next draw, 8 base-256 float32 integer limbs',position:'int32 count, normally 1..4990; counter does not perform skip-ahead',attack:'u16 integer',defense:'u16 integer',rounding:'Every arithmetic node is separately rounded to float32; cross-node reassociation or fma is outside this contract.',scope:'Physical base damage with actual 0/1/2 RNG consumption. Not a whole battle.'});
  const seed=g.input('seed',['N',8]),position=g.input('position',['N',1],'int32'),attack=g.input('attack'),defense=g.input('defense');
  const p=physical(g,seed,position,attack,defense,g.ge(attack,0));
  for(const [key,name] of [['seed','nextSeed'],['position','nextPosition'],['damage','damage'],['consumed','consumed']])g.output(p[key],name);
  reports.push(await g.save());
}
for(const graph of [buildBuffModel(),buildStrikeModel(),buildVitalModel(),buildTurnTailModel()])reports.push(await graph.save());
await writeFile(new URL('models.json',import.meta.url),JSON.stringify(reports,null,2)+'\n');
console.log(JSON.stringify(reports,null,2));
