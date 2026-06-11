"""Position tracking and portfolio state."""
import time
from dataclasses import dataclass, field
import structlog

logger = structlog.get_logger()


@dataclass
class OpenPosition:
    """An active position."""
    symbol: str
    entry_price: float
    quantity: float
    stop_loss: float
    take_profit: float
    strategy: str
    entry_time: int = field(default_factory=lambda: int(time.time()))
    highest_price: float = 0.0

    def update_trailing(self, current_price: float, atr: float, multiplier: float = 2.0):
        if current_price > self.highest_price:
            self.highest_price = current_price
            new_sl = self.highest_price - (multiplier * atr)
            if new_sl > self.stop_loss:
                self.stop_loss = new_sl

    @property
    def value_usd(self) -> float:
        return self.entry_price * self.quantity


class Portfolio:
    """Tracks open positions and portfolio state."""

    def __init__(self):
        self.positions: dict[str, OpenPosition] = {}
        self.cash_usd: float = 0.0

    @property
    def total_value(self) -> float:
        pos_value = sum(p.value_usd for p in self.positions.values())
        return self.cash_usd + pos_value

    @property
    def exposure_pct(self) -> float:
        if self.total_value <= 0:
            return 0.0
        pos_value = sum(p.value_usd for p in self.positions.values())
        return (pos_value / self.total_value) * 100.0

    @property
    def num_positions(self) -> int:
        return len(self.positions)

    def has_position(self, symbol: str) -> bool:
        return symbol in self.positions

    def open_position(self, pos: OpenPosition):
        self.positions[pos.symbol] = pos
        self.cash_usd -= pos.value_usd
        logger.info("portfolio.opened", symbol=pos.symbol,
                    price=pos.entry_price, qty=pos.quantity)

    def close_position(self, symbol: str, exit_price: float) -> float:
        pos = self.positions.pop(symbol, None)
        if pos is None:
            return 0.0
        pnl_pct = (exit_price / pos.entry_price - 1.0) * 100.0
        proceeds = exit_price * pos.quantity
        self.cash_usd += proceeds
        logger.info("portfolio.closed", symbol=symbol, pnl_pct=pnl_pct)
        return pnl_pct
