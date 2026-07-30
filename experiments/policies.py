"""Non-ML policies: per-round greedy and a one-step opportunity-cost heuristic."""
from __future__ import annotations

from typing import Optional

from experiments.scramble_sim import ScrambleSim


def greedy_pick(sim: ScrambleSim) -> Optional[str]:
    avail = sim.available()
    if not avail:
        return None
    return max(avail, key=lambda q: sim.roster.qb_yards[q])


def opportunity_cost_pick(sim: ScrambleSim) -> Optional[str]:
    avail = sim.available()
    if not avail:
        return None

    r = sim.roster
    k = sim.turns_remaining()
    n_teams = len(r.team_codes)
    # Probability a given other franchise shows up in the remaining k-1 turns.
    p_k = 1.0 - ((n_teams - 1) / n_teams) ** (k - 1)
    current = sim.current_team

    def best_other_available(team: str, exclude: str) -> int:
        # team_qbs is sorted by yards desc; first unused (and != exclude) is the best.
        for q in r.team_qbs[team]:
            if q != exclude and q not in sim.used:
                return r.qb_yards[q]
        return 0

    def adjusted(q: str) -> float:
        y = r.qb_yards[q]
        opp = 0.0
        for b in r.qb_teams[q]:
            if b == current:
                continue
            rel = y - best_other_available(b, q)
            if rel > 0:
                opp += rel
        return y - p_k * opp

    return max(avail, key=adjusted)
