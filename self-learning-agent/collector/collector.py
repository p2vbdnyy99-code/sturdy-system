"""Live collector: launches in, labeled JSONL out (the format orb/replay.py reads).

One websocket connection (both feeds ask for exactly one). New launches are
free; every buy/sell message on a tracked token is metered by the feed, so the
collector samples launches at random, caps how many it tracks at once, and
stops taking new ones once a message budget is spent.

Each tracked launch ends as exactly one of:
  labeled   -> <out>             snapshot + outcome + realized_return + metadata
  skipped   -> <out>.skipped     guard reject, connection gap, no price, non-SOL quote
Writing the skips too keeps the dataset auditable: you can see what was dropped and why.
"""
import asyncio
import json
import random
import time
from dataclasses import dataclass, field
from typing import Optional

from orb.features import CLASSES
from orb.guard import Guard

from .events import Create, Lifecycle, Trade, parse
from .tracker import TokenTracker, TrackerConfig

FEEDS = {
    "pumpdev": "wss://pumpdev.io/ws",
    "pumpportal": "wss://pumpportal.fun/api/data",
}
COLLECTOR_VERSION = 1


@dataclass
class CollectorConfig:
    feed: str = "pumpdev"
    api_key: Optional[str] = None
    url: Optional[str] = None             # overrides the feed's default URL
    max_live: int = 5                     # tokens tracked at once (PumpDev keyless: 5)
    sample_rate: float = 1.0              # chance a launch is tracked when a slot is free
    max_trade_messages: Optional[int] = None
    run_for_s: Optional[float] = None     # stop taking new launches after this; finish live ones
    prefilter_guard: bool = True          # drop guard-rejected launches at decision time
    trace_grace_s: float = 5.0
    max_trace_wallets: int = 30
    # Watchdog: a feed that has run out of quota goes quiet without saying so, and quiet
    # tokens would then be labeled "timeout" at a stale price. If at most silence_max_msgs
    # trade messages arrive in silence_s while silence_min_live tokens are tracked, the
    # live tokens are dropped as "feed silent" and collection stops.
    silence_s: float = 300.0
    silence_max_msgs: int = 5
    silence_min_live: int = 3
    stats_every_s: float = 60.0
    tracker: TrackerConfig = field(default_factory=TrackerConfig)


class Collector:
    def __init__(self, cfg, out_path, sol_price, tracer=None, connect=None,
                 clock=time.time, rng=None, guard=None):
        self.cfg = cfg
        self.out_path = out_path
        self.skip_path = out_path + ".skipped"
        self.sol_price = sol_price
        self.tracer = tracer
        self.connect = connect
        self.clock = clock
        self.rng = rng or random.Random()
        self.guard = guard or Guard()
        self.live = {}               # mint -> TokenTracker
        self.pending = {}            # mint -> (snapshot, meta) waiting for an outcome
        self.deciding = set()
        self.ws = None
        self.started = clock()
        self.trade_times = []        # arrival times of recent trade messages (watchdog)
        self.feed_silent = False
        self.stats = {"launches": 0, "tracked": 0, "labeled": 0, "skipped": 0,
                      "trade_msgs": 0, "slots_full": 0, "not_sampled": 0, "unpriceable": 0}
        self.outcomes = {c: 0 for c in CLASSES}
        self.skip_reasons = {}

    # ---- policy ---------------------------------------------------------
    def accepting(self):
        c = self.cfg
        if self.feed_silent:
            return False
        if c.run_for_s is not None and self.clock() - self.started >= c.run_for_s:
            return False
        if c.max_trade_messages is not None and self.stats["trade_msgs"] >= c.max_trade_messages:
            return False
        return True

    def finished(self):
        return not self.accepting() and not self.live

    def url(self):
        base = self.cfg.url or FEEDS[self.cfg.feed]
        if self.cfg.feed == "pumpportal" and self.cfg.api_key:
            return f"{base}?api-key={self.cfg.api_key}"
        return base

    # ---- websocket ------------------------------------------------------
    async def _send(self, payload):
        if self.ws is not None:
            try:
                await self.ws.send(json.dumps(payload))
            except Exception as e:
                print(f"[ws] send failed: {e}")

    def send(self, payload):
        if self.ws is not None:
            asyncio.ensure_future(self._send(payload))

    async def run(self):
        price_task = asyncio.ensure_future(self.sol_price.run())
        tick_task = asyncio.ensure_future(self._ticker())
        backoff = 1.0
        try:
            while not self.finished():
                try:
                    async with self.connect(self.url()) as ws:
                        self.ws, backoff = ws, 1.0
                        if self.cfg.feed == "pumpdev" and self.cfg.api_key:
                            await self._send({"method": "auth", "key": self.cfg.api_key})
                        await self._send({"method": "subscribeNewToken"})
                        print(f"[ws] connected to {self.cfg.feed}")
                        async for raw in ws:
                            self.handle(raw)
                            if self.finished():
                                break
                except asyncio.CancelledError:
                    raise
                except Exception as e:
                    print(f"[ws] disconnected: {e!r}")
                finally:
                    self.ws = None
                    # Trades may have been missed during the gap: no label is trustworthy.
                    for mint in list(self.live):
                        self.live[mint].censor("connection gap")
                        self.finish(mint)
                if not self.finished():
                    await asyncio.sleep(backoff)
                    backoff = min(backoff * 2, 60.0)
        finally:
            tick_task.cancel()
            price_task.cancel()
            self.print_stats()

    # ---- message handling -----------------------------------------------
    def handle(self, raw):
        try:
            msg = json.loads(raw)
        except (TypeError, ValueError):
            return
        if isinstance(msg, dict) and msg.get("type") == "error":
            print(f"[feed] {msg.get('code')}: {msg.get('message')}")
            return
        ev = parse(msg)
        now = self.clock()
        if isinstance(ev, Create):
            self.on_create(ev, now)
        elif isinstance(ev, Trade):
            self.stats["trade_msgs"] += 1
            self.trade_times.append(now)
            tr = self.live.get(ev.mint)
            if tr is None:
                return
            was_observing = tr.state == "observing"
            tr.on_trade(ev, now)
            if (was_observing and ev.is_buy and self.tracer is not None
                    and ev.trader != tr.c.creator and len(tr.bought) <= self.cfg.max_trace_wallets):
                self.tracer.start(ev.trader)
            if tr.state == "done":
                self.finish(ev.mint)
        elif isinstance(ev, Lifecycle):
            tr = self.live.get(ev.mint)
            if tr is not None:
                tr.migrated = True

    def on_create(self, ev, now):
        self.stats["launches"] += 1
        if not self.accepting():
            return
        if ev.non_sol_quote or ev.price is None:
            self.stats["unpriceable"] += 1   # skipped before spending any trade messages
            return
        if len(self.live) >= self.cfg.max_live:
            self.stats["slots_full"] += 1
            return
        if self.rng.random() >= self.cfg.sample_rate:
            self.stats["not_sampled"] += 1
            return
        self.live[ev.mint] = TokenTracker(ev, now, self.cfg.tracker)
        self.stats["tracked"] += 1
        self.send({"method": "subscribeTokenTrade", "keys": [ev.mint]})
        if self.tracer is not None:
            self.tracer.start(ev.creator)

    # ---- decisions and outcomes ----------------------------------------
    async def _ticker(self):
        last_stats = self.clock()
        while True:
            await asyncio.sleep(1.0)
            self.tick()
            if self.clock() - last_stats >= self.cfg.stats_every_s:
                self.print_stats()
                last_stats = self.clock()

    def check_silence(self, now):
        c = self.cfg
        cutoff = now - c.silence_s
        self.trade_times = [t for t in self.trade_times if t >= cutoff]
        watched_long_enough = now - self.started >= c.silence_s
        if (watched_long_enough and not self.feed_silent and len(self.live) >= c.silence_min_live
                and len(self.trade_times) <= c.silence_max_msgs):
            self.feed_silent = True
            print(f"[watchdog] {len(self.trade_times)} trade msgs in {c.silence_s:.0f}s with "
                  f"{len(self.live)} live tokens: feed likely throttled; dropping live tokens and stopping")
            for mint in list(self.live):
                self.live[mint].censor("feed silent")
                if mint not in self.deciding:
                    self.finish(mint)

    def tick(self):
        now = self.clock()
        self.check_silence(now)
        for mint, tr in list(self.live.items()):
            if tr.decision_due(now) and mint not in self.deciding:
                tr.freeze(now)
                self.deciding.add(mint)
                asyncio.ensure_future(self.decide(mint, tr, now))
            elif tr.state == "labeling":
                tr.check_timeout(now)
            if tr.state == "done" and mint not in self.deciding:
                self.finish(mint)

    async def decide(self, mint, tr, t0):
        try:
            connected, method = None, None
            if self.tracer is not None:
                connected, complete = await self.tracer.resolve(
                    tr.c.creator, tr.buyers()[: self.cfg.max_trace_wallets], self.cfg.trace_grace_s)
                if not complete:
                    method = "funding_trace_partial"
            if tr.state == "done":          # censored while we waited (e.g. connection gap)
                return
            sol_usd = self.sol_price.value
            if sol_usd is None:
                tr.censor("no SOL/USD price")
                return
            out = tr.snapshot(t0, sol_usd, connected)
            if out is None:
                return
            snap, meta = out
            if method:
                meta["connected_method"] = method
            if self.cfg.prefilter_guard:
                reasons = self.guard.check(snap)
                if reasons:
                    # Set directly: replayed trades may already have resolved the tracker,
                    # and a guard reject must never be written as a labeled record.
                    tr.censored, tr.state = "guard: " + ", ".join(reasons), "done"
                    return
            self.pending[mint] = (snap, meta)
        finally:
            self.deciding.discard(mint)
            if tr.state == "done":
                self.finish(mint)

    def finish(self, mint):
        tr = self.live.pop(mint, None)
        if tr is None:
            return
        self.send({"method": "unsubscribeTokenTrade", "keys": [mint]})
        pend = self.pending.pop(mint, None)
        if tr.resolution is not None and pend is not None:
            snap, meta = pend
            rec = {**snap.to_dict(), "outcome": CLASSES[tr.resolution.label],
                   "realized_return": round(tr.resolution.realized_return, 6),
                   **meta, "resolved_at": tr.resolution.resolved_at,
                   "migrated": getattr(tr, "migrated", False),
                   "feed": self.cfg.feed, "collector_version": COLLECTOR_VERSION,
                   "observe_s": self.cfg.tracker.observe_s, "horizon_s": self.cfg.tracker.horizon_s,
                   "bundle_window_s": self.cfg.tracker.bundle_window_s}
            self._append(self.out_path, rec)
            self.stats["labeled"] += 1
            self.outcomes[rec["outcome"]] += 1
        else:
            reason = tr.censored or "unresolved"
            key = reason.split(":")[0]
            self.skip_reasons[key] = self.skip_reasons.get(key, 0) + 1
            self.stats["skipped"] += 1
            self._append(self.skip_path, {"mint": mint, "reason": reason,
                                          "created_at": tr.t_created, "at": self.clock()})

    @staticmethod
    def _append(path, rec):
        with open(path, "a") as f:
            f.write(json.dumps(rec) + "\n")

    def print_stats(self):
        s = self.stats
        mins = max((self.clock() - self.started) / 60, 1e-9)
        print(f"[stats] {mins:.1f} min | launches {s['launches']} tracked {s['tracked']} "
              f"live {len(self.live)} | labeled {s['labeled']} {self.outcomes} | "
              f"skipped {s['skipped']} {self.skip_reasons} | trade msgs {s['trade_msgs']} "
              f"({s['trade_msgs'] / mins:.0f}/min)")
