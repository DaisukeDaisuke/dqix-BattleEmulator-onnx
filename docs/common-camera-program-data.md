# Packaged camera program definitions

The release includes the original shared camera program metadata from `actetc.nsarc`, `actskl.nsarc`, `actspl.nsarc`, `actdef.nsarc/default.bact` and `defaultaction.bact`. These are definitions used by one common program, not observed battle states or encounter-specific execution programs. Product execution does not open a ROM, construct an allocator or run a background loader.

## Extraction and original authority

The development extractor reads the original NARC members and typed Script instruction records. The original opcode 1 constructor makes a linked program header from its unsigned-short action IDs and appends action 2 and 219 when action 1 is present. Opcode 16 is a separate constructor for the header `[1, 2, 219]`. The extractor preserves both kinds and their linked order. An empty action list is valid and is not replaced with a guessed ID.

For the camera selector, only linked node kinds 7, 12, 32, 34 and 61, their relative order, and the first node-12 short parameter are needed. The package retains these nodes in original order. The shared ONNX graph computes membership, first and second matching headers, first relevant node positions, ordering predicates and the resulting selector projection at execution time. No precomputed selector result is included. Other animation nodes do not affect these lookups and are not required to render anything.

Authority is the matching `Resource/Script.cpp`, `func_ov000_02169bf0`, `func_ov000_0216a438`, `func_ov000_02169b78`, the five relevant node constructors, and the original selector lookup functions. The independent development harness executes the original parser at JPN `0x0216e8f0`, including all original constructors and allocation calls, from the unmodified ROM. It then inspects the resulting linked definitions. This development verification does not create a runtime allocator dependency.

## Missing resident programs

Resident actor chains remain separate from shared archive data. Appending every shared program to an actor's chain would change the number and order of matches, including the repeated normal-attack second-program rule.

When the original admission selects a missing-program archive, the runtime resolves that exact packaged archive and `spNNN.bact` member. The state-4 continuation initializes the member's first linked program and executes the same ONNX selector, world and camera updates from the already computed state. It does not repeat planning or request row+4 a second time. If initialization does not reach original states 2, 3 or 6, the shared resource-control graph selects fallback lookup. Operation 12 searches action 344; other operations search the action definition ID. A missing fallback enters state 5 and clears the two required fallback globals.

The original scene's shared fallback is `data/bin/actdef.nsarc/default.bact`, confirmed both from its setup function and the original referenced strings. It is not `defaultaction.bact`. An omitted initial fallback pointer uses this packaged default. An explicitly supplied pointer, including `-1`, retains the caller's declared initial conditions.

Static availability of packaged metadata replaces only file transport and parsing. Archive selection, initialization flags, selector decisions, RNG, world and camera stores, fallback selection and completion branches remain in shared ONNX modules. The transient loaded program does not become an actor's resident program. Unsupported required transitions are reported with their computed state retained; state 4 is not silently skipped.

## Reproduction

The public metadata module is sufficient for ordinary source builds and GitHub Actions. Regenerating it is a development-only operation using `scripts/extract-camera-program-data.mjs --rom ORIGINAL --out data/common-camera-program-data.mjs`. `scripts/verify-camera-program-data-rom.mjs` compares it against a separate original-parser response. Input and output identities are recorded independently; the response is never used to produce definitions.

The complete extraction was checked against 313 original files containing 358 linked programs. All 2,949 compared action IDs, node kinds, parameters, links and referenced default-path fields matched. The original parser executed 13,310,872 ARM instructions with strict initialized-memory checks and no guest-code modifications.

Runtime state-4 continuation was then checked in two numerical battle cases,
each continued for two turns, with 13 camera endpoints and five actual resource
availability boundaries. The original JPN `0x021dcf8c` executed archive member
lookup, parsing, program initialization, selector, fallback and task cleanup.
All 6,251 compared numerical, RNG, world and camera fields matched the common
ONNX execution, including 23 JSON save/resume boundaries. A separate search
comparison retained the correct single branch in one case and both
indistinguishable branches in the other, with 26 JSON resumptions.

The independent original fixture initially placed its archive inputs over a
damage constant arena. That invalid fixture produced nine HP differences and
was retained as a failed diagnostic. Moving only the development inputs into
checked, nonoverlapping ranges resolved the differences; no product arithmetic
was changed to fit the observations. Original expected states never initialize
the runtime. These scoped cases do not establish all actions or initial scenes.
