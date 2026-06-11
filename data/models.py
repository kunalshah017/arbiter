"""Core data models."""
from __future__ import annotations
from dataclasses import dataclass
from enum import Enum


@dataclass(frozen=True, slots=True)
class OHLCVBar:
    """Single OHLCV candle."""
    ts: int
    open: float
    high: float
    low: float
    close: float
    volume: float

    def to_engine_dict(self) -> dict:
        return {"ts": self.ts, "o": self.open, "h": self.high, "l": self.low, "c": self.close, "v": self.volume}


class Regime(str, Enum):
    TRENDING_UP = "trending_up"
    TRENDING_DOWN = "trending_down"
    MEAN_REVERTING = "mean_reverting"
    HIGH_VOLATILITY = "high_volatility"
    CHOPPY = "choppy"


class TradeAction(str, Enum):
    BUY = "buy"
    SELL = "sell"


@dataclass
class TokenScore:
    """Token ranking result."""
    symbol: str
    price: float
    volume_24h: float
    change_24h_pct: float
    momentum_score: float


@dataclass
class BacktestGateResult:
    """Result of the decision gate check."""
    passed: bool
    total_return_pct: float
    max_drawdown_pct: float
    win_rate: float
    num_trades: int
    profit_factor: float
    expectancy_pct: float
    rejection_reasons: list[str]
