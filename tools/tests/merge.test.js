import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accumulate, addEntry, newIndex, toGameFile, isAfter, storageKey } from '../lib/merge.mjs';

const row = (o) => ({
  player_display_name: 'Joe Burrow',
  position: 'QB',
  season_type: 'REG',
  season: '2026',
  week: '1',
  team: 'CIN',
  passing_yards: '100',
  ...o,
});

test('yards accumulate and teams union', () => {
  const ix = accumulate([row(), row({ week: '2', passing_yards: '50' })], newIndex());
  const e = ix.byKey.get('joe burrow');
  assert.equal(e.yards, 150);
  assert.deepEqual([...e.teams], ['cin']);
});

test('a midseason trade records both teams', () => {
  const ix = accumulate([row(), row({ week: '9', team: 'LV', passing_yards: '20' })], newIndex());
  assert.deepEqual([...ix.byKey.get('joe burrow').teams].sort(), ['cin', 'rai']);
});

test('postseason rows are ignored', () => {
  const ix = accumulate([row({ season_type: 'POST', passing_yards: '400' })], newIndex());
  assert.equal(ix.byKey.size, 0);
});

test('non-quarterbacks are kept', () => {
  // The dataset is every passer: Edelman, Cobb, a punter. Filtering by position would
  // delete two thirds of it and break answers that work today.
  const ix = accumulate([row({ player_display_name: 'Julian Edelman', position: 'WR' })], newIndex());
  assert.equal(ix.byKey.get('julian edelman').yards, 100);
});

test('rows with no passing yards add nothing', () => {
  const ix = accumulate([row({ passing_yards: '' }), row({ passing_yards: '0' })], newIndex());
  assert.equal(ix.byKey.size, 0);
});

test('a suffix mismatch between sources still joins', () => {
  // The snapshot says "michael penix"; nflverse says "Michael Penix Jr.". Same person.
  const ix = newIndex();
  addEntry(ix, 'michael penix', 2757, ['atl']);
  accumulate([row({ player_display_name: 'Michael Penix Jr.', team: 'ATL' })], ix);
  assert.equal(ix.byKey.size, 1, 'joined rather than duplicated');
  assert.equal(ix.byKey.get('michael penix').yards, 2857);
});

test('genuine namesakes stay separate and refuse to be guessed at', () => {
  // Cedrick Wilson and Cedrick Wilson Jr. are father and son; both threw a trick-play
  // pass. Merging them would discard one career and credit the other with franchises
  // he never played for.
  const ix = newIndex();
  addEntry(ix, 'cedrick wilson', 27, ['pit']);
  addEntry(ix, 'cedrick wilson jr.', 132, ['dal']);
  assert.equal(ix.byKey.size, 2);

  // An exact key still resolves cleanly.
  accumulate([row({ player_display_name: 'Cedrick Wilson Jr.', team: 'MIA' })], ix);
  assert.equal(ix.byKey.get('cedrick wilson jr.').yards, 232);
  assert.deepEqual([...ix.byKey.get('cedrick wilson').teams], ['pit']);

  // A spelling that matches neither exactly must throw, not pick one.
  assert.throws(
    () => accumulate([row({ player_display_name: 'Cedrick  Wilson, Jr' })], ix),
    /Ambiguous name/,
  );
});

test('storageKey lowercases without stripping punctuation', () => {
  assert.equal(storageKey('C.J. Stroud'), 'c.j. stroud');
});

test('the game file keeps its existing shape', () => {
  const ix = newIndex();
  addEntry(ix, 'joe burrow', 150, ['cin']);
  const out = toGameFile(ix);
  assert.equal(out.cin.display_name, 'Cincinnati Bengals');
  assert.equal(out.cin.qbs['joe burrow'], 150);
  assert.equal(Object.keys(out).length, 32, 'all 32 teams present');
});

test('each team lists its passers highest first', () => {
  const ix = newIndex();
  addEntry(ix, 'a b', 10, ['cin']);
  addEntry(ix, 'c d', 99, ['cin']);
  assert.deepEqual(Object.keys(toGameFile(ix).cin.qbs), ['c d', 'a b']);
});

test('isAfter compares season then week', () => {
  assert.equal(isAfter({ season: 2026, week: 1 }, { season: 2025, week: 18 }), true);
  assert.equal(isAfter({ season: 2025, week: 18 }, { season: 2025, week: 17 }), true);
  assert.equal(isAfter({ season: 2025, week: 17 }, { season: 2025, week: 17 }), false);
  assert.equal(isAfter({ season: 2025, week: 1 }, { season: 2025, week: 18 }), false);
});
