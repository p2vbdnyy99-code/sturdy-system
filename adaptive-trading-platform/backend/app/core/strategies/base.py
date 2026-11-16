"""Strategy contract shared by backtesting, paper trading and live trading.

``generate(df, ctx)`` returns one row per candle. Row *i* is the decision made
at the CLOSE of candle *i*; it is executed at the next candle's open (backtest)
or at the next quote (paper/live). Nothing in a row may depend on later rows.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .. import indicators as ind
from ..instruments import InstrumentSpec
from ..mtf import align_htf, infer_minutes, resample, tf_minutes
from ..sessions import SessionDef

SIGNAL_COLUMNS = ["side", "sl", "rr", "score", "reason"]

# Recursive indicators (EMA, Wilder smoothing) depend on where the history starts. After k bars the seed's
# weight is (1 - alpha)^k; these helpers return k such that the weight is below 1e-9, which makes a signal
# computed on a finite window equal to one computed on the full history (defect D3).
SEED_TOLERANCE = 1e-9


def ema_bars(span: int) -> int:
    return int(math.ceil(math.log(SEED_TOLERANCE) / math.log(1 - 2 / (span + 1))))


def wilder_bars(n: int) -> int:
    return int(math.ceil(math.log(SEED_TOLERANCE) / math.log(1 - 1 / n)))


def htf_ratio(htf: str, base_minutes: int) -> int:
    return max(1, tf_minutes(htf) // base_minutes)


@dataclass
class StrategyContext:
    spec: InstrumentSpec
    timeframe: str
    session: SessionDef
    sessions: dict[str, SessionDef]
    params: dict = field(default_factory=dict)


class Strategy:
    key: str = ""
    name: str = ""
    description: str = ""
    indicators_used: tuple[str, ...] = ()
    default_params: dict = {}
    # small, coarse grid: used for selection on TRAINING data and stability testing
    param_grid: dict[str, list] = {}
    warmup_bars: int = 250

    def required_bars(self, params: dict, base_minutes: int) -> int:
        """Bars of the entry timeframe needed before a signal no longer depends on how much history was
        loaded. Families override this; the default covers ATR(14) plus the warm-up."""
        return max(self.warmup_bars, wilder_bars(14)) + 50

    def params(self, ctx: StrategyContext) -> dict:
        return {**self.default_params, **(ctx.params or {})}

    def raw(self, df: pd.DataFrame, ctx: StrategyContext, p: dict) -> pd.DataFrame:
        raise NotImplementedError

    def generate(self, df: pd.DataFrame, ctx: StrategyContext) -> pd.DataFrame:
        p = self.params(ctx)
        out = self.raw(df, ctx, p)
        side = out["side"].fillna(0).astype(int)
        in_sess = ctx.session.mask(df.index)
        close = df["close"]
        a = ind.atr(df, 14)
        dist = (close - out["sl"]).abs()
        ok = in_sess & dist.notna() & (dist > 0) & a.notna()
        # the protective stop must sit on the correct side and not be absurdly wide
        ok &= np.where(side > 0, out["sl"] < close, out["sl"] > close)
        ok &= dist <= p.get("max_stop_atr", 4.0) * a
        if not ctx.spec.allow_short:
            ok &= side >= 0
        side = side.where(ok, 0)
        # at most ``max_per_day`` signals per session-day and direction
        day = ctx.session.day_key(df.index)
        for s in (1, -1):
            hit = (side == s).astype(int)
            n = hit.groupby(day).cumsum()
            side = side.where(~((side == s) & (n > p.get("max_per_day", 1))), 0)
        res = pd.DataFrame(index=df.index)
        res["side"] = side
        res["sl"] = out["sl"].where(side != 0)
        res["rr"] = float(p.get("rr", 2.0))
        res["score"] = out.get("score", pd.Series(np.nan, index=df.index)).where(side != 0)
        res["reason"] = out.get("reason", pd.Series("", index=df.index)).where(side != 0, "")
        # no signal until the indicators no longer depend on where the loaded history starts (D3)
        n0 = self.required_bars(p, infer_minutes(df.index)) if len(df) > 1 else self.warmup_bars
        res.iloc[: min(n0, len(res)), res.columns.get_loc("side")] = 0
        return res


def htf_trend(df: pd.DataFrame, htf: str, fast: int = 50, slow: int = 200) -> pd.DataFrame:
    """Higher-timeframe trend state, aligned causally onto ``df``."""
    base_min = infer_minutes(df.index)
    if tf_minutes(htf) <= base_min:
        h = df
    else:
        h = resample(df, htf)
    f = pd.DataFrame({"ema_fast": ind.ema(h["close"], fast), "ema_slow": ind.ema(h["close"], slow),
                      "adx": ind.adx(h)["adx"], "close": h["close"]}, index=h.index)
    f["trend"] = np.sign(f["ema_fast"] - f["ema_slow"]).where(f["ema_slow"].notna(), 0)
    if h is df:
        return f.add_prefix(f"{htf.lower()}_")
    return align_htf(df, f, htf, base_min)


def first_true_per_day(flag: pd.Series, day: np.ndarray) -> pd.Series:
    f = flag.fillna(False).astype(bool)
    return f & (f.astype(int).groupby(day).cumsum() == 1)
