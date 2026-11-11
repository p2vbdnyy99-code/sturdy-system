"""Performance statistics. All figures are net of modelled costs."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

from .sessions import IST


def _pf(pnl: np.ndarray) -> float | None:
    wins, losses = pnl[pnl > 0].sum(), -pnl[pnl < 0].sum()
    if losses == 0:
        return None if wins == 0 else float("inf")
    return float(wins / losses)


def _max_streak(flags: np.ndarray) -> int:
    best = cur = 0
    for f in flags:
        cur = cur + 1 if f else 0
        best = max(best, cur)
    return best


def max_drawdown(equity: np.ndarray, initial: float) -> tuple[float, float]:
    if len(equity) == 0:
        return 0.0, 0.0
    curve = np.concatenate([[initial], equity])
    peak = np.maximum.accumulate(curve)
    dd = peak - curve
    return float(dd.max()), float((dd / peak).max())


def summarize(trades: list[dict], initial: float, crypto_calendar: bool | None = None) -> dict:
    n = len(trades)
    base = {"trades": n, "initial_balance": initial}
    if n == 0:
        return base | {"net_profit": 0.0, "return_pct": 0.0, "win_rate": None, "profit_factor": None,
                       "expectancy_r": None, "expectancy_usd": None, "avg_rr_realized": None,
                       "max_drawdown_usd": 0.0, "max_drawdown_pct": 0.0, "sharpe": None, "sortino": None,
                       "max_consecutive_losses": 0, "avg_hold_minutes": None, "total_costs": 0.0}
    df = pd.DataFrame(trades).sort_values("exit_time")
    pnl, r = df["pnl"].to_numpy(), df["r"].to_numpy()
    wins, losses = r[r > 0], r[r < 0]
    eq = initial + np.cumsum(pnl)
    dd_usd, dd_pct = max_drawdown(eq, initial)
    # daily returns on closed-trade equity, including flat days
    exit_days = pd.DatetimeIndex(df["exit_time"]).tz_convert(IST).normalize().tz_localize(None)
    daily = pd.Series(pnl, index=exit_days).groupby(level=0).sum()
    if crypto_calendar is None:
        crypto_calendar = bool(df["symbol"].str.startswith("BTC").any())
    freq, ann = ("D", 365) if crypto_calendar else ("B", 252)
    cal = pd.date_range(daily.index.min(), daily.index.max(), freq=freq)
    daily = daily.reindex(daily.index.union(cal), fill_value=0.0)
    start_eq = initial + daily.cumsum().shift(1, fill_value=0.0)
    rets = (daily / start_eq).to_numpy()
    sharpe = sortino = None
    if len(rets) >= 20 and rets.std(ddof=1) > 0:
        sharpe = float(rets.mean() / rets.std(ddof=1) * math.sqrt(ann))
        downside = np.sqrt(np.mean(np.minimum(rets, 0) ** 2))
        sortino = float(rets.mean() / downside * math.sqrt(ann)) if downside > 0 else None
    costs = float(df["commission"].sum() + df["spread_cost"].sum() - df["financing"].sum())
    pf = _pf(pnl)
    return base | {
        "net_profit": float(pnl.sum()), "return_pct": float(pnl.sum() / initial * 100),
        "win_rate": float((pnl > 0).mean()), "profit_factor": pf,
        "expectancy_r": float(r.mean()), "expectancy_usd": float(pnl.mean()),
        "avg_win_r": float(wins.mean()) if len(wins) else None,
        "avg_loss_r": float(losses.mean()) if len(losses) else None,
        "avg_rr_realized": float(wins.mean() / -losses.mean()) if len(wins) and len(losses) else None,
        "max_drawdown_usd": dd_usd, "max_drawdown_pct": dd_pct * 100,
        "sharpe": sharpe, "sortino": sortino, "sharpe_basis": f"daily closed-trade returns x sqrt({ann})",
        "max_consecutive_losses": _max_streak(pnl < 0),
        "avg_hold_minutes": float(df["hold_minutes"].mean()),
        "total_costs": costs, "commission": float(df["commission"].sum()),
        "spread_cost": float(df["spread_cost"].sum()), "financing": float(df["financing"].sum()),
        "gross_profit": float(df["gross"].sum()), "final_balance": float(eq[-1]),
        "trading_days": int(len(daily)),
    }


def breakdown(trades: list[dict], key: str, initial: float) -> list[dict]:
    if not trades:
        return []
    df = pd.DataFrame(trades)
    out = []
    for k, g in df.groupby(key):
        pnl, r = g["pnl"].to_numpy(), g["r"].to_numpy()
        pf = _pf(pnl)
        out.append({key: k, "trades": int(len(g)), "net_profit": float(pnl.sum()),
                    "win_rate": float((pnl > 0).mean()), "profit_factor": pf,
                    "expectancy_r": float(r.mean()), "avg_hold_minutes": float(g["hold_minutes"].mean())})
    return sorted(out, key=lambda d: -d["net_profit"])


def period_returns(trades: list[dict], initial: float, freq: str) -> list[dict]:
    if not trades:
        return []
    df = pd.DataFrame(trades).sort_values("exit_time")
    t = pd.DatetimeIndex(df["exit_time"]).tz_convert(IST).tz_localize(None)
    key = t.to_period(freq)
    g = pd.Series(df["pnl"].to_numpy(), index=key).groupby(level=0).agg(["sum", "count"])
    start = initial + g["sum"].cumsum().shift(1, fill_value=0.0)
    return [{"period": str(p), "pnl": float(row["sum"]), "trades": int(row["count"]),
             "return_pct": float(row["sum"] / s * 100) if s else None}
            for (p, row), s in zip(g.iterrows(), start)]


def equity_points(trades: list[dict], initial: float, max_points: int = 600) -> list[dict]:
    if not trades:
        return []
    df = pd.DataFrame(trades).sort_values("exit_time")
    eq = initial + df["pnl"].cumsum().to_numpy()
    peak = np.maximum.accumulate(np.concatenate([[initial], eq]))[1:]
    step = max(1, len(df) // max_points)
    rows = [{"t": pd.Timestamp(tm).isoformat(), "equity": float(e), "drawdown_pct": float((p - e) / p * 100),
             "segment": s}
            for tm, e, p, s in zip(df["exit_time"], eq, peak, df["segment"])]
    return rows[::step] if rows[-1] in rows[::step] else rows[::step] + [rows[-1]]


def full_report(trades: list[dict], initial: float) -> dict:
    rep = {
        "summary": summarize(trades, initial),
        "by_strategy": breakdown(trades, "plan_id", initial),
        "by_session": breakdown(trades, "engine", initial),
        "by_instrument": breakdown(trades, "symbol", initial),
        "by_vol_regime": breakdown(trades, "vol_regime", initial),
        "by_exit_reason": breakdown(trades, "exit_reason", initial),
        "monthly": period_returns(trades, initial, "M"),
        "daily": period_returns(trades, initial, "D"),
        "equity_curve": equity_points(trades, initial),
    }
    segs = {t["segment"] for t in trades}
    if segs - {"unsplit"}:
        rep["in_sample"] = summarize([t for t in trades if t["segment"] == "in_sample"], initial)
        rep["out_of_sample"] = summarize([t for t in trades if t["segment"] == "out_of_sample"], initial)
    return rep


def clean(obj):
    """Make a nested structure JSON-safe (NaN/inf -> None, timestamps -> ISO)."""
    if isinstance(obj, dict):
        return {str(k): clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [clean(v) for v in obj]
    if isinstance(obj, (pd.Timestamp,)):
        return obj.isoformat()
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if isinstance(obj, (float, np.floating)):
        f = float(obj)
        return f if math.isfinite(f) else None
    if hasattr(obj, "isoformat"):
        return obj.isoformat()
    return obj
