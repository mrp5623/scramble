# Phase 1 - Baselines & Ceiling

Benchmark over **10,000** seeded games (paired: every policy and the optimum see the same 25-team sequence per seed). Score = total career passing yards; higher is better.

## Mean score (95% CI)

| Policy | Mean score | % of optimum |
|---|---|---|
| Greedy | 1,218,941 ± 1,003 | 98.1% |
| Opportunity-cost (v2) | 1,223,759 ± 1,001 | 98.5% |
| Offline optimum (clairvoyant) | 1,242,864 ± 1,004 | 100.0% |

## Paired gaps (95% CI)

| Comparison | Mean gain | % of optimum |
|---|---|---|
| optimum - greedy | 23,923 ± 320 | 1.92% |
| optimum - heuristic | 19,105 ± 279 | 1.54% |
| heuristic - greedy | 4,818 ± 310 | 0.39% |

- Heuristic beats greedy in **48.2%** of games; loses in **33.2%**.
- The heuristic captures **20.1%** of the greedy->optimum gap.

![Score distributions](phase1_scores.png)

![Gap over greedy](phase1_gaps.png)

## Verdict

The `optimum - greedy` gap is the ceiling on any improvement over greedy; `heuristic - greedy` is what a zero-ML policy already captures. Whether Phase 2 (RL) is worthwhile depends on how much gap remains above the heuristic - see the `optimum - heuristic` row.
