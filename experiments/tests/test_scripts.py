from pathlib import Path

import torch

from experiments.scripts.train_model1 import next_run_dir
from experiments.scripts.probe_over_training import (
    _save_indices, save_ablation,
)
from experiments.sim.scramble_sim import load_roster
from experiments.sim.gym_env import OBS_DIM, OBS_DIM_SHUFFLED, N_ACTIONS
from experiments.rl.reinforce import ActorCritic


def test_next_run_dir_starts_at_001(tmp_path):
    d = next_run_dir(tmp_path, "ev")
    assert d.name == "run_001_ev" and d.is_dir()


def test_next_run_dir_increments(tmp_path):
    (tmp_path / "run_001_ev").mkdir()
    (tmp_path / "run_007_shuffle").mkdir()
    d = next_run_dir(tmp_path, "shuffle")
    assert d.name == "run_008_shuffle"


def test_save_indices_match_layout():
    # shuffled block [yards, save, flex] -> save at 1,4,7; legacy [yards, drop, save, flex] -> 2,6,10
    assert _save_indices(OBS_DIM_SHUFFLED) == [1, 4, 7]
    assert _save_indices(OBS_DIM) == [2, 6, 10]


def test_save_ablation_is_nonnegative():
    torch.manual_seed(0)
    model = ActorCritic(OBS_DIM_SHUFFLED, N_ACTIONS, 16)
    val = save_ablation(model, load_roster(), OBS_DIM_SHUFFLED, seeds=range(3))
    assert val >= 0.0


def test_agent_mean_score_returns_full_game_total():
    from experiments.scripts.probe_over_training import agent_mean_score
    torch.manual_seed(0)
    model = ActorCritic(OBS_DIM_SHUFFLED, N_ACTIONS, 16)
    s = agent_mean_score(model, load_roster(), seeds=range(3))
    # a random policy skips a lot (low score); a trained one nears greedy (~1.2M). Either way a
    # 25-round total is a non-negative score below the clairvoyant ceiling.
    assert 0.0 <= s < 1_400_000


def test_expected_best_of_n():
    import numpy as np
    from experiments.scripts.run_risk import expected_best_of_n
    scores = np.array([10.0, 20.0])
    assert expected_best_of_n(scores, 1) == 15.0            # E[max of 1] == mean
    assert abs(expected_best_of_n(scores, 2) - 17.5) < 1e-9  # E[max of 2, with replacement]
    assert abs(expected_best_of_n(scores, 10_000) - 20.0) < 1e-3   # large N -> the max
    # monotonic non-decreasing in n
    vals = [expected_best_of_n(scores, n) for n in (1, 2, 5, 50)]
    assert all(b >= a - 1e-12 for a, b in zip(vals, vals[1:]))
