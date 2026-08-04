"""Sweep a training run's checkpoints and plot two learning curves:

1. greedy-agreement (time-to-greedy) -- did the agent learn the conservative optimum,
   and after how many games? (with shuffled inputs this is an *earned* skill, not the
   free positional shortcut).
2. save-feature ablation (attention-over-time) -- did it ever attend to the save value
   before collapsing onto greedy? This is the temporal follow-up to F7, which only saw
   the fully-converged checkpoint.

Usage (from repo root):
    /c/Python313/python -m experiments.scripts.probe_over_training \
        --run-dir experiments/checkpoints/run_001_ev_shuffle --games 200
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
    candidate_order, build_observation, legal_action_mask, decode_action,
    OBS_DIM_SHUFFLED,
)
from experiments.baselines.policies import greedy_pick
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
    """Yield (obs, mask, order, sim) over on-policy-GREEDY states, candidate order shuffled
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
            yield obs, mask, order, sim
            sim.step(greedy_pick(sim))


def _argmax(model, obs, mask):
    with torch.no_grad():
        logits, _ = model.forward(torch.as_tensor(obs, dtype=torch.float32),
                                  torch.as_tensor(mask, dtype=torch.bool))
        p = torch.softmax(logits, -1).numpy()
    return int(p.argmax()), p


def greedy_agreement(model, roster, obs_dim, seeds) -> float:
    """Fraction of decisions where the agent's deterministic (argmax) pick == greedy's pick."""
    agree = tot = 0
    for obs, mask, order, sim in _decisions(roster, obs_dim, seeds):
        a, _ = _argmax(model, obs, mask)
        if decode_action(sim, a, order) == greedy_pick(sim):
            agree += 1
        tot += 1
    return agree / max(tot, 1)


def save_ablation(model, roster, obs_dim, seeds) -> float:
    """Mean |P(argmax) - P'(argmax)| when the save_value inputs are zeroed (the F7 probe).

    ~0 means the policy's chosen-action probability doesn't move when the save signal is
    deleted -> the feature is causally inert at this checkpoint."""
    idx = _save_indices(obs_dim)
    deltas = []
    for obs, mask, order, sim in _decisions(roster, obs_dim, seeds):
        a, p = _argmax(model, obs, mask)
        o2 = obs.copy(); o2[idx] = 0.0
        _, p2 = _argmax(model, o2, mask)
        deltas.append(abs(p[a] - p2[a]))
    return float(np.mean(deltas)) if deltas else 0.0


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
    xs, agr, abl = [], [], []
    for games_seen, obs_dim, model in _checkpoints(Path(args.run_dir)):
        xs.append(games_seen)
        agr.append(greedy_agreement(model, roster, obs_dim, seeds))
        abl.append(save_ablation(model, roster, obs_dim, seeds))
        print(f"games={games_seen:>8,}  agreement={agr[-1] * 100:6.2f}%  save_ablation_dP={abl[-1]:.2e}")

    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    plt.figure(figsize=(8, 5)); plt.plot(xs, [a * 100 for a in agr], marker="o")
    plt.axhline(99, ls="--", c="gray"); plt.xlabel("games seen")
    plt.ylabel("agreement with greedy (%)"); plt.title("Time-to-greedy (shuffled inputs)")
    plt.tight_layout(); plt.savefig(DOCS_DIR / "time_to_greedy.png", dpi=120); plt.close()

    plt.figure(figsize=(8, 5)); plt.plot(xs, abl, marker="o", color="tab:red")
    plt.xlabel("games seen"); plt.ylabel("|dP(argmax)| when save zeroed")
    plt.title("Save-feature attention over training")
    plt.tight_layout(); plt.savefig(DOCS_DIR / "save_attention_over_training.png", dpi=120); plt.close()

    hit = next((x for x, a in zip(xs, agr) if a >= 0.99), None)
    lines = [
        "# Phase 2 - Time-to-greedy + save-attention over training (shuffled inputs)",
        "",
        f"Probed {len(xs)} checkpoints over a shuffled-input run; {args.games} held-out games each "
        "(states advanced by greedy, candidate order shuffled per game).",
        "",
        (f"- **Reached >=99% greedy-agreement at ~{hit:,} games.**" if hit is not None
         else "- Did not reach 99% greedy-agreement within this run."),
        f"- Peak save-feature ablation dP over training: **{max(abl):.2e}** (final **{abl[-1]:.2e}**).",
        "",
        "![Time to greedy](time_to_greedy.png)",
        "",
        "![Save attention over training](save_attention_over_training.png)",
        "",
    ]
    (DOCS_DIR / "phase2-time-to-greedy.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {DOCS_DIR / 'phase2-time-to-greedy.md'}")


if __name__ == "__main__":
    main()
