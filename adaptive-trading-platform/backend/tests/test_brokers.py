"""Broker adapters. MT5: adapter <-> bridge contract against a SIMULATED
MetaTrader5 module (not a real terminal). Binance: request construction against
a mock transport (not the real exchange)."""
import hashlib
import hmac
import importlib.util
import pathlib
import sys
from urllib.parse import parse_qsl, urlsplit

import httpx
import pytest
from fastapi.testclient import TestClient

from app.brokers.base import BrokerError, BrokerUnavailable, NotSupported, OrderRejected, OrderRequest
from app.brokers.binance import BinanceFuturesAdapter, BinanceMarketData, BinanceSpotAdapter
from app.brokers.exness import ExnessNativeAdapter
from app.brokers.mt5 import MT5Adapter
from app.core import compliance
from tests.fake_mt5 import FakeMT5

SECRET = "bridge-secret-for-tests-0123456789"
spec = importlib.util.spec_from_file_location(
    "mt5_bridge", pathlib.Path(__file__).resolve().parents[2] / "mt5-bridge" / "bridge.py")
bridge = importlib.util.module_from_spec(spec)
sys.modules["mt5_bridge"] = bridge
spec.loader.exec_module(bridge)


@pytest.fixture()
def rig(tmp_path):
    fake = FakeMT5()
    app = bridge.create_app(fake, SECRET, str(tmp_path / "orders.json"), clock=lambda: fake.now)
    tc = TestClient(app)
    import time
    orig = time.time
    time.time = lambda: fake.now
    adapter = MT5Adapter("http://testserver", SECRET, {"EURUSD": "EURUSDm"}, transport=tc._transport)
    yield fake, adapter, tc, app, tmp_path
    time.time = orig
    adapter.close()


def test_bridge_rejects_unsigned_wrong_and_replayed_requests(rig):
    fake, adapter, tc, *_ = rig
    assert tc.get("/account").status_code == 401
    bad = MT5Adapter("http://testserver", "wrong-secret-wrong-secret-000", transport=tc._transport)
    with pytest.raises(BrokerError):
        bad.account_info()
    from app.security import sign_request
    ts, nonce = str(fake.now), "n" * 24
    h = {"X-Bridge-Timestamp": ts, "X-Bridge-Nonce": nonce,
         "X-Bridge-Signature": sign_request(SECRET, "GET", "/account", b"", ts, nonce)}
    assert tc.get("/account", headers=h).status_code == 200
    assert tc.get("/account", headers=h).status_code == 401              # replayed nonce
    old = str(fake.now - 600)
    h2 = {"X-Bridge-Timestamp": old, "X-Bridge-Nonce": "m" * 24,
          "X-Bridge-Signature": sign_request(SECRET, "GET", "/account", b"", old, "m" * 24)}
    assert tc.get("/account", headers=h2).status_code == 401             # stale timestamp


def test_account_quote_spec_candles_roundtrip(rig):
    fake, adapter, *_ = rig
    info = adapter.account_info()
    assert (info.account_type, info.trade_allowed, info.leverage, info.balance) == ("demo", True, 200, 10_000.0)
    q = adapter.quote("EURUSD")                                           # platform symbol -> broker symbol map
    assert (q.bid, q.ask, q.symbol) == (1.1, 1.10009, "EURUSD")
    s = adapter.symbol_spec("EURUSD")
    assert s["contract_size"] == 100_000 and s["min_volume"] == 0.01 and s["spread"] == pytest.approx(0.00009)
    assert s["margin_rate"] == pytest.approx(1 / 200) and "swap_long_raw" in s and "swap_long" not in s
    df = adapter.candles("EURUSD", "M5", limit=20)
    assert len(df) == 20 and list(df.columns) == ["open", "high", "low", "close", "volume", "spread"]
    assert adapter.test_connection()["ok"] is True


def test_incorrect_symbol_mapping_is_detected(rig):
    _, adapter, *_ = rig
    with pytest.raises(OrderRejected, match="unknown symbol"):
        adapter.quote("XAUUSD")                                           # not mapped / not offered by this broker


def test_order_lifecycle_and_idempotency(rig):
    fake, adapter, *_ = rig
    req = OrderRequest("a" * 32, "EURUSD", 1, 0.10, sl=1.098, tp=1.104)
    r1 = adapter.place_order(req)
    assert r1.status == "filled" and r1.fill_price == 1.10009 and r1.position_id
    sent = fake.sent[0]
    assert sent["symbol"] == "EURUSDm" and sent["sl"] == 1.098 and sent["comment"] == "a" * 28
    r2 = adapter.place_order(req)                                         # retry of the same client id
    assert r2.duplicate and r2.position_id == r1.position_id and len(fake.sent) == 1
    assert adapter.find_order("a" * 32).status == "filled" and adapter.find_order("z" * 32) is None
    pos = adapter.positions()
    assert len(pos) == 1 and pos[0].symbol == "EURUSD" and pos[0].side == 1
    adapter.modify_position(pos[0].position_id, 1.0990, 1.1050)
    assert adapter.positions()[0].sl == 1.0990
    c = adapter.close_position(pos[0].position_id, "close-" + "a" * 20, 0.10)
    assert c.status == "filled" and adapter.positions() == []
    assert adapter.close_position(pos[0].position_id, "close-" + "a" * 20, 0.10).duplicate   # close is idempotent too


def test_idempotency_survives_a_bridge_restart(rig):
    fake, adapter, tc, app, tmp = rig
    adapter.place_order(OrderRequest("b" * 32, "EURUSD", -1, 0.05))
    app2 = bridge.create_app(fake, SECRET, str(tmp / "orders.json"), clock=lambda: fake.now)
    a2 = MT5Adapter("http://testserver", SECRET, {"EURUSD": "EURUSDm"}, transport=TestClient(app2)._transport)
    assert a2.place_order(OrderRequest("b" * 32, "EURUSD", -1, 0.05)).duplicate and len(fake.sent) == 1
    (tmp / "orders.json").unlink()                                        # journal lost: recover from the comment tag
    app3 = bridge.create_app(fake, SECRET, str(tmp / "orders.json"), clock=lambda: fake.now)
    a3 = MT5Adapter("http://testserver", SECRET, {"EURUSD": "EURUSDm"}, transport=TestClient(app3)._transport)
    assert a3.place_order(OrderRequest("b" * 32, "EURUSD", -1, 0.05)).duplicate and len(fake.sent) == 1


def test_rejected_orders_and_volume_limits(rig):
    fake, adapter, *_ = rig
    fake.next_retcode = 10019
    with pytest.raises(OrderRejected, match="10019"):
        adapter.place_order(OrderRequest("c" * 32, "EURUSD", 1, 0.10))
    with pytest.raises(OrderRejected, match="original result"):           # a retry does not re-send it
        adapter.place_order(OrderRequest("c" * 32, "EURUSD", 1, 0.10))
    assert len(fake.sent) == 1
    with pytest.raises(OrderRejected, match="outside"):
        adapter.place_order(OrderRequest("d" * 32, "EURUSD", 1, 0.001))


def test_terminal_and_broker_disconnection_are_reported(rig):
    fake, adapter, *_ = rig
    fake.connected = False
    h = adapter.health()
    assert h["ok"] is False and h["broker_connected"] is False
    with pytest.raises(BrokerUnavailable):
        adapter.place_order(OrderRequest("e" * 32, "EURUSD", 1, 0.10))
    assert fake.sent == []
    fake.available = False
    fresh = bridge.create_app(fake, SECRET, None, clock=lambda: fake.now)
    a = MT5Adapter("http://testserver", SECRET, transport=TestClient(fresh)._transport)
    assert a.health()["terminal"] is False
    with pytest.raises(BrokerUnavailable):
        a.account_info()
    dead = MT5Adapter("http://127.0.0.1:9", SECRET, timeout=0.3)
    assert dead.health() == {"ok": False, "bridge_reachable": False, "error": dead.health()["error"]}


def test_real_account_is_reported_as_real(rig):
    fake, adapter, *_ = rig
    fake.trade_mode = fake.ACCOUNT_TRADE_MODE_REAL
    assert adapter.account_info().account_type == "real"


def test_bridge_refuses_to_start_without_a_strong_secret():
    with pytest.raises(RuntimeError):
        bridge.create_app(FakeMT5(), "short", None)


# ------------------------------------------------------------------------ Binance
def mock(handler):
    return httpx.MockTransport(handler)


def test_binance_signed_order_request():
    seen = {}

    def handler(req: httpx.Request):
        seen["req"] = req
        return httpx.Response(200, json={"clientOrderId": "cid123", "orderId": 77, "status": "FILLED",
                                         "executedQty": "0.00100000", "cummulativeQuoteQty": "60.5"})
    a = BinanceSpotAdapter("key", "secret", transport=mock(handler))
    r = a.place_order(OrderRequest("cid123", "BTCUSDT", 1, 0.001))
    req = seen["req"]
    assert req.method == "POST" and req.url.path == "/api/v3/order" and req.headers["X-MBX-APIKEY"] == "key"
    query = urlsplit(str(req.url)).query
    unsigned, sig = query.rsplit("&signature=", 1)
    assert sig == hmac.new(b"secret", unsigned.encode(), hashlib.sha256).hexdigest()
    p = dict(parse_qsl(unsigned))
    assert p["newClientOrderId"] == "cid123" and p["side"] == "BUY" and p["type"] == "MARKET" and "timestamp" in p
    assert r.status == "filled" and r.fill_price == pytest.approx(60_500.0)


def test_binance_refuses_keys_with_withdrawal_permission_and_has_no_withdraw_call():
    def handler(req):
        if req.url.path.endswith("apiRestrictions"):
            return httpx.Response(200, json={"enableWithdrawals": True, "ipRestrict": False})
        return httpx.Response(200, json={"serverTime": 0, "canTrade": True, "balances": []})
    a = BinanceSpotAdapter("key", "secret", transport=mock(handler))
    with pytest.raises(BrokerError, match="WITHDRAWAL"):
        a.test_connection()
    assert not [n for n in dir(a) if "withdraw" in n.lower()]


def test_binance_errors_map_to_rejected_or_unavailable():
    a = BinanceSpotAdapter("k", "s", transport=mock(lambda r: httpx.Response(
        400, json={"code": -2010, "msg": "Account has insufficient balance for requested action."})))
    with pytest.raises(OrderRejected, match="insufficient"):
        a.place_order(OrderRequest("x1", "BTCUSDT", 1, 1))
    b = BinanceSpotAdapter("k", "s", transport=mock(lambda r: httpx.Response(503, text="busy")))
    with pytest.raises(BrokerUnavailable):
        b.place_order(OrderRequest("x2", "BTCUSDT", 1, 1))

    def boom(req):
        raise httpx.ConnectError("network down")
    c = BinanceSpotAdapter("k", "s", transport=mock(boom))
    with pytest.raises(BrokerUnavailable):
        c.place_order(OrderRequest("x3", "BTCUSDT", 1, 1))


def test_binance_klines_parsing_and_spot_futures_separation():
    rows = [[1709715600000, "60000.0", "60100.0", "59900.0", "60050.0", "12.5", 1709715899999, "0", 1, "0", "0", "0"]]
    md = BinanceMarketData(transport=mock(lambda r: httpx.Response(200, json=rows)))
    df = md.klines("BTCUSDT", "M5")
    assert df.index[0].isoformat() == "2024-03-06T09:00:00+00:00" and df["close"].iloc[0] == 60050.0
    assert BinanceSpotAdapter.supports_short is False and BinanceFuturesAdapter.supports_short is True
    assert BinanceFuturesAdapter.ORDER.startswith("/fapi/") and BinanceSpotAdapter.ORDER.startswith("/api/")
    assert BinanceFuturesAdapter.BASE != BinanceSpotAdapter.BASE


# ------------------------------------------------------------------ Exness / rules
def test_exness_native_api_is_not_invented():
    with pytest.raises(NotSupported, match="not implemented"):
        ExnessNativeAdapter().account_info()


@pytest.mark.parametrize("broker,ac,status", [
    ("exness_mt5", "forex_cfd", "blocked"), ("exness_mt5", "metal_cfd", "blocked"),
    ("exness_api", "crypto_cfd", "blocked"), ("mt5", "forex_cfd", "blocked"),
    ("binance_spot", "crypto_spot", "attestation_required"), ("paper", "forex_cfd", "ok"),
    ("unknown_broker", "forex_cfd", "blocked"),
])
def test_india_eligibility_rules(broker, ac, status):
    assert compliance.evaluate("IN", broker, ac).status == status


def test_india_block_cannot_be_attested_away_but_demo_is_separate():
    r = compliance.evaluate("IN", "exness_mt5", "forex_cfd", attested=True, account_type="real")
    assert r.status == "blocked" and any("RBI Alert List" in x for x in r.reasons)
    assert compliance.evaluate("IN", "exness_mt5", "forex_cfd", account_type="demo").status == "attestation_required"
    assert compliance.evaluate("", "mt5", "forex_cfd").status == "blocked"
    assert compliance.evaluate("AE", "mt5", "forex_cfd").status == "attestation_required"
    assert compliance.evaluate("AE", "mt5", "forex_cfd", attested=True).status == "ok"
