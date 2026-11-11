"""Instrument contract specifications.

Every asset class has its own cost, margin and shorting rules. The default
numbers below are *typical retail values used for research only*; they are
flagged ``verified=False`` and the live-execution gate refuses to trade a
symbol until its spec has been overwritten from the broker's own symbol
information (see ``app/core/live_gate.py``).
"""
from __future__ import annotations

from dataclasses import dataclass, replace
from enum import Enum


class AssetClass(str, Enum):
    FOREX_CFD = "forex_cfd"
    METAL_CFD = "metal_cfd"
    CRYPTO_CFD = "crypto_cfd"
    CRYPTO_SPOT = "crypto_spot"
    CRYPTO_PERP = "crypto_perp"


class SpecError(ValueError):
    """Raised when a contract specification is unusable."""


@dataclass(frozen=True)
class InstrumentSpec:
    symbol: str
    asset_class: AssetClass
    base: str
    quote: str
    contract_size: float          # units of base per 1.0 lot (1.0 for exchange-traded crypto)
    tick_size: float              # minimum price increment
    pip_size: float               # display convention only
    min_volume: float             # minimum order size in lots / base units
    volume_step: float
    max_volume: float
    typical_spread: float         # in price units (ask - bid)
    commission_per_lot_side: float = 0.0   # USD per lot per side (CFD style)
    commission_rate: float = 0.0           # fraction of notional per side (exchange style)
    slippage_ticks: float = 1.0            # adverse ticks per market fill
    swap_long: float = 0.0        # USD per lot per rollover night (negative = cost)
    swap_short: float = 0.0
    funding_rate_8h: float = 0.0  # perp funding per 8h, paid by longs when positive
    margin_rate: float = 1.0      # 1/leverage; 1.0 = fully funded
    allow_short: bool = True
    min_notional: float = 0.0     # in quote currency
    correlation_group: str = ""
    trades_weekend: bool = False
    volume_reliable: bool = False  # CFD tick volume is not real traded volume
    verified: bool = False         # True only after sync from broker symbol info
    display_name: str = ""

    def validate(self) -> None:
        problems = []
        if self.contract_size <= 0:
            problems.append("contract_size<=0")
        if self.tick_size <= 0:
            problems.append("tick_size<=0")
        if self.min_volume <= 0 or self.volume_step <= 0:
            problems.append("volume limits<=0")
        if self.max_volume < self.min_volume:
            problems.append("max_volume<min_volume")
        if not (0 < self.margin_rate <= 1):
            problems.append("margin_rate outside (0,1]")
        if self.typical_spread < 0:
            problems.append("negative spread")
        if problems:
            raise SpecError(f"{self.symbol}: invalid specification ({', '.join(problems)})")

    def quote_to_usd(self, price: float, fx: dict[str, float] | None = None) -> float:
        """Value in USD of one unit of the quote currency."""
        if self.quote in ("USD", "USDT", "USDC"):
            return 1.0
        if self.base == "USD":           # e.g. USDJPY: 1 JPY = 1/price USD
            if price <= 0:
                raise SpecError(f"{self.symbol}: non-positive price")
            return 1.0 / price
        rate = (fx or {}).get(f"USD{self.quote}")
        if not rate:
            raise SpecError(f"{self.symbol}: no USD conversion rate for {self.quote}")
        return 1.0 / rate

    def round_volume(self, volume: float) -> float:
        steps = int(volume / self.volume_step + 1e-9)
        return round(steps * self.volume_step, 10)

    def round_price(self, price: float) -> float:
        return round(round(price / self.tick_size) * self.tick_size, 10)

    def with_overrides(self, **kw) -> "InstrumentSpec":
        spec = replace(self, **kw)
        spec.validate()
        return spec


def _fx(symbol, base, quote, pip, spread_pips, swap_l, swap_s, group):
    return InstrumentSpec(
        symbol=symbol, asset_class=AssetClass.FOREX_CFD, base=base, quote=quote,
        contract_size=100_000, tick_size=pip / 10, pip_size=pip, min_volume=0.01,
        volume_step=0.01, max_volume=100, typical_spread=spread_pips * pip,
        slippage_ticks=2, swap_long=swap_l, swap_short=swap_s, margin_rate=0.01,
        correlation_group=group, display_name=f"{base}/{quote}",
    )


DEFAULT_SPECS: dict[str, InstrumentSpec] = {s.symbol: s for s in [
    InstrumentSpec(
        symbol="XAUUSD", asset_class=AssetClass.METAL_CFD, base="XAU", quote="USD",
        contract_size=100, tick_size=0.01, pip_size=0.1, min_volume=0.01, volume_step=0.01,
        max_volume=50, typical_spread=0.25, slippage_ticks=5, swap_long=-25.0, swap_short=8.0,
        margin_rate=0.01, correlation_group="GOLD", display_name="Gold / US Dollar",
    ),
    InstrumentSpec(
        symbol="BTCUSD", asset_class=AssetClass.CRYPTO_CFD, base="BTC", quote="USD",
        contract_size=1, tick_size=0.01, pip_size=1.0, min_volume=0.01, volume_step=0.01,
        max_volume=20, typical_spread=25.0, slippage_ticks=500, swap_long=-15.0, swap_short=-5.0,
        margin_rate=0.05, correlation_group="BTC", trades_weekend=True,
        display_name="Bitcoin CFD",
    ),
    InstrumentSpec(
        symbol="BTCUSDT", asset_class=AssetClass.CRYPTO_SPOT, base="BTC", quote="USDT",
        contract_size=1, tick_size=0.01, pip_size=1.0, min_volume=0.00001, volume_step=0.00001,
        max_volume=100, typical_spread=0.5, commission_rate=0.001, slippage_ticks=200,
        margin_rate=1.0, allow_short=False, min_notional=5.0, correlation_group="BTC",
        trades_weekend=True, volume_reliable=True, display_name="Bitcoin spot (USDT)",
    ),
    InstrumentSpec(
        symbol="BTCUSDT.P", asset_class=AssetClass.CRYPTO_PERP, base="BTC", quote="USDT",
        contract_size=1, tick_size=0.1, pip_size=1.0, min_volume=0.001, volume_step=0.001,
        max_volume=100, typical_spread=0.5, commission_rate=0.0005, slippage_ticks=20,
        funding_rate_8h=0.0001, margin_rate=0.1, min_notional=5.0, correlation_group="BTC",
        trades_weekend=True, volume_reliable=True, display_name="Bitcoin USDT perpetual",
    ),
    _fx("EURUSD", "EUR", "USD", 0.0001, 1.0, -7.0, 2.0, "USD_MAJORS"),
    _fx("GBPUSD", "GBP", "USD", 0.0001, 1.3, -5.0, -1.0, "USD_MAJORS"),
    _fx("AUDUSD", "AUD", "USD", 0.0001, 1.2, -3.0, -0.5, "USD_MAJORS"),
    _fx("USDJPY", "USD", "JPY", 0.01, 1.2, 9.0, -22.0, "JPY"),
]}

for _s in DEFAULT_SPECS.values():
    _s.validate()

TIMEFRAMES: dict[str, int] = {"M1": 1, "M5": 5, "M15": 15, "M30": 30, "H1": 60, "H4": 240}


def get_spec(symbol: str, overrides: dict[str, InstrumentSpec] | None = None) -> InstrumentSpec:
    if overrides and symbol in overrides:
        return overrides[symbol]
    try:
        return DEFAULT_SPECS[symbol]
    except KeyError as e:
        raise SpecError(f"unknown instrument {symbol!r}") from e
