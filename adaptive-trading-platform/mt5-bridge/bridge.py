"""Windows MT5 execution bridge.

Runs on the Windows machine / VPS that hosts the MetaTrader 5 terminal and
exposes a small authenticated HTTP API to the trading backend. It uses the
official ``MetaTrader5`` Python package, which only works on Windows next to a
running terminal. The mobile app never talks to this service.

Security model
  * every request carries an HMAC-SHA256 signature over
    (timestamp, nonce, method, path+query, sha256(body)) with a shared secret;
    stale timestamps and replayed nonces are refused;
  * bind it to a private interface (WireGuard / Tailscale) or put it behind
    TLS; never expose it to the public internet in clear text;
  * broker login is done in the terminal itself (or via BRIDGE_MT5_* variables
    on this machine). The backend never sees the broker password.

Idempotency
  * every order carries a client_order_id. Results are journalled to disk and
    the id is written into the MT5 order comment, so a retried request returns
    the original result instead of opening a second position.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import threading
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field

MAGIC = 20261111
MAX_SKEW = 30
TIMEFRAMES = {"M1": "TIMEFRAME_M1", "M5": "TIMEFRAME_M5", "M15": "TIMEFRAME_M15", "M30": "TIMEFRAME_M30",
              "H1": "TIMEFRAME_H1", "H4": "TIMEFRAME_H4"}


class OrderIn(BaseModel):
    client_order_id: str = Field(min_length=8, max_length=64, pattern="^[A-Za-z0-9_-]+$")
    symbol: str
    side: str = Field(pattern="^(buy|sell)$")
    volume: float = Field(gt=0)
    type: str = Field(default="market", pattern="^(market|limit|stop)$")
    price: float | None = None
    sl: float | None = None
    tp: float | None = None
    deviation: float | None = None


class CloseIn(BaseModel):
    client_order_id: str = Field(min_length=4, max_length=64)
    volume: float | None = None


class ModifyIn(BaseModel):
    price: float | None = None
    sl: float | None = None
    tp: float | None = None


class Journal:
    """Disk-backed map client_order_id -> result (survives bridge restarts)."""

    def __init__(self, path: str | None):
        self.path = Path(path) if path else None
        self.lock = threading.Lock()
        self.data: dict[str, dict] = {}
        if self.path and self.path.exists():
            self.data = json.loads(self.path.read_text() or "{}")

    def get(self, cid: str) -> dict | None:
        return self.data.get(cid)

    def put(self, cid: str, result: dict) -> None:
        with self.lock:
            self.data[cid] = result
            if self.path:
                tmp = self.path.with_suffix(".tmp")
                tmp.write_text(json.dumps(self.data))
                tmp.replace(self.path)


def create_app(mt5=None, secret: str | None = None, journal_path: str | None = None, clock=time.time) -> FastAPI:
    secret = secret or os.environ.get("BRIDGE_SECRET", "")
    if len(secret) < 24:
        raise RuntimeError("BRIDGE_SECRET must be set to a random string of at least 24 characters")
    if mt5 is None:
        import MetaTrader5 as mt5  # noqa: N813  (Windows only)
    app = FastAPI(title="ATP MT5 bridge", docs_url=None, redoc_url=None)
    journal = Journal(journal_path if journal_path is not None else os.environ.get("BRIDGE_JOURNAL", "orders.json"))
    nonces: dict[str, float] = {}
    order_lock = threading.Lock()
    state = {"initialized": False}

    def ensure() -> None:
        """(Re)initialise the terminal connection; raises 503 when unavailable."""
        if state["initialized"] and mt5.terminal_info() is not None:
            return
        kw = {}
        if os.environ.get("BRIDGE_MT5_PATH"):
            kw["path"] = os.environ["BRIDGE_MT5_PATH"]
        if os.environ.get("BRIDGE_MT5_LOGIN"):
            kw |= {"login": int(os.environ["BRIDGE_MT5_LOGIN"]), "password": os.environ.get("BRIDGE_MT5_PASSWORD", ""),
                   "server": os.environ.get("BRIDGE_MT5_SERVER", "")}
        if not mt5.initialize(**kw):
            state["initialized"] = False
            raise HTTPException(503, f"MT5 terminal not available: {mt5.last_error()}")
        state["initialized"] = True

    @app.middleware("http")
    async def verify(request: Request, call_next):
        from fastapi.responses import JSONResponse
        ts, nonce, sig = (request.headers.get(h, "") for h in
                          ("x-bridge-timestamp", "x-bridge-nonce", "x-bridge-signature"))
        body = await request.body()
        now = clock()
        try:
            fresh = abs(now - int(ts)) <= MAX_SKEW
        except ValueError:
            fresh = False
        path = request.url.path + (f"?{request.url.query}" if request.url.query else "")
        msg = b"\n".join([ts.encode(), nonce.encode(), request.method.encode(), path.encode(),
                          hashlib.sha256(body).hexdigest().encode()])
        good = hmac.compare_digest(hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest(), sig)
        if not (fresh and good and len(nonce) >= 16):
            return JSONResponse({"detail": "unauthorized"}, status_code=401)
        for k in [k for k, v in nonces.items() if v < now - 2 * MAX_SKEW]:
            nonces.pop(k, None)
        if nonce in nonces:
            return JSONResponse({"detail": "replayed request"}, status_code=401)
        nonces[nonce] = now
        return await call_next(request)

    def sym(symbol: str):
        info = mt5.symbol_info(symbol)
        if info is None:
            raise HTTPException(422, f"unknown symbol '{symbol}' on this broker (check the symbol mapping)")
        if not info.visible and not mt5.symbol_select(symbol, True):
            raise HTTPException(422, f"symbol '{symbol}' cannot be selected in Market Watch")
        return info

    def tick(symbol: str):
        t = mt5.symbol_info_tick(symbol)
        if t is None or not t.bid or not t.ask:
            raise HTTPException(503, f"no quote for {symbol}")
        return t

    def filling(info) -> int:
        mode = getattr(info, "filling_mode", 0)
        if mode & 1:
            return mt5.ORDER_FILLING_FOK
        if mode & 2:
            return mt5.ORDER_FILLING_IOC
        return mt5.ORDER_FILLING_RETURN

    def send(request: dict, cid: str) -> dict:
        res = mt5.order_send(request)
        if res is None:
            raise HTTPException(503, f"order_send returned nothing: {mt5.last_error()}")
        ok = res.retcode in (mt5.TRADE_RETCODE_DONE, mt5.TRADE_RETCODE_PLACED)
        out = {"client_order_id": cid, "retcode": int(res.retcode), "comment": str(res.comment),
               "order": int(res.order or 0), "deal": int(res.deal or 0), "price": float(res.price or 0) or None,
               "volume": float(res.volume or 0) or None,
               "status": ("filled" if res.retcode == mt5.TRADE_RETCODE_DONE else "accepted") if ok else "rejected"}
        if not ok:
            journal.put(cid, out)
            raise HTTPException(422, f"{res.retcode} {res.comment}")
        return out

    # ------------------------------------------------------------------ read
    @app.get("/health")
    def health(probe: str | None = None):
        try:
            ensure()
        except HTTPException as e:
            return {"ok": False, "terminal": False, "error": e.detail}
        ti, ai = mt5.terminal_info(), mt5.account_info()
        out = {"terminal": True, "broker_connected": bool(ti.connected), "terminal_trade_allowed": bool(ti.trade_allowed),
               "account": ai is not None, "ping_ms": getattr(ti, "ping_last", 0) / 1000 if ti else None,
               "time": int(clock())}
        if probe:
            t = mt5.symbol_info_tick(probe)
            out["tick_age_seconds"] = None if t is None else max(0, int(clock()) - int(t.time))
        out["ok"] = bool(out["broker_connected"] and out["account"])
        if not out["ok"]:
            out["error"] = "terminal is not connected to the broker" if not ti.connected else "no account logged in"
        return out

    @app.get("/account")
    def account():
        ensure()
        a = mt5.account_info()
        if a is None:
            raise HTTPException(503, "no account logged in")
        mode = {mt5.ACCOUNT_TRADE_MODE_DEMO: "demo", mt5.ACCOUNT_TRADE_MODE_REAL: "real"}.get(a.trade_mode, "contest")
        return {"login": a.login, "server": a.server, "currency": a.currency, "balance": a.balance,
                "equity": a.equity, "margin": a.margin, "margin_free": a.margin_free, "leverage": a.leverage,
                "account_type": mode, "trade_allowed": bool(a.trade_allowed and a.trade_expert
                                                              and mt5.terminal_info().trade_allowed)}

    @app.get("/positions")
    def positions():
        ensure()
        return [{"ticket": p.ticket, "symbol": p.symbol, "type": "buy" if p.type == mt5.POSITION_TYPE_BUY else "sell",
                 "volume": p.volume, "price_open": p.price_open, "sl": p.sl, "tp": p.tp, "profit": p.profit,
                 "time": p.time, "comment": p.comment, "magic": p.magic} for p in (mt5.positions_get() or [])]

    @app.get("/orders")
    def pending_orders():
        ensure()
        return [{"ticket": o.ticket, "symbol": o.symbol, "type": o.type, "volume": o.volume_current,
                 "price": o.price_open, "sl": o.sl, "tp": o.tp, "comment": o.comment} for o in (mt5.orders_get() or [])]

    @app.get("/history/orders")
    def history_orders(start: int, end: int):
        ensure()
        from datetime import datetime, timezone
        rows = mt5.history_orders_get(datetime.fromtimestamp(start, timezone.utc), datetime.fromtimestamp(end, timezone.utc))
        return [{"ticket": o.ticket, "symbol": o.symbol, "type": o.type, "state": o.state, "volume": o.volume_initial,
                 "price": o.price_open, "time_setup": o.time_setup, "time_done": o.time_done, "comment": o.comment,
                 "position_id": o.position_id} for o in (rows or [])]

    @app.get("/history/deals")
    def history_deals(start: int, end: int):
        ensure()
        from datetime import datetime, timezone
        rows = mt5.history_deals_get(datetime.fromtimestamp(start, timezone.utc), datetime.fromtimestamp(end, timezone.utc))
        return [{"ticket": d.ticket, "order": d.order, "position_id": d.position_id, "symbol": d.symbol,
                 "type": d.type, "entry": d.entry, "volume": d.volume, "price": d.price, "profit": d.profit,
                 "commission": d.commission, "swap": d.swap, "time": d.time, "comment": d.comment} for d in (rows or [])]

    @app.get("/quote/{symbol}")
    def quote(symbol: str):
        ensure()
        sym(symbol)
        t = tick(symbol)
        return {"symbol": symbol, "bid": t.bid, "ask": t.ask, "time": int(t.time)}

    @app.get("/symbols/{symbol}")
    def symbol_spec(symbol: str):
        ensure()
        i = sym(symbol)
        a = mt5.account_info()
        return {"symbol": symbol, "contract_size": i.trade_contract_size, "tick_size": i.trade_tick_size or i.point,
                "point": i.point, "digits": i.digits, "min_volume": i.volume_min, "volume_step": i.volume_step,
                "max_volume": i.volume_max, "spread": i.spread * i.point, "spread_points": i.spread,
                "stops_level_points": getattr(i, "trade_stops_level", 0), "trade_mode": i.trade_mode,
                # swap units depend on the broker's swap_mode; reported raw, never guessed into USD
                "swap_long_raw": i.swap_long, "swap_short_raw": i.swap_short, "swap_mode": getattr(i, "swap_mode", None),
                "margin_rate": (1.0 / a.leverage) if a and a.leverage else None,
                "currency_base": getattr(i, "currency_base", None), "currency_profit": getattr(i, "currency_profit", None)}

    @app.get("/candles/{symbol}")
    def candles(symbol: str, timeframe: str = "M5", count: int = 500):
        ensure()
        sym(symbol)
        if timeframe not in TIMEFRAMES:
            raise HTTPException(422, "unknown timeframe")
        rates = mt5.copy_rates_from_pos(symbol, getattr(mt5, TIMEFRAMES[timeframe]), 0, min(count, 50_000))
        if rates is None:
            raise HTTPException(503, f"no history for {symbol}: {mt5.last_error()}")
        return [{"time": int(r["time"]), "open": float(r["open"]), "high": float(r["high"]), "low": float(r["low"]),
                 "close": float(r["close"]), "tick_volume": float(r["tick_volume"]), "spread": float(r["spread"])}
                for r in rates]

    # ----------------------------------------------------------------- trade
    def find_existing(cid: str) -> dict | None:
        hit = journal.get(cid)
        if hit:
            return hit
        tag = cid[:28]
        for p in (mt5.positions_get() or []):
            if p.comment == tag and p.magic == MAGIC:
                return {"client_order_id": cid, "status": "filled", "order": 0, "deal": 0, "price": p.price_open,
                        "volume": p.volume, "position": p.ticket, "retcode": int(mt5.TRADE_RETCODE_DONE),
                        "comment": "recovered from open position"}
        return None

    @app.post("/orders")
    def place(o: OrderIn):
        ensure()
        with order_lock:                       # serialise: check-then-send must be atomic
            dup = find_existing(o.client_order_id)
            if dup:
                if dup["status"] == "rejected":
                    raise HTTPException(422, f"{dup['retcode']} {dup['comment']} (original result)")
                return dup | {"duplicate": True}
            a = mt5.account_info()
            if a is None or not mt5.terminal_info().connected:
                raise HTTPException(503, "terminal is not connected to the broker")
            info = sym(o.symbol)
            if o.volume < info.volume_min or o.volume > info.volume_max:
                raise HTTPException(422, f"volume {o.volume} outside [{info.volume_min}, {info.volume_max}]")
            t = tick(o.symbol)
            buy = o.side == "buy"
            req = {"symbol": o.symbol, "volume": float(o.volume), "magic": MAGIC, "comment": o.client_order_id[:28],
                   "type_time": mt5.ORDER_TIME_GTC, "type_filling": filling(info)}
            if o.type == "market":
                req |= {"action": mt5.TRADE_ACTION_DEAL, "type": mt5.ORDER_TYPE_BUY if buy else mt5.ORDER_TYPE_SELL,
                        "price": t.ask if buy else t.bid,
                        "deviation": int(round((o.deviation or 20 * info.point) / info.point))}
            else:
                if o.price is None:
                    raise HTTPException(422, "pending orders need a price")
                kind = {("limit", True): mt5.ORDER_TYPE_BUY_LIMIT, ("limit", False): mt5.ORDER_TYPE_SELL_LIMIT,
                        ("stop", True): mt5.ORDER_TYPE_BUY_STOP, ("stop", False): mt5.ORDER_TYPE_SELL_STOP}[(o.type, buy)]
                req |= {"action": mt5.TRADE_ACTION_PENDING, "type": kind, "price": o.price}
            if o.sl:
                req["sl"] = o.sl
            if o.tp:
                req["tp"] = o.tp
            out = send(req, o.client_order_id)
            if out["status"] == "filled":
                pos = [p for p in (mt5.positions_get(symbol=o.symbol) or []) if p.comment == req["comment"]]
                out["position"] = pos[-1].ticket if pos else out["order"]
            journal.put(o.client_order_id, out)
            return out

    @app.get("/orders/by-client-id/{cid}")
    def by_client_id(cid: str):
        ensure()
        hit = find_existing(cid)
        if not hit:
            raise HTTPException(404, "unknown client order id")
        return hit

    @app.patch("/orders/{ticket}")
    def modify_order(ticket: int, m: ModifyIn):
        ensure()
        cur = mt5.orders_get(ticket=ticket)
        if not cur:
            raise HTTPException(422, "pending order not found")
        o = cur[0]
        return send({"action": mt5.TRADE_ACTION_MODIFY, "order": ticket, "price": m.price or o.price_open,
                     "sl": m.sl if m.sl is not None else o.sl, "tp": m.tp if m.tp is not None else o.tp,
                     "type_time": mt5.ORDER_TIME_GTC}, f"modify-{ticket}")

    @app.delete("/orders/{ticket}")
    def cancel_order(ticket: int):
        ensure()
        return send({"action": mt5.TRADE_ACTION_REMOVE, "order": ticket}, f"cancel-{ticket}")

    @app.patch("/positions/{ticket}")
    def modify_position(ticket: int, m: ModifyIn):
        ensure()
        cur = mt5.positions_get(ticket=ticket)
        if not cur:
            raise HTTPException(422, "position not found")
        p = cur[0]
        return send({"action": mt5.TRADE_ACTION_SLTP, "position": ticket, "symbol": p.symbol,
                     "sl": m.sl if m.sl is not None else p.sl, "tp": m.tp if m.tp is not None else p.tp},
                    f"sltp-{ticket}-{int(clock())}")

    @app.post("/positions/{ticket}/close")
    def close_position(ticket: int, c: CloseIn):
        ensure()
        with order_lock:
            done = journal.get(c.client_order_id)
            if done:
                return done | {"duplicate": True}
            cur = mt5.positions_get(ticket=ticket)
            if not cur:
                raise HTTPException(422, "position not found (already closed?)")
            p = cur[0]
            info, t = sym(p.symbol), tick(p.symbol)
            buy_back = p.type == mt5.POSITION_TYPE_SELL
            out = send({"action": mt5.TRADE_ACTION_DEAL, "position": ticket, "symbol": p.symbol,
                        "volume": float(c.volume or p.volume), "type": mt5.ORDER_TYPE_BUY if buy_back else mt5.ORDER_TYPE_SELL,
                        "price": t.ask if buy_back else t.bid, "deviation": 20, "magic": MAGIC,
                        "comment": c.client_order_id[:28], "type_time": mt5.ORDER_TIME_GTC,
                        "type_filling": filling(info)}, c.client_order_id)
            journal.put(c.client_order_id, out)
            return out

    return app


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(create_app(), host=os.environ.get("BRIDGE_HOST", "127.0.0.1"), port=int(os.environ.get("BRIDGE_PORT", "8787")))
