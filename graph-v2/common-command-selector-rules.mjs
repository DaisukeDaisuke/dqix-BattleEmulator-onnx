// Original command-count and current-HP selectors. These are shared numeric
// rules, independent of actor definition, enemy group and action scheduling.
import {Graph} from './graph-builder.mjs';

export const COMMON_COMMAND_SELECTOR_RULES=Object.freeze([
  {selector:34,kind:'target-count',originalAddress:'0x021d9ae4',matchingSource:'src/Combat/Overlay_24/func_ov024_021d9224.cpp'},
  {selector:35,kind:'current-hp-and-recoil',originalAddress:'0x021d9afc',matchingSource:'src/Combat/Overlay_24/func_ov024_021d923c.cpp'}
].map(Object.freeze));
export const COMMON_COMMAND_SELECTOR_IDS=Object.freeze(COMMON_COMMAND_SELECTOR_RULES.map(row=>row.selector));

export function commonCommandSelectorDamage(g,{selector,fallback,sourceHp,targetHp,targetCount,sourcePresent,targetPresent,enabled,priorScratch}){
  const countRule=g.eq(selector,34),hpRule=g.eq(selector,35),supported=g.or(countRule,hpRule),active=g.and(enabled,supported),hpActive=g.and(active,hpRule,sourcePresent,targetPresent),
    counted=g.floor(g.op('Div',[g.mul(fallback,4),g.add(targetCount,1)])),hpDamage=g.floor(g.mul(targetHp,Math.fround(.8))),scratch=g.add(g.floor(g.mul(sourceHp,Math.fround(.8))),2),
    damage=g.where(active,g.where(countRule,counted,g.where(hpActive,hpDamage,fallback)),fallback);
  return{damage,supported,active,scratchWritten:hpActive,nextScratch:g.where(hpActive,scratch,priorScratch)};
}

export function buildCommonCommandSelectors(){
  const g=new Graph('rom-common-command-selectors',{
    inputContractVersion:1,scope:'Original selector34 count division and selector35 current-HP damage/scratch producer. Caller base-damage RNG, later damage multipliers, after-action source damage and command completion are outside this primitive.',
    rules:COMMON_COMMAND_SELECTOR_RULES,
    integerDivision:'Selector34 takes the complete resolved target count as its fourth argument. With fallback0..65535 and count0..32, binary32 Div followed by Floor equals the original nonnegative signed integer division: any noninteger quotient is at least1/33 from an integer, exceeding its rounding error.',
    hpSideEffect:'Selector35 reads both current actor HP values. Missing either actor preserves fallback and scratch. Otherwise it writes trunc(binary32(sourceHP*.8))+2 into caller scratch and returns trunc(binary32(targetHP*.8)). It does not consume randomness.',
    inputDomains:{selector:{min:0,max:66,integer:true},fallback:{min:0,max:65535,integer:true},sourceHp:{min:0,max:65535,integer:true},targetHp:{min:0,max:65535,integer:true},targetCount:{min:0,max:32,integer:true},priorScratch:{min:0,max:65535,integer:true},sourcePresent:{values:[true,false,0,1]},targetPresent:{values:[true,false,0,1]},enabled:{values:[true,false,0,1]}},
    defaults:{selector:34,fallback:99,sourceHp:100,targetHp:200,targetCount:3,priorScratch:37,sourcePresent:true,targetPresent:true,enabled:true},feedback:{priorScratch:'nextScratch'},
    authority:{table:'JPN021ff9c0 entries34/35',matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10'}
  });
  const inputs={};for(const name of Object.keys(g.contract.defaults))inputs[name]=g.input(name,['N',1],['enabled','sourcePresent','targetPresent'].includes(name)?'bool':'float32');
  const result=commonCommandSelectorDamage(g,inputs);for(const[name,value]of Object.entries(result))g.output(typeof value==='string'&&['supported','active','scratchWritten'].includes(name)?g.cast(value,'float32'):value,name);return g;
}
