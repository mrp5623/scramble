"""Non-ML policies: per-round greedy and opportunity-cost heuristics.

`opportunity_cost_pick` (v1) discounts a QB by the *sum* of his marginal value across
every other franchise he played for. That double-counts: a QB can only be saved for one
future team, so summing over-penalizes multi-team QBs (it over-saves, and its edge over
greedy even goes negative at high turn counts). `opportunity_cost_v2_pick` fixes this by
taking the *max* over other franchises -- the single best team to reserve him for.
"""
from __future__ import annotations

from typing import Optional

from experiments.scramble_sim import ScrambleSim


def greedy_pick(sim: ScrambleSim) -> Optional[str]:
    avail = sim.available()
    if not avail:
        return None
    return max(avail, key=lambda q: sim.roster.qb_yards[q])


def _appearance_prob(sim: ScrambleSim) -> float:
    """P(a given other franchise appears in the remaining turns after this pick)."""
    n_teams = len(sim.roster.team_codes)
    k = sim.turns_remaining()
    return 1.0 - ((n_teams - 1) / n_teams) ** (k - 1)


def _relevances(sim: ScrambleSim, q: str) -> list[float]:
    """Marginal value of saving q for each *other* franchise he played for (>0 only)."""
    r = sim.roster
    current = sim.current_team
    out = []
    for b in r.qb_teams[q]:
        if b == current:
            continue
        # team_qbs sorted by yards desc; first unused (and != q) is b's best alternative.
        best_other = 0
        for other in r.team_qbs[b]:
            if other != q and other not in sim.used:
                best_other = r.qb_yards[other]
                break
        rel = r.qb_yards[q] - best_other
        if rel > 0:
            out.append(float(rel))
    return out


def opportunity_cost_pick(sim: ScrambleSim) -> Optional[str]:
    """v1: opportunity cost = SUM of marginal value over other franchises (over-saves)."""
    avail = sim.available()
    if not avail:
        return None
    p_k = _appearance_prob(sim)

    def adjusted(q: str) -> float:
        return sim.roster.qb_yards[q] - p_k * sum(_relevances(sim, q))

    return max(avail, key=adjusted)


def opportunity_cost_v2_pick(sim: ScrambleSim) -> Optional[str]:
    """v2: opportunity cost = MAX marginal value over other franchises (q is saved once)."""
    avail = sim.available()
    if not avail:
        return None
    p_k = _appearance_prob(sim)

    def adjusted(q: str) -> float:
        rels = _relevances(sim, q)
        return sim.roster.qb_yards[q] - p_k * (max(rels) if rels else 0.0)

    return max(avail, key=adjusted)
