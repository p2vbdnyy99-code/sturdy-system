# Phase 2.1 Repair Report

Recorded 2026-11-11.

| Item | Status |
|---|---|
| Version control | Not committed, not pushed, not deployed (as instructed) |
| Live-trading settings | Not modified. No strategy is enabled for live trading; the live gate is now **stricter** (§2, D1) |
| Strategy parameters | Not modified. All research re-runs were read-only or ran in isolated in-memory databases |

## 1. Summary

| | Result |
|---|---|
| Defects fixed | D1, D2, D3, D8, plus two found in this phase (wall-clock timestamps in replays; quarantine bypass) |
| Defects remaining | Quote-polling exit detection in real-time paper; health thresholds not calibrated to the 2:1 design; D4, D5; no Redis-based job queue (see §3) |
| Tests | **152 passed** on SQLite and **152 passed** on PostgreSQL 16 (was 118). Alembic upgrade / downgrade / upgrade / check passed on a scratch database. Mobile app type-check (`tsc --noEmit`, strict) passed |
| Verdict on Phase 1 strategies | Unchanged: **0 of 36** pass through the repaired pipeline, and **0 of 36** have a validation sample large enough to detect +0.2R |
| New research | 5 pre-registered daily hypotheses; **none passes** the multiple-testing-corrected training gate. Validation and hold-out remain unread |
| Viable research direction | **None validated.** One single-hypothesis confirmatory test is worth running with your approval (`RESEARCH_HYPOTHESES.md` §5) |

## 2. Defects fixed

| ID | Defect | Fix | Verified by |
|---|---|---|---|
| **D1** | Walk-forward test windows were the out-of-sample rows | Three independent chronological segments per dataset, immutable split, nested walk-forward inside training, statistical-power gate, separate hold-out job with ledger and reuse flag. The live gate now also requires a passed, *independent* hold-out | `TestIndependentSplit` (6 tests), updated API / risk / scenario tests; `VALIDATION_METHODOLOGY.md` |
| **D2** | 499 live M15 candles in source `binance` shadowed a year of M5 history | Dataset registry: one base timeframe per dataset; live candles in `<feed>-<TF>-live`; duplicate, grid, interval, calendar-gap and date-range checks reject bad data; provenance and SHA-256 checksum; migration 0002 quarantined the offending rows | `TestDatasetIntegrity` (11 tests). On real data, `store.load(BTCUSDT, M15, binance)` now returns 35,040 candles (was 499) |
| **D3** | Real-time loop evaluated 1,500 candles; `trend_continuation` needs 8,370 for its H1 EMA200 / H4 EMA50 to converge, so it missed 5 of 27 out-of-sample signals | Each family computes `required_bars` (seed influence < 1e-9). Signals are suppressed until that history exists, in backtest, replay and real time alike. The real-time loop backfills it into the live dataset; validation warm-ups use it | `TestRequiredHistory` (13 tests) and the real-data three-way parity runs (`SIGNAL_PARITY_REPORT.md`) |
| **D8** | Reported costs omitted slippage; paper trades recorded no spread or slippage | Per-trade `spread_cost`, `slippage_cost`, `pnl_before_costs` (backtest and paper; migration 0003). The cost breakdown separates **published exchange fees** from **estimated execution costs**; the ledger identity is tested against independently computed mid-price P&L | `TestCostAccounting` (3 tests) |
| New | Risk events and health checks were stamped with wall-clock time in replays, so suspensions could not be dated | `TradingService.clock` (market time); `health.suspended_at` and `trades_at_suspension` | Health audit replay (`HEALTH_MONITOR_AUDIT.md`) |
| New | Writing to a new dataset named `…-quarantined` created it instead of refusing; a registry rebuild could re-classify quarantined data as historical | `kind_for_source` recognises the suffix; `upsert` refuses; migration 0002 keeps the status and refuses a downgrade that would destroy splits or ledgers | `test_quarantined_source_names_stay_quarantined_on_reregistration`; migration downgrade refusal observed |

### Effect on the Phase 1 headline

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

## 3. Defects remaining (not fixed in this phase)

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

## 4. Tests

| Suite | Result |
|---|---|
| Backend, SQLite in-memory | **152 passed** |
| Backend, PostgreSQL 16 | **152 passed** |
| Alembic on a scratch PostgreSQL database: upgrade head → downgrade base → upgrade head → check | Passed; no drift |
| Working database | At head (`0003`); downgrade correctly **refused** while dataset splits exist |
| Mobile `tsc --noEmit` (strict) | Passed |
| Lint (`ruff` E, F, W) | Clean |

New test file: `backend/tests/test_phase21_repairs.py` (34 tests).

## 5. Incident during this phase (disclosed)

While verifying migration 0002 I ran `alembic downgrade` on the **working** database instead of a scratch copy. It
dropped the dataset registry, including both dataset splits and the 1-year dataset's ledger entry. Re-upgrading
also re-registered the quarantined M15 rows as historical.

- **Lost:** registry metadata only. Candles were untouched. The `binance-2020` ledger was empty, and no hold-out had
  been read.
- **Restored:** both splits with identical boundaries; the Phase 1 ledger entry; the quarantine status and reason.
- **Not original after restoration:** the `defined_at` timestamps of both splits, and the restored ledger entry's timestamp (16:54:52 UTC; the original was written at 16:45:31 UTC). The entry's content is identical.
- **Prevention:** the migration now refuses to downgrade while any split exists (overridable only with
  `ATP_ALLOW_SPLIT_LOSS=1`), and quarantine survives re-registration.

## 6. Datasets after Phase 2.1 (registry)

| Dataset | Kind | Base TF | Candles | Missing | Split (train / validation / hold-out start) | Hold-out ledger |
|---|---|---|---|---|---|---|
| BTCUSDT `binance-2020` | historical | M5 | 616,142 | 466 (0.076%) | 2020-01-01 / 2023-01-01 / 2024-11-11 | **empty** (untouched) |
| BTCUSDT `binance` | historical | M5 | 105,119 | 0 | 2025-11-11 / 2026-06-18 / 2026-08-30 | 1 entry: read by Phase 1 before splits existed (not independent) |
| BTCUSDT `binance-M15-quarantined` | quarantined | M15 | 499 | 0 | — | unusable |

Proxy price data for EUR/USDT and PAXG/USDT (2021-01-01 → 2024-11-10) was used for Task 6 only. It is held in the
session scratchpad and is not registered or committed.

## 7. Deliverables

| File | Contents |
|---|---|
| `PHASE_2_1_REPAIR_REPORT.md` | This report |
| `VALIDATION_METHODOLOGY.md` | Task 1: design, enforcement, exact boundaries, power analysis |
| `SIGNAL_PARITY_REPORT.md` | Task 3: D3 root cause, three-way parity on real data, every discrepancy |
| `HEALTH_MONITOR_AUDIT.md` | Task 4: every suspension, justification, calibration |
| `MARKET_COST_SUITABILITY.md` | Tasks 5–6: verified fees, measured spread, movement-to-cost matrix |
| `RESEARCH_HYPOTHESES.md` | Task 7: pre-registered hypotheses and results |
| `preregistration.json`, `hypotheses.py`, `suitability.py` | Reproducible research code and the timestamped pre-registration |
