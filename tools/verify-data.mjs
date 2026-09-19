#!/usr/bin/env node
/**
 * The gate. Career yards only ever go up and franchises never lose their passers, so
 * any violation means the rebuild is wrong -- and wrong data is worse than stale data.
 *
 *   node tools/verify-data.mjs <previous.json> <next.json>
 */
import { readFileSync } from 'node:fs';
import { TEAM_NAMES } from './lib/teams.mjs';

export function checkRebuild(previous, next) {
  const problems = [];

  for (const code of Object.keys(TEAM_NAMES)) {
    if (!next[code]) problems.push(`team ${code} is missing from the rebuild`);
    else if (Object.keys(next[code].qbs).length === 0) problems.push(`team ${code} has no passers`);
  }
  for (const code of Object.keys(next)) {
    if (!(code in TEAM_NAMES)) problems.push(`unknown team code ${code} in the rebuild`);
  }

  /**
   * A career total is repeated under every franchise the passer played for, so track
   * the range rather than letting the last team seen win -- otherwise a drop in one
   * team's copy is invisible.
   */
  const flatten = (file) => {
    const all = new Map();
    for (const team of Object.values(file)) {
      for (const [name, yards] of Object.entries(team.qbs)) {
        const seen = all.get(name);
        if (!seen) all.set(name, { min: yards, max: yards });
        else {
          seen.min = Math.min(seen.min, yards);
          seen.max = Math.max(seen.max, yards);
        }
      }
    }
    return all;
  };
  const before = flatten(previous);
  const after = flatten(next);

  if (after.size < before.size) {
    problems.push(`passer count fell from ${before.size} to ${after.size}`);
  }
  for (const [name, { min, max }] of after) {
    if (min !== max) {
      problems.push(`passer ${name} has inconsistent totals across teams (${min} vs ${max})`);
    }
  }
  for (const [name, { min }] of before) {
    const now = after.get(name);
    if (now === undefined) problems.push(`passer ${name} vanished`);
    else if (now.min < min) problems.push(`passer ${name} decreased from ${min} to ${now.min}`);
  }
  return problems;
}

if (process.argv[2] && process.argv[3]) {
  const problems = checkRebuild(
    JSON.parse(readFileSync(process.argv[2], 'utf8')),
    JSON.parse(readFileSync(process.argv[3], 'utf8')),
  );
  if (problems.length) {
    console.error(`REFUSED:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log('rebuild verified');
}
