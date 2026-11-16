"""Task 6: typical tradable movement vs round-trip transaction cost, per instrument x timeframe x session.

Movement = median candle range (high - low) of candles that OPEN inside the session window, in basis points of
the open; p25 shown for robustness. Pass = median range >= 5 x round-trip cost (a research filter only).
Data: training + validation segments only (the hold-out is never read). Run from backend/."""
from __future__ import annotations

import json
import sys

import pandas as pd

sys.path.insert(0, ".")
from app.core.mtf import resample  # noqa: E402
from app.data import splits, store  # noqa: E402
from app.db import session_scope  # noqa: E402

SESSIONS = {"asia": (8, 12), "london": (13, 17), "newyork": (18, 23)}          # IST, fixed research windows
TFS = ["M5", "M15", "M30", "H1", "H4"]
THRESHOLD = 5.0
# Round-trip costs. BTCUSDT: Binance VIP 0 fee (verified) + measured spread (~0.001 bp) + no measurable impact at
# <= $30k. FX / gold: ESTIMATES of typical retail costs (NOT verified for any specific broker), low / high scenario.
COSTS = {
    "BTCUSDT": {"low_bp": 2 * 7.5 + 0.01, "high_bp": 2 * 10.0 + 0.01,
                "basis": "Binance spot fee 0.075% (BNB) / 0.100% (VIP 0) per side, verified; spread measured 1 tick"},
    "EURUSD": {"low_pips": 1.0, "high_pips": 1.4, "pip": 1e-4,
               "basis": "ESTIMATE: low = 0.1 pip raw spread + $7/lot commission + 0.1 pip slippage; high = 1.2 pip spread + 0.2 pip slippage"},
    "XAUUSD": {"low_usd": 0.29, "high_usd": 0.40,
               "basis": "ESTIMATE per oz: low = $0.12 spread + $0.07 commission + $0.10 slippage; high = $0.30 spread + $0.10 slippage"},
    "GBPUSD": {"low_pips": 1.2, "high_pips": 1.8, "pip": 1e-4, "basis": "ESTIMATE"},
    "USDJPY": {"low_pips": 1.0, "high_pips": 1.5, "pip": 1e-2, "basis": "ESTIMATE"},
}


def cost_bp(sym: str, price: float) -> tuple[float, float]:
    c = COSTS[sym]
    if "low_bp" in c:
        return c["low_bp"], c["high_bp"]
    if "low_pips" in c:
        return c["low_pips"] * c["pip"] / price * 1e4, c["high_pips"] * c["pip"] / price * 1e4
    return c["low_usd"] / price * 1e4, c["high_usd"] / price * 1e4


def table(m5: pd.DataFrame, sym: str, weekdays_only: bool) -> list[dict]:
    rows = []
    for tf in TFS:
        df = m5 if tf == "M5" else resample(m5, tf)
        if weekdays_only:
            ny = df.index.tz_convert("America/New_York")
            df = df[(ny.day_of_week < 5) & ~((ny.day_of_week == 4) & (ny.hour >= 17))]
        df = df[df.volume > 0]                                    # a candle with no trades carries no range information
        ist = df.index.tz_convert("Asia/Kolkata")
        rng = (df.high - df.low) / df.open * 1e4
        for s, (a, b) in SESSIONS.items():
            mins = ist.hour * 60 + ist.minute
            mk = (mins >= a * 60) & (mins < b * 60)
            r = rng[mk]
            px = float(df.close[mk].median())
            lo, hi = cost_bp(sym, px)
            med = float(r.median())
            rows.append({"symbol": sym, "timeframe": tf, "session": s, "candles": int(mk.sum()), "median_range_bp": med,
                         "p25_range_bp": float(r.quantile(0.25)), "cost_low_bp": lo, "cost_high_bp": hi,
                         "ratio_low_cost": med / lo, "ratio_high_cost": med / hi,
                         "pass_low_cost": med / lo >= THRESHOLD, "pass_high_cost": med / hi >= THRESHOLD})
    return rows


def main(out: str, proxy_dir: str) -> None:
    rows, meta = [], {}
    with session_scope() as db:
        ds = store.require_dataset(db, "BTCUSDT", "binance-2020")
        sp = splits.get_split(ds)
        btc = store.load(db, "BTCUSDT", "M5", "binance-2020", end=splits.research_end(sp))
        meta["BTCUSDT"] = {"data": "Binance BTCUSDT spot (actual instrument)", "from": str(btc.index[0]), "to": str(btc.index[-1])}
        rows += table(btc, "BTCUSDT", weekdays_only=False)
        for sym, proxy in (("EURUSD", "eurusdt"), ("XAUUSD", "paxgusdt")):
            p = pd.read_pickle(f"{proxy_dir}/{proxy}_m5.pkl")
            p = p[p.index < sp.holdout_start]
            meta[sym] = {"data": f"PROXY: Binance {proxy.upper()} (crypto-venue price of {'EUR' if sym == 'EURUSD' else 'tokenised gold'} "
                                 f"in USDT), weekdays in FX hours only", "from": str(p.index[0]), "to": str(p.index[-1]),
                         "zero_volume_candles_excluded": int((p.volume == 0).sum())}
            rows += table(p, sym, weekdays_only=True)
    for sym in ("GBPUSD", "USDJPY"):
        meta[sym] = {"data": "NOT MEASURED: no reachable documented source (Dukascopy blocked from this environment; "
                             "Binance has no live GBP or JPY pair)"}
    json.dump({"threshold": THRESHOLD, "costs": COSTS, "data": meta, "rows": rows}, open(out, "w"), indent=1)
    df = pd.DataFrame(rows)
    piv = df.pivot_table(index=["symbol", "timeframe"], columns="session", values=["ratio_high_cost", "ratio_low_cost"])
    print(piv.round(2).to_string())


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
