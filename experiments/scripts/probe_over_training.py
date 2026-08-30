"""Sweep a training run's checkpoints and plot two learning curves:

1. score-over-training (the headline) -- the agent plays full shuffled games itself
   (deterministic argmax); the curve shows its mean score climbing from a random policy
   up to, and past, greedy, against the clairvoyant-optimum ceiling. The goal is to
   *beat* greedy, so score (not imitation of greedy's picks) is the metric that matters.
2. save-feature ablation (attention-over-time) -- how much the agent's chosen-pick
   probability moves when the save_value inputs are zeroed. This is the temporal
   follow-up to the single-checkpoint F7 probe: did it ever attend to the save value,
   and when?

Usage (from repo root):
    /c/Python313/python -m experiments.scripts.probe_over_training \
        --run-dir experiments/checkpoints/run_003_crn_shuffle_long --games 200
"""
from __future__ import annotations

import argparse
import glob
from pathlib import Path

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import torch

from experiments.sim.scramble_sim import REPO_ROOT, ScrambleSim, load_roster
from experiments.sim.gym_env import (
    candidate_order, build_observation, legal_action_mask,
    ScrambleEnv, OBS_DIM_SHUFFLED,
)
from experiments.baselines.policies import greedy_pick
from experiments.baselines.optimal import offline_optimum
from experiments.rl.reinforce import ActorCritic

DOCS_DIR = REPO_ROOT / "docs" / "experiments" / "phase2"


def _load(path):
    b = torch.load(path, weights_only=False)
    m = ActorCritic(b["obs_dim"], b["n_actions"], b["hidden"])
    m.load_state_dict(b["state_dict"]); m.eval()
    return m, b


def _save_indices(obs_dim: int) -> list[int]:
    """Feature index of save_value within each candidate block, for the ablation probe.

    shuffled 11-dim block = [yards, save, flex] -> save at offset 1;
    legacy   14-dim block = [yards, drop, save, flex] -> save at offset 2.
    """
    feats = 3 if obs_dim == OBS_DIM_SHUFFLED else 4
    off = 1 if feats == 3 else 2
    return [c * feats + off for c in range(3)]


def _decisions(roster, obs_dim, seeds):
    """Yield (obs, mask, sim) over on-policy-GREEDY states, candidate order shuffled
    per game. Advancing by greedy fixes the state set, so every checkpoint is scored on the
    identical decisions -- the curve reflects the policy changing, not the states."""
    scale = float(max(roster.qb_yards.values()))
    shuffled = obs_dim == OBS_DIM_SHUFFLED
    sim = ScrambleSim(roster)
    for s in seeds:
        rng = np.random.default_rng(s) if shuffled else None
        sim.reset(s)
        while not sim.done:
            order = candidate_order(sim, rng) if shuffled else None
            obs = build_observation(sim, scale, order)
            mask = legal_action_mask(sim, order)
            yield obs, mask, sim
            sim.step(greedy_pick(sim))


def _argmax(model, obs, mask):
    with torch.no_grad():
        logits, _ = model.forward(torch.as_tensor(obs, dtype=torch.float32),
                                  torch.as_tensor(mask, dtype=torch.bool))
        p = torch.softmax(logits, -1).numpy()
    return int(p.argmax()), p


def save_ablation(model, roster, obs_dim, seeds) -> float:
    """Mean |P(chosen) - P'(chosen)| when the save_value inputs are zeroed (the F7 probe).

    ~0 means the policy's chosen-action probability doesn't move when the save signal is
    deleted -> the feature is causally inert at this checkpoint."""
    idx = _save_indices(obs_dim)
    deltas = []
    for obs, mask, sim in _decisions(roster, obs_dim, seeds):
        a, p = _argmax(model, obs, mask)
        o2 = obs.copy(); o2[idx] = 0.0
        _, p2 = _argmax(model, o2, mask)
        deltas.append(abs(p[a] - p2[a]))
    return float(np.mean(deltas)) if deltas else 0.0


def agent_mean_score(model, roster, seeds) -> float:
    """Mean TRUE score when the agent plays full shuffled games itself (deterministic argmax).
    This is the agent's own trajectory, so the curve shows its score climbing from a random
    policy up toward -- and past -- greedy."""
    env = ScrambleEnv(roster=roster, shuffle=True)
    scores = []
    for s in seeds:
        obs, _ = env.reset(seed=int(s))
        done, total = False, 0
        while not done:
            a, _ = _argmax(model, obs, env.action_mask())
            obs, _, done, _, info = env.step(a)
            total += info["raw_reward"]
        scores.append(total)
    return float(np.mean(scores))


def _policy_mean_score(roster, seeds, policy) -> float:
    sim = ScrambleSim(roster)
    out = []
    for s in seeds:
        sim.reset(int(s))
        while not sim.done:
            sim.step(policy(sim))
        out.append(sim.total_score)
    return float(np.mean(out))


def _optimum_mean_score(roster, seeds) -> float:
    sim = ScrambleSim(roster)
    out = []
    for s in seeds:
        sim.reset(int(s))
        out.append(offline_optimum(sim.team_sequence, roster))
    return float(np.mean(out))


def _checkpoints(run_dir: Path):
    for path in sorted(glob.glob(str(run_dir / "ckpt_*.pt"))):
        m, b = _load(path)
        yield b.get("update", 0) * b.get("batch_episodes", 1), b["obs_dim"], m


def main(argv=None) -> None:
    p = argparse.ArgumentParser(description="Probe a run's checkpoints over training time")
    p.add_argument("--run-dir", type=str, required=True)
    p.add_argument("--games", type=int, default=200)
    args = p.parse_args(argv)

    roster = load_roster()
    seeds = range(args.games)
    greedy_ref = _policy_mean_score(roster, seeds, greedy_pick)   # constant reference
    opt_ref = _optimum_mean_score(roster, seeds)                  # ceiling reference
    xs, abl, scr = [], [], []
    for games_seen, obs_dim, model in _checkpoints(Path(args.run_dir)):
        xs.append(games_seen)
        abl.append(save_ablation(model, roster, obs_dim, seeds))
        scr.append(agent_mean_score(model, roster, seeds))
        print(f"games={games_seen:>8,}  agent_score={scr[-1]:>11,.0f}  "
              f"({scr[-1] / greedy_ref * 100:5.1f}% of greedy)")
    print(f"reference: greedy={greedy_ref:,.0f}  optimum={opt_ref:,.0f}")
    print(f"final score {scr[-1]:,.0f} ({scr[-1] / greedy_ref * 100:.1f}% of greedy)  "
          f"peak save-ablation {max(abl):.2e} (final {abl[-1]:.2e})")

    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    # HEADLINE FIGURE: the agent's own score climbing to match, then beat, greedy
    plt.figure(figsize=(8, 5))
    plt.plot(xs, [s / 1e6 for s in scr], marker="o", label="agent (plays deterministically)")
    plt.axhline(greedy_ref / 1e6, ls="--", c="tab:green", label=f"greedy ({greedy_ref:,.0f})")
    plt.axhline(opt_ref / 1e6, ls=":", c="gray", label=f"optimum ({opt_ref:,.0f})")
    plt.xlabel("games seen"); plt.ylabel("mean score (millions of career yards)")
    plt.title("The agent learns to match, then beat, greedy (shuffled inputs)")
    plt.legend(); plt.tight_layout()
    plt.savefig(DOCS_DIR / "time_to_greedy_score.png", dpi=120); plt.close()

    plt.figure(figsize=(8, 5)); plt.plot(xs, abl, marker="o", color="tab:red")
    plt.xlabel("games seen"); plt.ylabel("|Δ confidence in top pick| when save feature hidden")
    plt.title("Save-feature attention over training")
    plt.tight_layout(); plt.savefig(DOCS_DIR / "save_attention_over_training.png", dpi=120); plt.close()


if __name__ == "__main__":
    main()
