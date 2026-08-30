"""Analysis: how does the greedy-vs-optimum gap scale with the number of turns?

Shows the gap is a property of the roster, not the turn count: the relative gap
(optimum - greedy, as a % of optimum) rises, peaks around 40-50 turns near ~2%, then
declines as the pool of valuable QBs is exhausted and extra turns add only near-zero
scrubs. The current opportunity-cost heuristic's edge peaks early and turns negative at
high turn counts (it over-saves multi-team QBs) -- motivating the heuristic tuning.

Usage (from repo root):
    /c/Python313/python -m experiments.scripts.analysis_turns --games 1000
"""
from __future__ import annotations

import argparse

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from experiments.sim.scramble_sim import REPO_ROOT, NUM_ROUNDS, ScrambleSim, load_roster
from experiments.baselines.policies import greedy_pick, opportunity_cost_pick
from experiments.baselines.optimal import offline_optimum

DOCS_DIR = REPO_ROOT / "docs" / "experiments" / "phase1"
TURN_VALUES = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100]


def _play(sim: ScrambleSim, policy, seed: int) -> int:
    sim.reset(seed)
    while not sim.done:
        sim.step(policy(sim))
    return sim.total_score


def measure(num_rounds: int, n_games: int, seed0: int = 0):
    roster = load_roster()
    sim = ScrambleSim(roster, num_rounds=num_rounds)
    g = np.empty(n_games); h = np.empty(n_games); o = np.empty(n_games)
    for i in range(n_games):
        s = seed0 + i
        g[i] = _play(sim, greedy_pick, s)
        h[i] = _play(sim, opportunity_cost_pick, s)
        o[i] = offline_optimum(sim.team_sequence, roster)
    return g, h, o


def run(n_games: int):
    rows = []
    for t in TURN_VALUES:
        g, h, o = measure(t, n_games)
        rows.append({
            "turns": t,
            "greedy": g.mean(),
            "optimum": o.mean(),
            "gap": (o - g).mean(),
            "gap_pct": (o - g).mean() / o.mean() * 100,
            "heur_pct": (h - g).mean() / o.mean() * 100,
        })
    return rows


def _plot(rows):
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    turns = [r["turns"] for r in rows]
    gap_pct = [r["gap_pct"] for r in rows]
    heur_pct = [r["heur_pct"] for r in rows]

    fig, ax = plt.subplots(figsize=(8, 5))
    ax.plot(turns, gap_pct, marker="o", label="optimum - greedy (ceiling)")
    ax.plot(turns, heur_pct, marker="s", label="heuristic - greedy")
    ax.axhline(0, color="gray", linewidth=0.8)
    ax.axvline(NUM_ROUNDS, color="tab:green", linestyle="--", linewidth=0.8, label="game length")
    ax.set_xlabel("Turns per game")
    ax.set_ylabel("% of optimum")
    ax.set_title("Gap over greedy vs. number of turns")
    ax.legend()
    fig.tight_layout()
    fig.savefig(DOCS_DIR / "turns_gap.png", dpi=120)
    plt.close(fig)


def _write_doc(rows, n_games):
    lines = [
        "# Turns Analysis - Is the Gap Turn-Bound or Roster-Bound?",
        "",
        f"Each row is **{n_games:,}** paired seeded games at the given turn count. "
        "`gap %` is `(optimum - greedy) / optimum`; `heur %` is `(heuristic - greedy) / optimum`.",
        "",
        "| Turns | Greedy | Optimum | opt-greedy | gap % | heur % |",
        "|---:|---:|---:|---:|---:|---:|",
    ]
    for r in rows:
        lines.append(
            f"| {r['turns']} | {r['greedy']:,.0f} | {r['optimum']:,.0f} | "
            f"{r['gap']:,.0f} | {r['gap_pct']:.2f}% | {r['heur_pct']:.2f}% |"
        )
    peak = max(rows, key=lambda r: r["gap_pct"])
    lines += [
        "",
        "![Gap vs turns](turns_gap.png)",
        "",
        "## Takeaways",
        "",
        f"- The relative gap rises, **peaks around {peak['turns']} turns at "
        f"~{peak['gap_pct']:.2f}%**, then declines. Beyond the peak, the valuable QBs are "
        "used up and extra turns add only near-zero scrubs, diluting the percentage.",
        "- So the small gap is **roster-bound, not turn-bound** - a longer game does not "
        "create meaningful new headroom. It reflects that the top QBs are concentrated and "
        "rarely leave greedy badly trapped.",
        "- The opportunity-cost heuristic's edge **peaks early and goes negative at high "
        "turn counts**: with many turns remaining it over-saves multi-team QBs (the `p_k` "
        "term saturates and the opportunity cost sums over every team a QB played for). "
        "This is the concrete signal to tune it (`sum` -> `max`, saner `p_k`).",
        "",
    ]
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    (DOCS_DIR / "turns-analysis.md").write_text("\n".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Turn-count sweep of the greedy-vs-optimum gap")
    parser.add_argument("--games", type=int, default=1000)
    args = parser.parse_args()

    rows = run(args.games)
    _plot(rows)
    _write_doc(rows, args.games)

    print(f"{'turns':>6} | {'gap %':>6} | {'heur %':>7}")
    print("-" * 26)
    for r in rows:
        print(f"{r['turns']:>6} | {r['gap_pct']:>5.2f}% | {r['heur_pct']:>6.2f}%")
    print(f"Wrote {DOCS_DIR / 'turns-analysis.md'}")


if __name__ == "__main__":
    main()
