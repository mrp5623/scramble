"""Train Model #1 and save a checkpoint + training-curve plot.

Usage (from repo root):
    /c/Python313/python -m experiments.scripts.train_model1 --updates 1500 --batch 64
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import torch

from experiments.sim.scramble_sim import REPO_ROOT, ScrambleSim
from experiments.sim.gym_env import ScrambleEnv
from experiments.baselines.policies import greedy_pick
from experiments.rl.reinforce import TrainConfig, train

DEFAULT_CKPT = REPO_ROOT / "experiments" / "checkpoints" / "model1.pt"
DEFAULT_PLOT = REPO_ROOT / "docs" / "experiments" / "phase2" / "model1_training.png"


def next_run_dir(base: Path, tag: str) -> Path:
    """Return (and create) base/run_{NNN}_{tag} with NNN = 1 + the highest existing index.

    Each training run gets its own numbered folder so periodic checkpoints from different
    runs never mingle. Numbering is global across tags (max over all run_* dirs)."""
    base = Path(base)
    base.mkdir(parents=True, exist_ok=True)
    nums = [int(m.group(1)) for p in base.glob("run_*")
            if (m := re.match(r"run_(\d+)_", p.name))]
    run = base / f"run_{(max(nums) + 1 if nums else 1):03d}_{tag}"
    run.mkdir(parents=True, exist_ok=True)
    return run


def make_greedy_baseline(roster, num_rounds):
    """Return baseline_fn(seed) = greedy's TRUE score on the same draw sequence as `seed`.

    Reused across episodes via one throwaway sim; deterministic because ScrambleSim.reset(seed)
    regenerates the identical team sequence for a given (roster, seed). This is the control
    variate the CRN estimator subtracts to cancel draw-luck.
    """
    ref = ScrambleSim(roster, num_rounds=num_rounds)

    def baseline_fn(seed: int) -> float:
        ref.reset(seed)
        while not ref.done:
            ref.step(greedy_pick(ref))
        return float(ref.total_score)

    return baseline_fn


def _rolling(x, w=25):
    x = np.asarray(x, dtype=float)
    if len(x) < w:
        return x
    return np.convolve(x, np.ones(w) / w, mode="valid")


def _plot_curve(curve, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    plt.figure(figsize=(8, 5))
    plt.plot(curve, alpha=0.3, label="mean episode score")
    plt.plot(range(len(curve) - len(_rolling(curve)), len(curve)),
             _rolling(curve), label="rolling mean (25)")
    plt.xlabel("update")
    plt.ylabel("mean total career yards / episode")
    plt.title("Model #1 training curve")
    plt.legend()
    plt.tight_layout()
    plt.savefig(path, dpi=120)
    plt.close()


def main(argv=None) -> str:
    p = argparse.ArgumentParser(description="Train Scramble RL Model #1")
    p.add_argument("--updates", type=int, default=1500)
    p.add_argument("--batch", type=int, default=64)
    p.add_argument("--lr", type=float, default=3e-4)
    p.add_argument("--entropy", type=float, default=0.01)
    p.add_argument("--hidden", type=int, default=64)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--out", type=str, default=str(DEFAULT_CKPT))
    p.add_argument("--plot", type=str, default=str(DEFAULT_PLOT))
    p.add_argument("--logdir", type=str, default=None,
                   help="TensorBoard log dir (omit to disable), e.g. runs/model1")
    p.add_argument("--shaping", type=float, default=0.0,
                   help="opportunity-cost reward-shaping coefficient (0 = off, 1 = full)")
    p.add_argument("--crn", action="store_true",
                   help="use the common-random-numbers greedy baseline (cancels draw-luck)")
    p.add_argument("--shuffle", action="store_true",
                   help="shuffle candidate order (11-dim obs; makes reaching greedy an earned skill)")
    p.add_argument("--checkpoint-every", type=int, default=0,
                   help="save a checkpoint every N updates into a numbered run folder (0 = off)")
    p.add_argument("--run-tag", type=str, default="run",
                   help="label for the numbered run folder, e.g. ev / risk")
    args = p.parse_args(argv)

    cfg = TrainConfig(updates=args.updates, batch_episodes=args.batch, lr=args.lr,
                      entropy_coef=args.entropy, hidden=args.hidden, seed=args.seed,
                      logdir=args.logdir, checkpoint_every=args.checkpoint_every)
    env = ScrambleEnv(shaping_coef=args.shaping, shuffle=args.shuffle)
    baseline_fn = make_greedy_baseline(env.roster, env.sim.num_rounds) if args.crn else None

    # When checkpointing is on, stream each snapshot into a fresh numbered run folder as a
    # self-describing blob (the probe reads obs_dim/update/batch back out). Clone the
    # state_dict at call time so each file freezes THAT update's weights, not the final ones.
    run_dir = None
    checkpoint_cb = None
    if args.checkpoint_every > 0:
        run_dir = next_run_dir(REPO_ROOT / "experiments" / "checkpoints", args.run_tag)
        obs_dim = env.observation_space.shape[0]   # pyright: ignore[reportOptionalSubscript]
        n_actions = env.action_space.n             # pyright: ignore[reportAttributeAccessIssue]

        def _save_ckpt(update, model, _dir=run_dir):
            torch.save(
                {
                    "state_dict": {k: v.clone() for k, v in model.state_dict().items()},
                    "hidden": args.hidden,
                    "obs_dim": obs_dim,
                    "n_actions": n_actions,
                    "update": update,
                    "batch_episodes": args.batch,
                    "shuffle": args.shuffle,
                },
                _dir / f"ckpt_{update:05d}.pt",
            )

        checkpoint_cb = _save_ckpt

    result = train(lambda: env, cfg, baseline_fn=baseline_fn, checkpoint_cb=checkpoint_cb)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "state_dict": result.model.state_dict(),
            "hidden": args.hidden,
            "obs_dim": env.observation_space.shape[0], # pyright: ignore[reportOptionalSubscript]
            "n_actions": env.action_space.n, # pyright: ignore[reportAttributeAccessIssue]
        },
        out,
    )
    _plot_curve(result.curve, Path(args.plot))
    print(f"Saved checkpoint -> {out}")
    print(f"Saved curve      -> {args.plot}")
    if run_dir is not None:
        print(f"Saved checkpoints -> {run_dir}")
    return str(out)


if __name__ == "__main__":
    main()
