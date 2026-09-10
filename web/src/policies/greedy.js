/**
 * Bob -- the Best Option Bot. Always takes the highest-yardage available QB.
 *
 * Port of greedy_pick in experiments/baselines/policies.py. `available()` preserves
 * the roster's yards-descending order (ties by name ascending), which is exactly what
 * Python's max() over the same list returns, so element 0 is the greedy pick.
 */
export function greedyPick(game) {
  const avail = game.available();
  return avail.length ? avail[0] : null;
}
