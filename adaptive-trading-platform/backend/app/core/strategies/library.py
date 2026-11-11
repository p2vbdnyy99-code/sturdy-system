"""Strategy library. Each strategy deliberately uses a small, non-redundant
set of inputs; nothing here has a proven edge until the selection engine has
validated it on real data (see app/core/validation.py)."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .. import indicators as ind
from .. import structure as st
from .base import Strategy, StrategyContext, first_true_per_day, htf_trend


def _reference_range(df, ctx: StrategyContext, p) -> pd.DataFrame:
    src = p.get("range_source", "opening")
    if src == "opening":
        return st.session_range(df, ctx.session, int(p["range_minutes"]))
    if src == "prev_day":
        lv = st.previous_day_levels(df, ctx.session.tz)
        return pd.DataFrame({"range_high": lv["pdh"], "range_low": lv["pdl"], "range_ready": lv["pdh"].notna()})
    ref = ctx.sessions[src]
    if ref.key == ctx.session.key:
        return st.session_range(df, ctx.session, int(p["range_minutes"]))
    return st.previous_session_range(df, ref)


def _frame(df, side, sl, score, reason):
    return pd.DataFrame({"side": side, "sl": sl, "score": score,
                         "reason": pd.Series(reason, index=df.index)}, index=df.index)


class RangeBreakout(Strategy):
    """Close beyond a completed reference range, with momentum confirmation."""
    key = "range_breakout"
    name = "Range breakout"
    description = ("Trades a close outside a completed reference range (session opening range, an "
                   "earlier session's range or the previous day's range) when range expansion and "
                   "momentum agree.")
    indicators_used = ("ATR", "ROC", "session range", "relative volume (only where volume is real)")
    default_params = {"range_source": "opening", "range_minutes": 60, "buffer_atr": 0.1, "rr": 2.0,
                      "sl_atr": 1.5, "max_range_atr": 6.0, "roc_n": 5, "min_relvol": 0.0}
    param_grid = {"range_minutes": [30, 60, 90], "buffer_atr": [0.0, 0.1, 0.25], "sl_atr": [1.0, 1.5, 2.0]}

    def raw(self, df, ctx, p):
        a = ind.atr(df, 14)
        r = _reference_range(df, ctx, p)
        c = df["close"]
        buf = p["buffer_atr"] * a
        width_ok = (r["range_high"] - r["range_low"]) <= p["max_range_atr"] * a
        mom = ind.roc(c, int(p["roc_n"]))
        vol_ok = True
        if ctx.spec.volume_reliable and p["min_relvol"] > 0 and "volume" in df:
            vol_ok = ind.relative_volume(df["volume"]) >= p["min_relvol"]
        ready = r["range_ready"] & width_ok & vol_ok
        up = ready & (c > r["range_high"] + buf) & (c.shift(1) <= (r["range_high"] + buf).shift(1)) & (mom > 0)
        dn = ready & (c < r["range_low"] - buf) & (c.shift(1) >= (r["range_low"] - buf).shift(1)) & (mom < 0)
        side = pd.Series(np.where(up, 1, np.where(dn, -1, 0)), index=df.index)
        mid = (r["range_high"] + r["range_low"]) / 2
        sl = pd.Series(np.where(side > 0, np.maximum(mid, c - p["sl_atr"] * a),
                                np.minimum(mid, c + p["sl_atr"] * a)), index=df.index)
        score = ((c - mid).abs() / a).clip(upper=5)
        reason = np.where(side > 0, "close above reference range high with positive momentum",
                          np.where(side < 0, "close below reference range low with negative momentum", ""))
        return _frame(df, side, sl, score, reason)


class LiquiditySweep(Strategy):
    """Stop-run through a reference level followed by a close back inside."""
    key = "liquidity_sweep"
    name = "Liquidity sweep reversal"
    description = ("Fades a stop-run: price trades through a reference high/low (range or equal "
                   "highs/lows) and closes back inside with a rejection wick.")
    indicators_used = ("ATR", "session range", "equal highs/lows", "sweep detection")
    default_params = {"range_source": "asia", "range_minutes": 60, "wick_atr": 0.3, "buffer_atr": 0.15,
                      "rr": 2.0, "use_equal_levels": False}
    param_grid = {"wick_atr": [0.2, 0.3, 0.5], "buffer_atr": [0.1, 0.15, 0.3]}

    def raw(self, df, ctx, p):
        a = ind.atr(df, 14)
        r = _reference_range(df, ctx, p)
        hi, lo = r["range_high"], r["range_low"]
        if p.get("use_equal_levels"):
            eq = st.equal_levels(df, a)
            hi, lo = eq["eqh_level"].shift(1), eq["eql_level"].shift(1)
        sw = st.sweep(df, hi, lo)
        ready = r["range_ready"] if not p.get("use_equal_levels") else hi.notna()
        short = ready & sw["sweep_high"] & ((df["high"] - df[["open", "close"]].max(axis=1)) >= p["wick_atr"] * a)
        long = ready & sw["sweep_low"] & ((df[["open", "close"]].min(axis=1) - df["low"]) >= p["wick_atr"] * a)
        side = pd.Series(np.where(long, 1, np.where(short, -1, 0)), index=df.index)
        sl = pd.Series(np.where(side > 0, df["low"] - p["buffer_atr"] * a, df["high"] + p["buffer_atr"] * a),
                       index=df.index)
        score = (np.where(side > 0, lo - df["low"], df["high"] - hi) / a)
        reason = np.where(side > 0, "sweep of range low, close back inside",
                          np.where(side < 0, "sweep of range high, close back inside", ""))
        return _frame(df, side, sl, pd.Series(score, index=df.index).clip(upper=5), reason)


class BreakoutRetest(Strategy):
    """Breakout, then a retest of the broken level that holds."""
    key = "breakout_retest"
    name = "Breakout and retest"
    description = "After a close beyond the reference range, waits for a retest of the level that holds."
    indicators_used = ("ATR", "session range")
    default_params = {"range_source": "asia", "range_minutes": 60, "tol_atr": 0.25, "buffer_atr": 0.3, "rr": 2.0}
    param_grid = {"tol_atr": [0.15, 0.25, 0.4], "buffer_atr": [0.2, 0.3, 0.5]}

    def raw(self, df, ctx, p):
        a = ind.atr(df, 14)
        r = _reference_range(df, ctx, p)
        c, day = df["close"], ctx.session.day_key(df.index)
        sess = pd.Series(ctx.session.mask(df.index), index=df.index)
        broke_up = (r["range_ready"] & sess & (c > r["range_high"])).groupby(day).cummax().shift(1, fill_value=False)
        broke_dn = (r["range_ready"] & sess & (c < r["range_low"])).groupby(day).cummax().shift(1, fill_value=False)
        tol = p["tol_atr"] * a
        long = broke_up & (df["low"] <= r["range_high"] + tol) & (c > r["range_high"]) & (c > df["open"])
        short = broke_dn & (df["high"] >= r["range_low"] - tol) & (c < r["range_low"]) & (c < df["open"])
        long, short = first_true_per_day(long, day), first_true_per_day(short, day)
        side = pd.Series(np.where(long, 1, np.where(short, -1, 0)), index=df.index)
        sl = pd.Series(np.where(side > 0, np.minimum(df["low"], r["range_high"]) - p["buffer_atr"] * a,
                                np.maximum(df["high"], r["range_low"]) + p["buffer_atr"] * a), index=df.index)
        reason = np.where(side > 0, "retest of broken range high held",
                          np.where(side < 0, "retest of broken range low held", ""))
        return _frame(df, side, sl, pd.Series(1.0, index=df.index), reason)


class TrendContinuation(Strategy):
    """Pullback entry in the direction of the higher-timeframe trend."""
    key = "trend_continuation"
    name = "Trend continuation (multi-timeframe)"
    description = ("Higher timeframe EMA50/EMA200 defines direction and ADX requires a trend; the entry "
                   "timeframe waits for a pullback to EMA20 and a resumption close.")
    indicators_used = ("EMA 9/20 (entry TF)", "EMA 50/200 + ADX (higher TF)", "RSI", "ATR")
    default_params = {"htf": "H1", "htf2": "H4", "adx_min": 20, "pullback_bars": 6, "swing_bars": 10,
                      "buffer_atr": 0.2, "rr": 2.0, "cooldown": 12, "max_per_day": 2}
    param_grid = {"adx_min": [15, 20, 25], "pullback_bars": [4, 6, 10], "swing_bars": [6, 10, 16]}
    warmup_bars = 300

    def raw(self, df, ctx, p):
        a = ind.atr(df, 14)
        c = df["close"]
        e9, e20 = ind.ema(c, 9), ind.ema(c, 20)
        h1 = htf_trend(df, p["htf"])
        k = p["htf"].lower()
        trend, adx_ok = h1[f"{k}_trend"], h1[f"{k}_adx"] >= p["adx_min"]
        if p.get("htf2"):
            h2 = htf_trend(df, p["htf2"], 20, 50)
            agree = h2[f"{p['htf2'].lower()}_trend"]
            trend = trend.where(agree * trend >= 0, 0)   # higher TF must not oppose
        n = int(p["pullback_bars"])
        touched_l = (df["low"] <= e20).rolling(n).max().shift(1) > 0
        touched_s = (df["high"] >= e20).rolling(n).max().shift(1) > 0
        r = ind.rsi(c, 14)
        long = (trend > 0) & adx_ok & touched_l & (c > e9) & (c > df["high"].shift(1)) & r.between(45, 72)
        short = (trend < 0) & adx_ok & touched_s & (c < e9) & (c < df["low"].shift(1)) & r.between(28, 55)
        cd = int(p["cooldown"])
        long &= ~(long.shift(1, fill_value=False).rolling(cd, min_periods=1).max() > 0)
        short &= ~(short.shift(1, fill_value=False).rolling(cd, min_periods=1).max() > 0)
        side = pd.Series(np.where(long, 1, np.where(short, -1, 0)), index=df.index)
        sb = int(p["swing_bars"])
        sl = pd.Series(np.where(side > 0, df["low"].rolling(sb).min() - p["buffer_atr"] * a,
                                df["high"].rolling(sb).max() + p["buffer_atr"] * a), index=df.index)
        reason = np.where(side > 0, "HTF uptrend, pullback to EMA20, resumption close",
                          np.where(side < 0, "HTF downtrend, pullback to EMA20, resumption close", ""))
        return _frame(df, side, sl, (h1[f"{k}_adx"] / 20).clip(upper=5), reason)


class VolatilitySqueeze(Strategy):
    """Bollinger-width contraction followed by an expansion breakout."""
    key = "volatility_squeeze"
    name = "Volatility contraction / expansion"
    description = ("Requires a recent Bollinger band-width squeeze (low percentile), then trades the "
                   "first close outside the bands while ATR is expanding.")
    indicators_used = ("Bollinger Bands", "band-width percentile", "ATR expansion")
    default_params = {"bb_n": 20, "squeeze_pct": 0.2, "lookback": 120, "recent": 8, "expansion": 1.0,
                      "sl_atr": 1.5, "rr": 2.0}
    param_grid = {"squeeze_pct": [0.15, 0.2, 0.3], "recent": [5, 8, 12], "sl_atr": [1.0, 1.5, 2.0]}

    def raw(self, df, ctx, p):
        a = ind.atr(df, 14)
        c = df["close"]
        bb = ind.bollinger(c, int(p["bb_n"]))
        pct = ind.rolling_percentile(bb["bb_width"], int(p["lookback"]))
        squeezed = (pct <= p["squeeze_pct"]).rolling(int(p["recent"])).max().shift(1) > 0
        exp = ind.atr_expansion(df) >= p["expansion"]
        long = squeezed & exp & (c > bb["bb_upper"]) & (c.shift(1) <= bb["bb_upper"].shift(1))
        short = squeezed & exp & (c < bb["bb_lower"]) & (c.shift(1) >= bb["bb_lower"].shift(1))
        side = pd.Series(np.where(long, 1, np.where(short, -1, 0)), index=df.index)
        sl = pd.Series(np.where(side > 0, np.maximum(bb["bb_mid"], c - p["sl_atr"] * a),
                                np.minimum(bb["bb_mid"], c + p["sl_atr"] * a)), index=df.index)
        reason = np.where(side != 0, "band-width squeeze released with expanding ATR", "")
        return _frame(df, side, sl, (1 - pct).clip(0, 1) * 5, reason)


class StructureShift(Strategy):
    """Change of character / break of structure on confirmed swing points."""
    key = "structure_shift"
    name = "Market structure shift"
    description = ("Enters on a change of character (first break against the prevailing swing "
                   "structure) or a break of structure, provided the higher timeframe does not oppose.")
    indicators_used = ("confirmed swing highs/lows", "BOS / CHoCH", "EMA 50/200 (higher TF)", "ATR")
    default_params = {"mode": "choch", "swing_k": 3, "htf": "H1", "buffer_atr": 0.2, "rr": 2.0, "max_per_day": 2}
    param_grid = {"swing_k": [2, 3, 5], "buffer_atr": [0.1, 0.2, 0.4]}

    def raw(self, df, ctx, p):
        a = ind.atr(df, 14)
        s = st.structure_breaks(df, int(p["swing_k"]))
        h = htf_trend(df, p["htf"])[f"{p['htf'].lower()}_trend"]
        up, dn = (s["choch_up"], s["choch_down"]) if p["mode"] == "choch" else (s["bos_up"], s["bos_down"])
        long, short = up & (h >= 0), dn & (h <= 0)
        side = pd.Series(np.where(long, 1, np.where(short, -1, 0)), index=df.index)
        sl = pd.Series(np.where(side > 0, s["last_swing_low"] - p["buffer_atr"] * a,
                                s["last_swing_high"] + p["buffer_atr"] * a), index=df.index)
        label = "change of character" if p["mode"] == "choch" else "break of structure"
        reason = np.where(side > 0, f"bullish {label}", np.where(side < 0, f"bearish {label}", ""))
        return _frame(df, side, sl, pd.Series(1.0, index=df.index), reason)


class MomentumBreakout(Strategy):
    """Support/resistance (Donchian) breakout with trend-strength confirmation."""
    key = "momentum_breakout"
    name = "Momentum breakout"
    description = ("Close through the prior N-bar high/low (support/resistance) with rising MACD "
                   "histogram and ADX above a floor.")
    indicators_used = ("N-bar high/low", "MACD histogram", "ADX", "ATR")
    default_params = {"lookback": 48, "adx_min": 20, "sl_atr": 1.5, "rr": 2.0}
    param_grid = {"lookback": [24, 48, 96], "adx_min": [15, 20, 25], "sl_atr": [1.0, 1.5, 2.0]}

    def raw(self, df, ctx, p):
        a = ind.atr(df, 14)
        c = df["close"]
        n = int(p["lookback"])
        res, sup = df["high"].rolling(n).max().shift(1), df["low"].rolling(n).min().shift(1)
        m = ind.macd(c)["macd_hist"]
        strong = ind.adx(df)["adx"] >= p["adx_min"]
        long = strong & (c > res) & (c.shift(1) <= res.shift(1)) & (m > 0) & (m > m.shift(1))
        short = strong & (c < sup) & (c.shift(1) >= sup.shift(1)) & (m < 0) & (m < m.shift(1))
        side = pd.Series(np.where(long, 1, np.where(short, -1, 0)), index=df.index)
        sl = pd.Series(np.where(side > 0, c - p["sl_atr"] * a, c + p["sl_atr"] * a), index=df.index)
        reason = np.where(side > 0, f"close above {n}-bar resistance, MACD rising, ADX strong",
                          np.where(side < 0, f"close below {n}-bar support, MACD falling, ADX strong", ""))
        return _frame(df, side, sl, (ind.adx(df)["adx"] / 20).clip(upper=5), reason)


STRATEGIES: dict[str, Strategy] = {s.key: s for s in [
    RangeBreakout(), LiquiditySweep(), BreakoutRetest(), TrendContinuation(), VolatilitySqueeze(),
    StructureShift(), MomentumBreakout()]}


def get_strategy(key: str) -> Strategy:
    return STRATEGIES[key]
