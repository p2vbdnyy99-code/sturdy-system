# Strategy Failure Analysis — Phase 1 BTCUSDT research

The strategies failed because they have no detectable edge before costs. Retail spot commission then turned
zero expectancy into a large, reliable loss.

Nothing failed because of a backtesting error. The defects found in `QUANT_AUDIT.md` (D1–D3) would have biased results
towards passing, not failing, or did not affect these runs. All numbers below are re-derived from stored records or from
fresh runs using the stored parameters. Nothing was re-optimised.

## 1. What was tested

| Item | Value |
|---|---|
| Plans | 36 (12 Asian-session, 24 New York-session) |
| Families | 5 code families on BTCUSDT spot, long-only |
| Timeframes | M5–H1 |
| Data | 1 year of real Binance data |
| Account | $300 |
| Risk limits | 0.5% per trade |
| Target | net 2R after costs |

Full list and parameters: `QUANT_AUDIT.md`, Appendices A and B.

## 2. Outcome by gate (all 36 failed)

| Gate (threshold) | Candidates failing |
|---|---|
| Parameter stability ≥ 0.6 | 35 |
| Training profit factor ≥ 1.2 | 33 |
| Cost stress: profitable at costs ×1.5 | 32 |
| Out-of-sample expectancy > 0 | 32 |
| Out-of-sample profit factor ≥ 1 | 32 |
| Training expectancy ≥ 0.05R | 31 |
| Monte Carlo P(loss) ≤ 0.20 | 34 (31 too risky, 3 too few trades to run it) |
| Walk-forward: ≥ 50% of folds positive | 25 |
| Training trades ≥ 40 | 17 |
| Training drawdown ≤ 12% | 10 |
| Out-of-sample trades ≥ 15 | 10 |
| No parameter set produced ≥ 20 training trades | 6 |

How badly the candidates failed:

| Gates failed per candidate | Candidates |
|---|---|
| 4 | 1 |
| 5 | 2 |
| 6 | 2 |
| 7 | 2 |
| 8 | 11 |
| 9 | 13 |
| 10 | 3 |
| 11 | 2 |

None was a near miss on one threshold. The closest candidate is covered in §3.

Overall picture:

- **Training:** 5 of 36 had positive expectancy. Median −0.236R.
- **Out-of-sample:** 4 of 36 had positive expectancy. Median −0.382R.
- **Both positive:** none.
- **Parameter grids:** of 846 evaluations, 26 (3.1%) were profitable with at least 20 trades. A real, robust effect
  would be expected to show broad profitable regions of the grid; these grids were almost uniformly unprofitable.

## 3. The closest candidates (not hidden, not promoted)

| Plan | Training | Out-of-sample | Why it failed |
|---|---|---|---|
| `newyork:volatility_expansion:BTCUSDT:M15` | 26 trades, PF 1.62, +0.352R, stability 0.70, Monte Carlo P(loss) 0.09 | 15 trades, PF 0.50, **−0.400R** | Too few training trades; 1 of 4 walk-forward folds positive; out-of-sample negative |
| `newyork:trend_continuation:BTCUSDT:M15` | 29 trades, PF 1.31, +0.167R, stability 0.15 | 25 trades, **−0.191R** | Isolated parameter spike; out-of-sample negative |
| `newyork:trend_continuation:BTCUSDT:H1` | 11 trades, +0.323R | 12 trades, −0.008R | Sample far too small |

The best training result had t ≈ 1.5 on 26 trades. Among 36 plans tested, that is consistent with chance; under the
null, 1.8 plans would reach |t| ≥ 2. The out-of-sample reversal supports the chance interpretation.

## 4. Mechanism 1: no detectable edge before costs

Each plan was re-run with its stored parameters and the cost model set to zero (frictionless). This isolates signal
quality.

**All 36 plans, frictionless:**

| Measure | Result |
|---|---|
| Plans with t ≥ 2 | **0** |
| Plans with t ≥ 1.5 | 4 |
| Plans with t ≤ −2 | 1 (`newyork:liquidity_sweep:M5`) |
| Median expectancy | +0.022R |

**Median expectancy per trade by timeframe:**

| Timeframe | Frictionless | With costs | Cost drag |
|---|---|---|---|
| M5 | +0.070R | −0.448R | −0.46R |
| M15 | +0.025R | −0.298R | −0.28R |
| M30 | +0.024R | −0.234R | −0.20R |
| H1 | +0.009R | −0.130R | −0.11R |

**The 10-plan M15 portfolio** (the −60.6% run, reproduced exactly):

| Measure | Result |
|---|---|
| Mean pre-cost R per trade | **+0.006**, t = 0.12, 95% bootstrap CI [−0.091, +0.104] |
| In-sample | −0.008R (t = −0.13) |
| Out-of-sample | +0.032R (t = 0.39) |
| Random-entry null | +0.002R, 95% range [−0.19, +0.18]; share of null runs ≥ the strategies: **0.42** |
| Win rate needed to break even before costs, given the bracket geometry | 21.5% (median) |
| Win rate achieved | 22.1% |

The random-entry null used 400 simulations with entries at random bars in the same session windows, the same stop and
target distances, and the same conservative intrabar rule.

In plain terms, the entry rules selected trades no better than random entry times with the same stops and targets.

**One weak but consistent pattern, recorded for the plan, not as a finding.** The New York breakout-type plans show
positive frictionless expectancy in both segments at several timeframes:

| Plan | Frictionless n | Frictionless expectancy (t) | Out-of-sample frictionless |
|---|---|---|---|
| `volatility_expansion` M5 | 139 | +0.230R (t 1.83) | +0.295R |
| `prev_session_breakout` M30 | 153 | +0.182R (t 1.60) | +0.281R |
| `prev_session_breakout` H1 | 126 | +0.193R (t 1.60) | +0.443R |
| `momentum_breakout` M15 | 87 | +0.241R (t 1.52) | +0.313R |

These are the same ideas on overlapping data, so they are not independent confirmations. None survives costs: all are
net-negative except `trend_continuation` H1 (+$5.11, 24 trades) and `volatility_expansion` M15 (+$4.29, 41 trades).

The Asian-session plans are negative even before costs (frictionless t from −1.9 to +0.7).

## 5. Mechanism 2: retail commission against short holding periods

| Measure | Value |
|---|---|
| Binance VIP 0 spot commission | 0.100% per side (verified) → 0.20% round trip |
| Median M15 ATR(14) | 0.263% of price; the round trip is **0.76× one M15 ATR** |
| Median stop distance in run #2 | $266 (0.37% of price) |
| Round-trip commission | $154 per BTC = **35% of total risk per unit** |
| Median gross target needed for net 2R | **3.64× the stop distance**, giving the observed ~22% hit rate |
| Notional per trade | Cash-capped spot sizing put about 87% of equity (median) into each trade, so each round trip cost about 0.17–0.2% of equity in fees whatever the setup |

Run #2 portfolio of the 10 M15 plans: 562 trades, −$181.85.

| Component | Amount |
|---|---|
| Commission | **−$168.16** |
| Slippage | −$4.03 |
| Spread | −$0.55 |
| Pre-cost (mid-price) P&L | −$9.10 |

## 6. Mechanism 3 (context): regime

- **Long-only BTC across a −29.7% year:** training −39.5%, out-of-sample +16.5%.
- **Session drift:** BTC's average hourly drift was negative in the Asian (−0.65 bp/h) and New York (−1.67 bp/h)
  windows, but not significantly so (|t| ≤ 1.2).
- **Training selected parameters in a crash:** they were then confirmed in a recovery. That is a regime break, not a
  test of robustness.
- **Pre-cost portfolio vs passive exposure:** realised mid return was +0.020 of notional, against −0.100 that passive
  long exposure over the same holding periods would have produced. This is suggestive at best; the per-trade t-statistic
  is 0.12.

## 7. Factors ruled out as causes

| Candidate cause | Test | Result |
|---|---|---|
| Look-ahead bias | 144 truncation checks on real data | 0 violations |
| Data errors | Gap check; native vs resampled candles | 0 gaps; identical OHLC |
| Conservative intrabar assumption | M5 re-check of exit candles | 0 of 562 trades affected |
| Spread / slippage over-estimation | Realistic spread (1 tick) and 1-tick slippage | −$181.47 vs −$181.85 |
| Paper/backtest mismatch | Real-data replay | 562 / 562 trades matched |
| Over-strict gates hiding a real edge | Frictionless t-stats, random-entry null | No plan reached t = 2; the strategies were indistinguishable from random entry |

## 8. Answer to "strategy quality, frequency, costs, execution, or a combination?"

It was a combination, with a clear order:

1. **No edge.** This is the necessary cause.
2. **Commission.** About 90% of the money lost.
3. **Frequency and full-equity notional.** These multiplied the commission, at roughly 1.5 trades a day each turning
   over about the whole account.
4. **Execution assumptions.** Immaterial.
5. **Regime.** It made training-period selection unrepresentative, but it is not what lost the money.

Reducing frequency alone would have lost money more slowly. It would not have made the strategies profitable, because
their pre-cost expectancy is about zero.
