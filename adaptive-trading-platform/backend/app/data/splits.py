"""Per-dataset train / validation / hold-out boundaries and the hold-out access ledger (defect D1).

A split is defined once per dataset and is immutable afterwards. Research code can only load data that ends
before the hold-out. Anything that does read the hold-out (the hold-out job, or an explicitly requested
backtest / replay over it) is appended to the dataset's ledger, and a second hold-out evaluation is labelled
as not independent."""
from __future__ import annotations

from datetime import timedelta

import pandas as pd
from sqlalchemy.orm import Session

from ..core.validation import DataSplit
from ..db import utcnow
from ..models import Dataset
from .store import DataError, require_dataset

DEFAULT_FRACTIONS = (0.6, 0.2)          # train, validation; the remaining 20 % is the hold-out
ONE_TICK = timedelta(microseconds=1)


def get_split(ds: Dataset) -> DataSplit | None:
    sp = ds.split or {}
    return DataSplit.from_dict(sp) if sp.get("train_end") else None


def define_split(db: Session, ds: Dataset, train_end=None, holdout_start=None, fractions=DEFAULT_FRACTIONS,
                 reason: str = "default fractions") -> DataSplit:
    """Create the split. Refused if one already exists: boundaries can never be moved after the fact."""
    if get_split(ds) is not None:
        raise DataError(f"dataset {ds.symbol}/{ds.source} already has a split defined on {ds.split.get('defined_at')}; "
                        f"splits are immutable")
    if ds.start is None or ds.end is None:
        raise DataError("dataset has no candles")
    start, end = pd.Timestamp(ds.start), pd.Timestamp(ds.end)
    if train_end is not None or holdout_start is not None:
        if train_end is None or holdout_start is None:
            raise DataError("give both train_end and holdout_start, or neither")
        split = DataSplit(pd.Timestamp(train_end), pd.Timestamp(holdout_start), start, end)
        method = "explicit dates"
    else:
        split = DataSplit.from_fractions(start, end, *fractions)
        method = f"fractions train={fractions[0]} validation={fractions[1]}"
    ds.split = {**split.to_dict(), "method": method, "reason": reason, "defined_at": utcnow().isoformat(),
                "accesses": []}
    return split


def ensure_split(db: Session, ds: Dataset) -> DataSplit:
    return get_split(ds) or define_split(db, ds)


def research_end(split: DataSplit) -> pd.Timestamp:
    """Last instant research may load (inclusive)."""
    return split.holdout_start - ONE_TICK


def record_access(ds: Dataset, purpose: str, run_id: int | None = None, user_id: int | None = None) -> int:
    """Append to the hold-out ledger; returns how many accesses existed BEFORE this one."""
    sp = dict(ds.split or {})
    acc = list(sp.get("accesses", []))
    prior = len(acc)
    acc.append({"at": utcnow().isoformat(), "purpose": purpose, "run_id": run_id, "user_id": user_id})
    sp["accesses"] = acc
    ds.split = sp                       # reassign so the JSON column is marked dirty
    return prior


def guard_range(db: Session, symbol: str, source: str, start, end, include_holdout: bool, purpose: str,
                run_id: int | None = None, user_id: int | None = None) -> tuple[pd.Timestamp | None, DataSplit, bool]:
    """Clip a requested [start, end] so it stops before the hold-out, unless the caller explicitly asks to
    include it, in which case the access is recorded. Returns (effective_end, split, touched_holdout)."""
    ds = require_dataset(db, symbol, source)
    split = ensure_split(db, ds)
    limit = research_end(split)
    end_ts = pd.Timestamp(end) if end is not None else None
    if end_ts is not None and end_ts.tzinfo is None:
        end_ts = end_ts.tz_localize("UTC")
    wants_holdout = end_ts is None or end_ts > limit
    if not wants_holdout:
        return end_ts, split, False
    if not include_holdout:
        return limit, split, False
    record_access(ds, purpose, run_id, user_id)
    return end_ts, split, True
