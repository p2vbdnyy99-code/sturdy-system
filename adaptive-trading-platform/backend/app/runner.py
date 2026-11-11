"""Real-time trading loop (paper accounts on real feeds, and live accounts).

No feed -> no prices -> no trading: a failing feed halts new orders and raises
a notification; the loop never substitutes invented or stale prices."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from .brokers.base import BrokerAdapter, BrokerError, Quote
from .brokers.binance import BinanceMarketData
from .brokers.registry import build_adapter
from .config import get_settings
from .core import ai, live_gate
from .core.instruments import TIMEFRAMES
from .core.notify import notify
from .core.trading import TradingService, user_sessions
from .data import store
from .db import session_scope, utcnow
from .models import Account, BrokerConnection, StrategyConfig, User

log = logging.getLogger("atp.runner")

QUOTES: dict[str, Quote] = {}                    # latest real quotes seen by this process
_last_candle: dict[tuple[int, str, str], datetime] = {}
_listeners: list = []


def on_quote(fn) -> None:
    _listeners.append(fn)


def latest_quote(symbol: str, max_age: float | None = None) -> Quote | None:
    q = QUOTES.get(symbol)
    if q and max_age is not None and (utcnow() - q.ts).total_seconds() > max_age:
        return None
    return q


class Feed:
    source = ""

    def quote(self, symbol: str) -> Quote: ...
    def candles(self, symbol: str, timeframe: str, limit: int): ...
    def supports(self, symbol: str) -> bool: ...
    def close(self): ...


class BinanceFeed(Feed):
    source = "binance"

    def __init__(self):
        self.md = BinanceMarketData(get_settings().binance_base_url)

    def supports(self, symbol): return symbol == "BTCUSDT"
    def quote(self, symbol): return self.md.quote(symbol)
    def candles(self, symbol, timeframe, limit): return self.md.klines(symbol, timeframe, limit=limit)
    def close(self): self.md.close()


class AdapterFeed(Feed):
    """Market data through a broker adapter (MT5 bridge)."""

    def __init__(self, adapter: BrokerAdapter, source: str):
        self.adapter, self.source = adapter, source

    def supports(self, symbol): return symbol != "BTCUSDT"
    def quote(self, symbol): return self.adapter.quote(symbol)
    def candles(self, symbol, timeframe, limit): return self.adapter.candles(symbol, timeframe, limit=limit)
    def close(self): self.adapter.close()


def build_feed(db, account: Account) -> Feed | None:
    kind = (account.feed or {}).get("type")
    if kind == "binance":
        return BinanceFeed()
    if kind == "mt5":
        conn_id = (account.feed or {}).get("connection_id") or account.broker_connection_id
        conn = db.get(BrokerConnection, conn_id) if conn_id else None
        if conn is None or conn.user_id != account.user_id:
            return None
        return AdapterFeed(build_adapter(conn), "mt5")
    return None


def step_account(db, account: Account, feed: Feed, adapter: BrokerAdapter | None, now: datetime) -> dict:
    """One iteration for one account. Separated from the loop for testing."""
    s = get_settings()
    user = db.get(User, account.user_id)
    gate = (lambda a: live_gate.blocking_reasons(db, a)) if account.mode == "live" else None
    svc = TradingService(db, account, adapter, sessions=user_sessions(user.settings), live_gate=gate)
    svc.risk.config.max_data_age_seconds = s.quote_stale_seconds
    out = {"signals": 0, "errors": []}
    if account.mode == "live":
        h = adapter.health()
        if not h.get("ok"):
            svc.halt("broker_unstable", f"Broker connection unhealthy: {h.get('error') or h}", now)
            live_gate.disable(db, account, "broker connection unstable")
        else:
            conn = db.get(BrokerConnection, account.broker_connection_id)
            kind = adapter.account_info().account_type
            if conn.account_type != kind:
                # e.g. the terminal was re-logged from a DEMO into a REAL account: everything must be re-verified
                conn.account_type, conn.status = kind, "untested"
                live_gate.disable(db, account, f"broker account type changed to {kind}")
                svc.halt("account_changed", f"Broker account type changed to '{kind}'. Re-test the connection.", now)
            else:
                svc.resume("broker_unstable")
                svc.reconcile(now)
    cfgs = db.query(StrategyConfig).filter_by(user_id=account.user_id, enabled=True, is_current=True).all()
    wanted = {(c.symbol, c.timeframe) for c in cfgs if feed.supports(c.symbol)}
    symbols = {sym for sym, _ in wanted} | {p.symbol for p in svc.open_positions() if feed.supports(p.symbol)}
    feed_ok = True
    for sym in sorted(symbols):
        try:
            q = feed.quote(sym)
        except BrokerError as e:
            feed_ok = False
            out["errors"].append(f"{sym}: {e}")
            continue
        age = (now - q.ts).total_seconds()
        if age > s.quote_stale_seconds:
            feed_ok = False
            out["errors"].append(f"{sym}: quote is {age:.0f}s old")
            continue
        QUOTES[sym] = q
        for fn in _listeners:
            fn(q)
        svc.on_quote(q, now)
    if symbols and not feed_ok:
        svc.halt("data_feed_down", "Market data is unavailable or delayed: " + "; ".join(out["errors"])[:300], now)
    elif symbols:
        svc.resume("data_feed_down")
    for sym, tf in sorted(wanted):
        if sym not in QUOTES or not feed_ok:
            continue
        try:
            df = feed.candles(sym, tf, 500)
        except BrokerError as e:
            out["errors"].append(f"{sym} {tf} candles: {e}")
            continue
        if df is None or len(df) < 3:
            continue
        closed = df[df.index + timedelta(minutes=TIMEFRAMES[tf]) <= now]
        if closed.empty:
            continue
        store.upsert(db, sym, tf, feed.source, closed)
        key, last = (account.id, sym, tf), closed.index[-1].to_pydatetime()
        prev = _last_candle.get(key)
        _last_candle[key] = last
        if prev is None or last <= prev:
            continue          # first sight after (re)start, or no new candle: never trade an old candle
        hist = store.load(db, sym, tf, feed.source, limit=1500)
        snap = ai.market_snapshot(hist, sym, tf, feed.source)
        if snap.get("unusual_volatility"):
            notify(db, account.user_id, "unusual_volatility", snap["summary"],
                   f"vol:{sym}:{tf}:{last.strftime('%Y%m%d%H')}", {"symbol": sym})
        for cfg, sig in svc.evaluate_strategies(sym, tf, hist):
            svc.execute_signal(cfg, sig, QUOTES[sym], now, data_source=feed.source)
            out["signals"] += 1
    return out


def run_once(now: datetime | None = None) -> None:
    now = now or datetime.now(timezone.utc)
    with session_scope() as db:
        ids = [a.id for a in db.query(Account).filter_by(trading_enabled=True)]
    for aid in ids:
        feed = adapter = None
        try:
            with session_scope() as db:
                account = db.get(Account, aid)
                feed = build_feed(db, account)
                if feed is None:
                    continue
                if account.mode == "live":
                    adapter = build_adapter(db.get(BrokerConnection, account.broker_connection_id))
                step_account(db, account, feed, adapter, now)
        except Exception:
            log.exception("trading loop failed for account %s", aid)
        finally:
            for c in (feed, adapter):
                if c is not None:
                    c.close()


async def loop_forever() -> None:
    s = get_settings()
    while True:
        try:
            await asyncio.to_thread(run_once)
        except Exception:
            log.exception("trading loop iteration failed")
        await asyncio.sleep(s.trading_loop_seconds)
