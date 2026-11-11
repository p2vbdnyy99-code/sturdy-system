"""Paper broker: simulated execution on the platform's own ledger. It has no
network code and no credentials, so it cannot reach a real account."""
from __future__ import annotations

from datetime import datetime

from ..core import execution as ex
from ..core.instruments import InstrumentSpec
from .base import (AccountInfo, BrokerAdapter, BrokerPosition, NotSupported, OrderRejected, OrderRequest,
                   OrderResult, Quote)


class PaperBroker(BrokerAdapter):
    key = "paper"
    mode = "paper"

    def __init__(self, cost_multiplier: float = 1.0):
        self.cost_multiplier = cost_multiplier
        self.quotes: dict[str, Quote] = {}
        self._orders: dict[str, OrderResult] = {}

    def set_quote(self, q: Quote) -> None:
        self.quotes[q.symbol] = q

    def health(self) -> dict:
        return {"ok": True, "simulated": True}

    def account_info(self) -> AccountInfo:
        raise NotSupported("paper account state lives in the platform ledger")

    def positions(self) -> list[BrokerPosition]:
        raise NotSupported("paper positions live in the platform ledger")

    def quote(self, symbol: str) -> Quote:
        if symbol not in self.quotes:
            raise OrderRejected(f"no market data for {symbol}")
        return self.quotes[symbol]

    def symbol_spec(self, symbol: str) -> dict:
        raise NotSupported("paper broker uses platform specifications")

    def fill(self, spec: InstrumentSpec, req: OrderRequest, q: Quote) -> OrderResult:
        """Market order: buys lift the ask, sells hit the bid, plus modelled slippage."""
        if req.client_order_id in self._orders:
            dup = self._orders[req.client_order_id]
            return OrderResult(dup.client_order_id, dup.broker_order_id, dup.status, dup.fill_price, dup.volume,
                               duplicate=True)
        price = ex.entry_fill(spec, req.side, q.mid, q.spread, self.cost_multiplier)
        res = OrderResult(req.client_order_id, f"paper-{len(self._orders) + 1}", "filled", price, req.volume)
        self._orders[req.client_order_id] = res
        return res

    def place_order(self, req: OrderRequest) -> OrderResult:
        raise NotSupported("use fill(spec, req, quote)")

    def find_order(self, client_order_id: str) -> OrderResult | None:
        return self._orders.get(client_order_id)

    def close_position(self, position_id, client_order_id, volume=None) -> OrderResult:
        raise NotSupported("paper exits are priced by the trading service")

    def now(self) -> datetime | None:
        return max((q.ts for q in self.quotes.values()), default=None)
