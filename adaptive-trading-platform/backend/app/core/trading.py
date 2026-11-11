"""Trading service: the single order path for PAPER and LIVE accounts.

signal -> journal -> strategy/market/compliance gates -> RiskEngine -> order
(idempotent client id, persisted before it is sent) -> position -> exit ->
trade -> health monitor. The only difference between modes is the adapter.
"""
from __future__ import annotations

import hashlib
from dataclasses import asdict, fields
from datetime import datetime, timedelta

import pandas as pd
from sqlalchemy.orm import Session

from ..brokers.base import BrokerAdapter, BrokerUnavailable, OrderRejected, OrderRequest, Quote
from ..brokers.paper import PaperBroker
from ..db import utcnow
from ..models import (Account, AccountSnapshot, DailyPerformance, Instrument, Order, Position, RejectedSignal,
                      RiskEvent, Signal, StrategyConfig, Trade)
from ..security import audit
from . import execution as ex
from . import health as health_mod
from .engines import plan_from_id
from .instruments import DEFAULT_SPECS, AssetClass, InstrumentSpec, SpecError
from .notify import notify
from .risk import REASONS, OpenRisk, OrderIntent, PortfolioState, RiskConfig, RiskEngine
from .sessions import DEFAULT_SESSIONS, IST, market_open, session_from_dict


class IsolationError(RuntimeError):
    """Raised when paper and live components are about to be mixed."""


def spec_to_dict(s: InstrumentSpec) -> dict:
    d = asdict(s)
    d["asset_class"] = s.asset_class.value
    return d


def spec_from_dict(d: dict) -> InstrumentSpec:
    names = {f.name for f in fields(InstrumentSpec)}
    kw = {k: v for k, v in d.items() if k in names}
    kw["asset_class"] = AssetClass(kw["asset_class"])
    return InstrumentSpec(**kw)


def seed_instruments(db: Session) -> None:
    have = {i.symbol for i in db.query(Instrument.symbol)}
    for sym, spec in DEFAULT_SPECS.items():
        if sym not in have:
            db.add(Instrument(symbol=sym, asset_class=spec.asset_class.value, spec=spec_to_dict(spec),
                              enabled=sym != "BTCUSDT.P"))


def load_specs(db: Session) -> dict[str, InstrumentSpec]:
    out = dict(DEFAULT_SPECS)
    for inst in db.query(Instrument):
        try:
            out[inst.symbol] = spec_from_dict(inst.spec)
        except Exception:
            out.pop(inst.symbol, None)   # unusable spec: symbol becomes untradable (INVALID_SPEC)
    return out


def user_sessions(user_settings: dict | None) -> dict:
    custom = (user_settings or {}).get("sessions")
    if not custom:
        return DEFAULT_SESSIONS
    return {d["key"]: session_from_dict(d) for d in custom}


def ist_day(ts: datetime) -> int:
    t = ts.astimezone(IST)
    return t.year * 10000 + t.month * 100 + t.day


def client_order_id(account_id: int, plan_id: str, candle_ts: datetime) -> str:
    return hashlib.sha256(f"{account_id}|{plan_id}|{candle_ts.isoformat()}".encode()).hexdigest()[:32]


class TradingService:
    def __init__(self, db: Session, account: Account, adapter: BrokerAdapter | None = None,
                 specs: dict[str, InstrumentSpec] | None = None, sessions: dict | None = None,
                 max_hold_minutes: int = 24 * 60, live_gate=None):
        self.db, self.account = db, account
        self.adapter = adapter if adapter is not None else PaperBroker()
        if self.adapter.mode != account.mode:
            raise IsolationError(f"{self.adapter.mode} adapter cannot serve a {account.mode} account")
        if account.mode == "paper" and account.broker_connection_id is not None:
            raise IsolationError("paper account must not reference a broker connection")
        self.specs = specs if specs is not None else load_specs(db)
        self.sessions = sessions or DEFAULT_SESSIONS
        self.risk = RiskEngine(RiskConfig.from_dict(account.risk_config))
        self.max_hold = timedelta(minutes=max_hold_minutes)
        self.quotes: dict[str, Quote] = {}
        self.live_gate = live_gate            # callable(account) -> list[str] of blocking reasons
        self.cost_multiplier = getattr(self.adapter, "cost_multiplier", 1.0)

    # ------------------------------------------------------------------ state
    def open_positions(self, symbol: str | None = None) -> list[Position]:
        q = self.db.query(Position).filter(Position.account_id == self.account.id,
                                           Position.status.in_(("open", "closing")))
        if symbol:
            q = q.filter(Position.symbol == symbol)
        return q.order_by(Position.id).all()

    def portfolio_state(self) -> PortfolioState:
        a = self.account
        opens = [OpenRisk(p.symbol, 1 if p.side == "buy" else -1, p.volume, p.risk_usd, p.margin_usd,
                          self.specs[p.symbol].correlation_group if p.symbol in self.specs else "")
                 for p in self.open_positions()]
        return PortfolioState(equity=a.equity, balance=a.balance, day_start_equity=a.day_start_equity,
                              realized_today=a.realized_today, consecutive_losses=a.consecutive_losses, open=opens,
                              kill_switch=a.kill_switch, halted=a.halted_reason, streak_locked=a.streak_locked)

    def _recompute_equity(self) -> None:
        a = self.account
        a.equity = a.balance + sum(p.floating_pnl for p in self.open_positions())
        a.peak_equity = max(a.peak_equity, a.equity)

    def roll_day(self, now: datetime) -> None:
        a, key = self.account, ist_day(now)
        if a.day_key == key:
            return
        if a.day_key:
            self._write_daily(a.day_key)
        a.day_key, a.day_start_equity, a.realized_today = key, a.equity, 0.0
        if self.risk.config.loss_streak_reset == "next_day":
            a.consecutive_losses, a.streak_locked = 0, False

    def _write_daily(self, day: int) -> None:
        a = self.account
        start = datetime.strptime(str(day), "%Y%m%d").replace(tzinfo=IST)
        tr = self.db.query(Trade).filter(Trade.account_id == a.id, Trade.closed_at >= start,
                                         Trade.closed_at < start + timedelta(days=1)).all()
        row = self.db.query(DailyPerformance).filter_by(account_id=a.id, day=day).first() or DailyPerformance(
            account_id=a.id, day=day, start_equity=a.day_start_equity, end_equity=a.equity)
        row.end_equity, row.pnl = a.equity, a.equity - a.day_start_equity
        row.trades, row.wins = len(tr), sum(t.pnl > 0 for t in tr)
        row.report = {"realized": sum(t.pnl for t in tr), "by_plan": _group(tr), "mode": a.mode}
        self.db.add(row)

    def snapshot(self, now: datetime, force: bool = False) -> None:
        a = self.account
        last = self.db.query(AccountSnapshot).filter_by(account_id=a.id).order_by(AccountSnapshot.id.desc()).first()
        if not force and last and (now - last.ts) < timedelta(minutes=15):
            return
        opens = self.open_positions()
        self.db.add(AccountSnapshot(account_id=a.id, ts=now, balance=a.balance, equity=a.equity,
                                    margin_used=sum(p.margin_usd for p in opens), open_positions=len(opens)))

    def risk_event(self, kind: str, message: str, severity: str = "warn", **detail) -> None:
        self.db.add(RiskEvent(account_id=self.account.id, kind=kind, message=message, severity=severity, detail=detail))
        audit(self.db, "risk", kind, self.account.user_id, self.account.id, level=severity, message=message, **detail)

    # ------------------------------------------------------------ market data
    def on_quote(self, q: Quote, now: datetime | None = None) -> list[Trade]:
        now = now or q.ts
        self.quotes[q.symbol] = q
        if isinstance(self.adapter, PaperBroker):
            self.adapter.set_quote(q)
        self.roll_day(now)
        closed, spec = [], self.specs.get(q.symbol)
        if spec is None:
            return closed
        for p in self.open_positions(q.symbol):
            side = 1 if p.side == "buy" else -1
            px = q.bid if side > 0 else q.ask
            p.last_price = px
            p.floating_pnl = ex.pnl_usd(spec, side, p.volume, p.entry_price, px, spec.quote_to_usd(q.mid)) - p.entry_commission
            if self.account.mode != "paper":
                continue                       # live exits are executed by the broker (server-side SL/TP)
            hit = ex.exit_on_quote(spec, side, p.sl, p.tp, q.bid, q.ask, self.cost_multiplier)
            if p.status == "closing":
                hit = (px - side * ex.slippage_price(spec, self.cost_multiplier), "kill_switch")
            elif hit is None and now - p.opened_at >= self.max_hold:
                hit = (px - side * ex.slippage_price(spec, self.cost_multiplier), "time_exit")
            if hit:
                closed.append(self.close_position(p, hit[0], hit[1], now))
        self._after_mark(now)
        return closed

    def on_bar_open(self, symbol: str, o: float, spread: float, ts: datetime) -> list[Trade]:
        """Replay only: exits that happen AT the open (time exit / pending close)."""
        spec, closed = self.specs[symbol], []
        for p in self.open_positions(symbol):
            if p.status == "closing" or ts - p.opened_at >= self.max_hold:
                side = 1 if p.side == "buy" else -1
                px = o - side * (spread / 2 + ex.slippage_price(spec, self.cost_multiplier))
                closed.append(self.close_position(p, px, "kill_switch" if p.status == "closing" else "time_exit", ts))
        return closed

    def on_bar(self, symbol: str, o: float, h: float, l: float, c: float, spread: float, ts_open: datetime,
               minutes: int) -> list[Trade]:
        """Replay only: resolve stops/targets inside a candle with the SAME
        conservative rule as the backtester, then mark to the close."""
        if self.account.mode != "paper":
            raise IsolationError("bar replay is a paper-trading facility")
        spec, closed = self.specs[symbol], []
        end = ts_open + timedelta(minutes=minutes)
        self.roll_day(ts_open)
        for p in self.open_positions(symbol):
            side = 1 if p.side == "buy" else -1
            hit = ex.exit_on_bar(spec, side, p.sl, p.tp, o, h, l, spread, self.cost_multiplier)
            if hit:
                closed.append(self.close_position(p, hit[0], hit[1], end))
        q = Quote(symbol, c - spread / 2, c + spread / 2, end, "replay")
        self.quotes[symbol] = q
        if isinstance(self.adapter, PaperBroker):
            self.adapter.set_quote(q)
        for p in self.open_positions(symbol):
            side = 1 if p.side == "buy" else -1
            p.last_price = q.bid if side > 0 else q.ask
            p.floating_pnl = ex.pnl_usd(spec, side, p.volume, p.entry_price, p.last_price,
                                        spec.quote_to_usd(c)) - p.entry_commission
        self._after_mark(end)
        return closed

    def _after_mark(self, now: datetime) -> None:
        a = self.account
        self._recompute_equity()
        lim = self.risk.config.max_daily_loss * a.day_start_equity
        if a.day_start_equity > 0 and a.day_start_equity - a.equity >= lim - 1e-9:
            if notify(self.db, a.user_id, "daily_loss_limit",
                      f"{a.name}: daily loss limit of {self.risk.config.max_daily_loss:.1%} reached. "
                      f"No new trades today.", f"dll:{a.id}:{a.day_key}", {"account_id": a.id}):
                self.risk_event("daily_loss_limit", "Daily loss limit reached; new orders blocked until next day.",
                                "crit", day=a.day_key, equity=a.equity, day_start_equity=a.day_start_equity)
        self.snapshot(now)

    # ---------------------------------------------------------------- signals
    def active_configs(self, symbol: str, timeframe: str) -> list[StrategyConfig]:
        return self.db.query(StrategyConfig).filter_by(user_id=self.account.user_id, symbol=symbol,
                                                       timeframe=timeframe, enabled=True, is_current=True).all()

    def evaluate_strategies(self, symbol: str, timeframe: str, df: pd.DataFrame) -> list[tuple[StrategyConfig, dict]]:
        """Run every enabled strategy on closed candles; return signals from the LAST candle only."""
        out, spec = [], self.specs.get(symbol)
        if spec is None or len(df) < 60:
            return out
        for cfg in self.active_configs(symbol, timeframe):
            sig = plan_from_id(cfg.plan_id).generate(df, spec, self.sessions, cfg.params)
            row = sig.iloc[-1]
            if int(row["side"]) != 0:
                out.append((cfg, {"side": int(row["side"]), "sl": float(row["sl"]), "rr": float(row["rr"]),
                                  "score": None if pd.isna(row["score"]) else float(row["score"]),
                                  "reason": str(row["reason"]), "candle_ts": df.index[-1].to_pydatetime(),
                                  "price": float(df["close"].iloc[-1])}))
        return out

    def execute_signal(self, cfg: StrategyConfig, sig: dict, quote: Quote, now: datetime | None = None,
                       data_source: str = "", data_age_seconds: float | None = None) -> Signal:
        now = now or quote.ts
        a = self.account
        existing = self.db.query(Signal).filter_by(account_id=a.id, plan_id=cfg.plan_id,
                                                   candle_ts=sig["candle_ts"]).first()
        if existing:
            return existing                      # the same candle can never be traded twice
        self.roll_day(now)
        self._recompute_equity()
        spec = self.specs.get(cfg.symbol)
        side = sig["side"]
        row = Signal(account_id=a.id, strategy_config_id=cfg.id, plan_id=cfg.plan_id, symbol=cfg.symbol,
                     timeframe=cfg.timeframe, session=cfg.engine, side="buy" if side > 0 else "sell",
                     candle_ts=sig["candle_ts"], price=sig["price"], sl=sig["sl"], rr_target=sig["rr"],
                     score=sig.get("score"), reason=sig.get("reason", ""), data_source=data_source,
                     context={"quote": {"bid": quote.bid, "ask": quote.ask, "ts": quote.ts.isoformat()},
                              "config_version": cfg.version, "params": cfg.params})
        self.db.add(row)
        self.db.flush()

        reasons, detail = [], {}
        if not cfg.enabled or cfg.status == "suspended":
            reasons.append("STRATEGY_DISABLED")
        if spec is not None:
            try:
                spec.validate()
            except SpecError as e:
                spec, detail["spec_error"] = None, str(e)
        if spec is None:
            reasons.append("INVALID_SPEC")
        elif not market_open(spec.trades_weekend, now):
            reasons.append("MARKET_CLOSED")
        if a.mode == "live":
            blocks = self.live_gate(a) if self.live_gate else ["live gate not configured"]
            if blocks:
                reasons.append("LIVE_NOT_PERMITTED")
                detail["live_blocks"] = blocks
        dec = None
        if spec is not None:
            age = data_age_seconds if data_age_seconds is not None else max(0.0, (now - quote.ts).total_seconds())
            plan = ex.plan_trade(spec, side, quote.mid, quote.spread, sig["sl"], sig["rr"],
                                 spec.quote_to_usd(quote.mid), self.cost_multiplier)
            row.tp = plan.tp
            intent = OrderIntent(spec.symbol, side, plan.entry, plan.sl, plan.tp, plan.risk_per_unit,
                                 plan.reward_per_unit, quote.spread, spec.quote_to_usd(quote.mid), age,
                                 client_order_id(a.id, cfg.plan_id, sig["candle_ts"]))
            dec = self.risk.evaluate(intent, spec, self.portfolio_state())
            reasons += dec.reasons
            detail |= dec.detail
        reasons = sorted(set(reasons))
        if reasons:
            row.outcome = "rejected"
            self.db.add(RejectedSignal(signal_id=row.id, account_id=a.id, reasons=reasons,
                                       detail=detail | {"explanations": [REASONS.get(r, r) for r in reasons]}))
            audit(self.db, "order", "signal_rejected", a.user_id, a.id, plan_id=cfg.plan_id, reasons=reasons)
            return row
        notify(self.db, a.user_id, "opportunity",
               f"{cfg.symbol} {row.side.upper()} — {cfg.label} ({cfg.timeframe}). {row.reason}",
               f"opp:{a.id}:{row.id}", {"signal_id": row.id})
        order = self._submit(row, cfg, spec, intent, dec, quote, now)
        row.outcome = "executed" if order.status == "filled" else "rejected" if order.status == "rejected" else order.status
        if order.status == "rejected":
            self.db.add(RejectedSignal(signal_id=row.id, account_id=a.id, reasons=["BROKER_REJECTED"],
                                       detail={"message": order.reject_reason}))
        return row

    # ------------------------------------------------------------------ orders
    def _submit(self, signal: Signal, cfg: StrategyConfig, spec: InstrumentSpec, intent: OrderIntent, dec,
                quote: Quote, now: datetime) -> Order:
        a = self.account
        dup = self.db.query(Order).filter_by(account_id=a.id, client_order_id=intent.client_order_id).first()
        if dup:
            audit(self.db, "order", "duplicate_blocked", a.user_id, a.id, client_order_id=intent.client_order_id)
            return dup
        order = Order(account_id=a.id, mode=a.mode, client_order_id=intent.client_order_id, signal_id=signal.id,
                      symbol=spec.symbol, side=signal.side, volume=dec.volume, requested_price=intent.entry,
                      sl=intent.sl, tp=intent.tp, status="new", created_at=now, updated_at=now,
                      risk={"risk_usd": dec.risk_usd, "margin_usd": dec.margin_usd, "rr_net": dec.rr_net, **dec.detail})
        self.db.add(order)
        self.db.flush()
        req = OrderRequest(intent.client_order_id, spec.symbol, intent.side, dec.volume, sl=intent.sl, tp=intent.tp)
        if a.mode == "paper":
            res = self.adapter.fill(spec, req, quote)
        else:
            if not a.first_live_order_confirmed:
                order.status = "awaiting_confirmation"
                notify(self.db, a.user_id, "live_mode", "First LIVE order is waiting for your confirmation. "
                       "It will not be sent until you confirm.", f"first-live:{a.id}", {"order_id": order.id})
                return order
            self.db.commit()                    # persist intent BEFORE the network call
            try:
                res = self.adapter.place_order(req)
            except OrderRejected as e:
                order.status, order.reject_reason = "rejected", str(e)[:500]
                audit(self.db, "order", "broker_rejected", a.user_id, a.id, level="warn",
                      client_order_id=req.client_order_id, error=str(e)[:300])
                return order
            except BrokerUnavailable as e:
                # outcome unknown: do NOT retry blindly; halt and reconcile by client id
                order.status, order.reject_reason = "unknown", str(e)[:500]
                self.halt("broker_unstable", f"Order {req.client_order_id} outcome unknown: {e}", now)
                return order
        order.status, order.fill_price, order.broker_order_id = res.status, res.fill_price, res.broker_order_id
        order.updated_at = now
        if res.status == "filled":
            self._open_position(order, cfg, spec, intent, dec, res, now)
        return order

    def _open_position(self, order, cfg, spec, intent, dec, res, now) -> Position:
        a, fill = self.account, res.fill_price
        q2usd = intent.q2usd
        slip_r = abs(fill - intent.entry) / intent.risk_per_unit if intent.risk_per_unit else 0.0
        pos = Position(account_id=a.id, mode=a.mode, order_id=order.id, strategy_config_id=cfg.id if cfg else None,
                       plan_id=cfg.plan_id if cfg else "manual", symbol=spec.symbol, side=order.side,
                       volume=res.volume or order.volume, entry_price=fill, sl=intent.sl, tp=intent.tp,
                       risk_usd=dec.risk_usd, margin_usd=dec.margin_usd, last_price=fill,
                       entry_commission=ex.commission_usd(spec, order.volume, fill, q2usd, self.cost_multiplier),
                       broker_position_id=res.position_id, opened_at=now)
        pos.floating_pnl = -pos.entry_commission
        order.risk = {**order.risk, "entry_slippage_r": slip_r}
        self.db.add(pos)
        self.db.flush()
        self._recompute_equity()
        audit(self.db, "order", "position_opened", a.user_id, a.id, position_id=pos.id, symbol=spec.symbol,
              side=order.side, volume=pos.volume, price=fill, client_order_id=order.client_order_id)
        notify(self.db, a.user_id, "trade_executed",
               f"[{a.mode.upper()}] {order.side.upper()} {pos.volume:g} {spec.symbol} @ {fill:.5g} "
               f"(SL {intent.sl:.5g}, TP {intent.tp:.5g})", f"exec:{a.id}:{order.id}", {"position_id": pos.id})
        return pos

    def close_position(self, p: Position, exit_price: float, reason: str, now: datetime) -> Trade:
        a, spec = self.account, self.specs[p.symbol]
        side = 1 if p.side == "buy" else -1
        q2usd = spec.quote_to_usd(exit_price)
        gross = ex.pnl_usd(spec, side, p.volume, p.entry_price, exit_price, q2usd)
        comm = p.entry_commission + ex.commission_usd(spec, p.volume, exit_price, q2usd, self.cost_multiplier)
        fin = ex.financing_usd(spec, side, p.volume, p.entry_price, q2usd, p.opened_at, now)
        pnl = gross - comm + fin
        cfg = self.db.get(StrategyConfig, p.strategy_config_id) if p.strategy_config_id else None
        t = Trade(account_id=a.id, mode=a.mode, position_id=p.id, strategy_config_id=p.strategy_config_id,
                  plan_id=p.plan_id, symbol=p.symbol, timeframe=cfg.timeframe if cfg else "",
                  session=cfg.engine if cfg else "", side=p.side, volume=p.volume, entry_price=p.entry_price,
                  exit_price=exit_price, sl=p.sl, tp=p.tp, opened_at=p.opened_at, closed_at=now, gross=gross,
                  commission=comm, financing=fin, pnl=pnl, risk_usd=p.risk_usd,
                  r_multiple=(pnl / p.risk_usd) if p.risk_usd else None, exit_reason=reason)
        self.db.add(t)
        p.status, p.closed_at, p.floating_pnl, p.last_price = "closed", now, 0.0, exit_price
        a.balance += pnl
        st = self.portfolio_state()
        self.risk.register_close(st, pnl)
        a.realized_today, a.consecutive_losses, a.streak_locked = st.realized_today, st.consecutive_losses, st.streak_locked
        self.db.flush()
        self._recompute_equity()
        audit(self.db, "order", "position_closed", a.user_id, a.id, position_id=p.id, reason=reason, pnl=pnl,
              exit_price=exit_price)
        kind = {"stop_loss": "stop_loss", "take_profit": "take_profit"}.get(reason, "position_closed")
        notify(self.db, a.user_id, kind, f"[{a.mode.upper()}] {p.symbol} {p.side} closed ({reason.replace('_', ' ')}): "
               f"{pnl:+.2f} {a.currency}", f"close:{a.id}:{p.id}", {"trade_position_id": p.id})
        if a.streak_locked:
            if notify(self.db, a.user_id, "risk", f"{a.name}: {a.consecutive_losses} consecutive losses. "
                      f"Trading paused.", f"streak:{a.id}:{a.day_key}:{p.id}"):
                self.risk_event("loss_streak", "Maximum consecutive losses reached; new orders blocked.", "crit",
                                consecutive_losses=a.consecutive_losses)
        if cfg:
            self._check_health(cfg)
        self.snapshot(now, force=True)
        return t

    def _check_health(self, cfg: StrategyConfig) -> None:
        a = self.account
        trades = (self.db.query(Trade).filter_by(account_id=a.id, strategy_config_id=cfg.id)
                  .order_by(Trade.closed_at, Trade.id).all())
        slips = [o.risk.get("entry_slippage_r", 0.0) for o in
                 self.db.query(Order).join(Signal, Order.signal_id == Signal.id)
                 .filter(Order.account_id == a.id, Signal.strategy_config_id == cfg.id, Order.status == "filled")]
        res = health_mod.evaluate([t.r_multiple or 0.0 for t in trades], cfg.metrics or {}, slips)
        cfg.health = {**res, "account_id": a.id, "checked_at": utcnow().isoformat()}
        if res["status"] == "suspend" and cfg.status != "suspended":
            why = "; ".join(res["stop_reasons"])
            cfg.enabled, cfg.status, cfg.validation_status, cfg.suspended_reason = False, "suspended", "needs_revalidation", why
            self.risk_event("strategy_suspended", f"{cfg.plan_id} suspended: {why}", "crit", strategy_config_id=cfg.id)
            notify(self.db, a.user_id, "strategy_disabled", f"{cfg.plan_id} was disabled: {why}. "
                   f"Revalidation is required before it can be re-enabled.", f"susp:{cfg.id}:{cfg.version}")

    # ------------------------------------------------------- emergency controls
    def halt(self, reason: str, message: str, now: datetime) -> None:
        a = self.account
        if a.halted_reason != reason:
            a.halted_reason = reason
            self.risk_event(reason, message, "crit")
            kind = "feed_disconnected" if reason == "data_feed_down" else "broker_disconnected"
            notify(self.db, a.user_id, kind, f"{a.name}: {message} New orders are disabled.",
                   f"halt:{a.id}:{reason}:{now.strftime('%Y%m%d%H')}")

    def resume(self, reason: str) -> None:
        if self.account.halted_reason == reason:
            self.account.halted_reason = None
            self.risk_event(f"{reason}_cleared", "Condition cleared; new orders permitted again.", "info")

    def set_kill_switch(self, on: bool, now: datetime, actor_id: int | None = None) -> dict:
        """Stops new orders immediately. Existing positions follow the configured
        policy. Closing is attempted, never assumed: anything that cannot be
        closed now (no fresh price / broker unreachable) is left flagged
        'closing' and reported."""
        a = self.account
        a.kill_switch = on
        result = {"kill_switch": on, "policy": self.risk.config.kill_switch_policy, "closed": [], "pending": [],
                  "stops_tightened": []}
        audit(self.db, "risk", "kill_switch_on" if on else "kill_switch_off", actor_id or a.user_id, a.id, level="crit")
        if not on:
            return result
        self.risk_event("kill_switch", "Emergency kill switch activated.", "crit", policy=result["policy"])
        if result["policy"] == "hold":
            return result
        for p in self.open_positions():
            spec, side = self.specs[p.symbol], (1 if p.side == "buy" else -1)
            q = self.quotes.get(p.symbol)
            fresh = q is not None and (now - q.ts).total_seconds() <= 120
            if result["policy"] == "tighten_stops":
                if fresh and side * ((q.bid if side > 0 else q.ask) - p.entry_price) > 0:
                    try:
                        if a.mode == "live":
                            self.adapter.modify_position(p.broker_position_id, p.entry_price, p.tp)
                        p.sl = p.entry_price
                        result["stops_tightened"].append(p.id)
                    except Exception as e:           # report, never hide
                        result["pending"].append({"position_id": p.id, "error": str(e)[:200]})
                continue
            try:
                if a.mode == "live":
                    res = self.adapter.close_position(p.broker_position_id, f"kill-{p.id}", p.volume)
                    px = res.fill_price or (q.bid if side > 0 else q.ask)
                elif fresh:
                    px = (q.bid if side > 0 else q.ask) - side * ex.slippage_price(spec, self.cost_multiplier)
                else:
                    raise BrokerUnavailable("no fresh market price to close against")
                self.close_position(p, px, "kill_switch", now)
                result["closed"].append(p.id)
            except Exception as e:
                p.status = "closing"
                result["pending"].append({"position_id": p.id, "error": str(e)[:200]})
        if result["pending"]:
            self.risk_event("close_pending", f"{len(result['pending'])} position(s) could not be closed yet.",
                            "crit", pending=result["pending"])
        return result

    # ------------------------------------------------------------- live upkeep
    def reconcile(self, now: datetime) -> dict:
        """LIVE only: resolve orders whose outcome is unknown, mirror broker
        account figures, and book positions the broker has closed."""
        a, out = self.account, {"resolved": 0, "closed": 0}
        if a.mode != "live":
            return out
        for o in self.db.query(Order).filter_by(account_id=a.id, status="unknown").all():
            found = self.adapter.find_order(o.client_order_id)
            if found is None:
                o.status, o.reject_reason = "not_sent", "broker has no record of this client order id"
            else:
                o.status, o.fill_price, o.broker_order_id = found.status, found.fill_price, found.broker_order_id
                if found.status == "filled" and not self.db.query(Position).filter_by(order_id=o.id).first():
                    spec = self.specs[o.symbol]
                    side = 1 if o.side == "buy" else -1
                    intent = OrderIntent(o.symbol, side, found.fill_price, o.sl, o.tp,
                                         abs(found.fill_price - o.sl), abs(o.tp - found.fill_price), 0.0,
                                         spec.quote_to_usd(found.fill_price), 0.0, o.client_order_id)
                    sig = self.db.get(Signal, o.signal_id) if o.signal_id else None
                    cfg = self.db.get(StrategyConfig, sig.strategy_config_id) if sig and sig.strategy_config_id else None

                    class _D:  # minimal decision record rebuilt from the stored order
                        volume, risk_usd, margin_usd = o.volume, o.risk.get("risk_usd", 0.0), o.risk.get("margin_usd", 0.0)
                    self._open_position(o, cfg, spec, intent, _D, found, now)
            out["resolved"] += 1
        info = self.adapter.account_info()
        a.balance, a.equity = info.balance, info.equity
        a.peak_equity = max(a.peak_equity, a.equity)
        broker_ids = {p.position_id for p in self.adapter.positions()}
        for p in self.open_positions():
            if p.broker_position_id and p.broker_position_id not in broker_ids:
                q = self.quotes.get(p.symbol)
                px = p.last_price or p.entry_price
                reason = "broker_closed"
                if p.sl and p.tp and q:
                    side = 1 if p.side == "buy" else -1
                    reason = "stop_loss" if side * (px - p.entry_price) < 0 else "take_profit"
                bal = a.balance
                self.close_position(p, px, reason, now)
                a.balance = bal                    # the broker's balance is authoritative in live mode
                out["closed"] += 1
        self._recompute_equity() if a.mode == "paper" else None
        return out


def _group(trades: list[Trade]) -> dict:
    out: dict[str, dict] = {}
    for t in trades:
        g = out.setdefault(t.plan_id, {"trades": 0, "pnl": 0.0})
        g["trades"] += 1
        g["pnl"] += t.pnl
    return out
