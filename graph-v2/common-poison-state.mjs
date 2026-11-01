// Original operation6/7 and the raw state setters they call. The compact
// actor.poison field continues to mean severe poison; ordinary poison lives
// in raw word14 bit1 with subtype1 in word22 low2.
export function commonPoisonState(g,{operation,parameter,hit,present,dead,high,active,kind}){
  const create=g.eq(operation,6),cure=g.eq(operation,7),severe=g.gt(parameter,0);
  const created=g.and(create,hit,present,g.not(dead),g.not(high),g.or(severe,g.not(g.and(active,g.eq(kind,2)))));
  const cured=g.and(cure,hit,present,active,g.or(g.eq(kind,1),g.eq(kind,2)));
  const nextActive=g.and(g.not(cured),g.or(created,active));
  const nextKind=g.where(cured,0,g.where(created,g.where(severe,2,1),kind));
  return{active:nextActive,kind:nextKind,severe:g.and(nextActive,g.eq(nextKind,2)),created,cured,applied:g.or(created,cured)};
}

// Matching021e303c: additional4 runs before primary HP application, so a
// lethal hit still draws and may set poison before the later death reset.
// Raw stats4d is used directly, independently of resolved ailment modifiers.
export function commonAdditionalPoison(g,rng,{enabled,damage,present,dead,high,active,kind,parameter,rawResistance,partySource,partyChance,enemyChance,critical}){
  const severe=g.gt(parameter,0),eligible=g.and(enabled,g.gt(damage,0),present,g.not(dead),g.not(high),g.gt(rawResistance,0),g.or(severe,g.not(g.and(active,g.eq(kind,2))))),roll=rng.bounded(eligible,100),baseChance=g.where(partySource,partyChance,enemyChance);
  // Preserve multiply-then-divide binary32 order from the original callback.
  const chance=g.where(critical,100,g.op('Div',[g.mul(baseChance,rawResistance),g.constant(100)])),applied=g.and(eligible,g.lt(roll,chance));
  return{applied,kind:g.where(severe,2,1),severe};
}
