from experiments.sim.scramble_sim import Roster, ScrambleSim
from experiments.baselines.optimal import offline_optimum
from experiments.baselines.policies import greedy_pick, opportunity_cost_pick, opportunity_cost_v2_pick
from experiments.tests.test_sim import tiny_roster


def oversave_roster() -> Roster:
    # x is a top pick for FIVE teams but only marginally better than each team's
    # alternative (5000). Summing opportunity cost over all five (v1) wildly overstates
    # x's value-of-saving and wrongly defers him; taking the max (v2) does not.
    team_qbs = {
        "a": ["x", "y"], "b": ["x", "b2"], "c": ["x", "c2"],
        "d": ["x", "d2"], "e": ["x", "e2"],
    }
    qb_yards = {"x": 50000, "y": 40000, "b2": 45000, "c2": 45000, "d2": 45000, "e2": 45000}
    qb_teams = {
        "x": {"a", "b", "c", "d", "e"}, "y": {"a"},
        "b2": {"b"}, "c2": {"c"}, "d2": {"d"}, "e2": {"e"},
    }
    return Roster(["a", "b", "c", "d", "e"], team_qbs, qb_yards, qb_teams)


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


def test_v2_still_saves_on_the_toy():
    # On the 2-team toy (max == sum), v2 must still defer flacco by picking palmer.
    sim = ScrambleSim(tiny_roster(), num_rounds=2)
    sim.reset(0)
    sim.team_sequence = ["cin", "rav"]; sim.turn = 0; sim.used = set(); sim.total_score = 0
    assert opportunity_cost_v2_pick(sim) == "palmer"


def test_v2_fixes_the_oversave_that_v1_gets_wrong():
    # current team 'a', 6 turns left. v1 sums x's marginal value over all 5 teams and
    # wrongly defers him (picks y); v2 takes the max and correctly plays x now.
    sim = ScrambleSim(oversave_roster(), num_rounds=6)
    sim.reset(0)
    sim.team_sequence = ["a"] * 6; sim.turn = 0; sim.used = set(); sim.total_score = 0
    assert opportunity_cost_pick(sim) == "y"       # v1 over-saves
    assert opportunity_cost_v2_pick(sim) == "x"    # v2 corrects it


def test_v2_last_turn_is_greedy():
    sim = ScrambleSim(tiny_roster(), num_rounds=1)
    sim.reset(0)
    sim.team_sequence = ["cin"]; sim.turn = 0; sim.used = set(); sim.total_score = 0
    assert opportunity_cost_v2_pick(sim) == greedy_pick(sim) == "flacco"
