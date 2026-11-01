import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

// These are source generators, in dependency order. No prebuilt model or
// diagnostic record is an input to the release build.
export const stages = [
  'graph-v2/build-graphs.mjs',
  'graph-v2/build-turn-graphs.mjs',
  'graph-v2/build-ai-machine.mjs',
  'graph-v2/build-rom-tables.mjs',
  'graph-v2/build-ai-decision.mjs',
  'graph-v2/build-ai-default-target.mjs',
  'graph-v2/build-ai-closed.mjs',
  'graph-v2/build-ai-boss-target.mjs',
  'graph-v2/build-turn-boundaries.mjs',
  ...[
    'nushi-ai', 'common-ai', 'default-repeat-ai', 'dispel-ai',
    'ai-definition', 'transition-targets', 'status9-targets', 'jadama-ai'
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
  'graph-v2/build-camera-common-capacity.mjs',
  'graph-v2/build-common-camera-program.mjs',
  'graph-v2/build-common-action.mjs',
  'graph-v2/build-common-control.mjs',
  'graph-v2/build-common-redirect.mjs',
  'graph-v2/build-common-after-action.mjs',
  'graph-v2/build-common-blade-recoil.mjs',
  'graph-v2/build-common-population.mjs',
  'graph-v2/build-common-presentation.mjs',
  'graph-v2/build-common-camera-command.mjs',
  'graph-v2/build-common-camera-turn.mjs',
  'graph-v2/build-common-battle.mjs',
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
