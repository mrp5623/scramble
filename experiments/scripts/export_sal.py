"""Export Sal's policy parameters to plain JSON for the web app.

The checkpoint stores an ActorCritic: a shared trunk feeding a policy head and a
value head. The value head was the training-time baseline for the policy gradient
and plays no part in inference, so it is deliberately NOT exported -- the browser
ships the 5,188-parameter policy path only.
"""
from __future__ import annotations

import json
from pathlib import Path

import torch

REPO_ROOT = Path(__file__).resolve().parents[2]
CKPT = REPO_ROOT / "experiments" / "checkpoints" / "model1_crn_shuffle_long.pt"
OUT = REPO_ROOT / "web" / "weights" / "sal.json"

KEEP = [
    "trunk.0.weight",
    "trunk.0.bias",
    "trunk.2.weight",
    "trunk.2.bias",
    "policy_head.weight",
    "policy_head.bias",
]


def main() -> None:
    blob = torch.load(CKPT, map_location="cpu", weights_only=False)
    state = blob["state_dict"]

    payload = {
        "obs_dim": int(blob["obs_dim"]),
        "hidden": int(blob["hidden"]),
        "n_actions": int(blob["n_actions"]),
        "params": {k: state[k].tolist() for k in KEEP},
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload), encoding="utf-8")

    n_params = sum(state[k].numel() for k in KEEP)
    print(f"wrote {OUT} ({n_params:,} parameters, {OUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
