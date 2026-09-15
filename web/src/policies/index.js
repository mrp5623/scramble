/**
 * The policy registry. Adding an opponent is one new file plus one entry here --
 * mode select and the ledger both read from this object, so nothing else changes.
 *
 * Every `pick` shares the signature (game, rng) -> qbName | null. Policies that
 * don't need randomness ignore `rng` so the caller never has to special-case them.
 */
import { greedyPick } from './greedy.js';
import { rolloutPick } from './rollout.js';
import { agentPick } from './agent.js';

export const POLICIES = {
  bob: {
    id: 'bob',
    name: 'Bob',
    fullName: 'Greedy Bot',
    ready: true,
    pick: (game) => greedyPick(game),
  },
  carl: {
    id: 'carl',
    name: 'Carl',
    fullName: 'Monte Carlo rollout',
    ready: true,
    pick: (game, rng) => rolloutPick(game, rng),
  },
  sal: {
    id: 'sal',
    name: 'Sal',
    fullName: 'Trained Reinforcement Learning Agent',
    ready: false,
    pick: () => {
      throw new Error('Sal is not loaded yet -- call registerSal(agent) first');
    },
  },
};

export function getPolicy(id) {
  const policy = POLICIES[id];
  if (!policy) throw new Error(`Unknown policy: ${id}`);
  return policy;
}

/** Sal cannot play until his weights are fetched; this wires them in once they are. */
export function registerSal(agent) {
  POLICIES.sal.pick = (game) => agentPick(game, agent);
  POLICIES.sal.ready = true;
}
