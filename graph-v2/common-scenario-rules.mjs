// The original context selector at matching0215fc60 reads context+0x81fe.
// These two scenario values change shared action rules, not the program.
export function commonScenarioMode(g,scenarioId){
  return g.where(g.eq(scenarioId,0x320),1,g.where(g.eq(scenarioId,0x321),2,0));
}

// matching021da9e0: this runs inside the primary operation body, after the
// ordinary postprocessor. Its result is the primary event/HP amount; the
// caller's internal damage and its positive-damage tails remain unchanged.
export function commonScenarioPrimaryDamage(g,damage,{mode,actionId,targetId,targetHp,active}){
  const applies=g.and(active,g.gt(mode,0),g.eq(actionId,1),g.eq(targetId,0));
  const fraction=g.floor(g.mul(Math.fround(.9),targetHp));
  const surviving=g.max(1,g.where(g.le(targetHp,fraction),g.sub(targetHp,1),fraction));
  return g.where(applies,g.where(g.eq(mode,1),surviving,targetHp),damage);
}
