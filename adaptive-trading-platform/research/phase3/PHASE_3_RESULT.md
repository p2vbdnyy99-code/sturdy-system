# Phase 3 Result: BTC 30-day momentum, single confirmatory test

**Verdict: FAIL.** The rule did not pass its pre-registered validation gate. It is stopped. The hold-out was not
read and its ledger is still empty. Nothing was tuned or re-run after the result.

| | |
|---|---|
| Pre-registered | 2026-11-16 11:27:48 UTC (`preregistration.json`, SHA-256 `83fb63b5…c56137`) |
| Validation run | 2026-11-16 11:28:45 UTC, once (`validation_result.json`; the script refuses a second run) |
| Not committed to git | The timestamp and hash are self-reported; there is no external proof of ordering |

## 1. What was tested

- **Rule:** long BTCUSDT spot while the trailing 30-day log return of the daily close is positive, otherwise flat.
  One fixed parameter. "H1" is the hypothesis label; bars are **daily**, not hourly.
- **Data:** `binance-2020`, validation segment, decision days 2023-01-01 → 2024-11-09 (679 days).
- **Costs:** 10 bp commission + 0.5 bp spread/slippage per side, on every change in exposure.
- **Code:** rule and evaluation imported unchanged from `phase2_1/hypotheses.py`. Before validation was touched,
  the script reproduced all seven reported Phase 2.1 training figures for H1.

This was registered as a new study, because under the Phase 2.1 registration H1 had failed the training gate and
could not go to validation.

## 2. Gate

| Pre-registered condition | Result | Met |
|---|---|---|
| Timing p < 0.05 (circular-shift permutation, 2,000 shifts, seed 0) | **p = 0.232** | **No** |
| Net Sharpe > 0 | +1.75 | Yes |
| Net total return > 0 | +214.3% | Yes |

All three were required.

## 3. All metrics (validation, net of costs unless stated)

| Metric | Strategy | Buy and hold |
|---|---|---|
| Total return | +214.3% (gross +231.5%) | +383.7% |
| Annualised return | +85.1% | — |
| Annualised volatility | 39.6% | — |
| Sharpe | 1.75 | 1.99 |
| Sharpe 95% interval (30-day block bootstrap) | 0.06 to 3.29 | — |
| t-statistic of mean daily net return | 2.39 | — |
| Max drawdown | 36.5% | 26.2% |
| Days in the market | 63.8% | 100% |
| Exposure changes | 51 | — |
| Cost drag | 17.2 points of return | — |
| Net return at 2× / 3× costs | +197.9% / +182.4% (Sharpe 1.68 / 1.60) | — |

| Trades (round trips) | |
|---|---|
| Count | 26 (25 closed, 1 still open at the segment end and marked there) |
| Winners | 13 of 26 (50%) |
| Mean / median net return per trade | +5.7% / +0.04% |
| Mean holding time | 16.7 days |
| Best / worst | +62.6% / −19.1% |

| Timing test | |
|---|---|
| Mean daily return before costs, actual | about 19.8 bp (derived: 19.0 bp net plus 0.8 bp average daily cost) |
| Mean of the 2,000 shifted versions | 16.0 bp |
| Share of shifts at least as good as actual | 23.2% |

## 4. Reading it

- **The rule made money because BTC rose, not because of its timing.** Being long 64% of the time at random
  offsets earned almost as much. About one shifted version in four did as well or better.
- **It underperformed simply holding BTC** on return (+214% vs +384%), on Sharpe (1.75 vs 1.99) and on drawdown
  (36.5% vs 26.2%). In this period it did not even deliver the usual trend-following benefit of smaller drawdowns.
- **The positive Sharpe and t-statistic are not evidence of an edge.** They measure BTC's drift over the period;
  the timing test exists to remove that, and it is the one that failed.
- **Costs were not the problem.** Tripling them leaves the picture unchanged.
- **What a fail does and does not show.** One 679-day segment in a single bull regime has limited power, so this
  does not prove 30-day momentum has no effect. It does mean there is no confirmation, and the training p of 0.028
  now looks like the best-of-five chance result the Holm correction said it could be.

## 5. Consequences (as pre-registered)

- H1 is stopped. H2 and H3 are not tested as substitutes. No parameter variants.
- The `binance-2020` hold-out (2024-11-11 → 2025-11-10) stays sealed; ledger entries: 0.
- The validation segment has now been read once, for H1. Any later study using it must disclose that.
- No strategy is validated. Live trading stays disabled; no setting, risk limit or platform code was changed.
- This was a signal-level daily simulation. It was not run through the paper engine and is not evidence about
  execution parity, which remains an open engineering task.

## 6. Discrepancies noted

- Earlier documents, and this study's registration, call the validation segment "677 days". The evaluated count
  is 679 decision days (681 calendar days; the last two need a next-day close that is unavailable or in the hold-out).
- The Phase 2.1 registration worded the timing statistic as "net" while its code used the pre-cost mean. This
  study registered the statistic as executed, before the run.
- The strategy's max drawdown is measured from its first day's equity, buy-and-hold's from the starting capital;
  the strategy figure could be very slightly understated.

## 7. Reproducing

From `backend/`: `.venv/bin/python ../research/phase3/experiment.py check` reproduces the training figures.
The `validation` stage will not run again while `validation_result.json` exists; the `holdout` stage refuses to
run without a validation pass.
