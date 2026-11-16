# Health Monitor Audit

The difference between 562 and 148 trades in Phase 2 was entirely the health monitor working as designed. It
suspended 9 of 10 strategies, most within their first 7–22 trades. With hindsight the suspensions prevented losses
of $143.79. But the trigger behind most of them cannot tell a broken strategy from a sound one under this platform's
2:1-target design. A genuinely profitable +0.2R/trade strategy has a 69% chance of being suspended within 100
trades.

No safety control was weakened. The recommended replacement (§5) is stricter on bad strategies and needs your
approval.

## 1. Method

The same 10 BTCUSDT M15 plans (Phase 1 training-selected parameters, $300, 0.5% risk) were replayed through the
paper engine over the real one-year dataset, twice: monitor **on** (as shipped) and **off**. Each run used an
isolated database.

**A timestamp defect was found and fixed first.** Risk events and health checks were stamped with wall-clock time,
so during a replay every suspension appeared to happen "now". `TradingService` now carries the market time of the
event it is processing (`self.clock`). Risk events, `health.checked_at` and the new `health.suspended_at` use it.

| Run | Trades | Final balance | Suspended strategies |
|---|---|---|---|
| Monitor off | 556 | $122.36 | 0 |
| Monitor on | 165 | $253.57 | 9 |

These counts differ from Phase 2's 562 and 148 because the D3 fix suppresses signals until indicators have
converged.

## 2. The rules (`app/core/health.py`, unchanged)

Evaluated after every closed trade of a strategy.

**Suspend if any of:**

- 7 consecutive losses
- drawdown ≥ max(8R, 1.5 × the validated drawdown)
- over the last 30 trades (with at least 15): profit factor < 0.7, or expectancy < −0.2R

**Warn on:** profit factor < 1, negative expectancy, expectancy below 25% of the validated level, or mean entry
slippage > 0.15R.

A suspension disables the strategy and marks it `needs_revalidation`. **There is no automatic resumption**: only a
new passing validation creates a new version that can be enabled.

## 3. Every suspension

Hindsight columns come from the monitor-off run: trades that strategy would have taken after its suspension.

| Strategy | Suspended at (market time, UTC) | Triggering condition | Record at suspension | Duration | Trades missed | Missed P&L (R) | Missed expectancy |
|---|---|---|---|---|---|---|---|
| asia:asian_orb | 2025-12-06 08:30 | 7 consecutive losses | 7 trades, 0 wins, −7.0R | 340.1 d | 149 | −$52.86 (−70.8R) | −0.475R |
| asia:liquidity_sweep | 2026-01-10 06:30 | drawdown 9.0R > 8.0R | 13 trades, 15% wins, −7.0R | 305.2 d | 77 | −$31.77 (−41.0R) | −0.532R |
| asia:sr_breakout | 2026-02-15 13:00 | 7 consecutive losses | 12 trades, 17% wins, −6.0R | 268.9 d | 11 | −$1.57 (−2.0R) | −0.182R |
| newyork:trend_continuation | 2026-09-23 14:15 | drawdown 8.8R > 8.0R | 39 trades, 36% wins, +0.4R | 48.9 d | 5 | +$0.40 (+1.0R) | +0.200R |
| newyork:momentum_breakout | 2026-01-14 15:45 | 7 consecutive losses | 12 trades, 17% wins, −6.0R | 300.8 d | 37 | −$5.31 (−5.8R) | −0.158R |
| newyork:volatility_expansion | 2026-10-20 13:15 | 7 consecutive losses | 30 trades, 40% wins, +5.1R | 21.9 d | 2 | +$0.61 (+1.0R) | +0.499R |
| newyork:liquidity_sweep | 2025-12-12 15:30 | 7 consecutive losses | 9 trades, 11% wins, −5.0R | 333.8 d | 84 | −$36.57 (−38.8R) | −0.462R |
| newyork:prev_session_breakout | 2026-01-27 17:15 | 7 consecutive losses | 22 trades, 32% wins, −2.1R | 287.7 d | 63 | −$16.72 (−17.2R) | −0.272R |
| newyork:prev_day_breakout | 2026-09-11 14:45 | 7 consecutive losses | 12 trades, 33% wins, −2.9R | 60.8 d | 0 | $0 | — |
| asia:range_expansion | never suspended | — | — | — | — | — | — |

- **Totals:** 428 trades missed, −$143.79 in hindsight.
- **Duration** runs from the suspension to the end of the data (2026-11-11). Every suspension was still in force,
  because none was revalidated.
- **"Missed" is approximate.** The monitor-off run follows a different path: other strategies' positions and the
  account balance differ, which changes sizing and some rejections.

## 4. Was each suspension justified? Should it have resumed?

### Condition genuinely met

Yes for all 9; the code fired only on true conditions. Three questions remain.

### a. Was the strategy actually bad?

- None of the 10 strategies had passed validation (Phase 1: 0 of 36), so none had evidence of an edge to protect.
- After suspension, **7 of 9 kept losing** in the monitor-off run (missed expectancy −0.16R to −0.53R).
- **Ex post, those 7 suspensions were justified**, and resuming them would have lost money.
- **trend_continuation and volatility_expansion** were profitable at suspension (+0.4R and +5.1R) and missed only 5
  and 2 trades, slightly positive. The sample is far too small to say the suspension was wrong.
- **Should they have resumed?** Not without revalidation, which is the rule. They had never passed validation.

### b. Was the trigger statistically meaningful? Mostly no

With a net 2:1 target, break-even needs a win rate of only 33%, so long losing streaks are normal.

Probability of at least one 7-loss streak (20,000 simulations):

| True win rate (expectancy) | Within 30 trades | Within 100 trades | Within 250 trades |
|---|---|---|---|
| 33% (break-even, 0R) | 44% | 89% | ~100% |
| 40% (+0.20R) | 27% | **69%** | 95% |
| 45% (+0.35R) | 17% | 51% | 83% |
| 50% (+0.50R) | 10% | 32% | 63% |

For the strategies as they stood at suspension, the chance that a break-even strategy produces such a streak *by
the time it did* ranged from 0.06 (asian_orb, 7 losses in its first 7 trades) to 0.54 (trend_continuation after 39
trades).

So:

- **The early suspensions** (asian_orb, both liquidity_sweeps) carried real information. They were unlikely under
  break-even (p ≈ 0.06–0.17).
- **The later ones** (volatility_expansion, trend_continuation, prev_session_breakout) were close to coin-flips.

The 7-loss rule is a fixed brake, not a calibrated test. It would eventually suspend almost every strategy this
platform can produce, good or bad.

### c. Was the drawdown limit calibrated?

- The limit is max(8R, 1.5 × validated drawdown). None of these strategies had a validated drawdown, so the floor
  of 8R applied.
- Simulated over 40 trades (20,000 paths), the probability of a drawdown of at least 8R is **65%** for a break-even
  2:1 strategy and **39%** for a +0.2R one. Same conclusion as (b).

## 5. Recommendation (not implemented; needs approval)

Do not weaken the monitor. The 7-loss and 8R rules are kept as hard backstops. The proposal is to add a calibrated
sequential test that is **more** sensitive to genuine deterioration:

1. **Baseline:** each strategy's *validated* win rate and R distribution, stored at validation time.
2. **Test:** a one-sided CUSUM or SPRT on per-trade R against that baseline, with the false-alarm rate set (for
   example 5% over 250 trades). It suspends a strategy whose live R distribution has shifted below its validated
   one, typically sooner than the streak rule for real deterioration.
3. **Report** the test statistic in the health record, so every suspension shows how unlikely the observed run was
   under the validated performance.

This only matters once a strategy passes validation and the hold-out. None does today.

## 6. Defects found during this audit

| Defect | Status |
|---|---|
| Risk-event and health timestamps used wall-clock time in replays, so suspensions could not be dated | **Fixed** (`TradingService.clock`; events carry `market_time`) |
| No record of when a strategy was suspended, or after how many trades | **Fixed** (`health.suspended_at`, `health.trades_at_suspension`) |
| Health thresholds not calibrated to the 2:1 payoff design | **Documented; not changed** (§5) |
| The backtester has no health monitor, so backtest and paper results diverge whenever it fires | **Documented** (`SIGNAL_PARITY_REPORT.md`) |
