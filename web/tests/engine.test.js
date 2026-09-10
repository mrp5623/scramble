import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildRoster } from '../src/roster.js';
import { createGame, NUM_ROUNDS } from '../src/engine.js';
import { TINY_DATA } from './fixtures/tiny-roster.js';

const DATA = JSON.parse(
  readFileSync(new URL('../../data/nfl_qbs.json', import.meta.url), 'utf8'),
);
const ROSTER = buildRoster(DATA);
const TINY = buildRoster(TINY_DATA);

test('draws 25 valid teams by default', () => {
  const g = createGame({ roster: ROSTER, seed: 1 });
  assert.equal(g.rounds, NUM_ROUNDS);
  assert.equal(g.teamSequence.length, 25);
  for (const code of g.teamSequence) assert.ok(ROSTER.teamCodes.includes(code));
});

test('the same seed draws the same sequence', () => {
  const a = createGame({ roster: ROSTER, seed: 12345 });
  const b = createGame({ roster: ROSTER, seed: 12345 });
  assert.deepEqual(a.teamSequence, b.teamSequence);
});

test('an explicit sequence overrides the draw and sets the round count', () => {
  const g = createGame({ roster: TINY, teamSequence: ['aaa', 'bbb', 'aaa'] });
  assert.deepEqual(g.teamSequence, ['aaa', 'bbb', 'aaa']);
  assert.equal(g.rounds, 3);
  assert.equal(g.currentTeam, 'aaa');
});

test('a valid pick scores its yards, is marked used, and advances the turn', () => {
  const g = createGame({ roster: TINY, teamSequence: ['aaa', 'bbb'] });
  const { reward, done } = g.step('alpha qb');
  assert.equal(reward, 100);
  assert.equal(g.totalScore, 100);
  assert.ok(g.used.has('alpha qb'));
  assert.equal(g.turn, 1);
  assert.equal(done, false);
});

test('reusing a QB scores zero but still advances', () => {
  const g = createGame({ roster: TINY, teamSequence: ['aaa', 'bbb'] });
  g.step('alpha qb');
  const { reward } = g.step('alpha qb');
  assert.equal(reward, 0);
  assert.equal(g.totalScore, 100);
  assert.equal(g.turn, 2);
});

test('a QB who never played for the current team scores zero', () => {
  const g = createGame({ roster: TINY, teamSequence: ['aaa'] });
  const { reward } = g.step('gamma qb');
  assert.equal(reward, 0);
  assert.equal(g.totalScore, 0);
});

test('skipping scores zero and advances', () => {
  const g = createGame({ roster: TINY, teamSequence: ['aaa'] });
  const { reward, done } = g.step(null);
  assert.equal(reward, 0);
  assert.equal(done, true);
});

test('available() excludes used QBs and stays yards-ordered', () => {
  const g = createGame({ roster: ROSTER, teamSequence: ['den', 'den'] });
  assert.equal(g.available()[0], 'peyton manning');
  g.step('peyton manning');
  assert.equal(g.available()[0], 'john elway');
  assert.ok(!g.available().includes('peyton manning'));
});

test('turnsRemaining counts down and the game ends after the last round', () => {
  const g = createGame({ roster: ROSTER, seed: 3 });
  assert.equal(g.turnsRemaining(), 25);
  for (let i = 0; i < 25; i++) g.step(null);
  assert.equal(g.turnsRemaining(), 0);
  assert.equal(g.done, true);
});

test('a completed game reports currentTeam null and available [] without throwing', () => {
  const g = createGame({ roster: TINY, teamSequence: ['aaa'] });
  g.step(null);
  assert.equal(g.done, true);
  assert.equal(g.currentTeam, null);
  assert.deepEqual(g.available(), []);
});

test('seed defaults to null when an explicit sequence is injected', () => {
  const g = createGame({ roster: TINY, teamSequence: ['aaa', 'bbb'] });
  assert.equal(g.seed, null);
});
