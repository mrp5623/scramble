import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildRoster } from '../src/roster.js';
import { createGame } from '../src/engine.js';
import { greedyPick } from '../src/policies/greedy.js';
import { POLICIES, getPolicy } from '../src/policies/index.js';

const DATA = JSON.parse(
  readFileSync(new URL('../../data/nfl_qbs.json', import.meta.url), 'utf8'),
);
const ROSTER = buildRoster(DATA);

test('takes the highest-yardage available QB', () => {
  const g = createGame({ roster: ROSTER, teamSequence: ['den'] });
  assert.equal(greedyPick(g), 'peyton manning');
});

test('falls through to the next best once the best is used', () => {
  const g = createGame({ roster: ROSTER, teamSequence: ['den', 'den', 'den'] });
  g.step('peyton manning');
  assert.equal(greedyPick(g), 'john elway');
  g.step('john elway');
  assert.equal(greedyPick(g), 'joe flacco');
});

test('returns null when nothing is available', () => {
  const g = createGame({ roster: ROSTER, teamSequence: ['den'] });
  for (const q of ROSTER.teamQbs.den) g.used.add(q);
  assert.equal(greedyPick(g), null);
});

test('plays a full game without ever reusing a QB', () => {
  const g = createGame({ roster: ROSTER, seed: 2026 });
  const picked = [];
  while (!g.done) {
    const p = greedyPick(g);
    if (p) picked.push(p);
    g.step(p);
  }
  assert.equal(g.turn, 25);
  assert.ok(g.totalScore > 0);
  assert.equal(new Set(picked).size, picked.length);
});

test('returns null on a finished game rather than throwing', () => {
  const g = createGame({ roster: ROSTER, teamSequence: ['den'] });
  g.step(null);
  assert.equal(g.done, true);
  assert.equal(greedyPick(g), null);
});

test('the registry exposes Bob with the shared pick signature', () => {
  assert.equal(POLICIES.bob.name, 'Bob');
  assert.equal(POLICIES.bob.fullName, 'Best Option Bot');
  const g = createGame({ roster: ROSTER, teamSequence: ['den'] });
  assert.equal(getPolicy('bob').pick(g, null), 'peyton manning');
});

test('getPolicy rejects unknown ids', () => {
  assert.throws(() => getPolicy('nope'), /Unknown policy/);
});
