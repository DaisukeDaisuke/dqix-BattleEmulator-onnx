# Camera source and target byte stores

The original free-camera function stores the source and target arguments into unsigned byte fields at `camera + 0x262` and `camera + 0x263`. A missing target is passed as `-1`; its stored value is therefore `255`. The early return for an absent object does not undo these stores or the preceding RNG update.

The existing `rom-camera-memory-patch160` graph now performs the exact modulo-256 stores and returns `storedFlagsIds`. The enclosing runner takes its scalar flags and IDs from these computed stored bytes, keeping the scalar camera state and retained memory consistent. This extends the existing model; it does not introduce another download or an independent uncertain state variable.

Authority: matching `src/Combat/Overlay_0/func_ov000_0216e678.cpp`, SHA-256 `79465a546eb1172eea1f365d662849a4a1fe03cd65ff74c3d70fc888801fbf98`. The source uses unsigned-char stores before object lookup and the absent-object return.

## Original execution checks

Two additional original ARM sequences start with an already initialized camera and counter 3. They cover a self-targeting command and a command with no target; these non-consuming row+4 boundaries receive empty input arrays. Both encounters run two turns, retaining their computed RNG, object and camera state. Across ten outer calls, all 10,530 required values agree, including fourteen JSON state round trips. The prior two-turn, two-object and twelve-object cases also remain exact: 10,544 values, ten outer calls, fourteen JSON round trips.

These are explicit command-sequence proofs. They establish the byte-store behavior and required camera continuation; a separate joint proof is needed for numerical battle command production. Observed intermediate outputs are used only for comparison, never as subsequent input state.
