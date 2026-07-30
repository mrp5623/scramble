from experiments.scramble_sim import ScrambleSim
from experiments.optimal import offline_optimum
from experiments.policies import greedy_pick, opportunity_cost_pick
from experiments.tests.test_sim import tiny_roster


def play(sim, policy, seed):
    sim.reset(seed)
    while not sim.done:
        sim.step(policy(sim))
    return sim.total_score


def test_greedy_picks_max_available():
    sim = ScrambleSim(tiny_roster(), num_rounds=1)
    sim.reset(0)
    sim.team_sequence = ["cin"]; sim.turn = 0; sim.used = set(); sim.total_score = 0
    assert greedy_pick(sim) == "flacco"  # 40k > palmer 38k


def test_greedy_skips_when_empty():
    sim = ScrambleSim(tiny_roster(), num_rounds=1)
    sim.reset(0)
    sim.team_sequence = ["cin"]; sim.turn = 0; sim.used = {"flacco", "palmer"}; sim.total_score = 0
    assert greedy_pick(sim) is None


def test_heuristic_saves_flacco_on_the_toy():
    # 2-team roster: P(other team appears) is high, so the heuristic should defer flacco.
    sim = ScrambleSim(tiny_roster(), num_rounds=2)
    sim.reset(0)
    sim.team_sequence = ["cin", "rav"]; sim.turn = 0; sim.used = set(); sim.total_score = 0
    assert opportunity_cost_pick(sim) == "palmer"   # not the greedy flacco


def test_heuristic_beats_or_ties_greedy_and_never_exceeds_optimum():
    r = tiny_roster()
    sim = ScrambleSim(r, num_rounds=2)
    forced = ["cin", "rav"]

    def play_forced(policy):
        sim.reset(0)
        sim.team_sequence = list(forced); sim.turn = 0; sim.used = set(); sim.total_score = 0
        while not sim.done:
            sim.step(policy(sim))
        return sim.total_score

    g = play_forced(greedy_pick)
    h = play_forced(opportunity_cost_pick)
    opt = offline_optimum(forced, r)
    assert g == 60000
    assert h == 78000
    assert g <= h <= opt


def test_last_turn_is_greedy():
    # With one turn left, no future -> heuristic must equal greedy.
    sim = ScrambleSim(tiny_roster(), num_rounds=1)
    sim.reset(0)
    sim.team_sequence = ["cin"]; sim.turn = 0; sim.used = set(); sim.total_score = 0
    assert opportunity_cost_pick(sim) == greedy_pick(sim) == "flacco"
