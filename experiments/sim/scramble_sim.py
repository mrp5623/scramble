"""Headless simulator mirroring the Scramble game exactly (Phase 1 design spec)."""
from __future__ import annotations

import json
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

REPO_ROOT = Path(__file__).resolve().parents[2]  # experiments/sim/ -> experiments/ -> repo root
DATA_PATH = REPO_ROOT / "data" / "nfl_qbs.json"
NUM_ROUNDS = 25


@dataclass
class Roster:
    team_codes: list[str]
    team_qbs: dict[str, list[str]]      # code -> qbs sorted by career yards desc
    qb_yards: dict[str, int]            # qb -> career yards
    qb_teams: dict[str, set[str]]       # qb -> franchises he is eligible for


def load_roster(path: Optional[Path] = None) -> Roster:
    path = Path(path) if path else DATA_PATH
    if not path.exists():
        raise FileNotFoundError(
            f"Dataset not found: {path}\nGenerate it with tools/update_stats.py"
        )
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    team_codes = sorted(data.keys())
    team_qbs: dict[str, list[str]] = {}
    qb_yards: dict[str, int] = {}
    qb_teams: dict[str, set[str]] = {}
    for code in team_codes:
        qbs = data[code]["qbs"]
        ordered = sorted(qbs.keys(), key=lambda q: (-int(qbs[q]), q))
        team_qbs[code] = ordered
        for q, y in qbs.items():
            qb_yards[q] = int(y)
            qb_teams.setdefault(q, set()).add(code)
    return Roster(team_codes, team_qbs, qb_yards, qb_teams)


class ScrambleSim:
    def __init__(self, roster: Roster, num_rounds: int = NUM_ROUNDS, seed: Optional[int] = None):
        self.roster = roster
        self.num_rounds = num_rounds
        self._rng = random.Random(seed)
        self.reset(seed)

    def reset(self, seed: Optional[int] = None) -> None:
        if seed is not None:
            self._rng.seed(seed)
        self.team_sequence = [
            self._rng.choice(self.roster.team_codes) for _ in range(self.num_rounds)
        ]
        self.turn = 0
        self.used: set[str] = set()
        self.total_score = 0

    @property
    def done(self) -> bool:
        return self.turn >= self.num_rounds

    @property
    def current_team(self) -> str:
        return self.team_sequence[self.turn]

    def turns_remaining(self) -> int:
        return self.num_rounds - self.turn

    def available_for(self, team_code: str) -> list[str]:
        return [q for q in self.roster.team_qbs[team_code] if q not in self.used]

    def available(self) -> list[str]:
        return self.available_for(self.current_team)

    def step(self, pick: Optional[str]) -> tuple[int, bool]:
        reward = 0
        if (
            pick is not None
            and pick not in self.used
            and pick in self.roster.qb_teams
            and self.current_team in self.roster.qb_teams[pick]
        ):
            reward = self.roster.qb_yards[pick]
            self.used.add(pick)
            self.total_score += reward
        self.turn += 1
        return reward, self.done
