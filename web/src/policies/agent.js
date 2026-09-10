/**
 * Sal -- the Saving Artificial Learner. A 5,188-parameter policy network trained
 * from scratch with REINFORCE on roughly 192,000 games.
 *
 * Architecture: obs(11) -> Linear(11,64) -> tanh -> Linear(64,64) -> tanh
 *               -> policy_head(64,4) -> mask illegal -> argmax
 *
 * Two decisions that must not drift:
 *  - ARGMAX, not sampling, so Sal is deterministic and a player can learn his habits.
 *  - Candidates are fed in SORTED yards-descending order. He was trained on shuffled
 *    slots so he could not ride the positional shortcut, so any permutation is valid;
 *    fixing it makes his play reproducible. The parity fixtures use this same order.
 */
import {
  N_CANDIDATES,
  N_ACTIONS,
  SKIP_ACTION,
  buildObservation,
  legalMask,
} from './features.js';

const MASK_FILL = -1e9;

/** y = W x + b, where W is stored row-major as [out][in]. */
function linear(x, W, b) {
  const out = new Array(W.length);
  for (let i = 0; i < W.length; i++) {
    const row = W[i];
    let sum = b[i];
    for (let j = 0; j < row.length; j++) sum += row[j] * x[j];
    out[i] = sum;
  }
  return out;
}

export function createAgent(weights) {
  if (weights.obs_dim !== 11) {
    throw new Error(`Sal expects obs_dim 11, got ${weights.obs_dim}`);
  }
  if (weights.n_actions !== N_ACTIONS) {
    throw new Error(`Sal expects n_actions ${N_ACTIONS}, got ${weights.n_actions}`);
  }

  const p = weights.params;
  return {
    forward(obs) {
      let h = linear(obs, p['trunk.0.weight'], p['trunk.0.bias']).map(Math.tanh);
      h = linear(h, p['trunk.2.weight'], p['trunk.2.bias']).map(Math.tanh);
      return linear(h, p['policy_head.weight'], p['policy_head.bias']);
    },
  };
}

export async function loadAgent(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load Sal from ${url}: ${res.status}`);
  return createAgent(await res.json());
}

export function agentPick(game, agent) {
  const order = game.available().slice(0, N_CANDIDATES);
  if (order.length === 0) return null;

  const logits = agent.forward(buildObservation(game, order));
  const mask = legalMask(order);

  // Illegal actions are pushed to -1e9 before argmax, matching MASK_FILL in
  // experiments/rl/reinforce.py. Strict `>` keeps the first maximum on ties,
  // which is what torch.argmax does.
  let bestAction = -1;
  let bestValue = -Infinity;
  for (let a = 0; a < N_ACTIONS; a++) {
    const v = mask[a] ? logits[a] : MASK_FILL;
    if (v > bestValue) {
      bestValue = v;
      bestAction = a;
    }
  }

  return bestAction === SKIP_ACTION ? null : order[bestAction];
}
