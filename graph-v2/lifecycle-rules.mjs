// Shared ROM rules used by both the action graph and the small ARM-fixture
// verification graph. Inputs are decoded state fields, not approximations.
const lookup=(g,key,values)=>values.slice(1).reduce((x,v,i)=>g.where(g.eq(key,i+1),v,x),g.constant(values[0]));
export function coupDamageBonus(g,damage,maxHp){
  let bonus=g.constant(0);
  for(const [threshold,value] of [[1,1],[2,2],[3,4],[4,8],[5,16],[6,32],[7,64],[8,90],[9,90]])bonus=g.where(g.and(g.gt(damage,0),g.ge(g.mul(damage,10),g.mul(maxHp,threshold))),value,bonus);
  return bonus;
}
export function coupLevelDuration(g,level){return g.where(g.ge(level,75),10,g.where(g.ge(level,50),9,g.where(g.ge(level,25),8,7)));}
export function coupEligibility(g,{gate,skip,level,blocked,ready}){
  return {eligible:g.and(gate,g.eq(skip,0),g.ge(level,10),g.not(blocked),g.eq(ready,0)),skip:g.where(gate,0,skip)};
}
export function angerCheck(g,rng,aux,{gate,blocked,chance,minimum,maximum,sourceId}){
  const roll=rng.bounded(gate,100),eligible=g.and(gate,g.eq(aux.anger,0),g.not(blocked));
  const width=g.add(g.sub(maximum,minimum),1),positive=g.gt(width,0),draw=g.and(eligible,positive);
  // NextRandomMax(nonpositive) returns0 and consumes no random number.
  const offset=g.where(positive,rng.bounded(draw,g.max(width,1)),0),duration=g.add(offset,minimum),activated=g.and(eligible,g.lt(roll,chance));
  return {activated,aux:{...aux,anger:g.where(activated,1,aux.anger),angerDuration:g.where(activated,duration,aux.angerDuration),angerRecovery:g.where(activated,0,aux.angerRecovery),angerTarget:g.where(activated,sourceId,aux.angerTarget)}};
}
export function advanceAnger(g,aux,{enabled,targetValid,sharedRoll}){
  const active=g.and(enabled,g.gt(aux.anger,0)),tick=g.and(active,g.gt(aux.angerDuration,0));
  const duration=g.where(tick,g.sub(aux.angerDuration,1),aux.angerDuration),recovery=g.where(g.and(tick,g.eq(duration,0)),1,aux.angerRecovery);
  const recover=g.and(active,targetValid,g.gt(recovery,0)),nextRecovery=g.max(g.sub(recovery,1),0),expired=g.and(active,g.or(g.not(targetValid),g.and(recover,g.lt(sharedRoll,lookup(g,nextRecovery,[100,87.5,75,62.5])))));
  return {...aux,anger:g.where(expired,0,aux.anger),angerDuration:g.where(expired,0,duration),angerRecovery:g.where(expired,0,g.where(recover,nextRecovery,recovery))};
}
export function coupTailTick(g,{ready,duration,enabled}){
  const tick=g.and(enabled,g.gt(ready,0)),remaining=g.where(g.eq(duration,0),15,g.sub(duration,1));
  return {ready:g.where(g.and(tick,g.eq(remaining,0)),0,ready),duration:g.where(tick,remaining,duration)};
}
