"""Export deterministic fixtures so the JavaScript port can be verified.

Bob and Sal are deterministic, so their per-game totals are exported for exact
element-wise comparison. Carl needs random futures and Python's Mersenne Twister is
not reproducible in JavaScript, so only his mean is exported.
"""
from __future__ import annotations

import json
import random
from pathlib import Path

import torch

from experiments.baselines.policies import greedy_pick
from experiments.baselines.rollout import rollout_pick
from experiments.rl.reinforce import ActorCritic
from experiments.sim.gym_env import (
    N_CANDIDATES,
    build_observation,
    decode_action,
    legal_action_mask,
)
from experiments.sim.scramble_sim import ScrambleSim, load_roster

REPO_ROOT = Path(__file__).resolve().parents[2]
CKPT = REPO_ROOT / "experiments" / "checkpoints" / "model1_crn_shuffle_long.pt"
OUT = REPO_ROOT / "web" / "tools" / "fixtures" / "parity.json"

N_GAMES = 500


def load_net() -> ActorCritic:
    blob = torch.load(CKPT, map_location="cpu", weights_only=False)
    net = ActorCritic(
        obs_dim=int(blob["obs_dim"]),
        n_actions=int(blob["n_actions"]),
        hidden=int(blob["hidden"]),
    )
    net.load_state_dict(blob["state_dict"])
    net.eval()
    return net


def sal_pick(sim: ScrambleSim, net: ActorCritic, yard_scale: float):
    # SORTED, unshuffled candidate order -- agent.js uses the same convention.
    order = sim.available()[:N_CANDIDATES]
    if not order:
        return None
    # NOTE: passing an explicit `order` list selects the 11-dim layout. Passing None
    # would silently return the 14-dim LEGACY layout and break everything downstream.
    obs = build_observation(sim, yard_scale, order)
    mask = legal_action_mask(sim, order)
    with torch.no_grad():
        logits, _ = net(
            torch.from_numpy(obs).unsqueeze(0),
            torch.from_numpy(mask).unsqueeze(0),
        )
    return decode_action(sim, int(torch.argmax(logits[0])), order)


def main() -> None:
    roster = load_roster()
    sim = ScrambleSim(roster)
    yard_scale = float(max(roster.qb_yards.values()))
    net = load_net()

    sequences, greedy_totals, sal_totals, rollout_totals = [], [], [], []

    for seed in range(N_GAMES):
        sim.reset(seed)
        sequences.append(list(sim.team_sequence))

        sim.reset(seed)
        while not sim.done:
            sim.step(greedy_pick(sim))
        greedy_totals.append(sim.total_score)

        sim.reset(seed)
        while not sim.done:
            sim.step(sal_pick(sim, net, yard_scale))
        sal_totals.append(sim.total_score)

        sim.reset(seed)
        rng = random.Random(seed)
        while not sim.done:
            sim.step(rollout_pick(sim, n_rollouts=40, top_k=3, rng=rng))
        rollout_totals.append(sim.total_score)

    payload = {
        "nGames": N_GAMES,
        "sequences": sequences,
        "greedyTotals": greedy_totals,
        "salTotals": sal_totals,
        "rolloutMean": sum(rollout_totals) / N_GAMES,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload), encoding="utf-8")

    print(f"wrote {OUT} ({OUT.stat().st_size:,} bytes)")
    print(f"  greedy mean  {sum(greedy_totals) / N_GAMES:,.0f}")
    print(f"  Sal mean     {sum(sal_totals) / N_GAMES:,.0f}")
    print(f"  rollout mean {sum(rollout_totals) / N_GAMES:,.0f}")


if __name__ == "__main__":
    main()
