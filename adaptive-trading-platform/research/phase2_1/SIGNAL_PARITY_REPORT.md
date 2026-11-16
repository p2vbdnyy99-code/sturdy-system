# Signal Parity Report (Task 3, defect D3)

**Verdict: signal generation is now identical in the backtester, the paper replay and the real-time engine.**

- On real BTCUSDT data, all three produced the same signals: same plan, same candle, same direction.
- This holds for **27 of 27** `trend_continuation` signals over the window where 5 were previously missed, and for
  **56 of 56** signals from all ten M15 plans over a 3-week window.
- **Executed trades still differ**, for one remaining reason: the real-time engine detects stops and targets only
  on polled quotes, while the backtest sees every candle's high and low.

## 1. Root cause of the 5 missed signals

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

## 2. Fix

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

## 3. Three-way replay on real data

**Method.**

- Data: real BTCUSDT M15 (`binance` dataset); the ten Phase 1 M15 plans with their stored parameters; $300.
- Each run used an isolated in-memory database. The health monitor was disabled, so this measures signal and
  execution parity, not suspension policy (audited in `HEALTH_MONITOR_AUDIT.md`).

| Source | What produces the signals |
|---|---|
| (a) Backtest | `Plan.generate` on the full history |
| (b) Paper replay | `jobs.run_replay`: the paper engine fed bar by bar, all signals recorded in the journal |
| (c) Real-time engine | The real `runner.step_account`, called once per closed candle (candle close + 5 s). The feed serves the latest 500 candles (including the forming one, as Binance does) and a quote at the last close. Backfill comes from the same data |

### Run A: `trend_continuation`, 2026-07-06 17:00 → 2026-11-11 11:00 (the window with the 5 misses)

| | Backtest | Replay | Real time |
|---|---|---|---|
| Signals | 27 | 27 | 27 |
| Signals only in this source, or with opposite direction | — | 0 | 0 |
| Real-time steps / errors | | | 12,265 / 0 |
| Trades entered in window | | 25 | 24 |

### Run B: all ten M15 plans, 2026-10-01 → 2026-10-22

| | Backtest | Replay | Real time |
|---|---|---|---|
| Signals | 56 | 56 | 56 |
| Signals only in this source, or with opposite direction | — | 0 | 0 |
| Real-time steps / errors | | | 2,017 / 0 |
| Trades entered in window | | 30 | 28 |

## 4. Every discrepancy (executed trades, replay vs real time)

Timestamps are the signal candle's open time, in UTC.

### Run A (`trend_continuation`)

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

### Run B (all ten M15 plans)

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

## 5. Interpretation and remaining discrepancies

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

## 6. Reproducing

The harness (`parity.py`) is in the session scratchpad, not the repository. It reads the main database read-only and
runs each engine against an isolated in-memory database. Unit tests in `backend/tests/test_phase21_repairs.py`
(`TestRequiredHistory`) pin the equality of windowed and full-history signals for all ten M15 plans.
