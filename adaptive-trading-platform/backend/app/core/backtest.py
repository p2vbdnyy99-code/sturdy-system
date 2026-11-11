"""Historical backtester.

Signals are computed vectorised and causally; a signal on candle *i* is filled
at the open of candle *i+1*. Orders pass through the same RiskEngine and the
same fill/cost model (app/core/execution.py) used by paper trading. Entries
from all plans are processed in strict chronological order so portfolio-level
limits (positions, correlation, daily loss, loss streak) apply across plans.
"""
from __future__ import annotations

import heapq
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from . import execution as ex
from . import indicators as ind
from .engines import Plan
from .instruments import InstrumentSpec
from .risk import OpenRisk, OrderIntent, PortfolioState, RiskConfig, RiskEngine
from .sessions import IST, SessionDef, market_open


@dataclass
class BacktestConfig:
    initial_balance: float = 300.0
    risk: RiskConfig = field(default_factory=RiskConfig)
    cost_multiplier: float = 1.0          # stress spread, slippage and commission together
    max_hold_minutes: int = 24 * 60
    flat_at_session_end: bool = False
    max_participation: float = 0.05       # share of a candle's real volume we may take
    oos_start: pd.Timestamp | None = None  # trades entered at/after this are out-of-sample
    sessions: dict[str, SessionDef] | None = None
    enforce_portfolio_limits: bool = True


@dataclass
class PlanData:
    plan: Plan
    df: pd.DataFrame
    spec: InstrumentSpec
    params: dict = field(default_factory=dict)
    signals: pd.DataFrame | None = None


@dataclass
class BacktestResult:
    trades: list[dict]
    equity: pd.Series                      # closed-trade equity, indexed by exit time
    rejections: dict[str, int]
    signals_total: int
    initial_balance: float
    final_balance: float
    data_range: tuple[str, str] | None = None


def _ist_day(ts: pd.Timestamp) -> int:
    t = ts.tz_convert(IST)
    return t.year * 10000 + t.month * 100 + t.day


def run_backtest(items: list[PlanData], cfg: BacktestConfig | None = None) -> BacktestResult:
    cfg = cfg or BacktestConfig()
    engine = RiskEngine(cfg.risk if cfg.enforce_portfolio_limits else
                        RiskConfig(**{**cfg.risk.to_dict(), "max_positions": 10_000,
                                      "max_correlated_positions": 10_000, "max_portfolio_risk": 1.0}))
    m = cfg.cost_multiplier
    prepared, events = [], []
    for k, it in enumerate(items):
        df = it.df
        if len(df) < 50:
            continue
        sig = it.signals if it.signals is not None else it.plan.generate(df, it.spec, cfg.sessions, it.params)
        side = sig["side"].to_numpy()
        spread = (df["spread"].fillna(it.spec.typical_spread).to_numpy() if "spread" in df.columns
                  else np.full(len(df), it.spec.typical_spread)) * m
        atr_pct = ind.rolling_percentile(ind.atr(df, 14), 500).to_numpy()
        sess = (cfg.sessions or {}).get(it.plan.engine)
        prepared.append({
            "it": it, "o": df["open"].to_numpy(float), "h": df["high"].to_numpy(float),
            "l": df["low"].to_numpy(float), "c": df["close"].to_numpy(float),
            "v": df["volume"].to_numpy(float) if "volume" in df.columns else None,
            "spread": spread, "idx": df.index, "side": side, "sl": sig["sl"].to_numpy(float),
            "rr": sig["rr"].to_numpy(float), "reason": sig["reason"].to_numpy(), "atr_pct": atr_pct,
            "busy_until": -1, "sess_mask": sess.mask(df.index) if (sess and cfg.flat_at_session_end) else None,
        })
        kk = len(prepared) - 1
        for i in np.nonzero(side[:-1])[0]:
            events.append((df.index[i + 1].value, kk, int(i)))
    events.sort()

    st = PortfolioState(equity=cfg.initial_balance, balance=cfg.initial_balance,
                        day_start_equity=cfg.initial_balance)
    open_heap: list = []          # (exit_ns, seq, trade, OpenRisk)
    trades, rejections, seq, cur_day = [], {}, 0, None
    eq_t, eq_v = [], []

    def settle(until_ns: int):
        nonlocal cur_day
        while open_heap and open_heap[0][0] <= until_ns:
            _, _, tr, orisk = heapq.heappop(open_heap)
            roll_day(tr["exit_time"])
            st.balance += tr["pnl"]
            st.equity = st.balance
            st.open.remove(orisk)
            engine.register_close(st, tr["pnl"])
            tr["equity_after"] = st.balance
            trades.append(tr)
            eq_t.append(tr["exit_time"])
            eq_v.append(st.balance)

    def roll_day(ts: pd.Timestamp):
        nonlocal cur_day
        d = _ist_day(ts)
        if d != cur_day:
            cur_day = d
            engine.new_day(st)

    for t_ns, kk, i in events:
        P = prepared[kk]
        it: PlanData = P["it"]
        spec = it.spec
        j = i + 1
        settle(t_ns)
        ts = P["idx"][j]
        roll_day(ts)

        def reject(code_list):
            for code in code_list:
                rejections[code] = rejections.get(code, 0) + 1

        if j <= P["busy_until"]:
            reject(["DUPLICATE_SYMBOL"])
            continue
        if not market_open(spec.trades_weekend, ts.to_pydatetime()):
            reject(["MARKET_CLOSED"])
            continue
        side = int(P["side"][i])
        mid, spread = P["o"][j], P["spread"][j]
        q2usd = spec.quote_to_usd(mid)
        tp_ = ex.plan_trade(spec, side, mid, spread, float(P["sl"][i]), float(P["rr"][i]), q2usd, m)
        cap = None
        if spec.volume_reliable and P["v"] is not None and P["v"][j] > 0:
            cap = cfg.max_participation * P["v"][j] / spec.contract_size
        intent = OrderIntent(spec.symbol, side, tp_.entry, tp_.sl, tp_.tp, tp_.risk_per_unit,
                             tp_.reward_per_unit, spread, q2usd, max_volume=cap)
        dec = engine.evaluate(intent, spec, st)
        if not dec.approved:
            reject(dec.reasons)
            continue

        # ---- find the exit by scanning forward on this plan's own candles ----
        o, h, l = P["o"], P["h"], P["l"]
        n = len(o)
        max_bars = max(1, int(cfg.max_hold_minutes // max(1, (P["idx"][1] - P["idx"][0]).total_seconds() // 60)))
        end = min(n, j + max_bars)
        half = P["spread"][j:end] / 2
        if side > 0:
            hit_sl, hit_tp = (l[j:end] - half) <= tp_.sl, (h[j:end] - half) >= tp_.tp
        else:
            hit_sl, hit_tp = (h[j:end] + half) >= tp_.sl, (l[j:end] + half) <= tp_.tp
        hit = hit_sl | hit_tp
        time_k = None
        if P["sess_mask"] is not None:
            out_of_sess = np.nonzero(~P["sess_mask"][j:end])[0]
            if len(out_of_sess):
                time_k = int(out_of_sess[0])
        first = int(np.argmax(hit)) if hit.any() else None
        if first is not None and (time_k is None or first < time_k):
            x = j + first
            px, why = ex.exit_on_bar(spec, side, tp_.sl, tp_.tp, o[x], h[x], l[x], P["spread"][x], m)
            exit_ts = P["idx"][x] + (P["idx"][1] - P["idx"][0])
        else:
            if time_k is not None:
                x, why = j + time_k, "session_end"
            elif end < n:
                x, why = end, "time_exit"
            else:
                x, why = n - 1, "end_of_data"
            ref = P["c"][x] if why == "end_of_data" else o[x]
            px = ref - side * (P["spread"][x] / 2 + ex.slippage_price(spec, m))
            exit_ts = P["idx"][x] + ((P["idx"][1] - P["idx"][0]) if why == "end_of_data" else pd.Timedelta(0))
        P["busy_until"] = x

        vol = dec.volume
        gross = ex.pnl_usd(spec, side, vol, tp_.entry, px, q2usd)
        comm = ex.commission_usd(spec, vol, tp_.entry, q2usd, m) + ex.commission_usd(spec, vol, px, q2usd, m)
        fin = ex.financing_usd(spec, side, vol, tp_.entry, q2usd, ts.to_pydatetime(), exit_ts.to_pydatetime())
        pnl = gross - comm + fin
        seg_lo = l[j:x + 1].min() if side > 0 else None
        seg_hi = h[j:x + 1].max() if side < 0 else None
        adverse = (tp_.entry - seg_lo) if side > 0 else (seg_hi - tp_.entry)
        ap = P["atr_pct"][i]
        trade = {
            "plan_id": it.plan.plan_id, "engine": it.plan.engine, "strategy": it.plan.label,
            "strategy_key": it.plan.strategy, "symbol": spec.symbol, "timeframe": it.plan.timeframe,
            "side": "buy" if side > 0 else "sell", "signal_time": P["idx"][i] , "entry_time": ts,
            "exit_time": exit_ts, "entry": float(tp_.entry), "exit": float(px), "sl": float(tp_.sl),
            "tp": float(tp_.tp), "volume": float(vol), "risk_usd": float(dec.risk_usd),
            "gross": float(gross), "commission": float(comm), "financing": float(fin),
            "spread_cost": float(spread * vol * spec.contract_size * q2usd),
            "pnl": float(pnl), "r": float(pnl / dec.risk_usd) if dec.risk_usd else 0.0,
            "exit_reason": why, "hold_minutes": float((exit_ts - ts).total_seconds() / 60),
            "mae_r": float(adverse / tp_.risk_per_unit) if tp_.risk_per_unit else 0.0,
            "vol_regime": "unknown" if np.isnan(ap) else ("low" if ap < 1 / 3 else "high" if ap > 2 / 3 else "normal"),
            "reason": str(P["reason"][i]), "partial_fill": dec.partial,
            "segment": ("out_of_sample" if (cfg.oos_start is not None and ts >= cfg.oos_start) else
                        "in_sample" if cfg.oos_start is not None else "unsplit"),
        }
        orisk = OpenRisk(spec.symbol, side, vol, dec.risk_usd, dec.margin_usd, spec.correlation_group)
        st.open.append(orisk)
        seq += 1
        heapq.heappush(open_heap, (exit_ts.value, seq, trade, orisk))

    settle(np.iinfo(np.int64).max)
    eq = pd.Series(eq_v, index=pd.DatetimeIndex(eq_t, tz="UTC") if eq_t else pd.DatetimeIndex([], tz="UTC"),
                   dtype=float)
    rng = None
    if prepared:
        rng = (min(p["idx"][0] for p in prepared).isoformat(), max(p["idx"][-1] for p in prepared).isoformat())
    return BacktestResult(trades, eq, rejections, len(events), cfg.initial_balance, st.balance, rng)
