"""The three session engines. Each is a catalogue of *candidate* plans
(strategy x instrument x timeframe x parameter preset). Candidates carry no
claim of profitability; the selection engine decides which survive."""
from __future__ import annotations

from dataclasses import dataclass, field

from .sessions import DEFAULT_SESSIONS, SessionDef
from .strategies.base import StrategyContext
from .strategies.library import get_strategy
from .instruments import InstrumentSpec


@dataclass(frozen=True)
class Plan:
    engine: str              # asia | london | newyork
    strategy: str
    symbol: str
    timeframe: str
    label: str
    params: dict = field(default_factory=dict, hash=False, compare=False)

    @property
    def plan_id(self) -> str:
        return f"{self.engine}:{self.label}:{self.symbol}:{self.timeframe}"

    def context(self, spec: InstrumentSpec, sessions: dict[str, SessionDef] | None = None,
                params: dict | None = None) -> StrategyContext:
        sess = sessions or DEFAULT_SESSIONS
        return StrategyContext(spec=spec, timeframe=self.timeframe, session=sess[self.engine],
                               sessions=sess, params={**self.params, **(params or {})})

    def generate(self, df, spec, sessions=None, params=None):
        return get_strategy(self.strategy).generate(df, self.context(spec, sessions, params))


_ENGINES = {
    "asia": {
        "symbols": ["BTCUSDT", "BTCUSD", "USDJPY", "AUDUSD"],
        "entry_tfs": ["M5", "M15", "M30"],
        "setups": [
            ("asian_orb", "range_breakout", {"range_source": "opening", "range_minutes": 60}),
            ("range_expansion", "volatility_squeeze", {}),
            ("liquidity_sweep", "liquidity_sweep", {"range_source": "opening", "range_minutes": 90}),
            ("sr_breakout", "momentum_breakout", {"lookback": 48}),
        ],
    },
    "london": {
        "symbols": ["XAUUSD", "EURUSD", "GBPUSD"],
        "entry_tfs": ["M5", "M15", "M30"],
        "setups": [
            ("asian_range_sweep", "liquidity_sweep", {"range_source": "asia"}),
            ("london_breakout", "range_breakout", {"range_source": "asia"}),
            ("breakout_retest", "breakout_retest", {"range_source": "asia"}),
            ("trend_continuation", "trend_continuation", {}),
            ("structure_shift", "structure_shift", {"mode": "choch"}),
        ],
    },
    "newyork": {
        "symbols": ["XAUUSD", "BTCUSDT", "BTCUSD", "EURUSD"],
        "entry_tfs": ["M5", "M15", "M30", "H1"],
        "setups": [
            ("trend_continuation", "trend_continuation", {}),
            ("momentum_breakout", "momentum_breakout", {"lookback": 48}),
            ("volatility_expansion", "volatility_squeeze", {}),
            ("liquidity_sweep", "liquidity_sweep", {"range_source": "london"}),
            ("prev_session_breakout", "range_breakout", {"range_source": "london"}),
            ("prev_day_breakout", "range_breakout", {"range_source": "prev_day"}),
        ],
    },
}

ENGINE_NAMES = {"asia": "Engine A — Asian session", "london": "Engine B — London session",
                "newyork": "Engine C — New York session"}


def candidate_plans(engine: str | None = None, symbols: list[str] | None = None,
                    timeframes: list[str] | None = None) -> list[Plan]:
    out = []
    for key, cfg in _ENGINES.items():
        if engine and key != engine:
            continue
        for sym in cfg["symbols"]:
            if symbols and sym not in symbols:
                continue
            for tf in cfg["entry_tfs"]:
                if timeframes and tf not in timeframes:
                    continue
                for label, strat, params in cfg["setups"]:
                    out.append(Plan(key, strat, sym, tf, label, dict(params)))
    return out


def plan_from_id(plan_id: str) -> Plan:
    engine, label, symbol, tf = plan_id.split(":")
    for lab, strat, params in _ENGINES[engine]["setups"]:
        if lab == label:
            return Plan(engine, strat, symbol, tf, label, dict(params))
    raise KeyError(plan_id)
