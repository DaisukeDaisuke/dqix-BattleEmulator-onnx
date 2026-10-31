// Machine-readable host contracts. These bounds are proof assumptions for
// exact arithmetic, not parameters that a trained model has learned.
import {ACTOR_FIELDS} from './rules.mjs';
import {AUX_FIELDS,CONFIG_FIELDS} from './extended-rules.mjs';
const integer=(min,max)=>({min,max,integer:true});
const values=x=>({values:x});
const numericFields={
  hp:integer(0,32767),maxHp:integer(1,32767),mp:integer(0,32767),maxMp:integer(0,32767),
  baseAttack:integer(0,65535),baseDefense:integer(0,65535),baseAgility:integer(0,65535),
  attackRank:integer(-2,2),defenseRank:integer(-2,2),agilityRank:integer(-2,2),
  defend:integer(0,3),dodgeRate:{min:0,max:100},guardRate:{min:0,max:100},criticalThreshold:{min:0,max:10000},
  hpDuration:integer(0,255),mpDuration:integer(0,255),hpRecovery:integer(0,4),mpRecovery:integer(0,4),level:integer(0,99),
  id:integer(0,255),
};
export function extendedInputContract({battle=false}={}){
  const actors=[0,1].flatMap(actor=>ACTOR_FIELDS.map(field=>({name:`actor${actor}.${field}`,...(numericFields[field]??integer(0,1)),...(field==='id'?values([actor?192:0]):{}),...(field==='party'?values([actor?0:1]):{}),...(actor===0&&field==='acrobat'?values([0]):{}),...(actor===1&&field==='criticalThreshold'?values([0]):{})})));
  const aux=AUX_FIELDS.map(name=>({name,...(name==='coupDuration'?integer(0,15):name==='coupSkip'?integer(0,255):name==='angerTarget'?integer(-32768,32767):/Recovery$/.test(name)?integer(0,4):/Duration$/.test(name)?integer(0,255):integer(0,1))}));
  const config=CONFIG_FIELDS.map(name=>({name,...(name==='enemyAppealGate'?integer(0,1):name==='angerMin'||name==='angerMax'?integer(0,255):{min:0,max:100})}));
  const inputDomains={seed:{...integer(0,255),width:8},position:integer(1,4950),combo:{min:0,max:65535,integer:true},context:{...integer(0,65535),width:2}};
  const combo=[{name:'side',...integer(0,2)},{name:'count',...integer(0,126)},{name:'action',...integer(0,65535)},{name:'target',...integer(-1,255)},{name:'contextLo',...integer(0,65535)},{name:'contextHi',...integer(0,65535)}];
  delete inputDomains.combo;
  if(battle)Object.assign(inputDomains,{turn:integer(1,1000),maxTurns:integer(1,1000),outcome:integer(0,2),phase:integer(0,3),order:{...integer(-1,1),width:2},damageLedger:{...integer(0,131070),width:2},surprise:integer(0,2)});
  else Object.assign(inputDomains,{sourceIndex:integer(0,1),enabled:values([false,true,0,1])});
  const relations=[];
  for(let a=0;a<2;a++)for(const [current,max]of [['hp','maxHp'],['mp','maxMp']])relations.push({left:{input:'actors',index:a*ACTOR_FIELDS.length+ACTOR_FIELDS.indexOf(current)},op:'<=',right:{input:'actors',index:a*ACTOR_FIELDS.length+ACTOR_FIELDS.indexOf(max)}});
  return {inputContractVersion:1,inputDomains,fieldDomains:{actors,aux,config,combo},relations,validation:'Every numeric element must be finite. Input arrays have exactly the graph-declared width; check all element domains and relation rules before execution. Negative values are allowed only in explicitly signed rank/id/order fields. Unsupported primary ailments yield supported0 and freeze; a wrong actor side/id or unsupported party counter profile must be rejected by the host.'};
}

export function validateGraphInputs(contract,inputs){
  const failures=[];
  const inspect=(value,rule,path)=>{
    if(typeof value==='number'&&!Number.isFinite(value)){failures.push(`${path}: nonfinite`);return;}
    if(rule.values&&!rule.values.includes(value))failures.push(`${path}: allowed ${rule.values.join(',')}`);
    if(rule.min!==undefined&&(typeof value!=='number'||value<rule.min))failures.push(`${path}: minimum ${rule.min}`);
    if(rule.max!==undefined&&(typeof value!=='number'||value>rule.max))failures.push(`${path}: maximum ${rule.max}`);
    if(rule.integer&&!Number.isInteger(value))failures.push(`${path}: integer required`);
  };
  for(const [name,rule]of Object.entries(contract.inputDomains??{})){const array=Array.isArray(inputs[name])?inputs[name]:[inputs[name]];if(array.length!==(rule.width??1))failures.push(`${name}: exactly ${rule.width??1} elements required`);array.forEach((x,i)=>inspect(x,rule,`${name}[${i}]`));}
  for(const [name,rules]of Object.entries(contract.fieldDomains??{})){
    const array=inputs[name];if(!Array.isArray(array)||array.length!==rules.length){failures.push(`${name}: exactly ${rules.length} elements required`);continue;}
    rules.forEach((rule,i)=>inspect(array[i],rule,`${name}[${i}] ${rule.name??''}`));
  }
  for(const relation of contract.relations??[]){const left=inputs[relation.left.input]?.[relation.left.index],right=inputs[relation.right.input]?.[relation.right.index];if(relation.op==='<='&&!(left<=right))failures.push(`${relation.left.input}[${relation.left.index}] must be <= ${relation.right.input}[${relation.right.index}]`);}
  return failures;
}
