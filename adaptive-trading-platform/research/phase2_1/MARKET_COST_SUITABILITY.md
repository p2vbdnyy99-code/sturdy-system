# Market Cost Suitability

**Filter:** median candle range ≥ 5 × round-trip transaction cost. It is a necessary condition for a strategy to
have room to pay its costs, not evidence of profitability. Measured on training + validation data only; the hold-out
was not read.

## Verdict

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

## 1. Costs used

| Instrument | Round-trip cost | Basis | Status |
|---|---|---|---|
| BTCUSDT | 15.01 bp (BNB 0.075%/side) or 20.01 bp (VIP 0 0.100%/side) | Binance spot fee schedule (read 2026-11-11). Spread **measured** at 1 tick ($0.01 ≈ 0.001 bp), median of 60 samples over 104 s on 2026-11-11 16:47 UTC. Market-order cost vs mid for $300 / $3,000 / $30,000 orders: half the spread, no depth impact | Fee: **actual published fee**. Spread / slippage: **measured once** (one snapshot; spreads widen in stress) |
| EURUSD | 1.0 / 1.4 pips | Low: 0.1 pip raw spread + $7 per lot commission + 0.1 pip slippage. High: 1.2 pip spread + 0.2 pip slippage | **Estimate**, not verified for any broker |
| XAUUSD | $0.29 / $0.40 per oz | Low: $0.12 spread + $0.07 commission + $0.10 slippage. High: $0.30 spread + $0.10 slippage | **Estimate**, not verified for any broker |
| GBPUSD | 1.2 / 1.8 pips | — | Estimate; no movement data to compare it with |
| USDJPY | 1.0 / 1.5 pips | — | Estimate; no movement data to compare it with |

Any real broker quote replaces these estimates; re-run `research/phase2_1/suitability.py`.

## 2. Price-movement data

| Instrument | Source | Period (pre-hold-out) | Caveats |
|---|---|---|---|
| BTCUSDT | Binance BTCUSDT spot M5 (dataset `binance-2020`, registered, checksum stored) | 2020-01-01 → 2024-11-10 | The actual traded instrument |
| EURUSD | **Proxy:** Binance EUR/USDT M5, weekdays inside FX hours only | 2021-01-01 → 2024-11-10 | A crypto-venue price of EUR in USDT, not the interbank rate; ranges may include venue noise. Sanity check: London H1 median 13.4 bp ≈ 15 pips, which is plausible for EURUSD (from memory, not verified here) |
| XAUUSD | **Proxy:** Binance PAXG/USDT M5 (tokenised gold), weekdays inside FX hours only | 2021-01-01 → 2024-11-10 | Thin market: 6,236 zero-volume candles (1.5%) excluded; ranges in thin periods are unreliable |
| GBPUSD, USDJPY | None | — | Dukascopy (documented free bid/ask history) refused connections from this environment. Binance has no live GBP or JPY pair (GBP/USDT is suspended) |

**Movement metric:** median (and 25th-percentile) high − low of candles that **open** inside the session window,
in basis points of the open. Session windows are the fixed IST research windows: Asian 08–12, London 13–17,
New York 18–23.

## 3. Full matrix

#### BTCUSDT

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

#### EURUSD

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

#### XAUUSD

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

## 4. What this means for strategy design

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

## 5. Limitations

- The cost ratio uses the *median* candle. Many trades occur in quieter-than-median conditions (see the p25
  column), where costs bite harder.
- The BTC spread and slippage measurement is a single snapshot. Its effect is negligible next to the fee, but in
  stressed markets it would rise.
- The proxy data is not the instruments themselves.
- No timeframe below M5 or above H4 was measured.
