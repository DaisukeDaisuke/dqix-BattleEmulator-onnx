// Five audited ROM records, reduced to the fields needed by the 1v1 core.
// Keep probabilities/resistance as exact ROM binary32 operations, not learned
// approximations. Source records were matched against all681 original records.
import rom from '../restored/dq9-unified/data/rom.mjs';
export const BOSS_ACTION_IDS=[1,44,48,228,275];
export const BOSS_STATUS_FIELDS=[0,1].flatMap(i=>['poisonKind','paralysisDuration','paralysisRecovery','sleepDuration','sleepRecovery','confusionDuration','confusionRecovery'].map(k=>`a${i}_${k}`));
export const BOSS_RESISTANCE_FIELDS=['defenseRank','agilityRank','sleep','poison','physical'];
export function decodeBossActionRule(id){
  const action=rom.actions.find(x=>x.id===id),bytes=Uint8Array.from(action.raw.match(/../g),x=>parseInt(x,16)),view=new DataView(bytes.buffer),w14=view.getUint32(0x14,true),w1c=view.getUint32(0x1c,true),w2c=view.getUint32(0x2c,true),w10=action.w10;
  return {id,name:action.name,operation:action.operation,mpCost:action.mpCost,damageElement:(action.w08>>>22)&31,preCritical:Number([3,4].includes(w14>>>28)&&((w1c>>>14)&31)===0),dodge:Number(!!(w10&0x20)),guard:Number(!!(w10&0x40)),blind:Number(!!(w10&8)),defend:Number(!!(w10&0x10)),buffAttack:Number(!!(w10&0x200)),recover:Number(!!(w10&0x800)),combo:Number(!!(w2c&(1<<27))),accuracyMode:(action.w18>>>16)&3,baseChance:w14&127,criticalWeight:(w14>>>21)&127,additional:action.w18&31,parameter:view.getInt16(0x30,true),secondaryParameter:view.getInt16(0x32,true),raw:action.raw};
}
export const BOSS_ACTION_RULES=BOSS_ACTION_IDS.map(decodeBossActionRule);
export function bossRuleColumns(g,actionId,rules=BOSS_ACTION_RULES){
  const ids=rules.map(x=>x.id);
  let index=g.constant(0);for(let i=1;i<ids.length;i++)index=g.where(g.eq(actionId,ids[i]),i,index);
  const integerIndex=g.cast(index,'int32'),columns={};
  for(const key of Object.keys(rules[0]).filter(k=>!['name','raw'].includes(k)))columns[key]=g.op('Gather',[g.constant(rules.map(x=>x[key]),'float32',[ids.length]),integerIndex],{axis:0},{shape:['N',1]});
  return columns;
}
// The original susceptibility getter can add25 to a raw byte. Store every
// reachable division result, including percentages256..280, exactly.
export function resistanceFraction(g,percent){return g.op('Gather',[g.constant(Array.from({length:281},(_,i)=>Math.fround(i/100)),'float32',[281]),g.cast(percent,'int32')],{axis:0},{shape:['N',1]});}
