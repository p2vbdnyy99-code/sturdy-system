"""Multi-timeframe handling without look-ahead.

A higher-timeframe bar that opens at ``t`` is only *known* at ``t + tf``. A
base bar opening at ``b`` makes its decision at its own close ``b + base_tf``.
``align_htf`` therefore joins each base bar to the latest HTF bar whose close
time is <= the base bar's close time."""
from __future__ import annotations

import pandas as pd

from .instruments import TIMEFRAMES

_AGG = {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}


def tf_minutes(tf: str) -> int:
    return TIMEFRAMES[tf]


def infer_minutes(index: pd.DatetimeIndex) -> int:
    return int(pd.Series(index).diff().dt.total_seconds().median() // 60)


def resample(df: pd.DataFrame, tf: str) -> pd.DataFrame:
    agg = {k: v for k, v in _AGG.items() if k in df.columns}
    if "spread" in df.columns:
        agg["spread"] = "mean"
    out = df.resample(f"{tf_minutes(tf)}min", label="left", closed="left").agg(agg)
    return out.dropna(subset=["open"])


def align_htf(base: pd.DataFrame, htf_features: pd.DataFrame, htf: str, base_minutes: int | None = None,
              prefix: str | None = None) -> pd.DataFrame:
    bm = base_minutes or infer_minutes(base.index)
    left = pd.DataFrame({"_t": base.index + pd.Timedelta(minutes=bm)}, index=base.index)
    right = htf_features.copy()
    right["_avail"] = right.index + pd.Timedelta(minutes=tf_minutes(htf))
    left["_t"] = left["_t"].astype("datetime64[ns, UTC]")
    right["_avail"] = right["_avail"].astype("datetime64[ns, UTC]")
    merged = pd.merge_asof(left.reset_index(drop=True), right.sort_values("_avail").reset_index(drop=True),
                           left_on="_t", right_on="_avail", direction="backward")
    merged.index = base.index
    merged = merged.drop(columns=["_t", "_avail"])
    p = prefix if prefix is not None else f"{htf.lower()}_"
    return merged.add_prefix(p)
