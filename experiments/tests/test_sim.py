import numpy as np
import pytest
from experiments.scramble_sim import Roster, ScrambleSim, load_roster, NUM_ROUNDS


def tiny_roster() -> Roster:
    # flacco plays for two teams; others single-team. Yards chosen for later tests.
    team_qbs = {"cin": ["flacco", "palmer"], "rav": ["flacco", "dilfer"]}
    qb_yards = {"flacco": 40000, "palmer": 38000, "dilfer": 20000}
    qb_teams = {"flacco": {"cin", "rav"}, "palmer": {"cin"}, "dilfer": {"rav"}}
    # ensure team_qbs sorted by yards desc
    return Roster(["cin", "rav"], team_qbs, qb_yards, qb_teams)


def test_load_roster_real_data():
    r = load_roster()
    assert len(r.team_codes) == 32
    # career yards are consistent wherever a QB appears
    assert r.qb_yards["brett favre"] == 71838
    # brett favre played for multiple franchises
    assert len(r.qb_teams["brett favre"]) >= 3
    # team_qbs sorted by yards descending
    ys = [r.qb_yards[q] for q in r.team_qbs["atl"]]
    assert ys == sorted(ys, reverse=True)


def test_draw_is_uniform_with_replacement():
    r = load_roster()
    sim = ScrambleSim(r)
    counts = {}
    for seed in range(4000):
        sim.reset(seed)
        assert len(sim.team_sequence) == NUM_ROUNDS
        for c in sim.team_sequence:
            counts[c] = counts.get(c, 0) + 1
    # all 32 teams appear; roughly uniform (loose bounds)
    assert len(counts) == 32
    total = sum(counts.values())
    for c, n in counts.items():
        assert 0.5 < (n / total) / (1 / 32) < 1.5


def test_reproducible_given_seed():
    r = load_roster()
    a, b = ScrambleSim(r), ScrambleSim(r)
    a.reset(123); b.reset(123)
    assert a.team_sequence == b.team_sequence


def test_no_qb_reused_and_skip_scores_zero():
    sim = ScrambleSim(tiny_roster(), num_rounds=3)
    sim.reset(0)
    sim.team_sequence = ["cin", "cin", "rav"]  # force a repeat team
    sim.turn = 0; sim.used = set(); sim.total_score = 0
    r1, _ = sim.step("flacco")          # valid
    assert r1 == 40000
    r2, _ = sim.step("flacco")          # already used -> 0
    assert r2 == 0
    r3, done = sim.step(None)           # skip -> 0
    assert r3 == 0 and done
    assert sim.total_score == 40000


def test_step_rejects_ineligible_pick():
    sim = ScrambleSim(tiny_roster(), num_rounds=1)
    sim.reset(0)
    sim.team_sequence = ["cin"]; sim.turn = 0; sim.used = set(); sim.total_score = 0
    reward, done = sim.step("dilfer")   # dilfer not eligible for cin
    assert reward == 0 and done and sim.total_score == 0
