# Phase 2 Research Plan

**Scope:** BTCUSDT, XAUUSD, EURUSD, GBPUSD and USDJPY across the Asian (08:00–12:00 IST), London (13:00–17:00 IST)
and New York (18:00–23:00 IST) research windows.

**Ground rules carried over from the audit:**

- No new strategies and no parameter optimisation until stages 0–2 are complete and reviewed.
- Live trading stays locked.
- Every experiment is pre-registered and reported, including failures.

## Principle

Phase 1 showed that the platform can test strategies honestly. It also showed that the candidates had no pre-cost edge
and that BTC spot fees exceed what short intraday moves can pay.

The plan therefore measures **where an edge is even economically possible** before testing anything:

- **Cost-to-movement ratio:** how large costs are relative to the moves available.
- **Statistical power:** how many trades exist to detect an edge.
- **Legal tradability:** whether the instrument can lawfully be traded live.

Only then does it re-test the existing strategy families, with a corrected protocol.

## Stage 0 — Fix the pipeline defects (prerequisite; code changes for review)

| Defect | Fix | Acceptance test |
|---|---|---|
| D1: walk-forward uses the hold-out | Run walk-forward entirely inside the training segment (nested). The final hold-out is touched once, by a separate command, after the candidate list is frozen | Test asserting that no walk-forward window overlaps the hold-out |
| D2: stored timeframe shadows the resampled history | Store live-loop candles under a separate source (`binance-live`), or make `load` choose the longest coverage and warn | Test: a short native series cannot shadow a long M5 series |
| D3: real-time indicator window | Evaluate on at least 6,000 bars of the entry timeframe (H4 EMA50 then has ≥ 375 bars), or carry indicator state forward | Real-data check: 0 of 27 `trend_continuation` signals missed |
| D4: inert grid dimensions | Drop parameters a configuration does not read before building the grid | Grid sizes: 9 for `range_source ≠ opening` |
| D5: i.i.d. Monte Carlo | Stationary block bootstrap (block ≈ 1 week of trades); report drawdown at the realised risk fraction | Unit test on autocorrelated input |
| D8: cost reporting | `total_costs` = commission + spread + slippage − financing; rejection reasons counted once per signal | Ledger identity test |
| D10: time-exit re-entry | Align backtest and paper on time-exit-at-open | Replay: 562 / 562 with no extra trade |
| Multiple testing | Record the number of configurations tried for every study. Report a deflated Sharpe ratio, or apply a Bonferroni / Holm correction across plans | Shown in every research report |

**Regression check after Stage 0:** re-run the unchanged Phase 1 BTCUSDT study and confirm that it still reports 0 of
36 passing. Any change in verdict must be explained by a specific fix.

## Stage 1 — Data acquisition (see `DATA_REQUIREMENTS.md`)

Data to acquire:

- BTCUSDT M1 from 2020 (`data.binance.vision`)
- XAUUSD, EURUSD, GBPUSD and USDJPY tick or M1 bid/ask from 2020 (Dukascopy Historical Data Export)
- MT5 demo-broker history for cross-checking
- Official event calendars

Pass all quality checks before use.

## Stage 2 — Measure before testing (descriptive only, no strategies)

For each instrument × session × timeframe (M5, M15, M30, H1, H4), measure:

| Metric | Why |
|---|---|
| Median ATR as a multiple of the round-trip cost, using measured spread + commission + slippage per instrument | Phase 1 showed that 0.76× (BTC M15) is unworkable. Require ≥ 5× for a cell to be studied further |
| Session return, volatility and autocorrelation of 15-minute and hourly returns, with t-statistics | Whether momentum or mean reversion exists at all in the window |
| Distribution of the opening-range breakout follow-through: fraction of breaks extending 1×, 2× and 3× the range before reverting | Base rates for the existing range and breakout families |
| Spread by hour (bid/ask data) | Session-specific execution cost |
| Event-day vs non-event-day volatility | Whether event filtering is needed |
| Trades per year each existing family would generate in the cell | Power: cells unable to reach ~137 trades per evaluation segment are dropped |

**Output:** a cell-by-cell feasibility matrix. Cells failing the cost ratio or the power requirement are closed, and the
closure is recorded.

### Expected starting position (inference from Phase 1, to be confirmed by Stage 2 measurement)

| Instrument | Asian | London | New York | Comment |
|---|---|---|---|---|
| BTCUSDT spot | Low: negative even pre-cost in Phase 1 | Not tested | Low–medium: weak positive pre-cost pattern in breakout families, killed by fees | Viable only at H1+ holding periods and fee ≤ 0.075%. A $300 account's cash cap forces full-equity notional |
| XAUUSD | Low (thin) | Medium | Medium | High volatility relative to the spread. **0.01 lot minimum vs a $1.50 risk budget rejects most setups at $300** |
| EURUSD | Low | Medium | Medium | Tight spreads; small moves |
| GBPUSD | Low | Medium | Medium | — |
| USDJPY | Medium (Tokyo) | Medium | Medium | — |

**Legal overlay for a resident of India** (`docs/BROKERS.md`): XAUUSD and the FX pairs as overseas CFDs are research
proxies only. They cannot be traded live through overseas brokers. The lawful analogue for the FX pairs is NSE
cross-currency futures, whose trading hours (9:00–19:30 IST per NSE's page, *to verify*) cover the Asian and London
windows but **not** most of the New York window. Research effort should be weighted towards cells that are lawfully
tradable.

## Stage 3 — Re-test the existing families (pre-registered)

Scope: only on cells that pass Stage 2, using **only the five existing strategy families**.

### Before running

1. Write a pre-registration file for each study: instrument, session, timeframes, families, grid, gates, data span and
   hold-out dates.
2. Commit it before any run.

### Data split (example: 2020–2026 data)

| Segment | Period |
|---|---|
| Development | 2020–2023: nested walk-forward inside it (e.g. 2-year train, 6-month test, rolling) |
| Validation | 2024–2025: one pass, gates applied |
| Final hold-out | 2026: one pass, only for the frozen survivors from validation, never re-used |

### Gates (in addition to Phase 1's)

1. At least 137 trades in each of development and validation.
2. Positive **pre-cost** expectancy with t ≥ 2 after multiple-testing correction.
3. Net expectancy > 0 at costs ×1.5 using **measured** spreads.
4. Positive in at least 2 of the 3 regime buckets (trend up, trend down, range), classified by H4/D1 trend.
5. Beats the random-entry null with the same bracket geometry at p < 0.05.

### Reporting

- Every configuration tried is reported, including all failures.
- Survivors are reported with confidence intervals, not point estimates.

## Stage 4 — Forward paper trading (only for Stage 3 survivors)

1. Run the real-time loop on a real feed: Binance for BTCUSDT; an MT5 **demo** account for XAUUSD and FX.
2. Run for at least 30 trades over at least 20 trading days. The live gate already enforces this.
3. Measure the items the replay could not: quote-polling exits, real entry slippage, spread at signal time, and
   uptime / staleness halts.
4. Compare forward results with the validation confidence interval. Stop if the result falls below the lower bound.

## Kill criteria (stop Phase 2 work on a cell or instrument)

- Stage 2 cost ratio below 5×, or fewer than 137 achievable trades per segment.
- Stage 3: no family reaches pre-cost t ≥ 2 after correction.
- Stage 4: forward expectancy below the validation lower bound after 30 trades.
- Legal: no lawful live route exists for the instrument and the user's jurisdiction. Research may continue for learning,
  but it cannot lead to live trading.

## Out of scope for Phase 2 (requires explicit approval)

New strategy families, machine-learning models, parameter optimisation beyond the existing coarse grids, any live
execution, and any increase in risk limits.

## Deliverables per stage

| Stage | Deliverable |
|---|---|
| 0 | Defect fixes with tests; regression report |
| 1 | Dataset manifests; quality reports |
| 2 | Feasibility matrix with every closed cell and its reason |
| 3 | Pre-registration files; full results including failures; survivor dossiers |
| 4 | Forward-test reports against the validation intervals |
