"""SYNTHETIC launch generator for testing the learning loop.

This is not market data. It produces launches whose outcomes follow a hidden
rule (or no rule at all, with signal=0) so you can check that the agent
learns real signal and, just as important, refuses to trade when there is
none. Any P&L it produces says nothing about real-market profitability.
"""
import math
import random

from .features import TP, SL, TIMEOUT, LaunchSnapshot
from .model import softmax


class SyntheticMarket:
    def __init__(self, seed=0, signal=1.0, rug_rate=0.25):
        self.rng = random.Random(seed)
        self.signal = signal          # 0 = outcomes independent of features
        self.rug_rate = rug_rate      # share of stop-losses that gap far below -30%
        self.i = 0

    def next_launch(self):
        r = self.rng
        self.i += 1
        s = LaunchSnapshot(
            launch_id=f"sim-{self.i}",
            organic_buy_share=r.betavariate(2, 3),
            connected_wallet_share=r.betavariate(1.5, 6),
            sell_buy_ratio=r.lognormvariate(-0.7, 0.5),
            top10_holder_share=r.betavariate(3, 7),
            creator_share=r.betavariate(1, 25),
            same_bundle_share=r.betavariate(1, 12),
            unique_buyers=int(r.lognormvariate(3.6, 0.6)),
            liquidity_usd=r.lognormvariate(math.log(9000), 0.6),
        )
        return s, self._outcome(s)

    def _outcome(self, s):
        k = self.signal
        z_tp = -1.4 + k * (3.0 * s.organic_buy_share - 3.0 * s.connected_wallet_share
                           - 1.2 * s.sell_buy_ratio + 0.4 * math.log1p(s.unique_buyers))
        z_sl = 0.6 + k * (2.0 * s.connected_wallet_share + 1.0 * s.sell_buy_ratio
                          + 2.0 * s.top10_holder_share + 4.0 * s.same_bundle_share)
        z_to = 0.3
        p = softmax([z_tp, z_sl, z_to])
        u = self.rng.random()
        label = TP if u < p[TP] else SL if u < p[TP] + p[SL] else TIMEOUT
        if label == TP:
            ret = 0.60 - self.rng.uniform(0, 0.05)       # slippage past the trigger
        elif label == SL:
            ret = (self.rng.uniform(-0.95, -0.40) if self.rng.random() < self.rug_rate
                   else -0.30 - self.rng.uniform(0, 0.05))
        else:
            ret = self.rng.uniform(-0.28, 0.45) - 0.05
        return label, ret
