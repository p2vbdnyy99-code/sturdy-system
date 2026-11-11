# Broker integration

## Architecture

```
iPhone / iPad / browser
        │  HTTPS + JWT            (no broker secrets on the device)
FastAPI backend ── strategy engines ── RiskEngine ── TradingService
        │  BrokerAdapter interface (app/brokers/base.py)
        ├─ PaperBroker            simulated fills on the platform ledger, no network code
        ├─ MT5Adapter ── HTTPS + HMAC ──► Windows MT5 bridge ──► MetaTrader 5 terminal ──► broker
        ├─ BinanceSpotAdapter     spot only, long only
        └─ BinanceFuturesAdapter  USD-M perpetuals (separate class, endpoints, credentials)
```

The core never imports a concrete broker. A new broker is one module implementing `BrokerAdapter`
(`health, account_info, positions, quote, symbol_spec, place_order, find_order, close_position`,
optional `modify_*`, `cancel_order`, `history_orders`, `candles`, `order_book`) plus one entry in
`app/brokers/registry.py`.

Every order carries a client-generated id (`sha256(account|plan|candle)`), persisted **before** the
network call. A transport failure marks the order `unknown`, halts the account and is resolved by
`find_order(client_order_id)`; it is never blindly retried.

## Integration status

| Broker | Status | Meaning |
|---|---|---|
| Paper | tested | Full automated coverage |
| MetaTrader 5 (bridge) | simulated only | Contract-tested against a fake `MetaTrader5` module. Never connected to a real terminal. |
| Exness via MT5 | untested | Same route as MT5. Never connected to Exness. |
| Exness native API | not implemented | See below |
| Binance Spot | untested (signed) / verified (public data) | Market data verified live; account/order endpoints only against a mock |
| Binance USD-M Futures | untested, partial | Separate product; disabled unless explicitly enabled |

A connection is only ever marked `ok` by the read-only **Test connection** action succeeding.

## Exness — what was actually found

Checked on 2026-11-11 against the Exness Help Center article "Exness API":

* Exness documents a native API (REST for orders/account, WebSocket for streaming) for fully
  verified clients, with an API key and secret generated in the Personal Area.
* The article states that standard MetaTrader accounts cannot connect to that API.
* It does not publish endpoint URLs or the signing scheme.

So the native adapter is deliberately a stub that raises `NotSupported`; no API was invented. The
supported technical route is an Exness MT5 account through the Windows bridge — subject to the
eligibility gate below.

## Eligibility gate (India) — read before funding anything

This is a conservative software safeguard, not legal advice.

* RBI: persons resident in India may undertake forex transactions only with authorised persons
  and, electronically, only on RBI-authorised ETPs or recognised exchanges (NSE, BSE, MSE).
* The RBI **Alert List** of entities not authorised to deal in forex or operate forex ETPs
  (`https://rbi.org.in/scripts/bs_viewcontent.aspx?Id=4235`, version "updated as on November 19,
  2025") **includes Exness**. RBI states the list is not exhaustive.

Consequences in the software (`app/core/compliance.py`, enforced before every live order):

| Declared residence | Product / broker | Result |
|---|---|---|
| IN | Forex, gold or crypto CFDs via any overseas MT5 broker, incl. Exness | **Blocked.** Cannot be attested away; a live account record cannot even be created. |
| IN | Same, on a **demo** account (no real money) | Connectivity testing allowed after a demo attestation. If the terminal is later logged into a real account the platform detects the change, disables live and halts. |
| IN | Crypto spot on an exchange | Requires your attestation (FIU-IND registration of the exchange, lawful funding, tax treatment). |
| Other | Any | Requires your own attestation; the software has no rule set for other countries. |

Paper trading and backtesting are simulations and are not restricted.

Do not deposit trading capital with an overseas forex/CFD broker on the strength of this software
connecting to it. A lawful live route for USD-quoted FX/gold as an Indian resident would need to
be a recognised-exchange product through a SEBI-registered broker, which would be a new adapter.

## Connection-test procedure

**MT5 (demo first):** follow `WINDOWS_MT5_BRIDGE.md`, then in the app: Broker Connections → add
"MT5 bridge" with the bridge URL and shared secret → **Test connection**. Expect status `ok`,
`account: demo`, `trade_allowed: true`. Then `POST /api/v1/broker-connections/{id}/sync-specs` with
`["EURUSD","XAUUSD",…]` to overwrite default contract specs with the broker's. If your broker
suffixes symbols (e.g. `EURUSDm`), set `config.symbol_map` on the connection:
`{"EURUSD": "EURUSDm"}`. An unmapped symbol fails with "unknown symbol … (check the symbol mapping)".

**Binance:** create an API key with *reading* and *spot trading* only, **withdrawals disabled**,
IP-restricted to your server. Add it as "Binance Spot" → **Test connection**. A key with
withdrawal permission is refused. No withdrawal call exists anywhere in the code.

## Live activation requirements (all enforced in code)

Broker test passed within 24h · trade permission confirmed, withdrawals off · eligibility gate
passed · contract specs synced from the broker · every enabled strategy validated out-of-sample on
non-synthetic data · ≥30 real-time paper trades over ≥20 trading days with positive expectancy
(replay does not count) · risk self-test passed within 7 days · kill switch off. Then two steps:
password → one-time code, then code + typed phrase. The first live order waits for a separate
confirmation. Live is switched off again on every server restart, on broker instability, on a
change of declared residence, and on a change of broker account type.
