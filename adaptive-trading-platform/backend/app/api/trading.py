from __future__ import annotations

from datetime import datetime, timedelta

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import jobs, runner
from ..core import ai, metrics
from ..core.risk import REASONS, RiskConfig
from ..core.sessions import IST, session_to_dict
from ..core.trading import TradingService, ist_day, user_sessions
from ..data.synthetic import is_synthetic
from ..db import get_db, utcnow
from ..models import (Account, AccountSnapshot, DailyPerformance, Position, RejectedSignal, RiskEvent, Signal,
                      StrategyConfig, Trade, User)
from ..security import audit, current_user, owned_account, require_role

router = APIRouter(tags=["trading"])


def account_out(a: Account, db: Session) -> dict:
    opens = db.query(Position).filter(Position.account_id == a.id, Position.status.in_(("open", "closing"))).all()
    used = sum(p.margin_usd for p in opens)
    return {"id": a.id, "name": a.name, "mode": a.mode, "currency": a.currency, "balance": a.balance,
            "equity": a.equity, "initial_balance": a.initial_balance, "margin_used": used,
            "free_margin": a.equity - used, "open_positions": len(opens),
            "drawdown_pct": (a.peak_equity - a.equity) / a.peak_equity * 100 if a.peak_equity else 0.0,
            "kill_switch": a.kill_switch, "halted_reason": a.halted_reason, "streak_locked": a.streak_locked,
            "consecutive_losses": a.consecutive_losses, "trading_enabled": a.trading_enabled,
            "live_enabled": a.live_enabled, "feed": a.feed, "risk_config": RiskConfig.from_dict(a.risk_config).to_dict(),
            "daily_pnl": a.equity - a.day_start_equity if a.day_key == ist_day(utcnow()) else 0.0}


def trade_out(t: Trade) -> dict:
    return {"id": t.id, "plan_id": t.plan_id, "symbol": t.symbol, "timeframe": t.timeframe, "session": t.session,
            "side": t.side, "volume": t.volume, "entry_price": t.entry_price, "exit_price": t.exit_price,
            "sl": t.sl, "tp": t.tp, "opened_at": t.opened_at, "closed_at": t.closed_at, "gross": t.gross,
            "commission": t.commission, "financing": t.financing, "pnl": t.pnl, "risk_usd": t.risk_usd,
            "r_multiple": t.r_multiple, "exit_reason": t.exit_reason, "mode": t.mode}


def position_out(p: Position) -> dict:
    return {"id": p.id, "plan_id": p.plan_id, "symbol": p.symbol, "side": p.side, "volume": p.volume,
            "entry_price": p.entry_price, "last_price": p.last_price, "sl": p.sl, "tp": p.tp,
            "floating_pnl": p.floating_pnl, "risk_usd": p.risk_usd, "margin_usd": p.margin_usd,
            "status": p.status, "opened_at": p.opened_at, "mode": p.mode}


class AccountCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    initial_balance: float = Field(default=300.0, gt=0, le=10_000_000)


class RiskPatch(BaseModel):
    risk_per_trade: float | None = None
    max_daily_loss: float | None = None
    max_positions: int | None = None
    max_consecutive_losses: int | None = None
    min_rr: float | None = None
    max_portfolio_risk: float | None = None
    max_correlated_positions: int | None = None
    kill_switch_policy: str | None = None
    loss_streak_reset: str | None = None


class KillIn(BaseModel):
    on: bool


class TradingIn(BaseModel):
    enabled: bool
    feed: str | None = Field(default=None, pattern="^(binance|mt5)$")
    connection_id: int | None = None


class ReplayIn(BaseModel):
    symbols: list[str]
    timeframe: str
    source: str
    start: str | None = None
    end: str | None = None


@router.get("/accounts")
def list_accounts(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return [account_out(a, db) for a in db.query(Account).filter_by(user_id=user.id).order_by(Account.id)]


@router.post("/accounts", status_code=201)
def create_paper_account(body: AccountCreate, user: User = Depends(require_role("trader")), db: Session = Depends(get_db)):
    b = body.initial_balance
    a = Account(user_id=user.id, name=body.name, mode="paper", initial_balance=b, balance=b, equity=b,
                peak_equity=b, day_start_equity=b)
    db.add(a)
    audit(db, "admin", "paper_account_created", user.id, initial_balance=b)
    db.commit()
    return account_out(a, db)


@router.get("/accounts/{account_id}")
def get_account(account_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return account_out(owned_account(db, user, account_id), db)


@router.patch("/accounts/{account_id}/risk")
def patch_risk(account_id: int, body: RiskPatch, user: User = Depends(require_role("trader")),
               db: Session = Depends(get_db)):
    a = owned_account(db, user, account_id)
    merged = {**RiskConfig.from_dict(a.risk_config).to_dict(), **body.model_dump(exclude_none=True)}
    try:
        cfg = RiskConfig.from_dict(merged)
    except (ValueError, TypeError) as e:
        raise HTTPException(422, str(e)) from e
    a.risk_config = cfg.to_dict()
    audit(db, "risk", "risk_config_changed", user.id, a.id, changes=body.model_dump(exclude_none=True))
    db.commit()
    return account_out(a, db)


@router.post("/accounts/{account_id}/reset")
def reset_paper(account_id: int, body: AccountCreate, user: User = Depends(require_role("trader")),
                db: Session = Depends(get_db)):
    a = owned_account(db, user, account_id)
    if a.mode != "paper":
        raise HTTPException(400, "Only paper accounts can be reset")
    for model in (Trade, Position):
        db.query(model).filter_by(account_id=a.id).delete()
    from ..models import Order
    db.query(Order).filter_by(account_id=a.id).delete()
    for model in (RejectedSignal, Signal, AccountSnapshot, DailyPerformance, RiskEvent):
        db.query(model).filter_by(account_id=a.id).delete()
    b = body.initial_balance
    a.name, a.initial_balance, a.balance, a.equity, a.peak_equity, a.day_start_equity = body.name, b, b, b, b, b
    a.realized_today, a.consecutive_losses, a.streak_locked, a.day_key = 0.0, 0, False, 0
    a.kill_switch, a.halted_reason, a.feed, a.trading_enabled = False, None, {}, False
    audit(db, "admin", "paper_account_reset", user.id, a.id, initial_balance=b)
    db.commit()
    return account_out(a, db)


@router.post("/accounts/{account_id}/kill-switch")
def kill_switch(account_id: int, body: KillIn, user: User = Depends(require_role("trader")),
                db: Session = Depends(get_db)):
    a = owned_account(db, user, account_id)
    adapter = None
    if a.mode == "live":
        from ..brokers.registry import build_adapter
        from ..models import BrokerConnection
        adapter = build_adapter(db.get(BrokerConnection, a.broker_connection_id))
    svc = TradingService(db, a, adapter, sessions=user_sessions(user.settings))
    for p in svc.open_positions():
        q = runner.latest_quote(p.symbol)
        if q:
            svc.quotes[p.symbol] = q
    res = svc.set_kill_switch(body.on, utcnow(), user.id)
    db.commit()
    return res | {"account": account_out(a, db)}


@router.post("/emergency-stop")
def emergency_stop(user: User = Depends(require_role("trader")), db: Session = Depends(get_db)):
    """Global stop: kill switch on EVERY account of this user, automation off, live disabled."""
    from ..core import live_gate
    out = []
    for a in db.query(Account).filter_by(user_id=user.id):
        a.kill_switch, a.trading_enabled = True, False
        live_gate.disable(db, a, "emergency stop")
        audit(db, "risk", "emergency_stop", user.id, a.id, level="crit")
        out.append(a.id)
    db.commit()
    return {"stopped_accounts": out, "note": "New orders are blocked on all accounts. Open positions were not "
            "closed by this action; use the per-account kill switch policy or close them manually."}


@router.post("/accounts/{account_id}/trading")
def set_trading(account_id: int, body: TradingIn, user: User = Depends(require_role("trader")),
                db: Session = Depends(get_db)):
    a = owned_account(db, user, account_id)
    if body.enabled:
        if a.mode == "live" and not a.live_enabled:
            raise HTTPException(409, "Live trading must be enabled through the two-step activation first")
        if body.feed is None and (a.feed or {}).get("type") not in ("binance", "mt5"):
            raise HTTPException(422, "Choose a real-time market-data feed: binance or mt5")
        if body.feed:
            a.feed = {**(a.feed or {}), "type": body.feed, "connection_id": body.connection_id}
    a.trading_enabled = body.enabled
    audit(db, "admin", "automation_on" if body.enabled else "automation_off", user.id, a.id, feed=a.feed)
    db.commit()
    return account_out(a, db)


@router.post("/accounts/{account_id}/replay")
def replay(account_id: int, body: ReplayIn, user: User = Depends(require_role("trader")), db: Session = Depends(get_db)):
    a = owned_account(db, user, account_id)
    if a.mode != "paper":
        raise HTTPException(400, "Replay is only available for paper accounts")
    try:
        res = jobs.run_replay(db, a, body.symbols, body.timeframe, body.source, jobs._parse_ts(body.start),
                              jobs._parse_ts(body.end))
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    return res


@router.get("/accounts/{account_id}/positions")
def positions(account_id: int, status: str = "open", user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = owned_account(db, user, account_id)
    q = db.query(Position).filter_by(account_id=a.id)
    q = q.filter(Position.status.in_(("open", "closing"))) if status == "open" else q
    return [position_out(p) for p in q.order_by(Position.id.desc()).limit(500)]


@router.post("/positions/{position_id}/close")
def close_position(position_id: int, user: User = Depends(require_role("trader")), db: Session = Depends(get_db)):
    p = db.get(Position, position_id)
    if not p:
        raise HTTPException(404, "Position not found")
    a = owned_account(db, user, p.account_id)
    if p.status == "closed":
        raise HTTPException(409, "Position already closed")
    if a.mode != "paper":
        raise HTTPException(400, "Manual close through this endpoint is paper-only; use the kill switch for live")
    q = runner.latest_quote(p.symbol, 120)
    if q is None:
        raise HTTPException(503, f"No current market price for {p.symbol}: cannot close now. Data unavailable.")
    svc = TradingService(db, a, sessions=user_sessions(user.settings))
    t = svc.close_position(p, q.bid if p.side == "buy" else q.ask, "manual", utcnow())
    db.commit()
    return trade_out(t)


def _trade_query(db, a, symbol, plan_id, session, timeframe, start, end, result):
    q = db.query(Trade).filter_by(account_id=a.id)
    if symbol:
        q = q.filter(Trade.symbol == symbol)
    if plan_id:
        q = q.filter(Trade.plan_id == plan_id)
    if session:
        q = q.filter(Trade.session == session)
    if timeframe:
        q = q.filter(Trade.timeframe == timeframe)
    if start:
        q = q.filter(Trade.closed_at >= start)
    if end:
        q = q.filter(Trade.closed_at <= end)
    if result == "win":
        q = q.filter(Trade.pnl > 0)
    elif result == "loss":
        q = q.filter(Trade.pnl <= 0)
    return q


@router.get("/accounts/{account_id}/trades")
def trades(account_id: int, symbol: str | None = None, plan_id: str | None = None, session: str | None = None,
           timeframe: str | None = None, start: datetime | None = None, end: datetime | None = None,
           result: str | None = Query(default=None, pattern="^(win|loss)$"), limit: int = Query(200, le=2000),
           offset: int = 0, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = owned_account(db, user, account_id)
    q = _trade_query(db, a, symbol, plan_id, session, timeframe, start, end, result)
    return {"total": q.count(), "items": [trade_out(t) for t in q.order_by(Trade.closed_at.desc()).offset(offset).limit(limit)]}


@router.get("/accounts/{account_id}/journal")
def journal(account_id: int, symbol: str | None = None, plan_id: str | None = None, session: str | None = None,
            timeframe: str | None = None, outcome: str | None = None, start: datetime | None = None,
            end: datetime | None = None, limit: int = Query(200, le=1000), offset: int = 0,
            user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Every generated signal with its outcome, including rejected opportunities and why."""
    a = owned_account(db, user, account_id)
    q = db.query(Signal, RejectedSignal).outerjoin(RejectedSignal, RejectedSignal.signal_id == Signal.id).filter(
        Signal.account_id == a.id)
    for col, val in ((Signal.symbol, symbol), (Signal.plan_id, plan_id), (Signal.session, session),
                     (Signal.timeframe, timeframe), (Signal.outcome, outcome)):
        if val:
            q = q.filter(col == val)
    if start:
        q = q.filter(Signal.candle_ts >= start)
    if end:
        q = q.filter(Signal.candle_ts <= end)
    total = q.count()
    items = []
    for s, r in q.order_by(Signal.candle_ts.desc(), Signal.id.desc()).offset(offset).limit(limit):
        d = {"id": s.id, "plan_id": s.plan_id, "symbol": s.symbol, "timeframe": s.timeframe, "session": s.session,
             "side": s.side, "candle_ts": s.candle_ts, "price": s.price, "sl": s.sl, "tp": s.tp,
             "rr_target": s.rr_target, "score": s.score, "reason": s.reason, "outcome": s.outcome,
             "data_source": s.data_source, "synthetic": is_synthetic(s.data_source)}
        rej = None
        if r:
            rej = {"reasons": r.reasons, "explanations": [REASONS.get(x, x) for x in r.reasons], "detail": r.detail}
        d["rejection"] = rej
        d["explanation"] = ai.explain_signal({**d, "candle_ts": s.candle_ts.astimezone(IST).strftime("%d %b %H:%M IST")}, rej)
        items.append(d)
    return {"total": total, "items": items}


@router.get("/accounts/{account_id}/analytics")
def analytics(account_id: int, start: datetime | None = None, end: datetime | None = None,
              user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = owned_account(db, user, account_id)
    rows = _trade_query(db, a, None, None, None, None, start, end, None).order_by(Trade.closed_at).all()
    tr = [{"plan_id": t.plan_id, "engine": t.session or "n/a", "symbol": t.symbol, "pnl": t.pnl,
           "r": t.r_multiple or 0.0, "exit_time": pd.Timestamp(t.closed_at), "commission": t.commission,
           "spread_cost": 0.0, "financing": t.financing, "gross": t.gross, "exit_reason": t.exit_reason,
           "hold_minutes": (t.closed_at - t.opened_at).total_seconds() / 60, "vol_regime": "n/a",
           "segment": "unsplit"} for t in rows]
    rep = metrics.clean(metrics.full_report(tr, a.initial_balance))
    rep["account"] = {"id": a.id, "mode": a.mode, "feed": a.feed}
    rep["synthetic"] = bool((a.feed or {}).get("synthetic"))
    snaps = db.query(AccountSnapshot).filter_by(account_id=a.id).order_by(AccountSnapshot.ts.desc()).limit(500).all()
    rep["equity_snapshots"] = [{"t": s.ts, "equity": s.equity, "balance": s.balance} for s in snaps[::-1]]
    return rep


@router.get("/accounts/{account_id}/risk-events")
def risk_events(account_id: int, limit: int = Query(100, le=500), user: User = Depends(current_user),
                db: Session = Depends(get_db)):
    a = owned_account(db, user, account_id)
    rows = db.query(RiskEvent).filter_by(account_id=a.id).order_by(RiskEvent.id.desc()).limit(limit)
    return [{"id": r.id, "kind": r.kind, "severity": r.severity, "message": r.message, "detail": r.detail,
             "created_at": r.created_at} for r in rows]


@router.get("/accounts/{account_id}/reports/{period}")
def report(account_id: int, period: str, narrate: bool = False, user: User = Depends(current_user),
           db: Session = Depends(get_db)):
    if period not in ("daily", "weekly"):
        raise HTTPException(404, "period must be daily or weekly")
    a = owned_account(db, user, account_id)
    now = utcnow().astimezone(IST)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "weekly":
        start -= timedelta(days=now.weekday())
    rows = db.query(Trade).filter(Trade.account_id == a.id, Trade.closed_at >= start).all()
    facts = ai.performance_report([trade_out(t) for t in rows], "day" if period == "daily" else "week",
                                  a.day_start_equity if period == "daily" else a.initial_balance)
    facts |= {"account_mode": a.mode, "from": start.isoformat(), "generated_by": "rules"}
    suspended = db.query(StrategyConfig).filter_by(user_id=user.id, status="suspended", is_current=True).all()
    facts["deteriorating_strategies"] = [{"plan_id": c.plan_id, "reason": c.suspended_reason} for c in suspended]
    facts["narrative"] = ai.narrate(metrics.clean(facts), f"Write the {period} performance briefing.") if narrate else None
    return metrics.clean(facts)


@router.get("/dashboard")
def dashboard(account_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = owned_account(db, user, account_id)
    now = utcnow()
    ist_now = now.astimezone(IST)
    day0 = ist_now.replace(hour=0, minute=0, second=0, microsecond=0)

    def pnl_since(t0):
        return float(sum(t.pnl for t in db.query(Trade).filter(Trade.account_id == a.id, Trade.closed_at >= t0)))

    sess = user_sessions(user.settings)
    cfgs = db.query(StrategyConfig).filter_by(user_id=user.id, is_current=True).all()
    recent = (db.query(Signal, RejectedSignal).outerjoin(RejectedSignal, RejectedSignal.signal_id == Signal.id)
              .filter(Signal.account_id == a.id, Signal.created_at >= now - timedelta(hours=6))
              .order_by(Signal.id.desc()).limit(10).all())
    valid = [{"id": s.id, "plan_id": s.plan_id, "symbol": s.symbol, "side": s.side, "timeframe": s.timeframe,
              "reason": s.reason, "candle_ts": s.candle_ts, "outcome": s.outcome, "rr_target": s.rr_target}
             for s, r in recent if r is None]
    acct = account_out(a, db)
    floating = acct["equity"] - acct["balance"]
    return {
        "account": acct, "server_time": now, "ist_time": ist_now.strftime("%Y-%m-%d %H:%M:%S"),
        "pnl": {"daily": pnl_since(day0) + floating, "weekly": pnl_since(day0 - timedelta(days=ist_now.weekday())) + floating,
                "monthly": pnl_since(day0.replace(day=1)) + floating, "floating": floating},
        "sessions": [session_to_dict(s, now) for s in sess.values()],
        "active_session": next((s.name for s in sess.values() if s.is_active(now)), None),
        "positions": [position_out(p) for p in db.query(Position).filter(Position.account_id == a.id,
                      Position.status.in_(("open", "closing")))],
        "opportunities": valid,
        "opportunity_message": None if valid else "NO VALID SETUP — WAIT.",
        "rejected_recent": [{"plan_id": s.plan_id, "symbol": s.symbol, "reasons": r.reasons,
                             "candle_ts": s.candle_ts} for s, r in recent if r is not None][:5],
        "strategy_health": {"enabled": sum(c.enabled for c in cfgs), "suspended": sum(c.status == "suspended" for c in cfgs),
                            "validated": sum(c.validation_status == "passed" for c in cfgs), "total": len(cfgs),
                            "warnings": [{"plan_id": c.plan_id, "flags": (c.health or {}).get("flags", [])}
                                         for c in cfgs if (c.health or {}).get("status") in ("warning", "suspend")]},
        "market_status": {"feed": (a.feed or {}).get("type") or "none", "automation": a.trading_enabled,
                          "data_live": any(runner.latest_quote(c.symbol, 120) for c in cfgs if c.enabled)},
    }
