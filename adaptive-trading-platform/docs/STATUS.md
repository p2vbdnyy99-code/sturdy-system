# Status — what is verified, what is not

Recorded 2026-11-11. Every "verified" line below was executed in the development environment
(Linux container, PostgreSQL 16, Node 22, Python 3.13). Nothing is listed as working on the
strength of having been written.

## Milestones

| # | Milestone | State | Evidence / gap |
|---|---|---|---|
| 1 | Installable iPhone/iPad app | **Not built** | App type-checks and its iOS JavaScript bundle (Hermes) and web bundle build. No `.ipa` was produced: that needs macOS/Xcode or an EAS cloud build with your Apple ID. See `IOS_BUILD.md`. |
| 2 | Functional historical backtesting | **Verified on real data** | 105,119 real BTCUSDT M5 candles (2025-11-11 → 2026-11-11, no gaps) imported from Binance; backtest and research ran end-to-end through the API. |
| 3 | Working paper-trading engine | **Verified** (replay + live feed ingestion) | Replay of real candles through the paper engine; equality test against the backtester; the real-time loop pulled live Binance quotes and candles. A real-time signal → trade was not observed during the session (no setup occurred while it ran). |
| 4 | MT5 demo-account connectivity | **Not done** | Bridge and adapter are contract-tested against a *simulated* `MetaTrader5` module only. Needs a Windows machine with MT5. See `WINDOWS_MT5_BRIDGE.md`. |
| 5 | Tested, legally eligible live execution | **Not done, locked** | Live is off by default and gated. For a resident of India the Exness / overseas-CFD route is hard-blocked (see `BROKERS.md`). |

## Automated tests (118, all passing on SQLite and on PostgreSQL)

| File | Tests | Covers |
|---|---|---|
| `test_core.py` | 32 | Indicators, swing/structure, sessions incl. DST, multi-timeframe alignment, **look-ahead check for every strategy** (signals unchanged when later candles are appended) |
| `test_risk_backtest.py` | 31 | Position sizing from contract specs, every risk rejection, fill model (same-candle stop+target → stop; gaps), costs, financing, ledger identity, metrics, split/walk-forward/Monte Carlo |
| `test_scenarios.py` | 22 | The 15 required execution-safety scenarios plus kill switch, health-monitor suspension, notification de-duplication, **paper replay ≡ backtest** |
| `test_brokers.py` | 22 | Bridge HMAC auth/replay protection, order lifecycle, idempotency across bridge restarts, rejections, disconnection, Binance request signing, withdrawal-key refusal, India eligibility rules |
| `test_api.py` | 11 | Auth, lockout, rate limiting, RBAC, account isolation, CSV validation, data → backtest → research → replay → journal/analytics, compliance, two-step live activation, WebSocket auth |

The 15 scenarios map to `test_01…` through `test_15…` in `tests/test_scenarios.py`.

Also executed: Alembic `upgrade head` / `downgrade base` / `check` on PostgreSQL; `tsc --noEmit`
(strict) on the app; `expo export` for web and iOS; a headless-browser walk-through of all ten
screens at 390×844, 820×1180, 1180×820 and 1440×900 with no console errors, no 5xx responses,
no horizontal overflow and no `undefined`/`NaN` text (screenshots in `docs/screenshots/`).

Two defects were found *by* this testing and fixed: a PostgreSQL-only failure (status column too
short for `awaiting_confirmation`) and a crash on an invalid contract specification (now rejected
as `INVALID_SPEC`).

## What real data says so far

Research run on one year of real BTCUSDT (spot, long-only, Binance 0.1% fee per side, USD 300):

* **36 candidate plans evaluated, 0 passed.**
* Unvalidated portfolio backtest of the M15 candidates: 562 trades, win rate 22%, profit factor
  0.51, expectancy −0.38R, **−60.6%**, of which modelled costs were USD 168.71 of the USD 181.85 lost.
* The few candidates with positive training expectancy had too few trades (11–29) and turned
  negative out-of-sample.

Reading (an inference, not a measurement): 0.2% round-trip fees are large relative to tight
intraday stops on spot BTC, so costs consume most of what these setups could make. That is a
finding about these candidates on this instrument and year, not proof that no edge exists. No forex or gold data has been tested at all (none was available
without an MT5 terminal). **No strategy in this repository has a demonstrated edge.**

## Implemented but NOT verified against the real counterpart

* MT5 bridge and adapter (simulated terminal only). Field names follow the official `MetaTrader5`
  package from memory; expect small fixes on first contact with a real terminal.
* Exness via MT5: same code path, never connected to Exness.
* Binance signed endpoints (account, orders): request construction tested against a mock transport.
  Public market data **is** verified live.
* Expo push delivery: stored and de-duplicated server-side (tested); delivery to a device untested.
* Optional AI narration (Anthropic SDK): written, never executed (no API key). The deterministic
  explanations it rewords are tested.
* Docker image: `docker compose config` validates; the image was never built (no Docker daemon).
* Redis-backed rate limiting: code path present; tests exercise the in-memory limiter.

## Not implemented

* Exness native REST/WebSocket API (endpoint spec is only available inside the Exness Personal Area).
* Binance futures symbol-spec sync; order-book UI; pending-order UI (bridge supports pending orders).
* Economic calendar / news (deliberately absent rather than fabricated).
* A packaged Windows desktop app: Windows uses the browser build served by the backend (installable
  as a PWA-style window from Edge/Chrome). No native Windows binary exists.
* Automated database backup schedule (a manual `backup` compose service is provided).

## Known limitations and modelling assumptions

* Candles are treated as mid prices; spread is a per-instrument constant unless the data has a
  spread column. Default contract specs and costs are typical retail values flagged *unverified*
  until synced from a broker.
* Backtest equity is closed-trade equity; open-trade excursions are bounded by the stop (MAE is
  recorded per trade). Drawdown therefore slightly understates intra-trade drawdown.
* Each plan holds at most one position at a time; partial fills are modelled only as a volume cap
  on exchange instruments.
* With USD 300 and 0.5% risk (USD 1.50), the 0.01-lot minimum on forex/gold CFDs often exceeds the
  risk budget. The risk engine rejects such trades (`MIN_LOT_EXCEEDS_RISK`) rather than rounding up.
  On gold this will reject most setups; that is intended behaviour, and worth knowing before funding.
* Replay speed is about 140 candles/second (database write per bar).
* Sharpe/Sortino use daily closed-trade returns.

## Recommended next steps

1. Build the iOS app with EAS (`IOS_BUILD.md`) — milestone 1.
2. Install MT5 + bridge on Windows with a **demo** account, run the connection test, import forex
   and gold history, and run research on it — milestones 2 (FX) and 4.
3. Only if a strategy passes validation on real data: forward paper-trade it on a real-time feed
   for at least 30 trades over 20 trading days (the live gate enforces this).
4. Resolve the legal route before any live funding (`BROKERS.md`).
