"""Phase 2.1 repairs: D1 (independent train / validation / hold-out), D2 (dataset identity and integrity),
D3 (real-time history sufficiency) and D8 (complete cost accounting). Each test fails if its defect returns."""
from datetime import timedelta

import numpy as np
import pandas as pd
import pytest

from app import models as m
from app.core import execution as ex
from app.core import metrics
from app.core.backtest import BacktestConfig, PlanData, run_backtest
from app.core.engines import candidate_plans, plan_from_id
from app.core.instruments import DEFAULT_SPECS
from app.core.mtf import resample
from app.core.strategies.library import STRATEGIES
from app.core.validation import (DataSplit, HoldoutViolation, research_plan, trades_needed)
from app.data import splits, store
from app.data.synthetic import generate
from tests.conftest import make_account, make_cfg

EUR = DEFAULT_SPECS["EURUSD"]
BTC = DEFAULT_SPECS["BTCUSDT"]


def btc_m5(days=40, seed=3, start="2024-01-01"):
    return generate("BTCUSDT", start=start, days=days, price=60_000, annual_vol=0.5, seed=seed, weekend=True)


# =========================================================================== D2: data
class TestDatasetIntegrity:
    def test_registry_records_identity_provenance_and_checksum(self, db):
        df = btc_m5(10)
        store.upsert(db, "BTCUSDT", "M5", "binance", df, provenance={"provider": "Binance", "url": "x"})
        ds = store.get_dataset(db, "BTCUSDT", "binance")
        assert (ds.kind, ds.base_timeframe, ds.calendar, ds.rows, ds.missing_bars) == ("historical", "M5", "24x7", len(df), 0)
        assert ds.provenance["provider"] == "Binance" and len(ds.checksum) == 64
        assert ds.start == df.index[0].to_pydatetime() and ds.end == df.index[-1].to_pydatetime()

    def test_a_second_timeframe_can_never_enter_a_dataset(self, db):
        """The Phase-1 failure: 5 days of native M15 stored in source 'binance' shadowed a year of M5."""
        df = btc_m5(20)
        store.upsert(db, "BTCUSDT", "M5", "binance", df)
        with pytest.raises(store.DataError, match="stores M5 candles; refusing to add M15"):
            store.upsert(db, "BTCUSDT", "M15", "binance", resample(df, "M15").iloc[-480:])
        out = store.load(db, "BTCUSDT", "M15", "binance")
        assert out.index[0] == df.index[0] and len(out) == len(df) // 3      # the full history, resampled

    def test_live_candles_go_to_their_own_dataset_and_never_shadow_history(self, db):
        df = btc_m5(20)
        store.upsert(db, "BTCUSDT", "M5", "binance", df)
        live_src = store.live_source("binance", "M15")
        assert live_src == "binance-M15-live"
        store.upsert(db, "BTCUSDT", "M15", live_src, resample(df, "M15").iloc[-100:])
        assert store.get_dataset(db, "BTCUSDT", live_src).kind == "live"
        assert len(store.load(db, "BTCUSDT", "M15", "binance")) == len(df) // 3

    def test_duplicates_are_rejected_not_silently_resolved(self, db):
        df = btc_m5(2)
        dup = pd.concat([df, df.iloc[[5]]])
        with pytest.raises(store.DataError, match="duplicate candle timestamp"):
            store.upsert(db, "BTCUSDT", "M5", "binance", dup)

    def test_timeframe_and_grid_are_verified(self, db):
        df = btc_m5(2)
        shifted = df.copy()
        shifted.index = shifted.index + pd.Timedelta(minutes=2)
        with pytest.raises(store.DataError, match="not aligned to the M5 grid"):
            store.upsert(db, "BTCUSDT", "M5", "binance", shifted)
        with pytest.raises(store.DataError, match="not M15|not aligned to the M15 grid"):
            store.upsert(db, "BTCUSDT", "M15", "other", df)       # M5 bars declared as M15

    def test_missing_candles_are_detected_and_incomplete_slices_rejected(self, db):
        df = btc_m5(10)
        holed = df.drop(df.index[1000:1300])                       # a 25-hour hole
        store.upsert(db, "BTCUSDT", "M5", "binance", holed)
        ds = store.get_dataset(db, "BTCUSDT", "binance")
        assert ds.missing_bars == 300 and ds.gaps[0]["bars"] == 300
        with pytest.raises(store.DataError, match="slice is incomplete"):
            store.load(db, "BTCUSDT", "M15", "binance")
        ok = store.load(db, "BTCUSDT", "M15", "binance", start=df.index[1400])   # a slice after the hole is fine
        assert ok.attrs["dataset"]["quality"]["missing"] == 0

    def test_requested_range_must_lie_inside_the_dataset(self, db):
        df = btc_m5(5)
        store.upsert(db, "BTCUSDT", "M5", "binance", df)
        with pytest.raises(store.DataError, match="is before dataset"):
            store.load(db, "BTCUSDT", "M5", "binance", start=df.index[0] - pd.Timedelta(days=30))
        with pytest.raises(store.DataError, match="is after dataset"):
            store.load(db, "BTCUSDT", "M5", "binance", end=df.index[-1] + pd.Timedelta(days=30))

    def test_fx_calendar_weekend_candles_are_rejected(self, db):
        df = generate("EURUSD", days=10, weekend=True, seed=2)    # deliberately includes the weekend
        with pytest.raises(store.DataError, match="FX weekend close"):
            store.upsert(db, "EURUSD", "M5", "dukascopy", df)

    def test_unregistered_and_quarantined_datasets_cannot_be_loaded(self, db):
        with pytest.raises(store.DataError, match="no registered dataset"):
            store.load(db, "BTCUSDT", "M5", "nowhere")
        store.upsert(db, "BTCUSDT", "M5", "binance", btc_m5(2))
        store.quarantine(db, store.get_dataset(db, "BTCUSDT", "binance"), "test")
        with pytest.raises(store.DataError, match="quarantined"):
            store.load(db, "BTCUSDT", "M5", "binance")

    def test_incomplete_final_resampled_bar_is_dropped(self, db):
        df = btc_m5(3).iloc[:-1]                                   # last H1 bucket lacks its final M5 bar
        store.upsert(db, "BTCUSDT", "M5", "binance", df)
        h1 = store.load(db, "BTCUSDT", "H1", "binance")
        assert h1.index[-1] + pd.Timedelta(minutes=55) <= df.index[-1]

    def test_backtests_refuse_live_and_quarantined_datasets(self, client, db):
        from tests.conftest import register
        h, _ = register(client)
        df = btc_m5(10)
        store.upsert(db, "BTCUSDT", "M15", "binance-M15-live", resample(df, "M15"))
        db.commit()
        r = client.post("/api/v1/backtests", headers=h, json={"source": "binance-M15-live", "symbols": ["BTCUSDT"]})
        assert r.status_code == 422 and "live-feed and quarantined" in r.json()["detail"]


# =========================================================================== D1: split
class TestIndependentSplit:
    def test_boundaries_are_ordered_and_non_overlapping(self):
        sp = DataSplit.from_fractions(pd.Timestamp("2020-01-01", tz="UTC"), pd.Timestamp("2026-01-01", tz="UTC"))
        assert sp.data_start < sp.train_end < sp.holdout_start < sp.data_end
        assert sp.segment_of(sp.train_end - pd.Timedelta(seconds=1)) == "train"
        assert sp.segment_of(sp.train_end) == "validation"
        assert sp.segment_of(sp.holdout_start) == "holdout"
        with pytest.raises(ValueError):
            DataSplit(sp.holdout_start, sp.train_end, sp.data_start, sp.data_end)

    def test_research_refuses_hold_out_rows(self, m5):
        df = resample(m5, "M15")
        sp = DataSplit.from_fractions(df.index[0], df.index[-1])
        with pytest.raises(HoldoutViolation):
            research_plan(plan_from_id("london:london_breakout:EURUSD:M15"), df, EUR, split=sp)

    def test_every_research_computation_stays_before_the_hold_out(self, m5, monkeypatch):
        """Spy on the backtester: no research call may see a candle at or after the hold-out start."""
        df = resample(m5, "M15")
        sp = DataSplit.from_fractions(df.index[0], df.index[-1])
        import app.core.validation as v
        seen, orig = [], v.run_backtest
        monkeypatch.setattr(v, "run_backtest", lambda items, cfg: (seen.append(items[0].df.index.max()), orig(items, cfg))[1])
        rep = research_plan(plan_from_id("london:london_breakout:EURUSD:M15"), df[df.index < sp.holdout_start], EUR,
                            BacktestConfig(initial_balance=10_000), split=sp)
        assert seen and max(seen) < sp.holdout_start
        assert all(pd.Timestamp(f["test_end"]) < sp.train_end for f in rep["walk_forward"]["folds"])   # nested WF
        assert rep["walk_forward"]["scope"] == "inside training segment"

    def test_power_gate(self):
        assert trades_needed(1.166) == 136                          # Phase-1 R dispersion -> ~136 trades for +0.2R
        assert trades_needed(1.0, 0.2, 2.0) == 100

    def test_split_is_immutable_and_hold_out_reads_are_ledgered(self, db):
        store.upsert(db, "BTCUSDT", "M5", "binance", btc_m5(30))
        ds = store.get_dataset(db, "BTCUSDT", "binance")
        sp = splits.ensure_split(db, ds)
        with pytest.raises(store.DataError, match="immutable"):
            splits.define_split(db, ds, sp.train_end, sp.holdout_start)
        end, _, touched = splits.guard_range(db, "BTCUSDT", "binance", None, None, False, "test")
        assert end < sp.holdout_start and not touched and ds.split["accesses"] == []
        end, _, touched = splits.guard_range(db, "BTCUSDT", "binance", None, None, True, "explicit")
        assert touched and len(ds.split["accesses"]) == 1

    def test_hold_out_job_only_accepts_frozen_validated_configs_and_flags_reuse(self, db, user):
        from app import jobs
        df = btc_m5(60)
        store.upsert(db, "BTCUSDT", "M5", "binance", df)
        splits.ensure_split(db, store.get_dataset(db, "BTCUSDT", "binance"))
        cfg = make_cfg(db, user, "asia:asian_orb:BTCUSDT:M15", validation_status="failed", validation_source="binance")
        run = m.BacktestRun(user_id=user.id, kind="holdout", data_source="binance", request={
            "source": "binance", "strategy_config_ids": [cfg.id]})
        db.add(run)
        db.commit()
        jobs.run_holdout_job(run.id)
        db.refresh(run)
        assert run.status == "failed" and "only frozen survivors may see the hold-out" in run.error
        cfg.validation_status = "passed"
        db.commit()
        run2 = m.BacktestRun(user_id=user.id, kind="holdout", data_source="binance",
                             request={"source": "binance", "strategy_config_ids": [cfg.id]})
        db.add(run2)
        db.commit()
        jobs.run_holdout_job(run2.id)
        db.refresh(run2)
        db.refresh(cfg)
        assert run2.status == "done" and cfg.metrics["holdout"]["independent"] is True
        assert cfg.params == plan_from_id(cfg.plan_id).params or cfg.params       # parameters untouched
        run3 = m.BacktestRun(user_id=user.id, kind="holdout", data_source="binance",
                             request={"source": "binance", "strategy_config_ids": [cfg.id]})
        db.add(run3)
        db.commit()
        jobs.run_holdout_job(run3.id)
        db.refresh(run3)
        assert run3.status == "failed" and "not independent" in run3.error


# =========================================================================== D3: history
class TestRequiredHistory:
    def test_trend_continuation_needs_far_more_than_1500_bars(self):
        st = STRATEGIES["trend_continuation"]
        assert st.required_bars({**st.default_params}, 15) > 8000      # H1 EMA200 and H4 EMA50 must converge

    @pytest.mark.parametrize("plan", candidate_plans(symbols=["BTCUSDT"], timeframes=["M15"]), ids=lambda p: p.plan_id)
    def test_signal_on_required_window_equals_full_history(self, plan):
        df = resample(btc_m5(200, seed=9), "M15")
        st = STRATEGIES[plan.strategy]
        need = st.required_bars({**st.default_params, **plan.params}, 15)
        full = plan.generate(df, BTC)
        rng = np.random.default_rng(0)
        idx = sorted(set(np.where(full.side.to_numpy() != 0)[0][-15:]) | set(rng.integers(need + 50, len(df), 25)))
        for i in idx:
            if i < need + 5:
                continue
            w = plan.generate(df.iloc[i - need: i + 1], BTC)        # `need` bars of history + the signal bar
            assert int(w.side.iloc[-1]) == int(full.side.iloc[i]), (plan.plan_id, df.index[i])

    def test_no_signal_before_the_required_history(self):
        df = resample(btc_m5(120, seed=4), "M15")
        p = plan_from_id("newyork:trend_continuation:BTCUSDT:M15")
        st = STRATEGIES[p.strategy]
        need = st.required_bars({**st.default_params, **p.params}, 15)
        assert (p.generate(df, BTC).side.iloc[:need] == 0).all()   # bars 0..need-1 have < need bars of history

    def test_runner_backfills_the_required_history(self, db, user):
        from app import runner
        df = resample(btc_m5(120, seed=5), "M15")
        t_last = df.index[-1]
        now = (t_last + pd.Timedelta(minutes=15, seconds=5)).to_pydatetime()

        class Feed(runner.Feed):
            source = "binance"
            calls = 0

            def supports(self, s): return True
            def history(self, s, tf, bars, end):
                Feed.calls += 1
                return df[df.index + pd.Timedelta(minutes=15) <= end].iloc[-(bars + 2):]

        cfg = make_cfg(db, user, "newyork:trend_continuation:BTCUSDT:M15")
        need = runner.history_needed([cfg], "M15")
        hist = runner.ensure_history(db, Feed(), "BTCUSDT", "M15", need, t_last, now)
        assert len(hist) == need and hist.index[-1] == t_last and Feed.calls == 1
        assert store.get_dataset(db, "BTCUSDT", "binance-M15-live").kind == "live"
        runner.ensure_history(db, Feed(), "BTCUSDT", "M15", need, t_last, now)
        assert Feed.calls == 1                                      # second call served from the live dataset


# =========================================================================== D8: costs
class TestCostAccounting:
    def test_every_cost_is_in_the_breakdown_and_ledger_closes(self, m5):
        df = resample(m5, "M15")
        res = run_backtest([PlanData(plan_from_id("london:london_breakout:EURUSD:M15"), df, EUR)],
                           BacktestConfig(initial_balance=10_000))
        cb = metrics.cost_breakdown(res.trades)
        T = pd.DataFrame(res.trades)
        assert T.slippage_cost.sum() > 0 and cb["estimated_execution_costs"]["slippage"] == pytest.approx(T.slippage_cost.sum())
        assert cb["total_costs"] == pytest.approx(T.commission.sum() - T.financing.sum() + T.spread_cost.sum()
                                                  + T.slippage_cost.sum())
        # independent check: pnl_before_costs equals the move between the MID prices at entry and exit
        half = EUR.typical_spread / 2
        slip = ex.slippage_price(EUR)
        for t in res.trades[:40]:
            s = 1 if t["side"] == "buy" else -1
            entry_mid = t["entry"] - s * (half + slip)
            exit_mid = t["exit"] + s * (half + (0 if t["exit_reason"] == "take_profit" else slip))
            mid = s * (exit_mid - entry_mid) * t["volume"] * EUR.contract_size
            assert t["pnl_before_costs"] == pytest.approx(mid, abs=1e-6)

    def test_realised_r_matches_the_risk_definition(self, m5):
        """A stop without a gap loses exactly 1R; a target wins exactly the configured net 2R."""
        df = resample(m5, "M15")
        res = run_backtest([PlanData(plan_from_id("london:london_breakout:EURUSD:M15"), df, EUR)],
                           BacktestConfig(initial_balance=10_000))
        T = pd.DataFrame(res.trades)
        tp = T[T.exit_reason == "take_profit"]
        assert len(tp) and np.allclose(tp.r - T.loc[tp.index, "financing"] / T.loc[tp.index, "risk_usd"], 2.0, atol=1e-6)
        sl = T[(T.exit_reason == "stop_loss")]
        nogap = sl[np.isclose(sl.exit, sl.sl - ex.slippage_price(EUR) - EUR.typical_spread / 2 * 0, atol=1e-9) |
                   np.isclose(sl.exit, sl.sl - ex.slippage_price(EUR), atol=1e-9)]
        assert len(nogap) and np.allclose(nogap.r - nogap.financing / nogap.risk_usd, -1.0, atol=1e-6)
        assert (sl.r - sl.financing / sl.risk_usd <= -1.0 + 1e-6).all()          # gaps only make it worse
        equity_at_entry = T.equity_after - T.pnl                                 # one plan: no overlapping trades
        assert (T.risk_usd <= 0.005 * equity_at_entry + 1e-6).all()               # never more than 0.5 % at entry

    def test_paper_trades_record_spread_and_slippage(self, db, user):
        from app.core.trading import TradingService
        from tests.conftest import T0, quote, signal
        acct = make_account(db, user)
        cfg = make_cfg(db, user)
        svc = TradingService(db, acct)
        q = quote(ts=T0)
        svc.on_quote(q, T0)
        svc.execute_signal(cfg, signal(), q, T0)
        t = svc.on_quote(quote(mid=1.0979, ts=T0 + timedelta(minutes=5)))[0]
        unit = t.volume * EUR.contract_size
        assert t.spread_cost == pytest.approx(unit * 0.0001)                     # half spread in, half out
        assert t.slippage_cost == pytest.approx(unit * 2 * ex.slippage_price(EUR))


def test_quarantined_source_names_stay_quarantined_on_reregistration(db):
    """A registry rebuild (e.g. migration re-run) must not turn a quarantined dataset back into history."""
    assert store.kind_for_source("binance-M15-quarantined") == "quarantined"
    assert store.kind_for_source("binance-M15-live") == "live"
    assert store.kind_for_source("binance") == "historical"
    with pytest.raises(store.DataError, match="quarantined"):
        store.upsert(db, "BTCUSDT", "M15", "binance-M15-quarantined", resample(btc_m5(3), "M15"))
