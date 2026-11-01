# Required camera state across turns

The common camera path carries its own computed world, RNG and camera state into subsequent commands and turns. Turn submission replaces the explicit command records and resets the command cursor; the camera initializer updates eligible behavior and target caches. Observations are comparison predicates only.

## Two corrected state dependencies

**Previous behavior.** Forced placement calls matching `func_02048cf0`. When the object's behavior byte `BE` is zero, it calls `func_02033b88`, which stores `BF = BE` before setting `BE = 0`. Consequently, a previous nonzero behavior copied into `BF` by the turn initializer does not survive a later forced placement. `rom-camera-world-behavior1` implements only these required state stores. No animation banks, renderer or resource machinery are needed to implement them.

**Camera initialization and movement admission share one byte.** The scene movement test reads JPN `scene + 0xdf4`. The camera begins at `scene + 0xb94`, and its initialized byte is at `camera + 0x260`; these addresses are equal. The common runner therefore derives `sceneMovementEnabled` from the same initial and computed `cameraInitialized` value. It is not an independent uncertain input. After the first free-camera call initializes the camera, subsequent route suffixes see that updated value.

## Independent original execution

The development verifier runs the actual initializer `JPN021dbfd0`, outer camera call `JPN021dc70c`, and command advance `JPN021df840` in one original ARM memory/RNG instance. All guest instruction bytes are unchanged. Functional integer SQRT/DIV device replies are supplied for the original math hardware interface.

After startup, the only semantic host writes are declared next-turn command headers and participant/target records with the accepted-command cursor reset, plus declared external `uint32` row+4 operands at dispatcher entry `JPN021e08bc`, `SP - 0xb4 + 12*i + 4`. No observed RNG, position, target cache, route, camera memory or expected intermediate state is written back. The original group roster is initialized from the declared encounter population so that active-roster and typed-object enumeration agree.

`scripts/verify-common-camera-sequence-rom.mjs` executes the same sequence with ONNX Runtime Web WASM, serializing computed state between boundaries. It compares RNG state and draw position, world XYZ and orientation, goals and route state, behavior/cache fields, camera geometry/globals and retained camera memory at the required endpoints. It checks the movement/initialization alias explicitly. Row+4 write results are compared at the dispatcher boundary, not against later unrelated stack reuse.

The initial proof covers two turns each for a two-object and a twelve-object encounter, with ten outer camera calls in total. All 10,544 compared required values match, including fourteen JSON round trips. These command sequences are explicit inputs: this proof does not establish numerical command generation, complete battle coverage, rendering, resource completion or GPU throughput. Product execution of these graphs needs no ROM; ROM execution is a development-only oracle.
