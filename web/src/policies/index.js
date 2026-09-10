/**
 * The policy registry. Adding an opponent is one new file plus one entry here --
 * mode select and the ledger both read from this object, so nothing else changes.
 *
 * Every `pick` shares the signature (game, rng) -> qbName | null. Policies that
 * don't need randomness ignore `rng` so the caller never has to special-case them.
 */
import { greedyPick } from './greedy.js';
import { rolloutPick } from './rollout.js';

export const POLICIES = {
  bob: {
    id: 'bob',
    name: 'Bob',
    fullName: 'Best Option Bot',
    blurb: 'Always takes the highest-yardage quarterback available.',
    pick: (game) => greedyPick(game),
  },
  carl: {
    id: 'carl',
    name: 'Carl',
    fullName: 'Monte Carlo rollout',
    blurb: 'Simulates forty possible futures for each candidate before deciding.',
    pick: (game, rng) => rolloutPick(game, rng),
  },
};

export function getPolicy(id) {
  const policy = POLICIES[id];
  if (!policy) throw new Error(`Unknown policy: ${id}`);
  return policy;
}
