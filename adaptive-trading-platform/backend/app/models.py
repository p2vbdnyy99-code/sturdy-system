"""Database schema. PAPER and LIVE data are isolated at the database level:
orders, positions and trades carry (account_id, mode) with a composite foreign
key to accounts(id, mode), so a row can never be attached to an account of the
other mode, and a paper account can never hold a broker connection."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (JSON, Boolean, CheckConstraint, Float, ForeignKey, ForeignKeyConstraint, Index,
                        Integer, String, Text, UniqueConstraint)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base, UTCDateTime, utcnow

Json = JSON().with_variant(JSONB(), "postgresql")
MODE_CHECK = "mode in ('paper','live')"


def pk():
    return mapped_column(Integer, primary_key=True, autoincrement=True)


def ts(**kw):
    return mapped_column(UTCDateTime, default=utcnow, nullable=False, **kw)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = pk()
    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(16), default="trader", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    jurisdiction: Mapped[str] = mapped_column(String(8), default="IN", nullable=False)
    residency_declared_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    settings: Mapped[dict] = mapped_column(Json, default=dict, nullable=False)
    failed_logins: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = ts()
    __table_args__ = (CheckConstraint("role in ('admin','trader','viewer')", name="ck_users_role"),)


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    id: Mapped[int] = pk()
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    refresh_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    user_agent: Mapped[str | None] = mapped_column(String(255))
    ip: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = ts()
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class Broker(Base):
    __tablename__ = "brokers"
    id: Mapped[int] = pk()
    key: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    adapter: Mapped[str] = mapped_column(String(32), nullable=False)
    asset_classes: Mapped[list] = mapped_column(Json, default=list, nullable=False)
    integration_status: Mapped[str] = mapped_column(String(32), default="untested", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)


class BrokerConnection(Base):
    __tablename__ = "broker_connections"
    id: Mapped[int] = pk()
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    broker_id: Mapped[int] = mapped_column(ForeignKey("brokers.id"))
    label: Mapped[str] = mapped_column(String(64), nullable=False)
    credentials_enc: Mapped[str | None] = mapped_column(Text)        # Fernet ciphertext, never plaintext
    config: Mapped[dict] = mapped_column(Json, default=dict, nullable=False)   # non-secret (url, server, symbol map)
    account_type: Mapped[str] = mapped_column(String(16), default="unknown", nullable=False)  # demo|real|unknown
    status: Mapped[str] = mapped_column(String(24), default="untested", nullable=False)
    last_test_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    last_test_result: Mapped[dict | None] = mapped_column(Json)
    last_health: Mapped[dict | None] = mapped_column(Json)
    created_at: Mapped[datetime] = ts()
    broker: Mapped[Broker] = relationship()


class Account(Base):
    __tablename__ = "accounts"
    id: Mapped[int] = pk()
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    mode: Mapped[str] = mapped_column(String(8), default="paper", nullable=False)
    broker_connection_id: Mapped[int | None] = mapped_column(ForeignKey("broker_connections.id"))
    currency: Mapped[str] = mapped_column(String(8), default="USD", nullable=False)
    initial_balance: Mapped[float] = mapped_column(Float, default=300.0, nullable=False)
    balance: Mapped[float] = mapped_column(Float, default=300.0, nullable=False)
    equity: Mapped[float] = mapped_column(Float, default=300.0, nullable=False)
    peak_equity: Mapped[float] = mapped_column(Float, default=300.0, nullable=False)
    day_key: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    day_start_equity: Mapped[float] = mapped_column(Float, default=300.0, nullable=False)
    realized_today: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    consecutive_losses: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    streak_locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    kill_switch: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    halted_reason: Mapped[str | None] = mapped_column(String(64))
    risk_config: Mapped[dict] = mapped_column(Json, default=dict, nullable=False)
    trading_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)  # automation on/off
    # live-only safety state; all default to "off" and are never set by migrations or startup
    live_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    live_armed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    first_live_order_confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    live_state: Mapped[dict] = mapped_column(Json, default=dict, nullable=False)
    feed: Mapped[dict] = mapped_column(Json, default=dict, nullable=False)   # market-data feed config
    created_at: Mapped[datetime] = ts()
    __table_args__ = (
        CheckConstraint(MODE_CHECK, name="ck_accounts_mode"),
        CheckConstraint("(mode = 'paper' and broker_connection_id is null and live_enabled = false) "
                        "or (mode = 'live' and broker_connection_id is not null)", name="ck_accounts_isolation"),
        UniqueConstraint("id", "mode", name="uq_accounts_id_mode"),
    )


def _acct_fk(table):
    return ForeignKeyConstraint(["account_id", "mode"], ["accounts.id", "accounts.mode"],
                                name=f"fk_{table}_account_mode", ondelete="CASCADE")


class Instrument(Base):
    __tablename__ = "instruments"
    id: Mapped[int] = pk()
    symbol: Mapped[str] = mapped_column(String(24), unique=True, nullable=False)
    asset_class: Mapped[str] = mapped_column(String(16), nullable=False)
    spec: Mapped[dict] = mapped_column(Json, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    spec_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    spec_source: Mapped[str] = mapped_column(String(64), default="defaults (unverified)", nullable=False)
    updated_at: Mapped[datetime] = ts()


class Candle(Base):
    __tablename__ = "candles"
    symbol: Mapped[str] = mapped_column(String(24), primary_key=True)
    timeframe: Mapped[str] = mapped_column(String(4), primary_key=True)
    source: Mapped[str] = mapped_column(String(48), primary_key=True)
    ts: Mapped[datetime] = mapped_column(UTCDateTime, primary_key=True)
    open: Mapped[float] = mapped_column(Float, nullable=False)
    high: Mapped[float] = mapped_column(Float, nullable=False)
    low: Mapped[float] = mapped_column(Float, nullable=False)
    close: Mapped[float] = mapped_column(Float, nullable=False)
    volume: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    spread: Mapped[float | None] = mapped_column(Float)
    __table_args__ = (CheckConstraint("high >= low", name="ck_candles_hl"),)


class StrategyDef(Base):
    __tablename__ = "strategies"
    id: Mapped[int] = pk()
    key: Mapped[str] = mapped_column(String(48), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(96), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    indicators: Mapped[list] = mapped_column(Json, default=list, nullable=False)


class StrategyConfig(Base):
    __tablename__ = "strategy_configs"
    id: Mapped[int] = pk()
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    plan_id: Mapped[str] = mapped_column(String(96), nullable=False)
    engine: Mapped[str] = mapped_column(String(16), nullable=False)
    strategy_key: Mapped[str] = mapped_column(String(48), nullable=False)
    label: Mapped[str] = mapped_column(String(48), nullable=False)
    symbol: Mapped[str] = mapped_column(String(24), nullable=False)
    timeframe: Mapped[str] = mapped_column(String(4), nullable=False)
    params: Mapped[dict] = mapped_column(Json, default=dict, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="candidate", nullable=False)
    validation_status: Mapped[str] = mapped_column(String(24), default="unvalidated", nullable=False)
    validation_source: Mapped[str | None] = mapped_column(String(48))
    validation_run_id: Mapped[int | None] = mapped_column(Integer)
    metrics: Mapped[dict] = mapped_column(Json, default=dict, nullable=False)
    health: Mapped[dict] = mapped_column(Json, default=dict, nullable=False)
    suspended_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = ts()
    __table_args__ = (UniqueConstraint("user_id", "plan_id", "version", name="uq_strategy_version"),
                      Index("ix_strategy_cfg_lookup", "user_id", "symbol", "timeframe", "enabled"))


class Signal(Base):
    __tablename__ = "signals"
    id: Mapped[int] = pk()
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"))
    strategy_config_id: Mapped[int | None] = mapped_column(ForeignKey("strategy_configs.id", ondelete="SET NULL"))
    plan_id: Mapped[str] = mapped_column(String(96), nullable=False)
    symbol: Mapped[str] = mapped_column(String(24), nullable=False)
    timeframe: Mapped[str] = mapped_column(String(4), nullable=False)
    session: Mapped[str] = mapped_column(String(16), nullable=False)
    side: Mapped[str] = mapped_column(String(4), nullable=False)
    candle_ts: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False)
    sl: Mapped[float] = mapped_column(Float, nullable=False)
    tp: Mapped[float | None] = mapped_column(Float)
    rr_target: Mapped[float] = mapped_column(Float, nullable=False)
    score: Mapped[float | None] = mapped_column(Float)
    reason: Mapped[str] = mapped_column(Text, default="", nullable=False)
    context: Mapped[dict] = mapped_column(Json, default=dict, nullable=False)
    outcome: Mapped[str] = mapped_column(String(24), default="pending", nullable=False)  # executed|rejected
    data_source: Mapped[str] = mapped_column(String(48), default="", nullable=False)
    created_at: Mapped[datetime] = ts()
    __table_args__ = (UniqueConstraint("account_id", "plan_id", "candle_ts", name="uq_signal_once"),
                      Index("ix_signals_account_time", "account_id", "created_at"))


class RejectedSignal(Base):
    __tablename__ = "rejected_signals"
    id: Mapped[int] = pk()
    signal_id: Mapped[int] = mapped_column(ForeignKey("signals.id", ondelete="CASCADE"), unique=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True)
    reasons: Mapped[list] = mapped_column(Json, nullable=False)
    detail: Mapped[dict] = mapped_column(Json, default=dict, nullable=False)
    created_at: Mapped[datetime] = ts()


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[int] = pk()
    account_id: Mapped[int] = mapped_column(Integer, nullable=False)
    mode: Mapped[str] = mapped_column(String(8), nullable=False)
    client_order_id: Mapped[str] = mapped_column(String(64), nullable=False)
    signal_id: Mapped[int | None] = mapped_column(ForeignKey("signals.id", ondelete="SET NULL"))
    symbol: Mapped[str] = mapped_column(String(24), nullable=False)
    side: Mapped[str] = mapped_column(String(4), nullable=False)
    order_type: Mapped[str] = mapped_column(String(12), default="market", nullable=False)
    volume: Mapped[float] = mapped_column(Float, nullable=False)
    requested_price: Mapped[float | None] = mapped_column(Float)
    fill_price: Mapped[float | None] = mapped_column(Float)
    sl: Mapped[float | None] = mapped_column(Float)
    tp: Mapped[float | None] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(24), default="new", nullable=False)
    broker_order_id: Mapped[str | None] = mapped_column(String(64))
    reject_reason: Mapped[str | None] = mapped_column(Text)
    risk: Mapped[dict] = mapped_column(Json, default=dict, nullable=False)
    created_at: Mapped[datetime] = ts()
    updated_at: Mapped[datetime] = ts()
    __table_args__ = (_acct_fk("orders"), CheckConstraint(MODE_CHECK, name="ck_orders_mode"),
                      UniqueConstraint("account_id", "client_order_id", name="uq_orders_client_id"),
                      CheckConstraint("volume > 0", name="ck_orders_volume"),
                      Index("ix_orders_account_time", "account_id", "created_at"))


class Position(Base):
    __tablename__ = "positions"
    id: Mapped[int] = pk()
    account_id: Mapped[int] = mapped_column(Integer, nullable=False)
    mode: Mapped[str] = mapped_column(String(8), nullable=False)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"))
    strategy_config_id: Mapped[int | None] = mapped_column(ForeignKey("strategy_configs.id", ondelete="SET NULL"))
    plan_id: Mapped[str] = mapped_column(String(96), default="manual", nullable=False)
    symbol: Mapped[str] = mapped_column(String(24), nullable=False)
    side: Mapped[str] = mapped_column(String(4), nullable=False)
    volume: Mapped[float] = mapped_column(Float, nullable=False)
    entry_price: Mapped[float] = mapped_column(Float, nullable=False)
    sl: Mapped[float | None] = mapped_column(Float)
    tp: Mapped[float | None] = mapped_column(Float)
    risk_usd: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    margin_usd: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    entry_commission: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    last_price: Mapped[float | None] = mapped_column(Float)
    floating_pnl: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    status: Mapped[str] = mapped_column(String(8), default="open", nullable=False)
    broker_position_id: Mapped[str | None] = mapped_column(String(64))
    opened_at: Mapped[datetime] = ts()
    closed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    __table_args__ = (_acct_fk("positions"), CheckConstraint(MODE_CHECK, name="ck_positions_mode"),
                      Index("ix_positions_open", "account_id", "status"))


class Trade(Base):
    __tablename__ = "trades"
    id: Mapped[int] = pk()
    account_id: Mapped[int] = mapped_column(Integer, nullable=False)
    mode: Mapped[str] = mapped_column(String(8), nullable=False)
    position_id: Mapped[int | None] = mapped_column(ForeignKey("positions.id", ondelete="SET NULL"), unique=True)
    strategy_config_id: Mapped[int | None] = mapped_column(ForeignKey("strategy_configs.id", ondelete="SET NULL"))
    plan_id: Mapped[str] = mapped_column(String(96), nullable=False)
    symbol: Mapped[str] = mapped_column(String(24), nullable=False)
    timeframe: Mapped[str] = mapped_column(String(4), default="", nullable=False)
    session: Mapped[str] = mapped_column(String(16), default="", nullable=False)
    side: Mapped[str] = mapped_column(String(4), nullable=False)
    volume: Mapped[float] = mapped_column(Float, nullable=False)
    entry_price: Mapped[float] = mapped_column(Float, nullable=False)
    exit_price: Mapped[float] = mapped_column(Float, nullable=False)
    sl: Mapped[float | None] = mapped_column(Float)
    tp: Mapped[float | None] = mapped_column(Float)
    opened_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    closed_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    gross: Mapped[float] = mapped_column(Float, nullable=False)
    commission: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    financing: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    pnl: Mapped[float] = mapped_column(Float, nullable=False)
    risk_usd: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    r_multiple: Mapped[float | None] = mapped_column(Float)
    exit_reason: Mapped[str] = mapped_column(String(24), nullable=False)
    __table_args__ = (_acct_fk("trades"), CheckConstraint(MODE_CHECK, name="ck_trades_mode"),
                      Index("ix_trades_account_time", "account_id", "closed_at"),
                      Index("ix_trades_filters", "account_id", "symbol", "plan_id"))


class AccountSnapshot(Base):
    __tablename__ = "account_snapshots"
    id: Mapped[int] = pk()
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"))
    ts: Mapped[datetime] = ts()
    balance: Mapped[float] = mapped_column(Float, nullable=False)
    equity: Mapped[float] = mapped_column(Float, nullable=False)
    margin_used: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    open_positions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    __table_args__ = (Index("ix_snapshots_account_ts", "account_id", "ts"),)


class DailyPerformance(Base):
    __tablename__ = "daily_performance"
    id: Mapped[int] = pk()
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"))
    day: Mapped[int] = mapped_column(Integer, nullable=False)          # IST date YYYYMMDD
    start_equity: Mapped[float] = mapped_column(Float, nullable=False)
    end_equity: Mapped[float] = mapped_column(Float, nullable=False)
    pnl: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    trades: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    wins: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    report: Mapped[dict] = mapped_column(Json, default=dict, nullable=False)
    __table_args__ = (UniqueConstraint("account_id", "day", name="uq_daily_perf"),)


class BacktestRun(Base):
    __tablename__ = "backtest_runs"
    id: Mapped[int] = pk()
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)       # backtest | research
    status: Mapped[str] = mapped_column(String(16), default="queued", nullable=False)
    request: Mapped[dict] = mapped_column(Json, nullable=False)
    data_source: Mapped[str] = mapped_column(String(48), nullable=False)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    code_version: Mapped[str] = mapped_column(String(48), default="", nullable=False)
    progress: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = ts()
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class BacktestResult(Base):
    __tablename__ = "backtest_results"
    id: Mapped[int] = pk()
    run_id: Mapped[int] = mapped_column(ForeignKey("backtest_runs.id", ondelete="CASCADE"), index=True)
    plan_id: Mapped[str | None] = mapped_column(String(96))            # null = portfolio-level result
    summary: Mapped[dict] = mapped_column(Json, nullable=False)
    report: Mapped[dict] = mapped_column(Json, nullable=False)
    trades: Mapped[list] = mapped_column(Json, default=list, nullable=False)


class RiskEvent(Base):
    __tablename__ = "risk_events"
    id: Mapped[int] = pk()
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    severity: Mapped[str] = mapped_column(String(8), default="warn", nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    detail: Mapped[dict] = mapped_column(Json, default=dict, nullable=False)
    created_at: Mapped[datetime] = ts()
    __table_args__ = (Index("ix_risk_events_account_time", "account_id", "created_at"),)


class SystemLog(Base):
    """Append-only audit trail of security, trading-decision and execution events."""
    __tablename__ = "system_logs"
    id: Mapped[int] = pk()
    ts: Mapped[datetime] = ts()
    level: Mapped[str] = mapped_column(String(8), default="info", nullable=False)
    category: Mapped[str] = mapped_column(String(24), nullable=False)   # auth|order|risk|broker|admin|system
    user_id: Mapped[int | None] = mapped_column(Integer)
    account_id: Mapped[int | None] = mapped_column(Integer)
    event: Mapped[str] = mapped_column(String(64), nullable=False)
    detail: Mapped[dict] = mapped_column(Json, default=dict, nullable=False)
    __table_args__ = (Index("ix_system_logs_ts", "ts"), Index("ix_system_logs_user", "user_id", "ts"))


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = pk()
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    dedupe_key: Mapped[str] = mapped_column(String(160), nullable=False)
    data: Mapped[dict] = mapped_column(Json, default=dict, nullable=False)
    push_status: Mapped[str] = mapped_column(String(16), default="not_sent", nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = ts()
    __table_args__ = (UniqueConstraint("user_id", "dedupe_key", name="uq_notification_dedupe"),
                      Index("ix_notifications_user_time", "user_id", "created_at"))


class PushToken(Base):
    __tablename__ = "push_tokens"
    id: Mapped[int] = pk()
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    platform: Mapped[str] = mapped_column(String(16), default="ios", nullable=False)
    created_at: Mapped[datetime] = ts()


class ComplianceAttestation(Base):
    __tablename__ = "compliance_attestations"
    id: Mapped[int] = pk()
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    broker_key: Mapped[str] = mapped_column(String(32), nullable=False)
    asset_class: Mapped[str] = mapped_column(String(16), nullable=False)
    jurisdiction: Mapped[str] = mapped_column(String(8), nullable=False)
    statement: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = ts()
