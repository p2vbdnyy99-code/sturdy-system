"""HTTP API: authentication, RBAC, account isolation, data -> backtest ->
research -> paper replay -> journal/analytics, compliance and live gating."""
import io

import pytest

from app import models as m
from app.config import get_settings
from app.core import live_gate
from app.data.synthetic import generate
from app.security import decrypt_secret
from tests.conftest import PW, register

API = "/api/v1"


def csv_bytes(days=120, seed=5):
    df = generate("EURUSD", days=days, seed=seed)
    buf = io.StringIO()
    df.rename_axis("time").reset_index().assign(time=lambda d: d["time"].dt.strftime("%Y-%m-%d %H:%M:%S")).to_csv(buf, index=False)
    return buf.getvalue().encode(), len(df)


def test_health_and_auth_flow(client, db):
    assert client.get(f"{API}/health").json()["database"] is True
    assert client.get(f"{API}/accounts").status_code == 401
    assert client.post(f"{API}/auth/register", json={"email": "x@example.com", "password": "weak"}).status_code == 422
    h, body = register(client)
    assert body["user"]["role"] == "admin"                                # first user administers the instance
    u = db.query(m.User).one()
    assert u.password_hash.startswith("$argon2") and PW not in u.password_hash
    accts = client.get(f"{API}/accounts", headers=h).json()
    assert len(accts) == 1 and accts[0]["mode"] == "paper" and accts[0]["balance"] == 300.0   # default: PAPER, USD 300
    assert accts[0]["live_enabled"] is False
    assert client.post(f"{API}/auth/login", json={"email": "a@example.com", "password": "nope"}).status_code == 401
    tok = client.post(f"{API}/auth/login", json={"email": "a@example.com", "password": PW}).json()
    new = client.post(f"{API}/auth/refresh", json={"refresh_token": tok["refresh_token"]})
    assert new.status_code == 200
    assert client.post(f"{API}/auth/refresh", json={"refresh_token": tok["refresh_token"]}).status_code == 401  # one-time
    h2 = {"Authorization": f"Bearer {new.json()['access_token']}"}
    assert client.post(f"{API}/auth/logout", headers=h2).status_code == 204
    assert client.get(f"{API}/auth/me", headers=h2).status_code == 401     # revoked session is dead immediately
    assert client.get(f"{API}/auth/me", headers={"Authorization": "Bearer junk"}).status_code == 401
    events = {r.event for r in db.query(m.SystemLog)}
    assert {"register", "login", "login_failed", "logout"} <= events


def test_login_lockout_and_rate_limit(client, db):
    register(client)
    get_settings().auth_rate_limit_per_minute = 100
    try:
        for _ in range(5):
            client.post(f"{API}/auth/login", json={"email": "a@example.com", "password": "bad"})
        assert client.post(f"{API}/auth/login", json={"email": "a@example.com", "password": PW}).status_code == 429
    finally:
        get_settings().auth_rate_limit_per_minute = 10
    from app.main import limiter
    limiter.reset()
    codes = [client.post(f"{API}/auth/login", json={"email": "nobody@example.com", "password": "x"}).status_code
             for _ in range(12)]
    assert codes[:10] == [401] * 10 and codes[10:] == [429, 429]


def test_rbac_and_account_isolation(client, db):
    ha, _ = register(client, "a@example.com")
    hb, b = register(client, "b@example.com")
    assert b["user"]["role"] == "trader"
    a_acct = client.get(f"{API}/accounts", headers=ha).json()[0]["id"]
    for path in (f"/accounts/{a_acct}", f"/accounts/{a_acct}/trades", f"/accounts/{a_acct}/journal",
                 f"/accounts/{a_acct}/analytics", f"/dashboard?account_id={a_acct}", f"/accounts/{a_acct}/positions"):
        assert client.get(API + path, headers=hb).status_code == 404, path          # B cannot see A's data
    assert client.post(f"{API}/accounts/{a_acct}/kill-switch", json={"on": True}, headers=hb).status_code == 404
    assert client.get(f"{API}/admin/users", headers=hb).status_code == 403
    assert len(client.get(f"{API}/admin/users", headers=ha).json()) == 2
    uid_b = b["user"]["id"]
    assert client.patch(f"{API}/admin/users/{uid_b}", json={"role": "viewer"}, headers=ha).status_code == 200
    hb2 = {"Authorization": "Bearer " + client.post(f"{API}/auth/login", json={"email": "b@example.com", "password": PW}).json()["access_token"]}
    assert client.get(f"{API}/accounts", headers=hb2).status_code == 200            # viewers can read...
    assert client.post(f"{API}/accounts", json={"name": "x"}, headers=hb2).status_code == 403   # ...not act
    assert client.post(f"{API}/emergency-stop", headers=hb2).status_code == 403


def test_markets_never_fabricate_prices(client, db):
    h, _ = register(client)
    rows = client.get(f"{API}/markets", headers=h).json()
    assert {r["symbol"] for r in rows} >= {"XAUUSD", "BTCUSD", "BTCUSDT", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD"}
    assert all(r["price"] is None and r["live"] is False and r["message"] == "Market data unavailable" for r in rows)
    c = client.get(f"{API}/markets/EURUSD/candles", headers=h).json()
    assert c["available"] is False and c["candles"] == []
    a = client.get(f"{API}/markets/EURUSD/analysis", headers=h).json()
    assert a["available"] is False and "unavailable" in a["message"].lower()
    acct = client.get(f"{API}/accounts", headers=h).json()[0]["id"]
    d = client.get(f"{API}/dashboard?account_id={acct}", headers=h).json()
    assert d["opportunity_message"] == "NO VALID SETUP — WAIT." and d["market_status"]["data_live"] is False


def test_csv_import_validation(client, db):
    h, _ = register(client)
    bad = b"time,open,high,low,close\n2024-01-01 00:00:00,1.1,1.0,1.2,1.1\n2024-01-01 00:05:00,1.1,1.2,1.0,1.1\n"
    r = client.post(f"{API}/data/import/csv", headers=h, data={"symbol": "EURUSD", "source_name": "bad"},
                    files={"file": ("x.csv", bad)})
    assert r.status_code == 422 and "high/low" in r.json()["detail"]
    r = client.post(f"{API}/data/import/csv", headers=h, data={"symbol": "EURUSD", "source_name": "synthetic-x"},
                    files={"file": ("x.csv", bad)})
    assert r.status_code == 422                                           # reserved prefix: cannot mislabel
    mt5 = ("<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>\n" + "".join(
        f"2024.03.06\t09:{i:02d}:00\t1.1000\t1.1005\t1.0995\t1.1002\t50\t0\t9\n" for i in range(0, 60, 5))).encode()
    r = client.post(f"{API}/data/import/csv", headers=h, data={"symbol": "EURUSD", "source_name": "mt5export"},
                    files={"file": ("x.csv", mt5)})
    assert r.status_code == 200 and r.json()["timeframe"] == "M5" and r.json()["candles"] == 12


def test_full_research_pipeline_on_labelled_synthetic_data(client, db):
    h, _ = register(client)
    acct = client.get(f"{API}/accounts", headers=h).json()[0]["id"]
    r = client.post(f"{API}/data/synthetic", headers=h, json={"symbol": "EURUSD", "days": 150, "seed": 11})
    assert r.status_code == 200 and r.json()["synthetic"] is True
    src = r.json()["source"]
    assert client.post(f"{API}/backtests", headers=h, json={"source": "nope"}).status_code == 422
    # --- backtest ---
    bt = client.post(f"{API}/backtests", headers=h, json={
        "source": src, "engine": "london", "symbols": ["EURUSD"], "timeframes": ["M15"], "initial_balance": 10000})
    assert bt.status_code == 202 and bt.json()["status"] == "done" and bt.json()["synthetic"] is True
    run = client.get(f"{API}/backtests/{bt.json()['id']}?include_trades=true", headers=h).json()
    rep = run["report"]
    assert run["label"].startswith("SYNTHETIC") and rep["summary"]["trades"] == len(run["trades"]) > 20
    assert {"in_sample", "out_of_sample", "monthly", "daily", "equity_curve", "by_strategy", "by_session",
            "by_instrument", "by_vol_regime", "rejections", "assumptions"} <= set(rep)
    assert rep["in_sample"]["trades"] + rep["out_of_sample"]["trades"] == rep["summary"]["trades"]
    assert rep["summary"]["final_balance"] == pytest.approx(10000 + sum(t["pnl"] for t in run["trades"]))
    # --- research / selection ---
    rs = client.post(f"{API}/research", headers=h, json={
        "source": src, "plan_ids": ["london:london_breakout:EURUSD:M15", "london:asian_range_sweep:EURUSD:M15"],
        "initial_balance": 10000})
    assert rs.json()["status"] == "done", rs.json()
    cands = client.get(f"{API}/backtests/{rs.json()['id']}", headers=h).json()["candidates"]
    assert len(cands) == 2 and all(c["verdict"] in ("passed", "failed") for c in cands)
    assert all({"walk_forward", "monte_carlo", "cost_sensitivity", "param_grid"} <= set(c["detail"]) for c in cands)
    strategies = client.get(f"{API}/strategies", headers=h).json()
    assert len(strategies) == 2 and all(s["validated_on_synthetic"] and not s["enabled"] for s in strategies)
    # --- paper trading (replay) ---
    sid = strategies[0]["id"]
    assert client.patch(f"{API}/strategies/{sid}", headers=h, json={"enabled": True}).json()["enabled"] is True
    client.post(f"{API}/accounts/{acct}/reset", headers=h, json={"name": "Paper 10k", "initial_balance": 10000})
    rp = client.post(f"{API}/accounts/{acct}/replay", headers=h, json={"symbols": ["EURUSD"], "timeframe": "M15", "source": src})
    assert rp.status_code == 200 and rp.json()["synthetic"] is True and rp.json()["signals"] > 20
    j = client.get(f"{API}/accounts/{acct}/journal?limit=1000", headers=h).json()
    assert j["total"] == rp.json()["signals"]
    outcomes = {i["outcome"] for i in j["items"]}
    assert "executed" in outcomes and all(i["synthetic"] for i in j["items"])
    rej = [i for i in j["items"] if i["outcome"] == "rejected"]
    assert all(i["rejection"]["reasons"] and "NOT traded" in i["explanation"] for i in rej)
    tr = client.get(f"{API}/accounts/{acct}/trades?limit=2000", headers=h).json()
    assert tr["total"] == sum(1 for i in j["items"] if i["outcome"] == "executed") - len(
        client.get(f"{API}/accounts/{acct}/positions", headers=h).json())
    wins = client.get(f"{API}/accounts/{acct}/trades?result=win&symbol=EURUSD&session=london&timeframe=M15", headers=h).json()
    assert 0 < wins["total"] < tr["total"] and all(t["pnl"] > 0 for t in wins["items"])
    an = client.get(f"{API}/accounts/{acct}/analytics", headers=h).json()
    assert an["summary"]["trades"] == tr["total"] and an["synthetic"] is True and an["equity_curve"]
    a = client.get(f"{API}/accounts/{acct}", headers=h).json()
    assert a["balance"] == pytest.approx(10000 + sum(t["pnl"] for t in tr["items"]), abs=1e-6)
    assert client.get(f"{API}/accounts/{acct}/reports/weekly", headers=h).status_code == 200
    mk = {r["symbol"]: r for r in client.get(f"{API}/markets", headers=h).json()}
    assert mk["EURUSD"]["synthetic"] is True and mk["EURUSD"]["live"] is False and mk["XAUUSD"]["price"] is None
    assert client.get(f"{API}/markets/EURUSD/candles?timeframe=H1&limit=50", headers=h).json()["synthetic"] is True
    assert client.get(f"{API}/notifications", headers=h).json()
    # synthetic evidence can never unlock live trading
    assert "Not validated on real data" in str(live_gate.checklist(db, _live_account(db))["items"])


def _live_account(db):
    user = db.query(m.User).first()
    broker = db.query(m.Broker).filter_by(key="binance_spot").one()
    conn = m.BrokerConnection(user_id=user.id, broker_id=broker.id, label="x")
    db.add(conn)
    db.flush()
    a = m.Account(user_id=user.id, name="Live", mode="live", broker_connection_id=conn.id)
    db.add(a)
    db.commit()
    return a


def test_risk_settings_kill_switch_and_emergency_stop(client, db):
    h, _ = register(client)
    acct = client.get(f"{API}/accounts", headers=h).json()[0]["id"]
    assert client.patch(f"{API}/accounts/{acct}/risk", headers=h, json={"risk_per_trade": 0.5}).status_code == 422
    assert client.patch(f"{API}/accounts/{acct}/risk", headers=h, json={"min_rr": 1.0, "risk_per_trade": 0.0025}).json()[
        "risk_config"]["risk_per_trade"] == 0.0025
    k = client.post(f"{API}/accounts/{acct}/kill-switch", headers=h, json={"on": True}).json()
    assert k["kill_switch"] is True and k["account"]["kill_switch"] is True
    assert client.post(f"{API}/accounts/{acct}/trading", headers=h, json={"enabled": True}).status_code == 422  # no feed chosen
    e = client.post(f"{API}/emergency-stop", headers=h).json()
    assert e["stopped_accounts"] == [acct]
    assert client.get(f"{API}/accounts/{acct}/risk-events", headers=h).json()[0]["kind"] == "kill_switch"


def test_settings_sessions_and_notification_preferences(client, db):
    h, _ = register(client)
    s = client.get(f"{API}/settings", headers=h).json()
    assert s["jurisdiction"] == "IN" and [x["ist_start"] for x in s["sessions"]] == ["08:00", "13:00", "18:00"]
    assert client.patch(f"{API}/settings", headers=h, json={"jurisdiction": "AE"}).status_code == 422   # needs declaration
    s = client.patch(f"{API}/settings", headers=h, json={"session_preset": "dst_anchored",
                                                         "notifications": {"opportunity": False}}).json()
    assert s["sessions"][1]["tz"] == "Europe/London" and s["notifications"]["opportunity"] is False
    bad = [{"key": "asia", "name": "A", "start": "08:00", "end": "12:00", "tz": "Mars/Olympus"}]
    assert client.patch(f"{API}/settings", headers=h, json={"sessions": bad}).status_code == 422
    assert client.post(f"{API}/push-tokens", headers=h, json={"token": "ExponentPushToken[abc123xyz]"}).status_code == 204


def test_broker_compliance_and_live_gate(client, db):
    h, _ = register(client)
    br = client.get(f"{API}/brokers", headers=h).json()
    by = {b["key"]: b for b in br["brokers"]}
    assert br["jurisdiction"] == "IN" and by["exness_mt5"]["eligibility"]["forex_cfd"]["status"] == "blocked"
    assert by["mt5"]["integration_status"] == "simulated_only" and by["exness_api"]["integration_status"] == "not_implemented"
    assert client.post(f"{API}/broker-connections", headers=h, json={"broker": "exness_api", "label": "x"}).status_code == 422
    c = client.post(f"{API}/broker-connections", headers=h, json={
        "broker": "exness_mt5", "label": "Exness", "config": {"bridge_url": "http://127.0.0.1:9"},
        "credentials": {"bridge_secret": "super-secret-value-0123456789"}}).json()
    row = db.get(m.BrokerConnection, c["id"])
    assert "super-secret" not in row.credentials_enc and "bridge_secret" not in str(c)       # encrypted at rest, never echoed
    assert decrypt_secret(row.credentials_enc)["bridge_secret"] == "super-secret-value-0123456789"
    t = client.post(f"{API}/broker-connections/{c['id']}/test", headers=h).json()
    assert t["status"] == "failed"                                        # nothing is listening: reported, not assumed
    # an Indian resident cannot attest the block away, nor register a live Exness account
    r = client.post(f"{API}/compliance/attest", headers=h, json={"broker": "exness_mt5", "asset_class": "forex_cfd",
                                                                 "account_type": "real", "statement": "ok"})
    assert r.status_code == 403
    r = client.post(f"{API}/accounts/live", headers=h, json={"name": "Exness live", "connection_id": c["id"]})
    assert r.status_code == 403 and "RBI Alert List" in str(r.json())
    # a crypto-spot connection can be registered, but live stays locked behind the checklist
    b = client.post(f"{API}/broker-connections", headers=h, json={
        "broker": "binance_spot", "label": "Binance", "credentials": {"api_key": "k", "api_secret": "s"}}).json()
    live = client.post(f"{API}/accounts/live", headers=h, json={"name": "Spot", "connection_id": b["id"]}).json()
    assert live["live_enabled"] is False
    chk = client.get(f"{API}/accounts/{live['id']}/live/checklist", headers=h).json()
    assert chk["eligible"] is False and {i["key"] for i in chk["items"] if not i["ok"]} >= {
        "broker_tested", "permissions", "regulatory", "specs", "strategies", "forward_test", "risk_controls"}
    st = client.post(f"{API}/accounts/{live['id']}/live/selftest", headers=h).json()
    assert st["passed"] is True
    arm = client.post(f"{API}/accounts/{live['id']}/live/arm", headers=h, json={"password": PW})
    assert arm.status_code == 409 and "prerequisites" in str(arm.json())
    assert client.post(f"{API}/accounts/{live['id']}/trading", headers=h, json={"enabled": True, "feed": "binance"}).status_code == 409
    paper = client.get(f"{API}/accounts", headers=h).json()[0]
    pc = client.get(f"{API}/accounts/{paper['id']}/live/checklist", headers=h).json()
    assert pc["eligible"] is False and "never" in pc["items"][0]["detail"]


def test_two_step_live_activation(db, user):
    """Unit-level walk through arm -> confirm with every prerequisite satisfied."""
    from datetime import timedelta
    from app.db import utcnow
    from tests.conftest import make_account, make_cfg
    user.jurisdiction = "AE"
    broker = db.query(m.Broker).filter_by(key="binance_spot").one()
    now = utcnow()
    conn = m.BrokerConnection(user_id=user.id, broker_id=broker.id, label="b", status="ok", last_test_at=now,
                              account_type="real", last_test_result={"trade_allowed": True, "withdrawals_enabled": False})
    db.add(conn)
    db.flush()
    live = m.Account(user_id=user.id, name="Live", mode="live", broker_connection_id=conn.id)
    db.add(live)
    cfg = make_cfg(db, user, "asia:asian_orb:BTCUSDT:M15", validation_status="passed", validation_source="binance")
    db.query(m.Instrument).filter_by(symbol="BTCUSDT").update({"spec_verified": True})
    db.add(m.ComplianceAttestation(user_id=user.id, broker_key="binance_spot", asset_class="crypto_spot",
                                   jurisdiction="AE", statement="x"))
    paper = make_account(db, user, feed={"type": "binance"})
    for i in range(40):
        t = now - timedelta(days=i % 25, minutes=i)
        db.add(m.Trade(account_id=paper.id, mode="paper", plan_id=cfg.plan_id, symbol="BTCUSDT", side="buy", volume=0.001,
                       entry_price=1, exit_price=1, opened_at=t, closed_at=t, gross=1, pnl=1, r_multiple=0.3,
                       exit_reason="take_profit"))
    db.commit()
    assert [i["key"] for i in live_gate.checklist(db, live)["items"] if not i["ok"]] == ["risk_controls"]
    with pytest.raises(PermissionError):
        live_gate.arm(db, live)
    live.live_state = {"risk_selftest": {"passed": True, "ran_at": now.isoformat()}}
    db.commit()
    code = live_gate.arm(db, live)
    assert live.live_enabled is False                                       # step 1 alone enables nothing
    with pytest.raises(PermissionError):
        live_gate.confirm(db, live, code, "enable live trading")           # exact phrase required
    with pytest.raises(PermissionError):
        live_gate.confirm(db, live, "000000" if code != "000000" else "111111", live_gate.CONFIRM_PHRASE)
    with pytest.raises(PermissionError):
        live_gate.confirm(db, live, code, live_gate.CONFIRM_PHRASE, now=now + timedelta(minutes=6))   # code expired
    live_gate.confirm(db, live, code, live_gate.CONFIRM_PHRASE)
    assert live.live_enabled and live.first_live_order_confirmed is False and live_gate.blocking_reasons(db, live) == []
    paper.feed = {"type": "replay", "replay_used": True}                    # replayed evidence does not count
    db.commit()
    assert any("forward" in r.lower() or "Paper trading" in r for r in live_gate.blocking_reasons(db, live))
    user.jurisdiction = "IN"
    db.commit()
    assert any("eligibility" in r for r in live_gate.blocking_reasons(db, live))


def test_websocket_requires_a_valid_token(client, db):
    h, body = register(client)
    with client.websocket_connect(f"{API}/ws?token={body['access_token']}") as ws:
        assert ws.receive_json()["type"] == "hello"
        ws.send_text("ping")
        assert ws.receive_json()["type"] == "pong"
    with pytest.raises(Exception):
        with client.websocket_connect(f"{API}/ws?token=bad"):
            pass
