import os

os.environ["ATP_ENV"] = "test"
os.environ["ATP_DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", "sqlite://")
os.environ["ATP_REDIS_URL"] = ""
os.environ["ATP_ANTHROPIC_API_KEY"] = ""

from datetime import datetime, timezone  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import db as dbm  # noqa: E402
from app import models  # noqa: E402
from app.brokers.base import Quote  # noqa: E402
from app.brokers.registry import seed_brokers  # noqa: E402
from app.core import notify  # noqa: E402
from app.core.trading import seed_instruments  # noqa: E402
from app.data.synthetic import generate  # noqa: E402
from app.security import hash_password  # noqa: E402

PW = "Str0ngPassw0rd!"
T0 = datetime(2024, 3, 6, 9, 0, tzinfo=timezone.utc)      # Wednesday 14:30 IST (London session)


@pytest.fixture(scope="session")
def _engine():
    eng = dbm.configure(os.environ["ATP_DATABASE_URL"])
    dbm.Base.metadata.drop_all(eng)
    dbm.Base.metadata.create_all(eng)
    yield eng
    dbm.Base.metadata.drop_all(eng)


@pytest.fixture()
def db(_engine):
    with _engine.begin() as c:
        for t in reversed(dbm.Base.metadata.sorted_tables):
            c.execute(t.delete())
    from app import runner
    runner.QUOTES.clear()
    runner._last_candle.clear()
    pushes = []
    notify.set_pusher(lambda tokens, title, body, data: (pushes.append((title, body)), "test")[1])
    s = dbm.SessionLocal()
    seed_brokers(s)
    seed_instruments(s)
    s.commit()
    s.pushes = pushes
    yield s
    s.rollback()
    s.close()
    notify.set_pusher(None)


@pytest.fixture()
def client(db):
    from app.main import app, limiter
    limiter.reset()
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def user(db):
    u = models.User(email="trader@example.com", password_hash=hash_password(PW), role="trader")
    db.add(u)
    db.commit()
    return u


def make_account(db, user, balance=10_000.0, **kw):
    a = models.Account(user_id=user.id, name="Paper", mode="paper", initial_balance=balance, balance=balance,
                       equity=balance, peak_equity=balance, day_start_equity=balance, **kw)
    db.add(a)
    db.commit()
    return a


def make_cfg(db, user, plan_id="london:london_breakout:EURUSD:M15", **kw):
    engine, label, symbol, tf = plan_id.split(":")
    from app.core.engines import plan_from_id
    p = plan_from_id(plan_id)
    c = models.StrategyConfig(user_id=user.id, plan_id=plan_id, engine=engine, strategy_key=p.strategy, label=label,
                              symbol=symbol, timeframe=tf, params=dict(p.params), enabled=True, status="active",
                              **kw)
    db.add(c)
    db.commit()
    return c


def quote(symbol="EURUSD", mid=1.1, spread=0.0001, ts=T0):
    return Quote(symbol, mid - spread / 2, mid + spread / 2, ts, "test")


def signal(side=1, sl=1.098, ts=T0, price=1.1, rr=2.0):
    return {"side": side, "sl": sl, "rr": rr, "score": 1.0, "reason": "test setup", "candle_ts": ts, "price": price}


@pytest.fixture(scope="session")
def m5():
    return generate("EURUSD", days=150, seed=11)


def register(client, email="a@example.com"):
    r = client.post("/api/v1/auth/register", json={"email": email, "password": PW})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}, r.json()
