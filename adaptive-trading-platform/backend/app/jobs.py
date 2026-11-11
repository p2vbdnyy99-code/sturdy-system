"""Long-running work: backtests, strategy research and paper replays."""
from __future__ import annotations

import logging
import traceback
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from . import __version__
from .brokers.base import Quote
from .config import get_settings
from .core import metrics
from .core.backtest import BacktestConfig, PlanData, run_backtest
from .core.engines import Plan, candidate_plans, plan_from_id
from .core.risk import RiskConfig
from .core.trading import TradingService, load_specs, user_sessions
from .core.validation import SelectionCriteria, rank, research_plan
from .data import store
from .data.synthetic import is_synthetic
from .db import session_scope, utcnow
from .models import Account, BacktestResult, BacktestRun, StrategyConfig, User

log = logging.getLogger("atp.jobs")
_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="atp-job")


def submit(fn, run_id: int) -> None:
    if get_settings().env == "test":
        fn(run_id)
    else:
        _pool.submit(fn, run_id)


def _parse_ts(s: str | None) -> datetime | None:
    return pd.Timestamp(s).tz_convert("UTC").to_pydatetime() if s and pd.Timestamp(s).tzinfo else (
        pd.Timestamp(s, tz="UTC").to_pydatetime() if s else None)


def _plans(req: dict) -> list[Plan]:
    if req.get("plan_ids"):
        return [plan_from_id(p) for p in req["plan_ids"]]
    return candidate_plans(req.get("engine"), req.get("symbols"), req.get("timeframes"))


def _bt_config(req: dict, sessions) -> BacktestConfig:
    return BacktestConfig(initial_balance=float(req.get("initial_balance", 300.0)),
                          risk=RiskConfig.from_dict(req.get("risk")),
                          cost_multiplier=float(req.get("cost_multiplier", 1.0)),
                          max_hold_minutes=int(req.get("max_hold_minutes", 1440)),
                          flat_at_session_end=bool(req.get("flat_at_session_end", False)), sessions=sessions)


def _guard(run_id: int, body) -> None:
    try:
        with session_scope() as db:
            run = db.get(BacktestRun, run_id)
            run.status = "running"
            db.commit()
            body(db, run)
            run.status, run.progress, run.finished_at = "done", 1.0, utcnow()
    except Exception as e:  # recorded on the run, never swallowed
        log.exception("job %s failed", run_id)
        with session_scope() as db:
            run = db.get(BacktestRun, run_id)
            run.status, run.finished_at = "failed", utcnow()
            run.error = f"{type(e).__name__}: {e}\n{traceback.format_exc()[-1500:]}"


def _trade_rows(trades: list[dict], limit: int = 3000) -> list[dict]:
    return metrics.clean(trades[-limit:])


def run_backtest_job(run_id: int) -> None:
    def body(db: Session, run: BacktestRun):
        req = run.request
        user = db.get(User, run.user_id)
        sessions, specs = user_sessions(user.settings), load_specs(db)
        cfg = _bt_config(req, sessions)
        saved = {c.plan_id: c.params for c in db.query(StrategyConfig).filter_by(user_id=user.id, is_current=True)}
        items, missing = [], []
        for plan in _plans(req):
            df = store.load(db, plan.symbol, plan.timeframe, run.data_source, _parse_ts(req.get("start")),
                            _parse_ts(req.get("end")))
            if len(df) < 300:
                missing.append(f"{plan.symbol} {plan.timeframe}")
                continue
            items.append(PlanData(plan, df, specs[plan.symbol], saved.get(plan.plan_id, {})))
        if not items:
            raise ValueError(f"No candle data in source '{run.data_source}' for: {sorted(set(missing))}. "
                             "Import data first; results are never simulated without data.")
        if req.get("oos_fraction"):
            first = min(i.df.index[0] for i in items)
            last = max(i.df.index[-1] for i in items)
            cfg.oos_start = first + (last - first) * (1 - float(req["oos_fraction"]))
        res = run_backtest(items, cfg)
        report = metrics.full_report(res.trades, cfg.initial_balance)
        report |= {"rejections": res.rejections, "signals_total": res.signals_total, "data_range": res.data_range,
                   "missing_data": sorted(set(missing)), "plans": [i.plan.plan_id for i in items],
                   "oos_start": cfg.oos_start.isoformat() if cfg.oos_start is not None else None,
                   "assumptions": {"fill": "next candle open; mid +/- half spread + slippage",
                                   "intrabar": "if stop and target are both inside one candle, the stop is assumed first",
                                   "equity": "closed-trade equity (open-trade excursions are bounded by the stop)",
                                   "cost_multiplier": cfg.cost_multiplier}}
        db.add(BacktestResult(run_id=run.id, plan_id=None, summary=metrics.clean(report["summary"]),
                              report=metrics.clean(report), trades=_trade_rows(res.trades)))
    _guard(run_id, body)


def _max_dd_r(trades: list[dict]) -> float:
    if not trades:
        return 0.0
    curve = np.concatenate([[0.0], np.cumsum([t["r"] for t in trades])])
    return float((np.maximum.accumulate(curve) - curve).max())


def run_research_job(run_id: int) -> None:
    def body(db: Session, run: BacktestRun):
        req = run.request
        user = db.get(User, run.user_id)
        sessions, specs = user_sessions(user.settings), load_specs(db)
        cfg = _bt_config(req, sessions)
        crit = SelectionCriteria(**{k: v for k, v in (req.get("criteria") or {}).items()
                                    if k in SelectionCriteria.__dataclass_fields__})
        plans, reports, skipped = _plans(req), [], []
        for n, plan in enumerate(plans):
            df = store.load(db, plan.symbol, plan.timeframe, run.data_source, _parse_ts(req.get("start")),
                            _parse_ts(req.get("end")))
            if len(df) < 3000:
                skipped.append({"plan_id": plan.plan_id, "reason": f"only {len(df)} candles (need >= 3000)"})
                continue
            rep = research_plan(plan, df, specs[plan.symbol], cfg, crit, bool(req.get("walk_forward", True)))
            rep["data_source"], rep["synthetic"] = run.data_source, run.is_synthetic
            reports.append(rep)
            run.progress = (n + 1) / len(plans)
            db.commit()
        if not reports:
            raise ValueError(f"No plan had enough data in source '{run.data_source}'. Skipped: {skipped[:5]}")
        for rep in rank(reports):
            clean = metrics.clean(rep)
            db.add(BacktestResult(run_id=run.id, plan_id=rep["plan_id"], trades=[], report=clean, summary={
                "verdict": rep["verdict"], "failures": rep["failures"] + rep["oos_failures"],
                "train": metrics.clean(rep["train"]), "out_of_sample": metrics.clean(rep["out_of_sample"]),
                "param_stability": rep["param_stability"]}))
            _apply_validation(db, user.id, rep, run)
        db.add(BacktestResult(run_id=run.id, plan_id=None, trades=[], report={"skipped": skipped}, summary={
            "candidates": len(reports), "passed": sum(r["verdict"] == "passed" for r in reports),
            "skipped": len(skipped)}))
    _guard(run_id, body)


def _apply_validation(db: Session, user_id: int, rep: dict, run: BacktestRun) -> StrategyConfig:
    """Versioned strategy configuration: a changed parameter set or a
    revalidation creates a NEW version, which always starts disabled."""
    cur = db.query(StrategyConfig).filter_by(user_id=user_id, plan_id=rep["plan_id"], is_current=True).first()
    tr = rep["train"]
    m = {"expectancy_r": tr["expectancy_r"], "profit_factor": tr["profit_factor"], "win_rate": tr["win_rate"],
         "max_drawdown_pct": tr["max_drawdown_pct"], "trades": tr["trades"],
         "oos_expectancy_r": rep["out_of_sample"]["expectancy_r"], "oos_trades": rep["out_of_sample"]["trades"],
         "oos_profit_factor": rep["out_of_sample"]["profit_factor"], "param_stability": rep["param_stability"],
         "max_drawdown_r": None, "validated_at": utcnow().isoformat(), "data_source": run.data_source,
         "data_start": rep["data_start"], "data_end": rep["data_end"], "failures": rep["failures"] + rep["oos_failures"]}
    m = metrics.clean(m)
    status = "passed" if rep["verdict"] == "passed" else "failed"
    same = cur is not None and cur.params == rep["params"] and cur.validation_status not in ("needs_revalidation",)
    if same:
        if cur.validation_status == "passed" and status == "failed" and cur.enabled:
            cur.enabled, cur.status = False, "candidate"
        cur.validation_status, cur.validation_source, cur.validation_run_id, cur.metrics = status, run.data_source, run.id, m
        return cur
    version = 1
    if cur is not None:
        cur.is_current, cur.enabled = False, False
        version = cur.version + 1
    plan = plan_from_id(rep["plan_id"])
    new = StrategyConfig(user_id=user_id, plan_id=rep["plan_id"], engine=plan.engine, strategy_key=plan.strategy,
                         label=plan.label, symbol=plan.symbol, timeframe=plan.timeframe, params=rep["params"],
                         version=version, enabled=False, status="candidate", validation_status=status,
                         validation_source=run.data_source, validation_run_id=run.id, metrics=m)
    db.add(new)
    return new


def run_replay(db: Session, account: Account, symbols: list[str], timeframe: str, source: str,
               start: datetime | None = None, end: datetime | None = None, max_hold_minutes: int = 1440) -> dict:
    """Forward-simulate the PAPER engine over stored candles, bar by bar, using
    the live order path (journal, risk engine, positions, notifications).
    Replayed results never count as forward-test evidence for live trading."""
    if account.mode != "paper":
        raise ValueError("Replay is only available for paper accounts")
    user = db.get(User, account.user_id)
    svc = TradingService(db, account, sessions=user_sessions(user.settings), max_hold_minutes=max_hold_minutes)
    account.feed = {"type": "replay", "source": source, "replay_used": True, "synthetic": is_synthetic(source)}
    frames, sigs = {}, {}
    for sym in symbols:
        df = store.load(db, sym, timeframe, source, start, end)
        if len(df) < 300:
            continue
        frames[sym] = df
        for cfg in svc.active_configs(sym, timeframe):
            # Signals are precomputed on the full frame. This is equivalent to bar-by-bar
            # evaluation because generation is causal (tests/test_lookahead.py proves it).
            sigs[(sym, cfg.id)] = (cfg, plan_from_id(cfg.plan_id).generate(df, svc.specs[sym], svc.sessions, cfg.params))
    if not frames:
        raise ValueError(f"No candles for {symbols} {timeframe} in source '{source}'")
    minutes = {s: int((f.index[1] - f.index[0]).total_seconds() // 60) for s, f in frames.items()}
    timeline = sorted({(ts, s) for s, f in frames.items() for ts in f.index})
    pos = {s: 0 for s in frames}
    pending: dict[str, list] = {s: [] for s in frames}
    stats = {"bars": 0, "signals": 0}
    for ts, sym in timeline:
        f = frames[sym]
        i = pos[sym]
        pos[sym] += 1
        row = f.iloc[i]
        spread = float(row["spread"]) if "spread" in f.columns and pd.notna(row.get("spread")) else svc.specs[sym].typical_spread
        t = ts.to_pydatetime()
        svc.on_bar_open(sym, float(row["open"]), spread, t)
        for cfg, sig in pending[sym]:
            q = Quote(sym, float(row["open"]) - spread / 2, float(row["open"]) + spread / 2, t, "replay")
            svc.execute_signal(cfg, sig, q, t, data_source=source, data_age_seconds=0.0)
            stats["signals"] += 1
        pending[sym] = []
        svc.on_bar(sym, float(row["open"]), float(row["high"]), float(row["low"]), float(row["close"]), spread, t,
                   minutes[sym])
        for (s2, _), (cfg, sg) in sigs.items():
            if s2 == sym and int(sg["side"].iloc[i]) != 0:
                r = sg.iloc[i]
                pending[sym].append((cfg, {"side": int(r["side"]), "sl": float(r["sl"]), "rr": float(r["rr"]),
                                           "score": None if pd.isna(r["score"]) else float(r["score"]),
                                           "reason": str(r["reason"]), "candle_ts": t, "price": float(row["close"])}))
        stats["bars"] += 1
        if stats["bars"] % 2000 == 0:
            db.commit()
    db.commit()
    return stats | {"account_id": account.id, "balance": account.balance, "equity": account.equity,
                    "source": source, "synthetic": is_synthetic(source), "code_version": __version__}
