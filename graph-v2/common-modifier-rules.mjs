// Actor-local raw modifiers already used by the common damage pipeline.
// Offsets name bytes in currentStats, never a particular actor or encounter.
export const COMMON_MODIFIER_RULES=Object.freeze([
  {field:'magicBarrier',timerIndex:0,durationOffset:0x74,recoveryOffset:0x97,flag:'rawStatusBytes',bit:16,rank:6,thresholds:[100,88,63,38],steps:4},
  {field:'breathBarrier',timerIndex:2,durationOffset:0x75,recoveryOffset:0x98,flag:'rawStatusBytes',bit:17,rank:7,thresholds:[100,88,75,63],steps:4},
  {field:'fireShield',timerIndex:4,durationOffset:0x6c,recoveryOffset:0x8f,flag:'rawFlagsBytes',bit:1,thresholds:[100,88,75,63],steps:4},
  {field:'iceShield',timerIndex:6,durationOffset:0x6d,recoveryOffset:0x90,flag:'rawFlagsBytes',bit:2,thresholds:[100,88,75,63],steps:4},
  {field:'force',timerIndex:8,durationOffset:0x6a,recoveryOffset:0x8d,flag:'rawFlagsBytes',bit:7,kindBits:[9,10,11],thresholds:[100,88,63,38],steps:4}
].map(Object.freeze));
export const COMMON_RAW_TIMER_FIELDS=Object.freeze(COMMON_MODIFIER_RULES.flatMap(({field})=>[field+'Duration',field+'Recovery']));
export const COMMON_RAW_TIMER_OFFSETS=Object.freeze(COMMON_MODIFIER_RULES.flatMap(({durationOffset,recoveryOffset})=>[durationOffset,recoveryOffset]));
export const commonRawBit=(g,bytes,bit)=>{const q=g.floor(g.mul(bytes[bit>>>3],2**-(bit&7)));return g.sub(q,g.mul(g.floor(g.mul(q,.5)),2));};
export function commonRawOverlay(g,bytes,bit,value){
  const index=bit>>>3,mask=2**(bit&7);bytes[index]=g.add(g.sub(bytes[index],g.mul(commonRawBit(g,bytes,bit),mask)),g.mul(value,mask));
}
export function clearCommonModifier(g,state,rule,gate){
  commonRawOverlay(g,state[rule.flag],rule.bit,g.where(gate,0,commonRawBit(g,state[rule.flag],rule.bit)));
  if(rule.rank!==undefined)state.rawRanks[rule.rank]=g.where(gate,0,state.rawRanks[rule.rank]);
  for(const bit of rule.kindBits??[])commonRawOverlay(g,state.statusKindsBytes,bit,g.where(gate,0,commonRawBit(g,state.statusKindsBytes,bit)));
  for(const i of[rule.timerIndex,rule.timerIndex+1])state.rawTimers[i]=g.where(gate,0,state.rawTimers[i]);
}
