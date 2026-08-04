import numpy as np
import pytest
import torch

from experiments.rl.reinforce import ActorCritic


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


from experiments.rl.reinforce import (
    TrainConfig, compute_returns, train, select_action, _crn_advantages,
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


def test_crn_advantages_normalizes_margins():
    # margins = agent - baseline = [10, -10]; normalized to mean 0, unit std -> [1, -1]
    adv = _crn_advantages([110.0, 90.0], [100.0, 100.0])
    np.testing.assert_allclose(adv, [1.0, -1.0], atol=1e-6)
    assert abs(float(np.mean(adv))) < 1e-6


def test_crn_advantages_positive_when_beating_baseline():
    # Episode that beat greedy gets a positive advantage; one that lost gets negative.
    adv = _crn_advantages([120.0, 100.0, 80.0], [100.0, 100.0, 100.0])
    assert adv[0] > 0        # +20 over greedy
    assert adv[2] < 0        # -20 under greedy
    assert abs(float(np.mean(adv))) < 1e-6


def test_crn_baseline_path_learns_bandit():
    """With a greedy-style control-variate baseline, the loop still learns action 0."""
    cfg = TrainConfig(updates=120, batch_episodes=16, lr=0.05, entropy_coef=0.0,
                      hidden=16, seed=0, log_every=1000)
    # bandit: action 0 -> raw_reward 1 else 0; constant baseline 0.5 (like greedy's expected score)
    result = train(lambda: _BanditEnv(), cfg, baseline_fn=lambda seed: 0.5)
    assert result.curve[-1] > 0.8
    obs = np.zeros(2, dtype=np.float32)
    mask = np.array([True, True, True])
    assert select_action(result.model, obs, mask, deterministic=True) == 0


def test_checkpoint_cb_fires_at_expected_updates():
    """Callback fires at update 0 (random init), every checkpoint_every, and the final update."""
    seen = []
    cfg = TrainConfig(updates=5, batch_episodes=2, checkpoint_every=2, log_every=0)
    train(lambda: _BanditEnv(), cfg,
          checkpoint_cb=lambda update, model: seen.append(update))
    assert seen == [0, 2, 4]


def test_checkpoint_cb_not_called_when_every_is_zero():
    seen = []
    cfg = TrainConfig(updates=3, batch_episodes=2, checkpoint_every=0, log_every=0)
    train(lambda: _BanditEnv(), cfg,
          checkpoint_cb=lambda update, model: seen.append(update))
    assert seen == []


def test_train_cli_writes_loadable_checkpoint(tmp_path):
    import torch
    from experiments.scripts import train_model1
    from experiments.rl.reinforce import ActorCritic

    ckpt = tmp_path / "m.pt"
    train_model1.main([
        "--updates", "2", "--batch", "4", "--seed", "0",
        "--out", str(ckpt), "--plot", str(tmp_path / "curve.png"),
    ])
    assert ckpt.exists()
    blob = torch.load(ckpt, weights_only=False)
    model = ActorCritic(blob["obs_dim"], blob["n_actions"], blob["hidden"])
    model.load_state_dict(blob["state_dict"])   # loads without error


def test_eval_cli_writes_doc_with_agent_row(tmp_path):
    from experiments.scripts import train_model1, run_agent_eval

    ckpt = tmp_path / "m.pt"
    train_model1.main(["--updates", "2", "--batch", "4", "--out", str(ckpt),
                       "--plot", str(tmp_path / "c.png")])
    doc = tmp_path / "phase2-agent.md"
    run_agent_eval.main([
        "--checkpoint", str(ckpt), "--games", "3", "--rollouts", "5",
        "--out", str(doc), "--plot", str(tmp_path / "scores.png"),
    ])
    text = doc.read_text(encoding="utf-8")
    assert "Agent" in text and "% of optimum" in text


def test_train_writes_tensorboard_events(tmp_path):
    pytest.importorskip("tensorboard")   # skip until tensorboard is installed
    logdir = tmp_path / "tb"
    cfg = TrainConfig(updates=2, batch_episodes=2, hidden=8, log_every=1000,
                      logdir=str(logdir))
    train(lambda: _BanditEnv(), cfg)
    events = list(logdir.glob("**/events.out.tfevents.*"))
    assert events, "expected a TensorBoard events file in the log dir"
