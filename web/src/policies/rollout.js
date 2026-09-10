/**
 * Carl -- the Monte Carlo rollout policy. For each realistic candidate, play the rest
 * of the game many times under greedy and take the QB with the best expected total.
 *
 * Port of rollout_pick in experiments/baselines/rollout.py.
 */
import { N_CANDIDATES } from './features.js';

/** Greedy total over a fixed future team sequence, starting from a copy of `used`. */
function greedyScoreOnSequence(roster, used, sequence) {
  const seen = new Set(used);
  let score = 0;
  for (const team of sequence) {
    for (const q of roster.teamQbs[team]) {
      if (!seen.has(q)) {
        score += roster.qbYards[q];
        seen.add(q);
        break;
      }
    }
    // no available QB for this team -> skip, scoring 0
  }
  return score;
}

export function rolloutPick(game, rng, { nRollouts = 40, topK = N_CANDIDATES } = {}) {
  const avail = game.available();
  if (avail.length === 0) return null;

  const { roster } = game;
  const remainingAfter = game.turnsRemaining() - 1;
  const candidates = avail.slice(0, topK); // avail is yards-descending

  // Last turn: there is no future to simulate, so value is immediate yards == greedy.
  if (remainingAfter <= 0) return candidates[0];

  // COMMON RANDOM NUMBERS. The SAME sampled futures must score every candidate.
  // Do not move this generation inside the candidate loop: resampling per candidate
  // lets per-candidate noise (tens of thousands of yards) swamp the few-thousand-yard
  // signal between top QBs, so argmax picks by luck -- the optimizer's curse -- and
  // the resulting policy scores WORSE than plain greedy.
  const sequences = Array.from({ length: nRollouts }, () =>
    Array.from({ length: remainingAfter }, () => rng.choice(roster.teamCodes)),
  );

  let best = null;
  let bestValue = -Infinity;
  for (const q of candidates) {
    const usedAfter = new Set(game.used);
    usedAfter.add(q);
    let total = 0;
    for (const seq of sequences) total += greedyScoreOnSequence(roster, usedAfter, seq);
    const value = roster.qbYards[q] + total / nRollouts;
    if (value > bestValue) {
      bestValue = value;
      best = q;
    }
  }
  return best;
}
