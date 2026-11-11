"""Synthetic candle generator FOR TESTS AND OFFLINE DEMOS ONLY.

Output is always tagged with source ``synthetic:<name>``. The API and UI label
every result derived from it as SYNTHETIC; it can never satisfy the
live-trading evidence gate and must never be presented as market data."""
from __future__ import annotations

import numpy as np
import pandas as pd

SYNTHETIC_PREFIX = "synthetic"


def is_synthetic(source: str | None) -> bool:
    return bool(source) and source.startswith(SYNTHETIC_PREFIX)


def generate(symbol: str = "EURUSD", start: str = "2024-01-01", days: int = 120, tf_minutes: int = 5,
             price: float = 1.08, annual_vol: float = 0.08, seed: int = 1, weekend: bool = False,
             trend_strength: float = 0.0) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    idx = pd.date_range(start, periods=days * 1440 // tf_minutes, freq=f"{tf_minutes}min", tz="UTC")
    if not weekend:
        ny = idx.tz_convert("America/New_York")
        wd, hm = ny.day_of_week, ny.hour * 60 + ny.minute
        closed = (wd == 5) | ((wd == 4) & (hm >= 1020)) | ((wd == 6) & (hm < 1020))
        idx = idx[~closed]
    n = len(idx)
    per_bar = annual_vol / np.sqrt(365 * 1440 / tf_minutes)
    hour = idx.hour.to_numpy()
    season = 0.6 + 0.9 * np.exp(-((hour - 8) % 24) ** 2 / 18) + 0.9 * np.exp(-((hour - 14) % 24) ** 2 / 18)
    regime = np.repeat(rng.choice([0.7, 1.0, 1.6], size=n // 500 + 1), 500)[:n]
    drift_dir = np.repeat(rng.choice([-1, 0, 1], size=n // 800 + 1), 800)[:n]
    sub = 6
    steps = rng.standard_normal((n, sub)) * (per_bar * season * regime)[:, None] / np.sqrt(sub)
    steps += (trend_strength * per_bar * drift_dir)[:, None] / sub
    path = np.cumsum(steps.reshape(-1)).reshape(n, sub)
    logp = np.log(price) + path
    prev_close = np.concatenate([[np.log(price)], logp[:-1, -1]])
    o = np.exp(prev_close)
    c = np.exp(logp[:, -1])
    h = np.maximum(np.exp(logp.max(axis=1)), np.maximum(o, c))
    l = np.minimum(np.exp(logp.min(axis=1)), np.minimum(o, c))
    v = (rng.lognormal(0, 0.5, n) * season * regime * 100).round(2)
    return pd.DataFrame({"open": o, "high": h, "low": l, "close": c, "volume": v}, index=idx)
