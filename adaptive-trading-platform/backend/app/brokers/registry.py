from __future__ import annotations

from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Broker, BrokerConnection
from ..security import decrypt_secret
from .base import BrokerAdapter, BrokerError
from .binance import BinanceFuturesAdapter, BinanceSpotAdapter
from .exness import ExnessMT5Adapter, ExnessNativeAdapter
from .mt5 import MT5Adapter

CATALOGUE = [
    {"key": "paper", "name": "Paper trading (simulated)", "adapter": "paper",
     "asset_classes": ["forex_cfd", "metal_cfd", "crypto_cfd", "crypto_spot", "crypto_perp"],
     "integration_status": "tested", "notes": "Built-in simulator. No real account."},
    {"key": "mt5", "name": "MetaTrader 5 (via Windows bridge)", "adapter": "mt5",
     "asset_classes": ["forex_cfd", "metal_cfd", "crypto_cfd"], "integration_status": "simulated_only",
     "notes": "Adapter and bridge are contract-tested against a simulated terminal. Not yet connected to a real "
              "MT5 terminal. Requires a Windows machine running MT5 and the bridge."},
    {"key": "exness_mt5", "name": "Exness (MT5 account via bridge)", "adapter": "exness_mt5",
     "asset_classes": ["forex_cfd", "metal_cfd", "crypto_cfd"], "integration_status": "untested",
     "notes": "Uses the MT5 route. Never tested against Exness. Exness is on the RBI Alert List: blocked for "
              "users resident in India."},
    {"key": "exness_api", "name": "Exness native API", "adapter": "exness_api",
     "asset_classes": ["forex_cfd", "metal_cfd", "crypto_cfd"], "integration_status": "not_implemented",
     "notes": "Exness documents a REST/WebSocket API for verified clients, but its endpoint specification is "
              "only available in the Personal Area. Not implemented."},
    {"key": "binance_spot", "name": "Binance Spot", "adapter": "binance_spot", "asset_classes": ["crypto_spot"],
     "integration_status": "untested",
     "notes": "Implemented from the public REST documentation; signed endpoints not exercised against Binance. "
              "Keys with withdrawal permission are refused."},
    {"key": "binance_usdm", "name": "Binance USD-M Futures", "adapter": "binance_usdm",
     "asset_classes": ["crypto_perp"], "integration_status": "untested",
     "notes": "Derivatives are a separate product and adapter. Partial implementation, untested."},
]


def seed_brokers(db: Session) -> None:
    have = {b.key: b for b in db.query(Broker)}
    for c in CATALOGUE:
        if c["key"] in have:
            b = have[c["key"]]
            b.name, b.notes, b.asset_classes = c["name"], c["notes"], c["asset_classes"]
        else:
            db.add(Broker(**c))


def build_adapter(conn: BrokerConnection, transport=None) -> BrokerAdapter:
    """Decrypts credentials in memory only for the lifetime of the adapter."""
    creds = decrypt_secret(conn.credentials_enc) if conn.credentials_enc else {}
    cfg, s = conn.config or {}, get_settings()
    kind = conn.broker.adapter
    if kind in ("mt5", "exness_mt5"):
        cls = ExnessMT5Adapter if kind == "exness_mt5" else MT5Adapter
        return cls(cfg.get("bridge_url") or s.mt5_bridge_url or "", creds.get("bridge_secret") or s.mt5_bridge_secret or "",
                   cfg.get("symbol_map"), transport=transport)
    if kind == "binance_spot":
        return BinanceSpotAdapter(creds.get("api_key", ""), creds.get("api_secret", ""), cfg.get("base_url"), transport)
    if kind == "binance_usdm":
        return BinanceFuturesAdapter(creds.get("api_key", ""), creds.get("api_secret", ""), cfg.get("base_url"), transport)
    if kind == "exness_api":
        return ExnessNativeAdapter()
    raise BrokerError(f"no live adapter for broker type '{kind}'")
