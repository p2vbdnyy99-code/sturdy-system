# Adaptive AI Trading Platform

Mobile-first algorithmic trading platform: an Expo / React Native app (iPhone, iPad, browser), a
FastAPI trading backend on PostgreSQL, a strategy research and backtesting engine, a paper-trading
engine that shares the live order path, and a broker-adapter layer with a separate Windows bridge
for MetaTrader 5.

**Read [`docs/STATUS.md`](docs/STATUS.md) first.** It states exactly what has been executed and
verified, what is implemented but untested against a real broker, and what real-data research has
shown so far (short version: no strategy has demonstrated an edge yet; live trading is locked).

```
MONITOR -> ANALYSE -> SELECT STRATEGY -> VALIDATE -> CALCULATE RISK -> PAPER EXECUTE -> EVALUATE
```

## Layout

```
backend/            FastAPI service (Python 3.12+)
  app/core/         instruments, sessions, indicators, market structure, multi-timeframe,
                    strategies/, engines (3 session engines), execution (fill/cost model),
                    risk (independent risk engine), backtest, metrics, validation (walk-forward,
                    Monte Carlo, cost stress), trading (single paper+live order path),
                    health (strategy monitor), compliance, live_gate, notify, ai
  app/brokers/      base adapter contract, paper, mt5 (bridge client), exness, binance, registry
  app/data/         candle store, CSV ingestion, synthetic generator (tests only, always labelled)
  app/api/          auth, trading, research, brokers, system (REST + WebSocket)
  app/jobs.py       backtest / research / replay jobs      app/runner.py  real-time loop
  alembic/          database migrations                    tests/         118 automated tests
mt5-bridge/         Windows-only service next to the MT5 terminal (official MetaTrader5 package)
mobile/             Expo Router app (TypeScript): 10 screens, adaptive phone / iPad / desktop layout
docs/               STATUS, BROKERS, SECURITY, IOS_BUILD, WINDOWS_MT5_BRIDGE, screenshots/
docker-compose.yml  backend + PostgreSQL + Redis          .env.example   configuration template
```

## Quick start (Docker)

```bash
cp .env.example .env            # fill POSTGRES_PASSWORD, ATP_SECRET_KEY, ATP_CREDENTIALS_KEY
(cd mobile && npm ci && npx expo export --platform web --output-dir dist)   # optional browser UI
docker compose up -d --build    # runs migrations, then serves on http://127.0.0.1:8000
docker compose run --rm backup  # database backup into ./backups
```

Open `http://127.0.0.1:8000`, create an account (the first user becomes admin) and you land on a
PAPER account with USD 300. Put a TLS reverse proxy in front before using it from a phone.

## Quick start (without Docker)

```bash
# PostgreSQL 16 running, with:  CREATE USER atp PASSWORD 'atp_dev' CREATEDB;  CREATE DATABASE atp OWNER atp;
./scripts/dev.sh                              # venv, migrations, API on :8000 (serves mobile/dist if present)
cd mobile && npm ci && npx expo start         # app in Expo Go / simulator / press w for web
```

## First session

1. **Backtesting → Import BTCUSDT (Binance)** pulls one year of real 5-minute candles from Binance's
   public market-data API. Forex and gold history: export from MT5 (CSV) or pull through the bridge.
2. **Research & validate** evaluates candidate strategies. Expect most or all to fail.
3. **Strategies** shows each candidate with its evidence; enable the ones you want to forward-test.
4. **Paper Trading** → start automation on a real-time feed, or replay stored candles.
5. **Trade Journal / Analytics** show every signal, every rejection with its reason, and results.

## Tests

```bash
cd backend
.venv/bin/python -m pytest -q                                           # SQLite in memory
TEST_DATABASE_URL=postgresql+psycopg://atp:atp_dev@localhost:5432/atp_test .venv/bin/python -m pytest -q
cd ../mobile && npm run typecheck && npm run export:web && npm run export:ios
```

## Documents

| Document | Contents |
|---|---|
| [docs/STATUS.md](docs/STATUS.md) | Verified vs unverified, real-data results, known limitations, next steps |
| [docs/BROKERS.md](docs/BROKERS.md) | Adapter architecture, MT5/Exness/Binance facts, connection-test procedure, India eligibility |
| [docs/SECURITY.md](docs/SECURITY.md) | Auth, RBAC, encryption, isolation, live-trading safety model, operations |
| [docs/IOS_BUILD.md](docs/IOS_BUILD.md) | Building, signing and installing on iPhone / iPad |
| [docs/WINDOWS_MT5_BRIDGE.md](docs/WINDOWS_MT5_BRIDGE.md) | Installing and testing the Windows bridge |

Nothing here is financial or legal advice. Trading leveraged products can lose more than you expect;
this software defaults to simulation for that reason.
