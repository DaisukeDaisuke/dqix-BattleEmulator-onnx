# Measuring the requested battle and camera search

`scripts/benchmark-common-battle-search.mjs` measures a complete declared
search through the common numerical battle and camera adapter. Inputs are
initial battle conditions, packaged definition data, a seed range, requested
turn count, external row+4 domains, and optional observation filters. Runtime
execution does not require a ROM or development archive bytes.

The input file has this shape:

```js
{
  schema: 'dq9-common-battle-search-benchmark-input-v1',
  expectedOutputsUsed: false,
  input: commonBattleInitialInput,
  definitions: battleDefinitions,
  seedRange: {min: '1', max: '8'},
  domains: explicitRow4SearchConditions,
  maxTurns: 2,
  observations: [],
  maxCandidates: 100000,
  maxAdapterCalls: 100000,
  maxTransitions: 100000
}
```

`input` uses the same `dq9-common-battle-state-v1` schema as the common
adapter. `input.camera.initial` contains initial camera conditions, with
packaged camera definitions resolved by the adapter. `domains` uses the
contract in [common-battle-search.md](common-battle-search.md). Explicit
domains are workload inputs; the benchmark does not infer restrictions from
observed outputs. The supplied `expectedOutputsUsed: false` is a workload
declaration, not independent evidence of correctness.

Example, after building the production graphs and obtaining the normal
ONNX Runtime Web distribution:

```sh
node scripts/benchmark-common-battle-search.mjs \
  --input initial-and-search-conditions.json \
  --model-dir graph-v2 \
  --ort-dir /absolute/path/to/onnxruntime-web/dist \
  --batch-sizes 1,8 --repeats 2 \
  --out measured-search.json
```

`--runtime-root` selects a frozen source closure. `--runtime-manifest`
records that closure's manifest hash. Development verification may explicitly
provide `--overlay-dir` for separately rebuilt models; the report records
every replacement and the resulting program identity. Such a run must not
be described as the unmodified published build.

## What the report establishes

Setup time and the first complete warmup search are recorded separately.
The warmup uses the same declared search as the measured samples. Each sample
starts from the same initial input. Every surviving computed branch,
including hidden battle and camera state, input history and matched
observations, must have the same hash across batch sizes. Search counters
must also agree. A budget stop or unsupported branch is incomplete and does
not produce completed-work throughput.

The primary rate is completed **requested turn sequences per second**.
A requested two-turn branch is not necessarily a battle that has reached
victory or defeat. The report also records completed requested turns, ONNX
call and row counts, seed and row+4 assignments, CPU details, thread count,
source/model/input identities, and whether the host was exclusive. GPU use
is currently false: this CLI selects the exact WASM implementation.

Batch agreement establishes scheduling equivalence for this workload.
Correctness against the original battle calculation is established by
separate original-versus-ONNX tests; an unverified seed does not become an
original-ROM accuracy proof merely because two batch sizes agree.

## Recorded development measurement, 2026-11-01

One measured sample per batch size followed a complete warmup on a shared
CPU host. The workload declared eight initial seeds, two requested turns,
and explicit external row+4 conditions. It retained all twelve completed
branches, with 24 completed requested turns and 18,478 ONNX rows in each
sample. There were no observation filters in this timing workload.

| Batch size | Measured seconds | Two-turn branches/s | ONNX calls | Adapter calls |
| --- | ---: | ---: | ---: | ---: |
| 1 | 18.895303 | 0.635078 | 7,778 | 100 |
| 8 | 7.197777 | 1.667181 | 1,931 | 14 |

The resulting computed-state hash was
`1afaca2ce18069b990ed46a245303f59277cd7f510bb0c3b2ab7804bac9a864a`
in both samples. The full report SHA-256 is
`a3932cb00f9bd71c596298d381e3620481c3d397133a18f87a65fc8cdd17541a`.
It identifies the exact source closure and model overlays. This is a
development measurement with one sample per configuration, not a sustained
performance guarantee or a GPU result. It does not support comparing a
partial-kernel rate of 520,000 calls/s with a complete C++ battle workload.

At the time of this measurement, a separate default-program fixture had
revealed an unresolved numerical-phase BE/BF state carry discrepancy. This
measurement neither repairs that discrepancy nor certifies the entire
battle implementation. It gives a reproducible baseline for measuring
subsequent fixes using the same amount of computed work.
