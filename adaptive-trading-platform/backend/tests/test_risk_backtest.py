"""Risk engine, fill model, backtester arithmetic and validation tooling."""
from dataclasses import replace

import numpy as np
import pandas as pd
import pytest

from app.core import execution as ex
from app.core import metrics
from app.core.backtest import BacktestConfig, PlanData, run_backtest
from app.core.engines import plan_from_id
from app.core.instruments import DEFAULT_SPECS
from app.core.live_gate import risk_selftest
from app.core.mtf import resample
from app.core.risk import OpenRisk, OrderIntent, PortfolioState, RiskConfig, RiskEngine
from app.core.validation import (SelectionCriteria, chronological_split, monte_carlo, research_plan,
                                 select_parameters, walk_forward)

EUR = DEFAULT_SPECS["EURUSD"]
PLAN = plan_from_id("london:london_breakout:EURUSD:M15")


def intent(spec=EUR, side=1, mid=1.1, sl=1.098, rr=2.0, spread=None, **kw):
    spread = spec.typical_spread if spread is None else spread
    q = spec.quote_to_usd(mid)
    p = ex.plan_trade(spec, side, mid, spread, sl, rr, q)
    return OrderIntent(spec.symbol, side, p.entry, p.sl, p.tp, p.risk_per_unit, p.reward_per_unit, spread, q, **kw)


def state(eq=10_000.0, **kw):
    return PortfolioState(equity=eq, balance=eq, day_start_equity=kw.pop("day_start", eq), **kw)


def test_position_size_risks_half_a_percent_of_equity():
    d = RiskEngine().evaluate(intent(), EUR, state())
    # entry 1.10007, stop 1.09800, stop slippage 0.00002 -> 0.00209 per unit = $209 per lot; budget $50
    assert d.approved and d.volume == 0.23
    assert d.risk_usd == pytest.approx(0.23 * 209.0, rel=1e-6)
    assert d.risk_usd <= 50.0 and d.rr_net == pytest.approx(2.0)


def test_target_is_two_r_net_of_costs():
    spec = DEFAULT_SPECS["BTCUSDT"]          # 0.1% commission per side
    p = ex.plan_trade(spec, 1, 60_000.0, 0.5, 59_400.0, 2.0, 1.0)
    cost = 2 * p.entry * spec.commission_rate
    assert p.reward_per_unit == pytest.approx(2 * p.risk_per_unit)
    assert p.tp - p.entry == pytest.approx(2 * p.risk_per_unit + cost)     # gross target must also pay the fees


def test_usdjpy_risk_is_converted_to_usd():
    spec = DEFAULT_SPECS["USDJPY"]
    d = RiskEngine().evaluate(intent(spec, mid=150.0, sl=149.7), spec, state())
    per_lot_usd = d.detail["risk_per_lot_usd"]
    assert per_lot_usd == pytest.approx((150.0 + 0.006 + 0.002 - 149.7 + 0.002) * 100_000 / 150.0, rel=1e-3)
    assert d.approved and d.risk_usd <= 50.0


def test_small_account_min_lot_is_rejected_not_rounded_up():
    d = RiskEngine().evaluate(intent(), EUR, state(300.0))
    assert not d.approved and d.reasons == ["MIN_LOT_EXCEEDS_RISK"]
    assert d.detail["min_lot_risk_usd"] > d.detail["risk_budget_usd"]


@pytest.mark.parametrize("kw,code", [
    (dict(kill_switch=True), "KILL_SWITCH"),
    (dict(halted="broker_unstable"), "TRADING_HALTED"),
    (dict(consecutive_losses=3), "LOSS_STREAK"),
    (dict(day_start=10_250.0), "DAILY_LOSS_LIMIT"),                       # down 2.4% on the day
    (dict(open=[OpenRisk("USDJPY", 1, 0.1, 10, 100, "JPY"), OpenRisk("XAUUSD", 1, 0.1, 10, 100, "GOLD")]), "MAX_POSITIONS"),
    (dict(open=[OpenRisk("GBPUSD", 1, 0.1, 10, 100, "USD_MAJORS")]), "CORRELATED_EXPOSURE"),
    (dict(open=[OpenRisk("EURUSD", 1, 0.1, 10, 100, "USD_MAJORS")]), "DUPLICATE_SYMBOL"),
    (dict(open=[OpenRisk("USDJPY", 1, 0.1, 60, 100, "JPY")]), "PORTFOLIO_RISK"),
    (dict(day_start=10_160.0), "DAILY_LOSS_BUDGET"),                      # 1.57% down + 0.5% new risk > 2%
])
def test_account_level_rejections(kw, code):
    d = RiskEngine().evaluate(intent(), EUR, state(**kw))
    assert not d.approved and code in d.reasons and d.volume == 0


def test_order_level_rejections():
    eng = RiskEngine()
    low_rr = replace(intent(), reward_per_unit=0.003)
    assert "RR_TOO_LOW" in eng.evaluate(low_rr, EUR, state()).reasons
    assert "INVALID_STOP" in eng.evaluate(intent(sl=1.102), EUR, state()).reasons
    assert "STOP_TOO_TIGHT" in eng.evaluate(intent(sl=1.0999), EUR, state()).reasons
    spot = DEFAULT_SPECS["BTCUSDT"]
    assert "SHORT_NOT_ALLOWED" in eng.evaluate(intent(spot, side=-1, mid=60_000, sl=60_600), spot, state()).reasons
    stale = RiskEngine(RiskConfig(max_data_age_seconds=60))
    assert "STALE_DATA" in stale.evaluate(intent(data_age_seconds=300), EUR, state()).reasons
    broken = replace(EUR, contract_size=0)
    assert eng.evaluate(intent(), broken, state()).reasons == ["INVALID_SPEC"]


def test_insufficient_margin_and_margin_capped_size():
    eng = RiskEngine()
    used = [OpenRisk("XAUUSD", 1, 1, 5, 9_990.0, "GOLD")]                 # nearly all margin in use
    d = eng.evaluate(intent(), EUR, state(open=used))
    assert not d.approved and "INSUFFICIENT_MARGIN" in d.reasons
    spot = DEFAULT_SPECS["BTCUSDT"]                                       # fully funded: size capped by cash
    d = eng.evaluate(intent(spot, mid=60_000, sl=59_900, spread=0.5), spot, state(300.0))
    assert d.approved and d.detail.get("size_capped_by_margin") and d.margin_usd <= 300.0
    assert d.risk_usd < 300 * 0.005


def test_no_martingale_size_never_grows_after_losses():
    eng, st = RiskEngine(), state()
    v0 = eng.evaluate(intent(), EUR, st).volume
    for _ in range(2):
        st.balance -= 48
        st.equity -= 48
        eng.register_close(st, -48.0)
    assert eng.evaluate(intent(), EUR, st).volume <= v0


def test_risk_config_bounds_and_selftest():
    with pytest.raises(ValueError):
        RiskConfig.from_dict({"risk_per_trade": 0.2})
    with pytest.raises(ValueError):
        RiskConfig.from_dict({"min_rr": 0.5})
    res = risk_selftest(RiskConfig())
    assert res["passed"], {k: v for k, v in res["cases"].items() if not v["ok"]}


# ------------------------------------------------------------------- fill model
def test_same_candle_stop_and_target_resolves_to_the_stop():
    assert ex.exit_on_bar(EUR, 1, 1.098, 1.104, 1.1, 1.105, 1.097, 0.0001)[1] == "stop_loss"
    assert ex.exit_on_bar(EUR, -1, 1.102, 1.096, 1.1, 1.103, 1.095, 0.0001)[1] == "stop_loss"
    assert ex.exit_on_bar(EUR, 1, 1.098, 1.104, 1.1, 1.105, 1.099, 0.0001)[1] == "take_profit"
    assert ex.exit_on_bar(EUR, 1, 1.098, 1.104, 1.1, 1.1035, 1.099, 0.0001) is None


def test_gap_through_stop_fills_at_the_worse_open():
    px, why = ex.exit_on_bar(EUR, 1, 1.098, 1.104, 1.0950, 1.0960, 1.0940, 0.0001)
    assert why == "stop_loss" and px == pytest.approx(1.0950 - 0.00005 - 0.00002)


def test_financing_by_asset_class():
    ts = pd.Timestamp
    a, b = ts("2024-03-04 12:00", tz="UTC").to_pydatetime(), ts("2024-03-05 12:00", tz="UTC").to_pydatetime()
    assert ex.financing_usd(EUR, 1, 1.0, 1.1, 1.0, a, b) == EUR.swap_long
    assert ex.financing_usd(DEFAULT_SPECS["BTCUSDT"], 1, 1.0, 60_000, 1.0, a, b) == 0.0
    perp = DEFAULT_SPECS["BTCUSDT.P"]
    assert ex.financing_usd(perp, 1, 1.0, 60_000, 1.0, a, b) == pytest.approx(-3 * 0.0001 * 60_000)


# ------------------------------------------------------------------- backtester
def frame(rows, start="2024-03-06 07:30", freq="15min"):
    idx = pd.date_range(start, periods=len(rows), freq=freq, tz="UTC")
    return pd.DataFrame(rows, columns=["open", "high", "low", "close"], index=idx).assign(volume=100.0)


def flat(n, px=1.1):
    return [[px, px + 0.0003, px - 0.0003, px]] * n


def sigs(df, at, side, sl):
    s = pd.DataFrame({"side": 0, "sl": np.nan, "rr": 2.0, "score": np.nan, "reason": ""}, index=df.index)
    for i, sd, st_ in zip(at, side, sl):
        s.iloc[i, 0], s.iloc[i, 1] = sd, st_
    return s


def run(df, s, **kw):
    cfg = BacktestConfig(initial_balance=10_000.0, **kw)
    return run_backtest([PlanData(PLAN, df, EUR, signals=s)], cfg)


def test_backtest_winning_trade_hits_exactly_two_r():
    rows = flat(60) + [[1.1, 1.1003, 1.0997, 1.1]] + [[1.1, 1.1060, 1.0999, 1.1050]] + flat(5, 1.105)
    df = frame(rows)
    r = run(df, sigs(df, [60], [1], [1.098]))
    t = r.trades[0]
    assert t["exit_reason"] == "take_profit" and t["r"] == pytest.approx(2.0, abs=1e-6)
    assert t["entry_time"] == df.index[61]                       # filled on the NEXT candle's open
    assert t["entry"] == pytest.approx(1.1 + 0.00005 + 0.00002)
    assert r.final_balance == pytest.approx(10_000 + t["pnl"])


def test_backtest_losing_trade_costs_one_r_and_ambiguous_candle_is_a_loss():
    rows = flat(60) + [[1.1, 1.1003, 1.0997, 1.1]] + [[1.1, 1.1060, 1.0975, 1.1050]] + flat(5, 1.105)
    df = frame(rows)
    t = run(df, sigs(df, [60], [1], [1.098])).trades[0]          # candle spans both stop and target
    assert t["exit_reason"] == "stop_loss" and t["r"] == pytest.approx(-1.0, abs=1e-6)


def test_backtest_costs_reduce_results_and_stress_multiplier_works(m5):
    df = resample(m5, "M15")
    base = run_backtest([PlanData(PLAN, df, EUR)], BacktestConfig(initial_balance=10_000))
    free = run_backtest([PlanData(PLAN, df, replace(EUR, typical_spread=0, slippage_ticks=0, swap_long=0, swap_short=0))],
                        BacktestConfig(initial_balance=10_000))
    hard = run_backtest([PlanData(PLAN, df, EUR)], BacktestConfig(initial_balance=10_000, cost_multiplier=3.0))
    assert len(base.trades) > 30
    sb, sf = metrics.summarize(base.trades, 10_000), metrics.summarize(free.trades, 10_000)
    assert sb["spread_cost"] > 0 and sf["spread_cost"] == 0
    assert sum(t["spread_cost"] for t in hard.trades) / len(hard.trades) > sb["spread_cost"] / sb["trades"]
    # ledger identity: balance change equals the sum of net trade P&L
    assert base.final_balance - 10_000 == pytest.approx(sum(t["pnl"] for t in base.trades))
    assert all(t["entry_time"] > t["signal_time"] for t in base.trades)


def test_backtest_enforces_loss_streak_and_daily_budget():
    block = [[1.1, 1.1003, 1.0997, 1.1], [1.1, 1.1002, 1.0970, 1.0975], [1.1, 1.1003, 1.0997, 1.1]]
    rows = flat(60) + block * 5
    df = frame(rows, start="2024-03-06 07:30", freq="5min")
    at = [60 + 3 * k for k in range(5)]
    r = run(df, sigs(df, at, [1] * 5, [1.098] * 5))
    assert len(r.trades) == 3 and all(t["exit_reason"] == "stop_loss" for t in r.trades)
    assert r.rejections.get("LOSS_STREAK", 0) == 2             # 4th and 5th setups refused


def test_backtest_blocks_correlated_simultaneous_positions():
    rows = flat(60) + [[1.1, 1.1003, 1.0997, 1.1]] + flat(30)
    df = frame(rows)
    s = sigs(df, [60], [1], [1.098])
    gbp = plan_from_id("london:london_breakout:GBPUSD:M15")
    items = [PlanData(PLAN, df, EUR, signals=s), PlanData(gbp, df, DEFAULT_SPECS["GBPUSD"], signals=s)]
    r = run_backtest(items, BacktestConfig(initial_balance=10_000))
    assert len(r.trades) == 1 and r.rejections == {"CORRELATED_EXPOSURE": 1}


def test_metrics_on_known_trades():
    t0 = pd.Timestamp("2024-03-06 10:00", tz="UTC")
    def tr(i, pnl):
        return {"pnl": pnl, "r": pnl / 50, "exit_time": t0 + pd.Timedelta(days=i), "symbol": "EURUSD",
                "commission": 0.0, "spread_cost": 1.0, "financing": 0.0, "gross": pnl, "hold_minutes": 30.0,
                "segment": "unsplit"}
    s = metrics.summarize([tr(i, p) for i, p in enumerate([100, -50, -50, 100, -50])], 1000.0)
    assert s["trades"] == 5 and s["win_rate"] == 0.4 and s["net_profit"] == 50
    assert s["profit_factor"] == pytest.approx(200 / 150)
    assert s["expectancy_r"] == pytest.approx(0.2) and s["max_consecutive_losses"] == 2
    assert s["max_drawdown_usd"] == 100 and s["max_drawdown_pct"] == pytest.approx(100 / 1100 * 100)
    assert metrics.summarize([], 1000.0)["profit_factor"] is None


# -------------------------------------------------------------------- validation
def test_chronological_split_has_no_overlap(m5):
    tr, te, cut = chronological_split(m5, 0.65)
    assert tr.index[-1] < cut == te.index[0] and len(tr) + len(te) == len(m5)


def test_monte_carlo_distinguishes_edge_from_no_edge():
    rng = np.random.default_rng(0)
    good = monte_carlo(list(np.where(rng.random(300) < 0.45, 2.0, -1.0)))
    bad = monte_carlo(list(np.where(rng.random(300) < 0.25, 2.0, -1.0)))
    assert good["loss_probability"] < 0.05 < 0.9 < bad["loss_probability"]
    assert monte_carlo([1.0] * 5) is None


def test_research_keeps_out_of_sample_strictly_after_training_and_rejects_noise(m5):
    df = resample(m5, "M15")
    rep = research_plan(PLAN, df, EUR, BacktestConfig(initial_balance=10_000), SelectionCriteria(), with_walk_forward=True)
    cut = pd.Timestamp(rep["split_time"])
    assert rep["train"]["trades"] > 0
    assert rep["verdict"] == "failed" and rep["failures"]       # random-walk data has no edge to find
    assert rep["walk_forward"]["folds"] and all(
        pd.Timestamp(f["test_start"]) > pd.Timestamp(f["train_start"]) for f in rep["walk_forward"]["folds"])
    assert cut == df.index[int(len(df) * 0.65)]
    assert 0 <= rep["param_stability"] <= 1 and len(rep["cost_sensitivity"]) == 3


def test_parameter_selection_only_sees_training_rows(m5, monkeypatch):
    df = resample(m5, "M15")
    train, _, cut = chronological_split(df, 0.65)
    seen = []
    import app.core.validation as v
    orig = v.run_backtest
    monkeypatch.setattr(v, "run_backtest", lambda items, cfg: (seen.append(items[0].df.index[-1]), orig(items, cfg))[1])
    select_parameters(PLAN, train, EUR, BacktestConfig(initial_balance=10_000))
    assert seen and max(seen) < cut


def test_walk_forward_reports_insufficient_data(m5):
    small = resample(m5, "M15").iloc[:900]
    assert walk_forward(PLAN, small, EUR, BacktestConfig())["insufficient_data"]
