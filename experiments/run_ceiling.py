"""Online-ceiling benchmark: greedy vs heuristic vs rollout vs clairvoyant optimum.

The rollout policy is the best-achievable *online* reference (no future knowledge). The
key question this answers: of the clairvoyant `optimum - greedy` gap, how much can an
online policy actually capture? That sets the realistic target for RL.

Usage (from repo root):
    /c/Python313/python -m experiments.run_ceiling --games 500 --rollouts 30
"""
from __future__ import annotations

import argparse
import random

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from experiments.scramble_sim import REPO_ROOT, ScrambleSim, load_roster
from experiments.policies import greedy_pick, opportunity_cost_pick
from experiments.rollout import rollout_pick
from experiments.optimal import offline_optimum

DOCS_DIR = REPO_ROOT / "docs" / "experiments"


def _play(sim: ScrambleSim, policy, seed: int) -> int:
    sim.reset(seed)
    while not sim.done:
        sim.step(policy(sim))
    return sim.total_score


def run(n_games: int, n_rollouts: int, top_k: int, seed0: int = 0):
    roster = load_roster()
    sim = ScrambleSim(roster)
    greedy = np.empty(n_games)
    heur = np.empty(n_games)
    roll = np.empty(n_games)
    opt = np.empty(n_games)
    for i in range(n_games):
        seed = seed0 + i
        greedy[i] = _play(sim, greedy_pick, seed)
        heur[i] = _play(sim, opportunity_cost_pick, seed)
        rng = random.Random(1_000_000 + seed)
        roll[i] = _play(sim, lambda s: rollout_pick(s, n_rollouts, top_k, rng), seed)
        opt[i] = offline_optimum(sim.team_sequence, roster)
        assert greedy[i] <= opt[i] + 1e-6
        assert roll[i] <= opt[i] + 1e-6
    return greedy, heur, roll, opt


def _ci95(x: np.ndarray) -> float:
    return 1.96 * x.std(ddof=1) / np.sqrt(len(x))


def _fmt(x: np.ndarray) -> str:
    return f"{x.mean():,.0f} ± {_ci95(x):,.0f}"


def _plot(greedy, heur, roll, opt):
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    labels = ["Greedy", "Opportunity-cost", "Rollout (online)", "Optimum (clairvoyant)"]
    means = [greedy.mean(), heur.mean(), roll.mean(), opt.mean()]
    errs = [_ci95(greedy), _ci95(heur), _ci95(roll), _ci95(opt)]
    fig, ax = plt.subplots(figsize=(8, 5))
    ax.bar(labels, means, yerr=errs, capsize=4,
           color=["tab:blue", "tab:orange", "tab:green", "tab:gray"])
    ax.set_ylabel("Mean total career yards")
    ax.set_title("Mean score by policy (with 95% CI)")
    lo = min(means) * 0.98
    ax.set_ylim(lo, max(means) * 1.005)
    plt.xticks(rotation=15)
    fig.tight_layout()
    fig.savefig(DOCS_DIR / "ceiling_scores.png", dpi=120)
    plt.close(fig)


def _write_doc(greedy, heur, roll, opt, n_games, n_rollouts, top_k):
    gap = opt - greedy
    roll_gain = roll - greedy
    heur_gain = heur - greedy
    frac = lambda gain: gain.mean() / gap.mean() * 100 if gap.mean() > 0 else 0.0

    lines = [
        "# Phase 1 - Online Ceiling (rollout)",
        "",
        f"Benchmark over **{n_games:,}** paired seeded games. Rollout uses a greedy base "
        f"policy, **{n_rollouts}** rollouts per candidate, top-**{top_k}** candidates. The "
        "rollout is the best-achievable *online* reference (no future knowledge); the "
        "offline optimum is clairvoyant and unreachable online.",
        "",
        "## Mean score (95% CI)",
        "",
        "| Policy | Mean score | % of optimum | % of greedy->optimum gap captured |",
        "|---|---|---|---|",
        f"| Greedy | {_fmt(greedy)} | {greedy.mean()/opt.mean()*100:.2f}% | 0% (baseline) |",
        f"| Opportunity-cost | {_fmt(heur)} | {heur.mean()/opt.mean()*100:.2f}% | {frac(heur_gain):.1f}% |",
        f"| Rollout (online) | {_fmt(roll)} | {roll.mean()/opt.mean()*100:.2f}% | {frac(roll_gain):.1f}% |",
        f"| Offline optimum (clairvoyant) | {_fmt(opt)} | 100.00% | 100% |",
        "",
        f"- Rollout beats greedy in **{(roll_gain > 0).mean()*100:.1f}%** of games.",
        f"- Rollout captures **{frac(roll_gain):.1f}%** of the clairvoyant greedy->optimum "
        "gap; the opportunity-cost heuristic captures "
        f"**{frac(heur_gain):.1f}%**.",
        "",
        "![Mean score by policy](ceiling_scores.png)",
        "",
        "## Verdict",
        "",
        "The rollout is a strong stand-in for the best online policy. The share of the gap "
        "it captures is the realistic headroom an RL agent could hope for; whatever remains "
        "between rollout and the clairvoyant optimum is future knowledge that no online "
        "policy can recover. This sets the Phase 2 (RL) target and expectations.",
        "",
    ]
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    (DOCS_DIR / "phase1-online-ceiling.md").write_text("\n".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Scramble online-ceiling (rollout) benchmark")
    parser.add_argument("--games", type=int, default=500)
    parser.add_argument("--rollouts", type=int, default=30)
    parser.add_argument("--top-k", type=int, default=3)
    parser.add_argument("--seed0", type=int, default=0)
    args = parser.parse_args()

    greedy, heur, roll, opt = run(args.games, args.rollouts, args.top_k, args.seed0)
    _plot(greedy, heur, roll, opt)
    _write_doc(greedy, heur, roll, opt, args.games, args.rollouts, args.top_k)

    gap = (opt - greedy).mean()
    print(f"games={args.games} rollouts={args.rollouts} top_k={args.top_k}")
    print(f"greedy   mean={greedy.mean():,.0f}")
    print(f"heuristic mean={heur.mean():,.0f}  (captures {(heur-greedy).mean()/gap*100:.1f}% of gap)")
    print(f"rollout  mean={roll.mean():,.0f}  (captures {(roll-greedy).mean()/gap*100:.1f}% of gap)")
    print(f"optimum  mean={opt.mean():,.0f}")
    print(f"Wrote {DOCS_DIR / 'phase1-online-ceiling.md'}")


if __name__ == "__main__":
    main()
