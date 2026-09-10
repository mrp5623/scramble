/**
 * Shared decision features for every policy.
 *
 * Ports of _appearance_prob / _relevances (experiments/baselines/policies.py) and
 * build_observation / legal_action_mask (experiments/sim/gym_env.py). All three bots
 * depend on this math directly or indirectly, so it lives in exactly one place.
 */

export const N_CANDIDATES = 3;
export const N_ACTIONS = 4;
export const SKIP_ACTION = 3;

/** P(a given other franchise appears in the remaining turns after this pick). */
export function appearanceProb(game) {
  const n = game.roster.teamCodes.length;
  const k = game.turnsRemaining();
  return 1 - Math.pow((n - 1) / n, k - 1);
}

/** Marginal value of saving `qb` for each OTHER franchise he played for (positive only). */
export function relevances(game, qb) {
  const { roster } = game;
  const current = game.currentTeam;
  const out = [];
  for (const other of roster.qbTeams.get(qb)) {
    if (other === current) continue;
    // teamQbs is yards-desc, so the first unused QB that isn't `qb` is that team's
    // best alternative to him.
    let bestOther = 0;
    for (const cand of roster.teamQbs[other]) {
      if (cand !== qb && !game.used.has(cand)) {
        bestOther = roster.qbYards[cand];
        break;
      }
    }
    const rel = roster.qbYards[qb] - bestOther;
    if (rel > 0) out.push(rel);
  }
  return out;
}

function maxOrZero(values) {
  let m = 0;
  for (const v of values) if (v > m) m = v;
  return m;
}

/** Opportunity cost of spending `qb` now: p_k * best marginal value elsewhere. */
export function saveValue(game, qb) {
  return appearanceProb(game) * maxOrZero(relevances(game, qb));
}

/**
 * The 11-dim observation Sal was trained on: three candidate blocks of
 * [yards, save-value, flexibility] followed by [turns-remaining, appearance-prob].
 * Slot position carries no ranking signal, so `order` can be any permutation.
 */
export function buildObservation(game, order) {
  const { roster } = game;
  const pk = appearanceProb(game);
  const scale = roster.yardScale;
  const feats = [];

  for (let i = 0; i < N_CANDIDATES; i++) {
    if (i < order.length) {
      const q = order[i];
      const rels = relevances(game, q);
      feats.push(
        roster.qbYards[q] / scale,
        (pk * maxOrZero(rels)) / scale,
        rels.length / 4,
      );
    } else {
      feats.push(0, 0, 0);
    }
  }

  feats.push(game.turnsRemaining() / game.rounds, pk);
  return feats;
}

/** Slot i is legal iff a candidate occupies it; skip is always legal. */
export function legalMask(order) {
  const mask = new Array(N_ACTIONS).fill(false);
  for (let i = 0; i < N_CANDIDATES; i++) mask[i] = i < order.length;
  mask[SKIP_ACTION] = true;
  return mask;
}
