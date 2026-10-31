// Small data tables shared by graph generation and the HTML-facing input API.
// Rules are fixed coefficients and state layouts; they are not learned weights.
export const ACTOR_FIELDS=['hp','maxHp','mp','maxMp','baseAttack','baseDefense','attackRank','defenseRank','blind','sleep','confusion','paralysis','skip','defend','acrobat','doubleDodge','doubleGuard','party','dodgeRate','guardRate','criticalThreshold','hpRegen','hpDuration','hpRecovery','mpRegen','mpDuration','mpRecovery','poison','level','baseAgility','agilityRank','hpEquipmentRegen','id'];
export const COMBO_FIELDS=['side','count','action','target','contextLo','contextHi'];
export const STAT_RULES=[{name:'attack',kind:'quarter',partyCap:true},{name:'defense',kind:'defense',partyCap:true},{name:'agility',kind:'defense'},{name:'charm',kind:'charm'},{name:'magicalMight',kind:'half'},{name:'magicalMending',kind:'half'}];
export const COMBO_MULTIPLIERS=[1,Math.fround(1.2),1.5,2];
export const DEFEND_MULTIPLIERS=[1,.5,Math.fround(.1),0];
export const RECOVERY_THRESHOLDS=[1,.875,.75,.625];
export const exampleActor=(party)=>{
  const values=Object.fromEntries(ACTOR_FIELDS.map(k=>[k,0]));
  Object.assign(values,party?{hp:89,maxHp:89,mp:18,maxMp:18,baseAttack:82,baseDefense:90,baseAgility:58,party:1,dodgeRate:2,guardRate:9,criticalThreshold:200,level:9,id:0}:{hp:696,maxHp:696,mp:255,maxMp:255,baseAttack:68,baseDefense:68,baseAgility:50,party:0,dodgeRate:0,guardRate:0,criticalThreshold:0,level:9,id:4});
  return ACTOR_FIELDS.map(k=>values[k]);
};
export const EXAMPLE_ACTORS=[...exampleActor(true),...exampleActor(false)];
export const SOURCES={rng:'matching/src/Util/Random.cpp',physical:'matching/src/Combat/Main/BasicAttackCalculation.cpp',buffs:'matching/src/Combat/Overlay_0/UpdateCombatantBuffs.cpp',combo:'matching/src/Combat/Overlay_24/func_ov024_021ea584.cpp',postprocess:'matching/src/Combat/Overlay_24/func_ov024_021e6a90.cpp',hit:'restored/dq9-unified/core/hit.hpp',strike:'restored/dq9-unified/core/action_loop.cpp',vitals:'restored/dq9-unified/core/effect_environment.hpp',turnTail:'restored/dq9-unified/core/turn_end.cpp'};
