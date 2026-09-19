#!/usr/bin/env node
/**
 * Rebuilds data/nfl_qbs.json as baseline + every week after it.
 *
 * Always a recomputation, never an increment: run it twice and you get the same file.
 * That is the whole reason the baseline carries a `through` marker -- an in-place
 * updater has to know where the last run stopped, and a missed or repeated week
 * corrupts career totals with nothing to detect it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { accumulate, addEntry, newIndex, toGameFile, isAfter } from './lib/merge.mjs';
import { fetchWeekly, currentSeason } from './lib/nflverse.mjs';

async function main() {
  const baseline = JSON.parse(readFileSync('data/qb_baseline.json', 'utf8'));
  const index = newIndex();
  for (const [key, { yards, teams }] of Object.entries(baseline.passers)) {
    addEntry(index, key, yards, teams);
  }

  const latest = currentSeason();
  let added = 0;
  for (let season = baseline.through.season; season <= latest; season++) {
    const rows = await fetchWeekly(season);
    if (!rows) continue;
    const fresh = rows.filter((r) =>
      isAfter({ season, week: Number(r.week) }, baseline.through),
    );
    accumulate(fresh, index);
    added += fresh.length;
  }

  writeFileSync('data/nfl_qbs.json', `${JSON.stringify(toGameFile(index), null, 2)}\n`);
  console.log(
    `rebuilt from baseline (${baseline.through.season} wk ${baseline.through.week}) + ${added} rows through ${latest}`,
  );
}

main();
