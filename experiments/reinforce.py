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


def select_action(model, obs, mask, deterministic: bool = False) -> int:
    obs_t = torch.as_tensor(np.asarray(obs), dtype=torch.float32)
    mask_t = torch.as_tensor(np.asarray(mask), dtype=torch.bool)
    with torch.no_grad():
        dist, _ = model.distribution(obs_t, mask_t)
        if deterministic:
            return int(torch.argmax(dist.probs).item())
        return int(dist.sample().item())


def train(make_env, cfg: TrainConfig = TrainConfig()) -> TrainResult:
    torch.manual_seed(cfg.seed)
    np.random.seed(cfg.seed)

    env = make_env()
    obs_dim = env.observation_space.shape[0]
    n_actions = env.action_space.n
    model = ActorCritic(obs_dim, n_actions, cfg.hidden)
    opt = torch.optim.Adam(model.parameters(), lr=cfg.lr)

    curve: list[float] = []
    for update in range(cfg.updates):
        b_obs, b_mask, b_act, b_ret = [], [], [], []
        ep_scores = []

        # --- collect a batch of complete episodes under the current policy ---
        for _ in range(cfg.batch_episodes):
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

        # --- one policy-gradient update on the whole batch ---
        obs_b = torch.as_tensor(np.array(b_obs), dtype=torch.float32)
        mask_b = torch.as_tensor(np.array(b_mask), dtype=torch.bool)
        act_b = torch.as_tensor(np.array(b_act), dtype=torch.long)
        ret_b = torch.as_tensor(np.array(b_ret), dtype=torch.float32)

        dist, values = model.distribution(obs_b, mask_b)
        logp = dist.log_prob(act_b)
        adv = ret_b - values.detach()                       # advantage
        adv = (adv - adv.mean()) / (adv.std() + 1e-8)       # normalize -> stable gradients

        policy_loss = -(logp * adv).mean()
        value_loss = ((values - ret_b) ** 2).mean()
        entropy = dist.entropy().mean()
        loss = policy_loss + cfg.value_coef * value_loss - cfg.entropy_coef * entropy

        opt.zero_grad()
        loss.backward()
        opt.step()

        mean_score = float(np.mean(ep_scores))
        curve.append(mean_score)
        if cfg.log_every and update % cfg.log_every == 0:
            print(f"update {update:4d}  mean_score={mean_score:,.1f}  loss={loss.item():.4f}")

    return TrainResult(model=model, curve=curve)
