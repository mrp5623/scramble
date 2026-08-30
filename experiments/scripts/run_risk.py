"""F9 -- Mean vs. tail: does saving more aggressively trade *average* score for a fatter
*upper tail* (a higher leaderboard 'personal best'), even though greedy wins the mean?

The original motivation for this whole experiment: greedy maximizes the *average* score, but
the human 'saving' strategy was played to maximize the *best* score (to hold the leaderboard).
Here we make that precise. We sweep the saving-aggressiveness `alpha` of the opportunity-cost
heuristic (alpha=0 is greedy, alpha=1 the risk-neutral v2, higher = risk-seeking) and, on
paired seeded games, compare the full score DISTRIBUTION (mean / p99 / max) and the
best-of-N leaderboard curve against greedy and the clairvoyant optimum.

Usage (from repo root):
    /c/Python313/python -m experiments.scripts.run_risk --games 10000
"""
from __future__ import annotations

import argparse
from functools import partial
from pathlib import Path

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from experiments.sim.scramble_sim import REPO_ROOT, ScrambleSim, load_roster
from experiments.baselines.policies import opportunity_cost_alpha_pick
from experiments.baselines.optimal import offline_optimum

DOCS_DIR = REPO_ROOT / "docs" / "experiments" / "phase1"
ALPHAS = [0.0, 1.0, 2.0, 3.0, 5.0, 8.0]        # 0 == greedy, 1 == risk-neutral v2, higher == risk-seeking
BEST_OF_N = [1, 2, 5, 10, 25, 100, 1000, 10000]


def expected_best_of_n(scores, n: int) -> float:
    """Expected maximum over n games drawn i.i.d. (with replacement) from the empirical
    distribution of `scores` -- the leaderboard metric: your personal best after n plays.
    Exact order-statistic formula for the empirical CDF: for sorted s_1..s_M,
    E[max] = sum_i s_i * [ (i/M)^n - ((i-1)/M)^n ]."""
    s = np.sort(np.asarray(scores, dtype=float))
    m = len(s)
    i = np.arange(1, m + 1)
    w = (i / m) ** n - ((i - 1) / m) ** n
    return float(np.dot(s, w))


def _play(sim, policy, seed):
    sim.reset(seed)
    while not sim.done:
        sim.step(policy(sim))
    return sim.total_score


def run(n_games, seed0=0):
    roster = load_roster()
    sim = ScrambleSim(roster)
    scores = {a: np.empty(n_games) for a in ALPHAS}
    opt = np.empty(n_games)
    for i in range(n_games):
        seed = seed0 + i
        for a in ALPHAS:
            scores[a][i] = _play(sim, partial(opportunity_cost_alpha_pick, alpha=a), seed)
        opt[i] = offline_optimum(sim.team_sequence, roster)   # team_sequence set by the last reset(seed)
    return scores, opt


def _stats(x):
    return dict(mean=x.mean(), std=x.std(ddof=1), p99=np.percentile(x, 99), max=x.max())


def _plot_alpha_sweep(scores, opt, path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    a = np.array(ALPHAS)
    mean = np.array([scores[x].mean() for x in ALPHAS])
    p99 = np.array([np.percentile(scores[x], 99) for x in ALPHAS])
    mx = np.array([scores[x].max() for x in ALPHAS])
    fig, ax = plt.subplots(figsize=(8, 5))
    ax.plot(a, mean / 1e6, "-o", label="mean (average game)")
    ax.plot(a, p99 / 1e6, "-o", label="99th percentile")
    ax.plot(a, mx / 1e6, "-o", label="max (best game)")
    ax.axhline(opt.max() / 1e6, ls="--", c="gray", label="optimum max (ceiling)")
    ax.set_xlabel("saving aggressiveness  α   (0 = greedy, 1 = risk-neutral)")
    ax.set_ylabel("score (millions of yards)")
    ax.set_title("Trading average for peak: score vs saving aggressiveness")
    ax.legend()
    fig.tight_layout(); fig.savefig(path, dpi=120); plt.close(fig)


def _plot_best_of_n(scores, opt, alpha_star, path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    ns = np.array(BEST_OF_N)
    g = np.array([expected_best_of_n(scores[0.0], n) for n in ns])       # alpha=0 == greedy
    s = np.array([expected_best_of_n(scores[alpha_star], n) for n in ns])
    o = np.array([expected_best_of_n(opt, n) for n in ns])
    fig, ax = plt.subplots(figsize=(8, 5))
    ax.plot(ns, g / 1e6, "-o", label="greedy (α=0)")
    ax.plot(ns, s / 1e6, "-o", label=f"aggressive saving (α={alpha_star:g})")
    ax.plot(ns, o / 1e6, "--", c="gray", label="optimum (unreachable)")
    ax.set_xscale("log")
    ax.set_xlabel("N games played (leaderboard = best of N)")
    ax.set_ylabel("expected personal-best score (millions)")
    ax.set_title("Best-of-N: whose leaderboard high score is higher?")
    ax.legend()
    fig.tight_layout(); fig.savefig(path, dpi=120); plt.close(fig)


def _write_doc(scores, opt, alpha_star, n_games, path):
    st = {a: _stats(scores[a]) for a in ALPHAS}
    greedy = st[0.0]
    ag = st[alpha_star]
    bo = lambda x, n: expected_best_of_n(x, n)
    # Does aggressive saving win best-of-10k while losing the mean? (the thesis)
    wins_tail = bo(scores[alpha_star], 10_000) > bo(scores[0.0], 10_000)
    lower_mean = ag["mean"] < greedy["mean"]
    if wins_tail and lower_mean:
        verdict = (f"**Confirmed.** α={alpha_star:g} scores a *lower* average than greedy "
                   f"({ag['mean']:,.0f} vs {greedy['mean']:,.0f}) but a *higher* best-of-10,000 "
                   f"({bo(scores[alpha_star],10_000):,.0f} vs {bo(scores[0.0],10_000):,.0f}) — "
                   "greedy wins the average, aggressive saving wins the leaderboard.")
    elif wins_tail:
        verdict = (f"**Partly.** α={alpha_star:g} takes the best-of-10,000 leaderboard, but not "
                   "at a clear cost to the mean — the tradeoff is weaker than the thesis assumed.")
    else:
        best_mean_a = max(ALPHAS, key=lambda a: st[a]["mean"])
        ceil = (opt.max() / greedy["max"] - 1) * 100
        verdict = (
            f"**Not supported — the intuition is inverted.** Greedy (α=0) takes the leaderboard "
            f"(best-of-10k {bo(scores[0.0], 10_000):,.0f}, max {greedy['max']:,.0f}), while the "
            f"highest *mean* goes to mild saving α={best_mean_a:g} ({st[best_mean_a]['mean']:,.0f}). "
            f"Cranking α only lowers the whole distribution (std stays ~{greedy['std']:,.0f}) — it adds "
            f"no upper tail. The optimum's max is just {ceil:.1f}% above greedy's, so greedy already "
            "nearly saturates the best game physically possible: there is no tail for saving to exploit.")

    rows = [f"| {a:g} | {st[a]['mean']:,.0f} | {st[a]['std']:,.0f} | "
            f"{st[a]['p99']:,.0f} | {st[a]['max']:,.0f} | {bo(scores[a],10_000):,.0f} |"
            for a in ALPHAS]
    lines = [
        "# Phase 1 - Mean vs. tail: does saving win the leaderboard? (F9)",
        "",
        f"Paired over **{n_games:,}** seeded games (every policy sees the same 25-team sequence per "
        "seed). `alpha` is the saving-aggressiveness of the opportunity-cost heuristic: "
        "**alpha=0 is greedy**, alpha=1 the risk-neutral v2, higher = more (riskier) saving.",
        "",
        "## Score distribution by aggressiveness",
        "",
        "| alpha | mean | std | 99th pct | max | best-of-10k |",
        "|---|---|---|---|---|---|",
        *rows,
        f"| *optimum* | {opt.mean():,.0f} | {opt.std(ddof=1):,.0f} | {np.percentile(opt,99):,.0f} | "
        f"{opt.max():,.0f} | {bo(opt,10_000):,.0f} |",
        "",
        f"- Best mean: **alpha={min(ALPHAS, key=lambda a: -st[a]['mean']):g}**  |  "
        f"best max: **alpha={min(ALPHAS, key=lambda a: -st[a]['max']):g}**  |  "
        f"best best-of-10k: **alpha={min(ALPHAS, key=lambda a: -bo(scores[a],10_000)):g}**.",
        "",
        f"## Verdict",
        "",
        verdict,
        "",
        "![Score vs aggressiveness](risk_alpha_sweep.png)",
        "",
        "![Best of N](risk_best_of_n.png)",
        "",
    ]
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text("\n".join(lines), encoding="utf-8")


def main(argv=None) -> None:
    p = argparse.ArgumentParser(description="F9: mean vs tail / leaderboard risk analysis")
    p.add_argument("--games", type=int, default=10000)
    p.add_argument("--seed0", type=int, default=0)
    args = p.parse_args(argv)

    scores, opt = run(args.games, args.seed0)
    # pick the 'aggressive' policy to headline as the one with the highest best-of-10k
    alpha_star = max((a for a in ALPHAS if a >= 1.0),
                     key=lambda a: expected_best_of_n(scores[a], 10_000))
    _plot_alpha_sweep(scores, opt, DOCS_DIR / "risk_alpha_sweep.png")
    _plot_best_of_n(scores, opt, alpha_star, DOCS_DIR / "risk_best_of_n.png")
    _write_doc(scores, opt, alpha_star, args.games, DOCS_DIR / "mean-vs-tail.md")

    for a in ALPHAS:
        s = scores[a]
        print(f"alpha={a:>4g}  mean={s.mean():,.0f}  max={s.max():,.0f}  "
              f"best-of-10k={expected_best_of_n(s, 10_000):,.0f}")
    print(f"optimum       mean={opt.mean():,.0f}  max={opt.max():,.0f}  "
          f"best-of-10k={expected_best_of_n(opt, 10_000):,.0f}")
    print(f"headline aggressive alpha* = {alpha_star:g}")
    print(f"Wrote {DOCS_DIR / 'mean-vs-tail.md'}")


if __name__ == "__main__":
    main()
