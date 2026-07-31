"""Train Model #1 and save a checkpoint + training-curve plot.

Usage (from repo root):
    /c/Python313/python -m experiments.train_model1 --updates 1500 --batch 64
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import torch

from experiments.scramble_sim import REPO_ROOT
from experiments.gym_env import ScrambleEnv
from experiments.reinforce import TrainConfig, train

DEFAULT_CKPT = REPO_ROOT / "experiments" / "checkpoints" / "model1.pt"
DEFAULT_PLOT = REPO_ROOT / "docs" / "experiments" / "model1_training.png"


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
    args = p.parse_args(argv)

    cfg = TrainConfig(updates=args.updates, batch_episodes=args.batch, lr=args.lr,
                      entropy_coef=args.entropy, hidden=args.hidden, seed=args.seed)
    env = ScrambleEnv()
    result = train(lambda: env, cfg)

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
    return str(out)


if __name__ == "__main__":
    main()
