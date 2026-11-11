"""Broker adapter contract. The strategy/risk core only ever talks to this
interface; adding a broker means adding one adapter module."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime

import pandas as pd


class BrokerError(Exception):
    """Base class for adapter failures."""


class BrokerUnavailable(BrokerError):
    """Transport-level failure: the request may or may not have reached the broker."""


class OrderRejected(BrokerError):
    """The broker definitively refused the order."""


class NotSupported(BrokerError):
    """The capability does not exist for this broker / has not been implemented."""


@dataclass
class Quote:
    symbol: str
    bid: float
    ask: float
    ts: datetime
    source: str = ""

    @property
    def mid(self) -> float:
        return (self.bid + self.ask) / 2

    @property
    def spread(self) -> float:
        return self.ask - self.bid


@dataclass
class AccountInfo:
    balance: float
    equity: float
    margin: float
    free_margin: float
    currency: str = "USD"
    leverage: float | None = None
    account_type: str = "unknown"      # demo | real | unknown
    trade_allowed: bool = False
    login: str | None = None
    server: str | None = None
    raw: dict = field(default_factory=dict)


@dataclass
class BrokerPosition:
    position_id: str
    symbol: str
    side: int
    volume: float
    entry_price: float
    sl: float | None
    tp: float | None
    profit: float
    opened_at: datetime | None = None
    client_order_id: str | None = None


@dataclass
class OrderRequest:
    client_order_id: str
    symbol: str
    side: int
    volume: float
    order_type: str = "market"
    price: float | None = None
    sl: float | None = None
    tp: float | None = None
    max_slippage: float | None = None


@dataclass
class OrderResult:
    client_order_id: str
    broker_order_id: str
    status: str                       # filled | accepted | rejected
    fill_price: float | None = None
    volume: float | None = None
    position_id: str | None = None
    duplicate: bool = False
    raw: dict = field(default_factory=dict)


class BrokerAdapter(ABC):
    key: str = ""
    mode: str = "live"                # the paper adapter overrides this
    supports_short: bool = True

    @abstractmethod
    def health(self) -> dict: ...
    @abstractmethod
    def account_info(self) -> AccountInfo: ...
    @abstractmethod
    def positions(self) -> list[BrokerPosition]: ...
    @abstractmethod
    def quote(self, symbol: str) -> Quote: ...
    @abstractmethod
    def symbol_spec(self, symbol: str) -> dict: ...
    @abstractmethod
    def place_order(self, req: OrderRequest) -> OrderResult: ...
    @abstractmethod
    def find_order(self, client_order_id: str) -> OrderResult | None: ...
    @abstractmethod
    def close_position(self, position_id: str, client_order_id: str, volume: float | None = None) -> OrderResult: ...

    def modify_position(self, position_id: str, sl: float | None, tp: float | None) -> None:
        raise NotSupported("modify_position")

    def cancel_order(self, broker_order_id: str) -> None:
        raise NotSupported("cancel_order")

    def modify_order(self, broker_order_id: str, price: float | None, sl: float | None, tp: float | None) -> None:
        raise NotSupported("modify_order")

    def history_orders(self, start: datetime, end: datetime) -> list[dict]:
        raise NotSupported("history_orders")

    def candles(self, symbol: str, timeframe: str, start: datetime | None = None, end: datetime | None = None,
                limit: int = 1000) -> pd.DataFrame:
        raise NotSupported("candles")

    def order_book(self, symbol: str, depth: int = 20) -> dict:
        raise NotSupported("order_book")

    def test_connection(self) -> dict:
        """Read-only end-to-end check. Returns facts only; never places an order."""
        h = self.health()
        info = self.account_info()
        return {"ok": bool(h.get("ok")), "health": h, "account_type": info.account_type,
                "trade_allowed": info.trade_allowed, "currency": info.currency, "leverage": info.leverage,
                "login": info.login, "server": info.server}

    def close(self) -> None:
        pass
