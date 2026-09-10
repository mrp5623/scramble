/**
 * Verifies the JavaScript port against the Python study. Run once after porting;
 * this is a confidence check, not a test suite.
 *
 *   node web/tools/parity.mjs
 *
 * Bob and Sal are deterministic, so they are compared game by game. Carl needs random
 * futures, and Python's Mersenne Twister cannot be reproduced here, so he is compared
 * in aggregate against the exported mean.
 */
import { readFileSync } from 'node:fs';
import { buildRoster } from '../src/roster.js';
import { createGame } from '../src/engine.js';
import { createRng } from '../src/rng.js';
import { greedyPick } from '../src/policies/greedy.js';
import { rolloutPick } from '../src/policies/rollout.js';
import { createAgent, agentPick } from '../src/policies/agent.js';

const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));

const roster = buildRoster(read('../../data/nfl_qbs.json'));
const agent = createAgent(read('../weights/sal.json'));
const fx = read('./fixtures/parity.json');

const playAll = (sequences, pickFor) =>
  sequences.map((teamSequence, i) => {
    const game = createGame({ roster, teamSequence });
    const rng = createRng(i);
    while (!game.done) game.step(pickFor(game, rng));
    return game.totalScore;
  });

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

function exactCheck(label, actual, expected) {
  const mismatches = [];
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) {
      mismatches.push({ game: i, js: actual[i], py: expected[i] });
    }
  }
  const ok = mismatches.length === 0;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label}: ${expected.length - mismatches.length}/${expected.length} games match exactly`,
  );
  for (const m of mismatches.slice(0, 5)) {
    console.log(`        game ${m.game}: js ${m.js.toLocaleString()} vs py ${m.py.toLocaleString()}`);
  }
  if (mismatches.length > 5) console.log(`        ...and ${mismatches.length - 5} more`);
  return ok;
}

console.log(`Comparing ${fx.n_games} games against Python\n`);

const bobOk = exactCheck('Bob   ', playAll(fx.sequences, (g) => greedyPick(g)), fx.greedyTotals);
const salOk = exactCheck('Sal   ', playAll(fx.sequences, (g) => agentPick(g, agent)), fx.salTotals);

const carlScores = playAll(fx.sequences, (g, rng) => rolloutPick(g, rng));
const carlMean = mean(carlScores);
const sd = Math.sqrt(
  carlScores.reduce((a, x) => a + (x - carlMean) ** 2, 0) / (carlScores.length - 1),
);
const stderr = sd / Math.sqrt(carlScores.length);
const diff = carlMean - fx.rolloutMean;
const sigmas = Math.abs(diff) / stderr;
const carlOk = sigmas < 3;

console.log(
  `${carlOk ? 'PASS' : 'FAIL'}  Carl  : js mean ${carlMean.toLocaleString(undefined, { maximumFractionDigits: 0 })} vs py ${fx.rolloutMean.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
);
console.log(
  `        difference ${diff > 0 ? '+' : ''}${diff.toFixed(0)}, standard error ${stderr.toFixed(0)} (${sigmas.toFixed(2)} sigma)`,
);

console.log(`\nSal beats Bob by ${(mean(fx.salTotals) - mean(fx.greedyTotals)).toFixed(0)} yards per game (Python figures).`);

if (!bobOk || !salOk || !carlOk) {
  console.log('\nSome checks failed. Note that an isolated Sal mismatch can be a');
  console.log('last-bit tanh difference flipping a near-tied argmax; a systematic');
  console.log('pattern is a real bug. Any Bob mismatch is always a real bug.');
  process.exit(1);
}
console.log('\nAll checks passed.');
