# Common battle uncertainty search

This module is the host scheduler for a common ONNX battle/camera implementation. It enumerates external uncertainty inputs, submits computed branch states to the adapter, and filters snapshots against measurements. Damage, random draws, buffs, position, combo, camera selection and required camera memory updates belong to the ONNX adapter. The scheduler contains no game-specific arithmetic and never passes expected outputs or measurements to the adapter.

## Inputs and boundaries

`createBattleSearchState` accepts a versioned `adapterId`, initial computed battle states, optional initial seed range, explicit row+4 search conditions, and observations. Every state is JSON-compatible. State identifiers must include the adapter/definition version; resuming with another identifier is rejected.

The initial seed is an exact unsigned 64-bit value, encoded as eight little-endian bytes in the existing battle state. Seed ranges use decimal or hexadecimal strings for values larger than JavaScript's exact integer range. Enumeration replaces only the initial seed, not intermediate random state or other battle fields. `seedPath` identifies its existing field: the default is `['seed']`, while the common battle/camera adapter requires `['battle', 'seed']`. An absent path or a field that is not eight exact bytes is rejected, rather than silently adding an unused field to the state.

The adapter requests uncertainty only at a genuine external row+4 input boundary. A request is:

```js
{
  id: lane.id,
  status: 'needs-row4',
  state: computedState,
  boundary: {id: 'turn:1/camera:0', kind: 'camera-row4', wordCount: 4}
}
```

The camera adapter declares the actual live row count at each consuming boundary, currently from 1 through 12, and the corresponding ordered `rowIds`. It requests one exact unsigned 32-bit word per declared row. All bit patterns, including values above `0x7fffffff`, are admitted. Without explicit search conditions, each word ranges from `0` through `4294967295`: exactly `2^(32 * wordCount)` combinations. Four rows, for example, produce `2^128` combinations; four is not a fixed product-wide row count. The module represents this domain lazily with decimal-string counters, so it never allocates the full Cartesian product. It does not assert that this enormous domain can be exhausted in a practical time.

For a boundary with four actual rows, explicit conditions have this form:

```js
const domains = {
  default: {
    words: [
      {min: 0, max: 4294967295, step: 1},
      {min: 0, max: 4294967295, step: 1},
      {min: 0, max: 4294967295, step: 1},
      {min: 0, max: 4294967295, step: 1}
    ]
  },
  boundaries: {
    // Optional user-specified overrides for exact boundary IDs.
  }
};
```

An explicit restriction is recorded as a search condition, never inferred from a sample or silently substituted for the full range. Its number of words must exactly match the consuming boundary; a mismatched default condition blocks that branch with an input error instead of discarding or inventing row values. Axes enumerate in lexicographic order with the last word changing fastest. Known internal updates are carried in the computed state and must not be promoted to new independent uncertainty inputs. The adapter decides when an actual new external boundary exists; the scheduler does not invent one per frame, graph call or turn.

## Batch adapter contract

```js
const search = createCommonBattleSearch({adapterId, advanceBatch});
const result = await search.run({
  state: checkpoint,
  batchSize: 64,
  maxCandidates: 1024,
  maxAdapterCalls: 256,
  maxTransitions: 100000
});
```

`advanceBatch(lanes, {maxTransitions})` receives only:

```js
{
  id: branchId,
  state: computedState,
  row4Input: {boundaryId, words} // present only for a new or unconsumed input
}
```

It returns an array, or `{lanes: array}`, in the same order with the same IDs. Every result carries a JSON-compatible computed `state`. Statuses are `needs-row4`, `observation`, `complete`, `budget`, and `unsupported`.

Every result for an input-bearing lane must include `row4Consumed: boolean`. If a runtime budget is reached before consumption, the same candidate remains pending. If it is reached after consumption, the next call receives only the returned computed state. This prevents reapplying an uncertainty value after a save/resume. A consumed boundary ID cannot be requested again within that branch.

An observation result also includes `observationId` and `snapshot`. A terminal result may include a final observation. A branch cannot be declared complete until every requested observation was actually checked. Unsupported operations and missing output fields are recorded as blocked branches; they are neither rejected candidates nor successful completion.

## External measurement filtering

An observation specifies exact field/index paths and one comparison per path:

```js
{
  id: 'turn:1',
  checks: [
    {path: ['actors', 0, 'hp'], equals: 91},
    {path: ['camera', 'selection'], oneOf: [2, 3]},
    {path: ['measuredDistance'], between: [1.24, 1.26]}
  ]
}
```

`equals` and `oneOf` use structural equality without coercion or an implicit tolerance. `between` is an explicit inclusive numeric measurement interval. A known mismatch rejects a branch. An unavailable required field blocks it. A matching branch retains its complete computed state, random state, memory and input history. Identical visible outputs never cause distinct hidden states to be collapsed.

Measurements remain in the search checkpoint, separate from adapter arguments. They select branches; they cannot overwrite their state. The observation IDs and conditions are immutable for a particular search. To change them, start a new search or explicitly re-evaluate retained states under a separately designed operation; editing a checkpoint does not retroactively recheck completed branches.

## Completion, budgets and persistence

The result is complete only when all declared candidates at every discovered boundary have been processed, no work is queued, and no branch is blocked. Zero survivors is a valid fully exhausted result. More than one survivor is retained in full.

A candidate budget, adapter-call budget, runtime budget or cancellation leaves a resumable checkpoint. Such a result is not an exhaustive answer. The progress count for pending candidates refers only to already discovered boundaries: later computed transitions can create further branches.

All cursors and potentially large counters are decimal strings, and every queued candidate includes its complete parent state and exact ordinal. `JSON.stringify`/`JSON.parse` preserves the checkpoint. A failed adapter call restores the submitted jobs to the queue, so a retry does not skip candidates. Large searches still need memory proportional to their live branches; this implementation does not discard surviving branches to cap memory.

## Verification scope

Run `node scripts/verify-common-battle-search.mjs` from the project directory. The deterministic fixtures check full-width enumeration, explicit Cartesian ranges, 64-bit seeds, exact observation comparisons, ambiguous branches, two-stage continuation, JSON resume, finite-budget reporting, consumption before/after budget stops, retry, unsupported outputs and cancellation. They verify search control only. Actual battle/camera arithmetic requires separate ONNX-versus-original verification with equal initial conditions and candidate inputs; a synthetic control fixture is not game accuracy evidence.
