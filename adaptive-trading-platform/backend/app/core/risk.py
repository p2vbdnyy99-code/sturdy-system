"""Independent risk engine. It has the final word on every order in every
mode (backtest, paper, live); strategies and the AI layer cannot bypass it."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field

from .instruments import InstrumentSpec, SpecError


@dataclass
class RiskConfig:
    risk_per_trade: float = 0.005        # 0.5 % of current equity
    max_daily_loss: float = 0.02         # 2 % of day-start equity
    max_positions: int = 2
    max_consecutive_losses: int = 3
    min_rr: float = 2.0
    max_portfolio_risk: float = 0.01     # total open risk as fraction of equity
    max_correlated_positions: int = 1    # per correlation group
    max_margin_usage: float = 0.5        # used margin / equity after the trade
    min_stop_spreads: float = 3.0        # stop distance must be >= N x spread
    max_data_age_seconds: float = 0.0    # 0 = not checked (backtests)
    loss_streak_reset: str = "next_day"  # or "manual"
    kill_switch_policy: str = "hold"     # hold | close_all | tighten_stops

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict | None) -> "RiskConfig":
        d = d or {}
        cfg = cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})
        cfg.validate()
        return cfg

    def validate(self) -> None:
        if not (0 < self.risk_per_trade <= 0.02):
            raise ValueError("risk_per_trade must be within (0, 2%]")
        if not (0 < self.max_daily_loss <= 0.1):
            raise ValueError("max_daily_loss must be within (0, 10%]")
        if self.max_positions < 1 or self.max_consecutive_losses < 1:
            raise ValueError("max_positions and max_consecutive_losses must be >= 1")
        if self.min_rr < 1:
            raise ValueError("min_rr must be >= 1")
        if self.kill_switch_policy not in ("hold", "close_all", "tighten_stops"):
            raise ValueError("unknown kill_switch_policy")


@dataclass
class OpenRisk:
    symbol: str
    side: int
    volume: float
    risk_usd: float
    margin_usd: float
    correlation_group: str


@dataclass
class PortfolioState:
    equity: float
    balance: float
    day_start_equity: float
    realized_today: float = 0.0
    consecutive_losses: int = 0
    open: list[OpenRisk] = field(default_factory=list)
    kill_switch: bool = False
    halted: str | None = None            # e.g. broker_unstable / strategy halted
    streak_locked: bool = False          # loss-streak halt active


@dataclass
class OrderIntent:
    symbol: str
    side: int
    entry: float                         # expected fill price (incl. spread + slippage)
    sl: float
    tp: float
    risk_per_unit: float                 # incl. costs, price units
    reward_per_unit: float
    spread: float
    q2usd: float
    data_age_seconds: float = 0.0
    client_order_id: str = ""
    max_volume: float | None = None      # liquidity cap (partial fill)


@dataclass
class RiskDecision:
    approved: bool
    volume: float = 0.0
    risk_usd: float = 0.0
    margin_usd: float = 0.0
    rr_net: float = 0.0
    reasons: list[str] = field(default_factory=list)
    detail: dict = field(default_factory=dict)
    partial: bool = False


# reason codes -> human explanation (used by journal + AI explainer)
REASONS = {
    "KILL_SWITCH": "Emergency kill switch is active; no new orders.",
    "TRADING_HALTED": "Trading is halted for this account.",
    "DAILY_LOSS_LIMIT": "Daily loss limit reached; no new trades today.",
    "DAILY_LOSS_BUDGET": "This trade's risk would exceed the remaining daily loss budget.",
    "LOSS_STREAK": "Maximum consecutive losing trades reached; stand down.",
    "MAX_POSITIONS": "Maximum simultaneous positions already open.",
    "CORRELATED_EXPOSURE": "A correlated position is already open.",
    "DUPLICATE_SYMBOL": "A position in this instrument is already open.",
    "PORTFOLIO_RISK": "Total open risk would exceed the portfolio limit.",
    "RR_TOO_LOW": "Net reward/risk after costs is below the minimum.",
    "INVALID_STOP": "Stop-loss is missing or on the wrong side of the entry.",
    "STOP_TOO_TIGHT": "Stop distance is too small relative to the spread.",
    "MIN_LOT_EXCEEDS_RISK": "The minimum tradable size would risk more than the per-trade limit.",
    "INSUFFICIENT_MARGIN": "Not enough free margin for this order.",
    "MIN_NOTIONAL": "Order value is below the venue's minimum notional.",
    "SHORT_NOT_ALLOWED": "This instrument cannot be sold short (spot).",
    "INVALID_SPEC": "Instrument contract specification is invalid.",
    "STALE_DATA": "Market data is delayed; refusing to act on stale prices.",
    "NO_EQUITY": "Account equity is not positive.",
    "MARKET_CLOSED": "Market is closed for this instrument.",
    "LIVE_NOT_PERMITTED": "Live execution is not enabled for this account.",
    "COMPLIANCE_BLOCK": "Regulatory / broker eligibility gate has not been passed.",
    "DUPLICATE_ORDER": "An order with this client id already exists.",
    "STRATEGY_DISABLED": "Strategy is disabled or suspended pending revalidation.",
    "LIQUIDITY": "Not enough traded volume to fill the order.",
}


class RiskEngine:
    def __init__(self, config: RiskConfig | None = None):
        self.config = config or RiskConfig()
        self.config.validate()

    # -- account-level gates -------------------------------------------------
    def account_blocks(self, st: PortfolioState) -> list[str]:
        c, out = self.config, []
        if st.kill_switch:
            out.append("KILL_SWITCH")
        if st.halted:
            out.append("TRADING_HALTED")
        if st.equity <= 0:
            out.append("NO_EQUITY")
        if st.day_start_equity > 0 and (st.day_start_equity - st.equity) >= c.max_daily_loss * st.day_start_equity - 1e-9:
            out.append("DAILY_LOSS_LIMIT")
        if st.streak_locked or st.consecutive_losses >= c.max_consecutive_losses:
            out.append("LOSS_STREAK")
        return out

    def evaluate(self, intent: OrderIntent, spec: InstrumentSpec, st: PortfolioState) -> RiskDecision:
        c = self.config
        reasons: list[str] = self.account_blocks(st)
        detail: dict = {}
        try:
            spec.validate()
        except SpecError as e:
            return RiskDecision(False, reasons=reasons + ["INVALID_SPEC"], detail={"error": str(e)})
        if intent.side not in (1, -1) or intent.risk_per_unit <= 0 or intent.side * (intent.entry - intent.sl) <= 0:
            return RiskDecision(False, reasons=reasons + ["INVALID_STOP"], detail=detail)
        if intent.side < 0 and not spec.allow_short:
            reasons.append("SHORT_NOT_ALLOWED")
        if c.max_data_age_seconds and intent.data_age_seconds > c.max_data_age_seconds:
            reasons.append("STALE_DATA")
            detail["data_age_seconds"] = intent.data_age_seconds
        rr = intent.reward_per_unit / intent.risk_per_unit
        detail["rr_net"] = round(rr, 4)
        if rr < c.min_rr - 1e-6:
            reasons.append("RR_TOO_LOW")
        if abs(intent.entry - intent.sl) < c.min_stop_spreads * intent.spread:
            reasons.append("STOP_TOO_TIGHT")
        if len(st.open) >= c.max_positions:
            reasons.append("MAX_POSITIONS")
        if any(p.symbol == spec.symbol for p in st.open):
            reasons.append("DUPLICATE_SYMBOL")
        elif spec.correlation_group and sum(
                p.correlation_group == spec.correlation_group for p in st.open) >= c.max_correlated_positions:
            reasons.append("CORRELATED_EXPOSURE")
        if st.equity <= 0:
            return RiskDecision(False, reasons=sorted(set(reasons)), rr_net=rr, detail=detail)

        # -- position sizing from the actual contract specification -----------
        budget = st.equity * c.risk_per_trade
        risk_per_lot = intent.risk_per_unit * spec.contract_size * intent.q2usd
        volume = min(spec.round_volume(budget / risk_per_lot), spec.max_volume)
        partial = False
        if intent.max_volume is not None and intent.max_volume < volume:
            volume, partial = spec.round_volume(intent.max_volume), True
            if volume < spec.min_volume:
                reasons.append("LIQUIDITY")
        detail |= {"risk_budget_usd": round(budget, 4), "risk_per_lot_usd": round(risk_per_lot, 4)}
        if volume < spec.min_volume:
            if "LIQUIDITY" not in reasons:
                reasons.append("MIN_LOT_EXCEEDS_RISK")
                detail["min_lot_risk_usd"] = round(spec.min_volume * risk_per_lot, 4)
            return RiskDecision(False, reasons=sorted(set(reasons)), rr_net=rr, detail=detail)
        # shrink (never grow) the order to what margin allows; a fully funded
        # (spot) order can use cash only, leveraged orders a capped share of equity
        used = sum(p.margin_usd for p in st.open)
        if spec.margin_rate >= 1:
            free_for_trade = max(0.0, (min(st.balance, st.equity) - used) * 0.995)
        else:
            free_for_trade = max(0.0, min(st.equity - used, c.max_margin_usage * st.equity - used))
        margin_per_lot = spec.contract_size * intent.entry * intent.q2usd * spec.margin_rate
        affordable = spec.round_volume(free_for_trade / margin_per_lot) if margin_per_lot > 0 else volume
        if affordable < volume:
            detail["size_capped_by_margin"] = True
            volume = affordable
        if volume < spec.min_volume:
            reasons.append("INSUFFICIENT_MARGIN")
            detail["free_margin_usd"] = round(free_for_trade, 2)
            return RiskDecision(False, reasons=sorted(set(reasons)), rr_net=rr, detail=detail)
        risk_usd = volume * risk_per_lot
        notional_quote = volume * spec.contract_size * intent.entry
        notional_usd = notional_quote * intent.q2usd
        margin = notional_usd * spec.margin_rate
        detail |= {"notional_usd": round(notional_usd, 2), "margin_usd": round(margin, 2),
                   "free_margin_usd": round(free_for_trade, 2)}
        if spec.min_notional and notional_quote < spec.min_notional:
            reasons.append("MIN_NOTIONAL")
        if margin > free_for_trade + 1e-9:
            reasons.append("INSUFFICIENT_MARGIN")
        open_risk = sum(p.risk_usd for p in st.open)
        if open_risk + risk_usd > c.max_portfolio_risk * st.equity + 1e-9:
            reasons.append("PORTFOLIO_RISK")
        # worst case if every open stop and this one are hit today
        day_loss = max(0.0, st.day_start_equity - st.equity)
        if day_loss + open_risk + risk_usd > c.max_daily_loss * st.day_start_equity + 1e-9:
            reasons.append("DAILY_LOSS_BUDGET")
        reasons = sorted(set(reasons))
        return RiskDecision(not reasons, volume if not reasons else 0.0, risk_usd, margin, rr, reasons, detail, partial)

    # -- post-trade bookkeeping ----------------------------------------------
    def register_close(self, st: PortfolioState, pnl: float) -> None:
        st.realized_today += pnl
        if pnl < 0:
            st.consecutive_losses += 1
            if st.consecutive_losses >= self.config.max_consecutive_losses:
                st.streak_locked = True
        elif pnl > 0:
            st.consecutive_losses = 0

    def new_day(self, st: PortfolioState) -> None:
        st.day_start_equity = st.equity
        st.realized_today = 0.0
        if self.config.loss_streak_reset == "next_day":
            st.consecutive_losses = 0
            st.streak_locked = False
