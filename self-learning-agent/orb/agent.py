"""The self-learning loop.

    observe(snapshot) -> GUARD -> model probabilities -> expected value after costs
                      -> trade / skip (paper only) -> queued as pending
    resolve(id, outcome) -> paper P&L (if traded) -> model.learn(...)   # skips too

Learning from skipped launches matters: if the agent only learned from trades
it took, its training data would be shaped by its own past mistakes.
"""
import json
import math
import os
from dataclasses import dataclass, asdict, field

from .costs import CostModel
from .features import CLASSES, FEATURE_NAMES, TIMEOUT, TP, SL, LaunchSnapshot, vectorize
from .guard import Guard
from .model import OnlineSoftmax


@dataclass
class Config:
    take_profit: float = 0.60
    stop_loss: float = -0.30
    horizon_minutes: int = 60
    size_usd: float = 50.0
    min_edge: float = 0.03      # required EV after costs, as fraction of size
    warmup: int = 300           # resolved examples before the agent may trade
    min_logloss_gain: float = 0.01  # model must beat the base-rate baseline by this much
    lr: float = 0.05
    l2: float = 1e-4


@dataclass
class Decision:
    launch_id: str
    action: str                 # "trade" | "skip" | "reject"
    reasons: list
    probs: dict = field(default_factory=dict)
    expected_return: float = 0.0
    cost_fraction: float = 0.0


class Metrics:
    """Is the model better than just knowing the base rates? Tracked online,
    scored on each example *before* learning from it (prequential evaluation)."""

    def __init__(self, window=500):
        self.window = window
        self.model_losses, self.base_losses = [], []
        self.label_counts = [1, 1, 1]  # Laplace prior

    def record(self, probs, label):
        total = sum(self.label_counts)
        base_p = self.label_counts[label] / total
        self.model_losses.append(-math.log(max(probs[label], 1e-12)))
        self.base_losses.append(-math.log(base_p))
        self.model_losses = self.model_losses[-self.window:]
        self.base_losses = self.base_losses[-self.window:]
        self.label_counts[label] += 1

    def summary(self):
        n = len(self.model_losses)
        if n == 0:
            return {"n": 0}
        return {
            "n": n,
            "model_logloss": sum(self.model_losses) / n,
            "baseline_logloss": sum(self.base_losses) / n,
        }


class OrbAgent:
    def __init__(self, config=None, cost_model=None, guard=None, journal_path=None):
        self.cfg = config or Config()
        self.costs = cost_model or CostModel()
        self.guard = guard or Guard()
        self.model = OnlineSoftmax(len(FEATURE_NAMES), 3, self.cfg.lr, self.cfg.l2)
        self.metrics = Metrics()
        self.pending = {}            # launch_id -> {"x", "probs", "traded", "cost"}
        self.timeout_ret_sum = 0.0   # learned average return when neither threshold hits
        self.timeout_ret_n = 0
        self.pnl_usd = 0.0
        self.trades = 0
        self.wins = 0
        self.journal_path = journal_path

    # ---- decision -------------------------------------------------------
    def expected_timeout_return(self):
        return self.timeout_ret_sum / self.timeout_ret_n if self.timeout_ret_n else 0.0

    def model_has_skill(self):
        m = self.metrics.summary()
        return (m["n"] >= min(self.metrics.window, self.cfg.warmup)
                and m["model_logloss"] < m["baseline_logloss"] - self.cfg.min_logloss_gain)

    def observe(self, s: LaunchSnapshot) -> Decision:
        reasons = self.guard.check(s)
        if reasons:
            d = Decision(s.launch_id, "reject", reasons)
            self._log("decision", asdict(d))
            return d

        x = vectorize(s)
        probs = self.model.predict_proba(x)
        cost = self.costs.round_trip_fraction(self.cfg.size_usd, s.liquidity_usd)
        gross = (probs[TP] * self.cfg.take_profit
                 + probs[SL] * self.cfg.stop_loss
                 + probs[TIMEOUT] * self.expected_timeout_return())
        ev = gross - cost

        if self.model.seen < self.cfg.warmup:
            action, why = "skip", [f"warmup {self.model.seen}/{self.cfg.warmup}"]
        elif not self.model_has_skill():
            action, why = "skip", ["model not beating base rates"]
        elif ev > self.cfg.min_edge:
            action, why = "trade", []
        else:
            action, why = "skip", [f"edge {ev:+.3f} <= {self.cfg.min_edge}"]

        self.pending[s.launch_id] = {"x": x, "probs": probs, "traded": action == "trade", "cost": cost}
        d = Decision(s.launch_id, action, why, dict(zip(CLASSES, probs)), ev, cost)
        self._log("decision", asdict(d))
        return d

    # ---- feedback -------------------------------------------------------
    def resolve(self, launch_id, outcome: int, realized_return=None):
        """Feed the observed outcome back. `realized_return` is the actual exit
        return (e.g. a stop-loss that gapped to -0.55 on a rug); if omitted, the
        threshold value is assumed, which is optimistic for stop-losses."""
        p = self.pending.pop(launch_id, None)
        if p is None:
            return None
        if realized_return is None:
            realized_return = {TP: self.cfg.take_profit, SL: self.cfg.stop_loss}.get(outcome, 0.0)

        self.metrics.record(p["probs"], outcome)
        self.model.learn(p["x"], outcome)
        if outcome == TIMEOUT:
            self.timeout_ret_sum += realized_return
            self.timeout_ret_n += 1

        pnl = None
        if p["traded"]:
            pnl = self.cfg.size_usd * (realized_return - p["cost"])
            self.pnl_usd += pnl
            self.trades += 1
            self.wins += pnl > 0
        self._log("outcome", {"launch_id": launch_id, "outcome": CLASSES[outcome],
                              "realized_return": realized_return, "pnl_usd": pnl})
        return pnl

    # ---- reporting / persistence ---------------------------------------
    def report(self):
        r = {"resolved": self.model.seen, "paper_trades": self.trades,
             "paper_pnl_usd": round(self.pnl_usd, 2),
             "win_rate": round(self.wins / self.trades, 3) if self.trades else None,
             "expected_timeout_return": round(self.expected_timeout_return(), 4)}
        r.update({k: (round(v, 4) if isinstance(v, float) else v)
                  for k, v in self.metrics.summary().items()})
        return r

    def save(self, path):
        state = {"config": asdict(self.cfg), "model": self.model.to_dict(),
                 "timeout": [self.timeout_ret_sum, self.timeout_ret_n],
                 "pnl_usd": self.pnl_usd, "trades": self.trades, "wins": self.wins,
                 "label_counts": self.metrics.label_counts}
        tmp = path + ".tmp"
        with open(tmp, "w") as f:
            json.dump(state, f)
        os.replace(tmp, path)

    @classmethod
    def load(cls, path, **kwargs):
        with open(path) as f:
            st = json.load(f)
        a = cls(Config(**st["config"]), **kwargs)
        a.model = OnlineSoftmax.from_dict(st["model"])
        a.timeout_ret_sum, a.timeout_ret_n = st["timeout"]
        a.pnl_usd, a.trades, a.wins = st["pnl_usd"], st["trades"], st["wins"]
        a.metrics.label_counts = st["label_counts"]
        return a

    def _log(self, kind, payload):
        if self.journal_path:
            with open(self.journal_path, "a") as f:
                f.write(json.dumps({"kind": kind, **payload}) + "\n")
