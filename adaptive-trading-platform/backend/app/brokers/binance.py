"""Binance adapters, built on the documented public REST API
(https://developers.binance.com/docs/binance-spot-api-docs/rest-api and the
USD-M futures REST API). Spot and derivatives are separate classes with
separate endpoints and semantics; neither exposes any withdrawal call, and the
connection test refuses keys that have withdrawal permission enabled.

STATUS: request construction, signing and response mapping are unit-tested
against a mock transport. Public market-data calls can be tested without
credentials. Signed endpoints have NOT been exercised against Binance."""
from __future__ import annotations

import hashlib
import hmac
import time
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx
import pandas as pd

from .base import (AccountInfo, BrokerAdapter, BrokerError, BrokerPosition, BrokerUnavailable, NotSupported,
                   OrderRejected, OrderRequest, OrderResult, Quote)

_TF = {"M1": "1m", "M5": "5m", "M15": "15m", "M30": "30m", "H1": "1h", "H4": "4h"}


def klines_to_frame(rows: list) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume"], index=pd.DatetimeIndex([], tz="UTC"))
    df = pd.DataFrame([r[:6] for r in rows], columns=["t", "open", "high", "low", "close", "volume"]).astype(float)
    df.index = pd.to_datetime(df.pop("t").astype("int64"), unit="ms", utc=True)
    return df


class BinanceMarketData:
    """Unauthenticated market data (klines, book ticker). Read-only."""

    def __init__(self, base_url: str = "https://data-api.binance.vision", transport=None, timeout: float = 10.0):
        self._http = httpx.Client(base_url=base_url, timeout=timeout, transport=transport)

    def _get(self, path, params):
        try:
            r = self._http.get(path, params=params)
        except httpx.HTTPError as e:
            raise BrokerUnavailable(f"Binance market data unreachable: {type(e).__name__}") from e
        if r.status_code >= 400:
            raise BrokerError(f"Binance error {r.status_code}: {r.text[:200]}")
        return r.json()

    def klines(self, symbol: str, timeframe: str, start: datetime | None = None, end: datetime | None = None,
               limit: int = 1000) -> pd.DataFrame:
        p = {"symbol": symbol, "interval": _TF[timeframe], "limit": min(limit, 1000)}
        if start:
            p["startTime"] = int(start.timestamp() * 1000)
        if end:
            p["endTime"] = int(end.timestamp() * 1000)
        return klines_to_frame(self._get("/api/v3/klines", p))

    def history(self, symbol: str, timeframe: str, start: datetime, end: datetime, max_calls: int = 400) -> pd.DataFrame:
        frames, cur = [], start
        for _ in range(max_calls):
            df = self.klines(symbol, timeframe, cur, end, 1000)
            if df.empty:
                break
            frames.append(df)
            nxt = df.index[-1].to_pydatetime() + (df.index[-1] - df.index[-2] if len(df) > 1 else pd.Timedelta(minutes=1))
            if len(df) < 1000 or nxt >= end:
                break
            cur = nxt
            time.sleep(0.15)
        if not frames:
            return klines_to_frame([])
        out = pd.concat(frames)
        out = out[~out.index.duplicated()].sort_index()
        # drop the still-forming candle
        return out[out.index + (out.index[1] - out.index[0]) <= pd.Timestamp.now(tz="UTC")] if len(out) > 1 else out

    def quote(self, symbol: str) -> Quote:
        d = self._get("/api/v3/ticker/bookTicker", {"symbol": symbol})
        return Quote(symbol, float(d["bidPrice"]), float(d["askPrice"]), datetime.now(timezone.utc), "binance")

    def order_book(self, symbol: str, depth: int = 20) -> dict:
        return self._get("/api/v3/depth", {"symbol": symbol, "limit": depth})

    def close(self):
        self._http.close()


class BinanceSpotAdapter(BrokerAdapter):
    key = "binance_spot"
    mode = "live"
    supports_short = False
    BASE = "https://api.binance.com"
    ORDER, OPEN_ORDERS, ACCOUNT = "/api/v3/order", "/api/v3/openOrders", "/api/v3/account"

    def __init__(self, api_key: str, api_secret: str, base_url: str | None = None, transport=None,
                 timeout: float = 8.0, recv_window: int = 5000):
        if not api_key or not api_secret:
            raise BrokerError("Binance API key and secret are required")
        self._key, self._secret, self._recv = api_key, api_secret, recv_window
        self._http = httpx.Client(base_url=base_url or self.BASE, timeout=timeout, transport=transport,
                                  headers={"X-MBX-APIKEY": api_key})

    def _signed(self, method: str, path: str, params: dict | None = None):
        p = {k: v for k, v in (params or {}).items() if v is not None}
        p |= {"timestamp": int(time.time() * 1000), "recvWindow": self._recv}
        query = urlencode(p)
        sig = hmac.new(self._secret.encode(), query.encode(), hashlib.sha256).hexdigest()
        try:
            r = self._http.request(method, f"{path}?{query}&signature={sig}")
        except httpx.HTTPError as e:
            raise BrokerUnavailable(f"Binance unreachable: {type(e).__name__}") from e
        return self._parse(r)

    def _public(self, path: str, params: dict):
        try:
            r = self._http.get(path, params=params)
        except httpx.HTTPError as e:
            raise BrokerUnavailable(f"Binance unreachable: {type(e).__name__}") from e
        return self._parse(r)

    @staticmethod
    def _parse(r: httpx.Response):
        if r.status_code in (418, 429) or r.status_code >= 500:
            raise BrokerUnavailable(f"Binance HTTP {r.status_code}")
        if r.status_code >= 400:
            d = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
            raise OrderRejected(f"Binance {d.get('code')}: {d.get('msg', r.text[:120])}")
        return r.json()

    # -- read ---------------------------------------------------------------------
    def health(self) -> dict:
        try:
            t = self._public("/api/v3/time", {})
            return {"ok": True, "clock_skew_ms": int(time.time() * 1000) - int(t["serverTime"])}
        except BrokerError as e:
            return {"ok": False, "error": str(e)}

    def permissions(self) -> dict:
        return self._signed("GET", "/sapi/v1/account/apiRestrictions")

    def test_connection(self) -> dict:
        h = self.health()
        perms = self.permissions()
        if perms.get("enableWithdrawals"):
            raise BrokerError("API key has WITHDRAWAL permission enabled. Create a key without it; "
                              "this platform refuses keys that can withdraw.")
        info = self.account_info()
        return {"ok": bool(h.get("ok")), "health": h, "account_type": info.account_type,
                "trade_allowed": info.trade_allowed, "withdrawals_enabled": False,
                "ip_restricted": bool(perms.get("ipRestrict")), "currency": info.currency}

    def account_info(self) -> AccountInfo:
        d = self._signed("GET", self.ACCOUNT)
        usdt = next((b for b in d.get("balances", []) if b["asset"] == "USDT"), {"free": 0, "locked": 0})
        free, locked = float(usdt["free"]), float(usdt["locked"])
        return AccountInfo(balance=free + locked, equity=free + locked, margin=locked, free_margin=free,
                           currency="USDT", leverage=1.0, account_type="real",
                           trade_allowed=bool(d.get("canTrade")), raw={"balances": d.get("balances", [])})

    def positions(self) -> list[BrokerPosition]:
        """Spot has balances, not positions: non-quote asset holdings are reported as longs."""
        d = self._signed("GET", self.ACCOUNT)
        return [BrokerPosition(b["asset"], f"{b['asset']}USDT", 1, float(b["free"]) + float(b["locked"]), 0.0,
                               None, None, 0.0)
                for b in d.get("balances", []) if b["asset"] != "USDT" and float(b["free"]) + float(b["locked"]) > 0]

    def quote(self, symbol: str) -> Quote:
        d = self._public("/api/v3/ticker/bookTicker", {"symbol": symbol})
        return Quote(symbol, float(d["bidPrice"]), float(d["askPrice"]), datetime.now(timezone.utc), self.key)

    def symbol_spec(self, symbol: str) -> dict:
        info = self._public("/api/v3/exchangeInfo", {"symbol": symbol})["symbols"][0]
        f = {x["filterType"]: x for x in info["filters"]}
        lot, price = f.get("LOT_SIZE", {}), f.get("PRICE_FILTER", {})
        notional = f.get("NOTIONAL") or f.get("MIN_NOTIONAL") or {}
        return {"symbol": symbol, "contract_size": 1.0, "tick_size": float(price.get("tickSize", 0)),
                "min_volume": float(lot.get("minQty", 0)), "volume_step": float(lot.get("stepSize", 0)),
                "max_volume": float(lot.get("maxQty", 0)), "min_notional": float(notional.get("minNotional", 0)),
                "trade_mode": info.get("status"), "source": self.key}

    def order_book(self, symbol, depth=20) -> dict:
        return self._public("/api/v3/depth", {"symbol": symbol, "limit": depth})

    def candles(self, symbol, timeframe, start=None, end=None, limit=1000) -> pd.DataFrame:
        p = {"symbol": symbol, "interval": _TF[timeframe], "limit": min(limit, 1000)}
        return klines_to_frame(self._public("/api/v3/klines", p))

    # -- trade ----------------------------------------------------------------------
    def place_order(self, req: OrderRequest) -> OrderResult:
        if req.side < 0 and not self.supports_short:
            # selling is only valid to reduce an existing holding; the trading service enforces that
            pass
        p = {"symbol": req.symbol, "side": "BUY" if req.side > 0 else "SELL",
             "type": "MARKET" if req.order_type == "market" else "LIMIT", "quantity": f"{req.volume:.8f}".rstrip("0"),
             "newClientOrderId": req.client_order_id, "newOrderRespType": "FULL"}
        if req.order_type != "market":
            p |= {"price": req.price, "timeInForce": "GTC"}
        try:
            d = self._signed("POST", self.ORDER, p)
        except OrderRejected as e:
            if "-2010" in str(e) and "uplicate" in str(e):      # duplicate clientOrderId
                found = self.find_order(req.client_order_id, req.symbol)
                if found:
                    found.duplicate = True
                    return found
            raise
        return self._result(d)

    def find_order(self, client_order_id: str, symbol: str = "BTCUSDT") -> OrderResult | None:
        try:
            return self._result(self._signed("GET", self.ORDER, {"symbol": symbol, "origClientOrderId": client_order_id}))
        except OrderRejected as e:
            if "-2013" in str(e):       # order does not exist
                return None
            raise

    def cancel_order(self, broker_order_id: str, symbol: str = "BTCUSDT") -> None:
        self._signed("DELETE", self.ORDER, {"symbol": symbol, "orderId": broker_order_id})

    def close_position(self, position_id, client_order_id, volume=None) -> OrderResult:
        """Spot 'close' = market-sell the held base asset quantity."""
        if volume is None:
            raise NotSupported("spot close requires an explicit quantity")
        return self.place_order(OrderRequest(client_order_id, f"{position_id}USDT", -1, volume))

    @staticmethod
    def _result(d: dict) -> OrderResult:
        qty, quote_qty = float(d.get("executedQty", 0) or 0), float(d.get("cummulativeQuoteQty", 0) or 0)
        status = {"FILLED": "filled", "NEW": "accepted", "PARTIALLY_FILLED": "accepted"}.get(d.get("status"), "rejected")
        return OrderResult(d.get("clientOrderId", ""), str(d.get("orderId", "")), status,
                           (quote_qty / qty) if qty else None, qty or None, None, False, d)

    def close(self):
        self._http.close()


class BinanceFuturesAdapter(BinanceSpotAdapter):
    """USD-M perpetual futures. A different product with margin, funding and
    liquidation risk: separate endpoints, separate credentials, separate
    compliance decision. Derivatives stay disabled unless explicitly enabled."""
    key = "binance_usdm"
    supports_short = True
    BASE = "https://fapi.binance.com"
    ORDER, OPEN_ORDERS, ACCOUNT = "/fapi/v1/order", "/fapi/v1/openOrders", "/fapi/v2/account"

    def health(self) -> dict:
        try:
            t = self._public("/fapi/v1/time", {})
            return {"ok": True, "clock_skew_ms": int(time.time() * 1000) - int(t["serverTime"])}
        except BrokerError as e:
            return {"ok": False, "error": str(e)}

    def account_info(self) -> AccountInfo:
        d = self._signed("GET", self.ACCOUNT)
        return AccountInfo(balance=float(d["totalWalletBalance"]), equity=float(d["totalMarginBalance"]),
                           margin=float(d["totalInitialMargin"]), free_margin=float(d["availableBalance"]),
                           currency="USDT", account_type="real", trade_allowed=bool(d.get("canTrade")), raw={})

    def positions(self) -> list[BrokerPosition]:
        out = []
        for p in self._signed("GET", "/fapi/v2/positionRisk"):
            amt = float(p["positionAmt"])
            if amt:
                out.append(BrokerPosition(p["symbol"], p["symbol"], 1 if amt > 0 else -1, abs(amt),
                                          float(p["entryPrice"]), None, None, float(p["unRealizedProfit"])))
        return out

    def quote(self, symbol: str) -> Quote:
        d = self._public("/fapi/v1/ticker/bookTicker", {"symbol": symbol})
        return Quote(symbol, float(d["bidPrice"]), float(d["askPrice"]), datetime.now(timezone.utc), self.key)

    def symbol_spec(self, symbol: str) -> dict:
        raise NotSupported("futures exchangeInfo mapping not implemented yet")

    def order_book(self, symbol, depth=20) -> dict:
        return self._public("/fapi/v1/depth", {"symbol": symbol, "limit": depth})

    def candles(self, symbol, timeframe, start=None, end=None, limit=1000) -> pd.DataFrame:
        return klines_to_frame(self._public("/fapi/v1/klines", {"symbol": symbol, "interval": _TF[timeframe],
                                                                "limit": min(limit, 1000)}))

    def close_position(self, position_id, client_order_id, volume=None) -> OrderResult:
        pos = next((p for p in self.positions() if p.symbol == position_id), None)
        if pos is None:
            raise OrderRejected("no open position")
        p = {"symbol": pos.symbol, "side": "SELL" if pos.side > 0 else "BUY", "type": "MARKET",
             "quantity": volume or pos.volume, "reduceOnly": "true", "newClientOrderId": client_order_id}
        return self._result(self._signed("POST", self.ORDER, p))

    def test_connection(self) -> dict:
        h, info = self.health(), self.account_info()
        return {"ok": bool(h.get("ok")), "health": h, "account_type": info.account_type,
                "trade_allowed": info.trade_allowed, "currency": info.currency,
                "note": "withdrawal permission must be checked on the spot API key restrictions endpoint"}
