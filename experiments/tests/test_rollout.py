import random

from experiments.scramble_sim import ScrambleSim, load_roster
from experiments.rollout import rollout_pick, greedy_rollout
from experiments.policies import greedy_pick
from experiments.tests.test_sim import tiny_roster


def test_rollout_discovers_the_save_on_the_toy():
    # cin now, one random future turn from {cin, rav}. Saving flacco (pick palmer) has
    # the higher expected total, so rollout should pick palmer, not the greedy flacco.
    sim = ScrambleSim(tiny_roster(), num_rounds=2)
    sim.reset(0)
    sim.team_sequence = ["cin", "rav"]; sim.turn = 0; sim.used = set(); sim.total_score = 0
    pick = rollout_pick(sim, n_rollouts=300, top_k=6, rng=random.Random(1))
    assert pick == "palmer"


def test_rollout_is_greedy_on_last_turn():
    # No future turns -> value is immediate yards only -> max available == greedy.
    sim = ScrambleSim(tiny_roster(), num_rounds=1)
    sim.reset(0)
    sim.team_sequence = ["cin"]; sim.turn = 0; sim.used = set(); sim.total_score = 0
    assert rollout_pick(sim, n_rollouts=50, rng=random.Random(0)) == greedy_pick(sim) == "flacco"


def test_rollout_skips_when_empty():
    sim = ScrambleSim(tiny_roster(), num_rounds=1)
    sim.reset(0)
    sim.team_sequence = ["cin"]; sim.turn = 0; sim.used = {"flacco", "palmer"}; sim.total_score = 0
    assert rollout_pick(sim, rng=random.Random(0)) is None


def test_greedy_rollout_uses_best_unused_and_is_deterministic_given_rng():
    r = tiny_roster()
    # From an empty used-set, 1 future turn: score is that team's best unused QB.
    a = greedy_rollout(r, used=set(), remaining=1, rng=random.Random(5))
    b = greedy_rollout(r, used=set(), remaining=1, rng=random.Random(5))
    assert a == b  # same rng seed -> same draw -> same score
    # score must be one of the teams' best QB (flacco for either cin or rav)
    assert a in (40000,)  # flacco is the best QB on both teams


def test_rollout_beats_greedy_on_average_on_real_roster():
    # Regression guard for the optimizer's-curse bug: with common random numbers, rollout
    # must not underperform greedy in aggregate. (A naive rollout scored ~5% worse.)
    roster = load_roster()
    sim = ScrambleSim(roster)
    g_total = r_total = 0
    n = 25
    for seed in range(n):
        sim.reset(seed)
        while not sim.done:
            sim.step(greedy_pick(sim))
        g_total += sim.total_score

        rng = random.Random(10_000 + seed)
        sim.reset(seed)
        while not sim.done:
            sim.step(rollout_pick(sim, n_rollouts=30, top_k=6, rng=rng))
        r_total += sim.total_score

    assert r_total >= g_total, (r_total / n, g_total / n)
