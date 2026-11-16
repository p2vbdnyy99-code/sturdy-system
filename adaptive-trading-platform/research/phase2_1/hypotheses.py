"""Phase 2.1 hypothesis tests, exactly as pre-registered in preregistration.json (registered before any result).

Run from backend/:  .venv/bin/python ../research/phase2_1/hypotheses.py <output.json>

Signal-level research: daily long/flat exposure on Binance BTCUSDT spot, net of costs. It does not go through
the intraday platform engine (whose 24 h maximum hold and session windows do not fit daily-horizon rules).
Data is loaded through the dataset registry; research loads end before the hold-out (``splits.research_end``),
and the hold-out is read only for validation survivors, with a ledger entry."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, ".")
from app.data import splits, store  # noqa: E402
from app.db import session_scope  # noqa: E402

PRE = json.loads((Path(__file__).parent / "preregistration.json").read_text())
COST_PER_SIDE = (PRE["costs"]["commission_per_side_bp"] + PRE["costs"]["spread_and_slippage_per_side_bp"]) / 1e4
N_SHIFTS, MIN_SHIFT = 2000, 30


def daily_from_h4(h4: pd.DataFrame) -> pd.DataFrame:
    d = h4.resample("1D", label="left", closed="left").agg({"open": "first", "high": "max", "low": "min",
                                                            "close": "last", "volume": "sum", "n": "count"}) \
        if "n" in h4 else h4.assign(n=1).resample("1D", label="left", closed="left").agg(
            {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum", "n": "count"})
    return d[d["n"] == 6].drop(columns="n")       # only complete days (six H4 bars)


# ---------------------------------------------------------------- exposure rules (decided at the daily close)
def h1_tsmom(d, lookback_days=30):
    r = np.log(d.close).diff(lookback_days)
    return (r > 0).astype(float).where(r.notna(), 0.0)


def h2_vol_scaled(d, lookback_days=30, target_vol=0.40, rebalance_band=0.10):
    sign = h1_tsmom(d, lookback_days)
    vol = np.log(d.close).diff().rolling(lookback_days).std() * np.sqrt(365)
    target = (sign * np.minimum(1.0, target_vol / vol)).fillna(0.0)
    out, cur = [], 0.0
    for t in target.to_numpy():
        if abs(t - cur) > rebalance_band or (t == 0.0 and cur != 0.0):
            cur = t
        out.append(cur)
    return pd.Series(out, index=d.index)


def h3_donchian(d, entry_days=55, exit_days=20):
    hi, lo = d.high.rolling(entry_days).max().shift(1), d.low.rolling(exit_days).min().shift(1)
    out, pos = [], 0.0
    for c, h, l in zip(d.close.to_numpy(), hi.to_numpy(), lo.to_numpy()):
        if pos == 0.0 and not np.isnan(h) and c > h:
            pos = 1.0
        elif pos == 1.0 and not np.isnan(l) and c < l:
            pos = 0.0
        out.append(pos)
    return pd.Series(out, index=d.index)


def _hold_after(trigger: pd.Series, hold_days: int) -> pd.Series:
    out, left = [], 0
    for t in trigger.to_numpy():
        if t:
            left = hold_days
        out.append(1.0 if left > 0 else 0.0)
        left = max(0, left - 1) if not t else left - 1
    return pd.Series(out, index=trigger.index)


def h4_crash_reversal(d, z=2.5, vol_days=30, hold_days=3):
    r = np.log(d.close).diff()
    sd = r.rolling(vol_days).std().shift(1)
    return _hold_after((r < -z * sd).fillna(False), hold_days)


def h5_failed_breakdown(d, lookback_days=20, hold_days=5):
    lo = d.low.rolling(lookback_days).min().shift(1)
    return _hold_after(((d.low < lo) & (d.close > lo)).fillna(False), hold_days)


RULES = {"H1_tsmom30": h1_tsmom, "H2_vol_scaled_tsmom": h2_vol_scaled, "H3_donchian_55_20": h3_donchian,
         "H4_crash_reversal": h4_crash_reversal, "H5_failed_breakdown": h5_failed_breakdown}


# ---------------------------------------------------------------------------------------- evaluation
def evaluate(d: pd.DataFrame, expo: pd.Series, seg: tuple[pd.Timestamp, pd.Timestamp], seed: int = 0) -> dict:
    """Exposure decided at close t earns the return of day t+1. Costs on |change in exposure|.
    Indicators are computed on the full loaded history (causal), statistics on the segment only."""
    ret = d.close.pct_change().shift(-1)                      # next day's return, aligned to decision day t
    m = (d.index >= seg[0]) & (d.index < seg[1]) & ret.notna().to_numpy()
    e, r = expo[m].to_numpy(), ret[m].to_numpy()
    prev = np.concatenate([[expo.shift(1).fillna(0.0)[m].to_numpy()[0]], e[:-1]])
    cost = np.abs(e - prev) * COST_PER_SIDE
    gross, net = e * r, e * r - cost
    eq = np.cumprod(1 + net)
    bh = np.cumprod(1 + r)
    rng = np.random.default_rng(seed)
    n = len(r)
    shifts = rng.integers(MIN_SHIFT, n - MIN_SHIFT, N_SHIFTS) if n > 3 * MIN_SHIFT else np.array([], int)
    null = np.array([(np.roll(e, k) * r).mean() for k in shifts])
    p = float(((null >= gross.mean()).sum() + 1) / (len(null) + 1)) if len(null) else None
    sr = lambda x: float(x.mean() / x.std(ddof=1) * np.sqrt(365)) if x.std(ddof=1) > 0 else None  # noqa: E731
    return {"days": int(n), "exposure_share": float((e > 0).mean()), "exposure_changes": int((np.abs(e - prev) > 0).sum()),
            "net_total_return": float(eq[-1] - 1), "gross_total_return": float(np.prod(1 + gross) - 1),
            "costs_total_return_drag": float(np.prod(1 + gross) - eq[-1]),
            "net_sharpe": sr(net), "net_mean_daily_bp": float(net.mean() * 1e4),
            "max_drawdown": float((1 - eq / np.maximum.accumulate(eq)).max()),
            "buy_hold_total_return": float(bh[-1] - 1), "buy_hold_sharpe": sr(r),
            "timing_p": p, "null_mean_daily_bp": float(null.mean() * 1e4) if len(null) else None}


def holm(pvals: dict[str, float], alpha: float = 0.05) -> dict[str, dict]:
    order = sorted(pvals, key=lambda k: pvals[k])
    out, still = {}, True
    m = len(order)
    for i, k in enumerate(order):
        adj = min(1.0, pvals[k] * (m - i))
        still = still and adj < alpha
        out[k] = {"p": pvals[k], "holm_adjusted_p": adj, "reject_null": still}
    return out


def main(out_path: str) -> None:
    sym, src = PRE["dataset"]["symbol"], PRE["dataset"]["source"]
    res: dict = {"preregistration": PRE, "results": {}}
    with session_scope() as db:
        ds = store.require_dataset(db, sym, src)
        sp = splits.get_split(ds)
        h4 = store.load(db, sym, "H4", src, end=splits.research_end(sp))          # never the hold-out
        res["dataset"] = h4.attrs["dataset"] | {"loaded_until": str(h4.index[-1])}
        d = daily_from_h4(h4)
        expos = {k: f(d, **PRE["hypotheses"][k]["params"]) for k, f in RULES.items()}
        train = {k: evaluate(d, e, (sp.data_start, sp.train_end)) for k, e in expos.items()}
        h = holm({k: v["timing_p"] for k, v in train.items()})
        survivors = [k for k in RULES if h[k]["reject_null"] and (train[k]["net_sharpe"] or -1) > 0]
        res["train"] = {k: train[k] | h[k] for k in RULES}
        res["train_survivors"] = survivors
        res["validation"] = {k: evaluate(d, expos[k], (sp.train_end, sp.holdout_start)) for k in survivors}
        val_pass = [k for k in survivors if (res["validation"][k]["timing_p"] or 1) < 0.05
                    and (res["validation"][k]["net_sharpe"] or -1) > 0 and res["validation"][k]["net_total_return"] > 0]
        res["validation_survivors"] = val_pass
        res["holdout"] = {}
        if val_pass:
            prior = splits.record_access(ds, f"Phase 2.1 pre-registered hypothesis hold-out: {val_pass}")
            full = daily_from_h4(store.load(db, sym, "H4", src))
            res["holdout"] = {k: evaluate(full, RULES[k](full, **PRE["hypotheses"][k]["params"]),
                                          (sp.holdout_start, sp.data_end)) | {"independent": prior == 0} for k in val_pass}
        res["split"] = sp.to_dict()
    Path(out_path).write_text(json.dumps(res, indent=1, default=str))
    for seg in ("train", "validation", "holdout"):
        for k, v in res[seg].items():
            print(f"{seg:10s} {k:22s} net {v['net_total_return']:+8.1%}  Sharpe {v['net_sharpe'] or float('nan'):+5.2f}  "
                  f"B&H {v['buy_hold_total_return']:+8.1%} ({v['buy_hold_sharpe'] or float('nan'):+5.2f})  expo {v['exposure_share']:.0%}  "
                  f"changes {v['exposure_changes']:4d}  timing p {v['timing_p']:.4f}  "
                  + (f"holm {v['holm_adjusted_p']:.4f} {'REJECT' if v['reject_null'] else 'keep'}" if seg == 'train' else ""))
    print("train survivors:", res["train_survivors"], "| validation survivors:", res["validation_survivors"])


if __name__ == "__main__":
    main(sys.argv[1])
