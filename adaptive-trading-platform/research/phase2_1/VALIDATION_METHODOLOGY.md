# Validation Methodology (Phase 2.1, defect D1 repaired)

Every dataset now has three chronological, non-overlapping segments: **training**, **validation** and an
**untouched hold-out**. Research code cannot load the hold-out. The boundaries are stored once per dataset and
cannot be moved afterwards. Every read of a hold-out is recorded in that dataset's ledger.

**Limitation stated up front.** The only real dataset with a clean hold-out is BTCUSDT 2020-01-01 → 2025-11-10.
On it, a session-gated intraday strategy (the Phase 1 design) cannot collect enough validation trades to detect a
+0.2R edge (§5). The one-year dataset used in Phase 1 has no clean hold-out at all: Phase 1 read all of it before
any split existed.

## 1. What was wrong (D1)

In Phase 1 the walk-forward test windows were exactly the final 35% of rows. Those were the same rows later called
"out-of-sample", so the walk-forward gate consumed the confirmation data.

## 2. The repaired design

| Segment | Used for | Who may read it |
|---|---|---|
| **Training** | Parameter grid search; training gates; Monte Carlo; cost stress; **inner** walk-forward (all folds, including their test windows, lie inside training) | Research |
| **Validation** | One pass with the frozen training choice; validation gates; statistical-power gate | Research (once per candidate) |
| **Hold-out** | One evaluation of frozen, validated configurations | Only the hold-out job (`POST /api/v1/holdout`), or a backtest / replay that explicitly sets `include_holdout`. Every read is written to the ledger |

### How it is enforced in code

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

## 3. Exact boundaries (UTC; each segment is [start, end))

### BTCUSDT `binance-2020`: the research dataset

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

### BTCUSDT `binance`: the Phase 1 dataset

105,119 M5 candles, 0 missing.

| Segment | Start | End |
|---|---|---|
| Training | 2025-11-11 11:05 | 2026-06-18 00:00 |
| Validation | 2026-06-18 00:00 | 2026-08-30 00:00 |
| Hold-out | 2026-08-30 00:00 | 2026-11-11 10:55 |

**Ledger: 1 entry.** "Phase 1 research run #1 and backtest #2 read the entire dataset, including what is now the
hold-out, before splits existed." Any hold-out result on this dataset is therefore marked **not independent**.
This dataset is suitable for engineering checks (parity, regression), not for confirmatory research.

### `binance-M15-quarantined`

The 499 live-feed M15 candles that shadowed the history (D2). Kind `quarantined`; refused by every load and
backtest.

## 4. Regression: the unchanged Phase 1 study through the repaired pipeline

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

## 5. Is the data sufficient? Statistical power

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

## 6. Residual risks

- **Researcher knowledge.** I have seen the *aggregate* BTC price path of 2020–2025 (it is public market history),
  so hypothesis choice cannot be blind to it. Pre-registration (`preregistration.json`, timestamped before any
  result) limits but cannot remove this.
- **Explicit hold-out reads.** A user can still read the hold-out with `include_holdout`. The system records it and
  marks results non-independent, but cannot prevent it.
- **Split re-definition.** On 2026-11-11 a migration downgrade test destroyed and rebuilt the registry. Both splits
  were re-defined with identical boundaries, and the Phase 1 ledger entry was restored. The downgrade now refuses to
  run while any split exists.
