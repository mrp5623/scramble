"""Evaluate Model #1 vs baselines on identical seeds, and time per-decision inference.

Usage (from repo root):
    /c/Python313/python -m experiments.run_agent_eval --checkpoint experiments/checkpoints/model1.pt --games 1000
"""
from __future__ import annotations

import argparse
import random
import time
from pathlib import Path

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import torch

from experiments.scramble_sim import REPO_ROOT, ScrambleSim, load_roster
from experiments.gym_env import build_observation, legal_action_mask, decode_action
from experiments.reinforce import ActorCritic, select_action
from experiments.policies import greedy_pick, opportunity_cost_v2_pick
from experiments.rollout import rollout_pick
from experiments.optimal import offline_optimum

DOCS_DIR = REPO_ROOT / "docs" / "experiments"


def load_agent(path):
    blob = torch.load(path, weights_only=False)
    model = ActorCritic(blob["obs_dim"], blob["n_actions"], blob["hidden"])
    model.load_state_dict(blob["state_dict"])
    model.eval()
    return model


def agent_policy(model, yard_scale):
    def pick(sim):
        obs = build_observation(sim, yard_scale)
        mask = legal_action_mask(sim)
        action = select_action(model, obs, mask, deterministic=True)
        return decode_action(sim, action)
    return pick


def _play(sim, policy, seed):
    sim.reset(seed)
    while not sim.done:
        sim.step(policy(sim))
    return sim.total_score


def _ci95(x):
    return 1.96 * x.std(ddof=1) / np.sqrt(len(x))


def _fmt(x):
    return f"{x.mean():,.0f} ± {_ci95(x):,.0f}"


def _time_per_decision(sim, policy, seeds):
    n_dec = 0
    t0 = time.perf_counter()
    for s in seeds:
        sim.reset(s)
        while not sim.done:
            sim.step(policy(sim))
            n_dec += 1
    return (time.perf_counter() - t0) / max(n_dec, 1) * 1e3   # ms/decision


def run(n_games, n_rollouts, checkpoint, seed0=0):
    roster = load_roster()
    sim = ScrambleSim(roster)
    yard_scale = float(max(roster.qb_yards.values()))
    model = load_agent(checkpoint)
    agent = agent_policy(model, yard_scale)

    greedy = np.empty(n_games); heur = np.empty(n_games)
    roll = np.empty(n_games); opt = np.empty(n_games); ag = np.empty(n_games)
    for i in range(n_games):
        seed = seed0 + i
        greedy[i] = _play(sim, greedy_pick, seed)
        heur[i] = _play(sim, opportunity_cost_v2_pick, seed)
        rng = random.Random(1_000_000 + seed)
        roll[i] = _play(sim, lambda s: rollout_pick(s, n_rollouts, 3, rng), seed)
        ag[i] = _play(sim, agent, seed)
        opt[i] = offline_optimum(sim.team_sequence, roster)
    return dict(greedy=greedy, heur=heur, roll=roll, agent=ag, opt=opt,
                sim=sim, agent_pol=agent, roster=roster, n_rollouts=n_rollouts)


def _plot(res, path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    labels = ["Greedy", "Heuristic v2", "Agent (Model #1)", "Rollout", "Optimum"]
    cols = ["greedy", "heur", "agent", "roll", "opt"]
    means = [res[c].mean() for c in cols]
    errs = [_ci95(res[c]) for c in cols]
    fig, ax = plt.subplots(figsize=(8, 5))
    ax.bar(labels, means, yerr=errs, capsize=4,
           color=["tab:blue", "tab:orange", "tab:red", "tab:green", "tab:gray"])
    ax.set_ylabel("Mean total career yards")
    ax.set_title("Model #1 vs baselines (95% CI)")
    ax.set_ylim(min(means) * 0.98, max(means) * 1.005)
    plt.xticks(rotation=15)
    fig.tight_layout()
    fig.savefig(path, dpi=120)
    plt.close(fig)


def _write_doc(res, n_games, path):
    g, h, r, a, o = res["greedy"], res["heur"], res["roll"], res["agent"], res["opt"]
    gap = (o - g).mean()
    frac = lambda x: (x - g).mean() / gap * 100 if gap > 0 else 0.0
    pct = lambda x: x.mean() / o.mean() * 100

    seeds = list(range(200))
    t_agent = _time_per_decision(res["sim"], res["agent_pol"], seeds)
    rng = random.Random(42)
    t_roll = _time_per_decision(res["sim"], lambda s: rollout_pick(s, res["n_rollouts"], 3, rng), seeds)
    t_heur = _time_per_decision(res["sim"], opportunity_cost_v2_pick, seeds)

    # Data-driven speed narrative: the "fast + accurate" claim only holds if the agent
    # actually captures gap. State it plainly either way instead of assuming success.
    frac_a = frac(a)
    speedup = t_roll / max(t_agent, 1e-9)
    if frac_a >= 15.0:
        speed_line = (
            f"- The agent captures **{frac_a:.1f}%** of the gap at **{t_agent:.4f} ms/decision** "
            f"vs the rollout's **{t_roll:.4f} ms** (**{speedup:.0f}x** faster) - rollout-level "
            "accuracy at a fraction of the cost: the \"rollout accuracy at heuristic speed\" result."
        )
    else:
        speed_line = (
            f"- The agent decides in **{t_agent:.4f} ms** vs the rollout's **{t_roll:.4f} ms** "
            f"(**{speedup:.0f}x** faster), but captures only **{frac_a:.1f}%** of the gap - the "
            "speed advantage is moot until it beats greedy."
        )

    lines = [
        "# Phase 2 - Model #1 (Agent v1): engineered save-value, PyTorch REINFORCE",
        "",
        f"Paired benchmark over **{n_games:,}** seeded games (every policy and the optimum "
        "see the same 25-team sequence per seed). The agent plays deterministically "
        "(argmax). Score = total career passing yards.",
        "",
        "## Mean score (95% CI)",
        "",
        "| Policy | Mean score | % of optimum | % of greedy->optimum gap |",
        "|---|---|---|---|",
        f"| Greedy | {_fmt(g)} | {pct(g):.2f}% | 0% (baseline) |",
        f"| Opportunity-cost (v2) | {_fmt(h)} | {pct(h):.2f}% | {frac(h):.1f}% |",
        f"| **Agent (Model #1)** | {_fmt(a)} | {pct(a):.2f}% | {frac(a):.1f}% |",
        f"| Rollout (online) | {_fmt(r)} | {pct(r):.2f}% | {frac(r):.1f}% |",
        f"| Offline optimum | {_fmt(o)} | 100.00% | 100% |",
        "",
        f"- Agent beats greedy in **{(a > g).mean() * 100:.1f}%** of games; "
        f"captures **{frac(a):.1f}%** of the greedy->optimum gap "
        f"(heuristic {frac(h):.1f}%, rollout {frac(r):.1f}%).",
        "",
        "## Inference speed (mean ms per decision)",
        "",
        "| Policy | ms / decision |",
        "|---|---|",
        f"| Heuristic v2 | {t_heur:.4f} |",
        f"| **Agent (Model #1)** | {t_agent:.4f} |",
        f"| Rollout | {t_roll:.4f} |",
        "",
        speed_line,
        "",
        "![Scores](phase2_scores.png)",
        "",
        "![Training curve](model1_training.png)",
        "",
    ]
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text("\n".join(lines), encoding="utf-8")


def main(argv=None) -> None:
    p = argparse.ArgumentParser(description="Evaluate Scramble RL Model #1")
    p.add_argument("--checkpoint", type=str, default=str(REPO_ROOT / "experiments" / "checkpoints" / "model1.pt"))
    p.add_argument("--games", type=int, default=1000)
    p.add_argument("--rollouts", type=int, default=30)
    p.add_argument("--seed0", type=int, default=0)
    p.add_argument("--out", type=str, default=str(DOCS_DIR / "phase2-agent.md"))
    p.add_argument("--plot", type=str, default=str(DOCS_DIR / "phase2_scores.png"))
    args = p.parse_args(argv)

    res = run(args.games, args.rollouts, args.checkpoint, args.seed0)
    _plot(res, args.plot)
    _write_doc(res, args.games, args.out)

    g, a, o = res["greedy"], res["agent"], res["opt"]
    gap = (o - g).mean()
    print(f"games={args.games}")
    print(f"greedy  mean={g.mean():,.0f}")
    print(f"agent   mean={a.mean():,.0f}  (captures {(a-g).mean()/gap*100:.1f}% of gap, "
          f"beats greedy {(a>g).mean()*100:.1f}%)")
    print(f"optimum mean={o.mean():,.0f}")
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
