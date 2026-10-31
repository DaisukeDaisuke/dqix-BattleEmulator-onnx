import {ACTOR_FIELDS,EXAMPLE_ACTORS} from './rules.mjs';
// Source order is recovery first for every status, then duration decrement.
export const ACTION_STATUSES=[
  {field:'blind',steps:4,thresholds:[100,88,63,38],durationOffset:0x5f,recoveryOffset:0x82},
  {field:'attackRank',steps:4,thresholds:[100,88,75,63],durationOffset:0x6e,recoveryOffset:0x91},
  {field:'defenseRank',steps:4,thresholds:[100,88,75,63],durationOffset:0x6f,recoveryOffset:0x92},
  {field:'agilityRank',steps:4,thresholds:[100,88,75,63],durationOffset:0x70,recoveryOffset:0x93},
  {field:'doubleGuard',steps:4,thresholds:[100,88,63,38],durationOffset:0x76,recoveryOffset:0x99},
  {field:'doubleDodge',steps:4,thresholds:[100,88,63,38],durationOffset:0x77,recoveryOffset:0x9a},
  {field:'acrobat',steps:1,thresholds:[100,88,63,38],durationOffset:0x79,recoveryOffset:0x9c}
];
export const AUX_FIELDS=['coupReady','coupDuration','coupSkip','anger','angerDuration','angerRecovery','angerTarget',...Array.from({length:2},(_,actor)=>ACTION_STATUSES.flatMap(s=>[`a${actor}_${s.field}Duration`,`a${actor}_${s.field}Recovery`])).flat()];
export const CONFIG_FIELDS=['coupAfterActionChance','angerCriticalChance','angerHalfChance','angerQuarterChance','angerMin','angerMax','enemyAppealGate'];
export const DEFAULT_AUX=AUX_FIELDS.map(name=>name==='angerTarget'?-1:0);
export const DEFAULT_CONFIG=[1,0,0,0,2,4,0];
export const DEFAULT_EXTENDED_ACTORS=[...EXAMPLE_ACTORS];
DEFAULT_EXTENDED_ACTORS[ACTOR_FIELDS.indexOf('criticalThreshold')]=500;
DEFAULT_EXTENDED_ACTORS[ACTOR_FIELDS.indexOf('guardRate')]=.5;
DEFAULT_EXTENDED_ACTORS[ACTOR_FIELDS.indexOf('level')]=15;
DEFAULT_EXTENDED_ACTORS[ACTOR_FIELDS.length+ACTOR_FIELDS.indexOf('id')]=192;
export const EXTENDED_PROVENANCE={
  profile:'original bilyouma_new_arugo LV15 compile profile, party HP89/MP18/ATK82/DEF90/AGI58, critical500/10000, dodge2, guard literal0.5; level15 inferred from compile profile name, not an original Player member.',
  enemy:'ROM monster303 病魔パンデルム: HP696/MP255/ATK68/DEF68/AGI50, raw anger rules0x1c84a591 (trigger17 chance75,trigger18 chance100), duration2..4, appealResistance0. Normal HP crossings trigger3/4 and critical trigger24 therefore have chance0 but still consume anger-check RNG.',
  coup:'ROM level-based eligibility>=10 and duration7/8/9/10. The original stores6 after its own different turn timing; this graph uses ROM phase timing. One party means successful eligibility implies zero already-charged peers and multiplier1.',
  statuses:'restored/dq9-unified/data/status-progress.mjs; only represented seven post-action timers plus end-of-turn HP/MP regen/severe poison are supported.',
  sourceScope:'Actions are preselected normal attacks against each other. AI selection, general targeting, camera, item/spell/equipment-specific effects and primary ailments remain outside this PoC.'
  ,actorIds:'v2 uses actual full-caller ROM actor IDs: party0, enemy0xc0 (192). Earlier primitive/reduced examples used logical enemy slot4. Slot4 and ID192 refer to the same first enemy, but raw combo target values differ and must not be compared without the explicit mapping.'
};
