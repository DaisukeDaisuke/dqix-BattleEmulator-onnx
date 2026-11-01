import {ACTOR_FIELDS} from './rules.mjs';
import {ACTION_STATUSES,CONFIG_FIELDS} from './extended-rules.mjs';
import {COMMON_RAW_TIMER_FIELDS} from './common-modifier-rules.mjs';

// Per-actor storage. No field in this ABI names a boss or another actor slot.
export {ACTOR_FIELDS};
export const COMMON_AUX_FIELDS=Object.freeze([
  'coupReady','coupDuration','coupSkip','anger','angerDuration','angerRecovery','angerTarget',
  ...ACTION_STATUSES.flatMap(({field})=>[field+'Duration',field+'Recovery'])
]);
export const COMMON_STATUS_FIELDS=Object.freeze([
  'poisonKind','paralysisDuration','paralysisRecovery','sleepDuration','sleepRecovery','confusionDuration','confusionRecovery'
]);
export const COMMON_CONFIG_FIELDS=Object.freeze([...CONFIG_FIELDS]);
export const COMMON_TENSION_FIELDS=Object.freeze(['stage','low','high']);
export const COMMON_RESISTANCE_FIELDS=Object.freeze(Array.from({length:22},(_,i)=>'element'+(i+1)));
export const COMMON_PREPARATION_FIELDS=Object.freeze(['appealMode','appealTarget','skipKind','incapacitatedThisAction','pendingRecoveryMessage']);
export const COMMON_HISTORY_FIELDS=Object.freeze(['recentSourceId','previousSourceId']);
export const COMMON_MAGIC_FIELDS=Object.freeze(['magicalMight','magicalMending']);
// GetAttackBaseDamage reads these packed auxiliary fields directly. Their
// storage meaning is explicit; do not infer them from attack or base stats.
export const COMMON_PACKED_SCALE_FIELDS=Object.freeze(['partyDataWord0Low10','partyDataWord4Low10']);
export const COMMON_RAW_RANK_FIELDS=Object.freeze(['attack','defense','agility','charm','magicalMight','magicalMending','magicBarrier','breathBarrier','rank8','rank9']);
export const COMMON_RAW_STATE_ABI=Object.freeze({
  rawStatusBytes:'Little-endian bytes of the original current stats word14; no uint32 is rounded through float32.',
  rawFlagsBytes:'Little-endian bytes of current stats word18.',
  statusKindsBytes:'Little-endian bytes of current stats word22. Force kind occupies bits9..11 independently of poison kind bits0..1.',
  rawRanks:COMMON_RAW_RANK_FIELDS,
  rawTimers:COMMON_RAW_TIMER_FIELDS,
  sourceSpecies:'Original monster species field, or the resolved source species used by the original species predicate; 0..15.'
});
export const COMMON_ACTOR_ABI=Object.freeze({
  schema:'dq9-common-actor-v1',actors:ACTOR_FIELDS,aux:COMMON_AUX_FIELDS,
  status:COMMON_STATUS_FIELDS,tension:COMMON_TENSION_FIELDS,config:COMMON_CONFIG_FIELDS,
  resistances:COMMON_RESISTANCE_FIELDS,preparation:COMMON_PREPARATION_FIELDS,history:COMMON_HISTORY_FIELDS,magic:COMMON_MAGIC_FIELDS,packedScale:COMMON_PACKED_SCALE_FIELDS,
  rawState:COMMON_RAW_STATE_ABI,
  side:'actors.party is 1 for a party actor and 0 for an enemy; actors.id is the original actor ID, not an array index.',
  identifiers:'Actor lookup, group membership and source/target indexing are owned by the common battle state. No two-actor battle is implied by a source/target effect call.',
  configuration:'coupAfterActionChance belongs to the acting party actor. The anger chance/min/max fields belong to the affected enemy. enemyAppealGate is a resolved actor property.',
  resistance:'Element IDs 1..22 map to columns 0..21; element 0 has identity resistance.',
  tensionState:'Stage and low/high flags are independent original state and must not be reconstructed from one another.'
});
export const commonAuxDefault=()=>COMMON_AUX_FIELDS.map(name=>name==='angerTarget'?-1:0);
