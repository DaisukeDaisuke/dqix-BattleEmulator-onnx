import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

// These are source generators, in dependency order. No prebuilt model or
// diagnostic record is an input to the release build.
export const stages = [
  'graph-v2/build-graphs.mjs',
  'graph-v2/build-turn-graphs.mjs',
  'graph-v2/build-extended-graphs.mjs',
  'graph-v2/build-duel-graph.mjs',
  'graph-v2/build-lifecycle-graph.mjs',
  'graph-v2/build-ai-machine.mjs',
  'graph-v2/build-rom-tables.mjs',
  'graph-v2/build-ai-decision.mjs',
  'graph-v2/build-ai-default-target.mjs',
  'graph-v2/build-ai-closed.mjs',
  'graph-v2/build-boss-action.mjs',
  'graph-v2/build-ai-boss-target.mjs',
  'graph-v2/build-boss-event.mjs',
  'graph-v2/build-turn-boundaries.mjs',
  'graph-v2/boss-phases.mjs',
  'graph-v2/build-boss-resident-program.mjs',
  ...[
    'packed-damage', 'nushi-action', 'nushi-ai', 'nushi-preparation',
    'burudoga-program', 'appeal-program', 'nushi-program', 'shared-action', 'packed-actions',
    'physical-selectors', 'incapacity-action', 'common-ai', 'anonn-program',
    'selector-columns', 'column-action', 'self-heal-action', 'repeated-action',
    'action-family-program', 'default-repeat-ai', 'reokonn-program',
    'dispel-mask', 'dispel-action', 'repeated-family', 'action-family-v2-program', 'dispel-ai',
    'tension-primitives', 'tension-actions', 'level-scaled-selector', 'vacuum-action',
    'weapon-tension-action', 'tension-phases',
    'tension-repeated', 'transition-targets', 'goreonn-program', 'tension-family-program',
    'idle577-action', 'idle577-preparation', 'idle-family-program',
    'self-rank-action', 'paralysis-action', 'drain-selector', 'drain-action',
    'status-preparation', 'status-family-program',
    'ai-definition', 'ai-definition-dispel', 'status9-targets', 'erusionn-program',
    'jadama-ai', 'deferred-preparation', 'jadama-program',
    'impact-state-action', 'impact-preparation', 'impact-family-program', 'gadonngo-program',
    'erugi1-tail', 'erugi1-preparation', 'erugi1-program',
    'monster320-components', 'monster320-preparation', 'monster320-family-program', 'erugi2-program',
    'darkwave-action', 'critical-or-miss-selector', 'darkwave-family-program', 'monster318-preparation', 'baruborosu-program',
    'giyumei-action', 'giyumei-family-program', 'giyumei-preparation-kernel',
    'giyumei-preparation', 'collection-event', 'giyumei-program'
  ].map(name => `graph-v2/encounter-expansion/build-${name}.mjs`),
  ...[
    'graph', 'goals', 'occupancy', 'geometry', 'selector', 'rng',
    'nonmember-goal', 'member-goal', 'member-wide', 'ring', 'delayed-paint',
    'route-planner', 'route-byte', 'dispatcher', 'preprocess', 'route-post',
    'parent-control', 'admission', 'admission-event', 'admission-event-commit',
    'completion-primitives', 'fixed-math', 'facing-math', 'world-prefix',
    'tail-projection', 'polar-geometry', 'double-math',
  ].map(name => `graph-v2/build-camera-${name}.mjs`),
  'graph-v2/build-free-camera-geometry.mjs',
  'graph-v2/build-camera-follow-first.mjs',
  'graph-v2/build-camera-follow-continuous.mjs',
  'graph-v2/build-camera-memory-patch.mjs',
  'graph-v2/build-camera-record-bind.mjs',
];

export function buildGraphs({root = fileURLToPath(new URL('../', import.meta.url)), from = 0, until = stages.length} = {}) {
  const completed = [];
  for (let i = from; i < Math.min(stages.length, until); i++) {
    const path = stages[i], started = performance.now();
    const run = spawnSync(process.execPath, [resolve(root, path)], {cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
    if (run.error || run.status !== 0) {
      throw new Error(`Generator ${i + 1}/${stages.length} ${path} failed\n${run.error || ''}\n${run.stderr}\n${run.stdout.slice(-6000)}`);
    }
    const entry = {index: i, source: path, milliseconds: Math.round(performance.now() - started)};
    completed.push(entry);
    console.log(`BUILT ${i + 1}/${stages.length} ${path} (${entry.milliseconds} ms)`);
  }
  return completed;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const at = name => {const i = process.argv.indexOf(name); return i < 0 ? undefined : Number(process.argv[i + 1]);};
  buildGraphs({from: at('--from'), until: at('--until')});
}
