#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {Graph} from '../graph-v2/graph-builder.mjs';
import {RandomGraph} from '../graph-v2/transition-graphs.mjs';
import {COMMON_ACTION_RULES,commonCriticalDamage} from '../graph-v2/build-common-action.mjs';
import {bossRuleColumns,resistanceFraction} from '../graph-v2/boss-action-rules.mjs';
import {DEFEND_MULTIPLIERS,COMBO_MULTIPLIERS} from '../graph-v2/rules.mjs';
import {COMMON_METAL_DAMAGE_AUTHORITY,decodeMetalRuleFields,commonMetalPreCritical,commonMetalBeforeMinimum,commonMetalMinimumAllowed,commonMetalAfterMinimum} from '../graph-v2/common-metal-damage.mjs';
import rom from '../restored/dq9-unified/data/rom.mjs';
import {loadLocalOrt} from './verify-common-battle.mjs';
import {createGraphExecutor} from '../web/graph-executor.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex'),seedBytes=s=>Array.from({length:8},(_,i)=>Number(BigInt(s)>>BigInt(8*i)&255n));
const rawById=new Map(rom.actions.map(x=>[x.id,x]));
export function buildCommonMetalBoundary(){
  const rules=COMMON_ACTION_RULES.map(r=>{const out={...r,...decodeMetalRuleFields(rawById.get(r.id)),supported:+r.supported};delete out.unsupportedReason;return out;}),g=new Graph('rom-common-metal-postprocess-boundary',{authority:COMMON_METAL_DAMAGE_AUTHORITY,scope:'Exact full original damage-postprocess on neutral weapon/Force/barrier state, party0 to actual typed enemy192. Allows original metal identity, critical, tension, defend0..3, real resistances, initial dodge/guard flags and resolved weapon-metal property. Raw base and critical are initial direct-helper arguments, not observed intermediates from a claimed full battle.',inputDomains:{},feedback:{}});
  const scalar=(n,t='float32')=>g.input(n,['N',1],t),flag=n=>scalar(n,'bool'),seed=g.input('seed',['N',8]),position=scalar('position','int32'),id=scalar('actionId'),raw=scalar('rawBase'),critical=flag('critical'),metal=flag('targetMetal'),stage=scalar('stage'),low=scalar('low'),high=scalar('high'),level=scalar('level'),allow=flag('allowTension'),attack=scalar('attack'),defend=scalar('defend'),resistance=scalar('damageResistance'),dodge=flag('dodge'),guard=flag('guard'),bonus=flag('weaponMetalBonus'),targetHigh=flag('targetHigh'),combo=scalar('comboCount'),enabled=flag('enabled'),r=bossRuleColumns(g,id,rules),rng=new RandomGraph(g,seed,position),party=g.eq(id,id),falseFlag=g.not(party),tension={stage,low:g.where(allow,low,0),high:g.where(allow,high,0),partySource:party,level,targetMetal:metal,critical};
  const pre=commonMetalPreCritical(g,r,enabled,raw,tension),gate=g.and(enabled,critical,g.or(g.eq(r.forcedCritical,0),g.gt(r.forcedCriticalBonus,0)),g.eq(r.criticalDamageSuppressed,0));let value=commonCriticalDamage(g,rng,r,gate,raw,{preCritical:pre,baseAttack:attack});
  const fraction=resistanceFraction(g,resistance);value=g.mul(value,fraction);const defendFactor=g.op('Gather',[g.constant(DEFEND_MULTIPLIERS,'float32',[DEFEND_MULTIPLIERS.length]),g.cast(defend,'int32')],{axis:0},{shape:['N',1]});value=g.mul(value,g.where(g.gt(r.defend,0),defendFactor,1));value=g.where(g.or(dodge,guard),0,value);
  value=commonMetalBeforeMinimum(g,value,r,{targetMetal:metal,critical,weaponAlwaysOne:falseFlag});const minimum=g.and(enabled,g.not(dodge),g.not(guard),g.le(value,0),g.gt(fraction,0),g.not(g.eq(r.selector,45)),commonMetalMinimumAllowed(g,r,{targetMetal:metal}));value=g.where(minimum,rng.bounded(minimum,2),value);
  value=commonMetalAfterMinimum(g,rng,value,r,{enabled,targetMetal:metal,critical,partySource:party,weaponMetalBonus:bonus,stage,low,high,allowTension:allow});value=g.where(g.and(targetHigh,g.eq(r.operation,1)),g.mul(value,.5),value);
  const comboGate=g.and(g.gt(r.combo,0),g.ge(value,1)),comboFactor=g.op('Gather',[g.constant(COMBO_MULTIPLIERS,'float32',[COMBO_MULTIPLIERS.length]),g.cast(combo,'int32')],{axis:0},{shape:['N',1]});value=g.floor(g.where(comboGate,g.mul(value,comboFactor),value));value=g.where(g.gt(r.damageCap,0),g.min(value,r.damageCap),value);
  g.output(value,'damage');g.output(rng.seed,'nextSeed');g.output(rng.position,'nextPosition');g.output(g.sub(rng.position,position),'consumed');return g;
}

const args=process.argv.slice(2),option=n=>{const i=args.indexOf(n);return i<0?undefined:args[i+1];};
if(option('--source')){
  const bytes=await readFile(resolve(option('--source'))),source=JSON.parse(bytes);if(!source.programUnmodified||!source.executionComplete||source.romSHA256!==rom.romSha256)throw Error('Matching unmodified original source required');
  const graph=buildCommonMetalBoundary(),ir=graph.json(),onnx=graph.model(),ort=await loadLocalOrt(option('--ort-dir')),executor=createGraphExecutor({models:new Map([[graph.name,{name:graph.name,ir,onnx}]]),ortRuntime:ort}),report={schema:'dq9-common-metal-postprocess-arm-v1',sourceSHA256:hash(bytes),modelSHA256:hash(onnx),cases:source.results.length,fields:0,mismatches:0,examples:[],authority:COMMON_METAL_DAMAGE_AUTHORITY};
  try{for(let offset=0;offset<source.results.length;offset+=128){const group=source.results.slice(offset,offset+128),rows=group.map(({case:c,ok,strictInitializedMemory})=>{if(!ok||!strictInitializedMemory||c.kind!=='party_postprocess')throw Error('Invalid original caller '+c.id);const a=c.actors[0],target=c.actors[1],r=COMMON_ACTION_RULES.find(x=>x.id===c.actionId),status=a.status??0,tstatus=target.status??0,aux=Buffer.from(c.monsterAuxRaw,'hex');return{seed:seedBytes(c.seed),position:[1],actionId:[c.actionId],rawBase:[c.rawBase],critical:[!!c.commandCritical],targetMetal:[!!(aux.readUInt16LE(10)&0x1000)],stage:[c.tensionStage??0],low:[(status>>>23)&1],high:[(status>>>24)&1],level:[a.level],allowTension:[!!c.allowTension],attack:[a.baseAttack??a.attack],defend:[target.defend??0],damageResistance:[r.damageElement===0?100:target.resistances[r.damageElement-1]],dodge:[!!(c.initialHitFlags&4)],guard:[!!(c.initialHitFlags&2)],weaponMetalBonus:[!!((c.partyWeaponPresent??1)>0&&((c.partyWeaponProperty0??0)&16))],targetHigh:[!!((tstatus>>>24)&1)],comboCount:[c.comboCount??0],enabled:[true]};}),out=await executor.runGraph(graph.name,rows);
    group.forEach((r,i)=>{const expected={damage:[r.integerResult],nextSeed:seedBytes(r.nextState),nextPosition:[1+r.consumed],consumed:[r.consumed]};for(const[key,values]of Object.entries(expected))values.forEach((v,j)=>{report.fields++;if(v!==out[i][key]?.[j]){report.mismatches++;if(report.examples.length<30)report.examples.push({id:r.case.id,key,index:j,want:v,got:out[i][key]?.[j]});}});});
  }}finally{await executor.release();}report.passed=report.mismatches===0&&report.cases>0;report.runtime=executor.counts;if(option('--report'))await writeFile(resolve(option('--report')),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
}
