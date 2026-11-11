"""Fill and cost model shared by the backtester and the paper broker, so both
environments price a trade identically. Candles are treated as MID prices:
buys fill at ask (= mid + spread/2), sells at bid (= mid - spread/2)."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from .instruments import AssetClass, InstrumentSpec
from .sessions import rollovers_between


def slippage_price(spec: InstrumentSpec, mult: float = 1.0) -> float:
    return spec.slippage_ticks * spec.tick_size * mult


def commission_usd(spec: InstrumentSpec, volume: float, price: float, q2usd: float, mult: float = 1.0) -> float:
    """Commission for ONE side of a trade."""
    notional = volume * spec.contract_size * price * q2usd
    return mult * (volume * spec.commission_per_lot_side + notional * spec.commission_rate)


def round_trip_cost_per_unit(spec: InstrumentSpec, price: float, q2usd: float, mult: float = 1.0) -> float:
    """Round-trip commission expressed in price units per unit of base."""
    per_lot = spec.commission_per_lot_side / (spec.contract_size * q2usd)
    return 2 * mult * (per_lot + price * spec.commission_rate)


def entry_fill(spec: InstrumentSpec, side: int, mid: float, spread: float, mult: float = 1.0) -> float:
    return mid + side * (spread / 2 + slippage_price(spec, mult))


@dataclass
class TradePlan:
    entry: float
    sl: float
    tp: float
    risk_per_unit: float      # price units lost per base unit if stopped, incl. costs
    reward_per_unit: float    # price units gained per base unit at target, net of costs
    rr_net: float


def plan_trade(spec: InstrumentSpec, side: int, mid: float, spread: float, sl: float, rr: float,
               q2usd: float, mult: float = 1.0, tp: float | None = None) -> TradePlan:
    """Derive the take-profit so that the NET reward/risk equals ``rr`` after
    spread, slippage and commission (or evaluate a fixed ``tp``)."""
    entry = entry_fill(spec, side, mid, spread, mult)
    cost = round_trip_cost_per_unit(spec, entry, q2usd, mult)
    risk = side * (entry - sl) + slippage_price(spec, mult) + cost
    if tp is None:
        tp = entry + side * (rr * risk + cost)
    reward = side * (tp - entry) - cost
    return TradePlan(entry, sl, tp, risk, reward, reward / risk if risk > 0 else float("-inf"))


def exit_on_bar(spec: InstrumentSpec, side: int, sl: float, tp: float, o: float, h: float, l: float,
                spread: float, mult: float = 1.0) -> tuple[float, str] | None:
    """Conservative intrabar exit. If both stop and target are touched inside
    one candle the STOP is assumed to have been hit first. Stops gap: a bar that
    opens beyond the stop fills at the open, not at the stop."""
    half, slip = spread / 2, slippage_price(spec, mult)
    if side > 0:
        if l - half <= sl:
            return min(sl, o - half) - slip, "stop_loss"
        if h - half >= tp:
            return tp, "take_profit"
    else:
        if h + half >= sl:
            return max(sl, o + half) + slip, "stop_loss"
        if l + half <= tp:
            return tp, "take_profit"
    return None


def exit_on_quote(spec: InstrumentSpec, side: int, sl: float | None, tp: float | None, bid: float, ask: float,
                  mult: float = 1.0) -> tuple[float, str] | None:
    """Quote-driven exit used by the paper broker (longs exit on bid, shorts on ask)."""
    px = bid if side > 0 else ask
    slip = slippage_price(spec, mult)
    if sl is not None and side * (px - sl) <= 0:
        return px - side * slip, "stop_loss"
    if tp is not None and side * (px - tp) >= 0:
        return tp, "take_profit"
    return None


def pnl_usd(spec: InstrumentSpec, side: int, volume: float, entry: float, exit_: float, q2usd: float) -> float:
    return side * (exit_ - entry) * volume * spec.contract_size * q2usd


def financing_usd(spec: InstrumentSpec, side: int, volume: float, price: float, q2usd: float,
                  opened: datetime, closed: datetime) -> float:
    """Swap (CFDs) or funding (perpetuals) accrued while the position was open.
    Negative = cost. Spot positions carry no financing."""
    if spec.asset_class == AssetClass.CRYPTO_SPOT:
        return 0.0
    if spec.asset_class == AssetClass.CRYPTO_PERP:
        o, c = opened.astimezone(timezone.utc), closed.astimezone(timezone.utc)
        marks = int(c.timestamp() // 28800) - int(o.timestamp() // 28800)
        return -side * marks * spec.funding_rate_8h * volume * spec.contract_size * price * q2usd
    nights = rollovers_between(opened, closed)
    if spec.trades_weekend:   # crypto CFDs are charged every calendar night
        nights = max(0, (closed.astimezone(timezone.utc).date() - opened.astimezone(timezone.utc).date()).days)
    return nights * volume * (spec.swap_long if side > 0 else spec.swap_short)
