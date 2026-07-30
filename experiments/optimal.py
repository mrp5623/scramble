"""Offline (clairvoyant) optimum: maximum-weight bipartite matching of QBs to team-slots.

Because edge weights depend only on the QB (career yards, team-independent), the set of
simultaneously matchable QBs is a transversal matroid, so processing QBs in descending
yards and adding each one that can still be matched (via an augmenting path) is exactly
optimal.
"""
from __future__ import annotations

from typing import Optional

from experiments.scramble_sim import Roster


def offline_optimum(team_sequence: list[str], roster: Roster) -> int:
    slots = list(team_sequence)            # slot i -> team code
    n_slots = len(slots)
    if n_slots == 0:
        return 0

    seq_teams = set(slots)
    candidates = [q for q in roster.qb_yards if roster.qb_teams[q] & seq_teams]
    candidates.sort(key=lambda q: (-roster.qb_yards[q], q))

    match_for_slot: list[Optional[str]] = [None] * n_slots

    def try_assign(qb: str, visited: list[bool]) -> bool:
        for i in range(n_slots):
            if not visited[i] and slots[i] in roster.qb_teams[qb]:
                visited[i] = True
                if match_for_slot[i] is None or try_assign(match_for_slot[i], visited):
                    match_for_slot[i] = qb
                    return True
        return False

    total = 0
    matched = 0
    for qb in candidates:
        if matched == n_slots:
            break  # all slots full: matching is saturated, nothing more can be added
        if try_assign(qb, [False] * n_slots):
            total += roster.qb_yards[qb]
            matched += 1
    return total
