# Phase 1 - Online Ceiling (rollout)

Benchmark over **1,000** paired seeded games. Rollout uses a greedy base policy, **60** rollouts per candidate, top-**3** candidates. The rollout is the best-achievable *online* reference (no future knowledge); the offline optimum is clairvoyant and unreachable online.

## Mean score (95% CI)

| Policy | Mean score | % of optimum | % of greedy->optimum gap captured |
|---|---|---|---|
| Greedy | 1,219,885 ± 3,193 | 98.15% | 0% (baseline) |
| Opportunity-cost (v2) | 1,224,422 ± 3,196 | 98.52% | 19.7% |
| Rollout (online) | 1,226,587 ± 3,197 | 98.69% | 29.1% |
| Offline optimum (clairvoyant) | 1,242,876 ± 3,176 | 100.00% | 100% |

- Rollout beats greedy in **61.2%** of games.
- Rollout captures **29.1%** of the clairvoyant greedy->optimum gap; the opportunity-cost heuristic captures **19.7%**.

![Mean score by policy](ceiling_scores.png)

## Verdict

The rollout is a strong stand-in for the best online policy. The share of the gap it captures is the realistic headroom an RL agent could hope for; whatever remains between rollout and the clairvoyant optimum is future knowledge that no online policy can recover. This sets the Phase 2 (RL) target and expectations.
