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
FEATS_PER_CANDIDATE = 4   # legacy sorted layout: [yards, drop-to-next, save-value, flexibility]
N_GLOBAL = 2              # [turns-remaining, appearance-prob]
OBS_DIM = N_CANDIDATES * FEATS_PER_CANDIDATE + N_GLOBAL   # 14
N_ACTIONS = N_CANDIDATES + 1                              # 3 ranks + skip
SKIP_ACTION = N_CANDIDATES                                # == 3

# Shuffled layout drops "drop-to-next" (it leaks rank: only the best QB has a positive
# gap to the next). Per candidate: [yards, save-value, flexibility]. With the slots
# shuffled, position carries no ranking signal, so the agent must READ the yards to
# find the greedy pick instead of always taking slot 0.
FEATS_SHUFFLED = 3
OBS_DIM_SHUFFLED = N_CANDIDATES * FEATS_SHUFFLED + N_GLOBAL   # 11


def candidate_order(sim: ScrambleSim, rng=None) -> list[str]:
    """Top-N available QBs in slot order. With `rng`, shuffle them so 'slot 0' is no
    longer 'the best QB' -- the agent must read the features to find the max. Without
    `rng`, returns sorted-by-yards (the legacy positional layout)."""
    avail = sim.available()[:N_CANDIDATES]
    if rng is not None and len(avail) > 1:
        avail = [avail[i] for i in rng.permutation(len(avail))]
    return avail


def build_observation(sim: ScrambleSim, yard_scale: float, order=None) -> np.ndarray:
    """Engineered observation for the current decision (see module docstring).

    order=None -> legacy 14-dim sorted layout, 4 feats/candidate incl. drop-to-next.
    order=list -> shuffled 11-dim layout, 3 feats/candidate [yards, save_value, flexibility];
                  candidate blocks follow `order`, so slot position carries no ranking signal.
    """
    r = sim.roster
    p_k = _appearance_prob(sim)
    feats: list[float] = []
    if order is None:
        avail = sim.available()          # QBs for current team, sorted by yards desc
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
    else:
        for i in range(N_CANDIDATES):
            if i < len(order):
                q = order[i]
                rels = _relevances(sim, q)
                save_value = p_k * (max(rels) if rels else 0.0)
                feats += [
                    r.qb_yards[q] / yard_scale,
                    save_value / yard_scale,
                    len(rels) / 4.0,
                ]
            else:
                feats += [0.0, 0.0, 0.0]
    feats.append(sim.turns_remaining() / sim.num_rounds)
    feats.append(p_k)
    return np.asarray(feats, dtype=np.float32)


def legal_action_mask(sim: ScrambleSim, order=None) -> np.ndarray:
    """Boolean mask over Discrete(4): rank i legal iff >= i+1 QBs available; skip always legal.

    With `order` (shuffle mode), legality counts the shuffled slots instead of raw availables.
    """
    n = len(sim.available()) if order is None else len(order)
    mask = np.zeros(N_ACTIONS, dtype=bool)
    mask[:N_CANDIDATES] = np.arange(N_CANDIDATES) < n
    mask[SKIP_ACTION] = True
    return mask


def decode_action(sim: ScrambleSim, action: int, order=None) -> Optional[str]:
    """Map a slot action to a QB name; skip or an illegal slot -> None.

    order=None -> slots are sorted-by-yards (legacy); order=list -> slots follow `order`.
    """
    if action == SKIP_ACTION:
        return None
    candidates = sim.available() if order is None else order
    if 0 <= action < len(candidates):
        return candidates[action]
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

    def __init__(self, roster=None, num_rounds: int = NUM_ROUNDS, seed=None,
                 shaping_coef: float = 0.0, shuffle: bool = False, shuffle_seed=None):
        super().__init__()
        self.roster = roster if roster is not None else load_roster()
        self.yard_scale = float(max(self.roster.qb_yards.values()))
        # >0 turns on opportunity-cost reward shaping (affects the LEARNING reward only;
        # info["raw_reward"] and sim.total_score stay the TRUE score for reporting).
        self.shaping_coef = float(shaping_coef)
        # shuffle=True randomizes candidate slot order each decision (11-dim obs) so the
        # agent can't ride the positional shortcut; the perm RNG is separate from the sim's
        # draw RNG so CRN pairing / greedy baselines are unaffected (greedy ignores order).
        self.shuffle = bool(shuffle)
        self._perm_rng = np.random.default_rng(shuffle_seed) if self.shuffle else None
        self._order = None
        self.sim = ScrambleSim(self.roster, num_rounds=num_rounds, seed=seed)
        self._obs_dim = OBS_DIM_SHUFFLED if self.shuffle else OBS_DIM
        # obs features are ~[0,1]; flexibility can exceed 1 for very-multi-team QBs -> loose bound
        self.observation_space = spaces.Box(low=0.0, high=2.0, shape=(self._obs_dim,), dtype=np.float32)
        self.action_space = spaces.Discrete(N_ACTIONS)

    def _new_order(self):
        return candidate_order(self.sim, self._perm_rng) if self.shuffle else None

    def action_mask(self) -> np.ndarray:
        return legal_action_mask(self.sim, self._order)

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        self.sim.reset(seed)
        # Reseed the perm RNG from the same seed so a given seed -> a reproducible perm
        # sequence (eval/probe need determinism; training passes random per-episode seeds).
        if self.shuffle and seed is not None:
            self._perm_rng = np.random.default_rng(seed)
        self._order = self._new_order()
        return build_observation(self.sim, self.yard_scale, self._order), {}

    def step(self, action):
        team = self.sim.current_team
        pick = decode_action(self.sim, int(action), self._order)
        # Opportunity-cost shaping: charge the save-value of the QB spent, computed in the
        # PRE-step state (after the step, `pick` is used and p_k/relevances have changed).
        shaped = 0.0
        if self.shaping_coef and pick is not None:
            shaped = -self.shaping_coef * save_value(self.sim, pick)
        raw_reward, done = self.sim.step(pick)
        reward = (raw_reward + shaped) / self.yard_scale
        info = {"raw_reward": raw_reward, "picked": pick, "team": team}
        self._order = None if done else self._new_order()
        obs = (
            np.zeros(self._obs_dim, dtype=np.float32)
            if done
            else build_observation(self.sim, self.yard_scale, self._order)
        )
        return obs, reward, done, False, info
