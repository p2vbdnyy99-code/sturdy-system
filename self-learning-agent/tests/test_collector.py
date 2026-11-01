import asyncio
import json
import os
import tempfile
import unittest

from collector.collector import Collector, CollectorConfig
from collector.events import Create, Lifecycle, Trade, parse
from collector.funding import ESTABLISHED, connected_wallets, find_funder
from collector.tracker import TokenTracker, TrackerConfig
from orb.agent import Config, OrbAgent
from orb.features import SL, TIMEOUT, TP
from orb.replay import replay

# Captured live from PumpPortal's subscribeNewToken stream (2026-11-01).
LIVE_CREATE = {
    "signature": "4TLyPx5qT8J7x8esjKLZQVrWou9UTfva4eJSpg6vVAEfTN4tpZL5GWWK7nekJ239T1LWkNuSjkteobMT9BJRxZUj",
    "mint": "5wUz1j3yMsoTkSmAuPGvCCBJVSRMUTLsxQ8pp7nwpump",
    "traderPublicKey": "DCpQiCAiQD9RdPCkUb2Zb7a3JE1qgiMyok6kcqjurbXu", "txType": "create",
    "initialBuy": 2150512.494632, "solAmount": 0.060246912,
    "bondingCurveKey": "A39gWonnFLbm4kYFKFo2hBtZ3fEv879c3WtDo77BicvC",
    "vTokensInBondingCurve": 1070849487.505368, "vSolInBondingCurve": 30.06024691199998,
    "marketCapSol": 28.071402435862204, "name": "Chaotic Rocket", "symbol": "CHAROC",
    "uri": "https://ipfs.io/ipfs/x", "is_mayhem_mode": True, "pool": "pump"}

MINT, CREATOR = "MintAAA", "Creator1"
P0 = 28e-9  # SOL per token used by the helpers below


def create_msg(initial_buy=20_000_000, sol=0.6):
    return {"mint": MINT, "txType": "create", "traderPublicKey": CREATOR, "initialBuy": initial_buy,
            "solAmount": sol, "vSolInBondingCurve": P0 * 1e9, "vTokensInBondingCurve": 1e9}


def trade_msg(trader, buy=True, tokens=5_000_000, sol=0.15, mult=1.0):
    return {"mint": MINT, "txType": "buy" if buy else "sell", "traderPublicKey": trader,
            "tokenAmount": tokens, "solAmount": sol,
            "vSolInBondingCurve": P0 * mult * 1e9, "vTokensInBondingCurve": 1e9}


def ev(m):
    return parse(m)


class ParseTests(unittest.TestCase):
    def test_live_create(self):
        c = parse(LIVE_CREATE)
        self.assertIsInstance(c, Create)
        self.assertEqual(c.creator, "DCpQiCAiQD9RdPCkUb2Zb7a3JE1qgiMyok6kcqjurbXu")
        # price x 1B supply should reproduce the feed's own market cap
        self.assertAlmostEqual(c.price * 1e9, LIVE_CREATE["marketCapSol"], places=6)

    def test_pumpdev_raw_reserves(self):
        # Captured live from PumpDev (2026-11-01): reserves in lamports / raw token units.
        c = parse({"mint": "Mp", "txType": "create", "traderPublicKey": "K", "initialBuy": 52213744.923196,
                   "solAmount": 1.534515517, "vSolInBondingCurve": 30000000000,
                   "vTokensInBondingCurve": 1073000000000000, "marketCapSol": 27.958993476234856,
                   "quoteMint": "So11111111111111111111111111111111111111112"})
        self.assertAlmostEqual(c.price * 1e9, 27.958993476234856, places=6)
        self.assertAlmostEqual(c.liquidity_sol, 30.0)
        t = parse({"mint": "Mp", "txType": "buy", "traderPublicKey": "B", "solAmount": 0.200254274,
                   "tokenAmount": 6441414.630256, "vSolInBondingCurve": 35435757710,
                   "vTokensInBondingCurve": 1014344840446548, "marketCapSol": 34.93462607292408})
        self.assertAlmostEqual(t.price * 1e9, 34.93462607292408, places=6)
        self.assertAlmostEqual(t.liquidity_sol, 35.43575771)

    def test_non_sol_create_not_tracked(self):
        c = parse({**create_msg(), "quoteMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"})
        self.assertTrue(c.non_sol_quote)

    def test_documented_curve_trade(self):
        t = parse({"signature": "5xK9", "mint": "M", "traderPublicKey": "W", "txType": "buy",
                   "quoteMint": "So11111111111111111111111111111111111111112", "quoteTokenDecimals": 9,
                   "quoteAmount": 0.5, "solAmount": 0.5, "tokenAmount": 1000000,
                   "vTokensInBondingCurve": 900000000, "vSolInBondingCurve": 35, "marketCapSol": 40.5})
        self.assertIsInstance(t, Trade)
        self.assertTrue(t.is_buy)
        self.assertEqual((t.source, t.sol, t.tokens), ("curve", 0.5, 1000000))
        self.assertAlmostEqual(t.price, 35 / 900000000)

    def test_pumpswap_sol_and_non_sol(self):
        sol = parse({"mint": "M", "txType": "sell", "traderPublicKey": "W", "source": "pumpswap",
                     "quoteMint": "So11111111111111111111111111111111111111112", "quoteTokenDecimals": 9,
                     "solAmount": 1.0, "tokenAmount": 10, "poolBaseReserves": 200_000_000_000_000,
                     "poolEffectiveQuoteReserves": 85_000_000_000})
        self.assertAlmostEqual(sol.price, 85 / 200_000_000)
        usdc = parse({"mint": "M", "txType": "buy", "traderPublicKey": "W", "source": "pumpswap",
                      "quoteMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "quoteAmount": None,
                      "tokenAmount": 2116283, "poolBaseReserves": 8e11, "poolEffectiveQuoteReserves": 2.5e10})
        self.assertTrue(usdc.non_sol_quote)
        self.assertIsNone(usdc.price)

    def test_control_frames_and_lifecycle(self):
        self.assertIsNone(parse({"message": "Successfully subscribed to token creation events."}))
        self.assertIsNone(parse({"type": "subscribed", "keys": ["M"]}))
        self.assertIsInstance(parse({"mint": "M", "txType": "complete"}), Lifecycle)


class TrackerTests(unittest.TestCase):
    def make(self, **kw):
        cfg = TrackerConfig(**kw)
        tr = TokenTracker(ev(create_msg()), 0.0, cfg)
        tr.on_trade(ev(trade_msg("bundle1", tokens=50_000_000, sol=1.5)), 0.4)   # same-bundle buy
        for i in range(20):
            tr.on_trade(ev(trade_msg(f"w{i}")), 10.0 + i)
        tr.on_trade(ev(trade_msg("w0", buy=False, tokens=5_000_000, sol=0.3)), 40.0)
        return tr

    def test_features(self):
        tr = self.make()
        snap, meta = tr.snapshot(120.0, 150.0)
        total_buy = 0.6 + 1.5 + 20 * 0.15
        self.assertAlmostEqual(snap.organic_buy_share, 20 * 0.15 / total_buy)
        self.assertAlmostEqual(snap.sell_buy_ratio, 0.3 / total_buy)
        self.assertAlmostEqual(snap.same_bundle_share, 0.05)
        self.assertAlmostEqual(snap.connected_wallet_share, 0.05)   # bundle heuristic
        self.assertAlmostEqual(snap.creator_share, 0.02)
        # top 10: bundle 50M + creator 20M + 8 wallets x 5M (w0 sold out)
        self.assertAlmostEqual(snap.top10_holder_share, (50e6 + 20e6 + 8 * 5e6) / 1e9)
        self.assertEqual(snap.unique_buyers, 21)
        self.assertAlmostEqual(snap.liquidity_usd, 28 * 150)
        self.assertEqual(meta["connected_method"], "bundle_heuristic")
        self.assertTrue(meta["nonstandard_curve"])  # helper curve holds 28 SOL

    def test_take_profit_capped(self):
        tr = self.make()
        tr.snapshot(120.0, 150.0)
        tr.on_trade(ev(trade_msg("x", mult=1.9)), 200.0)
        self.assertEqual((tr.resolution.label, tr.resolution.realized_return), (TP, 0.60))

    def test_stop_loss_keeps_gap(self):
        tr = self.make()
        tr.snapshot(120.0, 150.0)
        tr.on_trade(ev(trade_msg("rug", buy=False, mult=0.15)), 300.0)
        self.assertEqual(tr.resolution.label, SL)
        self.assertAlmostEqual(tr.resolution.realized_return, -0.85)

    def test_timeout_ignores_trades_after_horizon(self):
        tr = self.make(horizon_s=600)
        tr.snapshot(120.0, 150.0)
        tr.on_trade(ev(trade_msg("y", mult=1.2)), 500.0)
        tr.on_trade(ev(trade_msg("late", mult=3.0)), 721.0)        # after 120 + 600
        self.assertEqual(tr.resolution.label, TIMEOUT)
        self.assertAlmostEqual(tr.resolution.realized_return, 0.2)

    def test_frozen_trades_label_but_do_not_leak_into_features(self):
        tr = self.make()
        tr.freeze(120.0)
        tr.on_trade(ev(trade_msg("whale", tokens=300_000_000, sol=20, mult=2.0)), 121.0)
        snap, _ = tr.snapshot(120.0, 150.0)
        self.assertEqual(snap.unique_buyers, 21)                    # whale not counted
        self.assertEqual(tr.resolution.label, TP)                   # but it decided the label

    def test_non_sol_quote_censors(self):
        tr = self.make()
        tr.on_trade(Trade(MINT, "u", True, 0, 1, None, None, "pumpswap", non_sol_quote=True), 50.0)
        self.assertEqual(tr.censored, "non-SOL quote")


class FundingTests(unittest.TestCase):
    def test_grouping(self):
        funders = {"c": "F0", "a": "F1", "b": "F1", "d": "HUB", "e": "HUB", "f": ESTABLISHED,
                   "g": "c", "h": None}
        out = connected_wallets("c", ["a", "b", "d", "e", "f", "g", "h"], funders, hubs={"HUB"})
        self.assertEqual(out, {"a", "b", "g"})   # shared funder F1; g funded by creator

    def test_find_funder(self):
        tx = {"transaction": {"message": {"instructions": [
            {"parsed": {"type": "transfer", "info": {"source": "Funder", "destination": "W", "lamports": 1}}}]}},
            "meta": {"innerInstructions": []}}
        self.assertEqual(find_funder(tx, "W"), "Funder")
        self.assertIsNone(find_funder(tx, "Other"))


class FakePrice:
    value = 150.0

    async def run(self):
        pass


class CollectorTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.out = os.path.join(self.dir.name, "launches.jsonl")
        self.now = 0.0

    def tearDown(self):
        self.dir.cleanup()

    def collector(self, **kw):
        cfg = CollectorConfig(tracker=TrackerConfig(observe_s=120, horizon_s=600), **kw)
        return Collector(cfg, self.out, FakePrice(), clock=lambda: self.now)

    def feed(self, col, msg, t):
        self.now = t
        col.handle(json.dumps(msg))

    def lines(self, path):
        if not os.path.exists(path):
            return []
        with open(path) as f:
            return [json.loads(x) for x in f]

    def run_launch(self, col, exit_mult):
        async def go():
            self.feed(col, create_msg(), 0.0)
            for i in range(20):
                self.feed(col, trade_msg(f"w{i}"), 10.0 + i)
            self.now = 121.0
            col.tick()
            await asyncio.sleep(0)            # let the decision task run
            self.feed(col, trade_msg("z", mult=exit_mult), 200.0)
            col.tick()
        asyncio.run(go())

    def test_end_to_end_record_replays(self):
        col = self.collector()
        self.run_launch(col, exit_mult=0.5)
        recs = self.lines(self.out)
        self.assertEqual(len(recs), 1)
        self.assertEqual((recs[0]["launch_id"], recs[0]["outcome"]), (MINT, "stop_loss"))
        self.assertAlmostEqual(recs[0]["realized_return"], -0.5)
        self.assertEqual(col.live, {})
        rep = replay(OrbAgent(Config(warmup=1)), self.out)
        self.assertEqual(rep["resolved"], 1)

    def test_guard_reject_goes_to_skipped(self):
        col = self.collector()

        async def go():
            self.feed(col, create_msg(initial_buy=400_000_000), 0.0)   # creator holds 40%
            self.now = 121.0
            col.tick()
            await asyncio.sleep(0)
            col.tick()
        asyncio.run(go())
        self.assertEqual(self.lines(self.out), [])
        skipped = self.lines(self.out + ".skipped")
        self.assertTrue(skipped[0]["reason"].startswith("guard:"))

    def test_slots_and_budget(self):
        col = self.collector(max_live=1, max_trade_messages=3)
        self.feed(col, create_msg(), 0.0)
        self.feed(col, {**create_msg(), "mint": "Other"}, 1.0)
        self.assertEqual((len(col.live), col.stats["slots_full"]), (1, 1))
        for i in range(3):
            self.feed(col, trade_msg(f"w{i}"), 2.0 + i)
        self.assertFalse(col.accepting())


if __name__ == "__main__":
    unittest.main()
