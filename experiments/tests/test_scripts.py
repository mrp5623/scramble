from pathlib import Path

import torch

from experiments.scripts.train_model1 import next_run_dir
from experiments.scripts.probe_over_training import (
    _save_indices, greedy_agreement, save_ablation,
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


def test_greedy_agreement_is_a_fraction():
    torch.manual_seed(0)
    model = ActorCritic(OBS_DIM_SHUFFLED, N_ACTIONS, 16)
    frac = greedy_agreement(model, load_roster(), OBS_DIM_SHUFFLED, seeds=range(3))
    assert 0.0 <= frac <= 1.0


def test_save_ablation_is_nonnegative():
    torch.manual_seed(0)
    model = ActorCritic(OBS_DIM_SHUFFLED, N_ACTIONS, 16)
    val = save_ablation(model, load_roster(), OBS_DIM_SHUFFLED, seeds=range(3))
    assert val >= 0.0
