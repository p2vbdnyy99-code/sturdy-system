# Research Hypotheses (Phase 2.1)

**Result: none of the five pre-registered hypotheses passed the training gate after correcting for multiple
testing.** Under the pre-registered rules they were not advanced. The validation and hold-out segments of
`binance-2020` therefore remain unread, and its hold-out ledger is empty.

There is **no validated, viable strategy**. One research direction is worth a single, separately pre-registered
confirmatory test (§5).

## 1. Why these hypotheses, and why daily

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

## 2. Test design (as pre-registered)

| Element | Setting |
|---|---|
| Data | `binance-2020` (BTCUSDT spot), daily candles built from M5 via the dataset registry. The load stops before the hold-out (last bar used: H4 2024-11-10 20:00). Quality: 466 of 511,488 expected M5 candles missing (0.09%); none affects a complete day |
| Timing | Decision at the daily close (00:00 UTC) using data up to that close; the position earns the **next** day's return |
| Costs | 10 bp commission + 0.5 bp spread/slippage allowance per side, charged on every change in exposure |
| Primary test | Timing skill via circular-shift permutation: the exposure series is shifted against returns by a random offset (2,000 shifts, minimum 30 days); p = share of shifts with mean gross return ≥ actual. Costs are identical under a shift, so this isolates timing from cost |
| Multiple testing | Holm–Bonferroni across the five hypotheses, family-wise α = 0.05 |
| Train gate | Holm-adjusted p < 0.05 **and** net Sharpe > 0 |
| Later gates | Validation only for train survivors; hold-out only for validation survivors |

## 3. Results: training segment, 2020-01-01 → 2023-01-01 (1,095 days)

| Hypothesis | Exposure | Exposure changes | Gross return | Net return | Cost drag | Net Sharpe | Max drawdown | Buy & hold (Sharpe) | Timing p | Holm p | Decision |
|---|---|---|---|---|---|---|---|---|---|---|---|
| H1 30-day momentum | 50% | 80 | +358.8% | +321.8% | 37.0 pts | +1.27 | 46.1% | +130.8% (+0.76) | 0.028 | 0.140 | stop |
| H2 Vol-scaled momentum | 50% | 103 | +156.4% | +141.0% | 15.3 pts | +1.12 | 37.2% | +130.8% (+0.76) | 0.086 | 0.344 | stop |
| H3 Donchian 55/20 | 40% | 10 | +189.9% | +186.8% | 3.0 pts | +1.01 | 43.0% | +130.8% (+0.76) | 0.233 | 0.700 | stop |
| H4 Crash reversal | 6% | 40 | +5.6% | +1.3% | 4.3 pts | +0.13 | 32.4% | +130.8% (+0.76) | 0.477 | 0.954 | stop |
| H5 Failed breakdown | 14% | 44 | −52.7% | −54.8% | 2.2 pts | −0.48 | 66.4% | +130.8% (+0.76) | 0.969 | 0.969 | stop |

Validation: not evaluated (no survivors). Hold-out: not evaluated, ledger empty.

### Reading the results

- **H1–H3 beat buy-and-hold on return and Sharpe in training.** But the training segment is one bull market
  (2020–21) followed by one crash (2022), the ideal case for any trend rule. The timing test asks whether the timing
  beats random shifts of the same exposure pattern.
  - Only H1 reaches nominal significance (p = 0.028).
  - After testing five hypotheses, Holm-adjusted p = 0.14 does not meet the pre-registered 0.05.
- **H2 and H3** have positive but non-significant timing.
- **H4** (6% of days in the market) and **H5** show no timing skill. H5 is strongly negative: in this period a
  failed breakdown preceded further falls.
- **H1's drawdowns are large:** 46% max on a long-or-flat rule. Any deployment would need its own risk framing.

## 4. Multiple-testing accounting

Configurations examined to date, which must count against any future claim of edge:

| Source | Count |
|---|---|
| Phase 1 grids | 846 evaluations (36 plans) |
| Phase 2.1 hypotheses | 5 (single parameter set each) |

The Phase 1 grids were searched on different data (2025–26), but on the same instrument, so later claims about
BTCUSDT should be read against roughly 850 prior attempts.

## 5. The one direction worth a single follow-up (needs your approval)

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

## 6. Reproducing

From `backend/`:

```bash
.venv/bin/python ../research/phase2_1/hypotheses.py out.json
```

Reads `preregistration.json`; deterministic (fixed seeds).
