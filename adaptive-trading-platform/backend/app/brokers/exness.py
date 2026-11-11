"""Exness connectivity.

What was verified (Exness Help Center, "Exness API", read 2026-11-11):
  * Exness trading accounts are available on MetaTrader 5, which supports
    automated trading -> route (1) below uses our MT5 bridge unchanged.
  * Exness also documents a native "Exness API" (REST for orders/account,
    WebSocket for streaming) for fully verified clients, with an API key and
    secret generated in the Personal Area. The public article states that
    "Standard MetaTrader accounts cannot connect to this API" and does not
    publish endpoint URLs or the signing scheme.

Consequences:
  (1) ``ExnessMT5Adapter`` = the MT5 adapter with broker metadata. Tested only
      as far as the MT5 adapter is (simulated terminal), never against Exness.
  (2) ``ExnessNativeAdapter`` is intentionally NOT implemented: the endpoint
      and authentication specification is only available inside an Exness
      Personal Area, and inventing it would violate the project rules.

Regulatory: Exness appears on the Reserve Bank of India "Alert List" of
entities not authorised to deal in forex / operate forex ETPs (list as updated
19 Nov 2025). The compliance gate therefore hard-blocks every Exness route for
users whose declared jurisdiction is India."""
from __future__ import annotations

from .base import BrokerAdapter, NotSupported
from .mt5 import MT5Adapter


class ExnessMT5Adapter(MT5Adapter):
    key = "exness_mt5"


class ExnessNativeAdapter(BrokerAdapter):
    key = "exness_api"
    _MSG = ("The native Exness API is not implemented: its endpoint and signing specification is only "
            "published inside the Exness Personal Area. Use the MT5 route, or supply the official spec.")

    def _no(self, *a, **k):
        raise NotSupported(self._MSG)

    health = account_info = positions = quote = symbol_spec = place_order = find_order = close_position = _no
