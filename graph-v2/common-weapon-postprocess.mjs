// Original party equipment predicates inside JPN021e7328 / matching021e6a90.
// Equipment traits are resolved input data, shared by every action/encounter.
// The equipment getter returns false when the original weapon halfword2ac<=0.
export const COMMON_WEAPON_POSTPROCESS_AUTHORITY={
  caller:'JPN021e7328 / matching func_ov024_021e6a90',
  clearGuard:'matching func_02085154: equipped property word2f4 bit5; matching02156e30 / JPN021585b0 skips the guard draw before the same property clears hit flag bit2 in the postprocessor',
  alwaysOne:'matching func_020851d8: equipped property word2f4 bit10',
  order:'The guard-bypass property suppresses its guard draw. The always-one property retains earlier dodge/guard draws. Postprocess changes occur after resistance, barriers, ordinary defend and blade reduction; before hit-flag zeroing, metal minimum and late metal tension.'
};

export function decodeWeaponPostprocessRules(action){
  return{weaponGuardClearFlag:action.w10>>>19&1};
}

export function commonWeaponClearsGuard(g,r,{partySource,weaponClearGuard}){
  return g.and(partySource,g.gt(r.weaponGuardClearFlag,0),weaponClearGuard);
}

export function commonWeaponPostprocess(g,damage,r,{hit,partySource,weaponClearGuard,weaponAlwaysOne,dodge,guard}){
  const clearGuard=g.and(hit,commonWeaponClearsGuard(g,r,{partySource,weaponClearGuard})),
    alwaysOne=g.and(hit,partySource,g.gt(r.equipmentFlag,0),weaponAlwaysOne);
  return{
    damage:g.where(alwaysOne,1,damage),
    dodge:g.and(dodge,g.not(alwaysOne)),
    guard:g.and(guard,g.not(g.or(clearGuard,alwaysOne))),
    alwaysOne
  };
}
