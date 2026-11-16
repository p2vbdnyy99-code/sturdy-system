# Data Requirements — Phase 2

Only documented sources are listed, checked on 2026-11-11 where marked **verified**. Anything not verified is marked
*to verify* and must be confirmed (licence, coverage, price) before download.

No data was downloaded for this document. This environment's network policy currently allows only
`data-api.binance.vision`; the other hosts below would need an approved allow-list change.

## 1. What is held today

| Instrument | Data | Period | Source | Adequacy |
|---|---|---|---|---|
| BTCUSDT | M5 OHLCV, 105,119 bars, no gaps | 2025-11-11 → 2026-11-11 | Binance REST (`data-api.binance.vision/api/v3/klines`) | One regime transition, no spread history, no intrabar order: **insufficient** |
| BTCUSDT | M15, 499 bars (live-loop test) | 2026-11-06 → 11-11 | Binance REST | **Harmful until defect D2 is fixed**: these rows now shadow the M5-derived M15 history |
| XAUUSD, EURUSD, GBPUSD, USDJPY | none | — | — | Nothing tested |

## 2. Minimum requirements per instrument

### Why these depths

1. **Power.** About 137 trades are needed per strategy, per session and per evaluation segment to detect +0.2R at
   t = 2, given the observed R standard deviation of about 1.17.
2. **Trade rate.** Session-gated strategies trade at most about 1 per session-day, often far fewer (4–153 training trades
   per year in Phase 1). Each segment therefore needs several years.
3. **Regimes.** At least two complete regime cycles are needed, for example for BTC a bull year, a bear year and a range
   year.

### Instruments

**BTCUSDT (Binance spot)**

| Field | Requirement |
|---|---|
| Depth | ≥ 5 years (2020-01 →) |
| Granularity | M1 klines |
| Spread / cost data | Fee schedule history. Spread: no public historical spot quote archive was found, so measure it forward in real time and model it from trades |
| Source | **Verified:** `data.binance.vision`, spot `klines`, `aggTrades` and `trades`, daily and monthly files, documented in `github.com/binance/binance-public-data` |
| Notes | aggTrades resolve intrabar stop/target order. Fees verified: VIP 0 0.100%/0.100%, 0.075% with BNB |

**XAUUSD (CFD research proxy)**

| Field | Requirement |
|---|---|
| Depth | ≥ 5 years |
| Granularity | Tick or M1 bid **and** ask |
| Spread / cost data | Per-tick spread; broker swap and commission schedule |
| Source | **Verified:** Dukascopy Historical Data Export (free; forex and CFD instruments, tick to monthly, CSV). Secondary: the user's MT5 broker via `copy_ticks_range` / `copy_rates_range` (depth broker-dependent, *to verify*) |
| Notes | Gold is a CFD at Dukascopy. Spreads differ by broker. Historical swaps are not published, so only current rates can be used |

**EURUSD, GBPUSD, USDJPY (CFD / spot FX research proxy)**

| Field | Requirement |
|---|---|
| Depth | ≥ 5 years |
| Granularity | Tick or M1 bid and ask |
| Spread / cost data | Per-tick spread; swap schedule |
| Source | **Verified:** Dukascopy Historical Data Export. Secondary: the MT5 broker. HistData.com M1 is a further option (bid only, no spread; *to verify* terms) |
| Notes | Use one source for both research and execution cost modelling where possible |

**EURUSD, GBPUSD, USDJPY futures (NSE, lawful route for Indian residents)**

| Field | Requirement |
|---|---|
| Depth | ≥ 3 years |
| Granularity | M1 or tick with best bid/ask |
| Spread / cost data | Exchange fees, broker brokerage, stamp duty and GST, *to verify* |
| Source | **Verified:** NSE lists EURUSD, GBPUSD and USDJPY cross-currency futures and options (1 unit = 1,000 base currency; ticks 0.0001 / 0.01; 12 serial monthly contracts). Intraday history: NSE data products or an NSE-authorised vendor (*to verify*) |
| Notes | **Trading hours on NSE's page: 9:00–19:30 IST**, alongside a reference to a circular restricting hours to 17:00 IST. *Verify the current hours.* Either way the New York research window (18:00–23:00 IST) is wholly or largely outside them |

**Gold (exchange-traded, lawful route)**

| Field | Requirement |
|---|---|
| Depth | ≥ 3 years |
| Granularity | M1 |
| Spread / cost data | Exchange and brokerage fees |
| Source | MCX gold futures (*to verify*: contract sizes, evening-session hours, data vendor) |
| Notes | Not verified in this audit |

**Event calendar (all instruments)**

| Field | Requirement |
|---|---|
| Depth | Same span as the price data |
| Granularity | Event timestamps |
| Source | Official schedules: US BLS release calendar (CPI, NFP), Federal Reserve FOMC calendar, ECB, Bank of England and Bank of Japan meeting calendars (*to verify* archive depth) |
| Notes | For excluding or isolating event windows. Never fabricated; missing means unavailable |

## 3. Data-quality checks required before use

1. **Completeness.** Count bars per session per day. Flag gaps over 2× the bar length during market hours, and exclude
   instrument holidays.
2. **Validity.** high ≥ max(open, close), low ≤ min(open, close), prices > 0; the existing `store.validate_frame` does
   this.
3. **Cross-source check.** Compare Dukascopy against broker MT5 for the same instrument and month. Report the median
   absolute mid difference and the spread distributions.
4. **Spread realism.** The spread distribution per session and hour must come from bid/ask data, not from constants.
5. **Timezone.** Store UTC. Verify against a known event, for example NFP 13:30 UTC in winter.
6. **Provenance.** Each dataset records its source, download date, licence and checksum.
7. **Defect D2 fix first.** One source plus one timeframe must never shadow another. The live-loop candles go under a
   separate source name, or the loader prefers the longest coverage.

## 4. Data that cannot be obtained, and how to handle it

| Missing item | Consequence | Handling |
|---|---|---|
| Historical BTCUSDT spot best bid/ask | Spread is modelled, not measured | Measure forward from the live feed. Spread is immaterial at current fees (sensitivity −$181.47 vs −$181.85) |
| Historical broker swap rates | Overnight cost is uncertain | Use current broker rates plus a ±50% sensitivity band; prefer strategies that hold no position overnight |
| Broker-specific execution quality (fill latency, requotes) | Slippage is modelled | Measure on an MT5 **demo** account during forward testing |
| Indian exchange intraday history at no cost | NSE/MCX research may need a paid vendor | Price it before committing; *to verify* |

## 5. Legitimacy constraints

- Use data under each provider's terms. Dukascopy and Binance permit download for personal use; *to verify*
  redistribution terms before committing any data to the repository.
- Do not commit raw vendor data to Git. Store a manifest (source, date range, checksum) instead.
- Synthetic data stays tagged `synthetic:` and is excluded from all evidence.
