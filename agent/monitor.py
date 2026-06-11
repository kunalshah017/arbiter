"""Position monitor: checks SL/TP/trailing every 5 minutes."""
import structlog
from integrations.twak import TWAKExecutor
from integrations.binance import BinanceClient
from risk.portfolio import Portfolio, OpenPosition

logger = structlog.get_logger()


class PositionMonitor:
    """Monitors open positions and exits on SL/TP/trailing stop."""

    def __init__(self, twak: TWAKExecutor, binance: BinanceClient, portfolio: Portfolio):
        self._twak = twak
        self._binance = binance
        self._portfolio = portfolio

    async def check_all_positions(self):
        """Check all open positions against current prices."""
        if not self._portfolio.positions:
            return

        for symbol in list(self._portfolio.positions.keys()):
            pos = self._portfolio.positions.get(symbol)
            if pos is None:
                continue

            current_price = await self._binance.fetch_price(symbol)
            if current_price is None:
                logger.warning("monitor.price_unavailable", symbol=symbol)
                continue

            exit_reason = self._check_exit(pos, current_price)
            if exit_reason:
                await self._execute_exit(symbol, pos, current_price, exit_reason)

    def _check_exit(self, pos: OpenPosition, price: float) -> str | None:
        """Check if position should be exited."""
        if price <= pos.stop_loss:
            return "stop_loss"
        if price >= pos.take_profit:
            return "take_profit"
        return None

    async def _execute_exit(self, symbol: str, pos: OpenPosition, price: float, reason: str):
        """Execute position exit via TWAK."""
        logger.info("monitor.exiting", symbol=symbol,
                    reason=reason, price=price)
        result = await self._twak.swap(
            amount=pos.quantity,
            from_token=symbol,
            to_token="USDT",
            slippage_max=0.01,
        )
        if result:
            pnl = self._portfolio.close_position(symbol, price)
            logger.info("monitor.exit_complete", symbol=symbol,
                        pnl_pct=pnl, reason=reason)
