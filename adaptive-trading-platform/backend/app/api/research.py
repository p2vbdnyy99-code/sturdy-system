from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import __version__, jobs, runner
from ..brokers.base import BrokerError
from ..brokers.binance import BinanceMarketData
from ..config import get_settings
from ..core import ai, indicators as ind, metrics
from ..core.engines import ENGINE_NAMES, candidate_plans
from ..core.instruments import TIMEFRAMES
from ..core.sessions import market_open, session_to_dict
from ..core.strategies.library import STRATEGIES
from ..core.trading import load_specs, user_sessions
from ..data import store, synthetic
from ..db import get_db, utcnow
from ..models import BacktestResult, BacktestRun, Instrument, StrategyConfig, User
from ..security import audit, current_user, require_role

router = APIRouter(tags=["research"])


def _default_source(db: Session, symbol: str) -> str | None:
    """Most recently updated NON-synthetic source for a symbol, if any."""
    rows = [d for d in store.datasets(db) if d["symbol"] == symbol]
    real = [d for d in rows if not d["synthetic"]]
    pick = sorted(real or rows, key=lambda d: d["end"])
    return pick[-1]["source"] if pick else None


@router.get("/sessions")
def sessions(user: User = Depends(current_user)):
    now = utcnow()
    return [session_to_dict(s, now) for s in user_sessions(user.settings).values()]


@router.get("/markets")
def markets(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Never fabricates a price: an instrument without a real-time quote is
    reported as not live, with the last stored candle (and its source) if any."""
    now, out = utcnow(), []
    sess = user_sessions(user.settings)
    active = [s.key for s in sess.values() if s.is_active(now)]
    cfgs = db.query(StrategyConfig).filter_by(user_id=user.id, is_current=True).all()
    for inst in db.query(Instrument).order_by(Instrument.id):
        spec = load_specs(db)[inst.symbol]
        row = {"symbol": inst.symbol, "name": spec.display_name, "asset_class": inst.asset_class,
               "enabled": inst.enabled, "market_open": market_open(spec.trades_weekend, now),
               "spec_verified": inst.spec_verified, "active_sessions": active, "live": False, "bid": None,
               "ask": None, "price": None, "spread": None, "as_of": None, "source": None, "daily_change_pct": None,
               "volatility": None, "trend": None,
               "strategies": {"enabled": sum(c.enabled and c.symbol == inst.symbol for c in cfgs),
                              "validated": sum(c.validation_status == "passed" and c.symbol == inst.symbol for c in cfgs)}}
        q = runner.latest_quote(inst.symbol, get_settings().quote_stale_seconds)
        if q:
            row |= {"live": True, "bid": q.bid, "ask": q.ask, "price": q.mid, "spread": q.spread,
                    "as_of": q.ts, "source": q.source}
        src = _default_source(db, inst.symbol)
        if src:
            df = store.load(db, inst.symbol, "H1", src, limit=300)
            if len(df) >= 30:
                snap = ai.market_snapshot(df, inst.symbol, "H1", src)
                last = df.index[-1]
                day_ago = df[df.index <= last - timedelta(hours=24)]
                row |= {"source": row["source"] or src, "synthetic": synthetic.is_synthetic(src),
                        "as_of": row["as_of"] or last, "price": row["price"] or float(df["close"].iloc[-1]),
                        "stale_seconds": None if row["live"] else (now - last.to_pydatetime()).total_seconds(),
                        "daily_change_pct": (float(df["close"].iloc[-1] / day_ago["close"].iloc[-1] - 1) * 100
                                             if len(day_ago) else None),
                        "volatility": snap.get("volatility_state"), "trend": snap.get("trend"),
                        "atr": float(ind.atr(df).iloc[-1])}
        if row["price"] is None:
            row["message"] = "Market data unavailable"
        out.append(row)
    return out


@router.get("/markets/{symbol}/candles")
def candles(symbol: str, timeframe: str = "M15", source: str | None = None, limit: int = Query(300, le=2000),
            user: User = Depends(current_user), db: Session = Depends(get_db)):
    if timeframe not in TIMEFRAMES:
        raise HTTPException(422, "Unknown timeframe")
    src = source or _default_source(db, symbol)
    if not src:
        return {"symbol": symbol, "timeframe": timeframe, "available": False, "candles": [],
                "message": "Market data unavailable: no candles stored for this instrument."}
    df = store.load(db, symbol, timeframe, src, limit=limit)
    out = df.reset_index(names="t")
    e20, e50 = ind.ema(df["close"], 20), ind.ema(df["close"], 50)
    return {"symbol": symbol, "timeframe": timeframe, "source": src, "synthetic": synthetic.is_synthetic(src),
            "available": len(df) > 0,
            "candles": [{"t": r.t.isoformat(), "o": r.open, "h": r.high, "l": r.low, "c": r.close, "v": r.volume}
                        for r in out.itertuples()],
            "ema20": metrics.clean(list(e20)), "ema50": metrics.clean(list(e50))}


@router.get("/markets/{symbol}/analysis")
def analysis(symbol: str, timeframe: str = "H1", source: str | None = None, narrate: bool = False,
             user: User = Depends(current_user), db: Session = Depends(get_db)):
    src = source or _default_source(db, symbol)
    if not src:
        return ai.UNAVAILABLE | {"symbol": symbol, "timeframe": timeframe}
    snap = ai.market_snapshot(store.load(db, symbol, timeframe, src, limit=800), symbol, timeframe, src)
    snap["synthetic"] = synthetic.is_synthetic(src)
    snap["generated_by"] = "rules"
    if narrate and snap.get("available") and not snap["synthetic"]:
        snap["narrative"] = ai.narrate(metrics.clean(snap), "Summarise current market conditions and list conflicts.")
    return metrics.clean(snap)


# ------------------------------------------------------------------ data ingestion
@router.get("/data/datasets")
def list_datasets(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return store.datasets(db)


@router.post("/data/import/csv")
async def import_csv(symbol: str = Form(...), source_name: str = Form(..., min_length=1, max_length=32),
                     timeframe: str | None = Form(None), tz: str = Form("UTC"), file: UploadFile = File(...),
                     user: User = Depends(require_role("trader")), db: Session = Depends(get_db)):
    specs = load_specs(db)
    if symbol not in specs:
        raise HTTPException(422, f"Unknown instrument {symbol}")
    if source_name.lower().startswith("synthetic"):
        raise HTTPException(422, "The 'synthetic' source prefix is reserved for generated test data")
    raw = await file.read()
    if len(raw) > 200 * 1024 * 1024:
        raise HTTPException(413, "File too large (200 MB max)")
    try:
        df = store.parse_csv(raw, tz)
        tf = timeframe or store.detect_timeframe(df)
        if tf not in TIMEFRAMES:
            raise store.DataError("unknown timeframe")
        n = store.upsert(db, symbol, tf, f"csv:{source_name}", df)
    except (store.DataError, ValueError, KeyError) as e:
        raise HTTPException(422, f"CSV rejected: {e}") from e
    audit(db, "admin", "csv_import", user.id, symbol=symbol, timeframe=tf, rows=n, source=f"csv:{source_name}")
    db.commit()
    return {"symbol": symbol, "timeframe": tf, "source": f"csv:{source_name}", "candles": n,
            "start": df.index[0], "end": df.index[-1]}


class ProviderImport(BaseModel):
    symbol: str
    timeframe: str = "M5"
    days: int = Field(default=90, ge=1, le=1500)
    connection_id: int | None = None


@router.post("/data/import/binance")
def import_binance(body: ProviderImport, user: User = Depends(require_role("trader")), db: Session = Depends(get_db)):
    if body.symbol != "BTCUSDT":
        raise HTTPException(422, "The Binance provider supplies BTCUSDT only")
    md = BinanceMarketData(get_settings().binance_base_url)
    try:
        end = utcnow()
        df = md.history(body.symbol, body.timeframe, end - timedelta(days=body.days), end)
    except BrokerError as e:
        raise HTTPException(503, f"Historical data unavailable: {e}") from e
    finally:
        md.close()
    if df.empty:
        raise HTTPException(503, "Provider returned no candles")
    n = store.upsert(db, body.symbol, body.timeframe, "binance", df)
    db.commit()
    return {"symbol": body.symbol, "timeframe": body.timeframe, "source": "binance", "candles": n,
            "start": df.index[0], "end": df.index[-1]}


@router.post("/data/import/mt5")
def import_mt5(body: ProviderImport, user: User = Depends(require_role("trader")), db: Session = Depends(get_db)):
    from ..brokers.registry import build_adapter
    from ..models import BrokerConnection
    conn = db.get(BrokerConnection, body.connection_id) if body.connection_id else None
    if not conn or conn.user_id != user.id:
        raise HTTPException(404, "Broker connection not found")
    adapter = build_adapter(conn)
    try:
        bars = min(50_000, body.days * 1440 // TIMEFRAMES[body.timeframe])
        df = adapter.candles(body.symbol, body.timeframe, limit=bars)
    except BrokerError as e:
        raise HTTPException(503, f"Historical data unavailable: {e}") from e
    finally:
        adapter.close()
    if df is None or df.empty:
        raise HTTPException(503, "Bridge returned no candles")
    spec = load_specs(db)[body.symbol]
    if "spread" in df.columns:
        df["spread"] = df["spread"] * spec.tick_size        # MT5 reports spread in points
    n = store.upsert(db, body.symbol, body.timeframe, "mt5", df[df.index < utcnow() - timedelta(minutes=TIMEFRAMES[body.timeframe])])
    db.commit()
    return {"symbol": body.symbol, "timeframe": body.timeframe, "source": "mt5", "candles": n}


class SyntheticIn(BaseModel):
    symbol: str
    days: int = Field(default=180, ge=10, le=1000)
    seed: int = 1
    name: str = Field(default="demo", pattern="^[a-z0-9_-]{1,16}$")


@router.post("/data/synthetic")
def make_synthetic(body: SyntheticIn, user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    """Generates SYNTHETIC candles for testing the software. Disabled in production.
    The result is stored under a 'synthetic:' source and labelled everywhere."""
    if get_settings().env == "prod":
        raise HTTPException(403, "Synthetic data generation is disabled in production")
    spec = load_specs(db).get(body.symbol)
    if spec is None:
        raise HTTPException(422, "Unknown instrument")
    price = {"XAUUSD": 2400.0, "USDJPY": 150.0, "GBPUSD": 1.27, "AUDUSD": 0.66, "EURUSD": 1.08}.get(body.symbol, 60000.0)
    vol = 0.55 if body.symbol.startswith("BTC") else 0.16 if body.symbol == "XAUUSD" else 0.08
    df = synthetic.generate(body.symbol, days=body.days, price=price, annual_vol=vol, seed=body.seed,
                            weekend=spec.trades_weekend)
    src = f"synthetic:{body.name}"
    n = store.upsert(db, body.symbol, "M5", src, df)
    audit(db, "admin", "synthetic_data_generated", user.id, symbol=body.symbol, rows=n)
    db.commit()
    return {"symbol": body.symbol, "timeframe": "M5", "source": src, "candles": n, "synthetic": True,
            "warning": "SYNTHETIC DATA — not market data. Results derived from it prove nothing about real markets."}


# ----------------------------------------------------------------------- strategies
def cfg_out(c: StrategyConfig) -> dict:
    return {"id": c.id, "plan_id": c.plan_id, "engine": c.engine, "engine_name": ENGINE_NAMES[c.engine],
            "strategy_key": c.strategy_key, "name": STRATEGIES[c.strategy_key].name, "label": c.label,
            "symbol": c.symbol, "timeframe": c.timeframe, "params": c.params, "version": c.version,
            "enabled": c.enabled, "status": c.status, "validation_status": c.validation_status,
            "validation_source": c.validation_source,
            "validated_on_synthetic": synthetic.is_synthetic(c.validation_source), "metrics": c.metrics,
            "health": c.health, "suspended_reason": c.suspended_reason}


@router.get("/strategies/catalogue")
def catalogue(user: User = Depends(current_user)):
    return {"strategies": [{"key": s.key, "name": s.name, "description": s.description,
                            "indicators": list(s.indicators_used), "default_params": s.default_params,
                            "param_grid": s.param_grid} for s in STRATEGIES.values()],
            "engines": [{"key": k, "name": v, "candidates": [p.plan_id for p in candidate_plans(k)]}
                        for k, v in ENGINE_NAMES.items()],
            "note": "Candidates carry no claim of profitability until validated on real data."}


@router.get("/strategies")
def strategies(include_history: bool = False, user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = db.query(StrategyConfig).filter_by(user_id=user.id)
    if not include_history:
        q = q.filter_by(is_current=True)
    return [cfg_out(c) for c in q.order_by(StrategyConfig.engine, StrategyConfig.symbol, StrategyConfig.plan_id,
                                           StrategyConfig.version.desc())]


class StrategyPatch(BaseModel):
    enabled: bool


@router.patch("/strategies/{cfg_id}")
def patch_strategy(cfg_id: int, body: StrategyPatch, user: User = Depends(require_role("trader")),
                   db: Session = Depends(get_db)):
    c = db.get(StrategyConfig, cfg_id)
    if not c or c.user_id != user.id:
        raise HTTPException(404, "Strategy not found")
    if body.enabled:
        if not c.is_current:
            raise HTTPException(409, "Only the current version of a strategy can be enabled")
        if c.status == "suspended" or c.validation_status == "needs_revalidation":
            raise HTTPException(409, "This strategy was suspended by the health monitor. Run a new validation; "
                                     "a passing run creates a new version that can be enabled.")
        c.enabled, c.status = True, "active"
    else:
        c.enabled = False
        c.status = "candidate" if c.status == "active" else c.status
    audit(db, "admin", "strategy_enabled" if body.enabled else "strategy_disabled", user.id, plan_id=c.plan_id,
          version=c.version, validation_status=c.validation_status)
    db.commit()
    return cfg_out(c)


# ------------------------------------------------------------------------ backtests
class BacktestIn(BaseModel):
    source: str
    engine: str | None = Field(default=None, pattern="^(asia|london|newyork)$")
    symbols: list[str] | None = None
    timeframes: list[str] | None = None
    plan_ids: list[str] | None = None
    start: str | None = None
    end: str | None = None
    initial_balance: float = Field(default=300.0, gt=0)
    cost_multiplier: float = Field(default=1.0, ge=0.5, le=5)
    max_hold_minutes: int = Field(default=1440, ge=5)
    flat_at_session_end: bool = False
    oos_fraction: float | None = Field(default=0.35, ge=0, le=0.8)
    risk: dict | None = None
    walk_forward: bool = True
    criteria: dict | None = None


def _create_run(db, user, body: BacktestIn, kind: str) -> BacktestRun:
    if not any(d["source"] == body.source for d in store.datasets(db)):
        raise HTTPException(422, f"No dataset with source '{body.source}'. Import data first.")
    run = BacktestRun(user_id=user.id, kind=kind, request=body.model_dump(), data_source=body.source,
                      is_synthetic=synthetic.is_synthetic(body.source), code_version=__version__)
    db.add(run)
    db.commit()
    return run


def run_out(r: BacktestRun) -> dict:
    return {"id": r.id, "kind": r.kind, "status": r.status, "progress": r.progress, "data_source": r.data_source,
            "synthetic": r.is_synthetic, "created_at": r.created_at, "finished_at": r.finished_at, "error": r.error,
            "request": r.request, "code_version": r.code_version,
            "label": "SYNTHETIC DATA — not market history" if r.is_synthetic else None}


@router.post("/backtests", status_code=202)
def start_backtest(body: BacktestIn, user: User = Depends(require_role("trader")), db: Session = Depends(get_db)):
    run = _create_run(db, user, body, "backtest")
    jobs.submit(jobs.run_backtest_job, run.id)
    db.refresh(run)
    return run_out(run)


@router.post("/research", status_code=202)
def start_research(body: BacktestIn, user: User = Depends(require_role("trader")), db: Session = Depends(get_db)):
    """Strategy selection: train-only selection, walk-forward, Monte Carlo,
    cost stress, then a single out-of-sample confirmation per candidate."""
    run = _create_run(db, user, body, "research")
    jobs.submit(jobs.run_research_job, run.id)
    db.refresh(run)
    return run_out(run)


@router.get("/backtests")
def list_runs(user: User = Depends(current_user), db: Session = Depends(get_db)):
    out = []
    for r in db.query(BacktestRun).filter_by(user_id=user.id).order_by(BacktestRun.id.desc()).limit(50):
        d = run_out(r)
        top = db.query(BacktestResult).filter_by(run_id=r.id, plan_id=None).first()
        d["summary"] = top.summary if top else None
        out.append(d)
    return out


@router.get("/backtests/{run_id}")
def get_run(run_id: int, include_trades: bool = False, user: User = Depends(current_user), db: Session = Depends(get_db)):
    r = db.get(BacktestRun, run_id)
    if not r or r.user_id != user.id:
        raise HTTPException(404, "Run not found")
    d = run_out(r)
    res = db.query(BacktestResult).filter_by(run_id=r.id).order_by(BacktestResult.id).all()
    top = next((x for x in res if x.plan_id is None), None)
    d["summary"] = top.summary if top else None
    d["report"] = top.report if top else None
    if include_trades and top:
        d["trades"] = top.trades
    d["candidates"] = [{"plan_id": x.plan_id, **x.summary, "detail": x.report} for x in res if x.plan_id]
    return d
