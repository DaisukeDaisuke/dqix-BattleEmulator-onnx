# Original numerical battle and camera continuation

`scripts/verify-common-battle-camera-rom.mjs` checks a common ONNX numerical battle runner, its generated presentation commands, the camera initializer and complete required camera transitions, followed by the next numerical turn. The runtime receives initial conditions, battle definitions, declared actions and external row+4 candidates. Original intermediate results are comparison values only.

## Required stationary-facing update

The original route-planner suffix, matching `func_ov025_021e0638`, calls `func_020494c0` for an eligible stationary actor. It selects the actor's preferred target, or its secondary target when the preferred target is `255`, then invokes the shared exact direction calculation and orientation setter. The conditions are: an active roster member with a visual object and nonzero movement-presence byte, zero route count, actor `C1` high nibble outside 2 through 5, alive, camera initialized, and visual flag `0x200` clear. Missing or self targets leave the orientation unchanged.

The existing route-post graph now returns this gate and target selection. The common parent runner uses the existing direction and object-store graphs before the camera selector. This order matters: a subsequent forced world placement can overwrite the orientation, while an entry that does not place the actor retains it. The update also preserves the original behavior-3/4 yaw stores and setter flag clearing. It requires no animation execution, drawing or resource loading, and adds no new model names or download requests.

## Independent two-turn execution

The development harness executes original numerical turn-begin, `ProcessCombatTurn` and finish functions. It uses the actual command queue they generated, calls the original camera initializer, outer camera function and command-advance helper, then executes the next numerical turn in the same RAM and RNG instance. It does not replace the command headers with observed outputs.

External candidate words are supplied after the actual compact roster is built, at JPN `0x021e094c`, before its first row+4-dependent decision. The count must equal that live roster's count; early exits that do not build this roster receive no injected row+4. This implements the external uncertainty boundary without reconstructing its previous stack contents.

Switching original overlay code images is a development harness operation. The harness checks that it preserves numerical state, generated commands and RNG; the return to the numerical overlay additionally checks retained camera state. Product execution uses the packaged ONNX models and definitions, without a ROM or overlay loader.

The initial joint proof covers two distinct three-actor battles, two turns each. One includes ordinary attacks under darkness; the other includes action 149 tension reduction, the following attack and its generated recovery command. The sequences contain thirteen outer camera calls. All 6,260 required comparisons match, including HP/MP, status and flag words, ranks and timers, tension, AI/group cursors, command headers and order, RNG seed and draw position, world positions and orientation, route/cache state and the retained camera words. Twenty-three JSON state round trips preserve continuation. Execution used ONNX Runtime Web WASM; GPU throughput was not measured.

The proof establishes this explicit sequence of outer calls and command advances. Some entries return in resource state 4, and this original response does not execute the subsequent state-4 function before advancing. It therefore proves the scheduled projection, not completion of resource-dependent camera transitions. Connecting packaged program continuation can legitimately add selector calls and RNG consumption; that extended schedule requires a corresponding new original response. It must not be forced to match this shorter response by skipping required computation.

The proof does not assert that every action, battle outcome, additional actor producer or arbitrary camera program is covered. The verifier records model and input hashes and reports any unsupported transition explicitly.
