"""Strategy research and selection.

Selection (parameter choice and the pass/fail gates) uses TRAINING data only.
The out-of-sample segment is touched exactly once, afterwards, as a
confirmation check; it never feeds back into the choice. A candidate that
fails the evidence or robustness requirements is rejected, however large its
historical return.
"""
from __future__ import annotations

import itertools
from dataclasses import asdict, dataclass

import numpy as np
import pandas as pd

from .backtest import BacktestConfig, PlanData, run_backtest
from .engines import Plan
from .instruments import InstrumentSpec
from .metrics import summarize
from .strategies.library import get_strategy


@dataclass
class SelectionCriteria:
    train_fraction: float = 0.65
    min_trades_train: int = 40
    min_profit_factor: float = 1.2
    min_expectancy_r: float = 0.05
    max_drawdown_pct: float = 12.0
    min_param_stability: float = 0.6      # share of the parameter grid that is profitable
    max_mc_loss_probability: float = 0.2  # bootstrap P(final return < 0)
    stress_cost_multiplier: float = 1.5   # must stay profitable with costs x1.5
    min_trades_oos: int = 15
    min_oos_expectancy_r: float = 0.0
    min_oos_profit_factor: float = 1.0
    walk_forward_folds: int = 4
    min_wf_positive_folds: float = 0.5

    def to_dict(self):
        return asdict(self)


def chronological_split(df: pd.DataFrame, train_fraction: float) -> tuple[pd.DataFrame, pd.DataFrame, pd.Timestamp]:
    cut = int(len(df) * train_fraction)
    return df.iloc[:cut], df.iloc[cut:], df.index[cut]


def _run(plan: Plan, df, spec, cfg: BacktestConfig, params=None) -> tuple[dict, list[dict]]:
    one = BacktestConfig(**{**cfg.__dict__, "enforce_portfolio_limits": True})
    res = run_backtest([PlanData(plan, df, spec, params or {})], one)
    return summarize(res.trades, cfg.initial_balance), res.trades


def grid(plan: Plan, max_combos: int = 27) -> list[dict]:
    g = get_strategy(plan.strategy).param_grid
    if not g:
        return [{}]
    keys = list(g)
    combos = [dict(zip(keys, v)) for v in itertools.product(*(g[k] for k in keys))]
    return combos[:max_combos]


def _neighbours(combos: list[dict], i: int, grid_def: dict) -> list[int]:
    """Indices of combos that differ from combo i by one step in one parameter."""
    out = []
    for j, other in enumerate(combos):
        if j == i:
            continue
        diff = [k for k in grid_def if other[k] != combos[i][k]]
        if len(diff) == 1:
            k = diff[0]
            if abs(grid_def[k].index(other[k]) - grid_def[k].index(combos[i][k])) == 1:
                out.append(j)
    return out


def select_parameters(plan: Plan, train: pd.DataFrame, spec: InstrumentSpec, cfg: BacktestConfig,
                      min_trades: int = 20) -> dict:
    """Pick parameters on training data by *plateau* quality: a combination is
    scored by the worst of itself and its neighbours' mean, so an isolated
    spike in the parameter surface is not chosen."""
    combos = grid(plan)
    gdef = get_strategy(plan.strategy).param_grid
    stats = [_run(plan, train, spec, cfg, c)[0] for c in combos]
    exp = np.array([s["expectancy_r"] if s["expectancy_r"] is not None and s["trades"] >= min_trades else np.nan
                    for s in stats])
    valid = ~np.isnan(exp)
    profitable = [bool(v and e > 0 and (s["profit_factor"] or 0) > 1) for v, e, s in zip(valid, exp, stats)]
    stability = float(np.mean(profitable)) if len(combos) else 0.0
    best, best_score = None, -np.inf
    for i in range(len(combos)):
        if not valid[i]:
            continue
        nb = [exp[j] for j in _neighbours(combos, i, gdef) if valid[j]]
        score = min(exp[i], float(np.mean(nb))) if nb else exp[i] - 0.05
        if score > best_score:
            best, best_score = i, score
    return {"params": combos[best] if best is not None else {}, "found": best is not None,
            "stability": stability, "grid_size": len(combos), "plateau_score": None if best is None else best_score,
            "grid": [{"params": c, "trades": s["trades"], "expectancy_r": s["expectancy_r"],
                      "profit_factor": s["profit_factor"]} for c, s in zip(combos, stats)]}


def monte_carlo(r_multiples: list[float], risk_fraction: float = 0.005, n_paths: int = 2000,
                seed: int = 7) -> dict | None:
    """Bootstrap the trade sequence (sampling with replacement) and compound at
    the fixed risk fraction. Reports the distribution of outcomes."""
    r = np.asarray(r_multiples, dtype=float)
    if len(r) < 10:
        return None
    rng = np.random.default_rng(seed)
    sample = rng.choice(r, size=(n_paths, len(r)), replace=True)
    curve = np.cumprod(1 + risk_fraction * sample, axis=1)
    final = curve[:, -1] - 1
    peak = np.maximum.accumulate(np.concatenate([np.ones((n_paths, 1)), curve], axis=1), axis=1)[:, 1:]
    mdd = ((peak - curve) / peak).max(axis=1)
    q = lambda a, p: float(np.percentile(a, p))  # noqa: E731
    return {"paths": n_paths, "trades_per_path": int(len(r)),
            "final_return_pct": {"p05": q(final, 5) * 100, "p50": q(final, 50) * 100, "p95": q(final, 95) * 100},
            "max_drawdown_pct": {"p50": q(mdd, 50) * 100, "p95": q(mdd, 95) * 100},
            "loss_probability": float((final < 0).mean())}


def cost_sensitivity(plan, df, spec, cfg: BacktestConfig, params, multipliers=(1.0, 1.5, 2.0)) -> list[dict]:
    out = []
    for mult in multipliers:
        s, _ = _run(plan, df, spec, BacktestConfig(**{**cfg.__dict__, "cost_multiplier": mult}), params)
        out.append({"cost_multiplier": mult, "trades": s["trades"], "expectancy_r": s["expectancy_r"],
                    "profit_factor": s["profit_factor"], "net_profit": s["net_profit"]})
    return out


def walk_forward(plan: Plan, df: pd.DataFrame, spec: InstrumentSpec, cfg: BacktestConfig, folds: int = 4,
                 train_fraction: float = 0.65) -> dict:
    """Anchored-rolling walk-forward: each fold re-selects parameters on its own
    training window and is then scored on the following unseen window."""
    n = len(df)
    test_len = int(n * (1 - train_fraction) / folds)
    train_len = n - folds * test_len
    rows, oos_trades = [], []
    if test_len < 200 or train_len < 1000:
        return {"folds": [], "insufficient_data": True}
    warm = get_strategy(plan.strategy).warmup_bars + 600
    for f in range(folds):
        a, b = f * test_len, f * test_len + train_len
        train, test = df.iloc[a:b], df.iloc[max(a, b - warm): b + test_len]
        sel = select_parameters(plan, train, spec, cfg, min_trades=10)
        boundary = df.index[b]
        s_tr, _ = _run(plan, train, spec, cfg, sel["params"])
        _, tr = _run(plan, test, spec, cfg, sel["params"])
        tr = [t for t in tr if t["entry_time"] >= boundary]
        s_te = summarize(tr, cfg.initial_balance)
        oos_trades += tr
        rows.append({"fold": f + 1, "train_start": df.index[a].isoformat(), "test_start": boundary.isoformat(),
                     "test_end": df.index[min(n - 1, b + test_len - 1)].isoformat(), "params": sel["params"],
                     "train_expectancy_r": s_tr["expectancy_r"], "train_trades": s_tr["trades"],
                     "test_expectancy_r": s_te["expectancy_r"], "test_trades": s_te["trades"],
                     "test_profit_factor": s_te["profit_factor"], "test_net_profit": s_te["net_profit"]})
    scored = [r for r in rows if r["test_trades"] > 0]
    pos = sum(1 for r in scored if (r["test_expectancy_r"] or 0) > 0)
    agg = summarize(oos_trades, cfg.initial_balance)
    is_exp = np.nanmean([r["train_expectancy_r"] or np.nan for r in rows]) if rows else np.nan
    eff = (agg["expectancy_r"] / is_exp) if agg["expectancy_r"] is not None and is_exp and is_exp > 0 else None
    return {"folds": rows, "positive_fold_share": pos / len(scored) if scored else 0.0,
            "oos_summary": agg, "efficiency": eff, "insufficient_data": False}


def research_plan(plan: Plan, df: pd.DataFrame, spec: InstrumentSpec, cfg: BacktestConfig | None = None,
                  crit: SelectionCriteria | None = None, with_walk_forward: bool = True) -> dict:
    """Full evidence pack + verdict for one candidate plan."""
    cfg, crit = cfg or BacktestConfig(), crit or SelectionCriteria()
    train, test, cut = chronological_split(df, crit.train_fraction)
    sel = select_parameters(plan, train, spec, cfg, min_trades=max(10, crit.min_trades_train // 2))
    params = sel["params"]
    s_train, tr_train = _run(plan, train, spec, cfg, params)
    failures: list[str] = []

    def gate(ok: bool, msg: str):
        if not ok:
            failures.append(msg)

    gate(sel["found"], "no parameter set produced enough training trades")
    gate(s_train["trades"] >= crit.min_trades_train,
         f"training trades {s_train['trades']} < {crit.min_trades_train}")
    pf = s_train["profit_factor"] or 0
    gate(pf >= crit.min_profit_factor, f"training profit factor {pf:.2f} < {crit.min_profit_factor}")
    er = s_train["expectancy_r"] if s_train["expectancy_r"] is not None else -1
    gate(er >= crit.min_expectancy_r, f"training expectancy {er:.3f}R < {crit.min_expectancy_r}R")
    gate(s_train["max_drawdown_pct"] <= crit.max_drawdown_pct,
         f"training drawdown {s_train['max_drawdown_pct']:.1f}% > {crit.max_drawdown_pct}%")
    gate(sel["stability"] >= crit.min_param_stability,
         f"parameter stability {sel['stability']:.2f} < {crit.min_param_stability}")
    mc = monte_carlo([t["r"] for t in tr_train], cfg.risk.risk_per_trade)
    gate(mc is not None and mc["loss_probability"] <= crit.max_mc_loss_probability,
         "Monte Carlo loss probability too high" if mc else "too few trades for Monte Carlo")
    sens = cost_sensitivity(plan, train, spec, cfg, params, (1.0, crit.stress_cost_multiplier, 2.0))
    stressed = sens[1]["expectancy_r"]
    gate(stressed is not None and stressed > 0, f"not profitable with costs x{crit.stress_cost_multiplier}")
    wf = None
    if with_walk_forward:
        wf = walk_forward(plan, df, spec, cfg, crit.walk_forward_folds, crit.train_fraction)
        if wf.get("insufficient_data"):
            failures.append("not enough data for walk-forward validation")
        else:
            gate(wf["positive_fold_share"] >= crit.min_wf_positive_folds,
                 f"only {wf['positive_fold_share']:.0%} of walk-forward folds positive")
    selected_on_training = not failures

    # ---- out-of-sample confirmation (never used for the choices above) -------
    warm = get_strategy(plan.strategy).warmup_bars + 600
    cut_i = len(train)
    oos_df = df.iloc[max(0, cut_i - warm):]
    _, tr_oos = _run(plan, oos_df, spec, cfg, params)
    tr_oos = [t for t in tr_oos if t["entry_time"] >= cut]
    s_oos = summarize(tr_oos, cfg.initial_balance)
    oos_fail: list[str] = []
    if s_oos["trades"] < crit.min_trades_oos:
        oos_fail.append(f"out-of-sample trades {s_oos['trades']} < {crit.min_trades_oos}")
    if (s_oos["expectancy_r"] if s_oos["expectancy_r"] is not None else -1) <= crit.min_oos_expectancy_r:
        oos_fail.append("out-of-sample expectancy not positive")
    if (s_oos["profit_factor"] or 0) < crit.min_oos_profit_factor:
        oos_fail.append("out-of-sample profit factor below 1")
    passed = selected_on_training and not oos_fail
    return {
        "plan_id": plan.plan_id, "engine": plan.engine, "strategy": plan.label, "strategy_key": plan.strategy,
        "symbol": plan.symbol, "timeframe": plan.timeframe, "params": {**plan.params, **params},
        "selected_params": params, "verdict": "passed" if passed else "failed",
        "selected_on_training": selected_on_training, "failures": failures, "oos_failures": oos_fail,
        "train": s_train, "out_of_sample": s_oos, "split_time": cut.isoformat(),
        "param_stability": sel["stability"], "param_grid": sel["grid"], "monte_carlo": mc,
        "cost_sensitivity": sens, "walk_forward": wf, "criteria": crit.to_dict(),
        "data_start": df.index[0].isoformat(), "data_end": df.index[-1].isoformat(), "bars": int(len(df)),
    }


def rank(reports: list[dict]) -> list[dict]:
    """Order candidates for display: passed first, then by a conservative score
    built from training evidence (never raw return)."""
    def score(r):
        s = r["train"]
        if not s["trades"] or s["expectancy_r"] is None:
            return -1e9
        dd = max(1.0, s["max_drawdown_pct"])
        return (s["expectancy_r"] * np.sqrt(s["trades"]) / np.sqrt(dd)) * r["param_stability"]
    return sorted(reports, key=lambda r: (r["verdict"] != "passed", -score(r)))
