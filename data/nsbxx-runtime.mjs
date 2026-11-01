// Read-only JPN function-pointer table, not recorded post-execution state.
// Original ARM9 020f1dd8..020f1e24; independent Ghidra read SHA256
// dba54efc3322da45cee964e84a1e0296b902109a129affbe39edd4d328423742.
// Matching commit e0d1df250bfc554efe2fd37513a4ad3867a77b10,
// src/NitroSDK/NSBXX/{Animation,JAC,MAM,MPT,MAT,VAV}.cpp.
export const NSBXX_ANIMATION_CALLBACKS=Object.freeze({JAC:0x020b9388,MAM:0x020bac54,MPT:0x020bb384,MAT:0x020bb124,VAV:0x020bb444});
export const NSBXX_RENDER_CALLBACKS=Object.freeze({material:0x020b559c,joint:0x020b5678,visibility:0x020b5a64});
