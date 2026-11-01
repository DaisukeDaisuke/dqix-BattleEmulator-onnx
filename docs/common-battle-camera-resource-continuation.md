# Required camera resource continuation and joint battle proof

## Product boundary

The runtime receives packaged camera program definitions. It does not open a ROM, emulate a file loader, render text or models, or derive row+4 from stack history. A computed camera state of 4 means that the requested action program must be resolved before the next presentation command. This resolution uses immutable distribution data. ONNX graphs perform the resulting program selection, admission, camera updates, and random-number consumption. The outer camera computation and row+4 input are not repeated at this boundary.

The initial fixture may explicitly supply a fallback program, including a missing fallback. When omitted, the runtime uses the packaged scene default from `data/bin/actdef.nsarc/default.bact`. The similarly named `defaultaction.bact` is a different resource. Programs loaded for an individual action do not silently become resident actor programs.

## Independent original execution

Two existing numerical battle fixtures execute two turns each. The original numerical turn and finish functions produce their own presentation commands. Each original outer camera call is followed, when it actually requests a file and enters state 4, by the unchanged original JPN `021dcf8c` continuation. Its parser, initialization, selection, fallback, and cleanup all execute in the original program.

For this development-only proof, four immutable archives are extracted from a hash-pinned YDQJ ROM before execution. At the actual file-availability boundary, the harness supplies only the requested task's file pointer, byte count, and completed status. It asserts that the random state, required battle state, and required camera state remain unchanged by this supply. Original computed intermediate states are never copied into the ONNX runtime. The verifiers explicitly remove the development archive bytes from the product adapter's initial input.

The executed cases reach five state 4 continuations: three request `actetc.nsarc` and two request `actspl.nsarc`. This closes the previously identified omission in the earlier outer-camera/advance-only schedule for these cases. It does not establish coverage of every action family or every battle lifecycle path.

## Results

The joint comparison passes 6,251 required values across two two-turn battles and 13 camera endpoints, with zero differences and 23 JSON state resumptions. Checks cover numerical actor state, status and rank timers, combo and command records, random seed and draw position, world positions and routes, orientation, camera state, and the retained camera memory projection.

The corresponding observation-filtered row+4 search also passes. At one explicitly selected consuming boundary, the verification domain contains two candidates for one word, 0 and 1. One battle retains one candidate and rejects the other; the second retains both because those observations do not distinguish them. All computed surviving branches continue to the end of the second turn. A whole batch and 26 budgeted JSON resumptions produce identical final branches. These small verification domains do not change the product's full uint32 search domain.

The proof used ONNX Runtime Web WASM. It did not execute GPU inference or measure complete-battle throughput.

## Provenance

- Original response SHA-256: `b91cdbe1637a2915367bf25db827467ce48cba9521221b8d14ed42c4f959eaf7`.
- Initial numerical inputs SHA-256: `67b9d32d593cc481fd79b3b16e73193500da7f92a1ef6877628be557957968db`.
- Joint comparison proof SHA-256: `84ebeac89d075fd6bde682b0e0a3e257430befc666778b6356b7bb4e9c739073`.
- Exact observation-filtered search proof SHA-256: `4dc3a0a50e6a1e6339860aff05fa13536c25e1372a6bc6ca13167a42b9550c2f`.
- Executed common program SHA-256: `5b24604283dcb0136d1bf003e2c80f25d0ffc6929ae3928e53906cf2069de6e3`.
- Original harness SHA-256: `4d91c40dcd6a2ecde1e95428e4db5d40c5f2ba6eec183d799c56016a2fc3d763`.

An earlier development fixture placed archive bytes across the damage-table arena and produced nine HP differences. That failed evidence is preserved separately. The corrected fixture validates every archive range against the numerical, camera, scene, and stack arenas, then re-executes the original battle from its initial conditions. No product numerical change or expected-state overwrite was used to obtain this passing result.
