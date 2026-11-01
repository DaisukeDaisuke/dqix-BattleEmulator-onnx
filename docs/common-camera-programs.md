# Shared camera program lookup

The camera runner reads the declared resident program headers and their actual linked order. It uses three shared ONNX modules for every encounter:

- `rom-common-camera-program-search` scans action-ID entries in chunks of32 and carries the first two distinct matching headers into the next chunk. Duplicate action IDs within one header count once.
- `rom-common-camera-program-admission` computes normal selection, the repeated-normal-attack second-program override, the battle800/801 action221 override, participant object flags and missing-program admission from those computed matches.
- `rom-common-camera-program-project` scans the selected program's sequential opcode data in chunks of32. It computes the first0c,7 and3d positions, their ordering, the first0c parameter and the presence of20/22.

The chunk width is an execution detail. It does not limit a program table to12 headers or a program to12 opcodes. An acyclic chain may span any number of chunks within the explicitly checked exact integer representation; the runtime reports unsupported data rather than truncating it. Pointer relocation and scheduling are host responsibilities. Membership, selection, opcode classification and flag arithmetic remain ONNX computations. Initial battle conditions and observations cannot supply computed match accumulators or opcode projections.

This makes the shared implementation capable of representing the original common default archive, which contains38 program headers. Packaging and connecting the wider original program and actor definitions is separate work; accepting a large table does not establish that every initial encounter definition is complete.

## Verification

The earlier resident-program graph was independently checked against original ARM execution. The streaming replacement reproduces all its outputs on112 enabled/disabled inputs from56 original fixture structures. Three additional cases use70 headers and a105-node selected program, checking the second match beyond the first chunk, action221 selection and opcode order across multiple chunks. All7,183 compared fields agree in actual ONNX Runtime Web WASM execution.

The full camera continuation verifier also runs with the streaming replacement. Four original sequences, each spanning two turns with either two or twelve objects, compare20 outer calls and21,074 required values with no differences. These cover initialized and uninitialized cameras, consuming and non-consuming row+4 boundaries, a missing target, RNG, object state and retained camera memory. The explicit command sequences are inputs to these tests; numerical command generation has its own proof and a combined numerical/camera test remains necessary.

The original source authority is recorded in each graph's contract. The relevant algorithms are matching `func_ov000_02169a58`, `02169aa4`, `02169b04`, `02169b54`, `func_02048ab4`, and the overlay25 outer entry, program initialization and repeated-action override. Product execution needs neither the ROM nor resource-loader/allocator emulation.
