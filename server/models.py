"""SQLAlchemy ORM models for Arbiter persistent state."""
from datetime import datetime
from sqlalchemy import String, Float, Integer, DateTime, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from server.database import Base


class Trade(Base):
    __tablename__ = "trades"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(20), index=True)
    action: Mapped[str] = mapped_column(String(10))
    entry_price: Mapped[float] = mapped_column(Float)
    exit_price: Mapped[float] = mapped_column(Float, nullable=True)
    quantity: Mapped[float] = mapped_column(Float)
    pnl_pct: Mapped[float] = mapped_column(Float, nullable=True)
    entry_time: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    exit_time: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    exit_reason: Mapped[str] = mapped_column(String(50), nullable=True)
    strategy: Mapped[str] = mapped_column(String(50), nullable=True)
    regime: Mapped[str] = mapped_column(String(30), nullable=True)


class Position(Base):
    __tablename__ = "positions"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    entry_price: Mapped[float] = mapped_column(Float)
    quantity: Mapped[float] = mapped_column(Float)
    stop_loss: Mapped[float] = mapped_column(Float)
    take_profit: Mapped[float] = mapped_column(Float)
    strategy: Mapped[str] = mapped_column(String(50))
    entry_time: Mapped[datetime] = mapped_column(DateTime, default=func.now())


class PortfolioSnapshot(Base):
    __tablename__ = "portfolio_snapshots"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), index=True)
    total_value_usd: Mapped[float] = mapped_column(Float)
    cash_usd: Mapped[float] = mapped_column(Float)
    num_positions: Mapped[int] = mapped_column(Integer)
    daily_pnl_pct: Mapped[float] = mapped_column(Float, nullable=True)
    regime: Mapped[str] = mapped_column(String(30), nullable=True)


class OHLCVCache(Base):
    __tablename__ = "ohlcv_cache"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(20), index=True)
    interval: Mapped[str] = mapped_column(String(10))
    timestamp: Mapped[int] = mapped_column(Integer, index=True)
    open: Mapped[float] = mapped_column(Float)
    high: Mapped[float] = mapped_column(Float)
    low: Mapped[float] = mapped_column(Float)
    close: Mapped[float] = mapped_column(Float)
    volume: Mapped[float] = mapped_column(Float)


class AgentLog(Base):
    __tablename__ = "agent_logs"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), index=True)
    event: Mapped[str] = mapped_column(String(50))
    details: Mapped[str] = mapped_column(Text, nullable=True)
    regime: Mapped[str] = mapped_column(String(30), nullable=True)


class OptimizationRun(Base):
    """Record of a strategy optimization attempt."""
    __tablename__ = "optimization_runs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=func.now(), index=True)
    symbol: Mapped[str] = mapped_column(String(20), index=True)
    regime: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(20))  # accepted, best_effort, failed
    iterations_used: Mapped[int] = mapped_column(Integer)
    max_iterations: Mapped[int] = mapped_column(Integer)
    best_strategy_name: Mapped[str] = mapped_column(String(100), nullable=True)
    best_expectancy_pct: Mapped[float] = mapped_column(Float, nullable=True)
    best_return_pct: Mapped[float] = mapped_column(Float, nullable=True)
    best_win_rate: Mapped[float] = mapped_column(Float, nullable=True)
    best_num_trades: Mapped[int] = mapped_column(Integer, nullable=True)
    strategy_config_json: Mapped[str] = mapped_column(Text, nullable=True)
    last_feedback: Mapped[str] = mapped_column(Text, nullable=True)
    all_attempts_json: Mapped[str] = mapped_column(Text, nullable=True)
