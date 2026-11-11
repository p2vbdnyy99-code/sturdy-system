"""The 15 execution-safety scenarios from the specification, run through the
real TradingService against the database (paper broker, and a scripted live
adapter for the broker-failure cases)."""
from datetime import timedelta

import pytest
from sqlalchemy.exc import IntegrityError

from app import models as m
from app.brokers.base import (AccountInfo, BrokerAdapter, BrokerPosition, BrokerUnavailable, OrderRejected,
                              OrderResult)
from app.core.backtest import BacktestConfig, PlanData, run_backtest
from app.core.engines import plan_from_id
from app.core.instruments import DEFAULT_SPECS
from app.core.mtf import resample
from app.core.trading import IsolationError, TradingService
from app.data import store
from app.db import SessionLocal
from app.jobs import run_replay
from app.security import encrypt_secret
from tests.conftest import T0, make_account, make_cfg, quote, signal


def svc_for(db, user, balance=10_000.0, **kw):
    acct = make_account(db, user, balance)
    return TradingService(db, acct, **kw), acct, make_cfg(db, user)


def enter(svc, cfg, ts=T0, **kw):
    q = quote(ts=ts)
    svc.on_quote(q, ts)
    return svc.execute_signal(cfg, signal(ts=ts, **kw), q, ts)


def rejection(db, sig):
    return db.query(m.RejectedSignal).filter_by(signal_id=sig.id).one().reasons


# 1 + 4 ------------------------------------------------------------------------
def test_01_winning_trade_and_04_take_profit(db, user):
    svc, acct, cfg = svc_for(db, user)
    s = enter(svc, cfg)
    assert s.outcome == "executed"
    pos = svc.open_positions()[0]
    assert pos.volume == 0.23 and pos.entry_price == pytest.approx(1.10007) and pos.tp == pytest.approx(1.10425)
    assert svc.on_quote(quote(mid=1.1030, ts=T0 + timedelta(minutes=5))) == []        # not there yet
    closed = svc.on_quote(quote(mid=1.10431, ts=T0 + timedelta(minutes=10)))
    t = closed[0]
    assert t.exit_reason == "take_profit" and t.r_multiple == pytest.approx(2.0, abs=1e-6)
    assert acct.balance == pytest.approx(10_000 + t.pnl) and acct.equity == pytest.approx(acct.balance)
    assert svc.open_positions() == [] and acct.consecutive_losses == 0
    kinds = [n.kind for n in db.query(m.Notification).order_by(m.Notification.id)]
    assert kinds == ["opportunity", "trade_executed", "take_profit"]


# 2 + 3 ------------------------------------------------------------------------
def test_02_losing_trade_and_03_stop_loss(db, user):
    svc, acct, cfg = svc_for(db, user)
    enter(svc, cfg)
    t = svc.on_quote(quote(mid=1.09795, ts=T0 + timedelta(minutes=5)))[0]
    assert t.exit_reason == "stop_loss"
    assert -1.05 < t.r_multiple <= -1.0                       # one R plus slippage past the stop
    assert t.pnl < 0 and acct.balance == pytest.approx(10_000 + t.pnl) and acct.consecutive_losses == 1
    assert abs(t.pnl) <= 0.005 * 10_000 * 1.05                # ~0.5% of equity


# 5 ----------------------------------------------------------------------------
def test_05_maximum_daily_loss_blocks_new_trades_until_next_day(db, user):
    svc, acct, cfg = svc_for(db, user)
    svc.roll_day(T0)
    acct.balance = acct.equity = 9_790.0                      # -2.1% on the day
    svc.on_quote(quote(ts=T0), T0)
    s = enter(svc, cfg)
    assert s.outcome == "rejected" and "DAILY_LOSS_LIMIT" in rejection(db, s)
    assert db.query(m.RiskEvent).filter_by(kind="daily_loss_limit").count() == 1
    svc.on_quote(quote(ts=T0 + timedelta(minutes=1)))         # repeated ticks do not repeat the alert
    assert db.query(m.Notification).filter_by(kind="daily_loss_limit").count() == 1
    nxt = T0 + timedelta(days=1)
    assert enter(svc, cfg, ts=nxt).outcome == "executed"      # new IST day, new loss budget


# 6 ----------------------------------------------------------------------------
def test_06_three_consecutive_losses_pause_trading(db, user):
    svc, acct, cfg = svc_for(db, user)
    svc.risk.config.max_daily_loss = 0.05                     # isolate the streak rule
    for i in range(3):
        ts = T0 + timedelta(minutes=30 * i)
        assert enter(svc, cfg, ts=ts).outcome == "executed"
        assert svc.on_quote(quote(mid=1.0979, ts=ts + timedelta(minutes=5)))[0].pnl < 0
    assert acct.consecutive_losses == 3 and acct.streak_locked
    s = enter(svc, cfg, ts=T0 + timedelta(minutes=120))
    assert s.outcome == "rejected" and "LOSS_STREAK" in rejection(db, s)
    assert db.query(m.RiskEvent).filter_by(kind="loss_streak").count() == 1
    assert enter(svc, cfg, ts=T0 + timedelta(days=1)).outcome == "executed"   # resets next trading day


# ---- scripted live adapter ------------------------------------------------------
class FakeLive(BrokerAdapter):
    key, mode = "mt5", "live"

    def __init__(self):
        self.orders, self.fail, self.healthy, self.calls = {}, None, True, 0
        self.open: dict[str, BrokerPosition] = {}

    def health(self):
        return {"ok": self.healthy, "error": None if self.healthy else "terminal disconnected"}

    def account_info(self):
        return AccountInfo(10_000, 10_000, 0, 10_000, account_type="demo", trade_allowed=True)

    def positions(self):
        return list(self.open.values())

    def quote(self, symbol):
        return quote(symbol)

    def symbol_spec(self, symbol):
        return {}

    def place_order(self, req):
        self.calls += 1
        if req.client_order_id in self.orders:
            r = self.orders[req.client_order_id]
            return OrderResult(r.client_order_id, r.broker_order_id, r.status, r.fill_price, r.volume, r.position_id, True)
        if self.fail == "reject":
            raise OrderRejected("10019 not enough money")
        res = OrderResult(req.client_order_id, f"T{len(self.orders) + 1}", "filled", 1.10009, req.volume, f"P{len(self.orders) + 1}")
        self.orders[req.client_order_id] = res
        self.open[res.position_id] = BrokerPosition(res.position_id, req.symbol, req.side, req.volume, 1.10009,
                                                    req.sl, req.tp, 0.0)
        if self.fail == "timeout_after_send":
            raise BrokerUnavailable("read timeout")
        return res

    def find_order(self, cid):
        return self.orders.get(cid)

    def close_position(self, position_id, client_order_id, volume=None):
        if not self.healthy:
            raise BrokerUnavailable("terminal disconnected")
        self.open.pop(position_id, None)
        return OrderResult(client_order_id, "C1", "filled", 1.1, volume)


def live_setup(db, user, blocks=()):
    broker = db.query(m.Broker).filter_by(key="mt5").one()
    conn = m.BrokerConnection(user_id=user.id, broker_id=broker.id, label="demo",
                              credentials_enc=encrypt_secret({"bridge_secret": "s3cret"}), account_type="demo")
    db.add(conn)
    db.flush()
    acct = m.Account(user_id=user.id, name="Live", mode="live", broker_connection_id=conn.id, balance=10_000,
                     equity=10_000, peak_equity=10_000, day_start_equity=10_000, initial_balance=10_000,
                     live_enabled=True, first_live_order_confirmed=True)
    db.add(acct)
    db.commit()
    fake = FakeLive()
    return TradingService(db, acct, fake, live_gate=lambda a: list(blocks)), acct, fake, make_cfg(db, user)


# 7 ----------------------------------------------------------------------------
def test_07_broker_disconnection_halts_orders_and_disarms_live(db, user):
    from app import runner
    svc, acct, fake, cfg = live_setup(db, user)

    class NoFeed(runner.Feed):
        source = "mt5"
        def supports(self, s): return True
        def quote(self, s): return quote(s, ts=T0)
        def candles(self, s, tf, limit): return None

    fake.healthy = False
    runner.step_account(db, acct, NoFeed(), fake, T0)
    assert acct.halted_reason == "broker_unstable" and acct.live_enabled is False
    assert db.query(m.Notification).filter_by(kind="broker_disconnected").count() == 1
    s = enter(svc, cfg)
    assert s.outcome == "rejected" and "TRADING_HALTED" in rejection(db, s) and fake.calls == 0
    kill = TradingService(db, acct, fake, live_gate=lambda a: []).set_kill_switch(True, T0)
    assert kill["closed"] == []                                # nothing to close, and closing is never assumed
    fake.healthy = True
    runner.step_account(db, acct, NoFeed(), fake, T0 + timedelta(minutes=1))
    assert acct.halted_reason is None and acct.live_enabled is False   # recovery does NOT re-enable live


# 8 ----------------------------------------------------------------------------
def test_08_duplicate_order_submission_is_idempotent(db, user):
    svc, acct, cfg = svc_for(db, user)
    a = enter(svc, cfg)
    b = enter(svc, cfg)                                        # same strategy, same candle
    assert a.id == b.id and db.query(m.Order).count() == 1 and len(svc.open_positions()) == 1
    with pytest.raises(IntegrityError):                        # the database refuses a second client id too
        o = db.query(m.Order).one()
        db.add(m.Order(account_id=acct.id, mode="paper", client_order_id=o.client_order_id, symbol="EURUSD",
                       side="buy", volume=0.1))
        db.flush()
    db.rollback()


def test_08b_live_duplicate_reaches_broker_once(db, user):
    svc, acct, fake, cfg = live_setup(db, user)
    enter(svc, cfg)
    enter(svc, cfg)
    assert fake.calls == 1 and len(fake.orders) == 1


# 9 ----------------------------------------------------------------------------
def test_09_delayed_market_data_is_refused(db, user):
    svc, acct, cfg = svc_for(db, user)
    svc.risk.config.max_data_age_seconds = 90
    old = quote(ts=T0 - timedelta(minutes=10))
    s = svc.execute_signal(cfg, signal(), old, T0)
    assert s.outcome == "rejected" and "STALE_DATA" in rejection(db, s) and svc.open_positions() == []


def test_09b_feed_outage_halts_and_recovers(db, user):
    from app import runner
    from app.brokers.base import BrokerError
    acct = make_account(db, user)
    make_cfg(db, user)
    acct.feed = {"type": "mt5"}

    class Feed(runner.Feed):
        source, up, age = "mt5", False, 0
        def supports(self, s): return True
        def candles(self, s, tf, limit): return None
        def quote(self, s):
            if not self.up:
                raise BrokerError("bridge unreachable")
            return quote(s, ts=T0 - timedelta(seconds=self.age))

    f = Feed()
    runner.step_account(db, acct, f, None, T0)
    assert acct.halted_reason == "data_feed_down"
    assert db.query(m.Notification).filter_by(kind="feed_disconnected").count() == 1
    f.up, f.age = True, 600                                     # reachable but 10 minutes late
    runner.step_account(db, acct, f, None, T0)
    assert acct.halted_reason == "data_feed_down" and "EURUSD" not in runner.QUOTES
    f.age = 1
    runner.step_account(db, acct, f, None, T0)
    assert acct.halted_reason is None


# 10 ---------------------------------------------------------------------------
def test_10_invalid_instrument_specification_blocks_the_order(db, user):
    inst = db.query(m.Instrument).filter_by(symbol="EURUSD").one()
    inst.spec = {**inst.spec, "contract_size": 0}
    db.commit()
    svc, acct, cfg = svc_for(db, user)
    s = enter(svc, cfg)
    assert s.outcome == "rejected" and "INVALID_SPEC" in rejection(db, s) and db.query(m.Order).count() == 0


# 11 ---------------------------------------------------------------------------
def test_11_insufficient_margin(db, user):
    svc, acct, cfg = svc_for(db, user)
    db.add(m.Position(account_id=acct.id, mode="paper", symbol="XAUUSD", side="buy", volume=4.0,
                      entry_price=2400.0, sl=2390.0, tp=2420.0, risk_usd=10.0, margin_usd=9_995.0))
    db.commit()
    s = enter(svc, cfg)
    assert s.outcome == "rejected" and "INSUFFICIENT_MARGIN" in rejection(db, s)


# 12 ---------------------------------------------------------------------------
def test_12_restart_with_open_positions(db, user):
    svc, acct, cfg = svc_for(db, user)
    enter(svc, cfg)
    db.commit()
    acct_id = acct.id
    db.close()                                                  # "process dies": nothing in memory survives
    db2 = SessionLocal()
    try:
        acct2 = db2.get(m.Account, acct_id)
        svc2 = TradingService(db2, acct2)
        pos = svc2.open_positions()
        assert len(pos) == 1 and pos[0].sl == pytest.approx(1.098)
        assert svc2.portfolio_state().open[0].risk_usd == pytest.approx(pos[0].risk_usd)
        t = svc2.on_quote(quote(mid=1.0979, ts=T0 + timedelta(minutes=30)))[0]
        assert t.exit_reason == "stop_loss" and svc2.open_positions() == []
        again = svc2.execute_signal(db2.get(m.StrategyConfig, cfg.id), signal(), quote(), T0)
        assert again.outcome == "executed" and db2.query(m.Order).count() == 1   # old candle is not re-traded
        db2.commit()
    finally:
        db2.close()


def test_12b_restart_never_leaves_live_trading_enabled(db, user):
    from app.main import bootstrap
    svc, acct, fake, cfg = live_setup(db, user)
    assert acct.live_enabled
    bootstrap()
    db.refresh(acct)
    assert acct.live_enabled is False and acct.first_live_order_confirmed is False


# 13 ---------------------------------------------------------------------------
def test_13_simultaneous_signals_on_correlated_instruments(db, user):
    svc, acct, cfg = svc_for(db, user)
    gbp = make_cfg(db, user, "london:london_breakout:GBPUSD:M15")
    jpy = make_cfg(db, user, "asia:asian_orb:USDJPY:M15")
    assert enter(svc, cfg).outcome == "executed"
    q = quote("GBPUSD", 1.27, 0.00013)
    s = svc.execute_signal(gbp, signal(sl=1.268, price=1.27), q, T0)
    assert s.outcome == "rejected" and rejection(db, s) == ["CORRELATED_EXPOSURE"]
    qj = quote("USDJPY", 150.0, 0.012)
    assert svc.execute_signal(jpy, signal(sl=149.7, price=150.0), qj, T0).outcome == "executed"   # different group
    xau = make_cfg(db, user, "london:london_breakout:XAUUSD:M15")
    s3 = svc.execute_signal(xau, signal(sl=2390.0, price=2400.0), quote("XAUUSD", 2400.0, 0.25), T0)
    assert s3.outcome == "rejected" and "MAX_POSITIONS" in rejection(db, s3)


# 14 ---------------------------------------------------------------------------
def test_14_network_interruption_during_order_submission(db, user):
    svc, acct, fake, cfg = live_setup(db, user)
    fake.fail = "timeout_after_send"                            # broker filled it, the reply was lost
    s = enter(svc, cfg)
    order = db.query(m.Order).one()
    assert order.status == "unknown" and s.outcome == "unknown"
    assert acct.halted_reason == "broker_unstable" and svc.open_positions() == []
    fake.fail = None
    blocked = enter(svc, cfg, ts=T0 + timedelta(minutes=15))
    assert "TRADING_HALTED" in rejection(db, blocked) and fake.calls == 1       # no blind retry
    out = svc.reconcile(T0 + timedelta(minutes=16))
    assert out["resolved"] == 1 and order.status == "filled"
    pos = svc.open_positions()
    assert len(pos) == 1 and pos[0].broker_position_id == "P1" and len(fake.orders) == 1


def test_14b_broker_rejection_is_recorded_not_hidden(db, user):
    svc, acct, fake, cfg = live_setup(db, user)
    fake.fail = "reject"
    s = enter(svc, cfg)
    assert s.outcome == "rejected" and db.query(m.Order).one().reject_reason.startswith("10019")
    assert rejection(db, s) == ["BROKER_REJECTED"]


# 15 ---------------------------------------------------------------------------
def test_15_paper_and_live_are_isolated(db, user):
    paper = make_account(db, user)
    with pytest.raises(IsolationError):
        TradingService(db, paper, FakeLive())                   # live adapter on a paper account
    svc, live, fake, cfg = live_setup(db, user)
    with pytest.raises(IsolationError):
        TradingService(db, live)                                # paper broker on a live account
    for bad in (m.Order(account_id=paper.id, mode="live", client_order_id="x", symbol="EURUSD", side="buy", volume=1),
                m.Trade(account_id=live.id, mode="paper", plan_id="p", symbol="EURUSD", side="buy", volume=1,
                        entry_price=1, exit_price=1, opened_at=T0, closed_at=T0, gross=0, pnl=0, exit_reason="x")):
        db.add(bad)
        with pytest.raises(IntegrityError):                     # composite FK (account_id, mode)
            db.flush()
        db.rollback()
    paper.broker_connection_id = live.broker_connection_id      # a paper account may not hold a broker link
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()
    enter(svc, cfg)
    assert {o.mode for o in db.query(m.Order)} == {"live"} and db.query(m.Position).filter_by(account_id=paper.id).count() == 0
    with pytest.raises(IsolationError):
        svc.on_bar("EURUSD", 1.1, 1.1, 1.1, 1.1, 0.0001, T0, 15)   # replay facility is paper-only


def test_live_orders_blocked_by_gate_and_first_order_needs_confirmation(db, user):
    svc, acct, fake, cfg = live_setup(db, user, blocks=["Regulatory and broker eligibility verified: blocked"])
    s = enter(svc, cfg)
    assert "LIVE_NOT_PERMITTED" in rejection(db, s) and fake.calls == 0
    svc2, acct2 = TradingService(db, acct, fake, live_gate=lambda a: []), acct
    acct2.first_live_order_confirmed = False
    s2 = enter(svc2, cfg, ts=T0 + timedelta(minutes=15))
    assert s2.outcome == "awaiting_confirmation" and fake.calls == 0


# ---- kill switch, health monitor, notifications, replay ---------------------------
def test_kill_switch_policies(db, user):
    svc, acct, cfg = svc_for(db, user)
    enter(svc, cfg)
    acct.risk_config = {"kill_switch_policy": "close_all"}
    svc = TradingService(db, acct)
    res = svc.set_kill_switch(True, T0 + timedelta(hours=3))    # no fresh price available
    assert res["closed"] == [] and len(res["pending"]) == 1
    assert svc.open_positions()[0].status == "closing"          # reported, not pretended closed
    t = svc.on_quote(quote(mid=1.1005, ts=T0 + timedelta(hours=3, minutes=1)))   # first fresh price: close
    assert t[0].exit_reason == "kill_switch" and svc.open_positions() == []
    assert "KILL_SWITCH" in rejection(db, enter(svc, cfg, ts=T0 + timedelta(hours=3, minutes=2)))


def test_health_monitor_suspends_and_requires_revalidation(db, user):
    svc, acct, cfg = svc_for(db, user)
    svc.risk.config.max_consecutive_losses = 99
    svc.risk.config.max_daily_loss = 0.5
    for i in range(7):
        ts = T0 + timedelta(minutes=30 * i)
        enter(svc, cfg, ts=ts)
        svc.on_quote(quote(mid=1.0979, ts=ts + timedelta(minutes=5)))
    assert cfg.status == "suspended" and cfg.enabled is False and cfg.validation_status == "needs_revalidation"
    assert "consecutive losses" in cfg.suspended_reason
    assert db.query(m.Notification).filter_by(kind="strategy_disabled").count() == 1
    s = enter(svc, cfg, ts=T0 + timedelta(hours=5))
    assert "STRATEGY_DISABLED" in rejection(db, s)


def test_notifications_are_deduplicated_and_respect_preferences(db, user):
    from app.core.notify import notify
    assert notify(db, user.id, "risk", "body", "k1") is not None
    assert notify(db, user.id, "risk", "body again", "k1") is None
    user.settings = {"notifications": {"opportunity": False}}
    assert notify(db, user.id, "opportunity", "x", "k2") is None
    assert len(db.pushes) == 1


def test_replay_paper_engine_reproduces_the_backtest(db, user, m5):
    """Same data, same strategy, same costs: the event-driven paper engine and
    the vectorised backtester must produce the same trades."""
    df = resample(m5, "M15").iloc[:6000]
    store.upsert(db, "EURUSD", "M15", "synthetic:test", df)
    acct, cfg = make_account(db, user), make_cfg(db, user)
    stats = run_replay(db, acct, ["EURUSD"], "M15", "synthetic:test")
    bt = run_backtest([PlanData(plan_from_id(cfg.plan_id), store.load(db, "EURUSD", "M15", "synthetic:test"),
                                DEFAULT_SPECS["EURUSD"], cfg.params)], BacktestConfig(initial_balance=10_000))
    closed = [t for t in bt.trades if t["exit_reason"] != "end_of_data"]
    paper = db.query(m.Trade).filter_by(account_id=acct.id).order_by(m.Trade.opened_at).all()
    assert len(paper) >= 20 and len(paper) == len(closed)
    for p, b in zip(paper, closed):
        assert p.opened_at == b["entry_time"].to_pydatetime() and p.exit_reason == b["exit_reason"]
        assert p.entry_price == pytest.approx(b["entry"]) and p.pnl == pytest.approx(b["pnl"], abs=1e-6)
    assert acct.feed["replay_used"] and acct.feed["synthetic"] and stats["synthetic"]
    assert db.query(m.Signal).filter_by(account_id=acct.id, outcome="rejected").count() == \
        db.query(m.RejectedSignal).filter_by(account_id=acct.id).count()
