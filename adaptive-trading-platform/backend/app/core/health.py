"""Strategy health monitoring. Deterioration only ever *reduces* activity:
a strategy is flagged or suspended, never re-tuned on its recent trades.
Reactivation requires a fresh validation run (new config version)."""
from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np


@dataclass
class HealthThresholds:
    window: int = 30
    min_trades: int = 15
    warn_profit_factor: float = 1.0
    stop_profit_factor: float = 0.7
    warn_expectancy_r: float = 0.0
    stop_expectancy_r: float = -0.2
    stop_consecutive_losses: int = 7
    drawdown_multiple: float = 1.5      # vs. validated (backtest) drawdown, in R
    min_stop_drawdown_r: float = 8.0
    slippage_r_warn: float = 0.15       # mean adverse entry slippage, in R


def evaluate(r_multiples: list[float], baseline: dict | None = None, slippage_r: list[float] | None = None,
             th: HealthThresholds | None = None) -> dict:
    th = th or HealthThresholds()
    r = np.asarray(r_multiples[-th.window:], dtype=float)
    out = {"trades": int(len(r_multiples)), "window": int(len(r)), "status": "insufficient_data", "flags": [],
           "thresholds": asdict(th)}
    if len(r) == 0:
        return out
    wins, losses = r[r > 0].sum(), -r[r < 0].sum()
    pf = float(wins / losses) if losses > 0 else None
    curve = np.cumsum(np.asarray(r_multiples, dtype=float))
    dd_r = float((np.maximum.accumulate(np.concatenate([[0.0], curve])) - np.concatenate([[0.0], curve])).max())
    streak = 0
    for x in r_multiples[::-1]:
        if x < 0:
            streak += 1
        else:
            break
    out |= {"profit_factor": pf, "expectancy_r": float(r.mean()), "drawdown_r": dd_r, "losing_streak": streak}
    stop, warn = [], []
    if streak >= th.stop_consecutive_losses:
        stop.append(f"{streak} consecutive losses")
    base_dd = (baseline or {}).get("max_drawdown_r")
    dd_limit = max(th.min_stop_drawdown_r, th.drawdown_multiple * base_dd) if base_dd else th.min_stop_drawdown_r
    if dd_r >= dd_limit:
        stop.append(f"drawdown {dd_r:.1f}R exceeds limit {dd_limit:.1f}R")
    if len(r) >= th.min_trades:
        if pf is not None and pf < th.stop_profit_factor:
            stop.append(f"rolling profit factor {pf:.2f} < {th.stop_profit_factor}")
        elif pf is not None and pf < th.warn_profit_factor:
            warn.append(f"rolling profit factor {pf:.2f} below {th.warn_profit_factor}")
        if r.mean() < th.stop_expectancy_r:
            stop.append(f"rolling expectancy {r.mean():.2f}R < {th.stop_expectancy_r}R")
        elif r.mean() < th.warn_expectancy_r:
            warn.append(f"rolling expectancy {r.mean():.2f}R is negative")
        base_exp = (baseline or {}).get("expectancy_r")
        if base_exp and base_exp > 0 and r.mean() < 0.25 * base_exp:
            warn.append("expectancy below 25% of the validated level")
    if slippage_r and len(slippage_r) >= 5 and float(np.mean(slippage_r)) > th.slippage_r_warn:
        warn.append(f"mean entry slippage {np.mean(slippage_r):.2f}R is unusually high")
    out["flags"] = stop + warn
    out["status"] = "suspend" if stop else "warning" if warn else (
        "healthy" if len(r) >= th.min_trades else "insufficient_data")
    out["stop_reasons"] = stop
    return out
