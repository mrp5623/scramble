import random
import networkx as nx
from experiments.scramble_sim import Roster, load_roster
from experiments.optimal import offline_optimum
from experiments.tests.test_sim import tiny_roster


def brute_optimum(team_sequence, roster):
    n = len(team_sequence)
    best = 0

    def rec(i, used, score):
        nonlocal best
        if i == n:
            best = max(best, score)
            return
        rec(i + 1, used, score)  # skip this slot
        for q in roster.team_qbs[team_sequence[i]]:
            if q not in used:
                used.add(q)
                rec(i + 1, used, score + roster.qb_yards[q])
                used.discard(q)

    rec(0, set(), 0)
    return best


def nx_optimum(team_sequence, roster):
    g = nx.Graph()
    for i, t in enumerate(team_sequence):
        for q in roster.team_qbs[t]:
            g.add_edge(("slot", i), ("qb", q), weight=roster.qb_yards[q])
    total = 0
    for a, b in nx.max_weight_matching(g, maxcardinality=False):
        total += g[a][b]["weight"]
    return total


def test_flacco_palmer_optimum_beats_greedy():
    # cin then rav: greedy burns flacco on cin (40k) then dilfer on rav (20k) = 60k.
    # optimum saves flacco for rav: palmer on cin (38k) + flacco on rav (40k) = 78k.
    r = tiny_roster()
    assert offline_optimum(["cin", "rav"], r) == 78000


def test_matches_brute_and_networkx_on_random_small():
    r = load_roster()
    rng = random.Random(7)
    for _ in range(25):
        seq = [rng.choice(r.team_codes) for _ in range(4)]
        opt = offline_optimum(seq, r)
        assert opt == nx_optimum(seq, r)

    tr = tiny_roster()
    rng2 = random.Random(3)
    for _ in range(50):
        seq = [rng2.choice(tr.team_codes) for _ in range(rng2.randint(1, 4))]
        assert offline_optimum(seq, tr) == brute_optimum(seq, tr)


def test_optimum_at_least_greedy_on_real_sequences():
    from experiments.scramble_sim import ScrambleSim
    from experiments.policies import greedy_pick  # available after Task 3
    r = load_roster()
    sim = ScrambleSim(r)
    for seed in range(20):
        sim.reset(seed)
        seq = list(sim.team_sequence)
        sim.reset(seed)
        while not sim.done:
            sim.step(greedy_pick(sim))
        assert sim.total_score <= offline_optimum(seq, r)
