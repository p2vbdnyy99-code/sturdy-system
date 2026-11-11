"""MetaTrader 5 adapter: an HTTP client for the Windows execution bridge
(../mt5-bridge). The backend never talks to a terminal directly and iOS never
talks to the bridge. Requests are HMAC-signed with a shared secret.

STATUS: contract-tested against the bridge running with a simulated
MetaTrader5 module (tests/test_mt5_bridge.py). NOT yet tested against a real
terminal/broker account; see docs/BROKERS.md for the connection test."""
from __future__ import annotations

import json
import secrets
import time
from datetime import datetime, timezone

import httpx
import pandas as pd

from ..security import sign_request
from .base import (AccountInfo, BrokerAdapter, BrokerError, BrokerPosition, BrokerUnavailable, NotSupported,
                   OrderRejected, OrderRequest, OrderResult, Quote)


class MT5Adapter(BrokerAdapter):
    key = "mt5"
    mode = "live"

    def __init__(self, base_url: str, secret: str, symbol_map: dict[str, str] | None = None, timeout: float = 8.0,
                 transport: httpx.BaseTransport | None = None):
        if not base_url or not secret:
            raise BrokerError("MT5 bridge URL and shared secret are required")
        self.base_url = base_url.rstrip("/")
        self._secret = secret
        self.symbol_map = symbol_map or {}            # platform symbol -> broker symbol (e.g. XAUUSD -> XAUUSDm)
        self._rev = {v: k for k, v in self.symbol_map.items()}
        self._http = httpx.Client(base_url=self.base_url, timeout=timeout, transport=transport)

    # -- transport --------------------------------------------------------------
    def _call(self, method: str, path: str, body: dict | None = None, params: dict | None = None):
        raw = json.dumps(body, separators=(",", ":")).encode() if body is not None else b""
        ts, nonce = str(int(time.time())), secrets.token_hex(12)
        req = self._http.build_request(method, path, content=raw or None, params=params)
        signed_path = req.url.raw_path.decode()
        headers = {"X-Bridge-Timestamp": ts, "X-Bridge-Nonce": nonce,
                   "X-Bridge-Signature": sign_request(self._secret, method, signed_path, raw, ts, nonce),
                   "Content-Type": "application/json"}
        req.headers.update(headers)
        try:
            r = self._http.send(req)
        except httpx.HTTPError as e:
            raise BrokerUnavailable(f"MT5 bridge unreachable: {type(e).__name__}") from e
        if r.status_code == 422 or r.status_code == 409:
            raise OrderRejected(r.json().get("detail", r.text))
        if r.status_code == 503:
            raise BrokerUnavailable(r.json().get("detail", "bridge reports terminal unavailable"))
        if r.status_code >= 400:
            raise BrokerError(f"bridge error {r.status_code}: {r.text[:200]}")
        return r.json()

    def bsym(self, symbol: str) -> str:
        return self.symbol_map.get(symbol, symbol)

    def psym(self, broker_symbol: str) -> str:
        return self._rev.get(broker_symbol, broker_symbol)

    # -- read ---------------------------------------------------------------------
    def health(self) -> dict:
        try:
            return self._call("GET", "/health")
        except BrokerUnavailable as e:
            return {"ok": False, "bridge_reachable": False, "error": str(e)}

    def account_info(self) -> AccountInfo:
        d = self._call("GET", "/account")
        return AccountInfo(balance=d["balance"], equity=d["equity"], margin=d["margin"],
                           free_margin=d["margin_free"], currency=d["currency"], leverage=d.get("leverage"),
                           account_type=d.get("account_type", "unknown"), trade_allowed=bool(d.get("trade_allowed")),
                           login=str(d.get("login")), server=d.get("server"), raw=d)

    def positions(self) -> list[BrokerPosition]:
        return [BrokerPosition(str(p["ticket"]), self.psym(p["symbol"]), 1 if p["type"] == "buy" else -1,
                               p["volume"], p["price_open"], p.get("sl") or None, p.get("tp") or None, p["profit"],
                               datetime.fromtimestamp(p["time"], timezone.utc), p.get("comment") or None)
                for p in self._call("GET", "/positions")]

    def quote(self, symbol: str) -> Quote:
        d = self._call("GET", f"/quote/{self.bsym(symbol)}")
        return Quote(symbol, d["bid"], d["ask"], datetime.fromtimestamp(d["time"], timezone.utc), "mt5")

    def symbol_spec(self, symbol: str) -> dict:
        return self._call("GET", f"/symbols/{self.bsym(symbol)}")

    def history_orders(self, start: datetime, end: datetime) -> list[dict]:
        return self._call("GET", "/history/orders", params={"start": int(start.timestamp()), "end": int(end.timestamp())})

    def history_deals(self, start: datetime, end: datetime) -> list[dict]:
        return self._call("GET", "/history/deals", params={"start": int(start.timestamp()), "end": int(end.timestamp())})

    def candles(self, symbol, timeframe, start=None, end=None, limit=1000) -> pd.DataFrame:
        rows = self._call("GET", f"/candles/{self.bsym(symbol)}", params={"timeframe": timeframe, "count": limit})
        df = pd.DataFrame(rows)
        if df.empty:
            return df
        df.index = pd.to_datetime(df.pop("time"), unit="s", utc=True)
        return df.rename(columns={"tick_volume": "volume"})[["open", "high", "low", "close", "volume", "spread"]]

    # -- trade ----------------------------------------------------------------------
    def place_order(self, req: OrderRequest) -> OrderResult:
        d = self._call("POST", "/orders", {
            "client_order_id": req.client_order_id, "symbol": self.bsym(req.symbol),
            "side": "buy" if req.side > 0 else "sell", "volume": req.volume, "type": req.order_type,
            "price": req.price, "sl": req.sl, "tp": req.tp, "deviation": req.max_slippage})
        return self._result(d)

    def find_order(self, client_order_id: str) -> OrderResult | None:
        try:
            return self._result(self._call("GET", f"/orders/by-client-id/{client_order_id}"))
        except BrokerError as e:
            if "404" in str(e):
                return None
            raise

    def close_position(self, position_id, client_order_id, volume=None) -> OrderResult:
        return self._result(self._call("POST", f"/positions/{position_id}/close",
                                       {"client_order_id": client_order_id, "volume": volume}))

    def modify_position(self, position_id, sl, tp) -> None:
        self._call("PATCH", f"/positions/{position_id}", {"sl": sl, "tp": tp})

    def modify_order(self, broker_order_id, price, sl, tp) -> None:
        self._call("PATCH", f"/orders/{broker_order_id}", {"price": price, "sl": sl, "tp": tp})

    def cancel_order(self, broker_order_id) -> None:
        self._call("DELETE", f"/orders/{broker_order_id}")

    def order_book(self, symbol, depth=20):
        raise NotSupported("MT5 market depth is not exposed by the bridge")

    @staticmethod
    def _result(d: dict) -> OrderResult:
        return OrderResult(d["client_order_id"], str(d.get("order") or d.get("deal") or ""), d["status"],
                           d.get("price"), d.get("volume"), str(d["position"]) if d.get("position") else None,
                           bool(d.get("duplicate")), d)

    def close(self) -> None:
        self._http.close()
