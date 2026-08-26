# Scramble Experiment — Running Findings Log

A running list of results to consolidate into the final report. Newest sections append at the bottom. Each finding links to the doc/plot that backs it.

## F1 — Greedy is not optimal, but the prize is small (roster-bound)

Over 10,000 seeded games ([phase1-baselines.md](phase1/phase1-baselines.md)):

- Greedy scores **98.15%** of the clairvoyant offline optimum.
- The full `optimum − greedy` gap is only **~1.85%** (~23k of ~1.24M yards).
- The hypothesis ("saving multi-team QBs beats greedy") is **real** — proven exactly on the Flacco/Palmer case and confirmed in aggregate — but the magnitude is small because the top QBs are concentrated and greedy rarely gets badly trapped.

## F2 — The gap is turn-bound only weakly; it is fundamentally roster-bound

Turn-count sweep ([turns-analysis.md](phase1/turns-analysis.md)):

- The relative gap rises, **peaks ~2.07% around 40–50 turns**, then declines (past the peak, good QBs are exhausted and extra turns add near-zero scrubs).
- At the game's 25 turns the gap is 1.85%; at the original 20 turns it is 1.75% — negligibly different.
- **Conclusion:** a longer game would not create meaningful new headroom. The small gap is a property of the roster, not the schedule.

## F3 — The achievable *online* ceiling is far below the clairvoyant optimum

Rollout (Monte-Carlo, greedy base, common random numbers) over 1,000 games ([phase1-online-ceiling.md](phase1/phase1-online-ceiling.md)):

- The best online policy (rollout) captures only **~29% of the clairvoyant gap** (~0.55% over greedy).
- The other **~71% of the gap is future knowledge** no online policy can recover.
- The current opportunity-cost heuristic captures **~20%** of the gap with ~15 lines of code.
- **Implication for RL:** the realistic online headroom over greedy is ~0.55%; the room above the existing heuristic is only ~0.16% of score. RL here is a precision play, not a likely breakthrough — which explains why the original RL attempt never beat greedy.

## F4 — Never worth saving outside a team's top 3 QBs

While tuning the rollout ([phase1-online-ceiling.md](phase1/phase1-online-ceiling.md)):

- Rollout with `top_k=3` scores **1,223,559** vs `top_k=6`'s **1,223,571** over 300 games — a 12-yard difference out of 1.22M (identical gap capture, 31.2%).
- **Conclusion:** the "save" decision only ever involves a team's top ~3 QBs. `top_k=3` is the validated default (halves rollout cost with no loss).

## F5 — Tuning the heuristic hits a ~20% plateau; the rollout is the better online policy

Attempted to close the heuristic's gap toward the rollout ([phase1-baselines.md](phase1/phase1-baselines.md), [phase1-online-ceiling.md](phase1/phase1-online-ceiling.md)):

- **`sum → max` fix (v2):** summing a QB's opportunity cost over *every* franchise he played for double-counts (he can only be saved once); taking the max is correct. Over 10k games at 25 turns, v2 scores the **same mean** as v1 (both ~20% of the gap) but is more robust: it beats greedy less often (48% vs 54%) *and* loses less often (33% vs 36%), and — unlike v1 — does **not** go negative at high turn counts. Kept as the canonical heuristic.
- **Aggressiveness sweep (`α` on the discount):** the capture rate peaks right at **α = 1** (~19%); α < 1 saves too little, α ≥ 2 is worse, α = 3 is catastrophic (−84%). No free tuning gains.
- **Conclusion:** the one-step (myopic) heuristic is fundamentally capped near **~20% of the gap**. The **rollout captures ~29%** and *is itself a deployable online policy* (~16 ms/game) — so a strong online agent needs no training. RL's job (if pursued) is to match/approach the rollout while being cheaper at inference, not to beat the clairvoyant optimum.

## F6 — Model #1 (RL): iteration ledger

Phase 2 asks whether a *learned* agent can capture the online gap greedy leaves on the table
(realistic ceiling ~0.55% over greedy = ~29% of the clairvoyant gap; see F3). Each iteration
below records **what we ran, how it scored, and why that result motivated the next change.**
All eval numbers are paired over 1,000 seeded games, agent playing deterministically (argmax).

### I0 — Vanilla REINFORCE + value baseline, true reward
- **Setup:** engineered 14-float obs (incl. the save-value feature), rank-based Discrete(4) action, undiscounted REINFORCE with a learned value baseline. Reward = true career yards. Budget 1500×64. ([phase2-agent.md](phase2/phase2-agent.md))
- **Result:** converged to **exact greedy** — 1,219,885 to the dollar, captures **0.0%** of the gap, beats greedy in **0/1000** games.
- **Diagnosis (not a bug — genuine convergence):** entropy decayed *gradually* (1.38 → 0.038, so no early collapse), value loss fell 28.7 → 0.42, P(rank 0) = 0.994, and **0/12,500** decisions had a non-greedy argmax. The agent learned greedy because the save-edge is ~0.5% of the episode return while i.i.d. team-draw luck swings that same return ±3–4%. **The signal sits below the noise floor of learning-from-episode-returns.**
- **Why change:** the delayed payoff of saving needs to become an *immediate* signal → try reward shaping.

### I1 — Opportunity-cost reward shaping (action-dependent), true reward reported
- **Setup:** charge the agent `coef · save_value(pick)` on every pick (the exact discount the v2 heuristic subtracts). Crucially, at **coef = 1.0 the shaped-argmax *is* the v2 heuristic**, which beats greedy (~19.7% of the gap) — so the winning policy is expressible as "be greedy on the shaped reward." Reporting always used true yards (`info["raw_reward"]`). ([phase2-agent-shaped.md](phase2/phase2-agent-shaped.md))
- **Result:** at the full 1500×64 budget, coef=1.0 also converged to **exact greedy** (0.0% gap, 0/1000). An earlier *shortened* 600×32 smoke had over-saved (4.4% of decisions) and **lost** ~9k yards — but that was confounded by undertraining; the full-budget run washed the saving back out to greedy. **So the "it just needs more updates" hypothesis was tested and rejected.**
- **Diagnostic — is coef=1.0 too weak?** No. On the real roster, the shaped objective disagrees with greedy on a real fraction of decisions:

  | coef | shaped-argmax ≠ greedy (of savable decisions) |
  |---|---|
  | 0.5 | 2.4% |
  | **1.0** | **9.0%** |
  | 2.0 | 16.0% |
  | 3.0 | 25.2% |

  Shaping applies genuine local pressure on ~9% of decisions, and the myopically-optimal policy under it (= v2) beats greedy — **yet return-based learning still found plain greedy.**
- **Why change:** this *rules out* "reward too weak" and pins the bottleneck on **credit assignment**: REINFORCE optimizes whole-episode return, and the draw-luck variance drowns the per-decision signal regardless of how we shape the reward. Cranking coef higher only makes the agent over-save and *lose* true score (same failure as the smoke). The fix has to attack **variance**, not the reward. → move to a control variate.

### I2 — Common-random-numbers (CRN) greedy baseline, true reward  *(running)*
- **Setup:** run each training episode at an explicit seed and subtract **greedy's score on the same seed** as the baseline (`_crn_advantages` in [reinforce.py](../../experiments/rl/reinforce.py), `--crn` flag). Because agent and greedy see identical draws, the shared luck cancels and the per-episode margin is *pure skill difference* — the same reason our **eval** can detect the 0.5% edge that unpaired training returns could not. It is a provably-unbiased variance reducer (action-independent baseline), so it denoises the reward without telling the agent which QB to pick — the agent must still discover saving on its own (constraint: no supervision / no teacher). Budget 1500×64, shaping off. Watch `charts/mean_margin_vs_greedy`.
- **Result:** converged to **exact greedy** again — 1,219,885 to the dollar, **0.0%** of the gap, **0/1000** beats ([phase2-agent-crn.md](phase2/phase2-agent-crn.md)). Live training telemetry: `mean_margin_vs_greedy` climbed from ~−400k and pinned at ~0 by update ~400, then oscillated within a few hundred yards of zero (±0.02%) — i.e. clean, fast convergence *to* greedy, not past it. The tight convergence confirms CRN removed the draw-luck variance as designed; it just didn't buy a better policy.
- **Sharper diagnosis (the key one):** CRN cancelled the **draw variance** but not **credit assignment** — the advantage is still one episode-level margin broadcast to all 25 actions, so a single good save's ~6k signal is diluted across 24 other "just play greedy" decisions and the gradient can't localize it. Note what this rules in: the winning policy here (v2) is a **myopic function of the very observation the agent already sees** (it has the `save_value` feature) — so this is **not** a representation/capacity failure and **not** a long-horizon credit failure. The network *could* express v2 with zero long-term reasoning; it never gets there because the *training signal* that would teach it (the noisy episode margin) can't distinguish the ~9% of decisions where deviating pays. It's a **learning-signal** problem, full stop.

**Through-line:** I0 found the problem (signal below noise floor), I1 proved it isn't the reward (shaping the winning policy *in* still yields greedy), I2 proved it isn't the draw-luck variance either and isn't representation (a myopic net over the same features would suffice) — leaving **per-decision credit assignment** as the sole remaining suspect. That is precisely what PPO + GAE(λ) targets, and is the last principled pure-RL lever before the honest conclusion is "the ~0.5% online edge is below the extraction floor of return-based policy gradients on this task."

## F7 — What the converged agent *attends to*: it pruned the save feature (objective, not representation)

Before spending more compute, we opened the black box of the I0 checkpoint to ask: does the
agent's decision *confidence* reveal it weighing the saving alternative (the human "should I
save this multi-team QB?" hesitation)? We probed 50,000 on-policy decisions (57.5% of them
save-relevant) plus a controlled turn-0 sweep over all 32 teams, with three instruments:
per-decision softmax confidence, a **causal ablation** (zero the save inputs and re-decide),
and an **input sweep** (scale the save_value input and watch the logits).

- **The agent is never torn.** Confidence in the greedy pick P(rank 0): mean **0.994**, median
  0.997, and the single most-uncertain decision in 50k is **0.936**. There is no calibrated
  "50/50 on Flacco vs Palmer" state — it is ~99% sure everywhere.
- **Confidence encodes *star-power*, not decision difficulty.** corr(confidence-margin,
  **absolute top-QB yards**) = **+0.48** (partial, controlling gap, +0.50); corr with the
  **gap to #2** = only +0.22, and *negative* once you control for absolute yards
  (partial = **−0.27**). So a near-tie between two big names reads as *high* confidence and a
  clear call between two small names reads as *lower* — the opposite of "confidence = how close
  the call is." (E.g. `cin`/Flacco: gap to Palmer just 1,929 yet 2nd-most-confident in the
  league, purely because Flacco's 48,176 career yards are a big number — the game credits full
  career yards to every team a QB appeared for.)
- **The save signal is causally inert.** Hiding the `save_value` inputs changes P(rank 0) by
  **6e-5** on average (max 8e-4); an *input sweep* cranking save_value from 0 → **20× (417k
  yards)** moves the logit margin only 7.00 → 7.25 — and *upward*, the wrong direction. The
  observational "high save_value → more confident" (regression t=+117) is a pure **confound**:
  save_value correlates **+0.78** with absolute yards, which is what actually drives confidence.
  We handed the agent the winning feature and it learned to **not read it.**
- **Poster child — `sdg`/Brees, turn 0:** the most save-attractive opening in the league. Gap to
  Rivers (#8 all-time) = 16,374, but Brees's save_value = **20,857 > the gap** (saving him for
  the Saints, whose fallback is Derek Carr at 41,245, is worth +39,113 × p_k). **The v2 heuristic
  saves Brees here** (it picks Rivers). The agent is **0.9982 confident grabbing Brees anyway**,
  unmoved by 20× save_value. Where saving matters most, the agent is most blind.
- The CRN model (I2) is even more collapsed: P(rank 0) = **1.0000** everywhere, ablation ~1e-7.

**Interpretation:** an expected-value objective doesn't merely make the *policy* act greedy — it
makes the *network* value-only. With no gradient reward for using the save signal, the trained
weights drive its causal influence to ~zero. This is the sharpest form of the I0–I2 diagnosis:
the blocker is provably the **objective, not the representation** — the information sits in the
input, unused. It also kills the "the agent is considering the risk and declining" reading:
confidence measures magnitude, not difficulty, so it is *not* a usable "is-it-torn" signal.

**Caveats (→ next experiment):** (a) this is the sorted/rank checkpoint (no shuffled candidates
yet — F-obs #1); (b) it is fully converged, so we can't rule out that *transient* save-attention
existed mid-training and was ironed out (F-obs #2) — we saved no intermediate checkpoints. Both
are resolved by retraining with periodic checkpoints and re-running this probe across training
time (which also yields a "time-to-greedy" learning curve). The probe then becomes the
**instrument** for the risk-seeking experiment: same probe, EV vs. risk-seeking objective →
does save_value acquire causal weight? That before/after is the payoff ("the objective
determines what the model learns to look at").

## Methodology note

- One implementation lesson worth reporting: a naive rollout was **worse** than greedy (~5%) due to the optimizer's curse (argmax over noisy Monte-Carlo estimates). **Common random numbers** — scoring every candidate on the same sampled future sequences — fixed it. Guarded by a regression test. (The I2 CRN baseline above is the *same idea* applied to the training signal rather than to rollout candidate scoring.)
