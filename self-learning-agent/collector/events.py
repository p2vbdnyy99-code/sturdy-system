"""Parse PumpPortal / PumpDev websocket messages into typed events.

Both feeds speak the same protocol. Field names follow the live `create`
messages captured from PumpPortal and the trade shapes PumpDev documents.
Anything unrecognised parses to None rather than raising: one odd frame
must not take the collector down.
"""
from dataclasses import dataclass
from typing import Optional

SOL_MINT = "So11111111111111111111111111111111111111112"
TOTAL_SUPPLY = 1_000_000_000  # every pump.fun token: 1B supply
TOKEN_DECIMALS = 6


@dataclass
class Create:
    mint: str
    creator: str
    initial_buy_tokens: float
    sol_amount: float
    price: Optional[float]          # SOL per token after the creator's buy
    liquidity_sol: Optional[float]  # virtual SOL reserves of the curve
    non_sol_quote: bool = False


@dataclass
class Trade:
    mint: str
    trader: str
    is_buy: bool
    sol: float
    tokens: float
    price: Optional[float]          # SOL per token after this trade; None if unknown
    liquidity_sol: Optional[float]
    source: str                     # "curve" | "pumpswap"
    non_sol_quote: bool = False


@dataclass
class Lifecycle:
    mint: str
    kind: str                       # "complete" | "create_pool"


def _f(v):
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


# Curve reserves arrive in UI units from PumpPortal (vSol ~30-115 SOL, vTokens <= 1.073e9)
# but in raw on-chain units from PumpDev (lamports; token units with 6 decimals), whatever
# its docs say. The ranges are orders of magnitude apart, so the units can be told apart
# from the value itself.
_RAW_SOL_ABOVE = 1e6
_RAW_TOKENS_ABOVE = 1.1e9


def _curve_price(m):
    v_sol, v_tok = _f(m.get("vSolInBondingCurve")), _f(m.get("vTokensInBondingCurve"))
    if not (v_sol and v_tok and v_sol > 0 and v_tok > 0):
        return None, None
    if v_sol > _RAW_SOL_ABOVE:
        v_sol /= 1e9
    if v_tok > _RAW_TOKENS_ABOVE:
        v_tok /= 10 ** TOKEN_DECIMALS
    return v_sol / v_tok, v_sol


def _pool_price(m):
    """Price on PumpSwap from effective reserves (vault + virtual), SOL pairs only."""
    q_ui, b_ui = _f(m.get("poolEffectiveQuoteReservesUi")), _f(m.get("poolBaseReservesUi"))
    if q_ui is None or b_ui is None:
        q_raw, b_raw = _f(m.get("poolEffectiveQuoteReserves")), _f(m.get("poolBaseReserves"))
        q_dec = m.get("quoteTokenDecimals")
        if q_raw is None or b_raw is None or q_dec is None:
            return None, None
        q_ui, b_ui = q_raw / 10 ** int(q_dec), b_raw / 10 ** TOKEN_DECIMALS
    if q_ui > 0 and b_ui > 0:
        return q_ui / b_ui, q_ui
    return None, None


def parse(m: dict):
    if not isinstance(m, dict) or "mint" not in m or "txType" not in m:
        return None  # control frames, acks, errors
    tx = m["txType"]
    mint = m["mint"]
    if tx == "create":
        price, liq = _curve_price(m)
        quote = m.get("quoteMint")
        return Create(mint, m.get("traderPublicKey", ""), _f(m.get("initialBuy")) or 0.0,
                      _f(m.get("solAmount")) or 0.0, price, liq,
                      non_sol_quote=quote is not None and quote != SOL_MINT)
    if tx in ("complete", "create_pool"):
        return Lifecycle(mint, tx)
    if tx not in ("buy", "sell"):
        return None

    quote = m.get("quoteMint")
    non_sol = quote is not None and quote != SOL_MINT
    pumpswap = m.get("source") == "pumpswap" or "poolBaseReserves" in m
    if non_sol:
        price, liq = None, None
    elif pumpswap:
        price, liq = _pool_price(m)
    else:
        price, liq = _curve_price(m)
    sol = _f(m.get("solAmount"))
    if sol is None and not non_sol:
        sol = _f(m.get("quoteAmount"))
    return Trade(mint, m.get("traderPublicKey", ""), tx == "buy", sol or 0.0,
                 _f(m.get("tokenAmount")) or 0.0, price, liq,
                 "pumpswap" if pumpswap else "curve", non_sol)
