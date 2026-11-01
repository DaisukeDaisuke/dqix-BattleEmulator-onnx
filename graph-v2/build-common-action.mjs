import {Graph,physical} from './graph-builder.mjs';
import {RandomGraph,buffStat} from './transition-graphs.mjs';
import {buildBossActionCore} from './build-boss-action.mjs';
import {decodeBossActionRule,bossRuleColumns,resistanceFraction} from './boss-action-rules.mjs';
import {extendedInputContract} from './input-domains.mjs';
import {coupDamageBonus,coupEligibility,coupLevelDuration,angerCheck} from './lifecycle-rules.mjs';
import {enemyPackedDamage} from './encounter-expansion/build-packed-damage.mjs';
import {columnSelectorDamage,SELECTOR_COLUMN_IDS} from './encounter-expansion/build-selector-columns.mjs';
import {levelScaledSelectorDamage} from './encounter-expansion/build-level-scaled-selector.mjs';
import {COMMON_LEVEL_SELECTOR_IDS,commonLevelSelectorDamage} from './common-level-selector-rules.mjs';
import {raiseTension} from './encounter-expansion/build-tension-primitives.mjs';
import {commonTensionCoefficient as tensionCoefficient,commonTensionBonus as tensionBonus,commonTensionNumericSupported,commonTensionReduction,COMMON_TENSION_REDUCTION_AUTHORITY,COMMON_TENSION_NUMERIC_STAGES} from './common-tension-reduction.mjs';
import {decodedDispelColumns} from './encounter-expansion/build-dispel-action.mjs';
import dispelMask from '../data/dispel-mask.mjs';
import {COMMON_MODIFIER_RULES,COMMON_RAW_TIMER_FIELDS,COMMON_RAW_TIMER_OFFSETS,clearCommonModifier} from './common-modifier-rules.mjs';
import {COMMON_STATE_SELECTOR_RULES,COMMON_STATE_SELECTOR_IDS,commonStateSelectorDamage} from './common-state-selector-rules.mjs';
import {commonCriticalThreshold} from './common-critical-rules.mjs';
import {expandCommonCommandTargets,COMMON_TARGET_DAMAGE_FALLOFF} from './common-command-repetition.mjs';
import {applyCommonModifierCreation} from './common-modifier-create.mjs';
import {COMMON_COMMAND_SELECTOR_IDS,commonCommandSelectorDamage} from './common-command-selector-rules.mjs';
import {commonEffectResistancePercentages} from './common-effect-resistance.mjs';
import {commonEnemyMpDrain} from './common-enemy-mp-drain.mjs';
import {commonBladeDamage} from './build-common-blade-recoil.mjs';
import {commonScenarioMode,commonScenarioPrimaryDamage} from './common-scenario-rules.mjs';
import {commonPoisonState,commonAdditionalPoison} from './common-poison-state.mjs';
import {commonAdditionalAilment} from './common-additional-ailment.mjs';
import {commonAdditionalBlind,COMMON_ADDITIONAL_BLIND_AUTHORITY} from './common-additional-blind.mjs';
import {commonAdditionalRank,COMMON_ADDITIONAL_RANK_AUTHORITY} from './common-additional-rank.mjs';
import {COMMON_STANCE_RULES,commonStanceRank} from './common-stance-rules.mjs';
import {decodeMetalRuleFields,commonMetalPreCritical,commonMetalBeforeMinimum,commonMetalMinimumAllowed,commonMetalAfterMinimum} from './common-metal-damage.mjs';
import {decodeWeaponPostprocessRules,commonWeaponClearsGuard,commonWeaponPostprocess,COMMON_WEAPON_POSTPROCESS_AUTHORITY} from './common-weapon-postprocess.mjs';
import {commonWeaponSpeciesDamage,COMMON_WEAPON_SPECIES_FIELDS} from './common-weapon-species.mjs';
import rom from '../restored/dq9-unified/data/rom.mjs';
import {ACTOR_FIELDS,COMMON_AUX_FIELDS,COMMON_STATUS_FIELDS,COMMON_CONFIG_FIELDS,COMMON_TENSION_FIELDS,COMMON_PREPARATION_FIELDS,COMMON_HISTORY_FIELDS,COMMON_MAGIC_FIELDS,COMMON_PACKED_SCALE_FIELDS,COMMON_RAW_RANK_FIELDS,COMMON_RAW_STATE_ABI,commonAuxDefault} from './common-battle-schema.mjs';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const object=(names,values)=>Object.fromEntries(names.map((name,i)=>[name,values[i]]));
const pack=(g,names,value)=>g.cat(names.map(name=>value[name]));
const asBool=(g,value)=>g.gt(value,0);
const scalar=(g,value)=>g.cast(value,'float32');
const zero=(g)=>g.eq(0,1);
const supportedSelectors=new Set([...SELECTOR_COLUMN_IDS,...COMMON_STATE_SELECTOR_IDS,...COMMON_COMMAND_SELECTOR_IDS,...COMMON_LEVEL_SELECTOR_IDS,43,45,47,63]);
const damageRows=new Set(rom.damage.map(row=>row.id));
const damageById=new Map(rom.damage.map(row=>[row.id,row]));
// The seven 8-byte records, including the terminator, were read directly from
// JPN overlay24:021ff082. A mode selects the runtime stat expression; a boss
// definition never selects an execution path.
export const PARTY_PACKED_SPECIAL_RULES=Object.freeze([
  {actionId:67,source:3,minimum:500,maximum:1998},
  {actionId:68,source:3,minimum:500,maximum:1998},
  {actionId:74,source:3,minimum:500,maximum:1998},
  {actionId:102,source:4,minimum:300,maximum:999},
  {actionId:114,source:4,minimum:250,maximum:600},
  {actionId:144,source:5,minimum:500,maximum:1998}
].map(Object.freeze));
const packedSpecialById=new Map(PARTY_PACKED_SPECIAL_RULES.map(row=>[row.actionId,row]));
const maxAction=Math.max(...rom.actions.map(action=>action.id));
const dispelColumns=decodedDispelColumns(dispelMask);
const actorDomains=extendedInputContract().fieldDomains.actors.slice(0,33).map((rule,i)=>{
  const result={...rule,name:ACTOR_FIELDS[i]};delete result.values;
  if(result.name==='id'){result.min=0;result.max=255;}
  if(result.name==='level')result.max=127;
  if(result.name==='defend')result.max=255;
  return result;
});
const auxDomains=COMMON_AUX_FIELDS.map(name=>({name,min:name==='angerTarget'?-32768:0,max:name==='angerTarget'?32767:name==='coupReady'||name==='anger'?1:name==='coupDuration'?15:name.endsWith('Recovery')?4:255,integer:true}));
const statusDomains=COMMON_STATUS_FIELDS.map(name=>({name,min:0,max:name==='poisonKind'?3:name.endsWith('Recovery')?4:255,integer:true}));
const preparationDomains=COMMON_PREPARATION_FIELDS.map(name=>({name,min:name==='appealTarget'?-32768:0,max:name==='appealTarget'?32767:name==='appealMode'?3:name==='skipKind'?15:1,integer:true}));
const configDomains=extendedInputContract().fieldDomains.config;

export const COMMON_ACTION_RULES=Object.freeze(rom.actions.map(action=>{
  const bytes=Buffer.from(action.raw,'hex'),rule=decodeBossActionRule(action.id),word14=bytes.readUInt32LE(20),word1c=bytes.readUInt32LE(28),word2c=bytes.readUInt32LE(44),magicMinimum=action.w04>>>12&1023,magicMaximum=action.w04>>>22&1023,chanceMinimum=word14>>>7&127,chanceMaximum=word14>>>14&127;
  const magicSource=action.w10&0x4000?1:action.w10&0x8000?2:0,packed=damageById.get(action.damageId),special=packedSpecialById.get(action.id),packedSource=rule.accuracyMode===2?(special?.source??magicSource):0,packedMinimum=special?.minimum??magicMinimum,packedMaximum=special?.maximum??magicMaximum;
  let family=0,reason='operation';
  if(rule.operation===1&&supportedSelectors.has(action.selector)&&action.selector!==47&&[0,1,2,4,7,8,9,10,11,12,13,14,18].includes(rule.additional)){family=1;reason=null;}
  if(rule.operation===2&&action.selector===0&&rule.additional===0){family=2;reason=null;}
  if([3,4,5].includes(rule.operation)&&action.selector===0&&[0,8,17].includes(rule.additional)&&rule.parameter!==0&&Math.abs(rule.parameter)<=2){family=3;reason=null;}
  if(rule.operation===8&&action.selector===0&&rule.additional===0){family=4;reason=null;}
  if(rule.operation===10&&action.selector===0&&rule.additional===1){family=5;reason=null;}
  if(rule.operation===15&&action.selector===0&&rule.additional===0&&rule.parameter===1){family=6;reason=null;}
  if(rule.operation===24&&action.selector===0&&rule.additional===0){family=7;reason=null;}
  if(rule.operation===28&&action.selector===47&&rule.additional===0){family=8;reason=null;}
  if(rule.operation===49&&action.selector===0&&rule.additional===0){family=9;reason=null;}
  if(rule.operation===26&&action.selector===0&&rule.additional===0){family=11;reason=null;}
  if([9,20,27].includes(rule.operation)&&action.selector===0&&rule.additional===0){family=12;reason=null;}
  if(rule.operation===21&&action.selector===0&&rule.additional===0){family=13;reason=null;}
  if(rule.operation===19&&action.selector===0&&rule.additional===0&&rule.parameter>=0&&rule.parameter<=7){family=14;reason=null;}
  if([22,23].includes(rule.operation)&&action.selector===0&&rule.additional===0&&rule.parameter!==0&&Math.abs(rule.parameter)<=2){family=15;reason=null;}
  if(((rule.operation===46&&rule.parameter>=1&&rule.parameter<=5)||[16,31,61,62,64,65].includes(rule.operation))&&action.selector===0&&rule.additional===0){family=16;reason=null;}
  if([11,12].includes(rule.operation)&&action.selector===0&&rule.additional===0){family=17;reason=null;}
  if([6,7].includes(rule.operation)&&action.selector===0&&rule.additional===0){family=18;reason=null;}
  if([25,37].includes(rule.operation)&&action.selector===0&&rule.additional===0){family=19;reason=null;}
  if(rule.operation===66&&action.selector===0&&rule.additional===0){family=20;reason=null;}
  // This is the no-effect event body, not the planning effects of defend,
  // reflection or other operation0 commands with independent flags.
  if(rule.operation===0&&[0,47].includes(action.selector)&&rule.additional===0&&(action.w10&~0x1000000)===0&&[1,8].includes(bytes.readUInt32LE(20)>>>28)){family=10;reason=null;}
  if(action.damageId&&!damageRows.has(action.damageId)){family=0;reason='damage-table';}
  if(rule.additional===4&&![0,1].includes(rule.secondaryParameter)){family=0;reason='poison-subtype';}
  const afterAction=word2c>>>10&15;
  if(![0,1,2,4].includes(afterAction)&&!(afterAction===3&&[148,175].includes(action.id))){family=0;reason='after-action-handler';}
  if([97,121].includes(action.id)){family=0;reason='command-specific-target-handler';}
  return Object.freeze({...rule,...decodeMetalRuleFields(action),...decodeWeaponPostprocessRules(action),damageId:action.damageId,selector:action.selector,damageCap:word1c&0x3fff,
    forcedCritical:action.w08>>>29&1,repeatCode:word1c>>>14&31,category:word1c>>>19&31,
    effectElement:action.w18>>>27&31,tensionFlag:Number(!!(action.w10&0x2000)),equipmentFlag:Number(!!(action.w10&0x40000)),prepaidMP:action.w08>>>28&1,
    magicBarrierFlag:action.w10&1,breathBarrierFlag:action.w10>>>2&1,weaponRepeatFlag:Number(!!(action.w10&0x100000)),targetDecayFlag:Number(!!(action.w10&0x20000)),forceExcluded:Number([505,517].includes(action.id)),
    magicSource,magicMinimum,magicMaximum,chanceMinimum,chanceMaximum,accuracySlope:magicMinimum===magicMaximum?0:Math.fround((chanceMaximum-chanceMinimum)/(magicMaximum-magicMinimum)),
    packedSource,packedMinimum,packedMaximum,packedBaseLow:packed?.base1??0,packedBaseHigh:packed?.base2??0,packedWidth:packed?.width??0,packedSlope:packedMinimum===packedMaximum?0:Math.fround(((packed?.base2??0)-(packed?.base1??0))/(packedMaximum-packedMinimum)),
    attackCriticalFormula:Number([1,219,505].includes(action.id)),criticalDamageSuppressed:Number([72,112].includes(action.id)),
    coupBonus:word2c>>>20&127,afterAction:word2c>>>10&15,planningCategory:action.w18>>>12&15,targetSide:action.w08>>>8&3,targetScope:bytes.readUInt32LE(20)>>>28,
    // Original additional1 explicitly treats this row as a plain chance.
    // It is action data, never a boss-specific execution path.
    additionalPlainChance:Number(action.id===569),additionalDefenseIgnoreResistance:Number(action.id===173),additionalParalysisSpecies:Number(action.id===82)*9,additionalParalysisMetalChance:Number(action.id===88),selfEscape:Number([225,917].includes(action.id)),forcedCriticalBonus:Number(action.id===505),restoreMPFull:Number([411,558].includes(action.id)),restoreHPFull:Number([33,784].includes(action.id)),primaryRecoveryEvent:Number([900,901,938].includes(action.id)),family,supported:family>0,unsupportedReason:reason});
}));
export const COMMON_SUPPORTED_ACTION_IDS=Object.freeze(COMMON_ACTION_RULES.filter(rule=>rule.supported).map(rule=>rule.id));
const arithmeticRules=COMMON_ACTION_RULES.map(rule=>{const row={...rule};delete row.unsupportedReason;row.supported=Number(row.supported);return row;});
const rules=arithmeticRules.filter(rule=>rule.supported);
const byId=new Map(COMMON_ACTION_RULES.map(rule=>[rule.id,rule]));
const lookup=(g,actionId,key)=>g.op('Gather',[g.constant(Array.from({length:maxAction+1},(_,id)=>Number(byId.get(id)?.[key]??0)),'float32',[maxAction+1]),g.cast(g.min(maxAction,g.max(0,actionId)),'int32')],{axis:0},{shape:['N',1]});
const actionSupported=(g,id)=>g.and(g.ge(id,0),g.le(id,maxAction),g.eq(id,g.floor(id)),g.gt(lookup(g,id,'family'),0));
const actor=(g,input)=>object(ACTOR_FIELDS,g.split(input,33));
const aux=(g,input)=>object(COMMON_AUX_FIELDS,g.split(input,21));
const blocked=(g,a)=>g.or(g.le(a.hp,0),...['sleep','paralysis','confusion','skip'].map(key=>g.gt(a[key],0)));
const flagDomain={values:[false,true,0,1]};
const byteDomain={min:0,max:255,integer:true};
const defaultActor=()=>actorDomains.map(rule=>rule.name==='maxHp'?1:0);

function commonContract(scope){
  return {inputContractVersion:1,scope,scopeJa:scope,actorFields:ACTOR_FIELDS,auxFields:COMMON_AUX_FIELDS,statusFields:COMMON_STATUS_FIELDS,configFields:COMMON_CONFIG_FIELDS,tensionFields:COMMON_TENSION_FIELDS,preparationFields:COMMON_PREPARATION_FIELDS,historyFields:COMMON_HISTORY_FIELDS,magicFields:COMMON_MAGIC_FIELDS,packedScaleFields:COMMON_PACKED_SCALE_FIELDS,rawState:COMMON_RAW_STATE_ABI,
    inputDomains:{seed:{...byteDomain,width:8},position:{min:1,max:2147483000,integer:true},actionId:{min:0,max:maxAction,integer:true},enabled:flagDomain},fieldDomains:{},defaults:{seed:[1,0,0,0,0,0,0,0],position:1,actionId:1,enabled:true},feedback:{},
    authority:{romSHA256:rom.romSha256,caller:'JPN021ebd9c / matching func_ov024_021eb5d0',representation:'Shared action columns and reusable numeric operations; no boss ID or battle program is selected.'}};
}
function input(g,name,width=1,dtype='float32',domain,defaults){
  const result=g.input(name,['N',width],dtype);
  if(Array.isArray(domain))g.contract.fieldDomains[name]=domain;
  else if(domain)g.contract.inputDomains[name]={...domain,width};
  if(defaults!==undefined)g.contract.defaults[name]=defaults;
  return result;
}
function inputActor(g,name){return input(g,name,33,'float32',actorDomains,defaultActor());}
function inputAux(g,name){return input(g,name,21,'float32',auxDomains,commonAuxDefault());}
function inputStatus(g,name){return input(g,name,7,'float32',statusDomains,Array(7).fill(0));}
function inputConfig(g,name){return input(g,name,7,'float32',configDomains,[1,0,0,0,2,4,0]);}
function inputTension(g,name){return input(g,name,3,'float32',COMMON_TENSION_FIELDS.map(field=>({name:field,min:0,max:field==='stage'?255:1,integer:true})),[0,0,0]);}
const rawBit=(g,bytes,bit)=>{const q=g.floor(g.mul(bytes[bit>>>3],2**-(bit&7)));return g.sub(q,g.mul(g.floor(g.mul(q,.5)),2));};
const rawMask=(g,bytes,mask)=>bytes.map((byte,i)=>{let value=g.constant(0);for(let bit=0;bit<8;bit++)if(mask[i]&(1<<bit))value=g.add(value,g.mul(rawBit(g,[byte],bit),2**bit));return value;});
const rawOverlay=(g,bytes,bit,value)=>{const index=bit>>>3,mask=2**(bit&7);bytes[index]=g.add(g.sub(bytes[index],g.mul(rawBit(g,bytes,bit),mask)),g.mul(value,mask));};
function inputRawModifiers(g){
  const result={};
  for(const name of['sourceRawFlagsBytes','targetRawStatusBytes','targetRawFlagsBytes'])result[name]=g.split(input(g,name,4,'float32',byteDomain,[0,0,0,0]),4);
  result.sourceStatusKindsBytes=g.split(input(g,'sourceStatusKindsBytes',2,'float32',byteDomain,[0,0]),2);
  result.targetRawRanks=g.split(input(g,'targetRawRanks',10,'float32',COMMON_RAW_RANK_FIELDS.map(name=>({name,min:-4,max:3,integer:true})),Array(10).fill(0)),10);
  result.sourceSpecies=input(g,'sourceSpecies',1,'float32',{min:0,max:15,integer:true},0);
  return result;
}

// JPN021e7328 / matching021e6a90: the candidates from weapon and Force are
// compared, then species, shields and the two independent barriers multiply
// in this order. Every node is binary32, including each dual-element candidate.
export function commonRawDamageModifiers(g,value,r,{partySource,weapon,weaponSpeciesTenths,weaponSpeciesProvided,elements,rawElements,sourceRawFlagsBytes,sourceStatusKindsBytes,targetRawStatusBytes,targetRawFlagsBytes,targetRawRanks,sourceSpecies}){
  const eligible=g.and(partySource,g.gt(r.equipmentFlag,0)),element=g.where(g.gt(weapon[0],0),weapon[1],0);let byte=g.constant(100);
  for(let i=0;i<7;i++)byte=g.where(g.eq(element,i+1),elements[i],byte);
  // The weapon path calls the resolved resistance getter. The Force path
  // instead reads the seven raw bytes directly (matching021e6a90), so a
  // matching defensive Force must not reduce this second candidate again.
  const fraction=resistanceFraction(g,byte),elemental=g.and(eligible,g.ge(element,1),g.le(element,7)),weaponCandidate=g.where(elemental,g.mul(value,fraction),0),forceFlag=g.gt(rawBit(g,sourceRawFlagsBytes,7),0),kind=g.add(g.add(rawBit(g,sourceStatusKindsBytes,9),g.mul(rawBit(g,sourceStatusKindsBytes,10),2)),g.mul(rawBit(g,sourceStatusKindsBytes,11),4)),forceEligible=g.and(g.eq(r.damageElement,8),g.eq(r.forceExcluded,0),forceFlag),boost=g.mul(Math.fround(1.1),value),candidates=rawElements.map(byte=>g.mul(boost,resistanceFraction(g,byte)));
  let forceCandidate=g.constant(0);for(const [id,candidate]of[[1,candidates[0]],[2,candidates[1]],[3,g.max(candidates[2],candidates[3])],[4,g.max(candidates[4],candidates[5])],[5,candidates[6]]])forceCandidate=g.where(g.eq(kind,id),candidate,forceCandidate);
  forceCandidate=g.where(forceEligible,forceCandidate,0);
  let damage=g.where(g.or(elemental,forceEligible),g.max(weaponCandidate,forceCandidate),value);
  damage=commonWeaponSpeciesDamage(g,damage,{eligible,weapon,tenths:weaponSpeciesTenths,provided:weaponSpeciesProvided});
  for(const [bit,damageElement]of[[1,1],[2,2]])damage=g.where(g.and(g.gt(rawBit(g,targetRawFlagsBytes,bit),0),g.eq(r.damageElement,damageElement)),g.mul(.75,damage),damage);
  damage=g.where(g.and(g.gt(rawBit(g,targetRawStatusBytes,29),0),g.eq(sourceSpecies,8)),g.mul(.5,damage),damage);
  damage=g.where(g.and(g.gt(r.magicBarrierFlag,0),g.gt(rawBit(g,targetRawStatusBytes,16),0),g.not(g.eq(r.operation,2))),g.mul(damage,g.add(1,g.mul(-.25,targetRawRanks[6]))),damage);
  damage=g.where(g.and(g.gt(r.breathBarrierFlag,0),g.gt(rawBit(g,targetRawStatusBytes,17),0)),g.mul(damage,g.add(1,g.mul(-.25,targetRawRanks[7]))),damage);
  return{damage,minimumAllowed:g.and(g.or(g.not(partySource),g.gt(fraction,0)),g.not(g.eq(r.selector,45)))};
}
function clearLifecycle(g,old,a,gate){const dead=g.and(gate,g.le(a.hp,0)),next={...old};for(const key of COMMON_AUX_FIELDS)if(!['coupSkip','angerTarget'].includes(key))next[key]=g.where(dead,0,next[key]);return next;}
function coup(g,rng,a,state,{gate,chance,chargedPartyCount,blockedByBattle}){
  const eligible=coupEligibility(g,{gate,skip:state.coupSkip,level:a.level,blocked:blocked(g,a),ready:state.coupReady});state.coupSkip=eligible.skip;
  const roll=rng.bounded(eligible.eligible,100),multiplier=g.add(g.min(chargedPartyCount,3),1),threshold=g.where(blockedByBattle,0,g.floor(g.mul(multiplier,chance))),charged=g.and(eligible.eligible,g.lt(roll,threshold));
  state.coupReady=g.where(charged,1,state.coupReady);state.coupDuration=g.where(charged,coupLevelDuration(g,a.level),state.coupDuration);return charged;
}

export function commonAccuracyThreshold(g,rng,r,{partySource,active,critical,statusResistance,magic}){
  const mode=g.eq(r.accuracyMode,1),value=g.where(g.eq(r.magicSource,1),magic[0],magic[1]),scaled=g.mul(g.sub(value,r.magicMinimum),r.accuracySlope),integer=g.where(g.lt(scaled,0),g.sub(0,g.floor(g.sub(0,scaled))),g.floor(scaled)),interpolated=g.add(r.chanceMinimum,integer),byMagic=g.where(g.le(value,r.magicMinimum),r.chanceMinimum,g.where(g.ge(value,r.magicMaximum),r.chanceMaximum,interpolated)),ranged=g.floor(rng.range(g.and(active,partySource,mode,g.eq(r.magicSource,0)),r.chanceMinimum,r.chanceMaximum)),base=g.where(partySource,g.where(g.gt(r.magicSource,0),byMagic,ranged),r.baseChance),guaranteed=g.and(mode,g.gt(statusResistance,0),critical);
  return{threshold:g.where(g.or(g.not(mode),guaranteed),100,g.floor(g.add(.5,g.mul(base,resistanceFraction(g,statusResistance))))),skipBlind:guaranteed};
}

export function partyPackedDamage(g,rng,r,magic,scale,enabled){
  const stat=g.where(g.eq(r.packedSource,1),magic[0],g.where(g.eq(r.packedSource,2),magic[1],g.where(g.eq(r.packedSource,3),g.add(scale[0],magic[0]),g.where(g.eq(r.packedSource,4),scale[0],g.add(scale[0],scale[1]))))),interpolated=g.add(r.packedBaseLow,g.floor(g.mul(g.sub(stat,r.packedMinimum),r.packedSlope))),byStat=g.where(g.le(stat,r.packedMinimum),r.packedBaseLow,g.where(g.ge(stat,r.packedMaximum),r.packedBaseHigh,interpolated)),ranged=rng.range(g.and(enabled,g.eq(r.packedSource,0)),r.packedBaseLow,r.packedBaseHigh),base=g.where(g.gt(r.packedSource,0),byStat,ranged),spread=rng.range(enabled,g.sub(0,r.packedWidth),r.packedWidth);
  // All mined base1/base2 >= width. The original signed truncation is Floor
  // on this complete table, including the interpolated interior.
  return g.where(enabled,g.floor(g.add(base,spread)),0);
}

export function commonTensionDamage(g,r,hit,base,{stage,low,high,partySource,level}){
  const boost=g.and(hit,g.gt(r.tensionFlag,0),g.or(asBool(g,low),asBool(g,high)),g.or(g.eq(r.criticalDamageSuppressed,0),g.gt(base,0)));
  return g.where(boost,g.add(g.mul(base,tensionCoefficient(g,stage,scalar(g,g.not(partySource)))),tensionBonus(g,stage,level)),base);
}

export function commonCriticalDamage(g,rng,r,gate,raw,{preCritical,baseAttack}){
  const normal=g.gt(r.attackCriticalFormula,0),base=g.where(normal,baseAttack,raw),signed=g.where(g.ge(base,32768),g.sub(base,65536),base),range=rng.range(gate,g.where(normal,Math.fround(.95),1.5),g.where(normal,Math.fround(1.05),2)),boosted=g.max(g.max(g.mul(preCritical,Math.fround(1.2)),g.mul(signed,range)),g.where(normal,raw,0));
  return g.where(gate,boosted,preCritical);
}

// Testable helper boundary. It shares the exact expression used by the action
// graph, while the independent result and RNG state come from actual ARM.
// This is generated in memory by verification; it is not a battle module.
export function buildCommonAccuracyBoundary(){
  const g=new Graph('rom-common-accuracy-boundary',commonContract('Original accuracy helper boundary, excluding metal/barrier/equipment special effects.'));
  const seed=input(g,'seed',8),position=input(g,'position',1,'int32'),action=input(g,'actionId'),enabled=input(g,'enabled',1,'bool'),party=input(g,'partySource',1,'bool',flagDomain,true),critical=input(g,'critical',1,'bool',flagDomain,false),guaranteed=input(g,'guaranteed',1,'bool',flagDomain,false),blind=input(g,'blind',1,'float32',{min:0,max:1,integer:true},0),resistance=input(g,'resistance',1,'float32',byteDomain,100),magic=g.split(input(g,'sourceMagic',2,'float32',{min:0,max:1023,integer:true},[0,0]),2),r=bossRuleColumns(g,action,arithmeticRules),rng=new RandomGraph(g,seed,position),active=g.and(enabled,g.not(guaranteed)),roll=rng.bounded(active,100),accuracy=commonAccuracyThreshold(g,rng,r,{partySource:party,active,critical,statusResistance:resistance,magic}),blindGate=g.and(active,g.gt(r.blind,0),g.gt(blind,0),g.not(accuracy.skipBlind)),blindMiss=g.and(blindGate,g.lt(rng.bounded(blindGate,8),5)),passed=g.and(enabled,g.or(guaranteed,g.and(g.lt(roll,accuracy.threshold),g.not(blindMiss))));
  for(const[name,value]of Object.entries({nextSeed:rng.seed,nextPosition:rng.position,consumed:g.sub(rng.position,position),passed:scalar(g,passed),threshold:accuracy.threshold}))g.output(value,name);return g;
}

export function buildCommonPartyPackedBoundary(){
  const g=new Graph('rom-common-party-packed-boundary',commonContract('Party GetAttackBaseDamage packed-record boundary with the ordinary physical fallback for a NULL damage record. Attack is already selected from base/current stats and the caller factor is 1.'));
  const seed=input(g,'seed',8),position=input(g,'position',1,'int32'),action=input(g,'actionId'),enabled=input(g,'enabled',1,'bool'),magic=g.split(input(g,'sourceMagic',2,'float32',{min:0,max:1023,integer:true},[0,0]),2),scale=g.split(input(g,'sourcePackedScale',2,'float32',{min:0,max:1023,integer:true},[0,0]),2),attack=input(g,'attack',1,'float32',{min:0,max:65535,integer:true},82),defense=input(g,'defense',1,'float32',{min:0,max:65535,integer:true},68),r=bossRuleColumns(g,action,arithmeticRules),rng=new RandomGraph(g,seed,position),supported=g.eq(r.id,action),packed=g.gt(r.damageId,0),p=physical(g,rng.seed,rng.position,attack,defense,g.and(enabled,supported,g.not(packed)));rng.seed=p.seed;rng.position=p.position;
  const fixed=partyPackedDamage(g,rng,r,magic,scale,g.and(enabled,supported,packed)),damage=g.where(packed,fixed,p.damage);
  for(const[name,value]of Object.entries({nextSeed:rng.seed,nextPosition:rng.position,consumed:g.sub(rng.position,position),damage,supported:scalar(g,supported)}))g.output(value,name);return g;
}

export function buildCommonPostprocessBoundary(){
  const g=new Graph('rom-common-positive-postprocess-boundary',commonContract('Damage postprocess with original elemental resistance, Force, shields and magic/breath barriers. Defend0, fresh combo, ordinary nonmetal target and no equipment proc effects.'));
  const seed=input(g,'seed',8),position=input(g,'position',1,'int32'),action=input(g,'actionId'),enabled=input(g,'enabled',1,'bool'),critical=input(g,'critical',1,'bool',flagDomain,false),raw=input(g,'rawBase',1,'float32',{min:0,max:65535,integer:true},20),attack=input(g,'baseAttack',1,'float32',{min:0,max:65535,integer:true},82),level=input(g,'level',1,'float32',{min:0,max:127,integer:true},20),party=input(g,'partySource',1,'bool',flagDomain,true),tension=object(COMMON_TENSION_FIELDS,g.split(inputTension(g,'sourceTension'),3)),rawResistances=g.split(input(g,'resistances',22,'float32',byteDomain,Array(22).fill(100)),22),rawModifiers=inputRawModifiers(g),targetKinds=g.split(input(g,'targetStatusKindsBytes',2,'float32',byteDomain,[0,0]),2),resistances=commonEffectResistancePercentages(g,{rawResistances,rawFlagsBytes:rawModifiers.targetRawFlagsBytes,statusKindsBytes:targetKinds,present:g.eq(0,0)}),r=bossRuleColumns(g,action,arithmeticRules),rng=new RandomGraph(g,seed,position),before=commonTensionDamage(g,r,enabled,raw,{...tension,partySource:party,level}),gate=g.and(enabled,critical,g.or(g.eq(r.forcedCritical,0),g.gt(r.forcedCriticalBonus,0)),g.eq(r.criticalDamageSuppressed,0)),value=commonCriticalDamage(g,rng,r,gate,raw,{preCritical:before,baseAttack:attack});
  const elementByte=resistances.reduce((value,byte,i)=>g.where(g.eq(r.damageElement,i+1),byte,value),g.constant(100)),damageResistance=resistanceFraction(g,elementByte),modified=commonRawDamageModifiers(g,g.mul(value,damageResistance),r,{partySource:party,weapon:[g.constant(0),g.constant(0),g.constant(10),g.constant(0)],elements:resistances.slice(0,7),rawElements:rawResistances.slice(0,7),...rawModifiers}),zeroGate=g.and(enabled,g.le(modified.damage,0),g.gt(damageResistance,0),modified.minimumAllowed),positive=g.where(zeroGate,rng.bounded(zeroGate,2),modified.damage),damage=g.where(g.gt(r.damageCap,0),g.min(g.floor(positive),r.damageCap),g.floor(positive));
  g.contract.fieldDomains.sourceTension[0].values=[...COMMON_TENSION_NUMERIC_STAGES];
  for(const[name,value]of Object.entries({nextSeed:rng.seed,nextPosition:rng.position,consumed:g.sub(rng.position,position),damage}))g.output(value,name);return g;
}

export function buildCommonCommandBegin(){
  const g=new Graph('rom-common-command-begin',commonContract('命令単位の実行対象再構成・MP支払・事前会心。入力定義だけで同じグラフを使用します。'));
  const seed=input(g,'seed',8),position=input(g,'position',1,'int32'),sourceInput=inputActor(g,'sourceActor'),source=actor(g,sourceInput),action=input(g,'actionId'),enabled=input(g,'enabled',1,'bool'),targetsInput=input(g,'targets',8,'float32',{min:-1,max:255,integer:true},Array(8).fill(-1)),count=input(g,'targetCount',1,'float32',{min:0,max:8,integer:true},1),already=input(g,'targetsAlreadyRepeated',1,'bool',flagDomain,false);
  const discount=input(g,'mpDiscount',1,'bool',flagDomain,false),protectedMp=input(g,'mpProtected',1,'bool',flagDomain,false),known=actionSupported(g,action),party=asBool(g,source.party),stateSupported=g.or(g.not(party),g.not(g.eq(lookup(g,action,'planningCategory'),3))),cost=lookup(g,action,'mpCost'),payment=g.where(g.and(party,discount),g.floor(g.add(g.mul(cost,.75),.75)),cost),prepaid=g.gt(lookup(g,action,'prepaidMP'),0),affordable=g.or(prepaid,protectedMp,g.and(g.not(party),g.ge(source.mp,255)),g.and(g.ge(cost,255),g.gt(source.mp,0)),g.and(g.lt(cost,255),g.ge(source.mp,payment))),preSupported=g.and(known,affordable,stateSupported),preEntered=g.and(enabled,preSupported,g.gt(source.hp,0)),rng=new RandomGraph(g,seed,position),rebuild=g.and(preEntered,g.not(already));
  const first=g.add(rng.bounded(rebuild,2),3),second=g.add(rng.bounded(rebuild,3),6),repeat=lookup(g,action,'repeatCode'),table=[0,0,0,first,2,4,0,7,3,0,1,second];
  let requested=g.constant(0);for(let i=0;i<table.length;i++)requested=g.where(g.eq(repeat,i),table[i],requested);
  const rows=g.split(targetsInput,8),out=[...rows];
  for(let i=0;i<8;i++){
    const take=g.and(rebuild,g.gt(requested,i),g.gt(count,0)),index=rng.bounded(take,g.max(count,1));let selected=rows[0];for(let j=1;j<8;j++)selected=g.where(g.eq(index,j),rows[j],selected);
    out[i]=g.where(g.and(rebuild,g.gt(requested,0)),g.where(g.gt(requested,i),g.where(g.gt(count,0),selected,-1),g.where(g.gt(count,i),0,rows[i])),rows[i]);
  }
  const selectedCount=g.where(g.and(rebuild,g.gt(requested,0)),requested,count),baseRate=input(g,'sourceCriticalBaseRate',1,'float32',{min:-1,max:100},-1),wide=input(g,'sourceWideWeapon',1,'bool',flagDomain,false),doubleHit=input(g,'sourceDoubleHitWeapon',1,'bool',flagDomain,false),extraSkill=input(g,'sourceExtraHitSkill',1,'bool',flagDomain,false),job=input(g,'sourceJob',1,'float32',{min:0,max:12,integer:true},0);
  const expanded=expandCommonCommandTargets(g,rng,{enabled:preEntered,repeatCode:repeat,actionId:action,weaponRepeatFlag:g.gt(lookup(g,action,'weaponRepeatFlag'),0),party,wideWeapon:wide,doubleHitWeapon:doubleHit,extraHitSkill:extraSkill,job,targets:out,count:selectedCount}),finalCount=expanded.targetCount,supported=g.and(preSupported,expanded.capacity),entered=g.and(preEntered,expanded.capacity);
  source.mp=g.where(g.and(entered,g.not(prepaid),g.not(protectedMp),g.or(party,g.lt(source.mp,255))),g.where(g.ge(cost,255),0,g.sub(source.mp,payment)),source.mp);
  const mode=g.or(g.gt(lookup(g,action,'preCritical'),0),g.and(party,g.eq(action,1),wide)),pre=g.and(entered,mode),forced=g.gt(lookup(g,action,'forcedCritical'),0),roll=rng.bounded(g.and(pre,g.not(forced)),10000),threshold=commonCriticalThreshold(g,{baseThreshold:source.criticalThreshold,baseRate,weight:lookup(g,action,'criticalWeight'),hitCount:finalCount}),critical=g.and(pre,g.or(forced,g.lt(roll,threshold)));
  const output={nextSeed:rng.seed,nextPosition:rng.position,nextSourceActor:pack(g,ACTOR_FIELDS,source),nextTargets:g.cat(expanded.targets),nextTargetCount:finalCount,commandCritical:critical,commandCriticalMode:mode,suppressRepeatedCombo:expanded.suppressRepeatedCombo,extraHit:expanded.extraHit,entered:scalar(g,entered),supported:scalar(g,supported),mpAffordable:scalar(g,affordable),reason:g.where(known,g.where(stateSupported,g.where(affordable,g.where(expanded.capacity,0,4),2),3),1),consumed:g.sub(rng.position,position)};
  for(const[name,value]of Object.entries(output))g.output(value,name);
  g.contract.targetBoundary='Default-target callbacks may already perform both repeat-table draws and repeated sampling; targetsAlreadyRepeated preserves that result and avoids consuming them again. Otherwise these two draws occur even for repeatCode0. A distinct original post-selection helper expands repeatCode1/2/6/9 and resolved weapon/skill repetitions into the32-slot execution list. Critical probability uses this complete count. Word08 bit28 means planning already handled MP; cost255 otherwise consumes all current MP.';
  g.contract.failureReasons={1:'Unknown action or unimplemented common effect',2:'MP不足の504への置換を準備段階で行う必要があります',3:'Party item-use category3 requires the original inventory/action-work caller state, which is not yet represented.',4:'Expanded command target count exceeds the original32-slot buffer.'};
  return g;
}

function buildTargetKernel(){
  let weaponAlwaysOneApplied,weaponClearGuard,additionalAilmentApplied,additionalMagicBarrier,targetRawTimers;
  let sa,ta,sc,tc,sourceTension,targetTension,sourcePreparation,targetPreparation,targetPresent,targetMetal,targetKinds,sourceMagic,sourcePackedScale,sourceWeapon,sourceWideWeapon,hitIndex,rawModifiers,chargedCount,coupBlocked,scenarioMode,selectedCritical,raiseResult,transferred,recovered,mpRecovered,escaped,dispelApplied,blindApplied,clearBladeDefenseFlag,routingResolved,allowTension,criticalAlreadyDrawn,suppliedCritical,resetCombo,skipComboUpdate,isCounter,originalAction,sourceCriticalBaseRate,criticalHitCount,selectorScratchWritten,selectorScratch,populationInsertionPossible,populationInserted,populationSeed,populationPosition,weaponMpDrained;
  return buildBossActionCore({name:'rom-common-target-internal',actionIds:COMMON_SUPPORTED_ACTION_IDS,actionRules:rules,independentActors:true,allowPartyActions:true,gatherTargets:false,checkMp:false,spendMp:false,advanceContext:false,sharedBeforeTargetCheck:true,commandCritical:true,dataDrivenRank:true,exposeHitResults:true,fullPostprocessOnBlocked:true,commandHeaderMetadata:true,
    sharedDraw(g,rng,gate){const already=g.input('sharedAlreadyDrawn',['N',1],'bool'),value=g.input('sharedRoll');return g.where(already,value,rng.bounded(g.and(gate,g.not(already)),100));},
    sourceEligibility(g,r,source){const prepared=g.input('preparedConfusion',['N',1],'bool');allowTension=g.input('allowTension',['N',1],'bool');return g.or(g.and(routingResolved,g.not(allowTension)),g.eq(r.operation,0),g.and(...['sleep','paralysis','skip'].map(k=>g.eq(source[k],0)),g.or(g.eq(source.confusion,0),prepared)));},
    targetEligibility(){return targetPresent;},
    partyAcrobatSupport(g,r,before){routingResolved=g.input('routingResolved',['N',1],'bool');return g.or(routingResolved,g.and(...before.map(a=>g.or(g.eq(a.acrobat,0),g.eq(a.party,0),g.eq(r.operation,49)))));},
    additionalSupport(g,r,{source,target,partySource}){
      sa=aux(g,g.input('sourceAux',['N',21]));ta=aux(g,g.input('targetAux',['N',21]));sc=object(COMMON_CONFIG_FIELDS,g.split(g.input('sourceConfig',['N',7]),7));tc=object(COMMON_CONFIG_FIELDS,g.split(g.input('targetConfig',['N',7]),7));
      sourceTension=object(COMMON_TENSION_FIELDS,g.split(g.input('sourceTension',['N',3]),3));targetTension=object(COMMON_TENSION_FIELDS,g.split(g.input('targetTension',['N',3]),3));
      sourcePreparation=[...g.split(g.input('sourcePreparation',['N',5]),5)];targetPreparation=[...g.split(g.input('targetPreparation',['N',5]),5)];targetPresent=g.input('targetPresent',['N',1],'bool');chargedCount=g.input('chargedPartyCount');coupBlocked=g.input('coupBlocked',['N',1],'bool');
      scenarioMode=commonScenarioMode(g,g.input('scenarioId'));
      sourceMagic=g.split(g.input('sourceMagic',['N',2]),2);sourcePackedScale=g.split(g.input('sourcePackedScale',['N',2]),2);
      rawModifiers=inputRawModifiers(g);const coverResolved=g.input('coverResolved',['N',1],'bool');targetMetal=g.input('targetMetal',['N',1],'bool');targetKinds=g.split(g.input('targetStatusKindsBytes',['N',2]),2);sourceWeapon=g.split(g.input('sourceWeapon',['N',4]),4);
      targetRawTimers=g.split(g.input('targetRawTimers',['N',COMMON_RAW_TIMER_FIELDS.length]),COMMON_RAW_TIMER_FIELDS.length);
      criticalAlreadyDrawn=g.input('criticalAlreadyDrawn',['N',1],'bool');suppliedCritical=g.input('suppliedCritical',['N',1],'bool');resetCombo=g.input('resetCombo',['N',1],'bool');skipComboUpdate=g.input('skipComboUpdate',['N',1],'bool');isCounter=g.input('isCounter',['N',1],'bool');originalAction=g.input('originalActionId');sourceWideWeapon=g.input('sourceWideWeapon',['N',1],'bool');hitIndex=g.input('hitIndex');
      sourceCriticalBaseRate=g.input('sourceCriticalBaseRate');criticalHitCount=g.input('criticalHitCount');
      populationInsertionPossible=g.input('populationInsertionPossible',['N',1],'bool');const populationContext=g.input('populationContextAvailable',['N',1],'bool'),summon=g.or(g.eq(r.operation,11),g.eq(r.operation,12));
      const numericTension=g.and(allowTension,g.gt(r.tensionFlag,0),g.or(g.gt(sourceTension.low,0),g.gt(sourceTension.high,0))),tensionSupported=g.or(g.not(numericTension),commonTensionNumericSupported(g,sourceTension.stage));
      return g.and(tensionSupported,g.or(g.not(summon),g.and(populationContext,g.not(partySource),g.eq(source.id,target.id),g.not(isCounter))),g.or(g.le(target.defend,3),g.and(coverResolved,g.ge(target.defend,6),g.le(target.defend,8)),g.and(routingResolved,g.or(...[4,5,9].map(value=>g.eq(target.defend,value))))),g.or(g.and(routingResolved,g.not(allowTension)),g.eq(sourcePreparation[0],0),g.eq(r.operation,0)),g.or(g.eq(targetTension.high,0),g.and(g.eq(r.operation,1),g.or(...[0,1,2,4,7,8,9,10,11,12,13,14,18].map(value=>g.eq(r.additional,value)))),g.or(...[0,2,3,4,5,6,7,9,11,12,15,16,19,20,21,22,23,24,25,26,27,28,31,37,46,49,61,62,64,65,66].map(value=>g.eq(r.operation,value)))),g.or(g.not(partySource),g.and(g.not(g.eq(r.selector,63)),g.not(g.eq(r.planningCategory,3)))));
    },
    accuracyResistance(g,r,resistance){return resistance[2];},
    // matching02156118/02156270 zero the ordinary rate in scenario mode;
    // the enclosing guard/dodge callers still make their usual draws.
    // Acrobat's separate shared-roll path bypasses this getter unchanged.
    dodgeRate(g,value){return g.where(g.gt(scenarioMode,0),0,value);},
    guardRate(g,value){return g.where(g.gt(scenarioMode,0),0,value);},
    guardEligibility(g,r,{partySource}){weaponClearGuard=g.input('sourceWeaponClearGuard',['N',1],'bool');return g.not(commonWeaponClearsGuard(g,r,{partySource,weaponClearGuard}));},
    // JPN02157dc8 / matching02156648 returns before the accuracy draw.
    accuracyEligibility(g,r){return g.or(g.not(targetMetal),g.gt(r.metalDamageFlag,0));},
    accuracyThreshold(g,rng,r,{source,partySource,active,critical,statusResistance}){
      return commonAccuracyThreshold(g,rng,r,{partySource,active,critical,statusResistance,magic:sourceMagic});
    },
    criticalCheck(g,rng,r,gate,{source}){const check=g.and(gate,g.not(criticalAlreadyDrawn)),forced=g.gt(r.forcedCritical,0),roll=rng.bounded(g.and(check,g.not(forced)),10000),threshold=commonCriticalThreshold(g,{baseThreshold:source.criticalThreshold,baseRate:sourceCriticalBaseRate,weight:r.criticalWeight,hitCount:criticalHitCount});return g.and(check,g.or(forced,g.lt(roll,threshold)));},
    finalCritical(g,active,normal){return g.and(active,g.or(g.and(criticalAlreadyDrawn,suppliedCritical),g.and(g.not(criticalAlreadyDrawn),normal)));},
    comboUpdateGate(g,active){return g.and(active,g.not(resetCombo),g.not(skipComboUpdate));},
    criticalDamageGate(g,r,gate){return g.and(gate,g.or(g.eq(r.forcedCritical,0),g.gt(r.forcedCriticalBonus,0)),g.eq(r.criticalDamageSuppressed,0));},
    criticalDamage(g,rng,r,gate,raw,{preCritical,source}){
      const criticalRule={...r,attackCriticalFormula:g.where(g.and(g.gt(source.party,0),sourceWideWeapon),0,r.attackCriticalFormula)};
      return commonCriticalDamage(g,rng,criticalRule,gate,raw,{preCritical,baseAttack:source.baseAttack});
    },
    baseDamage(g,rng,r,hit,{attack,defense,source,target,partySource}){
      const packed=g.gt(r.damageId,0),p=physical(g,rng.seed,rng.position,attack,defense,g.and(hit,g.not(packed)));rng.seed=p.seed;rng.position=p.position;
      const fixed=enemyPackedDamage(g,rng,r.damageId,g.and(hit,packed,g.not(partySource))),party=partyPackedDamage(g,rng,r,sourceMagic,sourcePackedScale,g.and(hit,packed,partySource)),base=g.where(packed,g.where(partySource,party,fixed.damage),p.damage);
      const columns=columnSelectorDamage(g,rng,r.selector,base,source.baseAttack,source.level,g.and(hit,g.not(packed))).damage,state=commonStateSelectorDamage(g,r.selector,base,{targetParty:target.party,targetSpecies:sourceWeapon[3],targetMetal,targetStatusBytes:rawModifiers.targetRawStatusBytes,targetKindsBytes:targetKinds}),command=commonCommandSelectorDamage(g,{selector:r.selector,fallback:base,sourceHp:source.hp,targetHp:target.hp,targetCount:criticalHitCount,sourcePresent:g.gt(source.hp,0),targetPresent,enabled:hit,priorScratch:g.constant(0)}),selected=g.where(command.supported,command.damage,g.where(state.supported,state.damage,columns));
      selectorScratchWritten=command.scratchWritten;selectorScratch=command.nextScratch;
      const levelSelected=commonLevelSelectorDamage(g,rng,{selector:r.selector,level:source.level,fallback:selected,enabled:hit,levelAvailable:g.constant(true,'bool')});
      const vacuum=levelScaledSelectorDamage(g,rng,source.level,g.and(hit,g.eq(r.selector,43)));
      const criticalChoice=rng.bounded(g.and(hit,g.eq(r.selector,45)),2),criticalGate=g.and(hit,g.eq(r.selector,45),g.eq(criticalChoice,0)),criticalRange=rng.range(criticalGate,Math.fround(.95),Math.fround(1.05));
      selectedCritical=g.where(criticalGate,g.floor(g.mul(source.baseAttack,criticalRange)),0);
      // Selector63 is the exact enemy level branch at USA021da248. The
      // physical fallback above is still evaluated before these two draws.
      const burstGate=g.and(hit,g.eq(r.selector,63)),burstLevel=g.mul(g.mul(6,source.level),rng.range(burstGate,Math.fround(.9),1)),burstMinimum=g.mul(160,rng.range(burstGate,Math.fround(.9),Math.fround(1.1))),burst=g.floor(g.max(burstLevel,burstMinimum));
      const selectedDamage=g.where(levelSelected.supported,levelSelected.damage,g.where(g.eq(r.selector,43),vacuum,g.where(g.eq(r.selector,45),selectedCritical,g.where(g.eq(r.selector,47),g.add(g.floor(g.mul(source.level,.25)),5),g.where(g.eq(r.selector,63),burst,selected)))));
      const ordinary=g.or(g.eq(r.id,1),g.eq(r.id,2)),decay=g.and(g.gt(r.targetDecayFlag,0),g.or(g.not(ordinary),g.and(partySource,sourceWideWeapon))),coefficient=g.op('Gather',[g.constant(COMMON_TARGET_DAMAGE_FALLOFF,'float32',[5]),g.cast(g.max(0,g.min(hitIndex,4)),'int32')],{axis:0},{shape:['N',1]}),decayed=g.where(decay,g.floor(g.mul(selectedDamage,coefficient)),selectedDamage),wrapped=g.sub(decayed,g.mul(g.floor(g.mul(decayed,1/65536)),65536));
      return{seed:rng.seed,position:rng.position,damage:wrapped};
    },
    preCriticalDamage(g,rng,r,hit,base,{source,partySource,critical}){
      const effectiveCritical=g.or(critical,g.and(g.eq(r.selector,45),g.gt(selectedCritical,0)));
      return commonMetalPreCritical(g,r,hit,base,{...Object.fromEntries(COMMON_TENSION_FIELDS.map(key=>[key,g.where(allowTension,sourceTension[key],0)])),partySource,level:source.level,targetMetal:g.and(targetMetal,g.eq(r.operation,1)),critical:effectiveCritical});
    },
    damageResistance(g,r,resistance){return g.where(g.eq(r.damageElement,0),1,resistanceFraction(g,resistance[4]));},
    postResistanceDamage(g,value,r,{partySource}){
      return commonRawDamageModifiers(g,value,r,{partySource,weapon:sourceWeapon,weaponSpeciesTenths:g.split(g.input('sourceWeaponSpeciesTenths',['N',12]),12),weaponSpeciesProvided:g.input('sourceWeaponSpeciesProvided',['N',1],'bool'),elements:g.split(g.input('targetElementResistances',['N',7]),7),rawElements:g.split(g.input('targetRawElementResistances',['N',7]),7),...rawModifiers});
    },
    postDefendDamage(g,value,r){return commonBladeDamage(g,value,{defendAllowed:g.gt(r.defend,0),bladeDefense:g.gt(rawBit(g,rawModifiers.targetRawFlagsBytes,5),0)});},
    postprocessEquipment(g,value,r,{hit,partySource,dodge,guard}){
      const result=commonWeaponPostprocess(g,value,r,{hit,partySource,dodge,guard,weaponClearGuard,weaponAlwaysOne:g.input('sourceWeaponAlwaysOne',['N',1],'bool')});
      weaponAlwaysOneApplied=result.alwaysOne;return result;
    },
    beforeMinimumDamage(g,rng,value,r,{critical}){
      return commonMetalBeforeMinimum(g,value,r,{targetMetal:g.and(targetMetal,g.eq(r.operation,1)),critical:g.or(critical,g.and(g.eq(r.selector,45),g.gt(selectedCritical,0))),weaponAlwaysOne:weaponAlwaysOneApplied});
    },
    minimumDamageGate(g,r){return commonMetalMinimumAllowed(g,r,{targetMetal:g.and(targetMetal,g.eq(r.operation,1))});},
    afterMinimumDamage(g,rng,value,r,{hit,critical,partySource}){
      return commonMetalAfterMinimum(g,rng,value,r,{enabled:hit,targetMetal:g.and(targetMetal,g.eq(r.operation,1)),critical:g.or(critical,g.and(g.eq(r.selector,45),g.gt(selectedCritical,0))),partySource,weaponMetalBonus:g.input('sourceWeaponMetalBonus',['N',1],'bool'),...sourceTension,allowTension});
    },
    beforeComboDamage(g,value,r){return g.where(g.and(asBool(g,targetTension.high),g.eq(r.operation,1)),g.mul(value,.5),value);},
    finalDamage(g,value,r){return g.where(g.gt(r.damageCap,0),g.min(value,r.damageCap),value);},
    primaryDamage(g,value,r,{active,target}){return commonScenarioPrimaryDamage(g,value,{mode:scenarioMode,actionId:r.id,targetId:target.id,targetHp:target.hp,active:g.and(active,g.eq(r.operation,1))});},
    additionalPoison(g,rng,r,{operationHit,damage,partySource,critical}){
      const kinds=targetKinds[0],kind=g.sub(kinds,g.mul(g.floor(g.mul(kinds,.25)),4));
      return commonAdditionalPoison(g,rng,{enabled:g.and(operationHit,g.eq(r.operation,1),g.eq(r.additional,4)),damage,present:targetPresent,dead:g.gt(rawBit(g,rawModifiers.targetRawStatusBytes,0),0),high:g.gt(rawBit(g,rawModifiers.targetRawStatusBytes,24),0),active:g.gt(rawBit(g,rawModifiers.targetRawStatusBytes,1),0),kind,parameter:r.secondaryParameter,rawResistance:g.input('targetRawPoisonResistance'),partySource,partyChance:r.chanceMinimum,enemyChance:r.baseChance,critical});
    },
    weaponCallbackGate(g,r,positive){return g.and(positive,g.not(isCounter),g.not(g.eq(r.operation,15)),g.not(populationInserted));},
    wakeRecoveryGate(g,gate){return g.and(gate,g.not(isCounter),g.not(populationInserted),g.not(additionalAilmentApplied));},
    beforeWakeRecovery(g,rng,{actors,positive,internalDamage,rule}){
      const source=actors[0],target=actors[1],drain=commonEnemyMpDrain(g,rng,{enabled:g.and(positive,g.not(isCounter),g.or(g.eq(rule.id,1),g.eq(rule.id,2))),definitionFlag:g.input('sourceEnemyMpDrain',['N',1],'bool'),sourceParty:g.gt(source.party,0),sourceId:source.id,sourceMp:source.mp,sourceMaxMp:source.maxMp,targetId:target.id,targetParty:g.gt(target.party,0),targetMp:target.mp,damage:internalDamage});
      source.mp=drain.nextSourceMp;target.mp=drain.nextTargetMp;weaponMpDrained=drain.amount;
    },
    targetEffect(g,r,hit,p){
      const {source,target,nextTarget,aux:legacyAux,status,rng,internalDamage,critical}=p;let applied=zero(g);const updates={};
      // Summoning returns NULL after appending its own new-actor event. Its
      // HP draw occurs inside the operation before the ordinary callback
      // tail, which therefore sees no positive primary-event amount. The
      // separately evaluated insertion graph starts at this exact saved
      // state; its random feedback is not committed a second time.
      populationSeed=rng.seed;populationPosition=rng.position;populationInserted=g.and(hit,g.or(g.eq(r.operation,11),g.eq(r.operation,12)),populationInsertionPossible);rng.raw(populationInserted);
      const heal=g.and(p.active,g.eq(r.operation,2),g.or(hit,g.gt(r.restoreHPFull,0))),requestedHeal=g.where(g.gt(r.restoreHPFull,0),target.maxHp,internalDamage),amount=g.where(heal,g.min(requestedHeal,g.sub(target.maxHp,target.hp)),0);updates.hp=g.where(heal,g.add(target.hp,amount),nextTarget.hp);recovered=g.where(heal,requestedHeal,0);
      // Operation0 has an actual effect for the two escape records. The ROM
      // handler ignores hit, sets HP0 and the excluded bit, then clears status
      // through02088f68; exclusion is not the dead flag. Keep that distinction
      // in the output so actor-table ownership remains outside this kernel.
      escaped=g.and(p.active,g.eq(r.operation,0),g.gt(r.selfEscape,0),g.eq(source.id,target.id));updates.hp=g.where(escaped,0,updates.hp);
      const appeal=g.and(p.active,g.eq(r.operation,0),g.eq(source.id,target.id),g.eq(r.selfEscape,0),g.eq(r.primaryRecoveryEvent,0)),appealSkip=g.and(appeal,g.eq(targetPreparation[0],1)),appealParalysis=g.and(appeal,g.eq(targetPreparation[0],2)),appealConfusion=g.and(appeal,g.eq(targetPreparation[0],3));targetPreparation[0]=g.where(appeal,0,targetPreparation[0]);
      const attackRank=g.and(hit,g.eq(r.operation,3),g.or(g.and(g.gt(r.parameter,0),g.lt(target.attackRank,2)),g.and(g.lt(r.parameter,0),g.gt(target.attackRank,-2)))),nextRank=g.min(2,g.max(-2,g.add(target.attackRank,r.parameter)));
      updates.attackRank=g.where(attackRank,nextRank,nextTarget.attackRank);legacyAux.a1_attackRankDuration=g.where(attackRank,g.where(g.eq(nextRank,0),0,5),legacyAux.a1_attackRankDuration);legacyAux.a1_attackRankRecovery=g.where(attackRank,0,legacyAux.a1_attackRankRecovery);
      // Additional2/8 draw before immunity, dead and rank-limit checks. Rank
      // operations pass amount1. Their raw bytes4f/50 are not modified by the
      // ailment-resistance-up/down getter. Original action173 bypasses only
      // the resistance predicate while retaining the draw and rank checks.
      const attackAdditional=g.eq(r.additional,2),rankAdditional=commonAdditionalRank(g,rng,{enabled:g.and(hit,g.or(attackAdditional,g.eq(r.additional,8)),g.or(g.eq(r.operation,1),... [3,4,5].map(operation=>g.eq(r.operation,operation)))),damage:g.where(g.eq(r.operation,1),internalDamage,1),present:targetPresent,dead:g.gt(rawBit(g,rawModifiers.targetRawStatusBytes,0),0),parameter:r.secondaryParameter,rawResistance:g.where(attackAdditional,g.input('targetRawAttackResistance'),g.input('targetRawDefenseResistance')),critical,ignoreResistance:g.and(g.eq(r.additional,8),g.gt(r.additionalDefenseIgnoreResistance,0)),rank:g.where(attackAdditional,target.attackRank,target.defenseRank),duration:g.where(attackAdditional,legacyAux.a1_attackRankDuration,legacyAux.a1_defenseRankDuration),recovery:g.where(attackAdditional,legacyAux.a1_attackRankRecovery,legacyAux.a1_defenseRankRecovery),durationOnSet:g.where(attackAdditional,5,6)}),extraAttack=g.and(attackAdditional,rankAdditional.applied),defenseProc=g.and(g.not(attackAdditional),rankAdditional.applied);
      updates.attackRank=g.where(extraAttack,rankAdditional.nextRank,updates.attackRank);legacyAux.a1_attackRankDuration=g.where(extraAttack,rankAdditional.nextDuration,legacyAux.a1_attackRankDuration);legacyAux.a1_attackRankRecovery=g.where(extraAttack,rankAdditional.nextRecovery,legacyAux.a1_attackRankRecovery);
      updates.defenseRank=g.where(defenseProc,rankAdditional.nextRank,nextTarget.defenseRank);legacyAux.a1_defenseRankDuration=g.where(defenseProc,rankAdditional.nextDuration,legacyAux.a1_defenseRankDuration);legacyAux.a1_defenseRankRecovery=g.where(defenseProc,rankAdditional.nextRecovery,legacyAux.a1_defenseRankRecovery);
      // Additional13 reads the independent raw byte52 and mutates signed
      // magic-barrier rank6 plus its existing duration/recovery pair. This
      // draw occurs inside the original operation, before primary HP/wake.
      additionalMagicBarrier=commonAdditionalRank(g,rng,{enabled:g.and(p.active,g.eq(r.operation,1),g.eq(r.additional,13)),damage:internalDamage,present:targetPresent,dead:g.gt(rawBit(g,rawModifiers.targetRawStatusBytes,0),0),parameter:r.secondaryParameter,rawResistance:g.input('targetRawMagicBarrierResistance'),critical,ignoreResistance:zero(g),rank:rawModifiers.targetRawRanks[6],duration:targetRawTimers[0],recovery:targetRawTimers[1],durationOnSet:5});
      const extraAgility=g.and(hit,g.eq(r.additional,17),g.or(g.and(g.gt(r.secondaryParameter,0),g.lt(target.agilityRank,2)),g.and(g.lt(r.secondaryParameter,0),g.gt(target.agilityRank,-2)))),nextAgility=g.min(2,g.max(-2,g.add(target.agilityRank,r.secondaryParameter)));
      updates.agilityRank=g.where(extraAgility,nextAgility,nextTarget.agilityRank);legacyAux.a1_agilityRankDuration=g.where(extraAgility,g.where(g.eq(nextAgility,0),0,6),legacyAux.a1_agilityRankDuration);legacyAux.a1_agilityRankRecovery=g.where(extraAgility,0,legacyAux.a1_agilityRankRecovery);
      const additionalAilment=commonAdditionalAilment(g,rng,{enabled:g.and(hit,g.eq(r.operation,1)),additional:r.additional,damage:internalDamage,present:targetPresent,dead:g.gt(rawBit(g,rawModifiers.targetRawStatusBytes,0),0),high:g.gt(rawBit(g,rawModifiers.targetRawStatusBytes,24),0),paralyzed:g.gt(rawBit(g,rawModifiers.targetRawStatusBytes,3),0),rawSleepResistance:g.input('targetRawSleepResistance'),rawConfusionResistance:g.input('targetRawConfusionResistance'),partySource:g.gt(source.party,0),partyChance:r.chanceMinimum,enemyChance:r.baseChance,critical});
      additionalAilmentApplied=additionalAilment.applied;
      const tensionReduction=commonTensionReduction(g,{enabled:g.and(hit,g.eq(r.operation,1)),damage:internalDamage,present:targetPresent,additional:r.additional,...targetTension,anger:ta.anger,angerDuration:ta.angerDuration,angerRecovery:ta.angerRecovery});
      targetTension.stage=tensionReduction.nextStage;targetTension.low=tensionReduction.nextLow;targetTension.high=tensionReduction.nextHigh;ta.anger=tensionReduction.nextAnger;ta.angerDuration=tensionReduction.nextAngerDuration;ta.angerRecovery=tensionReduction.nextAngerRecovery;
      const directSkip=g.and(hit,g.eq(r.operation,10)),extraGate=g.and(hit,g.eq(r.operation,1),g.eq(r.additional,1),g.gt(internalDamage,0),g.gt(p.resistance[2],0)),roll=rng.bounded(extraGate,100),chance=g.where(g.gt(r.additionalPlainChance,0),r.baseChance,g.where(critical,100,g.mul(r.baseChance,resistanceFraction(g,p.resistance[2])))),extraSkip=g.and(extraGate,g.lt(roll,chance));
      const skip=g.or(appealSkip,g.and(g.or(directSkip,extraSkip),g.gt(target.hp,0),g.eq(targetTension.high,0),g.eq(target.paralysis,0),g.or(g.eq(target.skip,0),g.not(g.eq(targetPreparation[2],r.secondaryParameter)))));
      updates.skip=g.where(skip,1,nextTarget.skip);updates.defend=g.where(skip,0,nextTarget.defend);targetPreparation[2]=g.where(skip,g.where(appealSkip,10,r.secondaryParameter),targetPreparation[2]);
      // Additional11 (matching021e3a34) tests resistance/species and the
      // living/high-tension predicate BEFORE drawing. Party and enemy chance
      // fields differ. Original row82 is species9-only and fixed25% unless
      // critical; row88 has a separate typed-metal predicate/chance.
      const speciesProc=g.gt(r.additionalParalysisSpecies,0),metalProc=g.and(g.gt(r.additionalParalysisMetalChance,0),targetMetal,g.eq(target.party,0)),paralysisEligible=g.where(speciesProc,scalar(g,g.and(g.eq(target.party,0),g.eq(sourceWeapon[3],r.additionalParalysisSpecies))),scalar(g,g.or(metalProc,g.gt(p.resistance[2],0)))),
        paralysisGate=g.and(hit,g.eq(r.operation,1),g.eq(r.additional,11),g.gt(internalDamage,0),g.gt(paralysisEligible,0),g.gt(target.hp,0),g.eq(rawBit(g,rawModifiers.targetRawStatusBytes,0),0),g.eq(targetTension.high,0)),paralysisRoll=rng.bounded(paralysisGate,100),baseParalysis=g.where(g.gt(source.party,0),r.chanceMinimum,r.baseChance),paralysisChance=g.where(critical,100,g.where(speciesProc,25,g.where(metalProc,12.5,g.mul(baseParalysis,resistanceFraction(g,p.resistance[2]))))),extraParalysis=g.and(paralysisGate,g.lt(paralysisRoll,paralysisChance)),
        paralysis=g.or(appealParalysis,extraParalysis,g.and(hit,g.eq(r.operation,24),g.gt(target.hp,0),g.eq(targetTension.high,0)));
      updates.paralysis=g.where(paralysis,1,nextTarget.paralysis);for(const key of['sleep','confusion','skip','defend'])updates[key]=g.where(paralysis,0,updates[key]??nextTarget[key]);
      for(const key of['sleepDuration','sleepRecovery','confusionDuration','confusionRecovery','paralysisDuration','paralysisRecovery'])status['a1_'+key]=g.where(paralysis,key==='paralysisDuration'?3:0,status['a1_'+key]);
      targetPreparation[2]=g.where(paralysis,0,targetPreparation[2]);
      const confusion=g.or(appealConfusion,additionalAilment.confusion,g.and(hit,g.eq(r.operation,21),g.eq(targetTension.high,0)));
      updates.confusion=g.where(confusion,1,updates.confusion);updates.defend=g.where(confusion,0,updates.defend);status.a1_confusionDuration=g.where(confusion,3,status.a1_confusionDuration);status.a1_confusionRecovery=g.where(confusion,0,status.a1_confusionRecovery);
      // func_02088840/854 accepts every living actor, including an already
      // blinded one, and refreshes duration4/recovery0 without clearing tension.
      const additionalBlind=commonAdditionalBlind(g,rng,{enabled:g.and(p.active,g.eq(r.operation,1),g.eq(r.additional,18)),damage:internalDamage,present:targetPresent,dead:g.gt(rawBit(g,rawModifiers.targetRawStatusBytes,0),0),rawResistance:g.input('targetRawBlindResistance'),partySource:g.gt(source.party,0),partyChance:r.chanceMinimum,enemyChance:r.baseChance});
      blindApplied=g.or(g.and(hit,g.eq(r.operation,19),g.gt(target.hp,0)),additionalBlind.applied);updates.blind=g.where(blindApplied,1,nextTarget.blind);legacyAux.a1_blindDuration=g.where(blindApplied,4,legacyAux.a1_blindDuration);legacyAux.a1_blindRecovery=g.where(blindApplied,0,legacyAux.a1_blindRecovery);
      const primaryCures=[['sleep',9],['paralysis',20],['confusion',27]].map(([field,operation])=>{
        const cured=g.and(hit,g.eq(r.operation,operation),g.gt(target[field],0));
        updates[field]=g.where(cured,0,updates[field]??nextTarget[field]);
        for(const suffix of['Duration','Recovery'])status['a1_'+field+suffix]=g.where(cured,0,status['a1_'+field+suffix]);
        return cured;
      });
      const curedPrimary=g.or(...primaryCures);p.wakeSkip[1]=g.where(curedPrimary,1,p.wakeSkip[1]);
      // Additional12's original body checks only target presence. The
      // operation1 caller invokes it on misses/guard/zero damage as well.
      const dispel=g.or(g.and(hit,g.eq(r.operation,49)),g.and(p.active,g.eq(r.operation,1),g.eq(r.additional,12)));dispelApplied=dispel;for(const field of dispelColumns.actor)if(!field.retained)updates[field.field]=g.where(dispel,0,updates[field.field]??nextTarget[field.field]);
      for(const field of dispelColumns.aux)if(!field.retained)legacyAux['a1_'+field.field]=g.where(dispel,0,legacyAux['a1_'+field.field]);
      const raise=g.and(hit,g.eq(r.operation,15),g.eq(targetTension.high,0),g.lt(targetTension.stage,4)),raised=raiseTension(g,rng,{...targetTension,poison:target.poison,poisonKind:status.a1_poisonKind,dead:scalar(g,g.le(target.hp,0)),asleep:target.sleep,paralyzed:target.paralysis,skip:target.skip},raise);
      for(const key of COMMON_TENSION_FIELDS)targetTension[key]=raised[key];updates.poison=g.where(raise,raised.poison,nextTarget.poison);status.a1_poisonKind=g.where(raise,raised.poisonKind,status.a1_poisonKind);raiseResult=raised.result;
      const drain=g.and(hit,g.eq(r.operation,28)),taken=g.where(drain,g.min(internalDamage,target.mp),0),received=g.min(taken,g.max(g.sub(source.maxMp,source.mp),0));updates.mp=g.sub(target.mp,taken);source.mp=g.add(source.mp,received);transferred=taken;
      const mpRestore=g.and(hit,g.eq(r.operation,26)),mpAmount=g.where(mpRestore,g.where(g.gt(r.restoreMPFull,0),target.maxMp,internalDamage),0),nextMp=g.where(mpRestore,g.min(g.add(target.mp,mpAmount),target.maxMp),updates.mp);mpRecovered=g.where(mpRestore,g.sub(nextMp,target.mp),0);updates.mp=nextMp;recovered=g.where(mpRestore,mpAmount,recovered);
      const asleep=g.or(additionalAilment.sleep,g.and(hit,g.eq(r.operation,8),g.eq(target.paralysis,0),g.gt(nextTarget.sleep,0))),clearAll=dispel,clearLow=g.or(clearAll,skip,paralysis,asleep);targetPreparation[2]=g.where(asleep,0,targetPreparation[2]);
      updates.sleep=g.where(additionalAilment.sleep,1,updates.sleep??nextTarget.sleep);updates.skip=g.where(asleep,0,updates.skip);updates.defend=g.where(asleep,0,updates.defend);
      status.a1_sleepDuration=g.where(additionalAilment.sleep,1,status.a1_sleepDuration);status.a1_sleepRecovery=g.where(additionalAilment.sleep,0,status.a1_sleepRecovery);
      clearBladeDefenseFlag=g.or(paralysis,asleep,confusion);
      targetTension.stage=g.where(clearLow,0,targetTension.stage);targetTension.low=g.where(clearLow,0,targetTension.low);targetTension.high=g.where(clearAll,0,targetTension.high);
      applied=g.or(populationInserted,escaped,g.and(heal,g.gt(amount,0)),attackRank,extraAttack,defenseProc,additionalMagicBarrier.applied,extraAgility,tensionReduction.lowered,tensionReduction.clearAnger,skip,paralysis,confusion,blindApplied,curedPrimary,dispel,g.and(raise,g.gt(raised.result,0)),g.gt(taken,0),g.and(mpRestore,g.or(g.gt(mpRecovered,0),g.and(g.eq(target.party,0),g.ge(nextMp,255)))));
      return{applied,target:updates};
    },
    beforeHitRecovery(g,rng,p){
      sa=clearLifecycle(g,sa,p.actors[0],p.active);ta=clearLifecycle(g,ta,p.actors[1],p.active);
      const enemy=g.eq(p.actors[1].party,0),quarter=g.and(g.ge(g.mul(p.before[1].hp,4),p.before[1].maxHp),g.lt(g.mul(p.actors[1].hp,4),p.actors[1].maxHp)),half=g.and(g.ge(g.mul(p.before[1].hp,2),p.before[1].maxHp),g.lt(g.mul(p.actors[1].hp,2),p.actors[1].maxHp));
      const result=angerCheck(g,rng,ta,{gate:g.and(p.active,p.partySource,enemy,g.gt(p.damage,0),g.gt(p.actors[1].hp,0),g.or(quarter,half)),blocked:blocked(g,p.actors[1]),chance:g.where(quarter,tc.angerQuarterChance,tc.angerHalfChance),minimum:tc.angerMin,maximum:tc.angerMax,sourceId:p.source.id});ta=result.aux;return result.activated;
    },
    afterHitRecovery(g,rng,p){
      const charge=coup(g,rng,p.actors[1],ta,{gate:g.and(p.active,asBool(g,p.actors[1].party)),chance:g.add(coupDamageBonus(g,p.internalDamage,p.actors[1].maxHp),lookup(g,originalAction,'coupBonus')),chargedPartyCount:chargedCount,blockedByBattle:g.or(coupBlocked,g.gt(scenarioMode,0))});
      return{hitCharge:charge,critAnger:zero(g),actionCharge:zero(g)};
    },
    extraOutputs(g,p){
      const dead=g.and(p.active,g.le(p.actors[1].hp,0));for(const key of COMMON_TENSION_FIELDS)targetTension[key]=g.where(dead,0,targetTension[key]);for(const j of[0,2])targetPreparation[j]=g.where(dead,0,targetPreparation[j]);
      return{blindApplied:scalar(g,blindApplied),additionalMagicBarrierApplied:scalar(g,additionalMagicBarrier.applied),nextTargetAdditionalMagicBarrier:g.cat([additionalMagicBarrier.nextRank,additionalMagicBarrier.nextDuration,additionalMagicBarrier.nextRecovery]),populationSeed,populationPosition,populationInserted,weaponMpDrained, nextSourceLifecycleAux:g.cat(COMMON_AUX_FIELDS.slice(0,7).map(key=>sa[key])),nextTargetLifecycleAux:g.cat(COMMON_AUX_FIELDS.slice(0,7).map(key=>ta[key])),nextSourceTension:pack(g,COMMON_TENSION_FIELDS,sourceTension),nextTargetTension:pack(g,COMMON_TENSION_FIELDS,targetTension),nextSourcePreparation:g.cat(sourcePreparation),nextTargetPreparation:g.cat(targetPreparation),recoveryAmount:recovered,mpRecovered,drainedAmount:transferred,raiseResult,selectorDamage:selectedCritical,afterActionScratchWritten:scalar(g,selectorScratchWritten),afterActionScratch:selectorScratch,currentDefense:buffStat(g,p.actors[1].baseDefense,p.actors[1].defenseRank,'defense',true,p.actors[1].party),currentAgility:buffStat(g,p.actors[1].baseAgility,p.actors[1].agilityRank,'defense',true,p.actors[1].party),escaped:scalar(g,escaped),dispelApplied:scalar(g,dispelApplied),clearBladeDefenseFlag:scalar(g,clearBladeDefenseFlag),critical:g.cast(g.or(g.and(p.hit,g.eq(p.rule.selector,45),g.gt(selectedCritical,0)),p.critical??zero(g)),'float32')};
    }
  });
}

export function buildCommonTargetEffect(){
  const kernel=buildTargetKernel().json(),g=new Graph('rom-common-target-effect',commonContract('1対象の共通効果。対象・MP・命令context・命令後反応は外側で1回だけ処理します。'));
  const x={seed:input(g,'seed',8),position:input(g,'position',1,'int32'),sourceActor:inputActor(g,'sourceActor'),targetActor:inputActor(g,'targetActor'),sourceAux:inputAux(g,'sourceAux'),targetAux:inputAux(g,'targetAux'),sourceStatus:inputStatus(g,'sourceStatus'),targetStatus:inputStatus(g,'targetStatus'),sourceConfig:inputConfig(g,'sourceConfig'),targetConfig:inputConfig(g,'targetConfig'),sourceTension:inputTension(g,'sourceTension'),targetTension:inputTension(g,'targetTension'),actionId:input(g,'actionId'),enabled:input(g,'enabled',1,'bool'),commandCritical:input(g,'commandCritical',1,'bool',flagDomain,false),combo:input(g,'combo',6,'float32',extendedInputContract().fieldDomains.combo,[0,0,0,-1,0,0]),context:input(g,'context',2,'float32',{min:0,max:65535,integer:true},[1,0]),sourceWakeSkip:input(g,'sourceWakeSkip',1,'float32',{min:0,max:1,integer:true},0),targetWakeSkip:input(g,'targetWakeSkip',1,'float32',{min:0,max:1,integer:true},0),resistances:input(g,'resistances',22,'float32',byteDomain,Array(22).fill(100)),sourcePreparation:input(g,'sourcePreparation',5,'float32',{min:0,max:255,integer:true},Array(5).fill(0)),targetPreparation:input(g,'targetPreparation',5,'float32',{min:0,max:255,integer:true},Array(5).fill(0)),sourceWeapon:input(g,'sourceWeapon',4,'float32',[{name:'present',min:0,max:1,integer:true},{name:'element',min:0,max:7,integer:true},{name:'species1Tenths',min:-32,max:31,integer:true},{name:'targetSpecies',min:0,max:15,integer:true}],[0,0,10,0]),chargedPartyCount:input(g,'chargedPartyCount',1,'float32',{min:0,max:4,integer:true},0),coupBlocked:input(g,'coupBlocked',1,'bool',flagDomain,false)};
  x.preparedConfusion=input(g,'preparedConfusion',1,'bool',flagDomain,false);
  x.scenarioId=input(g,'scenarioId',1,'float32',{min:-1,max:65535,integer:true},-1);
  x.targetPresent=input(g,'targetPresent',1,'bool',flagDomain,true);
  x.targetMetal=input(g,'targetMetal',1,'bool',flagDomain,false);
  x.sourceEnemyMpDrain=input(g,'sourceEnemyMpDrain',1,'bool',flagDomain,false);
  x.sourceWeaponMetalBonus=input(g,'sourceWeaponMetalBonus',1,'bool',flagDomain,false);
  x.sourceWeaponClearGuard=input(g,'sourceWeaponClearGuard',1,'bool',flagDomain,false);
  x.sourceWeaponAlwaysOne=input(g,'sourceWeaponAlwaysOne',1,'bool',flagDomain,false);
  x.sourceWeaponSpeciesTenths=input(g,'sourceWeaponSpeciesTenths',12,'float32',COMMON_WEAPON_SPECIES_FIELDS.map(({species})=>({name:'species'+species,min:-32,max:31,integer:true})),Array(12).fill(10));
  x.sourceWeaponSpeciesProvided=input(g,'sourceWeaponSpeciesProvided',1,'bool',flagDomain,false);
  x.sourceMagic=input(g,'sourceMagic',2,'float32',{min:0,max:1023,integer:true},[0,0]);
  x.sourcePackedScale=input(g,'sourcePackedScale',2,'float32',{min:0,max:1023,integer:true},[0,0]);
  for(const[name,value]of Object.entries(inputRawModifiers(g)))x[name]=Array.isArray(value)?g.cat(value):value;
  x.targetStatusKindsBytes=input(g,'targetStatusKindsBytes',2,'float32',byteDomain,[0,0]);
  for(const name of['sourceRawTimers','targetRawTimers'])x[name]=input(g,name,COMMON_RAW_TIMER_FIELDS.length,'float32',COMMON_RAW_TIMER_FIELDS.map((field,i)=>({name:field,...byteDomain,max:i%2?4:255})),Array(COMMON_RAW_TIMER_FIELDS.length).fill(0));
  x.coverResolved=input(g,'coverResolved',1,'bool',flagDomain,false);
  for(const name of['routingResolved','criticalAlreadyDrawn','suppliedCritical','resetCombo','skipComboUpdate','isCounter','sourceWideWeapon'])x[name]=input(g,name,1,'bool',flagDomain,false);
  x.hitIndex=input(g,'hitIndex',1,'float32',{min:0,max:31,integer:true},0);
  x.allowTension=input(g,'allowTension',1,'bool',flagDomain,true);
  x.originalActionId=input(g,'originalActionId',1,'float32',{min:0,max:65535,integer:true},0);
  x.originalSourceId=input(g,'originalSourceId',1,'float32',{min:-1,max:199,integer:true},-1);
  x.sourceCriticalBaseRate=input(g,'sourceCriticalBaseRate',1,'float32',{min:-1,max:100},-1);
  x.criticalHitCount=input(g,'criticalHitCount',1,'float32',{min:0,max:32,integer:true},1);
  x.sharedAlreadyDrawn=input(g,'sharedAlreadyDrawn',1,'bool',flagDomain,false);x.sharedRoll=input(g,'sharedRoll',1,'float32',{min:0,max:99,integer:true},0);
  for(const name of['populationContextAvailable','populationInsertionPossible'])x[name]=input(g,name,1,'bool',flagDomain,false);
  for(const name of['sourceHistory','targetHistory'])x[name]=input(g,name,2,'float32',{min:-32768,max:32767,integer:true},[-1,-1]);
  for(const name of['sourceState3c','targetState3c'])x[name]=input(g,name,1,'float32',byteDomain,0);
  for(const name of['sourcePreparation','targetPreparation']){delete g.contract.inputDomains[name];g.contract.fieldDomains[name]=preparationDomains;}
  const sourceAux=g.split(x.sourceAux,21),targetAux=g.split(x.targetAux,21),res=commonEffectResistancePercentages(g,{rawResistances:g.split(x.resistances,22),rawFlagsBytes:g.split(x.targetRawFlagsBytes,4),statusKindsBytes:g.split(x.targetStatusKindsBytes,2),present:x.targetPresent}),element=lookup(g,x.actionId,'effectElement'),damageElement=lookup(g,x.actionId,'damageElement'),byElement=id=>res.reduce((v,column,i)=>g.where(g.eq(id,i+1),column,v),g.constant(100));
  const originalAction=g.where(g.gt(x.originalActionId,0),x.originalActionId,x.actionId),feeds={...x,originalActionId:originalAction,actors:g.cat([x.sourceActor,x.targetActor]),aux:g.cat([g.add(g.mul(sourceAux[0],0),g.constant(Array(7).fill(0),'float32',[1,7])),...sourceAux.slice(7),...targetAux.slice(7)]),status:g.cat([x.sourceStatus,x.targetStatus]),wakeSkip:g.cat([x.sourceWakeSkip,x.targetWakeSkip]),config:x.sourceConfig,sourceIndex:g.mul(sourceAux[0],0),resistances:g.cat([res[18],res[19],byElement(element),res[15],byElement(damageElement)]),targetRawPoisonResistance:g.split(x.resistances,22)[15],targetRawSleepResistance:g.split(x.resistances,22)[9],targetRawConfusionResistance:g.split(x.resistances,22)[12],targetRawAttackResistance:g.split(x.resistances,22)[17],targetRawDefenseResistance:g.split(x.resistances,22)[18],targetElementResistances:g.cat(res.slice(0,7)),targetRawElementResistances:g.cat(g.split(x.resistances,22).slice(0,7))};
  feeds.targetRawMagicBarrierResistance=g.split(x.resistances,22)[20];
  feeds.targetRawBlindResistance=g.split(x.resistances,22)[8];
  const out=g.inline(kernel,feeds,'effect'),aa=g.split(out.nextActors,66),ax=g.split(out.nextAux,35),st=g.split(out.nextStatus,14),wake=g.split(out.nextWakeSkip,2),sourceLife=g.split(out.nextSourceLifecycleAux,7),targetLife=g.split(out.nextTargetLifecycleAux,7),same=g.and(x.targetPresent,g.eq(aa[32],aa[65]));
  let sourceActor=g.cat(aa.slice(0,33)),targetActor=g.cat(aa.slice(33));
  // For self effects target mutation wins; MP was already paid in begin and
  // is therefore equal in both snapshots. No second scatter overwrites it.
  sourceActor=g.where(same,targetActor,sourceActor);
  const nextSourceAux=g.cat([...sourceLife,...ax.slice(7,21)]),nextTargetAux=g.cat([...targetLife,...ax.slice(21,35)]);
  const values={nextSeed:out.nextSeed,nextPosition:out.nextPosition,nextSourceActor:sourceActor,nextTargetActor:targetActor,nextSourceAux:g.where(same,nextTargetAux,nextSourceAux),nextTargetAux,nextSourceStatus:g.where(same,g.cat(st.slice(7)),g.cat(st.slice(0,7))),nextTargetStatus:g.cat(st.slice(7)),nextSourceWakeSkip:g.where(same,wake[1],wake[0]),nextTargetWakeSkip:wake[1],nextSourceTension:g.where(same,out.nextTargetTension,out.nextSourceTension),nextTargetTension:out.nextTargetTension,nextSourcePreparation:g.where(same,out.nextTargetPreparation,out.nextSourcePreparation),nextTargetPreparation:out.nextTargetPreparation,nextCombo:out.nextCombo,nextContext:out.nextContext,damage:out.damage,internalDamage:out.internalDamage,recoveryAmount:out.recoveryAmount,drainedAmount:out.drainedAmount,raiseResult:out.raiseResult,critical:out.critical,charged:out.charged,angerActivated:out.angerActivated,effectApplied:out.effectApplied,consumed:out.consumed,supported:out.supported,active:out.active};
  values.escaped=out.escaped;
  values.mpRecovered=out.mpRecovered;
  values.weaponMpDrained=out.weaponMpDrained;
  for(const key of['selectorDamage','afterActionScratchWritten','afterActionScratch','currentDefense','currentAgility','populationSeed','populationPosition','populationInserted'])values[key]=out[key];
  values.accuracyPassed=out.accuracyPassed;
  values.cameraFlagsB=out.cameraFlagsB;
  const tensionBefore=g.split(x.sourceTension,3);values.tensionUsed=scalar(g,g.and(g.gt(out.active,0),x.allowTension,g.gt(lookup(g,x.actionId,'tensionFlag'),0),g.or(g.gt(tensionBefore[1],0),g.gt(tensionBefore[2],0))));
  for(const key of['dodged','guarded','blindMiss','operationHit'])values[key]=out[key];
  const originalSource=g.where(g.ge(x.originalSourceId,0),x.originalSourceId,aa[32]),died=g.and(g.gt(out.active,0),g.le(aa[33],0)),history=g.split(g.where(died,g.constant([-1,-1],'float32',[1,2]),x.targetHistory),2),partyToEnemy=g.and(g.gt(out.active,0),g.ge(originalSource,0),g.le(originalSource,3),g.eq(aa[50],0)),nextHistory=g.where(partyToEnemy,g.cat([originalSource,history[0]]),g.cat(history)),mark=g.and(partyToEnemy,g.eq(lookup(g,originalAction,'planningCategory'),2)),half=g.floor(g.mul(x.targetState3c,.5)),oldBit=g.sub(half,g.mul(g.floor(g.mul(half,.5)),2)),nextState3c=g.where(mark,g.add(x.targetState3c,g.mul(g.sub(1,oldBit),2)),x.targetState3c);
  values.nextTargetHistory=nextHistory;values.nextSourceHistory=g.where(same,nextHistory,x.sourceHistory);values.nextTargetState3c=nextState3c;values.nextSourceState3c=g.where(same,nextState3c,x.sourceState3c);
  // Typed flags and their independent raw state are projected together. The
  // original death/escape helpers and176-byte dispel mask also clear effects
  // outside the compact status ABI; retaining Force/barriers here would make
  // the next target iteration use an effect that the ROM already removed.
  const target=object(ACTOR_FIELDS,aa.slice(33)),targetStatus=st.slice(7),targetPreparation=g.split(out.nextTargetPreparation,5),targetTension=g.split(out.nextTargetTension,3),oldStatus=g.split(x.targetRawStatusBytes,4),oldFlags=g.split(x.targetRawFlagsBytes,4),oldKinds=g.split(x.targetStatusKindsBytes,2),oldRanks=g.split(x.targetRawRanks,10),didDispel=g.gt(out.dispelApplied,0),didEscape=g.gt(out.escaped,0),apply=g.gt(out.active,0);
  const masked=(bytes,offset)=>{const keep=rawMask(g,bytes,dispelMask.andMaskBytes176.slice(offset,offset+bytes.length));return bytes.map((byte,i)=>g.where(didDispel,keep[i],byte));};
  const rawStatus=masked(oldStatus,0x14),rawFlags=masked(oldFlags,0x18),rawKinds=masked(oldKinds,0x22),rawRanks=oldRanks.map((value,i)=>g.where(didDispel,0,i===0?target.attackRank:i===1?target.defenseRank:i===2?target.agilityRank:value)),oldTimers=g.split(x.targetRawTimers,COMMON_RAW_TIMER_FIELDS.length),rawTimers=oldTimers.map((value,i)=>masked([value],COMMON_RAW_TIMER_OFFSETS[i])[0]),rawState={rawStatusBytes:rawStatus,rawFlagsBytes:rawFlags,statusKindsBytes:rawKinds,rawRanks,rawTimers};
  const magicBarrierAdditional=g.gt(out.additionalMagicBarrierApplied,0),magicBarrierState=g.split(out.nextTargetAdditionalMagicBarrier,3);
  rawRanks[6]=g.where(magicBarrierAdditional,magicBarrierState[0],rawRanks[6]);rawTimers[0]=g.where(magicBarrierAdditional,magicBarrierState[1],rawTimers[0]);rawTimers[1]=g.where(magicBarrierAdditional,magicBarrierState[2],rawTimers[1]);
  rawOverlay(g,rawStatus,16,g.where(magicBarrierAdditional,scalar(g,g.not(g.eq(magicBarrierState[0],0))),rawBit(g,rawStatus,16)));
  // Matching02087d78 /02087e6c: rank0 clears the corresponding timer and
  // flag; a nonzero rank refreshes duration5/recovery0. Only a successful
  // nonzero breath rank change clears both fire/ice shields and their timers.
  const operation=lookup(g,x.actionId,'operation'),delta=g.min(2,g.max(-2,lookup(g,x.actionId,'parameter')));
  for(const [index,op]of[[0,22],[1,23]]){
    const rule=COMMON_MODIFIER_RULES[index],rank=rawRanks[rule.rank],changed=g.and(g.gt(out.operationHit,0),g.eq(operation,op),g.eq(rawBit(g,oldStatus,0),0),g.or(g.and(g.lt(delta,0),g.gt(rank,-2)),g.and(g.ge(delta,0),g.lt(rank,2)))),nextRank=g.min(2,g.max(-2,g.add(rank,delta))),nonzero=g.not(g.eq(nextRank,0));
    rawRanks[rule.rank]=g.where(changed,nextRank,rank);rawOverlay(g,rawStatus,rule.bit,g.where(changed,scalar(g,nonzero),rawBit(g,rawStatus,rule.bit)));
    rawTimers[rule.timerIndex]=g.where(changed,g.where(nonzero,5,0),rawTimers[rule.timerIndex]);rawTimers[rule.timerIndex+1]=g.where(changed,0,rawTimers[rule.timerIndex+1]);
    if(op===23)for(const shield of COMMON_MODIFIER_RULES.slice(2,4))clearCommonModifier(g,rawState,shield,g.and(changed,nonzero));
    values.effectApplied=scalar(g,g.or(g.gt(values.effectApplied,0),changed));
  }
  const createdModifier=applyCommonModifierCreation(g,rawState,{operation,parameter:lookup(g,x.actionId,'parameter'),hit:g.gt(out.operationHit,0),present:x.targetPresent});
  values.effectApplied=scalar(g,g.or(g.gt(values.effectApplied,0),createdModifier.applied));
  const stanceAux=object(COMMON_AUX_FIELDS,g.split(values.nextTargetAux,COMMON_AUX_FIELDS.length));
  for(const rule of COMMON_STANCE_RULES){
    const result=commonStanceRank(g,{enabled:g.and(g.gt(out.operationHit,0),g.eq(operation,rule.operation)),present:x.targetPresent,dead:g.gt(rawBit(g,oldStatus,0),0),parameter:lookup(g,x.actionId,'parameter'),rank:rawRanks[rule.rank],flag:target[rule.field],duration:stanceAux[rule.field+'Duration'],recovery:stanceAux[rule.field+'Recovery']});
    rawRanks[rule.rank]=result.rank;target[rule.field]=result.flag;stanceAux[rule.field+'Duration']=result.duration;stanceAux[rule.field+'Recovery']=result.recovery;
    values.effectApplied=scalar(g,g.or(g.gt(values.effectApplied,0),result.applied));
  }
  values.nextTargetAux=pack(g,COMMON_AUX_FIELDS,stanceAux);values.nextSourceAux=g.where(same,values.nextTargetAux,values.nextSourceAux);
  for(const[field,bit]of Object.entries({paralysis:3,sleep:4,confusion:5,blind:6,skip:19,doubleDodge:25,mpRegen:30,hpRegen:31}))rawOverlay(g,rawStatus,bit,scalar(g,g.gt(target[field],0)));
  for(const[field,bit]of Object.entries({attackRank:10,defenseRank:11,agilityRank:12}))rawOverlay(g,rawStatus,bit,scalar(g,g.not(g.eq(target[field],0))));
  const raisedHigh=g.and(g.eq(operation,15),g.gt(targetTension[2],0),g.eq(g.split(x.targetTension,3)[2],0));
  const priorPoison=g.and(g.not(raisedHigh),g.or(g.gt(out.poisoned,0),g.gt(target.poison,0),g.and(g.gt(rawBit(g,oldStatus,1),0),g.not(g.eq(targetStatus[0],2)))));
  const poison=commonPoisonState(g,{operation,parameter:lookup(g,x.actionId,'parameter'),hit:g.gt(out.operationHit,0),present:x.targetPresent,dead:g.gt(rawBit(g,oldStatus,0),0),high:g.gt(rawBit(g,oldStatus,24),0),active:priorPoison,kind:targetStatus[0]});
  rawOverlay(g,rawStatus,1,scalar(g,poison.active));targetStatus[0]=poison.kind;target.poison=scalar(g,poison.severe);
  values.nextTargetActor=pack(g,ACTOR_FIELDS,target);values.nextTargetStatus=g.cat(targetStatus);values.nextSourceActor=g.where(same,values.nextTargetActor,values.nextSourceActor);values.nextSourceStatus=g.where(same,values.nextTargetStatus,values.nextSourceStatus);
  values.effectApplied=scalar(g,g.or(g.gt(values.effectApplied,0),poison.applied));
  rawOverlay(g,rawStatus,23,targetTension[1]);rawOverlay(g,rawStatus,24,targetTension[2]);
  for(const[field,bit]of Object.entries({doubleGuard:0,acrobat:10}))rawOverlay(g,rawFlags,bit,scalar(g,g.gt(target[field],0)));rawOverlay(g,rawFlags,12,targetLife[3]);
  rawOverlay(g,rawFlags,5,g.where(g.gt(out.clearBladeDefenseFlag,0),0,rawBit(g,rawFlags,5)));
  for(const[value,start,width]of[[targetStatus[0],0,2],[targetPreparation[2],2,4],[targetPreparation[0],12,2]])for(let i=0;i<width;i++)rawOverlay(g,rawKinds,start+i,rawBit(g,[value],i));
  const blindChanged=g.gt(out.blindApplied,0),blindKind=g.where(g.eq(lookup(g,x.actionId,'additional'),18),lookup(g,x.actionId,'secondaryParameter'),lookup(g,x.actionId,'parameter'));
  for(let i=0;i<3;i++)rawOverlay(g,rawKinds,6+i,g.where(blindChanged,rawBit(g,[blindKind],i),rawBit(g,rawKinds,6+i)));
  const deathBytes=[g.add(1,g.mul(rawBit(g,oldStatus,2),4)),g.constant(0),g.constant(0),g.constant(0)],deadKinds=rawMask(g,oldKinds,[0,128]);
  for(let i=0;i<4;i++){rawStatus[i]=g.where(didEscape,0,g.where(died,deathBytes[i],rawStatus[i]));rawFlags[i]=g.where(didEscape,i===1?32:0,g.where(died,0,rawFlags[i]));}
  for(let i=0;i<2;i++)rawKinds[i]=g.where(died,deadKinds[i],rawKinds[i]);for(let i=0;i<10;i++)rawRanks[i]=g.where(died,0,rawRanks[i]);
  for(let i=0;i<rawTimers.length;i++)rawTimers[i]=g.where(g.or(died,didEscape),0,rawTimers[i]);
  values.nextTargetRawStatusBytes=g.where(apply,g.cat(rawStatus),x.targetRawStatusBytes);values.nextTargetRawFlagsBytes=g.where(apply,g.cat(rawFlags),x.targetRawFlagsBytes);values.nextTargetRawRanks=g.where(apply,g.cat(rawRanks),x.targetRawRanks);values.nextTargetStatusKindsBytes=g.where(apply,g.cat(rawKinds),x.targetStatusKindsBytes);
  values.nextSourceRawFlagsBytes=g.where(same,values.nextTargetRawFlagsBytes,x.sourceRawFlagsBytes);values.nextSourceStatusKindsBytes=g.where(same,values.nextTargetStatusKindsBytes,x.sourceStatusKindsBytes);
  values.nextTargetRawTimers=g.where(apply,g.cat(rawTimers),x.targetRawTimers);values.nextSourceRawTimers=g.where(same,values.nextTargetRawTimers,x.sourceRawTimers);
  for(const[name,value]of Object.entries(values))g.output(value,name);
  g.contract.actionIds=COMMON_SUPPORTED_ACTION_IDS;
  g.contract.boundary='Shared100 is consumed before testing target death; source death/incapacity suppresses the iteration. When the shared cover router must run after this draw, sharedAlreadyDrawn+sharedRoll forwards that single original draw and the effect does not draw it again. HP-crossing anger, wake recovery, weapon callback RNG and target-party coup remain inside the target loop. Source after-action coup and all-enemy anger are outside. Source and target may belong to the same side and may be the same actor.';
  g.contract.history='USA021eb5d0 target-loop tail and0208978c: every processed party-source/enemy-target iteration shifts stats32 to34 and writes the original source ID to32, even on miss or after lethal damage. Death/escape first clear both IDs; a party lethal hit consequently ends [sourceID,-1]. Planning category2 also sets stats3c bit1. Missing and already-dead targets do not reach this tail.';
  g.contract.partyPacked='JPN021e8458: party magic/mending interpolation truncates the slope product before spread; no scaling consumes range then spread. Six original special stat rows are encoded as data at JPN021ff082. sourcePackedScale holds raw party auxiliary word0/word4 low10, independent of actor attack. Enemy base0 consumes one spread draw. Critical actions1/219/505 use attack*.95..1.05; other eligible actions use signed16(rawBase)*1.5..2.0 before shared multipliers.';
  g.contract.stateSelectors=COMMON_STATE_SELECTOR_RULES;
  g.contract.additionalRanks=COMMON_ADDITIONAL_RANK_AUTHORITY;
  g.contract.additionalBlind=COMMON_ADDITIONAL_BLIND_AUTHORITY;
  g.contract.additionalTension=COMMON_TENSION_REDUCTION_AUTHORITY;
  g.contract.additionalDispel={body:'JPN021e4584 / matching021e3cec',clear:'JPN021eb028 / matching021ea85c',order:'Operation1 invokes additional12 before primary HP application regardless of accuracy/guard/zero damage. The same original176-byte dispel mask and stat-rank recomputation are used; the body itself draws no RNG.'};
  g.contract.additionalParalysis='Matching021e3a34: additional11 checks positive damage, target presence, resistance/species eligibility and living/non-high-tension state before bounded100. Party chance is word14 bits7..13, enemy chance bits0..6; critical overrides only the chance. Row82 requires enemy species9 with25% chance, row88 metal uses12.5%. Success refreshes duration3/recovery0 and clears sleep, confusion, skip, ordinary defend, low tension and flags18 bit5. The original setter also clears that flag for direct sleep/paralysis.';
  g.contract.additionalPoison='Matching021e303c: additional4 uses raw stats4d, checks the living/high predicate before bounded100, and refuses ordinary poison over active severe poison. Party chance uses word14 bits7..13 and enemy chance bits0..6; multiply then divide by100 in binary32. Critical guarantees only after nonzero resistance and state eligibility. The setter runs before primary HP damage, so lethal damage later clears its state without refunding the draw.';
  g.contract.stances={rules:COMMON_STANCE_RULES,blade:'Operation66 is the original message-only body. The planning preprocess separately creates raw flags18 bit5 for action476; the original turn-status tail clears it.'};
  g.contract.rawDamage='JPN021e7328: original damage element resistance precedes max(weapon elemental candidate, Force candidate). Force uses source word18 bit7 and word22 bits9..11; dual-element candidates round separately. Species equipment, fire/ice flags, species8 shield, magic barrier rank6 and breath barrier rank7 follow in their original multiply order. Healing operation2 ignores magic barrier. Operation22/23 creates barrier ranks; dispel, death and escape return the corresponding raw state/timer masks. The common post-status module owns expiration.';
  g.contract.defend='Defend0..3 use the ordinary multiplier. Values6..8 require coverResolved; values4/5/9 and party acrobat require routingResolved from the shared source/target router. Values above3 add no defend multiplier, matching the original <=3 check.';
  g.contract.routing='The common router owns source/target IDs and cached decisions. criticalAlreadyDrawn forwards the effective hit flag without another RNG draw; allowTension suppresses coefficient/bonus without erasing stored tension. resetCombo suppresses normal combo update. originalSourceId and originalActionId retain command provenance for history and target coup. isCounter suppresses the original weapon callback.';
  g.contract.bladeDefense='Original stats18 bit5 halves defend-eligible postprocess damage after ordinary defend. The command recoil callback is a separate shared graph after all-enemy reaction and source after-action recovery; it reads the final current target flags, so a paralysis setter that clears blade defense also prevents its later recoil.';
  g.contract.weaponPostprocess=COMMON_WEAPON_POSTPROCESS_AUTHORITY;
  g.contract.weaponSpecies={fields:COMMON_WEAPON_SPECIES_FIELDS,propertyWordOffsets:[0x2fc,0x300,0x304],encoding:'Twelve signed six-bit coefficients, species1..12. Each coefficient is divided by10 with the original binary32 rounding before multiplying damage. sourceWeaponSpeciesProvided=false preserves the original narrow input ABI; the shared battle runner supplies the complete array.'};
  g.contract.exclusions=['Allocation failure and additional equipment proc effects require further shared effects.','Party item category3 requires original inventory and action-work state. Its caller is rejected before MP/RNG mutation; enemy use has no party inventory tail.','Actions97/121 have separate target-list/final-hit handlers and explicitly report supported0 pending those common command semantics.','Unknown action operation/selector/additional effect is supported0 and preserves state.'];
  return g;
}

export function buildCommonCommandEnemyReaction(){
  const g=new Graph('rom-common-command-enemy-reaction',commonContract('命令後に生存敵全体をroster順で処理する怒り反応。技カテゴリ19/20と会心24の順序を保持します。'));
  const seed=input(g,'seed',8),position=input(g,'position',1,'int32'),source=actor(g,inputActor(g,'sourceActor')),enemy=actor(g,inputActor(g,'targetActor')),stateInput=inputAux(g,'targetAux'),cfg=object(COMMON_CONFIG_FIELDS,g.split(inputConfig(g,'targetConfig'),7)),other=g.split(input(g,'otherAngerChances',2,'float32',{min:0,max:100},[0,0]),2),action=input(g,'actionId'),critical=input(g,'critical',1,'bool',flagDomain,false),enabled=input(g,'enabled',1,'bool'),rng=new RandomGraph(g,seed,position),active=g.and(enabled,asBool(g,source.party),g.eq(enemy.party,0),g.gt(enemy.hp,0));let state=aux(g,stateInput),activated=zero(g);
  for(const[condition,chance]of[[g.eq(lookup(g,action,'category'),5),other[0]],[g.eq(lookup(g,action,'category'),12),other[1]],[critical,cfg.angerCriticalChance]]){const result=angerCheck(g,rng,state,{gate:g.and(active,condition),blocked:blocked(g,enemy),chance,minimum:cfg.angerMin,maximum:cfg.angerMax,sourceId:source.id});state=result.aux;activated=g.or(activated,result.activated);}
  for(const[name,value]of Object.entries({nextSeed:rng.seed,nextPosition:rng.position,nextTargetAux:pack(g,COMMON_AUX_FIELDS,state),angerActivated:scalar(g,activated),consumed:g.sub(rng.position,position)}))g.output(value,name);return g;
}

export function buildCommonCommandEnd(){
  const g=new Graph('rom-common-command-end',commonContract('命令終了のテンション消費、味方行動者の必殺抽選とcontext更新。複数対象全体に1回適用します。'));
  const seed=input(g,'seed',8),position=input(g,'position',1,'int32'),source=actor(g,inputActor(g,'sourceActor')),state=aux(g,inputAux(g,'sourceAux')),cfg=object(COMMON_CONFIG_FIELDS,g.split(inputConfig(g,'sourceConfig'),7)),tension=object(COMMON_TENSION_FIELDS,g.split(inputTension(g,'sourceTension'),3)),action=input(g,'actionId'),context=g.split(input(g,'context',2,'float32',{min:0,max:65535,integer:true},[1,0]),2),enabled=input(g,'enabled',1,'bool'),enemies=input(g,'opponentsAlive',1,'bool',flagDomain,true),count=input(g,'chargedPartyCount',1,'float32',{min:0,max:4,integer:true},0),coupBlocked=input(g,'coupBlocked',1,'bool',flagDomain,false),rng=new RandomGraph(g,seed,position);
  // The source coup helper is entered after recoil even when that recoil
  // killed the source. It clears a pending skip byte before checking death;
  // its blocked predicate still prevents any roll or charge on a dead actor.
  const scenarioMode=commonScenarioMode(g,input(g,'scenarioId',1,'float32',{min:-1,max:65535,integer:true},-1));
  const allowConsumption=input(g,'consumeTension',1,'bool',flagDomain,true),counterOccurred=input(g,'counterOccurred',1,'bool',flagDomain,false),supported=g.and(actionSupported(g,action),g.or(g.eq(source.party,0),g.not(g.eq(lookup(g,action,'planningCategory'),3)))),entered=g.and(enabled,supported),active=g.and(entered,g.gt(source.hp,0)),charge=coup(g,rng,source,state,{gate:g.and(entered,asBool(g,source.party),enemies),chance:g.add(cfg.coupAfterActionChance,lookup(g,action,'coupBonus')),chargedPartyCount:count,blockedByBattle:g.or(coupBlocked,g.gt(scenarioMode,0))}),consumed=g.and(active,allowConsumption,g.gt(lookup(g,action,'tensionFlag'),0),g.or(asBool(g,tension.low),asBool(g,tension.high)));
  source.defend=g.where(g.and(active,g.not(counterOccurred),g.eq(lookup(g,action,'afterAction'),2)),1,source.defend);
  for(const key of COMMON_TENSION_FIELDS)tension[key]=g.where(consumed,0,tension[key]);
  const rawStatus=[...g.split(input(g,'sourceRawStatusBytes',4,'float32',byteDomain,[0,0,0,0]),4)];
  for(const bit of[23,24])rawOverlay(g,rawStatus,bit,g.where(consumed,0,rawBit(g,rawStatus,bit)));
  const low=g.add(context[0],scalar(g,entered)),carry=g.floor(g.mul(low,1/65536)),high=g.add(context[1],carry),nextContext=g.cat([g.sub(low,g.mul(carry,65536)),g.sub(high,g.mul(g.floor(g.mul(high,1/65536)),65536))]);
  for(const[name,value]of Object.entries({nextSeed:rng.seed,nextPosition:rng.position,nextSourceActor:pack(g,ACTOR_FIELDS,source),nextSourceAux:pack(g,COMMON_AUX_FIELDS,state),nextSourceTension:pack(g,COMMON_TENSION_FIELDS,tension),nextSourceRawStatusBytes:g.cat(rawStatus),nextContext,charged:scalar(g,charge),tensionConsumed:scalar(g,consumed),consumed:g.sub(rng.position,position),supported:scalar(g,supported)}))g.output(value,name);return g;
}

export async function buildCommonActions(){
  const graphs=[buildCommonCommandBegin(),buildCommonTargetEffect(),buildCommonCommandEnemyReaction(),buildCommonCommandEnd()],results=[];
  for(const graph of graphs){const saved=await graph.save();results.push({...saved,sha256:createHash('sha256').update(graph.model()).digest('hex')});}
  const report={schema:'dq9-common-action-build-v1',models:results,actionRules:COMMON_ACTION_RULES,composition:'One shared module set. All action dispatch comes from operation/selector/flags columns. Boss definition IDs never affect the program or model set.'};
  const coverage={schema:'dq9-common-action-coverage-v1',supportedActionIds:COMMON_SUPPORTED_ACTION_IDS,actionDefinitions:COMMON_ACTION_RULES.length,actionRules:COMMON_ACTION_RULES,exclusions:graphs[1].contract.exclusions,qualification:'Supported action records share these numeric operation families. Source/target state admission is checked by the model; this list is not an independent ROM verification claim for every input.'};
  await writeFile(new URL('common-action-models.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
  await writeFile(new URL('common-action-coverage.json',import.meta.url),JSON.stringify(coverage,null,2)+'\n');return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const report=await buildCommonActions();console.log(JSON.stringify({models:report.models.map(({name,bytes,nodes,sha256})=>({name,bytes,nodes,sha256})),actionDefinitions:COMMON_ACTION_RULES.length,representedCommonActions:COMMON_SUPPORTED_ACTION_IDS.length}));}
