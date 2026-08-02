import numpy as np
import pytest

from experiments.sim.scramble_sim import Roster, ScrambleSim
from experiments.baselines.policies import _appearance_prob, _relevances
from experiments.sim.gym_env import (
    OBS_DIM, N_ACTIONS,
    build_observation, legal_action_mask, decode_action,
)


def _forced_sim():
    """Tiny 2-team roster with a forced all-'A' schedule for deterministic asserts.
    x plays for A and B; y and z only for A. yard_scale is 100."""
    r = Roster(
        team_codes=["A", "B"],
        team_qbs={"A": ["x", "y", "z"], "B": ["x"]},   # sorted yards desc
        qb_yards={"x": 100, "y": 60, "z": 30},
        qb_teams={"x": {"A", "B"}, "y": {"A"}, "z": {"A"}},
    )
    sim = ScrambleSim(r, num_rounds=5, seed=0)
    sim.team_sequence = ["A", "A", "A", "A", "A"]
    sim.turn = 0
    sim.used = set()
    sim.total_score = 0
    return sim


def test_observation_shape_and_dtype():
    sim = _forced_sim()
    obs = build_observation(sim, yard_scale=100.0)
    assert obs.shape == (OBS_DIM,)
    assert obs.dtype == np.float32


def test_observation_exact_values():
    sim = _forced_sim()
    obs = build_observation(sim, yard_scale=100.0)
    # p_k: n_teams=2, turns_remaining=5 -> 1 - (1/2)**4 = 0.9375
    p_k = _appearance_prob(sim)
    assert p_k == pytest.approx(0.9375)
    expected = [
        1.0, 0.4, 0.9375, 0.25,   # x: yards, drop-to-next(100-60), save(p_k*100), flex(1/4)
        0.6, 0.3, 0.0, 0.0,       # y: 60/100, (60-30)/100, no other team -> save 0, flex 0
        0.3, 0.3, 0.0, 0.0,       # z: 30/100, (30-0)/100, save 0, flex 0
        1.0, 0.9375,              # turns_remaining/num_rounds, p_k
    ]
    np.testing.assert_allclose(obs, np.array(expected, dtype=np.float32), rtol=1e-6, atol=1e-6)


def test_savevalue_feature_equals_heuristic_discount():
    """Feature index 2 (top candidate) must equal the v2 heuristic's own discount."""
    sim = _forced_sim()
    yard_scale = 100.0
    obs = build_observation(sim, yard_scale)
    top = sim.available()[0]
    rels = _relevances(sim, top)
    expected_discount = _appearance_prob(sim) * (max(rels) if rels else 0.0) / yard_scale
    assert obs[2] == pytest.approx(expected_discount)


def test_observation_pads_when_few_candidates():
    sim = _forced_sim()
    sim.used = {"x", "y"}          # only z left for team A
    obs = build_observation(sim, yard_scale=100.0)
    # c0 = z present; c1 and c2 slots all zero
    assert obs[0] == pytest.approx(0.3)
    np.testing.assert_allclose(obs[4:12], np.zeros(8), atol=1e-7)


def test_action_mask_counts_candidates():
    sim = _forced_sim()
    np.testing.assert_array_equal(legal_action_mask(sim), [True, True, True, True])
    sim.used = {"x", "y"}          # 1 candidate -> only rank 0 and skip legal
    np.testing.assert_array_equal(legal_action_mask(sim), [True, False, False, True])


def test_action_mask_skip_always_legal_when_empty():
    sim = _forced_sim()
    sim.used = {"x", "y", "z"}      # no candidates
    mask = legal_action_mask(sim)
    np.testing.assert_array_equal(mask, [False, False, False, True])
    assert mask.shape == (N_ACTIONS,)


def test_decode_action_maps_rank_to_qb():
    sim = _forced_sim()
    assert decode_action(sim, 0) == "x"
    assert decode_action(sim, 1) == "y"
    assert decode_action(sim, 2) == "z"
    assert decode_action(sim, 3) is None      # skip
    sim.used = {"x", "y"}
    assert decode_action(sim, 0) == "z"
    assert decode_action(sim, 1) is None       # illegal rank -> treated as skip


from experiments.sim.scramble_sim import load_roster
from experiments.baselines.policies import greedy_pick
from experiments.sim.gym_env import ScrambleEnv


def test_env_reset_returns_obs_and_info():
    env = ScrambleEnv(num_rounds=25, seed=0)
    obs, info = env.reset(seed=0)
    assert obs.shape == (OBS_DIM,)
    assert isinstance(info, dict)


def test_env_step_returns_five_tuple_and_scaled_reward():
    env = ScrambleEnv(num_rounds=25, seed=0)
    env.reset(seed=0)
    top = env.sim.available()[0]
    expected_raw = env.sim.roster.qb_yards[top]
    obs, reward, terminated, truncated, info = env.step(0)   # play best available
    assert info["raw_reward"] == expected_raw
    assert reward == pytest.approx(expected_raw / env.yard_scale)
    assert truncated is False
    assert obs.shape == (OBS_DIM,)


def test_env_terminates_after_num_rounds():
    env = ScrambleEnv(num_rounds=25, seed=1)
    env.reset(seed=1)
    steps = 0
    terminated = False
    while not terminated:
        _, _, terminated, _, _ = env.step(0)
        steps += 1
    assert steps == 25


def test_env_playing_rank0_matches_greedy_score():
    """Always choosing action 0 (team's best available) reproduces greedy exactly."""
    env = ScrambleEnv(seed=0)
    env.reset(seed=123)
    agent_score = 0
    terminated = False
    while not terminated:
        _, _, terminated, _, info = env.step(0)
        agent_score += info["raw_reward"]

    sim = ScrambleSim(load_roster())
    sim.reset(123)
    while not sim.done:
        sim.step(greedy_pick(sim))
    greedy_score = sim.total_score
    assert agent_score == greedy_score


def _forced_env(shaping_coef):
    """Same tiny roster as _forced_sim, wrapped in a ScrambleEnv with a forced schedule."""
    r = Roster(
        team_codes=["A", "B"],
        team_qbs={"A": ["x", "y", "z"], "B": ["x"]},
        qb_yards={"x": 100, "y": 60, "z": 30},
        qb_teams={"x": {"A", "B"}, "y": {"A"}, "z": {"A"}},
    )
    env = ScrambleEnv(roster=r, num_rounds=5, shaping_coef=shaping_coef)
    env.sim.team_sequence = ["A", "A", "A", "A", "A"]
    env.sim.turn = 0
    env.sim.used = set()
    env.sim.total_score = 0
    return env


def test_shaping_off_by_default_matches_raw_reward():
    env = _forced_env(shaping_coef=0.0)
    _, reward, _, _, info = env.step(0)          # play x: 100 yards
    assert info["raw_reward"] == 100             # true score
    assert reward == pytest.approx(100 / 100.0)  # learning reward == raw / yard_scale


def test_shaping_penalizes_opportunity_cost_but_keeps_true_reward():
    env = _forced_env(shaping_coef=1.0)
    # x has save-value p_k*max(rel) = 0.9375 * 100 = 93.75 (x is B's only QB).
    _, reward, _, _, info = env.step(0)          # play x
    assert info["raw_reward"] == 100             # TRUE score unchanged by shaping
    assert reward == pytest.approx((100 - 93.75) / 100.0)   # penalized learning reward
