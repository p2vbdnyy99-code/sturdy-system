"""Live-execution safety gate.

Live trading is OFF by default and can only be switched on by passing every
check below and then completing a two-step confirmation. Nothing in a
migration, a restart or a software update turns it on: ``disarm_all`` runs at
every application start and switches it back off.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from ..db import utcnow
from ..models import (Account, BrokerConnection, ComplianceAttestation, Instrument, StrategyConfig, Trade, User)
from ..security import audit
from . import compliance
from .instruments import DEFAULT_SPECS
from .risk import OpenRisk, OrderIntent, PortfolioState, RiskConfig, RiskEngine

CONFIRM_PHRASE = "ENABLE LIVE TRADING"
REAL_FEEDS = ("binance", "mt5")
MIN_FORWARD_TRADES = 30
MIN_FORWARD_DAYS = 20
CONNECTION_TEST_MAX_AGE = timedelta(hours=24)
SELFTEST_MAX_AGE = timedelta(days=7)
ARM_CODE_TTL = timedelta(minutes=5)


def risk_selftest(cfg: RiskConfig) -> dict:
    """Executes the risk engine against canned hostile scenarios using the
    account's own configuration. Every case must be REJECTED for a pass."""
    eng, spec = RiskEngine(cfg), DEFAULT_SPECS["EURUSD"]

    def intent(**kw):
        base = dict(symbol="EURUSD", side=1, entry=1.1000, sl=1.0980, tp=1.1045, risk_per_unit=0.0021,
                    reward_per_unit=0.0045, spread=0.0001, q2usd=1.0)
        return OrderIntent(**{**base, **kw})

    def state(**kw):
        base = dict(equity=10_000.0, balance=10_000.0, day_start_equity=10_000.0)
        return PortfolioState(**{**base, **kw})

    other = OpenRisk("USDJPY", 1, 0.01, 10.0, 10.0, "JPY")
    same_group = OpenRisk("GBPUSD", 1, 0.01, 10.0, 10.0, "USD_MAJORS")
    cases = {
        "kill_switch": (intent(), state(kill_switch=True), "KILL_SWITCH"),
        "daily_loss_limit": (intent(), state(equity=10_000 * (1 - cfg.max_daily_loss)), "DAILY_LOSS_LIMIT"),
        "loss_streak": (intent(), state(consecutive_losses=cfg.max_consecutive_losses), "LOSS_STREAK"),
        "max_positions": (intent(), state(open=[other] * cfg.max_positions), "MAX_POSITIONS"),
        "correlated": (intent(), state(open=[same_group] * cfg.max_correlated_positions), "CORRELATED_EXPOSURE"),
        "rr_too_low": (intent(reward_per_unit=0.0021 * (cfg.min_rr - 0.5)), state(), "RR_TOO_LOW"),
        "wrong_side_stop": (intent(sl=1.1020), state(), "INVALID_STOP"),
        "min_lot_too_big": (intent(), state(equity=20.0, balance=20.0, day_start_equity=20.0), "MIN_LOT_EXCEEDS_RISK"),
        "broker_unstable": (intent(), state(halted="broker_unstable"), "TRADING_HALTED"),
    }
    results = {}
    for name, (i, s, expect) in cases.items():
        d = eng.evaluate(i, spec, s)
        results[name] = {"expected": expect, "rejected": not d.approved, "reasons": d.reasons,
                         "ok": (not d.approved) and expect in d.reasons}
    ok_case = eng.evaluate(intent(), spec, state())
    results["valid_order_is_sized_within_limit"] = {
        "ok": ok_case.approved and ok_case.risk_usd <= cfg.risk_per_trade * 10_000 + 1e-6,
        "risk_usd": ok_case.risk_usd, "limit_usd": cfg.risk_per_trade * 10_000, "reasons": ok_case.reasons}
    return {"passed": all(r["ok"] for r in results.values()), "cases": results, "ran_at": utcnow().isoformat()}


def _asset_classes(db: Session, user_id: int) -> dict[str, str]:
    syms = {c.symbol for c in db.query(StrategyConfig).filter_by(user_id=user_id, enabled=True, is_current=True)}
    return {i.symbol: i.asset_class for i in db.query(Instrument).filter(Instrument.symbol.in_(syms))} if syms else {}


def checklist(db: Session, account: Account, now: datetime | None = None) -> dict:
    now = now or utcnow()
    items: list[dict] = []

    def add(key, title, ok, detail):
        items.append({"key": key, "title": title, "ok": bool(ok), "detail": detail})

    if account.mode != "live":
        return {"eligible": False, "items": [{"key": "mode", "title": "Account mode", "ok": False,
                "detail": "This is a PAPER account. Paper accounts can never execute live orders."}]}
    user = db.get(User, account.user_id)
    conn = db.get(BrokerConnection, account.broker_connection_id)
    tested = bool(conn and conn.status == "ok" and conn.last_test_at and now - conn.last_test_at <= CONNECTION_TEST_MAX_AGE)
    add("broker_tested", "Broker integration successfully tested", tested,
        "Connection test passed within the last 24h." if tested else
        "Run the broker connection test; it must pass against the real terminal/API within the last 24 hours.")
    res = (conn.last_test_result or {}) if conn else {}
    perms = tested and res.get("trade_allowed") is True and res.get("withdrawals_enabled") is not True
    add("permissions", "Account permissions verified", perms,
        f"trade_allowed={res.get('trade_allowed')}, account_type={res.get('account_type', 'unknown')}, "
        f"withdrawals_enabled={res.get('withdrawals_enabled', 'n/a')}")
    classes = _asset_classes(db, account.user_id)
    comp_ok, comp_detail = bool(classes), []
    if not classes:
        comp_detail.append("No enabled strategies.")
    for sym, ac in classes.items():
        attested = bool(conn) and db.query(ComplianceAttestation.id).filter_by(
            user_id=user.id, broker_key=conn.broker.key, asset_class=ac, jurisdiction=user.jurisdiction).first() is not None
        r = compliance.evaluate(user.jurisdiction, conn.broker.key if conn else "", ac, attested,
                                conn.account_type if conn else "unknown")
        if conn and conn.account_type == "demo" and r.status == "attestation_required" and attested:
            r.status = "ok"
        if not r.allowed:
            comp_ok = False
            comp_detail.append(f"{sym} ({ac}): {r.status} — {' '.join(r.reasons)}")
    add("regulatory", "Regulatory and broker eligibility verified", comp_ok,
        "; ".join(comp_detail) or f"Passed for jurisdiction {user.jurisdiction}.")
    unverified = [s for s in classes if not (db.query(Instrument).filter_by(symbol=s, spec_verified=True).first())]
    add("specs", "Contract specifications verified from the broker", bool(classes) and not unverified,
        "All traded symbols synced from broker symbol info." if classes and not unverified else
        f"Unverified: {', '.join(unverified) or 'no symbols'}")
    unval = [c.plan_id for c in db.query(StrategyConfig).filter_by(user_id=account.user_id, enabled=True, is_current=True)
             if c.validation_status != "passed" or (c.validation_source or "").startswith("synthetic")]
    add("strategies", "Enabled strategies validated out-of-sample on real data", bool(classes) and not unval,
        "All enabled strategies passed validation on non-synthetic data." if classes and not unval else
        f"Not validated on real data: {', '.join(unval) or 'none enabled'}")
    paper = [a for a in db.query(Account).filter_by(user_id=account.user_id, mode="paper")
             if (a.feed or {}).get("type") in REAL_FEEDS and not (a.feed or {}).get("replay_used")]
    trades = db.query(Trade).filter(Trade.account_id.in_([a.id for a in paper])).all() if paper else []
    days = {t.closed_at.date() for t in trades}
    exp = sum(t.r_multiple or 0 for t in trades) / len(trades) if trades else 0.0
    fwd = len(trades) >= MIN_FORWARD_TRADES and len(days) >= MIN_FORWARD_DAYS and exp > 0
    add("forward_test", "Paper trading completed with sufficient forward evidence", fwd,
        f"{len(trades)} real-time paper trades over {len(days)} trading days, expectancy {exp:+.2f}R "
        f"(need >= {MIN_FORWARD_TRADES} trades, >= {MIN_FORWARD_DAYS} days, positive expectancy; "
        f"replayed or synthetic data does not count).")
    st = (account.live_state or {}).get("risk_selftest") or {}
    fresh = bool(st.get("passed")) and now - datetime.fromisoformat(st["ran_at"]) <= SELFTEST_MAX_AGE
    add("risk_controls", "Risk controls tested", fresh,
        "Risk self-test passed within the last 7 days." if fresh else "Run the risk-control self-test.")
    add("kill_switch_off", "Kill switch is off and trading is not halted",
        not account.kill_switch and not account.halted_reason,
        f"kill_switch={account.kill_switch}, halted={account.halted_reason}")
    return {"eligible": all(i["ok"] for i in items), "items": items, "live_enabled": account.live_enabled,
            "first_live_order_confirmed": account.first_live_order_confirmed}


def blocking_reasons(db: Session, account: Account) -> list[str]:
    """Evaluated before EVERY live order."""
    if account.mode != "live":
        return ["account is not a live account"]
    out = []
    if not account.live_enabled:
        out.append("live trading has not been enabled by the user")
    chk = checklist(db, account)
    out += [f"{i['title']}: {i['detail']}" for i in chk["items"] if not i["ok"]]
    return out


def arm(db: Session, account: Account, now: datetime | None = None) -> str:
    """Step 1 of 2. Returns a one-time code (shown once) valid for five minutes."""
    now = now or utcnow()
    chk = checklist(db, account, now)
    if not chk["eligible"]:
        raise PermissionError("Live trading prerequisites are not met.")
    code = f"{secrets.randbelow(10 ** 6):06d}"
    account.live_state = {**(account.live_state or {}), "arm_hash": hashlib.sha256(code.encode()).hexdigest(),
                          "arm_expires": (now + ARM_CODE_TTL).isoformat()}
    account.live_armed_at = now
    audit(db, "admin", "live_arm_requested", account.user_id, account.id, level="crit")
    return code


def confirm(db: Session, account: Account, code: str, phrase: str, now: datetime | None = None) -> None:
    """Step 2 of 2."""
    now = now or utcnow()
    st = account.live_state or {}
    if phrase != CONFIRM_PHRASE:
        raise PermissionError(f'Type the phrase "{CONFIRM_PHRASE}" exactly to confirm.')
    if not st.get("arm_hash") or now > datetime.fromisoformat(st["arm_expires"]):
        raise PermissionError("Confirmation code expired. Start again.")
    if hashlib.sha256(code.encode()).hexdigest() != st["arm_hash"]:
        raise PermissionError("Incorrect confirmation code.")
    if not checklist(db, account, now)["eligible"]:
        raise PermissionError("Live trading prerequisites are no longer met.")
    account.live_enabled = True
    account.first_live_order_confirmed = False
    account.live_state = {k: v for k, v in st.items() if not k.startswith("arm_")} | {"enabled_at": now.isoformat()}
    audit(db, "admin", "live_enabled", account.user_id, account.id, level="crit")


def disable(db: Session, account: Account, reason: str) -> None:
    if account.live_enabled:
        account.live_enabled = False
        account.first_live_order_confirmed = False
        audit(db, "admin", "live_disabled", account.user_id, account.id, level="crit", reason=reason)


def disarm_all(db: Session, reason: str = "application start") -> int:
    """Called on every startup: live execution never survives a restart."""
    n = 0
    for a in db.query(Account).filter_by(live_enabled=True):
        disable(db, a, reason)
        n += 1
    return n
