"""Candle storage, dataset registry and ingestion.

Rules enforced here (Phase 2.1, defect D2):
  * A dataset is identified by (symbol, source) and has exactly ONE stored base timeframe. Writing another
    timeframe into it is refused; every other timeframe is resampled from the base timeframe.
  * Live-feed candles are a separate dataset (source ending ``-live``) and can never shadow, extend or
    replace a historical dataset.
  * Every write and every load is verified: duplicate timestamps, candle interval and grid alignment,
    calendar-aware missing candles, requested date range and OHLC sanity. Problems raise ``DataError``
    instead of being silently repaired.
  * Every dataset carries provenance (provider, URL, download time) and a content checksum.
"""
from __future__ import annotations

import hashlib
import io
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..core.instruments import DEFAULT_SPECS, TIMEFRAMES
from ..core.mtf import resample
from ..db import utcnow
from ..models import Candle, Dataset

COLS = ["open", "high", "low", "close", "volume"]
LIVE_SUFFIX = "-live"
DEFAULT_MAX_MISSING_FRAC = 0.002       # 0.2 % of expected candles in the requested slice
DEFAULT_MAX_GAP_HOURS = 12.0


class DataError(ValueError):
    pass


# ------------------------------------------------------------------ identification
QUARANTINE_SUFFIX = "-quarantined"


def kind_for_source(source: str) -> str:
    if source.endswith(QUARANTINE_SUFFIX):
        return "quarantined"
    if source.startswith("synthetic"):
        return "synthetic"
    if source.startswith("csv:"):
        return "csv"
    if source.endswith(LIVE_SUFFIX):
        return "live"
    return "historical"


def live_source(feed_source: str, timeframe: str) -> str:
    """Name of the live dataset for one feed and timeframe, e.g. ``binance-M15-live``. One dataset per
    timeframe keeps the one-base-timeframe rule, and the suffix keeps it apart from historical data."""
    return f"{feed_source}-{timeframe}{LIVE_SUFFIX}"


def calendar_for(symbol: str) -> str:
    spec = DEFAULT_SPECS.get(symbol)
    return "24x7" if (spec is None or spec.trades_weekend) else "fx"


def tf_minutes(tf: str) -> int:
    try:
        return TIMEFRAMES[tf]
    except KeyError as e:
        raise DataError(f"unknown timeframe {tf!r}") from e


# ----------------------------------------------------------------------- calendar
def _fx_open(index: pd.DatetimeIndex) -> np.ndarray:
    """FX / metals week: Sunday 17:00 to Friday 17:00 New York time (same rule as sessions.market_open)."""
    ny = index.tz_convert("America/New_York")
    wd, hm = ny.day_of_week, ny.hour * 60 + ny.minute
    closed = (wd == 5) | ((wd == 4) & (hm >= 17 * 60)) | ((wd == 6) & (hm < 17 * 60))
    return ~np.asarray(closed)


def expected_index(start: pd.Timestamp, end: pd.Timestamp, timeframe: str, calendar: str) -> pd.DatetimeIndex:
    idx = pd.date_range(start, end, freq=f"{tf_minutes(timeframe)}min", tz="UTC")
    return idx[_fx_open(idx)] if calendar == "fx" else idx


# --------------------------------------------------------------------- validation
def validate_frame(df: pd.DataFrame, timeframe: str | None = None) -> pd.DataFrame:
    """OHLC sanity, duplicate rejection and (if ``timeframe`` is given) interval / grid verification."""
    if df.empty:
        raise DataError("no rows")
    if df.index.tz is None:
        raise DataError("index must be timezone-aware (UTC)")
    dup = df.index.duplicated(keep=False)
    if dup.any():
        first = df.index[dup][0]
        raise DataError(f"{int(df.index.duplicated().sum())} duplicate candle timestamp(s) (first at {first}); "
                        f"refusing to guess which copy is correct")
    df = df.sort_index()
    if df[["open", "high", "low", "close"]].isna().any().any():
        raise DataError("OHLC contains missing values")
    if (df[["open", "high", "low", "close"]] <= 0).any().any():
        raise DataError("OHLC contains non-positive prices")
    bad = (df["high"] < df[["open", "close", "low"]].max(axis=1)) | (df["low"] > df[["open", "close"]].min(axis=1))
    if bad.any():
        raise DataError(f"{int(bad.sum())} candles violate high/low bounds (first at {df.index[bad][0]})")
    if timeframe is not None:
        verify_timeframe(df.index, timeframe)
    return df


def verify_timeframe(index: pd.DatetimeIndex, timeframe: str) -> None:
    """Every timestamp must sit on the timeframe grid, and spacing must be whole multiples of it."""
    m = tf_minutes(timeframe)
    secs = index.as_unit("ns").asi8 // 1_000_000_000
    off = secs % (m * 60)
    if (off != 0).any():
        raise DataError(f"{int((off != 0).sum())} candle(s) are not aligned to the {timeframe} grid "
                        f"(first at {index[off != 0][0]})")
    if len(index) > 1:
        d = np.diff(secs)
        if (d % (m * 60) != 0).any() or (d <= 0).any():
            raise DataError(f"candle spacing is not a multiple of {timeframe}")
        if len(index) > 20 and np.median(d) != m * 60:
            raise DataError(f"median candle spacing is {np.median(d) / 60:.0f} min, not {m} min ({timeframe})")


def quality(index: pd.DatetimeIndex, timeframe: str, calendar: str, start=None, end=None) -> dict:
    """Missing-candle report against the instrument calendar, between ``start`` and ``end``."""
    if len(index) == 0:
        return {"expected": 0, "present": 0, "missing": 0, "missing_frac": 1.0, "largest_gap_hours": None, "gaps": []}
    start = pd.Timestamp(start) if start is not None else index[0]
    end = pd.Timestamp(end) if end is not None else index[-1]
    exp = expected_index(start, end, timeframe, calendar)
    miss = exp.difference(index)
    gaps = []
    if len(miss):
        m = pd.Timedelta(minutes=tf_minutes(timeframe))
        run_start, prev = miss[0], miss[0]
        for t in miss[1:]:
            if t - prev > m:
                gaps.append((run_start, prev))
                run_start = t
            prev = t
        gaps.append((run_start, prev))
    gl = sorted(({"from": a.isoformat(), "to": b.isoformat(), "bars": int(len(exp[(exp >= a) & (exp <= b)])),
                  "hours": (b - a).total_seconds() / 3600 + tf_minutes(timeframe) / 60} for a, b in gaps),
                key=lambda g: -g["bars"])
    return {"expected": int(len(exp)), "present": int(len(exp.intersection(index))), "missing": int(len(miss)),
            "missing_frac": float(len(miss) / len(exp)) if len(exp) else 0.0,
            "largest_gap_hours": gl[0]["hours"] if gl else 0.0, "gaps": gl[:20]}


def checksum(df: pd.DataFrame) -> str:
    h = hashlib.sha256()
    h.update(df.index.as_unit("ns").asi8.tobytes())
    h.update(np.ascontiguousarray(df[["open", "high", "low", "close", "volume"]].to_numpy(dtype=float)).tobytes())
    return h.hexdigest()


# ------------------------------------------------------------------------ parsing
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


# ----------------------------------------------------------------------- registry
def get_dataset(db: Session, symbol: str, source: str) -> Dataset | None:
    return db.query(Dataset).filter_by(symbol=symbol, source=source).first()


def require_dataset(db: Session, symbol: str, source: str) -> Dataset:
    ds = get_dataset(db, symbol, source)
    if ds is None:
        raise DataError(f"no registered dataset {symbol!r} from source {source!r}")
    if ds.kind == "quarantined":
        raise DataError(f"dataset {symbol}/{source} is quarantined: {ds.provenance.get('quarantine_reason', '')}")
    return ds


def _read_index(db, symbol, timeframe, source) -> pd.DatetimeIndex:
    rows = db.execute(select(Candle.ts).where(Candle.symbol == symbol, Candle.timeframe == timeframe,
                                              Candle.source == source).order_by(Candle.ts)).scalars().all()
    return pd.DatetimeIndex(pd.to_datetime(rows, utc=True)).as_unit("ns")


def refresh_registry(db: Session, ds: Dataset, with_checksum: bool = True) -> Dataset:
    """Recompute coverage, missing candles and checksum from what is actually stored."""
    idx = _read_index(db, ds.symbol, ds.base_timeframe, ds.source)
    q = quality(idx, ds.base_timeframe, ds.calendar)
    ds.rows, ds.missing_bars, ds.gaps = int(len(idx)), q["missing"], q["gaps"][:10]
    ds.start = idx[0].to_pydatetime() if len(idx) else None
    ds.end = idx[-1].to_pydatetime() if len(idx) else None
    if with_checksum and len(idx):
        ds.checksum = checksum(_read(db, ds.symbol, ds.base_timeframe, ds.source, None, None, None))
    ds.updated_at = utcnow()
    return ds


def upsert(db: Session, symbol: str, timeframe: str, source: str, df: pd.DataFrame, *,
           provenance: dict | None = None, refresh: bool = True) -> int:
    """Validate and store candles in the dataset (symbol, source). A dataset keeps one base timeframe."""
    df = validate_frame(df, timeframe)
    ds = get_dataset(db, symbol, source)
    kind = kind_for_source(source)
    if kind == "quarantined":
        raise DataError(f"source {source!r} is reserved for quarantined data; it cannot receive candles")
    if ds is None:
        ds = Dataset(symbol=symbol, source=source, base_timeframe=timeframe, kind=kind, calendar=calendar_for(symbol),
                     provenance=provenance or {}, split={})
        db.add(ds)
        db.flush()
    else:
        if ds.kind == "quarantined":
            raise DataError(f"dataset {symbol}/{source} is quarantined; it cannot receive new candles")
        if ds.base_timeframe != timeframe:
            raise DataError(f"dataset {symbol}/{source} stores {ds.base_timeframe} candles; refusing to add "
                            f"{timeframe} candles to it (store them as a separate dataset)")
        if ds.kind != kind:
            raise DataError(f"dataset {symbol}/{source} is {ds.kind}; refusing a {kind} write")
        if provenance:
            ds.provenance = {**(ds.provenance or {}), **provenance}
    if ds.calendar == "fx":
        closed = ~_fx_open(df.index)
        if closed.any():
            raise DataError(f"{int(closed.sum())} candle(s) fall inside the FX weekend close (first at {df.index[closed][0]})")
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
    db.flush()
    if refresh:
        refresh_registry(db, ds, with_checksum=kind != "live")
    return len(rows)


# --------------------------------------------------------------------------- read
def _read(db, symbol, timeframe, source, start, end, limit) -> pd.DataFrame:
    q = select(Candle.ts, Candle.open, Candle.high, Candle.low, Candle.close, Candle.volume, Candle.spread).where(
        Candle.symbol == symbol, Candle.timeframe == timeframe, Candle.source == source)
    if start is not None:
        q = q.where(Candle.ts >= start)
    if end is not None:
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


def _drop_incomplete_last(out: pd.DataFrame, base: pd.DataFrame, timeframe: str, base_tf: str) -> pd.DataFrame:
    """A resampled bar is only complete once its final base bar exists."""
    if out.empty or base.empty:
        return out
    last_needed = out.index[-1] + pd.Timedelta(minutes=tf_minutes(timeframe) - tf_minutes(base_tf))
    return out.iloc[:-1] if base.index[-1] < last_needed else out


def load(db: Session, symbol: str, timeframe: str, source: str, start: datetime | None = None,
         end: datetime | None = None, limit: int | None = None, *, check: bool = True,
         max_missing_frac: float = DEFAULT_MAX_MISSING_FRAC, max_gap_hours: float = DEFAULT_MAX_GAP_HOURS) -> pd.DataFrame:
    """Load ``timeframe`` candles of the registered dataset (symbol, source).

    Always built from the dataset's base timeframe (never from rows of another timeframe or another source).
    With ``check`` (default) the slice is rejected when it falls outside the dataset's coverage, or when
    missing candles exceed ``max_missing_frac`` of the expected calendar or any single gap exceeds
    ``max_gap_hours``. The result carries ``df.attrs['dataset']`` with provenance and the quality report."""
    ds = require_dataset(db, symbol, source)
    want, base_m = tf_minutes(timeframe), tf_minutes(ds.base_timeframe)
    if want < base_m or want % base_m:
        raise DataError(f"{timeframe} cannot be built from dataset {symbol}/{source} whose base timeframe is "
                        f"{ds.base_timeframe}")
    start = pd.Timestamp(start).tz_convert("UTC") if start is not None and pd.Timestamp(start).tzinfo else (
        pd.Timestamp(start, tz="UTC") if start is not None else None)
    end = pd.Timestamp(end).tz_convert("UTC") if end is not None and pd.Timestamp(end).tzinfo else (
        pd.Timestamp(end, tz="UTC") if end is not None else None)
    if check and ds.start is not None:
        if start is not None and start < pd.Timestamp(ds.start) - pd.Timedelta(minutes=base_m):
            raise DataError(f"requested start {start} is before dataset {symbol}/{source} begins ({ds.start})")
        if end is not None and end > pd.Timestamp(ds.end) + pd.Timedelta(minutes=want):
            raise DataError(f"requested end {end} is after dataset {symbol}/{source} ends ({ds.end})")
    ratio = want // base_m
    base = _read(db, symbol, ds.base_timeframe, source, start, end, (limit + 1) * ratio if limit else None)
    if base.empty:
        out = base
    elif ratio == 1:
        out = base
    else:
        out = _drop_incomplete_last(resample(base, timeframe), base, timeframe, ds.base_timeframe)
    if limit:
        out = out.iloc[-limit:]
    rep = quality(base.index, ds.base_timeframe, ds.calendar, start if start is not None else None,
                  end if end is not None else None) if len(base) else None
    if check and rep is not None:
        if rep["missing_frac"] > max_missing_frac or (rep["largest_gap_hours"] or 0) > max_gap_hours:
            g = rep["gaps"][0] if rep["gaps"] else {}
            raise DataError(f"dataset {symbol}/{source} slice is incomplete: {rep['missing']} of {rep['expected']} "
                            f"{ds.base_timeframe} candles missing ({rep['missing_frac']:.3%}); largest gap "
                            f"{g.get('from')} → {g.get('to')} ({rep['largest_gap_hours']:.1f} h). "
                            f"Limits: {max_missing_frac:.2%} missing, {max_gap_hours:.0f} h gap")
    out.attrs["dataset"] = {"symbol": symbol, "source": source, "kind": ds.kind, "base_timeframe": ds.base_timeframe,
                            "timeframe": timeframe, "calendar": ds.calendar, "provenance": ds.provenance,
                            "checksum": ds.checksum, "quality": {k: v for k, v in (rep or {}).items() if k != "gaps"},
                            "split": ds.split}
    return out


def datasets(db: Session) -> list[dict]:
    return [{"symbol": d.symbol, "timeframe": d.base_timeframe, "source": d.source, "kind": d.kind, "candles": d.rows,
             "start": d.start.isoformat() if d.start else None, "end": d.end.isoformat() if d.end else None,
             "missing_bars": d.missing_bars, "calendar": d.calendar, "provenance": d.provenance, "checksum": d.checksum,
             "split": d.split, "synthetic": d.kind == "synthetic"}
            for d in db.query(Dataset).order_by(Dataset.symbol, Dataset.source)]


def quarantine(db: Session, ds: Dataset, reason: str) -> None:
    ds.kind = "quarantined"
    ds.provenance = {**(ds.provenance or {}), "quarantine_reason": reason, "quarantined_at": utcnow().isoformat()}


def window_for(db: Session, symbol: str, source: str, timeframe: str, bars: int) -> timedelta:
    """Calendar span that ``bars`` candles of ``timeframe`` cover (approximate for FX: x7/5)."""
    ds = require_dataset(db, symbol, source)
    span = timedelta(minutes=tf_minutes(timeframe) * bars)
    return span * 7 / 5 if ds.calendar == "fx" else span
