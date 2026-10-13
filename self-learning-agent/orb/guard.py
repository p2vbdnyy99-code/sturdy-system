"""Hard risk filters. A launch that fails GUARD is never traded and never learned from,
so the model only trains on the population it actually decides on."""
from dataclasses import dataclass

from .features import LaunchSnapshot


@dataclass
class Guard:
    max_top10_share: float = 0.45
    max_creator_share: float = 0.10
    max_same_bundle_share: float = 0.25
    max_connected_share: float = 0.40
    min_unique_buyers: int = 15
    min_liquidity_usd: float = 2_000.0

    def check(self, s: LaunchSnapshot):
        """Returns a list of reasons for rejection; empty means pass."""
        reasons = []
        if s.top10_holder_share > self.max_top10_share:
            reasons.append("top10 concentration")
        if s.creator_share > self.max_creator_share:
            reasons.append("creator holding")
        if s.same_bundle_share > self.max_same_bundle_share:
            reasons.append("same-bundle buys")
        if s.connected_wallet_share > self.max_connected_share:
            reasons.append("connected wallets")
        if s.unique_buyers < self.min_unique_buyers:
            reasons.append("too few buyers")
        if s.liquidity_usd < self.min_liquidity_usd:
            reasons.append("thin liquidity")
        return reasons
