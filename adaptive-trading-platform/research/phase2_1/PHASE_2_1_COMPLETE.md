# Phase 2.1 — Complete Research Pack

Seven documents combined into one file, unchanged. Generated 2026-11-11T17:44:34Z. Nothing is committed to the repository.

## Contents

1. PHASE_2_1_REPAIR_REPORT.md
2. VALIDATION_METHODOLOGY.md
3. HEALTH_MONITOR_AUDIT.md
4. SIGNAL_PARITY_REPORT.md
5. MARKET_COST_SUITABILITY.md
6. RESEARCH_HYPOTHESES.md
7. preregistration.json


---

<!-- ===== Document 1 of 7: PHASE_2_1_REPAIR_REPORT.md ===== -->

## Phase 2.1 Repair Report

Recorded 2026-11-11.

| Item | Status |
|---|---|
| Version control | Not committed, not pushed, not deployed (as instructed) |
| Live-trading settings | Not modified. No strategy is enabled for live trading; the live gate is now **stricter** (§2, D1) |
| Strategy parameters | Not modified. All research re-runs were read-only or ran in isolated in-memory databases |

### 1. Summary

| | Result |
|---|---|
| Defects fixed | D1, D2, D3, D8, plus two found in this phase (wall-clock timestamps in replays; quarantine bypass) |
| Defects remaining | Quote-polling exit detection in real-time paper; health thresholds not calibrated to the 2:1 design; D4, D5; no Redis-based job queue (see §3) |
| Tests | **152 passed** on SQLite and **152 passed** on PostgreSQL 16 (was 118). Alembic upgrade / downgrade / upgrade / check passed on a scratch database. Mobile app type-check (`tsc --noEmit`, strict) passed |
| Verdict on Phase 1 strategies | Unchanged: **0 of 36** pass through the repaired pipeline, and **0 of 36** have a validation sample large enough to detect +0.2R |
| New research | 5 pre-registered daily hypotheses; **none passes** the multiple-testing-corrected training gate. Validation and hold-out remain unread |
| Viable research direction | **None validated.** One single-hypothesis confirmatory test is worth running with your approval (`RESEARCH_HYPOTHESES.md` §5) |

### 2. Defects fixed

| ID | Defect | Fix | Verified by |
|---|---|---|---|
| **D1** | Walk-forward test windows were the out-of-sample rows | Three independent chronological segments per dataset, immutable split, nested walk-forward inside training, statistical-power gate, separate hold-out job with ledger and reuse flag. The live gate now also requires a passed, *independent* hold-out | `TestIndependentSplit` (6 tests), updated API / risk / scenario tests; `VALIDATION_METHODOLOGY.md` |
| **D2** | 499 live M15 candles in source `binance` shadowed a year of M5 history | Dataset registry: one base timeframe per dataset; live candles in `<feed>-<TF>-live`; duplicate, grid, interval, calendar-gap and date-range checks reject bad data; provenance and SHA-256 checksum; migration 0002 quarantined the offending rows | `TestDatasetIntegrity` (11 tests). On real data, `store.load(BTCUSDT, M15, binance)` now returns 35,040 candles (was 499) |
| **D3** | Real-time loop evaluated 1,500 candles; `trend_continuation` needs 8,370 for its H1 EMA200 / H4 EMA50 to converge, so it missed 5 of 27 out-of-sample signals | Each family computes `required_bars` (seed influence < 1e-9). Signals are suppressed until that history exists, in backtest, replay and real time alike. The real-time loop backfills it into the live dataset; validation warm-ups use it | `TestRequiredHistory` (13 tests) and the real-data three-way parity runs (`SIGNAL_PARITY_REPORT.md`) |
| **D8** | Reported costs omitted slippage; paper trades recorded no spread or slippage | Per-trade `spread_cost`, `slippage_cost`, `pnl_before_costs` (backtest and paper; migration 0003). The cost breakdown separates **published exchange fees** from **estimated execution costs**; the ledger identity is tested against independently computed mid-price P&L | `TestCostAccounting` (3 tests) |
| New | Risk events and health checks were stamped with wall-clock time in replays, so suspensions could not be dated | `TradingService.clock` (market time); `health.suspended_at` and `trades_at_suspension` | Health audit replay (`HEALTH_MONITOR_AUDIT.md`) |
| New | Writing to a new dataset named `…-quarantined` created it instead of refusing; a registry rebuild could re-classify quarantined data as historical | `kind_for_source` recognises the suffix; `upsert` refuses; migration 0002 keeps the status and refuses a downgrade that would destroy splits or ledgers | `test_quarantined_source_names_stay_quarantined_on_reregistration`; migration downgrade refusal observed |

#### Effect on the Phase 1 headline

The Phase 1 portfolio backtest (10 M15 plans, same parameters, same data) was re-run with the repaired code:

| | Phase 1 | Phase 2.1 |
|---|---|---|
| Trades | 562 | 555 |
| Net | −$181.85 (−60.6%) | −$177.31 (−59.1%) |
| P&L before costs | (reconstructed −$9.10) | **+$0.13** |
| Commission | $168.16 | $172.73 |
| Spread (estimate) | $0.55 | $0.57 |
| Slippage (estimate; previously missing from the report) | not reported | $4.14 |

The 7 fewer trades are `trend_continuation` signals in the first 87 days, before its indicators had converged
(D3). The conclusion strengthens: **before costs the strategies broke even; commission caused the entire loss.**

### 3. Defects remaining (not fixed in this phase)

| Defect | Why not fixed | Impact |
|---|---|---|
| **Quote-polling exits in real-time paper.** Stops and targets are checked only on polled quotes (every 5 s), not on every price | A correct fix needs streaming prices or broker-side orders; it is not a one-line change | Paper and backtest exits can differ (measured in `SIGNAL_PARITY_REPORT.md` §3 at 15-minute polling). Live trading with broker-side stops is closer to the backtest |
| **Health-monitor thresholds** not calibrated to the 2:1 design (a +0.2R strategy has a 69% chance of suspension in 100 trades) | You asked not to weaken safety controls; the proposed calibrated test needs approval | Over-suspension of sound strategies (none exists today) |
| **D4.** Inert parameter dimensions in some grids (`range_minutes` when the range source is another session) | Changing grids changes the research definition; deferred to a pre-registered study | Biases the stability score of 8 Phase 1 candidates; does not change any verdict |
| **D5.** Monte Carlo resamples trades i.i.d. | Deferred | Understates tail drawdown |
| Equity basis differs (marked equity in paper vs closed equity in backtest) | Documented, not changed | Matters only with several symbols open at once |
| **D10.** After a 24 h time exit at a candle's open, the backtester blocks a new entry on that candle; the paper engine allows it | Not changed in this phase | 1 extra paper trade in 563 on the real-data replay |
| Long-running work uses an in-process thread pool, not a Redis-backed queue | Out of scope | A server restart loses running jobs (recorded as failed, not silently) |
| Live-dataset registry refresh reads the whole live index every loop iteration | Performance only | Grows slowly with uptime; acceptable for one symbol |

### 4. Tests

| Suite | Result |
|---|---|
| Backend, SQLite in-memory | **152 passed** |
| Backend, PostgreSQL 16 | **152 passed** |
| Alembic on a scratch PostgreSQL database: upgrade head → downgrade base → upgrade head → check | Passed; no drift |
| Working database | At head (`0003`); downgrade correctly **refused** while dataset splits exist |
| Mobile `tsc --noEmit` (strict) | Passed |
| Lint (`ruff` E, F, W) | Clean |

New test file: `backend/tests/test_phase21_repairs.py` (34 tests).

### 5. Incident during this phase (disclosed)

While verifying migration 0002 I ran `alembic downgrade` on the **working** database instead of a scratch copy. It
dropped the dataset registry, including both dataset splits and the 1-year dataset's ledger entry. Re-upgrading
also re-registered the quarantined M15 rows as historical.

- **Lost:** registry metadata only. Candles were untouched. The `binance-2020` ledger was empty, and no hold-out had
  been read.
- **Restored:** both splits with identical boundaries; the Phase 1 ledger entry; the quarantine status and reason.
- **Not original after restoration:** the `defined_at` timestamps of both splits, and the restored ledger entry's timestamp (16:54:52 UTC; the original was written at 16:45:31 UTC). The entry's content is identical.
- **Prevention:** the migration now refuses to downgrade while any split exists (overridable only with
  `ATP_ALLOW_SPLIT_LOSS=1`), and quarantine survives re-registration.

### 6. Datasets after Phase 2.1 (registry)

| Dataset | Kind | Base TF | Candles | Missing | Split (train / validation / hold-out start) | Hold-out ledger |
|---|---|---|---|---|---|---|
| BTCUSDT `binance-2020` | historical | M5 | 616,142 | 466 (0.076%) | 2020-01-01 / 2023-01-01 / 2024-11-11 | **empty** (untouched) |
| BTCUSDT `binance` | historical | M5 | 105,119 | 0 | 2025-11-11 / 2026-06-18 / 2026-08-30 | 1 entry: read by Phase 1 before splits existed (not independent) |
| BTCUSDT `binance-M15-quarantined` | quarantined | M15 | 499 | 0 | — | unusable |

Proxy price data for EUR/USDT and PAXG/USDT (2021-01-01 → 2024-11-10) was used for Task 6 only. It is held in the
session scratchpad and is not registered or committed.

### 7. Deliverables

| File | Contents |
|---|---|
| `PHASE_2_1_REPAIR_REPORT.md` | This report |
| `VALIDATION_METHODOLOGY.md` | Task 1: design, enforcement, exact boundaries, power analysis |
| `SIGNAL_PARITY_REPORT.md` | Task 3: D3 root cause, three-way parity on real data, every discrepancy |
| `HEALTH_MONITOR_AUDIT.md` | Task 4: every suspension, justification, calibration |
| `MARKET_COST_SUITABILITY.md` | Tasks 5–6: verified fees, measured spread, movement-to-cost matrix |
| `RESEARCH_HYPOTHESES.md` | Task 7: pre-registered hypotheses and results |
| `preregistration.json`, `hypotheses.py`, `suitability.py` | Reproducible research code and the timestamped pre-registration |

---

<!-- ===== Document 2 of 7: VALIDATION_METHODOLOGY.md ===== -->

## Validation Methodology (Phase 2.1, defect D1 repaired)

Every dataset now has three chronological, non-overlapping segments: **training**, **validation** and an
**untouched hold-out**. Research code cannot load the hold-out. The boundaries are stored once per dataset and
cannot be moved afterwards. Every read of a hold-out is recorded in that dataset's ledger.

**Limitation stated up front.** The only real dataset with a clean hold-out is BTCUSDT 2020-01-01 → 2025-11-10.
On it, a session-gated intraday strategy (the Phase 1 design) cannot collect enough validation trades to detect a
+0.2R edge (§5). The one-year dataset used in Phase 1 has no clean hold-out at all: Phase 1 read all of it before
any split existed.

### 1. What was wrong (D1)

In Phase 1 the walk-forward test windows were exactly the final 35% of rows. Those were the same rows later called
"out-of-sample", so the walk-forward gate consumed the confirmation data.

### 2. The repaired design

| Segment | Used for | Who may read it |
|---|---|---|
| **Training** | Parameter grid search; training gates; Monte Carlo; cost stress; **inner** walk-forward (all folds, including their test windows, lie inside training) | Research |
| **Validation** | One pass with the frozen training choice; validation gates; statistical-power gate | Research (once per candidate) |
| **Hold-out** | One evaluation of frozen, validated configurations | Only the hold-out job (`POST /api/v1/holdout`), or a backtest / replay that explicitly sets `include_holdout`. Every read is written to the ledger |

#### How it is enforced in code

| Mechanism | Where | Test |
|---|---|---|
| Split defined once per dataset, by calendar instant, so all timeframes share it; immutable afterwards | `app/data/splits.py` `define_split`, `ensure_split`; `Dataset.split` | `test_split_is_immutable_and_hold_out_reads_are_ledgered` |
| Research jobs load data ending one microsecond before the hold-out | `jobs.run_research_job` → `store.load(..., end=splits.research_end(split))` | `test_every_research_computation_stays_before_the_hold_out` (spies on every backtest call) |
| `research_plan` refuses any frame containing hold-out rows (`HoldoutViolation`) | `app/core/validation.py` | `test_research_refuses_hold_out_rows` |
| Inner walk-forward runs on the training frame only | `research_plan` → `walk_forward(plan, train, ...)` | Same spy test: every fold's `test_end` < `train_end` |
| Backtests and paper replays stop before the hold-out unless `include_holdout` is set; if set, the read is ledgered and the report says `touches_holdout: true` | `splits.guard_range` | `test_full_research_pipeline...`, `test_replay_paper_engine...` |
| The hold-out job accepts only current configurations whose training and validation passed on that dataset, never changes parameters, and refuses a second read unless `acknowledge_reuse`. A reused result is marked `independent: false` | `jobs.run_holdout_job` | `test_hold_out_job_only_accepts_frozen_validated_configs_and_flags_reuse` |
| Live activation requires a **passed and independent** hold-out result | `live_gate.checklist` ("strategies" item) | `test_two_step_live_activation` |
| Statistical-power gate: validation must hold at least *n* trades, where *n* is needed to detect +0.2R at t = 2 given the training R standard deviation | `trades_needed`, `research_plan` | `test_power_gate` |
| Signals are suppressed until each strategy's indicators have converged, and segment warm-ups use the same requirement (D3) | `Strategy.required_bars`, `validation.required_history` | `TestRequiredHistory` |

### 3. Exact boundaries (UTC; each segment is [start, end))

#### BTCUSDT `binance-2020`: the research dataset

Binance spot, M5 base, 616,142 candles, 466 missing (0.076%; largest gap 5.8 h on 2020-02-19, an exchange
outage). SHA-256 content checksum `26403f5fa16e1d6a…` is stored in the registry.

| Segment | Start | End | Length | Market context (BTC buy-and-hold) |
|---|---|---|---|---|
| Training | 2020-01-01 00:00 | 2023-01-01 00:00 | 3 years | +130.8% (2020–21 bull, 2022 bear) |
| Validation | 2023-01-01 00:00 | 2024-11-11 00:00 | 22.3 months | not read in Phase 2.1 |
| **Hold-out** | 2024-11-11 00:00 | 2025-11-10 23:55 | 12 months | **not read; ledger empty** |
| (excluded) | 2025-11-11 | → | — | Examined in Phase 1 / Phase 2; deliberately not part of this dataset |

The hold-out was chosen as the most recent 12 months **not examined before Phase 2.1**. The year after it was read
in Phase 1 and the Phase 2 audit, so using it as a hold-out would not be independent.

#### BTCUSDT `binance`: the Phase 1 dataset

105,119 M5 candles, 0 missing.

| Segment | Start | End |
|---|---|---|
| Training | 2025-11-11 11:05 | 2026-06-18 00:00 |
| Validation | 2026-06-18 00:00 | 2026-08-30 00:00 |
| Hold-out | 2026-08-30 00:00 | 2026-11-11 10:55 |

**Ledger: 1 entry.** "Phase 1 research run #1 and backtest #2 read the entire dataset, including what is now the
hold-out, before splits existed." Any hold-out result on this dataset is therefore marked **not independent**.
This dataset is suitable for engineering checks (parity, regression), not for confirmatory research.

#### `binance-M15-quarantined`

The 499 live-feed M15 candles that shadowed the history (D2). Kind `quarantined`; refused by every load and
backtest.

### 4. Regression: the unchanged Phase 1 study through the repaired pipeline

The 36 original BTCUSDT candidates, with the same grids and gates, were re-run on the `binance` dataset's
training + validation segments. The run was read-only: no strategy configuration was written.

**Result: 0 of 36 passed** (the same verdict as Phase 1).

| Measure | Range |
|---|---|
| Training trades per candidate | 3–135 |
| Validation trades | 2–46 |
| Validation trades needed for +0.2R at t = 2 | 92–300 |

All 36 failed the power gate ("validation sample too small"). Most common other failures:

| Failure | Candidates |
|---|---|
| Parameter stability | 35 |
| Training profit factor | 33 |
| Cost stress ×1.5 | 33 |
| Training expectancy | 32 |
| Monte Carlo | 29 |
| Validation expectancy not positive | 27 |

### 5. Is the data sufficient? Statistical power

Detecting a mean edge of +0.2R at t ≥ 2, with the R standard deviation Phase 1 observed (≈ 1.17), needs about
**137 trades** in the confirming segment (`trades_needed(1.166) = 136`).

| Dataset / design | Validation length | Typical validation trades per candidate | Enough? |
|---|---|---|---|
| `binance` 1-year, session-gated intraday plans (regression above) | 2.4 months | 2–46 (needed: 92–300) | **No, for every candidate** |
| `binance-2020`, session-gated intraday plans | 22 months | about 10× more in principle; trade rate 4–153 per 8 months from Phase 1, so roughly 10–400 | Only the highest-frequency plans, and those are the ones killed by costs (`MARKET_COST_SUITABILITY.md`) |
| `binance-2020`, daily-horizon rules (Phase 2.1 hypotheses) | 677 days | Exposure changes 10–103 per 3-year training segment | Power is measured on daily returns (1,095 training days), not trades: adequate for timing tests, weak for trade-level statistics |

**Conclusion:** for intraday, session-gated BTC research the available history is statistically insufficient, and
the strategies that could trade often enough are the ones transaction costs rule out. Longer-horizon research is
testable.

### 6. Residual risks

- **Researcher knowledge.** I have seen the *aggregate* BTC price path of 2020–2025 (it is public market history),
  so hypothesis choice cannot be blind to it. Pre-registration (`preregistration.json`, timestamped before any
  result) limits but cannot remove this.
- **Explicit hold-out reads.** A user can still read the hold-out with `include_holdout`. The system records it and
  marks results non-independent, but cannot prevent it.
- **Split re-definition.** On 2026-11-11 a migration downgrade test destroyed and rebuilt the registry. Both splits
  were re-defined with identical boundaries, and the Phase 1 ledger entry was restored. The downgrade now refuses to
  run while any split exists.

---

<!-- ===== Document 3 of 7: HEALTH_MONITOR_AUDIT.md ===== -->

## Health Monitor Audit

The difference between 562 and 148 trades in Phase 2 was entirely the health monitor working as designed. It
suspended 9 of 10 strategies, most within their first 7–22 trades. With hindsight the suspensions prevented losses
of $143.79. But the trigger behind most of them cannot tell a broken strategy from a sound one under this platform's
2:1-target design. A genuinely profitable +0.2R/trade strategy has a 69% chance of being suspended within 100
trades.

No safety control was weakened. The recommended replacement (§5) is stricter on bad strategies and needs your
approval.

### 1. Method

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

### 2. The rules (`app/core/health.py`, unchanged)

Evaluated after every closed trade of a strategy.

**Suspend if any of:**

- 7 consecutive losses
- drawdown ≥ max(8R, 1.5 × the validated drawdown)
- over the last 30 trades (with at least 15): profit factor < 0.7, or expectancy < −0.2R

**Warn on:** profit factor < 1, negative expectancy, expectancy below 25% of the validated level, or mean entry
slippage > 0.15R.

A suspension disables the strategy and marks it `needs_revalidation`. **There is no automatic resumption**: only a
new passing validation creates a new version that can be enabled.

### 3. Every suspension

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

### 4. Was each suspension justified? Should it have resumed?

#### Condition genuinely met

Yes for all 9; the code fired only on true conditions. Three questions remain.

#### a. Was the strategy actually bad?

- None of the 10 strategies had passed validation (Phase 1: 0 of 36), so none had evidence of an edge to protect.
- After suspension, **7 of 9 kept losing** in the monitor-off run (missed expectancy −0.16R to −0.53R).
- **Ex post, those 7 suspensions were justified**, and resuming them would have lost money.
- **trend_continuation and volatility_expansion** were profitable at suspension (+0.4R and +5.1R) and missed only 5
  and 2 trades, slightly positive. The sample is far too small to say the suspension was wrong.
- **Should they have resumed?** Not without revalidation, which is the rule. They had never passed validation.

#### b. Was the trigger statistically meaningful? Mostly no

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

#### c. Was the drawdown limit calibrated?

- The limit is max(8R, 1.5 × validated drawdown). None of these strategies had a validated drawdown, so the floor
  of 8R applied.
- Simulated over 40 trades (20,000 paths), the probability of a drawdown of at least 8R is **65%** for a break-even
  2:1 strategy and **39%** for a +0.2R one. Same conclusion as (b).

### 5. Recommendation (not implemented; needs approval)

Do not weaken the monitor. The 7-loss and 8R rules are kept as hard backstops. The proposal is to add a calibrated
sequential test that is **more** sensitive to genuine deterioration:

1. **Baseline:** each strategy's *validated* win rate and R distribution, stored at validation time.
2. **Test:** a one-sided CUSUM or SPRT on per-trade R against that baseline, with the false-alarm rate set (for
   example 5% over 250 trades). It suspends a strategy whose live R distribution has shifted below its validated
   one, typically sooner than the streak rule for real deterioration.
3. **Report** the test statistic in the health record, so every suspension shows how unlikely the observed run was
   under the validated performance.

This only matters once a strategy passes validation and the hold-out. None does today.

### 6. Defects found during this audit

| Defect | Status |
|---|---|
| Risk-event and health timestamps used wall-clock time in replays, so suspensions could not be dated | **Fixed** (`TradingService.clock`; events carry `market_time`) |
| No record of when a strategy was suspended, or after how many trades | **Fixed** (`health.suspended_at`, `health.trades_at_suspension`) |
| Health thresholds not calibrated to the 2:1 payoff design | **Documented; not changed** (§5) |
| The backtester has no health monitor, so backtest and paper results diverge whenever it fires | **Documented** (`SIGNAL_PARITY_REPORT.md`) |

---

<!-- ===== Document 4 of 7: SIGNAL_PARITY_REPORT.md ===== -->

## Signal Parity Report (Task 3, defect D3)

**Verdict: signal generation is now identical in the backtester, the paper replay and the real-time engine.**

- On real BTCUSDT data, all three produced the same signals: same plan, same candle, same direction.
- This holds for **27 of 27** `trend_continuation` signals over the window where 5 were previously missed, and for
  **56 of 56** signals from all ten M15 plans over a 3-week window.
- **Executed trades still differ**, for one remaining reason: the real-time engine detects stops and targets only
  on polled quotes, while the backtest sees every candle's high and low.

### 1. Root cause of the 5 missed signals

- The real-time loop evaluated strategies on the last **1,500** candles (`runner.py`, Phase 1).
- `trend_continuation` (M15) filters on an H1 EMA50/EMA200 trend plus ADX, and on an H4 EMA20/EMA50 trend.
- An exponential moving average depends on where its history starts; the starting value's weight after *k* bars is
  (1 − α)^k. In 1,500 M15 candles there are only 93 H4 candles, so the H4 EMA50 retained a material share of
  its arbitrary starting value.
- At a sampled missed signal (2026-08-05 16:00 UTC) the windowed H4 EMA50 differed from the full-history value by
  $31. The windowed H1 EMA200 differed by $25.
- That was enough to flip the "higher timeframe must not oppose" condition when the two EMAs were close.
- Other families use short indicators (ATR(14), MACD, Bollinger(20)) that converge within 1,500 candles. That is why
  only this family was affected.

### 2. Fix

- `Strategy.required_bars(params, base_minutes)`: each family computes how many entry-timeframe bars it needs so
  every recursive indicator's dependence on the starting point is below **1e-9**. EMA span *s* needs
  ln(1e-9) / ln(1 − 2/(s+1)) bars; Wilder smoothing *n* needs ln(1e-9) / ln(1 − 1/n). Higher-timeframe indicators
  are multiplied by the timeframe ratio.
- **The same rule everywhere.** `Strategy.generate` emits no signal until that history exists. This applies to the
  backtester, research, paper replay and real time alike. Research segment warm-ups use it too (they were a fixed
  900 bars).
- **Real-time loop.** `runner.ensure_history` loads that many closed candles from the per-timeframe live dataset
  (`binance-M15-live`), backfilling from the feed when needed. If complete history cannot be assembled, signals are
  **not evaluated**, and the reason is reported instead of the engine running on partial history.

Required history for the M15 plans (minutes per bar: 15):

| Plan family | Required bars | Days |
|---|---|---|
| trend_continuation | 8,370 | 87.2 |
| momentum_breakout, sr_breakout | 610 | 6.4 |
| asian_orb, liquidity sweeps, prev_session / prev_day breakouts | 568 | 5.9 |
| range_expansion, volatility_expansion | 380 | 4.0 |

Side effect: the backtester no longer trades `trend_continuation` in a dataset's first 87 days, where its indicators
had not converged. This is why the repaired Phase 1 portfolio has 555 trades, not 562.

### 3. Three-way replay on real data

**Method.**

- Data: real BTCUSDT M15 (`binance` dataset); the ten Phase 1 M15 plans with their stored parameters; $300.
- Each run used an isolated in-memory database. The health monitor was disabled, so this measures signal and
  execution parity, not suspension policy (audited in `HEALTH_MONITOR_AUDIT.md`).

| Source | What produces the signals |
|---|---|
| (a) Backtest | `Plan.generate` on the full history |
| (b) Paper replay | `jobs.run_replay`: the paper engine fed bar by bar, all signals recorded in the journal |
| (c) Real-time engine | The real `runner.step_account`, called once per closed candle (candle close + 5 s). The feed serves the latest 500 candles (including the forming one, as Binance does) and a quote at the last close. Backfill comes from the same data |

#### Run A: `trend_continuation`, 2026-07-06 17:00 → 2026-11-11 11:00 (the window with the 5 misses)

| | Backtest | Replay | Real time |
|---|---|---|---|
| Signals | 27 | 27 | 27 |
| Signals only in this source, or with opposite direction | — | 0 | 0 |
| Real-time steps / errors | | | 12,265 / 0 |
| Trades entered in window | | 25 | 24 |

#### Run B: all ten M15 plans, 2026-10-01 → 2026-10-22

| | Backtest | Replay | Real time |
|---|---|---|---|
| Signals | 56 | 56 | 56 |
| Signals only in this source, or with opposite direction | — | 0 | 0 |
| Real-time steps / errors | | | 2,017 / 0 |
| Trades entered in window | | 30 | 28 |

### 4. Every discrepancy (executed trades, replay vs real time)

Timestamps are the signal candle's open time, in UTC.

#### Run A (`trend_continuation`)

| Trade | Replay | Real time | Explanation |
|---|---|---|---|
| 2026-07-08 16:30 | take profit (+2.00R) | time exit (+1.23R) | Target touched intrabar, never at a polled close; real time held to the 24 h limit |
| 2026-07-09 13:15 | take profit | **not taken** | Real time was still holding the 2026-07-08 trade until 2026-07-09 16:30, so the entry was refused as a duplicate position. Consequence of the row above |
| 2026-08-20 13:15 | stop (−1.00R) | take profit (+2.00R) | Stop touched intrabar; no polled close was below it; price later reached the target |
| 2026-08-21 12:45 | stop (−1.00R) | time exit (−0.19R) | Intrabar stop not seen at closes |
| 2026-08-25 14:30 | stop (−1.00R) | time exit (−0.85R) | Same |
| 2026-08-31 14:45 | stop (−1.00R) | time exit (−0.27R) | Same |
| 2026-09-30 15:45 | stop (−1.00R) | time exit (−0.40R) | Same |

18 of the 24 trades present in both had the same exit reason.

#### Run B (all ten M15 plans)

| Trade | Replay | Real time | Explanation |
|---|---|---|---|
| asian_orb 2026-10-09 03:45 | take profit (+2.00R) | time exit (−0.01R) | Target touched intrabar only |
| prev_session_breakout 2026-10-11 12:45 | stop (−1.00R) | take profit (+2.00R) | Stop touched intrabar only |
| asian_orb 2026-10-01 03:45 | not taken | stop (−1.36R) | **Account-state difference.** The real-time account started fresh at the window ($300, no loss streak), while the replay account carried 11 months of history. The −1.36R also shows the polling exit: the stop was recognised at a close beyond it. The replay's rejection reason was not captured by the harness |
| momentum_breakout 2026-10-11 15:45 | take profit | not taken | Real time was still holding the prev_session_breakout trade from 12:45 (closed 16:30), so the entry was refused as a duplicate position. Consequence of the row above |
| momentum_breakout 2026-10-21 13:15 | stop | not taken | Account-state path dependence; rejection reason not captured |
| trend_continuation 2026-10-21 14:00 | stop | not taken | Same |

25 of the 27 trades present in both had the same exit reason. Fill-time difference: 5 s (candle close + 5 s in real
time vs the next candle's open in replay). Entry prices differ only by close-vs-next-open.

### 5. Interpretation and remaining discrepancies

1. **Signal generation: resolved.** No discrepancy in 83 signals across both runs (27 + 56).
2. **Exit detection: remaining, by design of the paper engine.**
   - Real-time paper checks stops and targets on polled quotes only.
   - This harness polled once per 15-minute candle, which **exaggerates** the effect. Production polls every
     `ATP_TRADING_LOOP_SECONDS` = 5 s, so far fewer intrabar touches are missed, but some are.
   - That real time looked *better* here (−3.9R vs −6.8R in Run A) is an artefact of slow polling, not a benefit:
     stops were missed as well as targets.
   - With a live broker, stops and targets sit server-side and fill on any touch, which is closer to the backtest's
     rule than to polling paper. The paper engine could do the same by checking the high and low of each new candle
     on arrival; that is a recommended follow-up, not implemented here.
3. **Account-state path dependence: expected.** Once one exit differs, later sizing, duplicate-position checks and
   loss-streak locks differ too. These are consequences of item 2, not independent defects.
4. **Health monitor:** absent from the backtester and active in paper and live; a deliberate difference
   (`HEALTH_MONITOR_AUDIT.md`).

### 6. Reproducing

The harness (`parity.py`) is in the session scratchpad, not the repository. It reads the main database read-only and
runs each engine against an isolated in-memory database. Unit tests in `backend/tests/test_phase21_repairs.py`
(`TestRequiredHistory`) pin the equality of windowed and full-history signals for all ten M15 plans.

---

<!-- ===== Document 5 of 7: MARKET_COST_SUITABILITY.md ===== -->

## Market Cost Suitability

**Filter:** median candle range ≥ 5 × round-trip transaction cost. It is a necessary condition for a strategy to
have room to pay its costs, not evidence of profitability. Measured on training + validation data only; the hold-out
was not read.

### Verdict

| Instrument | Data quality | Unsuitable (fails even at the low-cost estimate) | Marginal (passes only at the low-cost estimate) | Suitable at the higher cost estimate |
|---|---|---|---|---|
| **BTCUSDT** (Binance spot) | **Measured**: actual instrument, actual fee | **M5, M15, M30 in every session; H1 Asian and London** | H1 New York (only with the BNB fee discount) | **H4 only** (all three sessions) |
| **EURUSD** | **Proxy** price movement (Binance EUR/USDT); **estimated** retail costs | M5 in every session; M15 Asian | M30 Asian | M15 London / New York, M30 London / New York, H1 and H4 in all sessions |
| **XAUUSD** | **Proxy** price movement (Binance PAXG/USDT, thin market); **estimated** retail costs | M5 Asian and London | M5 New York | M15 and above in every session |
| **GBPUSD** | **Not measured** | — | — | No reachable documented data source |
| **USDJPY** | **Not measured** | — | — | No reachable documented data source |

**BTCUSDT intraday (M5–M30) is unsuitable in every session at retail spot fees.** Even with the BNB discount, the
median M30 candle in the New York session moves only 3.96× the round-trip fee. This matches the Phase 2 finding
that commission caused about 90% of the −60.6% loss.

### 1. Costs used

| Instrument | Round-trip cost | Basis | Status |
|---|---|---|---|
| BTCUSDT | 15.01 bp (BNB 0.075%/side) or 20.01 bp (VIP 0 0.100%/side) | Binance spot fee schedule (read 2026-11-11). Spread **measured** at 1 tick ($0.01 ≈ 0.001 bp), median of 60 samples over 104 s on 2026-11-11 16:47 UTC. Market-order cost vs mid for $300 / $3,000 / $30,000 orders: half the spread, no depth impact | Fee: **actual published fee**. Spread / slippage: **measured once** (one snapshot; spreads widen in stress) |
| EURUSD | 1.0 / 1.4 pips | Low: 0.1 pip raw spread + $7 per lot commission + 0.1 pip slippage. High: 1.2 pip spread + 0.2 pip slippage | **Estimate**, not verified for any broker |
| XAUUSD | $0.29 / $0.40 per oz | Low: $0.12 spread + $0.07 commission + $0.10 slippage. High: $0.30 spread + $0.10 slippage | **Estimate**, not verified for any broker |
| GBPUSD | 1.2 / 1.8 pips | — | Estimate; no movement data to compare it with |
| USDJPY | 1.0 / 1.5 pips | — | Estimate; no movement data to compare it with |

Any real broker quote replaces these estimates; re-run `research/phase2_1/suitability.py`.

### 2. Price-movement data

| Instrument | Source | Period (pre-hold-out) | Caveats |
|---|---|---|---|
| BTCUSDT | Binance BTCUSDT spot M5 (dataset `binance-2020`, registered, checksum stored) | 2020-01-01 → 2024-11-10 | The actual traded instrument |
| EURUSD | **Proxy:** Binance EUR/USDT M5, weekdays inside FX hours only | 2021-01-01 → 2024-11-10 | A crypto-venue price of EUR in USDT, not the interbank rate; ranges may include venue noise. Sanity check: London H1 median 13.4 bp ≈ 15 pips, which is plausible for EURUSD (from memory, not verified here) |
| XAUUSD | **Proxy:** Binance PAXG/USDT M5 (tokenised gold), weekdays inside FX hours only | 2021-01-01 → 2024-11-10 | Thin market: 6,236 zero-volume candles (1.5%) excluded; ranges in thin periods are unreliable |
| GBPUSD, USDJPY | None | — | Dukascopy (documented free bid/ask history) refused connections from this environment. Binance has no live GBP or JPY pair (GBP/USDT is suspended) |

**Movement metric:** median (and 25th-percentile) high − low of candles that **open** inside the session window,
in basis points of the open. Session windows are the fixed IST research windows: Asian 08–12, London 13–17,
New York 18–23.

### 3. Full matrix

##### BTCUSDT

| TF | Session | Candles | Median range (bp) | p25 range (bp) | Round-trip cost (bp) low / high | Ratio low / high | ≥ 5× at high cost? |
|---|---|---|---|---|---|---|---|
| M5 | asia | 85,027 | 14.8 | 8.7 | 15.01 / 20.01 | 1.0 / 0.7 | FAIL |
| M5 | london | 85,190 | 16.3 | 9.6 | 15.01 / 20.01 | 1.1 / 0.8 | FAIL |
| M5 | newyork | 106,438 | 22.7 | 13.9 | 15.01 / 20.01 | 1.5 / 1.1 | FAIL |
| M15 | asia | 28,343 | 27.0 | 16.7 | 15.01 / 20.01 | 1.8 / 1.4 | FAIL |
| M15 | london | 28,397 | 29.9 | 18.4 | 15.01 / 20.01 | 2.0 / 1.5 | FAIL |
| M15 | newyork | 35,480 | 41.3 | 25.9 | 15.01 / 20.01 | 2.8 / 2.1 | FAIL |
| M30 | asia | 14,172 | 39.0 | 24.5 | 15.01 / 20.01 | 2.6 / 2.0 | FAIL |
| M30 | london | 14,199 | 43.4 | 26.9 | 15.01 / 20.01 | 2.9 / 2.2 | FAIL |
| M30 | newyork | 17,740 | 59.5 | 37.8 | 15.01 / 20.01 | 4.0 / 3.0 | FAIL |
| H1 | asia | 7,092 | 55.3 | 35.1 | 15.01 / 20.01 | 3.7 / 2.8 | FAIL |
| H1 | london | 7,102 | 63.0 | 39.5 | 15.01 / 20.01 | 4.2 / 3.1 | FAIL |
| H1 | newyork | 8,871 | 87.0 | 55.9 | 15.01 / 20.01 | 5.8 / 4.3 | pass only at low cost |
| H4 | asia | 1,776 | 116.7 | 74.5 | 15.01 / 20.01 | 7.8 / 5.8 | **PASS** |
| H4 | london | 1,776 | 133.6 | 82.6 | 15.01 / 20.01 | 8.9 / 6.7 | **PASS** |
| H4 | newyork | 1,776 | 161.6 | 106.7 | 15.01 / 20.01 | 10.8 / 8.1 | **PASS** |

##### EURUSD

| TF | Session | Candles | Median range (bp) | p25 range (bp) | Round-trip cost (bp) low / high | Ratio low / high | ≥ 5× at high cost? |
|---|---|---|---|---|---|---|---|
| M5 | asia | 43,788 | 1.8 | 0.9 | 0.92 / 1.29 | 2.0 / 1.4 | FAIL |
| M5 | london | 48,270 | 3.7 | 1.8 | 0.92 / 1.29 | 4.0 / 2.9 | FAIL |
| M5 | newyork | 60,342 | 4.5 | 1.9 | 0.92 / 1.29 | 4.9 / 3.5 | FAIL |
| M15 | asia | 14,596 | 3.7 | 1.8 | 0.92 / 1.29 | 4.0 / 2.9 | FAIL |
| M15 | london | 16,090 | 7.2 | 3.7 | 0.92 / 1.29 | 7.8 / 5.6 | **PASS** |
| M15 | newyork | 20,114 | 8.4 | 4.6 | 0.92 / 1.29 | 9.1 / 6.5 | **PASS** |
| M30 | asia | 7,298 | 5.6 | 2.7 | 0.92 / 1.29 | 6.1 / 4.3 | pass only at low cost |
| M30 | london | 8,045 | 8.9 | 6.0 | 0.92 / 1.29 | 9.7 / 6.9 | **PASS** |
| M30 | newyork | 10,057 | 10.2 | 7.3 | 0.92 / 1.29 | 11.1 / 7.9 | **PASS** |
| H1 | asia | 3,752 | 8.6 | 4.6 | 0.92 / 1.29 | 9.4 / 6.7 | **PASS** |
| H1 | london | 4,023 | 13.4 | 8.7 | 0.92 / 1.29 | 14.6 / 10.4 | **PASS** |
| H1 | newyork | 5,029 | 16.0 | 9.2 | 0.92 / 1.29 | 17.3 / 12.4 | **PASS** |
| H4 | asia | 941 | 22.9 | 15.6 | 0.92 / 1.29 | 24.9 / 17.8 | **PASS** |
| H4 | london | 1,006 | 28.6 | 18.8 | 0.92 / 1.29 | 31.1 / 22.2 | **PASS** |
| H4 | newyork | 1,006 | 24.8 | 17.0 | 0.92 / 1.29 | 27.0 / 19.3 | **PASS** |

##### XAUUSD

| TF | Session | Candles | Median range (bp) | p25 range (bp) | Round-trip cost (bp) low / high | Ratio low / high | ≥ 5× at high cost? |
|---|---|---|---|---|---|---|---|
| M5 | asia | 42,823 | 5.5 | 4.3 | 1.53 / 2.11 | 3.6 / 2.6 | FAIL |
| M5 | london | 47,931 | 6.0 | 5.1 | 1.53 / 2.12 | 3.9 / 2.9 | FAIL |
| M5 | newyork | 60,130 | 10.0 | 5.4 | 1.53 / 2.12 | 6.5 / 4.7 | pass only at low cost |
| M15 | asia | 14,586 | 10.8 | 5.6 | 1.53 / 2.11 | 7.1 / 5.1 | **PASS** |
| M15 | london | 16,090 | 14.0 | 8.6 | 1.53 / 2.12 | 9.2 / 6.6 | **PASS** |
| M15 | newyork | 20,114 | 17.2 | 10.9 | 1.53 / 2.12 | 11.2 / 8.1 | **PASS** |
| M30 | asia | 7,298 | 16.1 | 10.3 | 1.53 / 2.11 | 10.5 / 7.6 | **PASS** |
| M30 | london | 8,045 | 20.4 | 12.0 | 1.53 / 2.12 | 13.3 / 9.7 | **PASS** |
| M30 | newyork | 10,057 | 26.1 | 16.9 | 1.53 / 2.12 | 17.0 / 12.3 | **PASS** |
| H1 | asia | 3,752 | 24.1 | 15.6 | 1.53 / 2.11 | 15.7 / 11.4 | **PASS** |
| H1 | london | 4,023 | 28.9 | 19.9 | 1.53 / 2.12 | 18.9 / 13.7 | **PASS** |
| H1 | newyork | 5,029 | 36.5 | 25.7 | 1.53 / 2.12 | 23.8 / 17.3 | **PASS** |
| H4 | asia | 941 | 48.9 | 35.4 | 1.53 / 2.11 | 32.0 / 23.2 | **PASS** |
| H4 | london | 1,006 | 54.7 | 39.9 | 1.53 / 2.12 | 35.7 / 25.9 | **PASS** |
| H4 | newyork | 1,006 | 57.8 | 44.9 | 1.53 / 2.12 | 37.7 / 27.3 | **PASS** |

### 4. What this means for strategy design

1. **BTCUSDT on Binance spot, retail fee tier.**
   - Only H4-scale moves (median 134–162 bp per candle) clear the bar, so holding periods must be many hours to
     days.
   - Every Phase 1 strategy traded M5–H1 inside session windows, which is structurally excluded.
   - The Phase 2.1 hypotheses were therefore designed at the daily horizon (`RESEARCH_HYPOTHESES.md`).
2. **EURUSD and XAUUSD** pass at intraday timeframes from M15 upward **on the proxy data and estimated costs**.
   Before any research there:
   - real broker bid/ask history is needed (`../phase2/DATA_REQUIREMENTS.md`);
   - the costs must be replaced by a real broker's;
   - for a resident of India, the legal constraint applies: overseas CFD routes are blocked, and the lawful NSE
     cross-currency futures have different costs and hours.
3. **Gold at $300.**
   - Even where gold passes this filter, the 0.01-lot minimum (1 oz) means a typical 1.5× ATR stop risks more than
     the $1.50 budget.
   - The risk engine rejects such trades (`MIN_LOT_EXCEEDS_RISK`).
   - This is an account-size problem the filter does not capture.
4. **A pass here is necessary, not sufficient.** Phase 1's BTC strategies also had no edge before costs.

### 5. Limitations

- The cost ratio uses the *median* candle. Many trades occur in quieter-than-median conditions (see the p25
  column), where costs bite harder.
- The BTC spread and slippage measurement is a single snapshot. Its effect is negligible next to the fee, but in
  stressed markets it would rise.
- The proxy data is not the instruments themselves.
- No timeframe below M5 or above H4 was measured.

---

<!-- ===== Document 6 of 7: RESEARCH_HYPOTHESES.md ===== -->

## Research Hypotheses (Phase 2.1)

**Result: none of the five pre-registered hypotheses passed the training gate after correcting for multiple
testing.** Under the pre-registered rules they were not advanced. The validation and hold-out segments of
`binance-2020` therefore remain unread, and its hold-out ledger is empty.

There is **no validated, viable strategy**. One research direction is worth a single, separately pre-registered
confirmatory test (§5).

### 1. Why these hypotheses, and why daily

- **Costs.** `MARKET_COST_SUITABILITY.md` shows BTCUSDT spot at retail fees clears the 5× cost filter only at H4
  and above. All hypotheses therefore make decisions once a day.
- **Not variants of Phase 1.** None reuses the Phase 1 families or parameter grids.
- **Fixed in advance.** Each has one fixed parameter set, chosen before any result from conventional values, and an
  economic rationale.
- **Timestamp.** Hypotheses, rules, parameters, costs, tests and gates are in `preregistration.json`, registered
  **2026-11-11 16:49:24 UTC**, before any hypothesis was computed. Nothing in it changed afterwards.

| ID | Rule (long or flat; spot, no leverage) | Parameters | Economic rationale |
|---|---|---|---|
| H1 | Long while the trailing 30-day log return is > 0 | 30 days | **Time-series momentum.** Slow information diffusion and trend-following flows; documented across asset classes and, in the literature, in crypto (cited from memory, not re-verified here) |
| H2 | H1's direction × min(1, 40% ÷ 30-day realised volatility), rebalanced on > 10% drift | 30 d, 40%, 0.10 | **Volatility clustering.** Cutting exposure when volatility is high improves risk-adjusted return if high volatility does not bring proportionally higher return |
| H3 | Enter on a close above the prior 55-day high; exit on a close below the prior 20-day low | 55 / 20 | **Volatility-expansion breakout.** A range break marks a trend's start; asymmetric exit lets trends run |
| H4 | After a day falling more than 2.5 × the 30-day daily standard deviation, long for 3 days | 2.5σ, 30 d, 3 d | **Liquidity provision.** Forced liquidation of leveraged positions overshoots; liquidity providers are paid to absorb it |
| H5 | If the day trades below the prior 20-day low but closes back above it, long for 5 days | 20 d, 5 d | **Breakout failure.** Stops below an obvious level are absorbed; failure to hold the break signals exhausted selling, at a horizon where moves dwarf costs |

Other areas from the brief, and why they were not tested:

| Area | Why not tested |
|---|---|
| Session transitions | Would need intraday turnover. A round trip costs 20 bp: 0.48–0.74× a median M15 candle range and 0.23–0.36× a median H1 candle range (by session). Fails the 5× cost filter on BTC spot |
| Intraday mean reversion | Fails the cost filter on BTC spot |
| Higher-timeframe directional bias | Is H1's filter itself |
| Volatility-adjusted momentum | Is H2 |
| FX and gold | No real bid/ask history reachable (see `MARKET_COST_SUITABILITY.md`) |

### 2. Test design (as pre-registered)

| Element | Setting |
|---|---|
| Data | `binance-2020` (BTCUSDT spot), daily candles built from M5 via the dataset registry. The load stops before the hold-out (last bar used: H4 2024-11-10 20:00). Quality: 466 of 511,488 expected M5 candles missing (0.09%); none affects a complete day |
| Timing | Decision at the daily close (00:00 UTC) using data up to that close; the position earns the **next** day's return |
| Costs | 10 bp commission + 0.5 bp spread/slippage allowance per side, charged on every change in exposure |
| Primary test | Timing skill via circular-shift permutation: the exposure series is shifted against returns by a random offset (2,000 shifts, minimum 30 days); p = share of shifts with mean gross return ≥ actual. Costs are identical under a shift, so this isolates timing from cost |
| Multiple testing | Holm–Bonferroni across the five hypotheses, family-wise α = 0.05 |
| Train gate | Holm-adjusted p < 0.05 **and** net Sharpe > 0 |
| Later gates | Validation only for train survivors; hold-out only for validation survivors |

### 3. Results: training segment, 2020-01-01 → 2023-01-01 (1,095 days)

| Hypothesis | Exposure | Exposure changes | Gross return | Net return | Cost drag | Net Sharpe | Max drawdown | Buy & hold (Sharpe) | Timing p | Holm p | Decision |
|---|---|---|---|---|---|---|---|---|---|---|---|
| H1 30-day momentum | 50% | 80 | +358.8% | +321.8% | 37.0 pts | +1.27 | 46.1% | +130.8% (+0.76) | 0.028 | 0.140 | stop |
| H2 Vol-scaled momentum | 50% | 103 | +156.4% | +141.0% | 15.3 pts | +1.12 | 37.2% | +130.8% (+0.76) | 0.086 | 0.344 | stop |
| H3 Donchian 55/20 | 40% | 10 | +189.9% | +186.8% | 3.0 pts | +1.01 | 43.0% | +130.8% (+0.76) | 0.233 | 0.700 | stop |
| H4 Crash reversal | 6% | 40 | +5.6% | +1.3% | 4.3 pts | +0.13 | 32.4% | +130.8% (+0.76) | 0.477 | 0.954 | stop |
| H5 Failed breakdown | 14% | 44 | −52.7% | −54.8% | 2.2 pts | −0.48 | 66.4% | +130.8% (+0.76) | 0.969 | 0.969 | stop |

Validation: not evaluated (no survivors). Hold-out: not evaluated, ledger empty.

#### Reading the results

- **H1–H3 beat buy-and-hold on return and Sharpe in training.** But the training segment is one bull market
  (2020–21) followed by one crash (2022), the ideal case for any trend rule. The timing test asks whether the timing
  beats random shifts of the same exposure pattern.
  - Only H1 reaches nominal significance (p = 0.028).
  - After testing five hypotheses, Holm-adjusted p = 0.14 does not meet the pre-registered 0.05.
- **H2 and H3** have positive but non-significant timing.
- **H4** (6% of days in the market) and **H5** show no timing skill. H5 is strongly negative: in this period a
  failed breakdown preceded further falls.
- **H1's drawdowns are large:** 46% max on a long-or-flat rule. Any deployment would need its own risk framing.

### 4. Multiple-testing accounting

Configurations examined to date, which must count against any future claim of edge:

| Source | Count |
|---|---|
| Phase 1 grids | 846 evaluations (36 plans) |
| Phase 2.1 hypotheses | 5 (single parameter set each) |

The Phase 1 grids were searched on different data (2025–26), but on the same instrument, so later claims about
BTCUSDT should be read against roughly 850 prior attempts.

### 5. The one direction worth a single follow-up (needs your approval)

**H1, BTC 30-day time-series momentum, as a single pre-registered confirmatory test on the validation segment**
(2023-01-01 → 2024-11-11, never read).

| Point | Detail |
|---|---|
| Legitimacy | Selection used only training data. A *single* new pre-registered hypothesis tested once on unread data is a valid confirmation. It must be registered as a new study with α = 0.05 for one test, and must not be broadened if it fails |
| Why it is not dismissed | It has the strongest training timing evidence of the five (raw p = 0.028) and a well-documented mechanism |
| Why it is not promising yet | Raw p = 0.028 after choosing the best of five is roughly what chance produces (Holm 0.14). Its training return comes mostly from two regimes that favour any trend rule |
| If it passes validation | The hold-out (2024-11-11 → 2025-11-10) is read once, through the ledger |
| Platform fit | Even then, it is a daily long/flat rule. It does not fit the platform's intraday, session-based engine (24 h maximum hold, session windows), so using it would be a new strategy type |

H2 and H3 are the same family (trend-following) and are not independent second chances; they should not be tested
alongside H1 without being counted.

### 6. Reproducing

From `backend/`:

```bash
.venv/bin/python ../research/phase2_1/hypotheses.py out.json
```

Reads `preregistration.json`; deterministic (fixed seeds).

---

<!-- ===== Document 7 of 7: preregistration.json ===== -->

## preregistration.json

Registered at the timestamp below, before any hypothesis result existed. Reproduced verbatim.

```json
{
  "registered_at_utc": "2026-11-11T16:49:24Z",
  "registered_before_any_result": true,
  "dataset": {"symbol": "BTCUSDT", "source": "binance-2020", "base_timeframe": "M5", "venue": "Binance spot",
              "train": ["2020-01-01", "2023-01-01"], "validation": ["2023-01-01", "2024-11-11"],
              "holdout": ["2024-11-11", "2025-11-11"], "holdout_rule": "evaluated only for hypotheses that pass validation; logged in the dataset ledger"},
  "bar": "daily, 00:00-24:00 UTC, built from M5; decision at the daily close using data up to and including that close; position earns the NEXT day's return",
  "direction": "long or flat only (spot, no shorting, no leverage); exposure in [0, 1]",
  "costs": {"commission_per_side_bp": 10.0, "spread_and_slippage_per_side_bp": 0.5,
            "applied": "per unit of absolute change in exposure", "basis": "Binance VIP 0 published fee; spread/slippage is a conservative allowance (measured ~0.001 bp)"},
  "hypotheses": {
    "H1_tsmom30": {"rule": "exposure 1 if trailing 30-day log return > 0 else 0", "params": {"lookback_days": 30},
                   "rationale": "Time-series momentum: slow information diffusion and trend-following flows (documented for many asset classes and for crypto in the academic literature)."},
    "H2_vol_scaled_tsmom": {"rule": "H1 sign x min(1, 0.40 / annualised 30-day realised volatility); rebalance only when target differs from current exposure by > 0.10",
                            "params": {"lookback_days": 30, "target_vol": 0.40, "rebalance_band": 0.10},
                            "rationale": "Volatility clustering: cutting exposure when volatility is high improves risk-adjusted returns if high volatility does not bring proportionally higher returns."},
    "H3_donchian_55_20": {"rule": "enter (exposure 1) when the daily close exceeds the prior 55-day high; exit when the daily close falls below the prior 20-day low",
                          "params": {"entry_days": 55, "exit_days": 20},
                          "rationale": "Volatility-expansion breakout: a range break marks the start of a trend; a classic trend-following rule with an asymmetric exit."},
    "H4_crash_reversal": {"rule": "after a day whose return < -2.5 x trailing 30-day daily standard deviation, exposure 1 for the next 3 days",
                          "params": {"z": 2.5, "vol_days": 30, "hold_days": 3},
                          "rationale": "Liquidity provision: forced liquidations of leveraged positions push prices below fundamental value temporarily; buyers who absorb the flow are compensated."},
    "H5_failed_breakdown": {"rule": "if the day's low trades below the prior 20-day low but the day closes above that level, exposure 1 for the next 5 days",
                            "params": {"lookback_days": 20, "hold_days": 5},
                            "rationale": "Breakout failure: stops below an obvious level are run and absorbed; the failure to hold the break signals exhausted selling at a horizon where moves dwarf costs."}
  },
  "tests": {
    "primary": "timing skill: circular-shift permutation of the exposure series against daily returns (2000 shifts, minimum shift 30 days); p = share of shifts whose mean net return >= actual. Costs are path-identical under a shift, so this tests timing, not cost.",
    "secondary": ["net Sharpe ratio (daily returns x sqrt(365))", "net total return", "comparison with buy-and-hold over the same segment", "max drawdown", "exposure share", "number of exposure changes"],
    "multiple_testing": "Holm-Bonferroni across the 5 hypotheses at family-wise alpha 0.05 on the TRAINING segment"
  },
  "gates": {
    "train": "Holm-adjusted timing p < 0.05 AND net Sharpe > 0",
    "validation": "only train survivors; timing p < 0.05 AND net Sharpe > 0 AND net total return > 0",
    "holdout": "only validation survivors; net Sharpe > 0 AND net total return > 0; reported with the ledger entry"
  },
  "not_allowed": ["changing any parameter after seeing results", "adding hypotheses after seeing results without counting them in the multiple-testing family", "looking at validation for train failures", "looking at the hold-out for validation failures"]
}
```
