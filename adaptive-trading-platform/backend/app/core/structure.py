"""Market structure and liquidity primitives. All outputs are causal: a swing
point at bar i is only published at bar i+k, once k later bars confirm it."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .sessions import SessionDef


def swings(df: pd.DataFrame, k: int = 3) -> pd.DataFrame:
    w = 2 * k + 1
    is_sh = df["high"] == df["high"].rolling(w, center=True).max()
    is_sl = df["low"] == df["low"].rolling(w, center=True).min()
    sh_conf = is_sh.shift(k, fill_value=False).astype(bool)
    sl_conf = is_sl.shift(k, fill_value=False).astype(bool)
    sh_val = df["high"].shift(k).where(sh_conf)
    sl_val = df["low"].shift(k).where(sl_conf)
    out = pd.DataFrame({
        "swing_high_confirmed": sh_conf, "swing_low_confirmed": sl_conf,
        "last_swing_high": sh_val.ffill(), "last_swing_low": sl_val.ffill(),
    })
    prev_sh = sh_val.dropna().shift(1).reindex(df.index).where(sh_conf).ffill()
    prev_sl = sl_val.dropna().shift(1).reindex(df.index).where(sl_conf).ffill()
    out["prev_swing_high"], out["prev_swing_low"] = prev_sh, prev_sl
    out["higher_high"] = sh_conf & (sh_val > prev_sh)
    out["lower_high"] = sh_conf & (sh_val < prev_sh)
    out["higher_low"] = sl_conf & (sl_val > prev_sl)
    out["lower_low"] = sl_conf & (sl_val < prev_sl)
    return out


def structure_breaks(df: pd.DataFrame, k: int = 3) -> pd.DataFrame:
    """Break of structure (continuation) and change of character (reversal)."""
    sw = swings(df, k)
    c = df["close"]
    up = (c > sw["last_swing_high"]) & (c.shift(1) <= sw["last_swing_high"].shift(1))
    dn = (c < sw["last_swing_low"]) & (c.shift(1) >= sw["last_swing_low"].shift(1))
    state = pd.Series(np.where(up, 1.0, np.where(dn, -1.0, np.nan)), index=df.index).ffill()
    prior = state.shift(1).fillna(0)
    sw["bos_up"], sw["bos_down"] = up & (prior >= 0), dn & (prior <= 0)
    sw["choch_up"], sw["choch_down"] = up & (prior < 0), dn & (prior > 0)
    sw["structure_trend"] = state.fillna(0)
    return sw


def equal_levels(df: pd.DataFrame, atr_s: pd.Series, k: int = 3, tol_atr: float = 0.1) -> pd.DataFrame:
    """Equal highs / lows: two consecutive confirmed swings within tol*ATR.
    They mark resting-liquidity pools above/below price."""
    sw = swings(df, k)
    tol = atr_s * tol_atr
    eqh = sw["swing_high_confirmed"] & ((sw["last_swing_high"] - sw["prev_swing_high"]).abs() <= tol)
    eql = sw["swing_low_confirmed"] & ((sw["last_swing_low"] - sw["prev_swing_low"]).abs() <= tol)
    return pd.DataFrame({
        "equal_highs": eqh, "equal_lows": eql,
        "eqh_level": sw[["last_swing_high", "prev_swing_high"]].max(axis=1).where(eqh).ffill(),
        "eql_level": sw[["last_swing_low", "prev_swing_low"]].min(axis=1).where(eql).ffill(),
    })


def sweep(df: pd.DataFrame, level_high: pd.Series, level_low: pd.Series) -> pd.DataFrame:
    """Stop-run: price trades through a level and closes back inside it."""
    return pd.DataFrame({
        "sweep_high": (df["high"] > level_high) & (df["close"] < level_high),
        "sweep_low": (df["low"] < level_low) & (df["close"] > level_low),
    })


def previous_day_levels(df: pd.DataFrame, tz: str = "UTC") -> pd.DataFrame:
    loc = df.index.tz_convert(tz)
    day = pd.Series(loc.year * 10000 + loc.month * 100 + loc.day, index=df.index)
    daily = df.groupby(day.to_numpy()).agg(high=("high", "max"), low=("low", "min")).shift(1)
    return pd.DataFrame({"pdh": day.map(daily["high"]).to_numpy(), "pdl": day.map(daily["low"]).to_numpy()},
                        index=df.index)


def session_range(df: pd.DataFrame, session: SessionDef, minutes: int | None = None) -> pd.DataFrame:
    """High/low of today's session (or of its first ``minutes``), published only
    once that window has fully closed. ``range_ready`` marks usable rows."""
    idx = df.index
    in_sess = session.mask(idx)
    mfs = session.minutes_from_start(idx)
    if session.start > session.end:
        mfs = np.where(mfs < 0, mfs + 1440, mfs)
    step = int(pd.Series(idx).diff().dt.total_seconds().median() // 60) if len(idx) > 1 else 1
    span = minutes if minutes is not None else int(
        ((session.end.hour * 60 + session.end.minute) - (session.start.hour * 60 + session.start.minute)) % 1440)
    in_win = in_sess & (mfs >= 0) & (mfs < span)
    day = session.day_key(idx)
    hi = df["high"].where(in_win).groupby(day).cummax()
    lo = df["low"].where(in_win).groupby(day).cummin()
    hi, lo = hi.groupby(day).ffill(), lo.groupby(day).ffill()
    # a bar opening at minute m closes at m+step; the window is complete when m+step >= span
    done_now = in_win & (mfs + step >= span)
    ready_bar = pd.Series(done_now, index=idx).groupby(day).cummax().astype(bool)
    after = ready_bar & ~pd.Series(in_win, index=idx)
    return pd.DataFrame({"range_high": hi.where(after | done_now), "range_low": lo.where(after | done_now),
                         "range_ready": after, "range_closing_bar": done_now})


def previous_session_range(df: pd.DataFrame, session: SessionDef) -> pd.DataFrame:
    """Most recently *completed* instance of ``session`` (may be yesterday's)."""
    r = session_range(df, session)
    hi = r["range_high"].where(r["range_closing_bar"]).shift(1).ffill()
    lo = r["range_low"].where(r["range_closing_bar"]).shift(1).ffill()
    return pd.DataFrame({"range_high": hi, "range_low": lo, "range_ready": hi.notna()})
