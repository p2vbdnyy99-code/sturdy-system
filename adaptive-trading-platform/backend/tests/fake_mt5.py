"""A SIMULATED stand-in for the MetaTrader5 Python module, used to contract-test
the bridge and adapter on machines without a terminal. It is not MetaTrader and
proves nothing about a real broker connection."""
from types import SimpleNamespace as NS

import numpy as np


class FakeMT5:
    TRADE_RETCODE_DONE, TRADE_RETCODE_PLACED = 10009, 10008
    TRADE_ACTION_DEAL, TRADE_ACTION_PENDING, TRADE_ACTION_SLTP, TRADE_ACTION_MODIFY, TRADE_ACTION_REMOVE = 1, 5, 6, 7, 8
    ORDER_TYPE_BUY, ORDER_TYPE_SELL, ORDER_TYPE_BUY_LIMIT, ORDER_TYPE_SELL_LIMIT = 0, 1, 2, 3
    ORDER_TYPE_BUY_STOP, ORDER_TYPE_SELL_STOP = 4, 5
    ORDER_TIME_GTC, ORDER_FILLING_FOK, ORDER_FILLING_IOC, ORDER_FILLING_RETURN = 0, 0, 1, 2
    POSITION_TYPE_BUY, POSITION_TYPE_SELL = 0, 1
    ACCOUNT_TRADE_MODE_DEMO, ACCOUNT_TRADE_MODE_CONTEST, ACCOUNT_TRADE_MODE_REAL = 0, 1, 2
    TIMEFRAME_M1, TIMEFRAME_M5, TIMEFRAME_M15, TIMEFRAME_M30, TIMEFRAME_H1, TIMEFRAME_H4 = 1, 5, 15, 30, 16385, 16388

    def __init__(self, now=1_709_715_600):
        self.now = now
        self.available, self.connected, self.trade_mode, self.balance = True, True, 0, 10_000.0
        self.symbols = {"EURUSDm": NS(visible=True, trade_contract_size=100_000.0, point=0.00001, trade_tick_size=0.00001,
                                      digits=5, volume_min=0.01, volume_step=0.01, volume_max=200.0, spread=9,
                                      trade_stops_level=0, trade_mode=4, swap_long=-7.1, swap_short=1.2, swap_mode=1,
                                      filling_mode=1, currency_base="EUR", currency_profit="USD")}
        self.ticks = {"EURUSDm": NS(bid=1.10000, ask=1.10009, time=now)}
        self._pos, self._ticket, self.sent, self.next_retcode = [], 1000, [], None
        self._err = (1, "Success")

    def initialize(self, **kw):
        if not self.available:
            self._err = (-10003, "IPC initialize failed")
        return self.available

    def last_error(self):
        return self._err

    def terminal_info(self):
        return NS(connected=self.connected, trade_allowed=True, ping_last=42_000) if self.available else None

    def account_info(self):
        return NS(login=12345678, server="Fake-Demo", currency="USD", balance=self.balance, equity=self.balance,
                  margin=0.0, margin_free=self.balance, leverage=200, trade_mode=self.trade_mode, trade_allowed=True,
                  trade_expert=True)

    def symbol_info(self, s):
        return self.symbols.get(s)

    def symbol_select(self, s, on):
        return s in self.symbols

    def symbol_info_tick(self, s):
        return self.ticks.get(s)

    def positions_get(self, ticket=None, symbol=None):
        return tuple(p for p in self._pos if (ticket is None or p.ticket == ticket) and (symbol is None or p.symbol == symbol))

    def orders_get(self, ticket=None):
        return ()

    def history_orders_get(self, a, b):
        return ()

    def history_deals_get(self, a, b):
        return ()

    def copy_rates_from_pos(self, symbol, tf, start, count):
        n = min(count, 50)
        dt = np.dtype([("time", "i8"), ("open", "f8"), ("high", "f8"), ("low", "f8"), ("close", "f8"),
                       ("tick_volume", "i8"), ("spread", "i4"), ("real_volume", "i8")])
        out = np.zeros(n, dtype=dt)
        out["time"] = self.now - 300 * np.arange(n, 0, -1)
        out["open"], out["high"], out["low"], out["close"] = 1.1, 1.1005, 1.0995, 1.1002
        out["tick_volume"], out["spread"] = 120, 9
        return out

    def order_send(self, req):
        self.sent.append(dict(req))
        if self.next_retcode:
            code, self.next_retcode = self.next_retcode, None
            return NS(retcode=code, comment="No money", order=0, deal=0, price=0.0, volume=0.0)
        self._ticket += 1
        if req["action"] == self.TRADE_ACTION_DEAL and "position" in req:
            self._pos = [p for p in self._pos if p.ticket != req["position"]]
        elif req["action"] == self.TRADE_ACTION_DEAL:
            self._pos.append(NS(ticket=self._ticket, symbol=req["symbol"], type=req["type"], volume=req["volume"],
                                price_open=req["price"], sl=req.get("sl", 0.0), tp=req.get("tp", 0.0), profit=0.0,
                                time=self.now, comment=req["comment"], magic=req["magic"]))
        elif req["action"] == self.TRADE_ACTION_SLTP:
            for p in self._pos:
                if p.ticket == req["position"]:
                    p.sl, p.tp = req["sl"], req["tp"]
        return NS(retcode=self.TRADE_RETCODE_DONE, comment="Request executed", order=self._ticket, deal=self._ticket,
                  price=req.get("price", 0.0), volume=req.get("volume", 0.0))
