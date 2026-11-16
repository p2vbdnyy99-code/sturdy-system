# Phase 2 — Independent Quantitative Research Audit

Audit date 2026-11-11 · code version `0.1.0` (commit `80715ff`) · audited data: Binance BTCUSDT spot, 105,119 M5 candles,
2025-11-11 11:05 UTC → 2026-11-11 10:55 UTC (no gaps).

No strategy, parameter, risk limit or stored result was changed during this audit. All re-runs used the stored,
training-selected parameters. Counterfactual runs changed only the **cost model**, and are labelled as such.
Live trading remains disabled.

## Verdict

1. **No look-ahead bias was found.** It was checked on real data for all 36 plans (144 truncation tests, 3,089 signals,
   0 violations).
2. **Three methodological defects were found.** None of them inflated any result, because nothing passed:
   - **D1:** the walk-forward test windows are the same rows as the out-of-sample hold-out.
   - **D2:** the candle loader can silently swap a year of history for 5 days.
   - **D3:** the real-time engine evaluates too short a history window, so one strategy family misses 18.5% of its signals.
3. **The −60.6% loss is overwhelmingly a transaction-cost result acting on strategies with no detectable edge.**
   - Commission was $168.16 of the $181.85 lost.
   - Before costs, expectancy was +0.006R (t = 0.12), statistically indistinguishable from random entries with the same
     stops and targets (p ≈ 0.42).
4. **The paper-trading engine reproduces the backtester on real data.** Replayed bar by bar over the full year, it
   matched 562 of 562 trades, with identical entry prices and exit reasons.
   - Remaining differences: one extra trade (a timing rule) and the health monitor, which exists only in paper and live.
   - The real-time path has two further differences: the indicator window (D3) and quote polling.

Detailed failure analysis: `STRATEGY_FAILURE_ANALYSIS.md`. Data needs: `DATA_REQUIREMENTS.md`. Plan: `PHASE_2_RESEARCH_PLAN.md`.

---

## 1. The 36 strategies tested

All 36 were BTCUSDT spot (long-only, because spot cannot be shorted). Research run #1 requested `symbols=["BTCUSDT"]`
with no engine or timeframe filter. `candidate_plans()` therefore produced:

| Engine | Session window (fixed IST) | BTCUSDT setups | Timeframes | Plans |
|---|---|---|---|---|
| A — Asian | 08:00–12:00 IST | asian_orb, range_expansion, liquidity_sweep, sr_breakout | M5, M15, M30 | 12 |
| C — New York | 18:00–23:00 IST | trend_continuation, momentum_breakout, volatility_expansion, liquidity_sweep, prev_session_breakout, prev_day_breakout | M5, M15, M30, H1 | 24 |
| B — London | 13:00–17:00 IST | — (BTCUSDT is not in Engine B's instrument list) | — | 0 |

These 36 plans use **five code families**: `range_breakout`, `liquidity_sweep`, `momentum_breakout`, `volatility_squeeze`
and `trend_continuation`. The complete per-plan list, with fixed plan parameters, training-selected parameters and grid
sizes, is in **Appendix A**. Family defaults and the grids searched are in **Appendix B**. Both appendices were
generated from the stored research records, not transcribed by hand.

Common to all plans:

| Setting | Value |
|---|---|
| Net reward/risk target (`rr`) | 2.0, net of round-trip costs |
| Maximum hold | 24 h |
| Signals per session-day | at most 1 per direction (`trend_continuation`: 2) |
| Account | USD 300 |
| Risk per trade | 0.5% of equity |
| Other risk limits | 2% daily loss, 2 positions, 3-loss streak |

The plans were not searched over their full parameter space. Each family's grid was 27 combinations (or 9 for
`liquidity_sweep`), giving 846 grid evaluations in total.

## 2. Training, validation and test periods

The split is chronological at 65% of each plan's own bar count. All timeframes are resampled from the same M5 data, so
every plan shares the same split instant.

| Segment | Period (UTC) | Used for |
|---|---|---|
| Training | 2025-11-11 11:00 → 2026-07-06 17:00 (≈ 237 days) | Parameter grid search, training gates, Monte Carlo, cost stress |
| Out-of-sample hold-out | 2026-07-06 17:00 → 2026-11-11 10:55 (≈ 128 days) | Final confirmation gates |
| Walk-forward fold 1 | train 2025-11-11 → 2026-07-06 · test 2026-07-06 → 2026-08-07 | Walk-forward gate |
| Walk-forward fold 2 | train 2025-12-13 → 2026-08-07 · test 2026-08-07 → 2026-09-08 | 〃 |
| Walk-forward fold 3 | train 2026-01-14 → 2026-09-08 · test 2026-09-08 → 2026-10-10 | 〃 |
| Walk-forward fold 4 | train 2026-02-15 → 2026-10-10 · test 2026-10-10 → 2026-11-11 | 〃 |

Bar-exact boundaries for each timeframe:

| TF | Bars | Split instant | Walk-forward test starts |
|---|---|---|---|
| M5 | 105,119 | 2026-07-06 17:00 | 07-06 17:20, 08-07 15:45, 09-08 14:10, 10-10 12:35 |
| M15 | 35,040 | 2026-07-06 17:00 | 07-06 17:00, 08-07 15:30, 09-08 14:00, 10-10 12:30 |
| M30 | 17,520 | 2026-07-06 17:00 | 07-06 17:00, 08-07 15:30, 09-08 14:00, 10-10 12:30 |
| H1 | 8,760 | 2026-07-06 17:00 | 07-06 19:00, 08-07 17:00, 09-08 15:00, 10-10 13:00 |

**These were not three independent periods.** The four walk-forward test windows exactly tile the out-of-sample
hold-out (see D1).

### Market regime per period

Measured from the data; the statistics are open-to-close.

| Period | BTC return | Annualised volatility | Maximum drawdown |
|---|---|---|---|
| Training | **−39.5%** | 46.9% | 44.6% |
| Out-of-sample | **+16.5%** | 34.6% | 16.4% |
| Walk-forward fold 1 | +0.9% | — | — |
| Walk-forward fold 2 | +23.0% | — | — |
| Walk-forward fold 3 | +4.2% | — | — |
| Walk-forward fold 4 | −10.6% | — | — |

Every candidate was long-only, and selection was made in a bear market and confirmed in a recovery. One year contains a
single regime transition. This is too little to separate strategy behaviour from regime.

## 3. Bias and error verification

### 3.1 Look-ahead bias — none found

| Check | Method | Result |
|---|---|---|
| Signal causality, real data | All 36 plans with stored parameters on real BTCUSDT; signals recomputed on history truncated at 35/65/90/99.9% and compared bar by bar (beyond the 400-bar warm-up) | **144 checks, 3,089 signals, 0 differences** |
| Signal causality, unit tests | `tests/test_core.py::test_no_lookahead…` (synthetic EURUSD, USDJPY, AUDUSD) | Pass |
| Higher-timeframe alignment | `mtf.align_htf` joins each bar to the last HTF bar whose **close** is ≤ the bar's close; covered by a unit test | Correct |
| Swing points | Published only after `k` confirming bars (`structure.swings`) | Correct |
| Session / opening ranges | Range values exist only once the window has closed (`range_ready`) | Correct |
| Fill timing | Signal at candle *i* close, filled at candle *i+1* open (`backtest.py:90,124`) | Correct |
| Same-candle stop and target | Stop assumed first (`execution.py:56–71`). Checked on M5: **0 of 562 trades** had an exit candle touching both, so this assumption cost nothing here | Conservative; no effect |
| Gaps through a stop | Filled at the worse open, not at the stop (`execution.py:64`) | Conservative |
| Target fills | Filled at the target, never better | Conservative |
| Resampled vs native candles | Binance native M15 klines vs M15 resampled from M5, 498 overlapping bars: OHLC identical, volume equal to 2e-16 | Identical |

### 3.2 Data leakage — two defects, plus a contaminated in-sample label

**D1 — High. The walk-forward gate consumes the out-of-sample hold-out.**
`walk_forward()` (`validation.py:139–146`) sets `test_len = n·0.35/4` and `train_len = n − 4·test_len`. Its four test
windows are therefore exactly the final 35% of rows: the same rows `research_plan()` later calls "out-of-sample"
(`validation.py:211–215`).

- The walk-forward result feeds `selected_on_training`, which is mislabelled.
- The "single, untouched" out-of-sample confirmation is not untouched.
- Parameter *selection* itself used training rows only. This is verified by code and by a test, and an instrumented run
  confirmed no training call saw a row at or after the split.
- No candidate passed, so D1 created no false positive. It would bias any future pass.

**In-sample contamination of backtest run #2.** The −60.6% portfolio backtest (`jobs.run_backtest_job`, `jobs.py:83`)
used the **research-selected parameters**. Those were chosen on 2025-11-11 → 2026-07-06, and run #2's in-sample segment
ends at 2026-07-06 16:50. Its in-sample figures (−$141.24) are therefore optimised-on-themselves, and it still lost.
Only the out-of-sample segment of run #2 (−$40.62, 192 trades) is a clean test.

### 3.3 Survivorship and selection bias

| Bias | Assessment |
|---|---|
| Survivorship | Not applicable. One instrument that has traded continuously; no universe was selected, so no delisted assets are missing. |
| Instrument selection | BTCUSDT was tested because it was the only real data obtainable without an MT5 terminal. It was not chosen on performance. |
| Multiple testing | 36 plans and 846 parameter evaluations, with no correction (no deflated Sharpe, no reality check). Moot here, because no frictionless plan reached t ≥ 2 (§6 of the failure analysis). Under the null, about 1.8 of 36 would reach \|t\| ≥ 2 by chance. |
| Venue | Binance spot only. Results are not consolidated across venues. |

### 3.4 Other defects and modelling issues found

| ID | Severity | Finding | Evidence | Effect on reported results |
|---|---|---|---|---|
| **D2** | **High** (data integrity) | `store.load()` returns stored rows for the requested timeframe whenever **any** exist, and only otherwise resamples (`store.py:117–123`). The Phase 1 live-loop test stored 499 native M15 rows under source `binance`. From now on, every BTCUSDT M15 backtest or research run silently uses **5 days (2026-11-06 → 11-11) instead of a year**. | `store.load(...,"M15","binance")` now returns 499 rows (verified) | None on runs #1 and #2, which ran before the rows were written. **Any new M15 run is invalid until fixed.** |
| **D3** | **Medium** | The real-time loop evaluates strategies on the last **1,500** candles (`runner.py:154`). That leaves 93 H4 bars for an EMA50 and 375 H1 bars for an EMA200, which have not converged: EMA50 (H4) differed by $31 at a sample bar and flipped the trend filter. | Real data: `trend_continuation` M15 missed **5 of 27 (18.5%)** out-of-sample signals; 0 spurious signals in a 2,880-bar scan; 0 mismatches for the other nine M15 plans | Paper-trading results would diverge from the backtest for this family |
| D4 | Medium | Inert grid dimensions. For `range_breakout` with `range_source` set to `london` or `prev_day`, `range_minutes` has no effect, so 27 grid combinations are 9 distinct ones, each repeated 3×. This biases the "parameter stability" share and the neighbour-based plateau score. | Affects all 8 `prev_session_breakout` / `prev_day_breakout` plans (stored params even contain an unused `range_minutes`) | All 8 failed many other gates; no verdict changes |
| D5 | Medium | Monte Carlo resamples trade R values i.i.d. (no block bootstrap). Serial dependence and regime clustering are destroyed, so tail drawdowns are understated. It runs on training trades only and compounds at the nominal 0.5% while realised risk differed (see D7). | `validation.py:105–122` | Its loss probability was 0.73–1.00 for the failing plans anyway |
| D6 | Medium | **Statistical power.** The gates require 40 training trades, but the session window and the one-signal-per-day cap make 17 of 36 plans unable to reach 40 in 237 days. Separately, detecting a +0.2R edge at t = 2 with the observed R standard deviation of about 1.17 needs about **137 trades**. | Per-plan training counts: 4–153 | Not wrong, but most candidates were untestable on 1 year of data |
| D7 | Low (design) | Spot sizing is capped by cash. With $300 and a median stop of 0.37% of price, the 0.5% risk budget asks for about 135% of equity in notional. It is capped to cash: **42% of trades used more than 95% of equity in notional**, and 30% risked less than 0.45%. Each round trip therefore costs about 0.2% of equity in commission. | Run #2 trades | The main mechanism of the cost drag (failure analysis §4) |
| D8 | Low | Reporting: the backtest "Costs paid" / `total_costs` field is commission + spread and **omits slippage** ($4.03 in run #2). Rejection counters are multi-label: the 302 `DUPLICATE_SYMBOL` in run #2 are mostly "this plan is still in its own trade" (`backtest.py:133`), and `MIN_NOTIONAL` co-occurs with them. | `metrics.py:64`; run #2 | Cosmetic, but misleading in the UI |
| D9 | Low | Backtest equity is closed-trade only, so drawdown excludes intra-trade excursions (MAE is recorded per trade). | `backtest.py` | Drawdown is slightly understated |
| D10 | Low | When the 24 h time-exit happens at a bar's open, the backtester blocks a new entry on that same bar; the paper engine allows it. | 1 extra trade in the real-data replay | 1 trade in 563 |
| D11 | Low | BTCUSDT cost inputs: 0.100%/side commission is the **verified** Binance VIP 0 rate. The $0.50 spread and $2 slippage are unmeasured assumptions, but they are immaterial: setting spread to $0.01 and slippage to 1 tick moved run #2 from −$181.85 to −$181.47. | binance.com fee schedule (read 2026-11-11) | None |
| D12 | Housekeeping | Phase 1 left state behind: the paper replay's health monitor marked `asia:asian_orb:BTCUSDT:M15` and `asia:liquidity_sweep:BTCUSDT:M15` as `needs_revalidation`, and `asia:range_expansion:BTCUSDT:M15` (failed validation) is still `enabled` on the paper account. | `strategy_configs` table | Not changed by this audit, as instructed |

## 4. Walk-forward and Monte Carlo methodology, as implemented

**Parameter selection** (`select_parameters`, `validation.py:78–103`):

1. Every grid combination is backtested on training rows only.
2. Each combination is scored as `min(own expectancy, mean expectancy of its one-step neighbours)`, so an isolated spike
   cannot win. Combinations with fewer than 20 trades are excluded.
3. "Parameter stability" is the share of the grid with expectancy > 0, profit factor > 1 and at least 20 trades.

**Walk-forward** (`walk_forward`, `validation.py:134–166`):

1. Four rolling folds, each with a training window of 65% of rows (≈ 237 days) and a test window of 8.75% (≈ 32 days).
2. Within each fold, parameters are re-selected on that fold's training window, with a minimum of 10 trades.
3. Each fold is then scored on the next unseen window. A 600-bar warm-up precedes the test window; trades entered inside
   the warm-up are discarded.
4. Gate: at least 50% of folds with positive test expectancy.
5. A walk-forward "efficiency" (out-of-sample expectancy divided by mean in-sample expectancy) is reported but not gated.
6. Defect: the test windows coincide with the hold-out (D1).

**Monte Carlo** (`monte_carlo`, `validation.py:105–122`):

1. Draw 2,000 paths, each resampling the training-trade R values i.i.d. with replacement, to the same length as the
   training set.
2. Compound each path at 0.5% risk per trade.
3. Report the 5/50/95th percentiles of final return, the 50/95th percentiles of maximum drawdown, and P(final return < 0).
4. Gate: P(loss) ≤ 0.20. Not computed below 10 trades.
5. Limitations: D5.

**Cost stress**: the plan is re-run on training data with all costs ×1.0, ×1.5 and ×2.0. Gate: expectancy must stay
positive at ×1.5.

**Final out-of-sample confirmation**:

1. Selected parameters are run once on the hold-out (with warm-up).
2. Gates: at least 15 trades, expectancy > 0, profit factor ≥ 1.
3. The result never feeds back into selection.

**All gates** (`SelectionCriteria`, `validation.py:25–38`):

| Gate | Threshold |
|---|---|
| Training trades | ≥ 40 |
| Training profit factor | ≥ 1.2 |
| Training expectancy | ≥ 0.05R |
| Training drawdown | ≤ 12% |
| Parameter stability | ≥ 0.6 |
| Monte Carlo P(loss) | ≤ 0.20 |
| Cost stress | profitable at ×1.5 |
| Walk-forward | ≥ 50% of folds positive |
| Out-of-sample trades | ≥ 15 |
| Out-of-sample expectancy | > 0 |
| Out-of-sample profit factor | ≥ 1.0 |

## 5. Transaction-cost model

Applied identically in the backtest, paper and live (`app/core/execution.py`). Candles are treated as mid prices.

| Component | BTCUSDT spot | How it enters P&L | Source / status | Run #2 total |
|---|---|---|---|---|
| Commission | 0.100% of notional per side (taker) | Deducted from P&L at entry and exit; also included in risk-per-unit sizing and in the net-2R target | **Verified**: Binance VIP 0 spot fee is 0.100% maker / 0.100% taker, 0.075% when paid in BNB (binance.com fee schedule, read 2026-11-11) | **$168.16** |
| Spread | $0.50 constant (½ on each side) | Buys fill at mid + ½ spread, sells at mid − ½ spread; stops and targets are tested on the bid (longs) | Assumption, unmeasured. Binance publishes no historical spot quote archive (see DATA_REQUIREMENTS) | $0.55 |
| Slippage | 200 ticks × $0.01 = $2 per fill | Added adversely at entry and on stop / time exits; targets get none | Assumption, unmeasured | $4.03 |
| Funding | 0 (spot) | — | Correct for spot. Perpetuals (`BTCUSDT.P`) use 0.01% per 8 h (placeholder) | $0 |
| Swap / rollover | 0 (spot) | — | Correct for spot. CFDs use per-lot nightly swaps, triple on Wednesday at the 17:00 New York rollover; **all CFD swap values are placeholders** until synced from a broker | $0 |
| Liquidity cap | 5% of bar volume | Caps volume (partial fill) | Never binding for BTCUSDT at $300 | — |
| **Total** | | | | **$172.74** (UI shows $168.71 because it omits slippage: D8) |

For the other instruments the defaults are typical retail values, flagged `verified=False`. The live gate refuses them
until they are synced from a broker. They have not been used in any test on real data.

Structural fact: a 0.20% round trip equals **0.76× the median M15 ATR(14)** of BTCUSDT (0.263% of price), and 0.35× the
median H1 ATR. At the median stop of $266, round-trip commission was **35% of the risk per unit**. To make the target net
2R, the gross target moved to a median **3.64× the stop distance**. The cost model is not wrong; it is what makes
intraday BTC spot at retail fees structurally hard.

## 6. Why the 36 failed (summary; full analysis in `STRATEGY_FAILURE_ANALYSIS.md`)

- **0 of 36 passed. 0 of 36 had positive expectancy in both training and out-of-sample.**
  - 5 had positive training expectancy; 4 had positive out-of-sample expectancy.
  - Median training expectancy was −0.236R; median out-of-sample −0.382R.
- Of the 846 grid evaluations, 26 (3.1%) were profitable with at least 20 trades.
- Gate failures across the 36 candidates:

  | Gate | Failed |
  |---|---|
  | Parameter stability | 35 |
  | Training profit factor | 33 |
  | Cost stress ×1.5 | 32 |
  | Out-of-sample expectancy | 32 |
  | Out-of-sample profit factor | 32 |
  | Training expectancy | 31 |
  | Monte Carlo | 34 (31 too risky, 3 too few trades to run) |
  | Walk-forward | 25 |
  | Training trade count | 17 |
  | Training drawdown | 10 |
  | Out-of-sample trade count | 10 |

- **Root cause.** Without costs, the median plan's expectancy was +0.022R, and no plan reached t ≥ 2 (best t = 1.83).
  Costs subtracted a median 0.46R per trade on M5, 0.28R on M15, 0.20R on M30 and 0.11R on H1.

## 7. Attribution of the −60.6% loss

The loss is a combination, in this order of weight:

| Factor | Weight | Evidence |
|---|---|---|
| Transaction costs (commission) | **Primary: ~90%** | Commission $168.16 of $181.85 (92.5%). Same signals with commission = 0: −10.4%; with no frictions: −6.8% (re-sizing and re-targeting change the trade set, so the effect is not exactly additive) |
| Strategy quality | **Necessary cause: no edge** | Pre-cost mean +0.006R per trade, t = 0.12, 95% CI [−0.091, +0.104]. Random entries with identical stop/target geometry in the same session windows: null mean +0.002R, p ≈ 0.42. With zero edge, any cost guarantees a loss |
| Trading frequency and position size | **Multiplier** | 1.54 trades/day at about 87% of equity notional each: about 0.2% of equity in fees per trade, so about 0.3%/day of fee drag. Frequency did not cause the loss; it scaled the cost of having no edge |
| Execution assumptions | **Negligible** | Realistic spread and slippage: −$181.47 vs −$181.85. Conservative same-candle rule: 0 affected trades |
| Market regime | **Contributing context** | Long-only during a −29.7% year. Pre-cost results nonetheless beat passive drift exposure: realised mid return summed over trades was +0.020 of notional vs −0.100 expected from drift |

Commission-rate sensitivity, same signals and parameters (only the 0.100% rate is available to a VIP 0 account):

| Commission per side | Net | Return | Profit factor | Expectancy | Max drawdown |
|---|---|---|---|---|---|
| 0.100% (actual VIP 0) | −$181.85 | −60.6% | 0.51 | −0.377R | 60.8% |
| 0.075% (BNB discount) | −$160.07 | −53.4% | 0.58 | −0.315R | 54.1% |
| 0.020% (hypothetical; not a VIP 0 rate) | −$78.41 | −26.1% | 0.81 | −0.150R | 27.5% |
| 0 | −$31.34 | −10.4% | 0.92 | −0.037R | 14.7% |
| 0, plus no spread or slippage | −$20.54 | −6.8% | 0.95 | −0.011R | 13.6% |

## 8. Paper-trading engine vs backtesting engine

**Shared code (by construction):**

- signal generation (`Strategy.generate`)
- position sizing (`RiskEngine.evaluate`)
- stop and target construction (`execution.plan_trade`)
- intrabar exits on bars (`execution.exit_on_bar`)
- commission and financing (`execution.commission_usd`, `financing_usd`)

**Empirical verification on real data.** The paper engine (`jobs.run_replay` → `TradingService`) was run on the full
year of real BTCUSDT M15, with the same 10 M15 plans, the same stored parameters and $300. It ran in an isolated
in-memory database; the main database was untouched.

| Measure | Health monitor off | Health monitor on (as shipped) |
|---|---|---|
| Paper trades / backtest trades | 563 / 562 | 148 / 562 |
| Matched (same plan and entry time) | **562 / 562** | 107 |
| Same exit reason when matched | 562 / 562 | 107 / 107 |
| Maximum entry-price difference | **0.0** | 0.0 |
| Maximum volume difference | 0.00001 BTC (1 step) | 0.00145 BTC |
| Maximum per-trade P&L difference | $0.012 | $0.94 |
| Net | **−$182.14 vs −$181.85** | −$59.92 vs −$181.85 |

- **With the health monitor off**, every difference traces to a single extra paper trade (D10, 2026-04-04 03:15 UTC,
  −$0.54). Every later volume difference is that $0.54 propagating through equity-based sizing.
- **With it on**, the monitor suspended 9 of 10 strategies, between December 2025 and April 2026 for most, after
  7-loss streaks or rolling profit factor < 0.7. That is why the paper engine lost only $60. It is a stop-trading
  control acting on edgeless strategies, not evidence of an edge.

Stops, targets, sizing and costs therefore **match**. The differences that remain are listed in §9.

## 9. Discrepancies between historical backtesting and real-time paper trading

| # | Difference | Where | Size / evidence | Direction |
|---|---|---|---|---|
| 1 | **Indicator window**: real time uses the last 1,500 candles; the backtest uses the full history (D3) | `runner.py:154` | 18.5% of `trend_continuation` signals missed | Fewer trades in real time |
| 2 | **Health monitor** suspends strategies in paper and live, not in the backtest | `trading.py:421–436` | 148 vs 562 trades on the replay | Real time trades much less after a losing streak |
| 3 | **Exit detection**: the backtest sees every candle high/low; real-time paper polls a quote every `ATP_TRADING_LOOP_SECONDS` (5 s) and checks stop/target only on the polled bid/ask (`exit_on_quote`) | `trading.py:158–192` | Not measured (needs a real-time run). Wicks between polls are missed in both directions; stop fills land at the polled price minus slippage | Unknown sign; adds noise |
| 4 | **Entry price**: backtest = next bar open ± constant spread + slippage; real time = live quote at loop time after the candle close, with the real spread | `trading.py` `execute_signal` | Seconds of delay, real spread (BTCUSDT about $0.01) | Small |
| 5 | **Equity basis**: real time sizes and checks the daily-loss limit on marked equity (balance + floating P&L); the backtest uses closed-trade equity | `trading.py:117–119` vs `backtest.py:105` | Did not occur in the replay (one BTC position at a time); matters with multi-symbol portfolios | Mixed |
| 6 | **Time exit on the bar open**: the backtest blocks re-entry on that bar (D10) | `backtest.py:133` | 1 trade per year | Negligible |
| 7 | **Stale-data gate**: real time rejects quotes older than 90 s; the backtest has no such check | `runner.py:93` | — | Real time trades less during outages |
| 8 | **Restart behaviour**: after a restart the first candle is not traded and missed candles are not replayed | `runner.py:150–152` | — | Real time trades less |
| 9 | **Liquidity cap**: the backtest caps volume at 5% of bar volume; paper has no cap | `backtest.py:145` | Not binding for BTCUSDT at $300 | — |
| 10 | **Candle source**: real time uses native Binance M15; the backtest uses M15 resampled from M5 | — | Identical (498 bars checked) | None |

Items 3, 4 and 7 can only be measured by running the real-time loop for weeks; replay cannot test them. Item 1 is a
defect to fix before any forward test.

## 10. Reproducibility

All audit scripts and raw outputs were kept outside the repository in the session scratchpad:

| Script | Purpose |
|---|---|
| `repro.py` | Exact reproduction of run #2 and cost decomposition |
| `null_cf.py` | Significance test, random-entry null, cost counterfactuals |
| `lookahead_real.py` | Real-data causality and window checks |
| `intrabar.py` | Same-candle ambiguity and window-miss rate |
| `replay_cmp.py` | Paper vs backtest comparison |
| `per_plan.py` | Per-plan frictionless vs costed results |

Run #2 was reproduced **trade-for-trade** (562 trades, −$181.8513) from the stored data and parameters, so the
evidence base is reproducible.

---

# Appendices (generated from the stored research run #1 records)
## Appendix A — The 36 candidates, parameters and session assignment

| # | Plan id | Engine / session window | Strategy family (code) | TF | Fixed plan params | Training-selected params | Grid size |
|---|---|---|---|---|---|---|---|
| 1 | `asia:asian_orb:BTCUSDT:M5` | asia / 08:00–12:00 IST | range_breakout | M5 | `{"range_source": "opening", "range_minutes": 60}` | `{"sl_atr": 2.0, "buffer_atr": 0.0, "range_minutes": 30}` | 27 |
| 2 | `asia:asian_orb:BTCUSDT:M15` | asia / 08:00–12:00 IST | range_breakout | M15 | `{"range_source": "opening", "range_minutes": 60}` | `{"sl_atr": 2.0, "buffer_atr": 0.1, "range_minutes": 30}` | 27 |
| 3 | `asia:asian_orb:BTCUSDT:M30` | asia / 08:00–12:00 IST | range_breakout | M30 | `{"range_source": "opening", "range_minutes": 60}` | `{"sl_atr": 2.0, "buffer_atr": 0.0, "range_minutes": 90}` | 27 |
| 4 | `asia:liquidity_sweep:BTCUSDT:M5` | asia / 08:00–12:00 IST | liquidity_sweep | M5 | `{"range_source": "opening", "range_minutes": 90}` | `{"wick_atr": 0.5, "buffer_atr": 0.15}` | 9 |
| 5 | `asia:liquidity_sweep:BTCUSDT:M15` | asia / 08:00–12:00 IST | liquidity_sweep | M15 | `{"range_source": "opening", "range_minutes": 90}` | `{"wick_atr": 0.3, "buffer_atr": 0.1}` | 9 |
| 6 | `asia:liquidity_sweep:BTCUSDT:M30` | asia / 08:00–12:00 IST | liquidity_sweep | M30 | `{"range_source": "opening", "range_minutes": 90}` | `{"wick_atr": 0.5, "buffer_atr": 0.1}` | 9 |
| 7 | `asia:range_expansion:BTCUSDT:M5` | asia / 08:00–12:00 IST | volatility_squeeze | M5 | `{}` | `{"recent": 5, "sl_atr": 2.0, "squeeze_pct": 0.3}` | 27 |
| 8 | `asia:range_expansion:BTCUSDT:M15` | asia / 08:00–12:00 IST | volatility_squeeze | M15 | `{}` | `none found → defaults` | 27 |
| 9 | `asia:range_expansion:BTCUSDT:M30` | asia / 08:00–12:00 IST | volatility_squeeze | M30 | `{}` | `none found → defaults` | 27 |
| 10 | `asia:sr_breakout:BTCUSDT:M5` | asia / 08:00–12:00 IST | momentum_breakout | M5 | `{"lookback": 48}` | `{"sl_atr": 1.5, "adx_min": 25, "lookback": 96}` | 27 |
| 11 | `asia:sr_breakout:BTCUSDT:M15` | asia / 08:00–12:00 IST | momentum_breakout | M15 | `{"lookback": 48}` | `{"sl_atr": 2.0, "adx_min": 15, "lookback": 24}` | 27 |
| 12 | `asia:sr_breakout:BTCUSDT:M30` | asia / 08:00–12:00 IST | momentum_breakout | M30 | `{"lookback": 48}` | `{"sl_atr": 2.0, "adx_min": 15, "lookback": 24}` | 27 |
| 13 | `newyork:liquidity_sweep:BTCUSDT:M5` | newyork / 18:00–23:00 IST | liquidity_sweep | M5 | `{"range_source": "london"}` | `{"wick_atr": 0.3, "buffer_atr": 0.3}` | 9 |
| 14 | `newyork:liquidity_sweep:BTCUSDT:M15` | newyork / 18:00–23:00 IST | liquidity_sweep | M15 | `{"range_source": "london"}` | `{"wick_atr": 0.5, "buffer_atr": 0.3}` | 9 |
| 15 | `newyork:liquidity_sweep:BTCUSDT:M30` | newyork / 18:00–23:00 IST | liquidity_sweep | M30 | `{"range_source": "london"}` | `{"wick_atr": 0.5, "buffer_atr": 0.3}` | 9 |
| 16 | `newyork:liquidity_sweep:BTCUSDT:H1` | newyork / 18:00–23:00 IST | liquidity_sweep | H1 | `{"range_source": "london"}` | `{"wick_atr": 0.2, "buffer_atr": 0.3}` | 9 |
| 17 | `newyork:momentum_breakout:BTCUSDT:M5` | newyork / 18:00–23:00 IST | momentum_breakout | M5 | `{"lookback": 48}` | `{"sl_atr": 2.0, "adx_min": 25, "lookback": 24}` | 27 |
| 18 | `newyork:momentum_breakout:BTCUSDT:M15` | newyork / 18:00–23:00 IST | momentum_breakout | M15 | `{"lookback": 48}` | `{"sl_atr": 1.5, "adx_min": 15, "lookback": 96}` | 27 |
| 19 | `newyork:momentum_breakout:BTCUSDT:M30` | newyork / 18:00–23:00 IST | momentum_breakout | M30 | `{"lookback": 48}` | `{"sl_atr": 2.0, "adx_min": 15, "lookback": 24}` | 27 |
| 20 | `newyork:momentum_breakout:BTCUSDT:H1` | newyork / 18:00–23:00 IST | momentum_breakout | H1 | `{"lookback": 48}` | `{"sl_atr": 2.0, "adx_min": 15, "lookback": 24}` | 27 |
| 21 | `newyork:prev_day_breakout:BTCUSDT:M5` | newyork / 18:00–23:00 IST | range_breakout | M5 | `{"range_source": "prev_day"}` | `none found → defaults` | 27 |
| 22 | `newyork:prev_day_breakout:BTCUSDT:M15` | newyork / 18:00–23:00 IST | range_breakout | M15 | `{"range_source": "prev_day"}` | `none found → defaults` | 27 |
| 23 | `newyork:prev_day_breakout:BTCUSDT:M30` | newyork / 18:00–23:00 IST | range_breakout | M30 | `{"range_source": "prev_day"}` | `{"sl_atr": 1.5, "buffer_atr": 0.1, "range_minutes": 60}` | 27 |
| 24 | `newyork:prev_day_breakout:BTCUSDT:H1` | newyork / 18:00–23:00 IST | range_breakout | H1 | `{"range_source": "prev_day"}` | `{"sl_atr": 2.0, "buffer_atr": 0.25, "range_minutes": 60}` | 27 |
| 25 | `newyork:prev_session_breakout:BTCUSDT:M5` | newyork / 18:00–23:00 IST | range_breakout | M5 | `{"range_source": "london"}` | `{"sl_atr": 2.0, "buffer_atr": 0.25, "range_minutes": 60}` | 27 |
| 26 | `newyork:prev_session_breakout:BTCUSDT:M15` | newyork / 18:00–23:00 IST | range_breakout | M15 | `{"range_source": "london"}` | `{"sl_atr": 2.0, "buffer_atr": 0.1, "range_minutes": 60}` | 27 |
| 27 | `newyork:prev_session_breakout:BTCUSDT:M30` | newyork / 18:00–23:00 IST | range_breakout | M30 | `{"range_source": "london"}` | `{"sl_atr": 2.0, "buffer_atr": 0.25, "range_minutes": 60}` | 27 |
| 28 | `newyork:prev_session_breakout:BTCUSDT:H1` | newyork / 18:00–23:00 IST | range_breakout | H1 | `{"range_source": "london"}` | `{"sl_atr": 2.0, "buffer_atr": 0.25, "range_minutes": 60}` | 27 |
| 29 | `newyork:trend_continuation:BTCUSDT:M5` | newyork / 18:00–23:00 IST | trend_continuation | M5 | `{}` | `{"adx_min": 25, "swing_bars": 16, "pullback_bars": 6}` | 27 |
| 30 | `newyork:trend_continuation:BTCUSDT:M15` | newyork / 18:00–23:00 IST | trend_continuation | M15 | `{}` | `{"adx_min": 20, "swing_bars": 6, "pullback_bars": 10}` | 27 |
| 31 | `newyork:trend_continuation:BTCUSDT:M30` | newyork / 18:00–23:00 IST | trend_continuation | M30 | `{}` | `{"adx_min": 15, "swing_bars": 16, "pullback_bars": 4}` | 27 |
| 32 | `newyork:trend_continuation:BTCUSDT:H1` | newyork / 18:00–23:00 IST | trend_continuation | H1 | `{}` | `none found → defaults` | 27 |
| 33 | `newyork:volatility_expansion:BTCUSDT:M5` | newyork / 18:00–23:00 IST | volatility_squeeze | M5 | `{}` | `{"recent": 12, "sl_atr": 2.0, "squeeze_pct": 0.3}` | 27 |
| 34 | `newyork:volatility_expansion:BTCUSDT:M15` | newyork / 18:00–23:00 IST | volatility_squeeze | M15 | `{}` | `{"recent": 5, "sl_atr": 2.0, "squeeze_pct": 0.15}` | 27 |
| 35 | `newyork:volatility_expansion:BTCUSDT:M30` | newyork / 18:00–23:00 IST | volatility_squeeze | M30 | `{}` | `{"recent": 12, "sl_atr": 1.0, "squeeze_pct": 0.3}` | 27 |
| 36 | `newyork:volatility_expansion:BTCUSDT:H1` | newyork / 18:00–23:00 IST | volatility_squeeze | H1 | `{}` | `none found → defaults` | 27 |

## Appendix B — Strategy family defaults and the parameter grid searched (from `app/core/strategies/library.py`)

| Family | Default parameters | Grid searched on training data | Indicators |
|---|---|---|---|
| liquidity_sweep | `{"range_source": "asia", "range_minutes": 60, "wick_atr": 0.3, "buffer_atr": 0.15, "rr": 2.0, "use_equal_levels": false}` | `{"wick_atr": [0.2, 0.3, 0.5], "buffer_atr": [0.1, 0.15, 0.3]}` | ATR, session range, equal highs/lows, sweep detection |
| momentum_breakout | `{"lookback": 48, "adx_min": 20, "sl_atr": 1.5, "rr": 2.0}` | `{"lookback": [24, 48, 96], "adx_min": [15, 20, 25], "sl_atr": [1.0, 1.5, 2.0]}` | N-bar high/low, MACD histogram, ADX, ATR |
| range_breakout | `{"range_source": "opening", "range_minutes": 60, "buffer_atr": 0.1, "rr": 2.0, "sl_atr": 1.5, "max_range_atr": 6.0, "roc_n": 5, "min_relvol": 0.0}` | `{"range_minutes": [30, 60, 90], "buffer_atr": [0.0, 0.1, 0.25], "sl_atr": [1.0, 1.5, 2.0]}` | ATR, ROC, session range, relative volume (only where volume is real) |
| trend_continuation | `{"htf": "H1", "htf2": "H4", "adx_min": 20, "pullback_bars": 6, "swing_bars": 10, "buffer_atr": 0.2, "rr": 2.0, "cooldown": 12, "max_per_day": 2}` | `{"adx_min": [15, 20, 25], "pullback_bars": [4, 6, 10], "swing_bars": [6, 10, 16]}` | EMA 9/20 (entry TF), EMA 50/200 + ADX (higher TF), RSI, ATR |
| volatility_squeeze | `{"bb_n": 20, "squeeze_pct": 0.2, "lookback": 120, "recent": 8, "expansion": 1.0, "sl_atr": 1.5, "rr": 2.0}` | `{"squeeze_pct": [0.15, 0.2, 0.3], "recent": [5, 8, 12], "sl_atr": [1.0, 1.5, 2.0]}` | Bollinger Bands, band-width percentile, ATR expansion |

## Appendix C — Results and gate outcomes for every candidate

Train = 2025-11-11 → 2026-07-06 17:00 UTC (65%). OOS = 2026-07-06 17:00 UTC → 2026-11-11 (35%). R = net P&L ÷ risk incl. costs.

| # | Plan id | Train n | Train win | Train PF | Train exp R | Train DD % | Stab. | MC P(loss) | Cost ×1/×1.5/×2 exp R | WF +folds | WF OOS n / exp R | OOS n | OOS PF | OOS exp R | Gates failed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `asia:asian_orb:BTCUSDT:M5` | 153 | 0.16 | 0.35 | -0.540 | 29.4 | 0.00 | 1.00 | -0.540/-0.561/-0.660 | 0.00 | 68 / -0.735 | 83 | 0.28 | -0.675 | 9 |
| 2 | `asia:asian_orb:BTCUSDT:M15` | 125 | 0.18 | 0.40 | -0.486 | 24.0 | 0.00 | 1.00 | -0.486/-0.583/-0.704 | 0.00 | 61 / -0.641 | 69 | 0.42 | -0.538 | 9 |
| 3 | `asia:asian_orb:BTCUSDT:M30` | 71 | 0.20 | 0.46 | -0.417 | 14.3 | 0.00 | 1.00 | -0.417/-0.605/-0.759 | 0.00 | 51 / -0.441 | 52 | 0.51 | -0.405 | 9 |
| 4 | `asia:liquidity_sweep:BTCUSDT:M5` | 67 | 0.19 | 0.50 | -0.418 | 10.2 | 0.00 | 1.00 | -0.418/-0.597/-0.687 | 0.00 | 30 / -0.700 | 30 | 0.29 | -0.700 | 8 |
| 5 | `asia:liquidity_sweep:BTCUSDT:M15` | 65 | 0.15 | 0.37 | -0.538 | 14.7 | 0.00 | 1.00 | -0.538/-0.655/-0.705 | 0.00 | 36 / -0.464 | 36 | 0.47 | -0.464 | 9 |
| 6 | `asia:liquidity_sweep:BTCUSDT:M30` | 20 | 0.30 | 0.79 | -0.168 | 4.0 | 0.00 | 0.75 | -0.168/-0.321/-0.475 | 0.00 | 14 / -0.357 | 14 | 0.58 | -0.357 | 10 |
| 7 | `asia:range_expansion:BTCUSDT:M5` | 22 | 0.14 | 0.34 | -0.591 | 5.3 | 0.00 | 0.99 | -0.591/-0.692/-0.698 | 0.00 | 17 / -0.647 | 17 | 0.32 | -0.647 | 9 |
| 8 | `asia:range_expansion:BTCUSDT:M15` | 6 | 0.17 | 0.30 | -0.500 | 1.7 | 0.00 | — (n<10) | -0.500/-0.500/-0.500 | 0.00 | 3 / -0.999 | 3 | 0.00 | -0.999 | 11 |
| 9 | `asia:range_expansion:BTCUSDT:M30` | 4 | 0.25 | 0.61 | -0.250 | 1.0 | 0.00 | — (n<10) | -0.250/-0.250/-0.250 | 0.00 | 3 / -0.999 | 3 | 0.00 | -0.999 | 11 |
| 10 | `asia:sr_breakout:BTCUSDT:M5` | 39 | 0.15 | 0.37 | -0.538 | 8.6 | 0.00 | 1.00 | -0.538/-0.692/-0.692 | 0.00 | 32 / -0.719 | 29 | 0.16 | -0.793 | 9 |
| 11 | `asia:sr_breakout:BTCUSDT:M15` | 48 | 0.21 | 0.46 | -0.425 | 9.7 | 0.00 | 1.00 | -0.425/-0.535/-0.544 | 0.50 | 14 / -0.031 | 36 | 0.69 | -0.224 | 7 |
| 12 | `asia:sr_breakout:BTCUSDT:M30` | 27 | 0.22 | 0.34 | -0.492 | 6.5 | 0.00 | 0.99 | -0.492/-0.561/-0.578 | 0.50 | 12 / -0.000 | 19 | 1.06 | +0.030 | 6 |
| 13 | `newyork:liquidity_sweep:BTCUSDT:M5` | 105 | 0.13 | 0.28 | -0.617 | 25.3 | 0.00 | 1.00 | -0.617/-0.620/-0.710 | 0.00 | 49 / -0.594 | 49 | 0.31 | -0.594 | 9 |
| 14 | `newyork:liquidity_sweep:BTCUSDT:M15` | 77 | 0.19 | 0.43 | -0.447 | 15.2 | 0.00 | 1.00 | -0.447/-0.520/-0.564 | 0.25 | 39 / -0.370 | 39 | 0.51 | -0.370 | 9 |
| 15 | `newyork:liquidity_sweep:BTCUSDT:M30` | 58 | 0.31 | 0.82 | -0.106 | 5.6 | 0.00 | 0.74 | -0.106/-0.192/-0.344 | 0.25 | 35 / -0.155 | 31 | 0.67 | -0.209 | 8 |
| 16 | `newyork:liquidity_sweep:BTCUSDT:H1` | 85 | 0.33 | 0.80 | -0.127 | 7.6 | 0.00 | 0.83 | -0.127/-0.296/-0.410 | 0.00 | 40 / -0.329 | 43 | 0.43 | -0.394 | 8 |
| 17 | `newyork:momentum_breakout:BTCUSDT:M5` | 109 | 0.26 | 0.68 | -0.250 | 12.3 | 0.00 | 0.98 | -0.250/-0.350/-0.448 | 0.00 | 73 / -0.398 | 63 | 0.38 | -0.493 | 9 |
| 18 | `newyork:momentum_breakout:BTCUSDT:M15` | 55 | 0.24 | 0.56 | -0.354 | 11.2 | 0.00 | 0.99 | -0.354/-0.415/-0.420 | 0.50 | 32 / -0.041 | 32 | 1.05 | +0.031 | 5 |
| 19 | `newyork:momentum_breakout:BTCUSDT:M30` | 64 | 0.33 | 0.70 | -0.197 | 7.7 | 0.00 | 0.90 | -0.197/-0.292/-0.311 | 0.25 | 29 / -0.127 | 37 | 0.65 | -0.236 | 8 |
| 20 | `newyork:momentum_breakout:BTCUSDT:H1` | 39 | 0.36 | 0.62 | -0.209 | 4.5 | 0.00 | 0.90 | -0.209/-0.235/-0.301 | 0.50 | 17 / +0.123 | 20 | 0.92 | -0.046 | 8 |
| 21 | `newyork:prev_day_breakout:BTCUSDT:M5` | 5 | 0.40 | 0.70 | -0.177 | 1.5 | 0.00 | — (n<10) | -0.177/-0.804/-0.825 | 0.50 | 2 / +0.499 | 2 | 1.98 | +0.499 | 8 |
| 22 | `newyork:prev_day_breakout:BTCUSDT:M15` | 12 | 0.50 | 1.19 | +0.101 | 1.5 | 0.00 | 0.40 | +0.101/-0.003/-0.047 | 0.00 | 6 / -0.500 | 7 | 0.33 | -0.571 | 10 |
| 23 | `newyork:prev_day_breakout:BTCUSDT:M30` | 20 | 0.30 | 0.48 | -0.339 | 3.5 | 0.00 | 0.91 | -0.339/-0.359/-0.375 | 0.33 | 10 / -0.266 | 9 | 0.25 | -0.666 | 10 |
| 24 | `newyork:prev_day_breakout:BTCUSDT:H1` | 27 | 0.41 | 0.70 | -0.162 | 3.2 | 0.00 | 0.80 | -0.162/-0.313/-0.348 | 0.50 | 13 / +0.011 | 14 | 0.90 | -0.061 | 9 |
| 25 | `newyork:prev_session_breakout:BTCUSDT:M5` | 78 | 0.27 | 0.68 | -0.222 | 13.2 | 0.00 | 0.94 | -0.222/-0.494/-0.587 | 0.25 | 44 / -0.399 | 44 | 0.41 | -0.467 | 9 |
| 26 | `newyork:prev_session_breakout:BTCUSDT:M15` | 103 | 0.27 | 0.58 | -0.295 | 16.7 | 0.00 | 0.99 | -0.295/-0.447/-0.464 | 0.25 | 58 / -0.118 | 58 | 0.79 | -0.170 | 9 |
| 27 | `newyork:prev_session_breakout:BTCUSDT:M30` | 96 | 0.33 | 0.73 | -0.174 | 10.5 | 0.00 | 0.92 | -0.174/-0.258/-0.321 | 0.25 | 55 / -0.118 | 55 | 0.76 | -0.173 | 8 |
| 28 | `newyork:prev_session_breakout:BTCUSDT:H1` | 80 | 0.36 | 0.87 | -0.070 | 4.9 | 0.00 | 0.70 | -0.070/-0.136/-0.216 | 0.25 | 44 / -0.223 | 44 | 0.64 | -0.223 | 8 |
| 29 | `newyork:trend_continuation:BTCUSDT:M5` | 50 | 0.30 | 0.76 | -0.181 | 5.9 | 0.00 | 0.85 | -0.181/-0.334/-0.363 | 0.25 | 42 / -0.342 | 32 | 0.44 | -0.447 | 8 |
| 30 | `newyork:trend_continuation:BTCUSDT:M15` | 29 | 0.41 | 1.31 | +0.167 | 3.0 | 0.15 | 0.27 | +0.167/+0.004/-0.041 | 0.50 | 21 / -0.157 | 25 | 0.70 | -0.191 | 5 |
| 31 | `newyork:trend_continuation:BTCUSDT:M30` | 20 | 0.45 | 1.14 | +0.075 | 2.8 | 0.11 | 0.41 | +0.075/+0.045/-0.131 | 0.50 | 12 / -0.405 | 14 | 0.56 | -0.264 | 7 |
| 32 | `newyork:trend_continuation:BTCUSDT:H1` | 11 | 0.64 | 2.03 | +0.323 | 0.7 | 0.00 | 0.18 | +0.323/+0.263/+0.210 | 0.67 | 11 / +0.009 | 12 | 0.98 | -0.008 | 6 |
| 33 | `newyork:volatility_expansion:BTCUSDT:M5` | 93 | 0.22 | 0.54 | -0.361 | 13.7 | 0.00 | 1.00 | -0.361/-0.568/-0.628 | 0.25 | 41 / -0.488 | 44 | 0.43 | -0.455 | 9 |
| 34 | `newyork:volatility_expansion:BTCUSDT:M15` | 26 | 0.46 | 1.62 | +0.352 | 2.1 | 0.70 | 0.09 | +0.352/+0.196/-0.056 | 0.25 | 18 / -0.167 | 15 | 0.50 | -0.400 | 4 |
| 35 | `newyork:volatility_expansion:BTCUSDT:M30` | 20 | 0.30 | 0.73 | -0.191 | 3.3 | 0.00 | 0.73 | -0.191/-0.350/-0.357 | 0.50 | 13 / -0.036 | 21 | 0.81 | -0.143 | 8 |
| 36 | `newyork:volatility_expansion:BTCUSDT:H1` | 11 | 0.27 | 0.71 | -0.184 | 2.0 | 0.00 | 0.69 | -0.184/-0.256/-0.286 | 0.50 | 5 / +0.416 | 4 | 1.21 | +0.105 | 8 |

## Appendix D — Failure reasons, verbatim, per candidate

1. `asia:asian_orb:BTCUSDT:M5` — training profit factor 0.35 < 1.2; training expectancy -0.540R < 0.05R; training drawdown 29.4% > 12.0%; parameter stability 0.00 < 0.6; Monte Carlo loss probability too high; not profitable with costs x1.5; only 0% of walk-forward folds positive; out-of-sample expectancy not positive; out-of-sample profit factor below 1
2. `asia:asian_orb:BTCUSDT:M15` — training profit factor 0.40 < 1.2; training expectancy -0.486R < 0.05R; training drawdown 24.0% > 12.0%; parameter stability 0.00 < 0.6; Monte Carlo loss probability too high; not profitable with costs x1.5; only 0% of walk-forward folds positive; out-of-sample expectancy not positive; out-of-sample profit factor below 1
3. `asia:asian_orb:BTCUSDT:M30` — training profit factor 0.46 < 1.2; training expectancy -0.417R < 0.05R; training drawdown 14.3% > 12.0%; parameter stability 0.00 < 0.6; Monte Carlo loss probability too high; not profitable with costs x1.5; only 0% of walk-forward folds positive; out-of-sample expectancy not positive; out-of-sample profit factor below 1
4. `asia:liquidity_sweep:BTCUSDT:M5` — training profit factor 0.50 < 1.2; training expectancy -0.418R < 0.05R; parameter stability 0.00 < 0.6; Monte Carlo loss probability too high; not profitable with costs x1.5; only 0% of walk-forward folds positive; out-of-sample expectancy not positive; out-of-sample profit factor below 1
5. `asia:liquidity_sweep:BTCUSDT:M15` — training profit factor 0.37 < 1.2; training expectancy -0.538R < 0.05R; training drawdown 14.7% > 12.0%; parameter stability 0.00 < 0.6; Monte Carlo loss probability too high; not profitable with costs x1.5; only 0% of walk-forward folds positive; out-of-sample expectancy not positive; out-of-sample profit factor below 1
6. `asia:liquidity_sweep:BTCUSDT:M30` — training trades 20 < 40; training profit factor 0.79 < 1.2; training expectancy -0.168R < 0.05R; parameter stability 0.00 < 0.6; Monte Carlo loss probability too high; not profitable with costs x1.5; only 0% of walk-forward folds positive; out-of-sample trades 14 < 15; out-of-sample expectancy not positive; out-of-sample profit factor below 1
7. `asia:range_expansion:BTCUSDT:M5` — training trades 22 < 40; training profit factor 0.34 < 1.2; training expectancy -0.591R < 0.05R; parameter stability 0.00 < 0.6; Monte Carlo loss probability too high; not profitable with costs x1.5; only 0% of walk-forward folds positive; out-of-sample expectancy not positive; out-of-sample profit factor below 1
8. `asia:range_expansion:BTCUSDT:M15` — no parameter set produced enough training trades; training trades 6 < 40; training profit factor 0.30 < 1.2; training expectancy -0.500R < 0.05R; parameter stability 0.00 < 0.6; too few trades for Monte Carlo; not profitable with costs x1.5; only 0% of walk-forward folds positive; out-of-sample trades 3 < 15; out-of-sample expectancy not positive; out-of-sample profit factor below 1
9. `asia:range_expansion:BTCUSDT:M30` — no parameter set produced enough training trades; training trades 4 < 40; training profit factor 0.61 < 1.2; training expectancy -0.250R < 0.05R; parameter stability 0.00 < 0.6; too few trades for Monte Carlo; not profitable with costs x1.5; only 0% of walk-forward folds positive; out-of-sample trades 3 < 15; out-of-sample expectancy not positive; out-of-sample profit factor below 1
10. `asia:sr_breakout:BTCUSDT:M5` — training trades 39 < 40; training profit factor 0.37 < 1.2; training expectancy -0.538R < 0.05R; parameter stability 0.00 < 0.6; Monte Carlo loss probability too high; not profitable with costs x1.5; only 0% of walk-forward folds positive; out-of-sample expectancy not positive; out-of-sample profit factor below 1
11. `asia:sr_breakout:BTCUSDT:M15` — training profit factor 0.46 < 1.2; training expectancy -0.425R < 0.05R; parameter stability 0.00 < 0.6; Monte Carlo loss probability too high; not profitable with costs x1.5; out-of-sample expectancy not positive; out-of-sample profit factor below 1
12. `asia:sr_breakout:BTCUSDT:M30` — training trades 27 < 40; training profit factor 0.34 < 1.2; training expectancy -0.492R < 0.05R; parameter stability 0.00 < 0.6; Monte Carlo loss probability too high; not profitable with costs x1.5
13. `newyork:liquidity_sweep:BTCUSDT:M5` — training profit factor 0.28 < 1.2; training expectancy -0.617R < 0.05R; training drawdown 25.3% > 12.0%; parameter stability 0.00 < 0.6; Monte Carlo loss probability too high; not profitable with costs x1.5; only 0% of walk-forward folds positive; out-of-sample expectancy not positive; out-of-sample profit factor below 1
14. `newyork:liquidity_sweep:BTCUSDT:M15` — training profit factor 0.43 < 1.2; training expectancy -0.447R < 0.05R; training drawdown 15.2% > 12.0%; parameter stability 0.00 < 0.6; Monte Carlo loss probability too high; not profitable with costs x1.5; only 25% of walk-forward folds positive; out-of-sample expectancy not positive; out-of-sample profit factor below 1
15. `newyork:liquidity_sweep:BTCUSDT:M30` — training profit factor 0.82 < 1.2; training expectancy -0.106R < 0.05R; parameter stability 0.00 < 0.6; Monte Carlo loss probability too high; not profitable with costs x1.5; only 25% of walk-forward folds positive; out-of-sample expectancy not positive; out-of-sample profit factor below 1
16. `newyork:liquidity_sweep:BTCUSDT:H1` — training profit factor 0.80 < 1.2; training expectancy -0.127R < 0.05R; parameter stability 0.00 < 0.6; Monte Carlo loss probability too high; not profitable with costs x1.5; only 0% of walk-forward folds positive; out-of-sample expectancy not positive; out-of-sample profit factor below 1
17. `newyork:momentum_breakout:BTCUSDT:M5` — training profit factor 0.68 < 1.2; training expectancy -0.250R < 0.05R; training drawdown 12.3% > 12.0%; parameter stability 0.00 < 0.6; Monte Carlo loss probability too high; not profitable with costs x1.5; only 0% of walk-forward folds positive; out-of-sample expectancy not positive; out-of-sample profit factor below 1
18. `newyork:momentum_breakout:BTCUSDT:M15` — training profit factor 0.56 < 1.2; training expectancy -0.354R < 0.05R; parameter stability 0.00 < 0.6; Monte Carlo loss probability too high; not profitable with costs x1.5
19. `newyork:momentum_breakout:BTCUSDT:M30` — training profit factor 0.70 < 1.2; training expectancy -0.197R < 0.05R; parameter stability 0.00 < 0.6; Monte Carlo loss probability too high; not profitable with costs x1.5; only 25% of walk-forward folds positive; out-of-sample expectancy not positive; out-of-sample profit factor below 1
20. `newyork:momentum_breakout:BTCUSDT:H1` — training trades 39 < 40; training profit factor 0.62 < 1.2; training expectancy -0.209R < 0.05R; parameter stability 0.00 < 0.6; Monte Carlo loss probability too high; not profitable with costs x1.5; out-of-sample expectancy not positive; out-of-sample profit factor below 1
21. `newyork:prev_day_breakout:BTCUSDT:M5` — no parameter set produced enough training trades; training trades 5 < 40; training profit factor 0.70 < 1.2; training expectancy -0.177R < 0.05R; parameter stability 0.00 < 0.6; too few trades for Monte Carlo; not profitable with costs x1.5; out-of-sample trades 2 < 15
22. `newyork:prev_day_breakout:BTCUSDT:M15` — no parameter set produced enough training trades; training trades 12 < 40; training profit factor 1.19 < 1.2; parameter stability 0.00 < 0.6; Monte Carlo loss probability too high; not profitable with costs x1.5; only 0% of walk-forward folds positive; out-of-sample trades 7 < 15; out-of-sample expectancy not positive; out-of-sample profit factor below 1
23. `newyork:prev_day_breakout:BTCUSDT:M30` — training trades 20 < 40; training profit factor 0.48 < 1.2; training expectancy -0.339R < 0.05R; parameter stability 0.00 < 0.6; Monte Carlo loss probability too high; not profitable with costs x1.5; only 33% of walk-forward folds positive; out-of-sample trades 9 < 15; out-of-sample expectancy not positive; out-of-sample profit factor below 1
24. `newyork:prev_day_breakout:BTCUSDT:H1` — training trades 27 < 40; training profit factor 0.70 < 1.2; training expectancy -0.162R < 0.05R; parameter stability 0.00 < 0.6; Monte Carlo loss probability too high; not profitable with costs x1.5; out-of-sample trades 14 < 15; out-of-sample expectancy not positive; out-of-sample profit factor below 1
25. `newyork:prev_session_breakout:BTCUSDT:M5` — training profit factor 0.68 < 1.2; training expectancy -0.222R < 0.05R; training drawdown 13.2% > 12.0%; parameter stability 0.00 < 0.6; Monte Carlo loss probability too high; not profitable with costs x1.5; only 25% of walk-forward folds positive; out-of-sample expectancy not positive; out-of-sample profit factor below 1
26. `newyork:prev_session_breakout:BTCUSDT:M15` — training profit factor 0.58 < 1.2; training expectancy -0.295R < 0.05R; training drawdown 16.7% > 12.0%; parameter stability 0.00 < 0.6; Monte Carlo loss probability too high; not profitable with costs x1.5; only 25% of walk-forward folds positive; out-of-sample expectancy not positive; out-of-sample profit factor below 1
27. `newyork:prev_session_breakout:BTCUSDT:M30` — training profit factor 0.73 < 1.2; training expectancy -0.174R < 0.05R; parameter stability 0.00 < 0.6; Monte Carlo loss probability too high; not profitable with costs x1.5; only 25% of walk-forward folds positive; out-of-sample expectancy not positive; out-of-sample profit factor below 1
28. `newyork:prev_session_breakout:BTCUSDT:H1` — training profit factor 0.87 < 1.2; training expectancy -0.070R < 0.05R; parameter stability 0.00 < 0.6; Monte Carlo loss probability too high; not profitable with costs x1.5; only 25% of walk-forward folds positive; out-of-sample expectancy not positive; out-of-sample profit factor below 1
29. `newyork:trend_continuation:BTCUSDT:M5` — training profit factor 0.76 < 1.2; training expectancy -0.181R < 0.05R; parameter stability 0.00 < 0.6; Monte Carlo loss probability too high; not profitable with costs x1.5; only 25% of walk-forward folds positive; out-of-sample expectancy not positive; out-of-sample profit factor below 1
30. `newyork:trend_continuation:BTCUSDT:M15` — training trades 29 < 40; parameter stability 0.15 < 0.6; Monte Carlo loss probability too high; out-of-sample expectancy not positive; out-of-sample profit factor below 1
31. `newyork:trend_continuation:BTCUSDT:M30` — training trades 20 < 40; training profit factor 1.14 < 1.2; parameter stability 0.11 < 0.6; Monte Carlo loss probability too high; out-of-sample trades 14 < 15; out-of-sample expectancy not positive; out-of-sample profit factor below 1
32. `newyork:trend_continuation:BTCUSDT:H1` — no parameter set produced enough training trades; training trades 11 < 40; parameter stability 0.00 < 0.6; out-of-sample trades 12 < 15; out-of-sample expectancy not positive; out-of-sample profit factor below 1
33. `newyork:volatility_expansion:BTCUSDT:M5` — training profit factor 0.54 < 1.2; training expectancy -0.361R < 0.05R; training drawdown 13.7% > 12.0%; parameter stability 0.00 < 0.6; Monte Carlo loss probability too high; not profitable with costs x1.5; only 25% of walk-forward folds positive; out-of-sample expectancy not positive; out-of-sample profit factor below 1
34. `newyork:volatility_expansion:BTCUSDT:M15` — training trades 26 < 40; only 25% of walk-forward folds positive; out-of-sample expectancy not positive; out-of-sample profit factor below 1
35. `newyork:volatility_expansion:BTCUSDT:M30` — training trades 20 < 40; training profit factor 0.73 < 1.2; training expectancy -0.191R < 0.05R; parameter stability 0.00 < 0.6; Monte Carlo loss probability too high; not profitable with costs x1.5; out-of-sample expectancy not positive; out-of-sample profit factor below 1
36. `newyork:volatility_expansion:BTCUSDT:H1` — no parameter set produced enough training trades; training trades 11 < 40; training profit factor 0.71 < 1.2; training expectancy -0.184R < 0.05R; parameter stability 0.00 < 0.6; Monte Carlo loss probability too high; not profitable with costs x1.5; out-of-sample trades 4 < 15
