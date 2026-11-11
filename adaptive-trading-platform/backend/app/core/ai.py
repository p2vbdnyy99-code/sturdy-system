"""AI-assisted analysis layer (optional, advisory only).

Design rules enforced here:
  * Every number in an analysis is computed deterministically from stored
    candles / journal rows. The optional language model only *rewords* those
    facts; it receives no tools and cannot place, size or approve orders.
  * No market data -> the answer is "data unavailable", never an estimate.
  * A setup "score" is a ranking aid. It is reported as a probability only when
    backed by a calibration table built from realised historical outcomes.
  * The platform's deterministic core works with this module disabled.
"""
from __future__ import annotations

import json
import logging
import math

import numpy as np
import pandas as pd

from ..config import get_settings
from . import indicators as ind
from . import structure as st
from .risk import REASONS

log = logging.getLogger("atp.ai")

UNAVAILABLE = {"available": False, "message": "Market data unavailable for this instrument/timeframe. "
                                              "No analysis has been generated."}


def market_snapshot(df: pd.DataFrame, symbol: str, timeframe: str, source: str) -> dict:
    """Deterministic description of current conditions from closed candles."""
    if df is None or len(df) < 210:
        return UNAVAILABLE | {"symbol": symbol, "timeframe": timeframe}
    c = df["close"]
    e20, e50, e200 = ind.ema(c, 20).iloc[-1], ind.ema(c, 50).iloc[-1], ind.ema(c, 200).iloc[-1]
    adx = ind.adx(df).iloc[-1]
    rsi = float(ind.rsi(c).iloc[-1])
    macd = ind.macd(c).iloc[-1]
    atr = ind.atr(df)
    atr_pct = float(ind.rolling_percentile(atr, min(500, len(df) - 20)).iloc[-1])
    exp = float(ind.atr_expansion(df).iloc[-1])
    bb = ind.bollinger(c).iloc[-1]
    sb = st.structure_breaks(df).iloc[-1]
    price = float(c.iloc[-1])
    trend = "up" if e20 > e50 > e200 else "down" if e20 < e50 < e200 else "mixed"
    strength = "strong" if adx["adx"] >= 25 else "weak" if adx["adx"] < 18 else "moderate"
    conflicts = []
    if trend == "up" and rsi > 72:
        conflicts.append("Trend is up but RSI is overbought (>72): continuation entries are late.")
    if trend == "down" and rsi < 28:
        conflicts.append("Trend is down but RSI is oversold (<28): continuation entries are late.")
    if trend == "up" and macd["macd_hist"] < 0:
        conflicts.append("EMA stack is bullish while MACD histogram is negative (momentum fading).")
    if trend == "down" and macd["macd_hist"] > 0:
        conflicts.append("EMA stack is bearish while MACD histogram is positive (momentum fading).")
    if trend != "mixed" and sb["structure_trend"] * (1 if trend == "up" else -1) < 0:
        conflicts.append("Swing structure last broke against the EMA trend.")
    if strength == "weak" and trend != "mixed":
        conflicts.append("EMAs are aligned but ADX is below 18: the trend lacks strength.")
    unusual = exp >= 1.8 or atr_pct >= 0.97
    facts = {
        "available": True, "symbol": symbol, "timeframe": timeframe, "data_source": source,
        "as_of": df.index[-1].isoformat(), "price": price, "trend": trend, "trend_strength": strength,
        "adx": float(adx["adx"]), "rsi": rsi, "macd_hist": float(macd["macd_hist"]),
        "ema20": float(e20), "ema50": float(e50), "ema200": float(e200), "atr": float(atr.iloc[-1]),
        "atr_percentile": atr_pct, "atr_expansion": exp, "bb_width": float(bb["bb_width"]),
        "structure": "bullish" if sb["structure_trend"] > 0 else "bearish" if sb["structure_trend"] < 0 else "undefined",
        "last_swing_high": _f(sb["last_swing_high"]), "last_swing_low": _f(sb["last_swing_low"]),
        "volatility_state": "unusually high" if unusual else "elevated" if atr_pct > 0.75 else
                            "compressed" if atr_pct < 0.2 else "normal",
        "unusual_volatility": bool(unusual), "conflicts": conflicts,
    }
    facts["summary"] = (
        f"{symbol} {timeframe}: trend {trend} ({strength}, ADX {facts['adx']:.0f}); RSI {rsi:.0f}; "
        f"swing structure {facts['structure']}; volatility {facts['volatility_state']} "
        f"(ATR at the {atr_pct:.0%} percentile of its recent range). "
        + (f"{len(conflicts)} conflicting signal(s)." if conflicts else "No indicator conflicts detected."))
    return facts


def _f(x):
    return None if x is None or (isinstance(x, float) and math.isnan(x)) else float(x)


def explain_signal(signal: dict, rejection: dict | None = None) -> str:
    side = "long" if signal["side"] == "buy" else "short"
    txt = (f"{signal['plan_id']} produced a {side} signal on the {signal['timeframe']} candle of "
           f"{signal['candle_ts']}: {signal['reason'] or 'conditions met'}. Protective stop {signal['sl']:.6g}, "
           f"target reward/risk {signal['rr_target']:g}:1 net of costs.")
    if rejection:
        why = " ".join(REASONS.get(r, r) for r in rejection["reasons"])
        return txt + f" It was NOT traded. {why}"
    if signal.get("outcome") == "executed":
        return txt + " It passed every risk check and was executed."
    return txt


def calibration_table(scored_outcomes: list[tuple[float, bool]], bins: int = 4, min_n: int = 30) -> dict:
    """Empirical win rate per score bucket with a Wilson 95% interval. Buckets
    with fewer than ``min_n`` outcomes are reported as not calibrated."""
    data = [(s, w) for s, w in scored_outcomes if s is not None and not math.isnan(s)]
    if len(data) < min_n:
        return {"calibrated": False, "n": len(data), "message": f"Need at least {min_n} scored outcomes."}
    scores = np.array([d[0] for d in data])
    wins = np.array([d[1] for d in data], dtype=float)
    edges = np.unique(np.quantile(scores, np.linspace(0, 1, bins + 1)))
    rows = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (scores >= lo) & ((scores <= hi) if hi == edges[-1] else (scores < hi))
        n = int(m.sum())
        if n == 0:
            continue
        p = float(wins[m].mean())
        z = 1.96
        den = 1 + z * z / n
        centre, half = (p + z * z / (2 * n)) / den, z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
        rows.append({"score_from": float(lo), "score_to": float(hi), "n": n, "win_rate": p,
                     "ci95": [max(0.0, centre - half), min(1.0, centre + half)], "calibrated": n >= min_n})
    return {"calibrated": any(r["calibrated"] for r in rows), "n": len(data), "buckets": rows}


def performance_report(trades: list[dict], period: str, start_equity: float) -> dict:
    """Daily / weekly performance facts from journal rows."""
    if not trades:
        return {"period": period, "trades": 0, "summary": f"No trades were closed in this {period}."}
    pnl = np.array([t["pnl"] for t in trades])
    r = np.array([t["r_multiple"] or 0.0 for t in trades])
    by: dict[str, dict] = {}
    for t in trades:
        g = by.setdefault(t["plan_id"], {"trades": 0, "pnl": 0.0, "r": 0.0})
        g["trades"] += 1
        g["pnl"] += t["pnl"]
        g["r"] += t["r_multiple"] or 0.0
    best = max(by.items(), key=lambda kv: kv[1]["pnl"])
    worst = min(by.items(), key=lambda kv: kv[1]["pnl"])
    wins, losses = pnl[pnl > 0].sum(), -pnl[pnl < 0].sum()
    out = {"period": period, "trades": int(len(pnl)), "net_pnl": float(pnl.sum()),
           "return_pct": float(pnl.sum() / start_equity * 100) if start_equity else None,
           "win_rate": float((pnl > 0).mean()), "profit_factor": float(wins / losses) if losses else None,
           "expectancy_r": float(r.mean()), "by_strategy": by,
           "exits": {k: int(v) for k, v in pd.Series([t["exit_reason"] for t in trades]).value_counts().items()}}
    out["summary"] = (f"{len(pnl)} trade(s) closed this {period}: net {pnl.sum():+.2f} "
                      f"({out['win_rate']:.0%} winners, {r.mean():+.2f}R average). "
                      f"Best: {best[0]} ({best[1]['pnl']:+.2f}). Weakest: {worst[0]} ({worst[1]['pnl']:+.2f}).")
    return out


_SYSTEM = (
    "You write short briefings for a trading desk. You are given a JSON object of facts that were computed "
    "by deterministic code. Restate and organise those facts in clear prose for a trader. Use only the "
    "numbers, prices, events and names present in the JSON; if something is not in the JSON, say it is not "
    "available. Do not predict prices, do not give probabilities, and do not recommend placing, sizing or "
    "skipping a trade: risk decisions are made by a separate rule-based engine. Plain text, under 150 words.")


def narrate(facts: dict, task: str) -> dict | None:
    """Optional LLM rewording of deterministic facts. Returns None when no API
    key is configured, the SDK is not installed, the model declines, or the
    call fails; callers always fall back to the deterministic text.

    NOTE: implemented against the Anthropic Python SDK; not executed in this
    project's test run because no API key was available."""
    s = get_settings()
    if not s.anthropic_api_key:
        return None
    try:
        import anthropic
    except ImportError:
        log.info("anthropic SDK not installed (pip install -r requirements-ai.txt)")
        return None
    try:
        client = anthropic.Anthropic(api_key=s.anthropic_api_key, timeout=30.0)
        resp = client.beta.messages.create(
            model=s.ai_model, max_tokens=2000, system=_SYSTEM,
            output_config={"effort": "low"},
            betas=["server-side-fallback-2026-07-01"], fallbacks="default",
            messages=[{"role": "user", "content": f"Task: {task}\n\nFacts (JSON):\n{json.dumps(facts, default=str)}"}])
    except anthropic.RateLimitError:
        log.warning("AI narration rate limited")
        return None
    except anthropic.APIStatusError as e:
        log.warning("AI narration failed: HTTP %s", e.status_code)
        return None
    except anthropic.APIConnectionError:
        log.warning("AI narration unreachable")
        return None
    if resp.stop_reason == "refusal":
        return None
    text = "".join(b.text for b in resp.content if b.type == "text").strip()
    return {"text": text, "generated_by": "llm", "model": resp.model,
            "notice": "Reworded by a language model from computed facts. Not a probability or a recommendation."} if text else None
