import numpy as np
import torch

from experiments.reinforce import ActorCritic


def test_forward_shapes_single_and_batch():
    net = ActorCritic(obs_dim=14, n_actions=4, hidden=32)
    obs = torch.zeros(14)
    mask = torch.ones(4, dtype=torch.bool)
    logits, value = net(obs, mask)
    assert logits.shape == (4,)
    assert value.shape == ()          # scalar
    obs_b = torch.zeros(8, 14)
    mask_b = torch.ones(8, 4, dtype=torch.bool)
    logits_b, value_b = net(obs_b, mask_b)
    assert logits_b.shape == (8, 4)
    assert value_b.shape == (8,)


def test_masked_actions_get_near_zero_probability():
    net = ActorCritic(obs_dim=14, n_actions=4, hidden=32)
    obs = torch.zeros(14)
    mask = torch.tensor([True, False, False, True])
    dist, _ = net.distribution(obs, mask)
    probs = dist.probs.detach().numpy()
    assert probs[1] < 1e-6 and probs[2] < 1e-6
    assert np.isclose(probs.sum(), 1.0, atol=1e-5)


from experiments.reinforce import (
    TrainConfig, compute_returns, train, select_action,
)


def test_compute_returns_undiscounted():
    assert compute_returns([1.0, 2.0, 3.0], gamma=1.0) == [6.0, 5.0, 3.0]


def test_compute_returns_discounted():
    out = compute_returns([1.0, 1.0], gamma=0.5)
    assert out == [1.5, 1.0]


class _BanditEnv:
    """One-step env: action 0 -> reward 1, else 0. Constant obs. Tests the loop learns."""
    def __init__(self):
        self.observation_space = type("S", (), {"shape": (2,)})()
        self.action_space = type("A", (), {"n": 3})()

    def reset(self, *, seed=None, options=None):
        return np.zeros(2, dtype=np.float32), {}

    def action_mask(self):
        return np.array([True, True, True])

    def step(self, action):
        reward = 1.0 if int(action) == 0 else 0.0
        return np.zeros(2, dtype=np.float32), reward, True, False, {"raw_reward": reward}


def test_training_loop_learns_bandit():
    cfg = TrainConfig(updates=120, batch_episodes=16, lr=0.05, entropy_coef=0.0,
                      hidden=16, seed=0, log_every=1000)
    result = train(lambda: _BanditEnv(), cfg)
    assert result.curve[-1] > 0.8            # learned to pick the rewarding action
    # deterministic selection picks the best action
    obs = np.zeros(2, dtype=np.float32)
    mask = np.array([True, True, True])
    assert select_action(result.model, obs, mask, deterministic=True) == 0


def test_train_cli_writes_loadable_checkpoint(tmp_path):
    import torch
    from experiments import train_model1
    from experiments.reinforce import ActorCritic

    ckpt = tmp_path / "m.pt"
    train_model1.main([
        "--updates", "2", "--batch", "4", "--seed", "0",
        "--out", str(ckpt), "--plot", str(tmp_path / "curve.png"),
    ])
    assert ckpt.exists()
    blob = torch.load(ckpt, weights_only=False)
    model = ActorCritic(blob["obs_dim"], blob["n_actions"], blob["hidden"])
    model.load_state_dict(blob["state_dict"])   # loads without error
