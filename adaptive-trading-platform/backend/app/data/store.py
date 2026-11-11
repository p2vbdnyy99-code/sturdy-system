"""Candle storage and CSV ingestion."""
from __future__ import annotations

import io
from datetime import datetime

import pandas as pd
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..core.instruments import TIMEFRAMES
from ..core.mtf import resample
from ..models import Candle

COLS = ["open", "high", "low", "close", "volume"]


class DataError(ValueError):
    pass


def validate_frame(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        raise DataError("no rows")
    if df.index.tz is None:
        raise DataError("index must be timezone-aware (UTC)")
    df = df[~df.index.duplicated(keep="last")].sort_index()
    if df[["open", "high", "low", "close"]].isna().any().any():
        raise DataError("OHLC contains missing values")
    if (df[["open", "high", "low", "close"]] <= 0).any().any():
        raise DataError("OHLC contains non-positive prices")
    bad = (df["high"] < df[["open", "close", "low"]].max(axis=1)) | (df["low"] > df[["open", "close"]].min(axis=1))
    if bad.any():
        raise DataError(f"{int(bad.sum())} candles violate high/low bounds (first at {df.index[bad][0]})")
    return df


def parse_csv(content: bytes | str, tz: str = "UTC", spread_points_tick: float | None = None) -> pd.DataFrame:
    """Accepts generic OHLCV CSV (time/date[,time],open,high,low,close[,volume][,spread]) and
    MetaTrader 5 history exports (<DATE> <TIME> <OPEN> ... <TICKVOL> <VOL> <SPREAD>)."""
    text = content.decode("utf-8-sig") if isinstance(content, bytes) else content
    first = text.splitlines()[0] if text.strip() else ""
    sep = "\t" if "\t" in first else (";" if first.count(";") > first.count(",") else ",")
    raw = pd.read_csv(io.StringIO(text), sep=sep)
    raw.columns = [str(c).strip().strip("<>").lower() for c in raw.columns]
    ren = {"tickvol": "volume", "tick_volume": "volume", "vol": "real_volume", "timestamp": "time",
           "datetime": "time", "open_time": "time"}
    raw = raw.rename(columns={k: v for k, v in ren.items() if k in raw.columns and v not in raw.columns})
    if "date" in raw.columns and "time" in raw.columns:
        t = pd.to_datetime(raw["date"].astype(str) + " " + raw["time"].astype(str), format="mixed")
    elif "time" in raw.columns or "date" in raw.columns:
        col = raw["time"] if "time" in raw.columns else raw["date"]
        if pd.api.types.is_numeric_dtype(col):
            t = pd.to_datetime(col, unit="ms" if col.iloc[0] > 1e11 else "s", utc=True)
        else:
            t = pd.to_datetime(col, format="mixed")
    else:
        raise DataError("CSV needs a time/date column")
    t = pd.DatetimeIndex(t)
    t = t.tz_localize(tz).tz_convert("UTC") if t.tz is None else t.tz_convert("UTC")
    missing = [c for c in ["open", "high", "low", "close"] if c not in raw.columns]
    if missing:
        raise DataError(f"CSV is missing columns: {missing}")
    df = pd.DataFrame({c: pd.to_numeric(raw[c], errors="coerce").to_numpy() for c in ["open", "high", "low", "close"]},
                      index=t)
    df["volume"] = pd.to_numeric(raw["volume"], errors="coerce").fillna(0).to_numpy() if "volume" in raw.columns else 0.0
    if "spread" in raw.columns:
        sp = pd.to_numeric(raw["spread"], errors="coerce").to_numpy()
        df["spread"] = sp * spread_points_tick if spread_points_tick else sp
    df.index.name = "ts"
    return validate_frame(df)


def detect_timeframe(df: pd.DataFrame) -> str:
    minutes = int(pd.Series(df.index).diff().dt.total_seconds().median() // 60)
    for tf, m in TIMEFRAMES.items():
        if m == minutes:
            return tf
    raise DataError(f"unsupported candle interval of {minutes} minutes")


def upsert(db: Session, symbol: str, timeframe: str, source: str, df: pd.DataFrame) -> int:
    df = validate_frame(df)
    lo, hi = df.index[0].to_pydatetime(), df.index[-1].to_pydatetime()
    db.execute(delete(Candle).where(Candle.symbol == symbol, Candle.timeframe == timeframe,
                                    Candle.source == source, Candle.ts >= lo, Candle.ts <= hi))
    has_spread = "spread" in df.columns
    rows = [{"symbol": symbol, "timeframe": timeframe, "source": source, "ts": ts.to_pydatetime(),
             "open": float(r.open), "high": float(r.high), "low": float(r.low), "close": float(r.close),
             "volume": float(r.volume), "spread": (float(r.spread) if has_spread and pd.notna(r.spread) else None)}
            for ts, r in zip(df.index, df.itertuples(index=False))]
    for i in range(0, len(rows), 5000):
        db.execute(Candle.__table__.insert(), rows[i:i + 5000])
    return len(rows)


def _read(db, symbol, timeframe, source, start, end, limit) -> pd.DataFrame:
    q = select(Candle.ts, Candle.open, Candle.high, Candle.low, Candle.close, Candle.volume, Candle.spread).where(
        Candle.symbol == symbol, Candle.timeframe == timeframe, Candle.source == source)
    if start:
        q = q.where(Candle.ts >= start)
    if end:
        q = q.where(Candle.ts <= end)
    if limit:
        rows = db.execute(q.order_by(Candle.ts.desc()).limit(limit)).all()[::-1]
    else:
        rows = db.execute(q.order_by(Candle.ts)).all()
    if not rows:
        return pd.DataFrame(columns=COLS, index=pd.DatetimeIndex([], tz="UTC"))
    df = pd.DataFrame(rows, columns=["ts", *COLS, "spread"])
    df.index = pd.DatetimeIndex(pd.to_datetime(df.pop("ts"), utc=True)).as_unit("ns")
    if df["spread"].isna().all():
        df = df.drop(columns="spread")
    return df.astype({c: float for c in COLS})


def load(db: Session, symbol: str, timeframe: str, source: str, start: datetime | None = None,
         end: datetime | None = None, limit: int | None = None) -> pd.DataFrame:
    """Load candles; if the timeframe is not stored it is built from the finest
    stored lower timeframe of the SAME source (sources are never mixed)."""
    df = _read(db, symbol, timeframe, source, start, end, limit)
    if len(df):
        return df
    want = TIMEFRAMES[timeframe]
    for tf, m in sorted(TIMEFRAMES.items(), key=lambda kv: -kv[1]):
        if m < want and want % m == 0:
            lim = limit * (want // m) if limit else None
            base = _read(db, symbol, tf, source, start, end, lim)
            if len(base):
                out = resample(base, timeframe)
                return out.iloc[-limit:] if limit else out
    return df


def datasets(db: Session) -> list[dict]:
    rows = db.execute(select(Candle.symbol, Candle.timeframe, Candle.source, func.count(), func.min(Candle.ts),
                             func.max(Candle.ts)).group_by(Candle.symbol, Candle.timeframe, Candle.source)).all()
    return [{"symbol": s, "timeframe": tf, "source": src, "candles": n, "start": a.isoformat(), "end": b.isoformat(),
             "synthetic": src.startswith("synthetic")} for s, tf, src, n, a, b in rows]
