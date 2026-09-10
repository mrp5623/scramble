import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildRoster } from '../src/roster.js';
import { createGame } from '../src/engine.js';
import { createRng } from '../src/rng.js';
import { rolloutPick } from '../src/policies/rollout.js';
import { POLICIES } from '../src/policies/index.js';

const DATA = JSON.parse(
  readFileSync(new URL('../../data/nfl_qbs.json', import.meta.url), 'utf8'),
);
const ROSTER = buildRoster(DATA);

test('picks from the top 3 available QBs', () => {
  const g = createGame({ roster: ROSTER, seed: 11 });
  const pick = rolloutPick(g, createRng(1), { nRollouts: 8 });
  assert.ok(g.available().slice(0, 3).includes(pick));
});

test('is deterministic given the same rng seed and state', () => {
  const g1 = createGame({ roster: ROSTER, teamSequence: ['den', 'crd', 'gnb'] });
  const g2 = createGame({ roster: ROSTER, teamSequence: ['den', 'crd', 'gnb'] });
  assert.equal(
    rolloutPick(g1, createRng(5), { nRollouts: 8 }),
    rolloutPick(g2, createRng(5), { nRollouts: 8 }),
  );
});

test('on the final turn it reduces to greedy', () => {
  const g = createGame({ roster: ROSTER, teamSequence: ['den'] });
  assert.equal(rolloutPick(g, createRng(1), { nRollouts: 8 }), 'peyton manning');
});

test('returns null when nothing is available', () => {
  const g = createGame({ roster: ROSTER, teamSequence: ['den', 'den'] });
  for (const q of ROSTER.teamQbs.den) g.used.add(q);
  assert.equal(rolloutPick(g, createRng(1), { nRollouts: 8 }), null);
});

test('respects topK', () => {
  const g = createGame({ roster: ROSTER, teamSequence: ['den', 'crd'] });
  const pick = rolloutPick(g, createRng(3), { nRollouts: 8, topK: 1 });
  assert.equal(pick, 'peyton manning');
});

test('plays a full game without reusing a QB', () => {
  const g = createGame({ roster: ROSTER, seed: 77 });
  const rng = createRng(77);
  const picked = [];
  while (!g.done) {
    const p = rolloutPick(g, rng, { nRollouts: 8 });
    if (p) picked.push(p);
    g.step(p);
  }
  assert.equal(g.turn, 25);
  assert.ok(g.totalScore > 0);
  assert.equal(new Set(picked).size, picked.length);
});

test('the registry exposes Carl', () => {
  assert.equal(POLICIES.carl.name, 'Carl');
  const g = createGame({ roster: ROSTER, teamSequence: ['den'] });
  assert.equal(POLICIES.carl.pick(g, createRng(1)), 'peyton manning');
});

test('scores every candidate on the same sampled futures (common random numbers)', () => {
  // With CRN the futures are drawn once: nRollouts sequences of remainingAfter
  // team draws, independent of how many candidates are being compared. A version
  // that resampled per candidate would multiply this by the candidate count,
  // which is the regression that silently drops Carl below greedy.
  const g = createGame({ roster: ROSTER, teamSequence: ['den', 'crd', 'gnb', 'nyj'] });
  assert.equal(g.available().length >= 3, true, 'need at least 3 candidates for this test to be meaningful');

  const base = createRng(5);
  let choiceCalls = 0;
  const counting = {
    next: () => base.next(),
    int: (n) => base.int(n),
    choice: (array) => {
      choiceCalls += 1;
      return base.choice(array);
    },
  };

  const nRollouts = 8;
  const remainingAfter = g.turnsRemaining() - 1;
  rolloutPick(g, counting, { nRollouts, topK: 3 });

  assert.equal(choiceCalls, nRollouts * remainingAfter);
});
