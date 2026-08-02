"""Monte-Carlo rollout policy: the best-achievable *online* reference.

At each decision, for each realistic candidate QB, play the rest of the game many times
with random future teams under a greedy base policy, and pick the QB with the highest
expected total (immediate yards + average simulated future). By the policy-improvement
theorem this is at least as good as greedy in expectation; it is the honest target an
online agent (RL) could aim for, unlike the clairvoyant offline optimum.

Variance reduction: candidates are compared on **common random numbers** -- the same set
of sampled future team-sequences is reused for every candidate. Without this, the noise
in each candidate's future estimate (tens of thousands of yards) swamps the few-thousand
signal between top QBs, and argmax over noisy estimates picks by luck (the optimizer's
curse), producing a policy that is *worse* than greedy.
"""
from __future__ import annotations

import random
from typing import Optional

from experiments.sim.scramble_sim import Roster, ScrambleSim


def _greedy_score_on_sequence(roster: Roster, used: set[str], sequence: list[str]) -> int:
    """Greedy total over a fixed future team-sequence, starting from a copy of `used`."""
    used = set(used)
    score = 0
    for team in sequence:
        for q in roster.team_qbs[team]:      # sorted by yards desc
            if q not in used:
                score += roster.qb_yards[q]
                used.add(q)
                break
        # no available QB for this team -> skip (0)
    return score


def greedy_rollout(roster: Roster, used: set[str], remaining: int, rng: random.Random) -> int:
    """Simulate `remaining` turns of greedy play from a copy of `used`; return total yards."""
    sequence = [rng.choice(roster.team_codes) for _ in range(remaining)]
    return _greedy_score_on_sequence(roster, used, sequence)


def rollout_pick(
    sim: ScrambleSim,
    n_rollouts: int = 40,
    top_k: int = 3,   # empirically, saving outside a team's top 3 never helps (see run_ceiling)
    rng: Optional[random.Random] = None,
) -> Optional[str]:
    avail = sim.available()
    if not avail:
        return None
    roster = sim.roster
    remaining_after = sim.turns_remaining() - 1   # turns after this pick

    candidates = sorted(avail, key=lambda q: roster.qb_yards[q], reverse=True)[:top_k]

    # Last turn: no future -> value is immediate yards only == greedy.
    if remaining_after <= 0:
        return max(candidates, key=lambda q: roster.qb_yards[q])

    rng = rng or random.Random()
    # Common random numbers: the SAME future sequences score every candidate.
    sequences = [
        [rng.choice(roster.team_codes) for _ in range(remaining_after)]
        for _ in range(n_rollouts)
    ]

    best_q: Optional[str] = None
    best_val = -1.0
    for q in candidates:
        used_after = sim.used | {q}
        immediate = roster.qb_yards[q]
        total = 0
        for seq in sequences:
            total += _greedy_score_on_sequence(roster, used_after, seq)
        value = immediate + total / n_rollouts
        if value > best_val:
            best_val = value
            best_q = q
    return best_q
