// Shared data-only ABI, safe in both the graph generator and browser runtime.
export const COMMON_ANIMATION_STATE_OFFSETS=[0x21c,0x220,0x222,0x224,0x226,0x548,0x54a,0x554,0x55c,0x566,0x568,0x56e,0x570,0x572,0x574,0x57c,0x57e,0x580];
export const COMMON_ANIMATION_STATE_OPCODES=[10,11,55,58,64,66,71,80,93,118];
export const COMMON_ANIMATION_RESET_BASE=0x540;
export const COMMON_ANIMATION_RESET_WORDS=29;

// Constructor records include the8-byte node header. Direct initial payloads
// use offset8. Preserve that distinction before passing the exact body limbs
// into a handler; padding beyond the represented node never becomes known.
export function commonAnimationPayload(code){
 const base=code.payloadBaseOffset??8;
 if(base!==0&&base!==8)throw Error('Animation payload base must be node offset0 or8');
 if(!Array.isArray(code.payloadU16)||!Array.isArray(code.payloadMaskU16)||code.payloadU16.length!==10||code.payloadMaskU16.length!==10)throw Error('Actual ten-limb node data and knowledge masks are required');
 const start=base===0?4:0;
 return{payloadU16:[...code.payloadU16.slice(start),...Array(start).fill(0)],payloadMaskU16:[...code.payloadMaskU16.slice(start),...Array(start).fill(0)]};
}
