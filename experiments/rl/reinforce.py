"""Hand-rolled REINFORCE-with-baseline (actor-critic) for Scramble Model #1.

Why REINFORCE + a value baseline (not PPO): it is the simplest *correct* policy
gradient. The policy net outputs action logits; we sample actions, and after a batch of
full episodes we push up the log-probability of actions that beat the state's baseline
value and push down those that fell short. The value head is that baseline (it predicts
"how good is this state on average"), which cuts gradient variance without biasing it.
The tiny 4-action space makes this converge without PPO's extra clipping machinery.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional

import numpy as np
import torch
import torch.nn as nn
from torch.distributions import Categorical

MASK_FILL = -1e9   # added to illegal-action logits so their probability is ~0


class ActorCritic(nn.Module):
    def __init__(self, obs_dim: int, n_actions: int, hidden: int = 64):
        super().__init__()
        self.trunk = nn.Sequential(
            nn.Linear(obs_dim, hidden), nn.Tanh(),
            nn.Linear(hidden, hidden), nn.Tanh(),
        )
        self.policy_head = nn.Linear(hidden, n_actions)   # action logits
        self.value_head = nn.Linear(hidden, 1)            # state-value baseline

    def forward(self, obs, mask):
        h = self.trunk(obs)
        logits = self.policy_head(h)
        logits = logits.masked_fill(~mask, MASK_FILL)     # illegal actions -> ~0 prob
        value = self.value_head(h).squeeze(-1)
        return logits, value

    def distribution(self, obs, mask):
        logits, value = self.forward(obs, mask)
        return Categorical(logits=logits), value


@dataclass
class TrainConfig:
    updates: int = 1500
    batch_episodes: int = 64
    lr: float = 3e-4
    gamma: float = 1.0
    entropy_coef: float = 0.01
    value_coef: float = 0.5
    hidden: int = 64
    seed: int = 0
    log_every: int = 20
    logdir: Optional[str] = None   # TensorBoard log dir; None disables logging


@dataclass
class TrainResult:
    model: ActorCritic
    curve: list[float] = field(default_factory=list)   # mean raw episode score per update


def compute_returns(rewards, gamma: float = 1.0):
    """Undiscounted (gamma=1) returns-to-go: G_t = sum of rewards from t to episode end."""
    returns = []
    g = 0.0
    for r in reversed(rewards):
        g = r + gamma * g
        returns.append(g)
    returns.reverse()
    return returns


def _crn_advantages(agent_totals, baseline_totals) -> np.ndarray:
    """Common-random-numbers advantage: each episode's margin over a reference policy
    that played the *same* draw sequence, normalized across the batch.

    Because agent and reference saw identical team draws, the shared draw-luck cancels in
    the subtraction -- what's left is pure skill difference. This is the control variate that
    lets the gradient hear the ~0.5% edge our unpaired episode returns were drowning.
    """
    m = np.asarray(agent_totals, dtype=np.float64) - np.asarray(baseline_totals, dtype=np.float64)
    return (m - m.mean()) / (m.std() + 1e-8)


def select_action(model, obs, mask, deterministic: bool = False) -> int:
    obs_t = torch.as_tensor(np.asarray(obs), dtype=torch.float32)
    mask_t = torch.as_tensor(np.asarray(mask), dtype=torch.bool)
    with torch.no_grad():
        dist, _ = model.distribution(obs_t, mask_t)
        if deterministic:
            return int(torch.argmax(dist.probs).item())
        return int(dist.sample().item())


def train(
    make_env,
    cfg: TrainConfig = TrainConfig(),
    baseline_fn: Optional[Callable[[int], float]] = None,
) -> TrainResult:
    """Train the policy with REINFORCE + a value baseline.

    If `baseline_fn` is given, switch to the common-random-numbers estimator: each episode
    is run at an explicit seed, `baseline_fn(seed)` returns a reference policy's score on the
    *same* seed, and the per-episode margin (agent - reference) replaces the value-baseline
    advantage. The value head is left untrained in this mode (the reference is the baseline).
    """
    torch.manual_seed(cfg.seed)
    np.random.seed(cfg.seed)
    ep_rng = np.random.default_rng(cfg.seed)   # draws per-episode seeds for CRN pairing

    env = make_env()
    obs_dim = env.observation_space.shape[0]
    n_actions = env.action_space.n
    model = ActorCritic(obs_dim, n_actions, cfg.hidden)
    opt = torch.optim.Adam(model.parameters(), lr=cfg.lr)

    writer = None
    if cfg.logdir:
        from torch.utils.tensorboard import SummaryWriter  # lazy: only needed when logging
        writer = SummaryWriter(cfg.logdir)

    curve: list[float] = []
    for update in range(cfg.updates):
        b_obs, b_mask, b_act, b_ret = [], [], [], []
        ep_scores = []
        ep_lens, ep_baselines = [], []   # CRN-only bookkeeping

        # --- collect a batch of complete episodes under the current policy ---
        for _ in range(cfg.batch_episodes):
            if baseline_fn is not None:
                ep_seed = int(ep_rng.integers(0, 2**31 - 1))
                obs, _ = env.reset(seed=ep_seed)
                ep_baselines.append(baseline_fn(ep_seed))   # reference score on the SAME draw
            else:
                obs, _ = env.reset()
            done = False
            ep_obs, ep_mask, ep_act, ep_rew = [], [], [], []
            raw_total = 0.0
            while not done:
                mask = env.action_mask()
                obs_t = torch.as_tensor(obs, dtype=torch.float32)
                mask_t = torch.as_tensor(mask, dtype=torch.bool)
                with torch.no_grad():
                    dist, _ = model.distribution(obs_t, mask_t)
                    action = int(dist.sample().item())
                next_obs, reward, done, _, info = env.step(action)
                ep_obs.append(obs); ep_mask.append(mask)
                ep_act.append(action); ep_rew.append(reward)
                raw_total += info.get("raw_reward", reward)
                obs = next_obs
            b_ret.extend(compute_returns(ep_rew, cfg.gamma))
            b_obs.extend(ep_obs); b_mask.extend(ep_mask); b_act.extend(ep_act)
            ep_scores.append(raw_total)
            if baseline_fn is not None:
                ep_lens.append(len(ep_rew))

        # --- one policy-gradient update on the whole batch ---
        obs_b = torch.as_tensor(np.array(b_obs), dtype=torch.float32)
        mask_b = torch.as_tensor(np.array(b_mask), dtype=torch.bool)
        act_b = torch.as_tensor(np.array(b_act), dtype=torch.long)
        ret_b = torch.as_tensor(np.array(b_ret), dtype=torch.float32)

        dist, values = model.distribution(obs_b, mask_b)
        logp = dist.log_prob(act_b)
        entropy = dist.entropy().mean()

        if baseline_fn is not None:
            # CRN: per-episode margin over the reference, broadcast to that episode's steps.
            ep_adv = _crn_advantages(ep_scores, ep_baselines)
            adv = torch.as_tensor(np.repeat(ep_adv, ep_lens), dtype=torch.float32)
            policy_loss = -(logp * adv).mean()
            value_loss = torch.zeros(())                    # value head unused in CRN mode
        else:
            adv = ret_b - values.detach()                   # advantage
            adv = (adv - adv.mean()) / (adv.std() + 1e-8)   # normalize -> stable gradients
            policy_loss = -(logp * adv).mean()
            value_loss = ((values - ret_b) ** 2).mean()
        loss = policy_loss + cfg.value_coef * value_loss - cfg.entropy_coef * entropy

        opt.zero_grad()
        loss.backward()
        opt.step()

        mean_score = float(np.mean(ep_scores))
        curve.append(mean_score)
        # In CRN mode this is the metric that matters: mean yards the agent beats greedy by,
        # on identical draws (positive => beating greedy; ~0 => matching it).
        mean_margin = (
            float(np.mean(np.asarray(ep_scores) - np.asarray(ep_baselines)))
            if baseline_fn is not None else 0.0
        )
        if writer is not None:
            writer.add_scalar("charts/mean_score", mean_score, update)
            if baseline_fn is not None:
                writer.add_scalar("charts/mean_margin_vs_greedy", mean_margin, update)
            writer.add_scalar("losses/total", loss.item(), update)
            writer.add_scalar("losses/policy", policy_loss.item(), update)
            writer.add_scalar("losses/value", value_loss.item(), update)
            writer.add_scalar("losses/entropy", entropy.item(), update)
        if cfg.log_every and update % cfg.log_every == 0:
            extra = f"  margin_vs_greedy={mean_margin:+,.0f}" if baseline_fn is not None else ""
            print(f"update {update:4d}  mean_score={mean_score:,.1f}  loss={loss.item():.4f}{extra}")

    if writer is not None:
        writer.flush()
        writer.close()
    return TrainResult(model=model, curve=curve)
