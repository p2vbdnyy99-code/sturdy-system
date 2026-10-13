"""Launch snapshot -> feature vector.

A snapshot is what the agent knows about a launch at decision time. Every
field is something you can compute from on-chain data in the first minutes
after launch; nothing here may peek at the future outcome.
"""
from dataclasses import dataclass, asdict, fields

# Outcome classes. Order matters: it is the column order of the model.
TP, SL, TIMEOUT = 0, 1, 2
CLASSES = ("take_profit", "stop_loss", "timeout")


@dataclass
class LaunchSnapshot:
    launch_id: str
    # Share of buy volume from wallets with no link to creator/bundles (0..1).
    organic_buy_share: float
    # Share of supply bought by wallets funded from a common source (0..1).
    connected_wallet_share: float
    # Sell volume / buy volume over the observation window (>= 0).
    sell_buy_ratio: float
    # Share of supply held by the top 10 holders, excl. the curve/pool (0..1).
    top10_holder_share: float
    # Share of supply still held by the creator wallet (0..1).
    creator_share: float
    # Share of supply bought in the same block/bundle as creation (0..1).
    same_bundle_share: float
    # Unique buyers in the observation window.
    unique_buyers: int
    # Quote-side liquidity (USD) in the curve or pool at decision time.
    liquidity_usd: float

    def to_dict(self):
        return asdict(self)


FEATURE_NAMES = [
    f.name for f in fields(LaunchSnapshot) if f.name not in ("launch_id", "liquidity_usd")
]


def vectorize(s: LaunchSnapshot):
    """Raw feature vector (unscaled). Liquidity is used by the cost model, not here."""
    import math
    return [
        s.organic_buy_share,
        s.connected_wallet_share,
        s.sell_buy_ratio,
        s.top10_holder_share,
        s.creator_share,
        s.same_bundle_share,
        math.log1p(max(s.unique_buyers, 0)),
    ]
