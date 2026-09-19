#!/usr/bin/env node
/**
 * Builds data/qb_baseline.json: career totals complete through a stated week.
 *
 * The first run seeds from data/nfl_qbs.json, which was measured to end at 2025
 * regular season week 17, and folds week 18 in. Later runs fold a completed season in.
 *
 * The week-17 cutoff is a MEASUREMENT, so this script re-checks it before trusting it
 * and aborts if the pinned passers no longer reconcile. Writing career totals off a
 * wrong cutoff would corrupt the dataset silently, and nothing downstream could tell.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { accumulate, addEntry, newIndex, isAfter } from './lib/merge.mjs';
import { fetchWeekly } from './lib/nflverse.mjs';
import { normalize } from '../web/src/match.js';

const SNAPSHOT_THROUGH = { season: 2025, week: 17 };
const BASELINE_THROUGH = { season: 2025, week: 18 };

// Passers who debuted in 2024, so their whole career is inside nflverse. Values are
// the snapshot's, verified to equal 2024 REG + 2025 REG weeks 1-17.
const PINNED = {
  'caleb williams': 7271,
  'bo nix': 7565,
  'drake maye': 6479,
  'jayden daniels': 4830,
  'michael penix': 2757,
  'spencer rattler': 2903,
};

async function verifyCutoff() {
  const seen = newIndex();
  accumulate(await fetchWeekly(2024), seen);
  const w2025 = await fetchWeekly(2025);
  accumulate(
    w2025.filter((r) => Number(r.week) <= SNAPSHOT_THROUGH.week),
    seen,
  );

  const bad = [];
  for (const [name, expected] of Object.entries(PINNED)) {
    // The pinned names are snapshot spellings, so look them up the way a fold would:
    // exact key first, then the normalized join.
    const entry =
      seen.byKey.get(name) ?? seen.byKey.get(seen.byJoin.get(normalize(name)));
    const got = entry?.yards ?? 0;
    if (got !== expected) bad.push(`${name}: snapshot ${expected}, nflverse ${got}`);
  }
  if (bad.length) {
    throw new Error(
      `The 2025 week ${SNAPSHOT_THROUGH.week} cutoff no longer reconciles:\n  ${bad.join('\n  ')}`,
    );
  }
  console.log(`cutoff verified: ${Object.keys(PINNED).length} pinned passers reconcile`);
  return w2025;
}

/**
 * Seeds from the snapshot, keyed exactly. Two passers may normalize to the same join
 * key (Cedrick Wilson and Cedrick Wilson Jr. are different people), so each keeps its
 * own entry and addEntry marks the shared join key ambiguous.
 */
function seedFromSnapshot(snapshot) {
  const index = newIndex();
  for (const [code, team] of Object.entries(snapshot)) {
    for (const [name, yards] of Object.entries(team.qbs)) {
      const existing = index.byKey.get(name);
      // The same career total is repeated under every franchise the passer played
      // for, so add the yards once and only union the teams thereafter.
      addEntry(index, name, existing ? 0 : yards, [code]);
    }
  }
  return index;
}

async function main() {
  const snapshot = JSON.parse(readFileSync('data/nfl_qbs.json', 'utf8'));
  const w2025 = await verifyCutoff();

  const index = seedFromSnapshot(snapshot);
  const before = index.byKey.size;

  const tail = w2025.filter((r) =>
    isAfter({ season: 2025, week: Number(r.week) }, SNAPSHOT_THROUGH),
  );
  accumulate(tail, index);

  const out = {
    through: BASELINE_THROUGH,
    source: 'nflverse-data stats_player_week',
    passers: Object.fromEntries(
      [...index.byKey.values()]
        .sort((a, b) => a.key.localeCompare(b.key))
        .map((e) => [e.key, { yards: e.yards, teams: [...e.teams].sort() }]),
    ),
  };
  writeFileSync('data/qb_baseline.json', `${JSON.stringify(out, null, 2)}\n`);
  console.log(
    `baseline: ${before} passers seeded, ${index.byKey.size} after folding ${tail.length} rows from 2025 week 18`,
  );
}

main();
