"""Technical indicators. Every function is causal: the value at row i uses
rows <= i only (verified by tests/test_lookahead.py)."""
from __future__ import annotations

import numpy as np
import pandas as pd


def ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False, min_periods=n).mean()


def sma(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(n).mean()


def _wilder(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(alpha=1 / n, adjust=False, min_periods=n).mean()


def true_range(df: pd.DataFrame) -> pd.Series:
    pc = df["close"].shift(1)
    return pd.concat([df["high"] - df["low"], (df["high"] - pc).abs(), (df["low"] - pc).abs()],
                     axis=1).max(axis=1)


def atr(df: pd.DataFrame, n: int = 14) -> pd.Series:
    return _wilder(true_range(df), n)


def rsi(s: pd.Series, n: int = 14) -> pd.Series:
    d = s.diff()
    up, dn = _wilder(d.clip(lower=0), n), _wilder((-d).clip(lower=0), n)
    out = 100 - 100 / (1 + up / dn.replace(0, np.nan))
    return out.where(dn != 0, 100.0).where(up.notna())


def adx(df: pd.DataFrame, n: int = 14) -> pd.DataFrame:
    up, dn = df["high"].diff(), -df["low"].diff()
    plus = pd.Series(np.where((up > dn) & (up > 0), up, 0.0), index=df.index)
    minus = pd.Series(np.where((dn > up) & (dn > 0), dn, 0.0), index=df.index)
    a = atr(df, n).replace(0, np.nan)
    pdi, mdi = 100 * _wilder(plus, n) / a, 100 * _wilder(minus, n) / a
    dx = 100 * (pdi - mdi).abs() / (pdi + mdi).replace(0, np.nan)
    return pd.DataFrame({"adx": _wilder(dx, n), "plus_di": pdi, "minus_di": mdi})


def macd(s: pd.Series, fast=12, slow=26, signal=9) -> pd.DataFrame:
    line = ema(s, fast) - ema(s, slow)
    sig = line.ewm(span=signal, adjust=False, min_periods=signal).mean()
    return pd.DataFrame({"macd": line, "macd_signal": sig, "macd_hist": line - sig})


def stochastic(df: pd.DataFrame, k=14, d=3, smooth=3) -> pd.DataFrame:
    lo, hi = df["low"].rolling(k).min(), df["high"].rolling(k).max()
    raw = 100 * (df["close"] - lo) / (hi - lo).replace(0, np.nan)
    kline = raw.rolling(smooth).mean()
    return pd.DataFrame({"stoch_k": kline, "stoch_d": kline.rolling(d).mean()})


def roc(s: pd.Series, n: int = 10) -> pd.Series:
    return 100 * (s / s.shift(n) - 1)


def bollinger(s: pd.Series, n=20, k=2.0) -> pd.DataFrame:
    mid, sd = s.rolling(n).mean(), s.rolling(n).std(ddof=0)
    return pd.DataFrame({"bb_mid": mid, "bb_upper": mid + k * sd, "bb_lower": mid - k * sd,
                         "bb_width": (2 * k * sd) / mid})


def historical_volatility(s: pd.Series, n=20, periods_per_year=252 * 24) -> pd.Series:
    return np.log(s / s.shift(1)).rolling(n).std(ddof=1) * np.sqrt(periods_per_year)


def atr_expansion(df: pd.DataFrame, n=14, base=50) -> pd.Series:
    """Current ATR relative to its own longer-run average (>1 = expanding)."""
    a = atr(df, n)
    return a / a.rolling(base).mean()


def relative_volume(v: pd.Series, n=20) -> pd.Series:
    return v / v.rolling(n).mean().shift(1).replace(0, np.nan)


def rolling_percentile(s: pd.Series, n: int) -> pd.Series:
    """Percentile rank (0..1) of the current value inside its trailing window."""
    return s.rolling(n).rank(pct=True)
