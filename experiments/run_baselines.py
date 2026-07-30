"""Benchmark greedy vs opportunity-cost heuristic vs offline optimum over seeded games.

Usage (from repo root):
    /c/Python313/python -m experiments.run_baselines --games 10000
"""
from __future__ import annotations

import argparse

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from experiments.scramble_sim import REPO_ROOT, ScrambleSim, load_roster
from experiments.policies import greedy_pick, opportunity_cost_pick
from experiments.optimal import offline_optimum

DOCS_DIR = REPO_ROOT / "docs" / "experiments"


def _play(sim: ScrambleSim, policy, seed: int) -> int:
    sim.reset(seed)
    while not sim.done:
        sim.step(policy(sim))
    return sim.total_score


def run(n_games: int, seed0: int = 0):
    roster = load_roster()
    sim = ScrambleSim(roster)
    greedy = np.empty(n_games)
    heur = np.empty(n_games)
    opt = np.empty(n_games)
    for i in range(n_games):
        seed = seed0 + i
        greedy[i] = _play(sim, greedy_pick, seed)
        heur[i] = _play(sim, opportunity_cost_pick, seed)
        # both reset(seed) -> identical team_sequence; reuse it for the optimum
        opt[i] = offline_optimum(sim.team_sequence, roster)
        assert greedy[i] <= opt[i] + 1e-6, (greedy[i], opt[i])
        assert heur[i] <= opt[i] + 1e-6, (heur[i], opt[i])
    return greedy, heur, opt


def _ci95(x: np.ndarray) -> float:
    return 1.96 * x.std(ddof=1) / np.sqrt(len(x))


def _fmt(x: np.ndarray) -> str:
    return f"{x.mean():,.0f} ± {_ci95(x):,.0f}"


def _plots(greedy, heur, opt):
    DOCS_DIR.mkdir(parents=True, exist_ok=True)

    plt.figure(figsize=(8, 5))
    bins = 60
    plt.hist(greedy, bins=bins, alpha=0.5, label="Greedy")
    plt.hist(heur, bins=bins, alpha=0.5, label="Opportunity-cost")
    plt.hist(opt, bins=bins, alpha=0.5, label="Offline optimum")
    plt.xlabel("Total career yards")
    plt.ylabel("Games")
    plt.title("Score distributions")
    plt.legend()
    plt.tight_layout()
    plt.savefig(DOCS_DIR / "phase1_scores.png", dpi=120)
    plt.close()

    plt.figure(figsize=(8, 5))
    plt.hist(opt - greedy, bins=bins, alpha=0.6, label="optimum - greedy")
    plt.hist(heur - greedy, bins=bins, alpha=0.6, label="heuristic - greedy")
    plt.xlabel("Yards gained over greedy")
    plt.ylabel("Games")
    plt.title("Gap over greedy")
    plt.legend()
    plt.tight_layout()
    plt.savefig(DOCS_DIR / "phase1_gaps.png", dpi=120)
    plt.close()


def _write_doc(greedy, heur, opt, n_games):
    opt_greedy = opt - greedy
    opt_heur = opt - heur
    heur_greedy = heur - greedy
    pct = lambda x: x.mean() / opt.mean() * 100

    lines = [
        "# Phase 1 - Baselines & Ceiling",
        "",
        f"Benchmark over **{n_games:,}** seeded games (paired: every policy and the "
        "optimum see the same 25-team sequence per seed). Score = total career passing "
        "yards; higher is better.",
        "",
        "## Mean score (95% CI)",
        "",
        "| Policy | Mean score | % of optimum |",
        "|---|---|---|",
        f"| Greedy | {_fmt(greedy)} | {pct(greedy):.1f}% |",
        f"| Opportunity-cost | {_fmt(heur)} | {pct(heur):.1f}% |",
        f"| Offline optimum (clairvoyant) | {_fmt(opt)} | 100.0% |",
        "",
        "## Paired gaps (95% CI)",
        "",
        "| Comparison | Mean gain | % of optimum |",
        "|---|---|---|",
        f"| optimum - greedy | {_fmt(opt_greedy)} | {opt_greedy.mean() / opt.mean() * 100:.2f}% |",
        f"| optimum - heuristic | {_fmt(opt_heur)} | {opt_heur.mean() / opt.mean() * 100:.2f}% |",
        f"| heuristic - greedy | {_fmt(heur_greedy)} | {heur_greedy.mean() / opt.mean() * 100:.2f}% |",
        "",
        f"- Heuristic beats greedy in **{(heur_greedy > 0).mean() * 100:.1f}%** of games; "
        f"loses in **{(heur_greedy < 0).mean() * 100:.1f}%**.",
        (
            f"- The heuristic captures **{heur_greedy.mean() / opt_greedy.mean() * 100:.1f}%** "
            "of the greedy->optimum gap."
            if opt_greedy.mean() > 0
            else "- Greedy is essentially optimal: no meaningful gap to capture."
        ),
        "",
        "![Score distributions](phase1_scores.png)",
        "",
        "![Gap over greedy](phase1_gaps.png)",
        "",
        "## Verdict",
        "",
        "The `optimum - greedy` gap is the ceiling on any improvement over greedy; "
        "`heuristic - greedy` is what a zero-ML policy already captures. Whether Phase 2 "
        "(RL) is worthwhile depends on how much gap remains above the heuristic - see the "
        "`optimum - heuristic` row.",
        "",
    ]
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    (DOCS_DIR / "phase1-baselines.md").write_text("\n".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Scramble Phase 1 baseline benchmark")
    parser.add_argument("--games", type=int, default=10000)
    parser.add_argument("--seed0", type=int, default=0)
    args = parser.parse_args()

    greedy, heur, opt = run(args.games, args.seed0)
    _plots(greedy, heur, opt)
    _write_doc(greedy, heur, opt, args.games)

    print(f"games={args.games}")
    print(f"greedy      mean={greedy.mean():,.0f}")
    print(f"heuristic   mean={heur.mean():,.0f}")
    print(f"optimum     mean={opt.mean():,.0f}")
    print(f"opt-greedy  mean={ (opt-greedy).mean():,.0f}  "
          f"({(opt-greedy).mean()/opt.mean()*100:.2f}% of optimum)")
    print(f"heur-greedy mean={ (heur-greedy).mean():,.0f}  "
          f"heuristic beats greedy in {((heur-greedy)>0).mean()*100:.1f}% of games")
    print(f"Wrote {DOCS_DIR / 'phase1-baselines.md'}")


if __name__ == "__main__":
    main()
