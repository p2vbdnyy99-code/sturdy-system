"""Round-trip execution cost as a fraction of position size.

Assumptions (all configurable; check them against the venue you use):
- Constant-product pricing: buying S USD against quote reserve L moves the
  average fill by S/L relative to spot (exact for x*y=k, before fees). The
  exit is modelled with the same impact.
- Swap fee charged on both legs.
- Priority fee + Jito tip are a flat USD amount per transaction, two txs.
"""
from dataclasses import dataclass


@dataclass
class CostModel:
    swap_fee: float = 0.01          # per leg; set to your venue's actual fee
    fixed_usd_per_tx: float = 0.15  # priority fee + tip, per transaction

    def round_trip_fraction(self, size_usd: float, liquidity_usd: float) -> float:
        if size_usd <= 0:
            raise ValueError("size_usd must be positive")
        if liquidity_usd <= 0:
            return float("inf")
        impact = size_usd / liquidity_usd
        return 2 * self.swap_fee + 2 * impact + 2 * self.fixed_usd_per_tx / size_usd
