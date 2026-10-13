import json
import os
import random
import tempfile
import unittest

from orb.agent import Config, OrbAgent
from orb.costs import CostModel
from orb.features import CLASSES, SL, TP, LaunchSnapshot
from orb.guard import Guard
from orb.model import OnlineSoftmax
from orb.replay import replay
from orb.sim import SyntheticMarket


def snap(i=1, **kw):
    base = dict(launch_id=f"t-{i}", organic_buy_share=0.5, connected_wallet_share=0.1,
                sell_buy_ratio=0.4, top10_holder_share=0.3, creator_share=0.02,
                same_bundle_share=0.05, unique_buyers=40, liquidity_usd=9000.0)
    base.update(kw)
    return LaunchSnapshot(**base)


class CostTests(unittest.TestCase):
    def test_round_trip(self):
        c = CostModel(swap_fee=0.01, fixed_usd_per_tx=0.25)
        # 2*1% fee + 2*(50/10000) impact + 2*0.25/50 fixed = 0.02 + 0.01 + 0.01
        self.assertAlmostEqual(c.round_trip_fraction(50, 10_000), 0.04)

    def test_no_liquidity_is_untradeable(self):
        self.assertEqual(CostModel().round_trip_fraction(50, 0), float("inf"))


class GuardTests(unittest.TestCase):
    def test_pass_and_reject(self):
        g = Guard()
        self.assertEqual(g.check(snap()), [])
        self.assertIn("creator holding", g.check(snap(creator_share=0.5)))
        self.assertIn("thin liquidity", g.check(snap(liquidity_usd=100)))


class ModelTests(unittest.TestCase):
    def test_learns_separable_rule(self):
        rng = random.Random(1)
        m = OnlineSoftmax(2)
        late = []
        for i in range(3000):
            x = [rng.gauss(0, 1), rng.gauss(0, 1)]
            y = TP if x[0] > 0.5 else SL if x[0] < -0.5 else 2
            loss = m.learn(x, y)
            if i >= 2500:
                late.append(loss)
        self.assertLess(sum(late) / len(late), 0.4)  # uniform guess = ln 3 ~ 1.10


class AgentTests(unittest.TestCase):
    def test_rejected_launch_is_not_learned(self):
        a = OrbAgent()
        d = a.observe(snap(creator_share=0.9))
        self.assertEqual(d.action, "reject")
        self.assertIsNone(a.resolve(d.launch_id, SL))
        self.assertEqual(a.model.seen, 0)

    def test_skipped_launches_still_train_model(self):
        a = OrbAgent()
        d = a.observe(snap())
        self.assertEqual(d.action, "skip")  # warmup
        a.resolve(d.launch_id, TP)
        self.assertEqual(a.model.seen, 1)
        self.assertEqual(a.trades, 0)

    def test_no_trades_on_pure_noise(self):
        a, m = OrbAgent(), SyntheticMarket(seed=3, signal=0.0)
        for _ in range(6000):
            s, (y, r) = m.next_launch()
            a.observe(s)
            a.resolve(s.launch_id, y, r)
        self.assertEqual(a.trades, 0)

    def test_learns_and_trades_when_signal_exists(self):
        a, m = OrbAgent(), SyntheticMarket(seed=3, signal=2.0)
        for _ in range(6000):
            s, (y, r) = m.next_launch()
            a.observe(s)
            a.resolve(s.launch_id, y, r)
        rep = a.report()
        self.assertLess(rep["model_logloss"], rep["baseline_logloss"])
        self.assertGreater(a.trades, 0)
        self.assertGreater(a.pnl_usd, 0)

    def test_save_load_roundtrip(self):
        a, m = OrbAgent(), SyntheticMarket(seed=4)
        for _ in range(500):
            s, (y, r) = m.next_launch()
            a.observe(s)
            a.resolve(s.launch_id, y, r)
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "state.json")
            a.save(p)
            b = OrbAgent.load(p)
        s = snap()
        self.assertEqual(a.observe(s).probs, b.observe(s).probs)

    def test_replay_jsonl(self):
        m = SyntheticMarket(seed=5)
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "launches.jsonl")
            with open(p, "w") as f:
                for _ in range(50):
                    s, (y, r) = m.next_launch()
                    f.write(json.dumps({**s.to_dict(), "outcome": CLASSES[y], "realized_return": r}) + "\n")
            a = OrbAgent(Config(warmup=10))
            rep = replay(a, p)
        self.assertGreater(rep["resolved"], 0)


if __name__ == "__main__":
    unittest.main()
