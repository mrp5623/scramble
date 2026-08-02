"""Gymnasium environment + engineered observation for Scramble RL Model #1.

The observation hands the agent the opportunity-cost *save value* (the same discount
the v2 heuristic subtracts) as an input feature, so the agent only learns *when* to
trust it. The action space is rank-based over a team's top-3 available QBs (F4: saving
outside the top 3 never helps), plus an explicit skip.
"""
from __future__ import annotations

from typing import Optional

import numpy as np
import gymnasium as gym
from gymnasium import spaces

from experiments.sim.scramble_sim import NUM_ROUNDS, ScrambleSim, load_roster
from experiments.baselines.policies import _appearance_prob, _relevances

N_CANDIDATES = 3          # per-team ranks the agent chooses among
FEATS_PER_CANDIDATE = 4   # [yards, drop-to-next, save-value, flexibility]
N_GLOBAL = 2              # [turns-remaining, appearance-prob]
OBS_DIM = N_CANDIDATES * FEATS_PER_CANDIDATE + N_GLOBAL   # 14
N_ACTIONS = N_CANDIDATES + 1                              # 3 ranks + skip
SKIP_ACTION = N_CANDIDATES                                # == 3


def build_observation(sim: ScrambleSim, yard_scale: float) -> np.ndarray:
    """14 engineered floats describing the current decision (see module docstring)."""
    r = sim.roster
    avail = sim.available()          # QBs for current team, sorted by yards desc
    p_k = _appearance_prob(sim)
    feats: list[float] = []
    for i in range(N_CANDIDATES):
        if i < len(avail):
            q = avail[i]
            yards = r.qb_yards[q]
            next_yards = r.qb_yards[avail[i + 1]] if i + 1 < len(avail) else 0
            rels = _relevances(sim, q)
            save_value = p_k * (max(rels) if rels else 0.0)
            feats += [
                yards / yard_scale,
                (yards - next_yards) / yard_scale,
                save_value / yard_scale,
                len(rels) / 4.0,
            ]
        else:
            feats += [0.0, 0.0, 0.0, 0.0]
    feats.append(sim.turns_remaining() / sim.num_rounds)
    feats.append(p_k)
    return np.asarray(feats, dtype=np.float32)


def legal_action_mask(sim: ScrambleSim) -> np.ndarray:
    """Boolean mask over Discrete(4): rank i legal iff >= i+1 QBs available; skip always legal."""
    n = len(sim.available())
    mask = np.zeros(N_ACTIONS, dtype=bool)
    mask[:N_CANDIDATES] = np.arange(N_CANDIDATES) < n
    mask[SKIP_ACTION] = True
    return mask


def decode_action(sim: ScrambleSim, action: int) -> Optional[str]:
    """Map a rank action to a QB name; skip or an illegal rank -> None."""
    if action == SKIP_ACTION:
        return None
    avail = sim.available()
    if 0 <= action < len(avail):
        return avail[action]
    return None


def save_value(sim: ScrambleSim, q: str) -> float:
    """Opportunity cost of spending QB q now = p_k * best marginal value to another team.

    This is the exact quantity the v2 heuristic subtracts and that observation feature
    index 2 exposes (before yard-scaling). Reward shaping charges the agent this cost so
    the delayed value of saving becomes an immediate, learnable signal.
    """
    rels = _relevances(sim, q)
    return _appearance_prob(sim) * (max(rels) if rels else 0.0)


class ScrambleEnv(gym.Env):
    """Gymnasium wrapper over ScrambleSim with the engineered observation + rank action."""

    metadata = {"render_modes": []}

    def __init__(self, roster=None, num_rounds: int = NUM_ROUNDS, seed=None, shaping_coef: float = 0.0):
        super().__init__()
        self.roster = roster if roster is not None else load_roster()
        self.yard_scale = float(max(self.roster.qb_yards.values()))
        # >0 turns on opportunity-cost reward shaping (affects the LEARNING reward only;
        # info["raw_reward"] and sim.total_score stay the TRUE score for reporting).
        self.shaping_coef = float(shaping_coef)
        self.sim = ScrambleSim(self.roster, num_rounds=num_rounds, seed=seed)
        # obs features are ~[0,1]; flexibility can exceed 1 for very-multi-team QBs -> loose bound
        self.observation_space = spaces.Box(low=0.0, high=2.0, shape=(OBS_DIM,), dtype=np.float32)
        self.action_space = spaces.Discrete(N_ACTIONS)

    def action_mask(self) -> np.ndarray:
        return legal_action_mask(self.sim)

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        self.sim.reset(seed)
        return build_observation(self.sim, self.yard_scale), {}

    def step(self, action):
        team = self.sim.current_team
        pick = decode_action(self.sim, int(action))
        # Opportunity-cost shaping: charge the save-value of the QB spent, computed in the
        # PRE-step state (after the step, `pick` is used and p_k/relevances have changed).
        shaped = 0.0
        if self.shaping_coef and pick is not None:
            shaped = -self.shaping_coef * save_value(self.sim, pick)
        raw_reward, done = self.sim.step(pick)
        reward = (raw_reward + shaped) / self.yard_scale
        info = {"raw_reward": raw_reward, "picked": pick, "team": team}
        obs = (
            np.zeros(OBS_DIM, dtype=np.float32)
            if done
            else build_observation(self.sim, self.yard_scale)
        )
        return obs, reward, done, False, info
