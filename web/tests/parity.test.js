/**
 * Port parity, on every push.
 *
 * web/tools/parity.mjs is the full manual check, including Carl's statistical one.
 * Bob and Sal are exact and deterministic and replay 500 games in well under a
 * second, so they run here too: parity used to be manual, and when the weekly data
 * refresh broke it every game failed with nothing to say so. A real porting bug
 * would have been buried under 500 false alarms.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildRoster } from '../src/roster.js';
import { createGame } from '../src/engine.js';
import { createRng } from '../src/rng.js';
import { greedyPick } from '../src/policies/greedy.js';
import { createAgent, agentPick } from '../src/policies/agent.js';

const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const PARITY_SOURCE = readFileSync(new URL('../tools/parity.mjs', import.meta.url), 'utf8');

const fixtures = read('../tools/fixtures/parity.json');
const roster = buildRoster(read('../tools/fixtures/nfl_qbs.parity.json'));

function playAll(pick) {
  return fixtures.sequences.map((teamSequence, i) => {
    const game = createGame({ roster, teamSequence });
    const rng = createRng(i);
    while (!game.done) game.step(pick(game, rng));
    return game.totalScore;
  });
}

const matches = (totals, expected) => totals.filter((t, i) => t === expected[i]).length;

test('parity checks the port against its own dataset, never the live one', () => {
  // The live file is rebuilt every Tuesday. Pointing parity at it tests the data,
  // not the port, and fails every game after the first refresh.
  assert.ok(PARITY_SOURCE.includes("'./fixtures/nfl_qbs.parity.json'"));
  assert.ok(!PARITY_SOURCE.includes('../../data/nfl_qbs.json'));
});

test('Bob matches the Python study on every one of 500 games', () => {
  // Integer arithmetic only, so any mismatch at all is a real bug.
  const totals = playAll((game) => greedyPick(game));
  assert.equal(matches(totals, fixtures.greedyTotals), fixtures.nGames);
});

test('Sal matches the Python study game by game', () => {
  // Spec §10 tolerates an isolated last-bit tanh difference flipping a near-tied
  // argmax. A genuine porting bug -- a mis-ordered feature, a wrong activation --
  // is systematic and lands far below this line; the refresh bug scored 0/500.
  const agent = createAgent(read('../weights/sal.json'));
  const totals = playAll((game) => agentPick(game, agent));
  assert.ok(
    matches(totals, fixtures.salTotals) >= fixtures.nGames - 5,
    `only ${matches(totals, fixtures.salTotals)}/${fixtures.nGames} games matched`,
  );
});
