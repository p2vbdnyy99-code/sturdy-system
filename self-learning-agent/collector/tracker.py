"""Per-launch state machine: observe -> decision snapshot -> label the outcome.

    created ──observe_s──► snapshot (features + entry price) ──► labeling
    labeling: first trade with return >= take_profit  -> take_profit
              first trade with return <= stop_loss    -> stop_loss
              horizon_s passes with neither           -> timeout (return at horizon)

Only data that arrived before the decision time goes into the snapshot.
Labels use trade prices as they arrive; a stop-loss keeps the real gapped
return (a rug to -90% is recorded as -90%), while a take-profit is capped at
the threshold, so both errors lean pessimistic.
"""
from dataclasses import dataclass, field
from typing import Optional

from orb.features import SL, TIMEOUT, TP, LaunchSnapshot

from .events import TOTAL_SUPPLY, Create, Trade


@dataclass
class TrackerConfig:
    observe_s: float = 120.0
    horizon_s: float = 3600.0
    take_profit: float = 0.60
    stop_loss: float = -0.30
    bundle_window_s: float = 1.0   # first buys this close to creation count as "same bundle"


@dataclass
class Resolution:
    label: int
    realized_return: float
    resolved_at: float


class TokenTracker:
    def __init__(self, create: Create, t_created: float, cfg: TrackerConfig):
        self.c = create
        self.cfg = cfg
        self.t_created = t_created
        self.state = "observing"          # observing | labeling | done
        self.censored: Optional[str] = None
        self.price = create.price
        self.liquidity_sol = create.liquidity_sol
        self.balances = {create.creator: create.initial_buy_tokens}
        self.bought = {}                  # wallet -> gross tokens bought (excl. creator's initial buy)
        self.buy_sol = {}                 # wallet -> SOL spent buying
        self.first_buy_t = {}
        self.sell_sol = 0.0
        self.trades_seen = 0
        self.decision_t: Optional[float] = None
        self.entry_price: Optional[float] = None
        self.resolution: Optional[Resolution] = None

    # ---- ingest ---------------------------------------------------------
    def on_trade(self, tr: Trade, t: float):
        if self.state == "done":
            return
        if tr.non_sol_quote:
            self.censor("non-SOL quote")
            return
        if self.state == "frozen":
            self.buffer.append((tr, t))   # applied after the snapshot, as labeling data
            return
        if self.state == "labeling":
            # A trade that lands after the horizon must not decide the label.
            if self.check_timeout(t):
                return
        self.trades_seen += 1
        if tr.price is not None:
            self.price = tr.price
        if tr.liquidity_sol is not None:
            self.liquidity_sol = tr.liquidity_sol

        if self.state == "observing":
            w = tr.trader
            if tr.is_buy:
                self.balances[w] = self.balances.get(w, 0.0) + tr.tokens
                if w != self.c.creator:
                    self.bought[w] = self.bought.get(w, 0.0) + tr.tokens
                    self.first_buy_t.setdefault(w, t)
                self.buy_sol[w] = self.buy_sol.get(w, 0.0) + tr.sol
            else:
                self.balances[w] = self.balances.get(w, 0.0) - tr.tokens
                self.sell_sol += tr.sol
        elif self.state == "labeling" and tr.price is not None:
            r = tr.price / self.entry_price - 1.0
            if r >= self.cfg.take_profit:
                self._resolve(TP, self.cfg.take_profit, t)
            elif r <= self.cfg.stop_loss:
                self._resolve(SL, r, t)

    # ---- decision -------------------------------------------------------
    def decision_due(self, t: float) -> bool:
        return self.state == "observing" and t - self.t_created >= self.cfg.observe_s

    def freeze(self, t: float):
        """Stop folding trades into features at time t. Trades that arrive while the
        snapshot is being finished (e.g. waiting on funding traces) are buffered and
        replayed into labeling, so no post-decision data leaks into the features."""
        self.state, self.freeze_t, self.buffer = "frozen", t, []

    def buyers(self):
        """Buyer wallets (excl. creator), largest token buys first."""
        return sorted(self.bought, key=self.bought.get, reverse=True)

    def bundle_wallets(self):
        return {w for w, t0 in self.first_buy_t.items() if t0 - self.t_created <= self.cfg.bundle_window_s}

    def snapshot(self, t: float, sol_usd: float, connected: Optional[set] = None):
        """Freeze features at decision time and start labeling. `connected` is the set of
        buyer wallets linked by funding source; None falls back to the bundle heuristic."""
        if self.price is None or self.liquidity_sol is None:
            self.censor("no price at decision time")
            return None
        bundle = self.bundle_wallets()
        method = "funding_trace"
        if connected is None:
            connected, method = set(bundle), "bundle_heuristic"
        linked = {self.c.creator} | bundle | connected

        total_buy_sol = self.c.sol_amount + sum(self.buy_sol.values())
        organic_sol = sum(s for w, s in self.buy_sol.items() if w not in linked)
        holdings = sorted((max(b, 0.0) for b in self.balances.values()), reverse=True)

        snap = LaunchSnapshot(
            launch_id=self.c.mint,
            organic_buy_share=organic_sol / total_buy_sol if total_buy_sol > 0 else 0.0,
            connected_wallet_share=sum(self.bought.get(w, 0.0) for w in connected) / TOTAL_SUPPLY,
            sell_buy_ratio=self.sell_sol / total_buy_sol if total_buy_sol > 0 else 0.0,
            top10_holder_share=sum(holdings[:10]) / TOTAL_SUPPLY,
            creator_share=max(self.balances.get(self.c.creator, 0.0), 0.0) / TOTAL_SUPPLY,
            same_bundle_share=sum(self.bought[w] for w in bundle) / TOTAL_SUPPLY,
            unique_buyers=len(self.bought),
            liquidity_usd=self.liquidity_sol * sol_usd,
        )
        meta = {
            "created_at": self.t_created, "decision_at": t,
            "entry_price_sol": self.price, "liquidity_sol": self.liquidity_sol, "sol_usd": sol_usd,
            "trades_in_window": self.trades_seen, "connected_method": method,
            # A standard pump.fun curve never holds < 30 virtual SOL. Seen live on a few
            # launches and not yet explained; flagged so such records can be filtered.
            "nonstandard_curve": self.liquidity_sol < 30.0 - 1e-6,
            "creator": self.c.creator,
        }
        self.state, self.decision_t, self.entry_price = "labeling", t, self.price
        for tr, tt in getattr(self, "buffer", []):
            self.on_trade(tr, tt)
        self.buffer = []
        return snap, meta

    # ---- labeling -------------------------------------------------------
    def check_timeout(self, t: float) -> bool:
        if self.state == "labeling" and t - self.decision_t >= self.cfg.horizon_s:
            self._resolve(TIMEOUT, self.price / self.entry_price - 1.0, self.decision_t + self.cfg.horizon_s)
            return True
        return False

    def _resolve(self, label, ret, t):
        self.resolution = Resolution(label, ret, t)
        self.state = "done"

    def censor(self, reason: str):
        if self.state != "done":
            self.censored, self.state = reason, "done"
