"""Indicators, market structure, multi-timeframe alignment and look-ahead safety."""
from datetime import datetime, time, timezone

import numpy as np
import pandas as pd
import pytest

from app.core import indicators as ind
from app.core import structure as st
from app.core.engines import candidate_plans
from app.core.instruments import DEFAULT_SPECS, SpecError, get_spec
from app.core.mtf import align_htf, resample
from app.core.sessions import DEFAULT_SESSIONS, DST_ANCHORED_SESSIONS, market_open, rollovers_between
from app.data.synthetic import generate


def test_rsi_bounds_and_known_extremes():
    up = pd.Series(np.arange(1, 60, dtype=float))
    assert ind.rsi(up).iloc[-1] == 100
    assert ind.rsi(up[::-1].reset_index(drop=True)).iloc[-1] == pytest.approx(0, abs=1e-9)


def test_ema_matches_definition():
    s = pd.Series([1.0, 2, 3, 4, 5, 6])
    k = 2 / (3 + 1)
    exp = [1.0]
    for x in s[1:]:
        exp.append(exp[-1] + k * (x - exp[-1]))
    assert ind.ema(s, 3).iloc[-1] == pytest.approx(exp[-1])


def test_atr_constant_range():
    idx = pd.date_range("2024-01-01", periods=60, freq="5min", tz="UTC")
    df = pd.DataFrame({"open": 10.0, "high": 11.0, "low": 9.0, "close": 10.0}, index=idx)
    assert ind.atr(df).iloc[-1] == pytest.approx(2.0)


def test_bollinger_and_macd_shapes(m5):
    bb = ind.bollinger(m5["close"])
    assert (bb["bb_upper"].dropna() >= bb["bb_lower"].dropna()).all()
    assert set(ind.macd(m5["close"]).columns) == {"macd", "macd_signal", "macd_hist"}
    a = ind.adx(m5)["adx"].dropna()
    assert ((a >= 0) & (a <= 100)).all()
    k = ind.stochastic(m5)["stoch_k"].dropna()
    assert ((k >= -1e-9) & (k <= 100 + 1e-9)).all()


def test_swing_points_are_only_published_after_confirmation():
    idx = pd.date_range("2024-01-01", periods=11, freq="5min", tz="UTC")
    high = [1, 2, 3, 9, 3, 2, 1, 1, 1, 1, 1]
    df = pd.DataFrame({"open": 1.0, "high": np.array(high, float), "low": 0.5, "close": 1.0}, index=idx)
    sw = st.swings(df, k=3)
    assert not sw["swing_high_confirmed"].iloc[:6].any()       # peak at bar 3 unknown until bar 6
    assert sw["swing_high_confirmed"].iloc[6] and sw["last_swing_high"].iloc[6] == 9


def test_sweep_detection():
    idx = pd.date_range("2024-01-01", periods=1, freq="5min", tz="UTC")
    df = pd.DataFrame({"open": [1.0], "high": [1.2], "low": [0.95], "close": [1.05]}, index=idx)
    s = st.sweep(df, pd.Series([1.1], index=idx), pd.Series([0.9], index=idx))
    assert s["sweep_high"].iloc[0] and not s["sweep_low"].iloc[0]


def test_session_windows_in_ist_and_dst_shift():
    lon = DEFAULT_SESSIONS["london"]
    t = datetime(2024, 3, 6, 8, 0, tzinfo=timezone.utc)        # 13:30 IST
    assert lon.is_active(t) and not DEFAULT_SESSIONS["asia"].is_active(t)
    anchored = DST_ANCHORED_SESSIONS["london"]
    winter = anchored.window_in_ist(datetime(2024, 1, 15, 12, tzinfo=timezone.utc))[0]
    summer = anchored.window_in_ist(datetime(2024, 7, 15, 12, tzinfo=timezone.utc))[0]
    assert (winter.time(), summer.time()) == (time(13, 30), time(12, 30))   # London DST moves the IST window


def test_market_hours_and_swap_nights():
    sat = datetime(2024, 3, 9, 12, tzinfo=timezone.utc)
    assert not market_open(False, sat) and market_open(True, sat)
    mon, tue = datetime(2024, 3, 4, 12, tzinfo=timezone.utc), datetime(2024, 3, 5, 12, tzinfo=timezone.utc)
    assert rollovers_between(mon, tue) == 1
    assert rollovers_between(datetime(2024, 3, 6, 12, tzinfo=timezone.utc),
                             datetime(2024, 3, 7, 12, tzinfo=timezone.utc)) == 3      # Wednesday triple swap


def test_session_range_is_published_only_after_the_window_closes(m5):
    m15 = resample(m5, "M15")
    r = st.session_range(m15, DEFAULT_SESSIONS["asia"], 60)
    mfs = DEFAULT_SESSIONS["asia"].minutes_from_start(m15.index)
    inside = DEFAULT_SESSIONS["asia"].mask(m15.index) & (mfs < 45)
    assert r["range_high"][inside].isna().all()
    assert not r["range_ready"][inside].any()


def test_resample_and_htf_alignment_never_use_an_unfinished_bar(m5):
    h1 = resample(m5, "H1")
    feat = pd.DataFrame({"close": h1["close"]}, index=h1.index)
    al = align_htf(m5, feat, "H1", 5)
    # base bar opening 10:20 closes 10:25: the 10:00 H1 bar (closes 11:00) must NOT be visible
    i = np.where((m5.index.minute == 20) & (m5.index.hour == 10))[0][5]
    t = m5.index[i]
    prev_hour = t.floor("h") - pd.Timedelta(hours=1)
    assert al["h1_close"].iloc[i] == h1["close"].loc[prev_hour]
    # the base bar opening hh:55 closes exactly when the H1 bar closes -> that bar is visible
    j = np.where((m5.index.minute == 55) & (m5.index.hour == 10))[0][5]
    assert al["h1_close"].iloc[j] == h1["close"].loc[m5.index[j].floor("h")]


@pytest.mark.parametrize("plan", candidate_plans(symbols=["EURUSD", "USDJPY"], timeframes=["M15"]) +
                         candidate_plans("asia", ["AUDUSD"], ["M15"]), ids=lambda p: p.plan_id)
def test_no_lookahead_signals_are_identical_on_truncated_history(plan, m5):
    """Decisions for candle i must not change when later candles are appended."""
    df = resample(m5, "M15")
    spec = get_spec(plan.symbol if plan.symbol in ("EURUSD",) else "EURUSD")
    full = plan.generate(df, spec)
    for cut in (len(df) - 1500, len(df) - 400, len(df) - 37):
        part = plan.generate(df.iloc[:cut], spec)
        a, b = full.iloc[:cut].tail(1200), part.tail(1200)
        assert (a["side"].to_numpy() == b["side"].to_numpy()).all()
        m = a["side"].to_numpy() != 0
        np.testing.assert_allclose(a["sl"].to_numpy()[m], b["sl"].to_numpy()[m], rtol=1e-9)


def test_every_strategy_emits_some_signal_and_valid_stops(m5):
    df = resample(m5, "M15")
    spec = get_spec("EURUSD")
    seen = set()
    for plan in candidate_plans(symbols=["EURUSD"], timeframes=["M15"]):
        s = plan.generate(df, spec)
        sig = s[s["side"] != 0]
        if len(sig):
            seen.add(plan.strategy)
            c = df["close"].loc[sig.index]
            assert ((sig["side"] > 0) == (sig["sl"] < c)).all()      # stop always on the protective side
            assert DEFAULT_SESSIONS[plan.engine].mask(sig.index).all()  # only inside the session window
    assert seen >= {"range_breakout", "liquidity_sweep", "breakout_retest", "trend_continuation",
                    "volatility_squeeze", "momentum_breakout"}


def test_spot_never_shorts():
    df = resample(generate("BTCUSDT", days=60, price=60000, annual_vol=0.5, seed=4, weekend=True), "M15")
    for plan in candidate_plans("asia", ["BTCUSDT"], ["M15"]):
        assert (plan.generate(df, get_spec("BTCUSDT"))["side"] >= 0).all()


def test_instrument_specs_differ_by_asset_class_and_validate():
    assert DEFAULT_SPECS["BTCUSDT"].allow_short is False and DEFAULT_SPECS["BTCUSDT"].margin_rate == 1.0
    assert DEFAULT_SPECS["BTCUSD"].allow_short and DEFAULT_SPECS["BTCUSD"].margin_rate < 1
    assert DEFAULT_SPECS["USDJPY"].quote_to_usd(150.0) == pytest.approx(1 / 150)
    assert DEFAULT_SPECS["XAUUSD"].contract_size == 100
    with pytest.raises(SpecError):
        DEFAULT_SPECS["EURUSD"].with_overrides(contract_size=0)
    with pytest.raises(SpecError):
        get_spec("DOGEUSD")
    assert not any(s.verified for s in DEFAULT_SPECS.values())
