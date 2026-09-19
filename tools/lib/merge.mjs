/**
 * Folding weekly nflverse rows into career totals.
 *
 * Three rules are load-bearing.
 *
 * Position is never filtered: the dataset is every passer, including receivers and a
 * punter, and filtering to QB would delete two thirds of it.
 *
 * Keys keep their punctuation -- `c.j. stroud` must not become `cj stroud`, or
 * displayName renders "Cj Stroud".
 *
 * Names are matched on the exact key first and only then on a normalized join,
 * because the two sources spell people differently ("Michael Penix Jr." in nflverse
 * against "michael penix" in the snapshot) while normalization also collides genuine
 * namesakes: Cedrick Wilson (27 yards) and Cedrick Wilson Jr. (132) are father and
 * son, both of whom threw a trick-play pass. Joining them would discard one career
 * and credit the other with franchises he never played for, so an ambiguous join
 * throws instead of guessing.
 */
import { normalize } from '../../web/src/match.js';
import { teamCode, TEAM_NAMES } from './teams.mjs';

const AMBIGUOUS = Symbol('ambiguous join key');

/** Lowercase, collapse spaces, keep punctuation. This is how the dataset is keyed. */
export function storageKey(displayName) {
  return String(displayName).replace(/\s+/g, ' ').trim().toLowerCase();
}

export function newIndex() {
  return { byKey: new Map(), byJoin: new Map() };
}

/** Registers an entry under its exact key, and under its join key when unambiguous. */
export function addEntry(index, key, yards = 0, teams = []) {
  let entry = index.byKey.get(key);
  if (!entry) {
    entry = { key, yards: 0, teams: new Set() };
    index.byKey.set(key, entry);

    const join = normalize(key);
    if (join) {
      const existing = index.byJoin.get(join);
      if (existing === undefined) index.byJoin.set(join, key);
      else if (existing !== key) index.byJoin.set(join, AMBIGUOUS);
    }
  }
  entry.yards += yards;
  for (const t of teams) entry.teams.add(t);
  return entry;
}

/** Resolves a name to its entry, creating one when the passer is new. */
function resolve(index, displayName) {
  const key = storageKey(displayName);
  const exact = index.byKey.get(key);
  if (exact) return exact;

  const join = normalize(displayName);
  const target = index.byJoin.get(join);
  if (target === AMBIGUOUS) {
    throw new Error(
      `Ambiguous name "${displayName}": more than one passer normalizes to "${join}". ` +
        'Add the exact key to the dataset rather than letting the join guess.',
    );
  }
  if (target !== undefined) return index.byKey.get(target);
  return addEntry(index, key);
}

export function accumulate(rows, index) {
  for (const row of rows) {
    if (row.season_type !== 'REG') continue;
    const yards = Number(row.passing_yards || 0);
    if (!yards) continue;
    if (!normalize(row.player_display_name)) continue;

    const entry = resolve(index, row.player_display_name);
    entry.yards += yards;
    entry.teams.add(teamCode(row.team ?? row.recent_team));
  }
  return index;
}

/** The game file's exact shape, every team present, passers yards-descending. */
export function toGameFile(index) {
  const out = {};
  const byTeam = new Map();
  for (const [code, display_name] of Object.entries(TEAM_NAMES)) {
    out[code] = { display_name, qbs: {} };
    byTeam.set(code, []);
  }
  for (const entry of index.byKey.values()) {
    for (const code of entry.teams) byTeam.get(code).push(entry);
  }
  for (const [code, list] of byTeam) {
    list.sort((a, b) => b.yards - a.yards || a.key.localeCompare(b.key));
    for (const e of list) out[code].qbs[e.key] = e.yards;
  }
  return out;
}

export const isAfter = (a, b) =>
  a.season > b.season || (a.season === b.season && a.week > b.week);
