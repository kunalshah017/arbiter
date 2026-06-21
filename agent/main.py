"""Arbiter — Main agent entry point."""
import asyncio
import json
import time

import structlog

from config.settings import settings
from data.models import Regime
from data.db import get_db, cache_ohlcv, get_cached_ohlcv
from data.transforms import bars_to_engine_json
from integrations.binance import BinanceClient
from integrations.cmc import CMCClient
from integrations.twak import TWAKExecutor
from integrations.bnb_sdk import register_agent_identity
from agent.regime import RegimeClassifier
from agent.scanner import TokenScanner
from agent.strategy import get_strategy_config
from agent.gate import validate_strategy
from agent.monitor import PositionMonitor
from risk.portfolio import Portfolio, OpenPosition
from risk.guardrails import Guardrails
from risk.sizing import calculate_position_size

logger = structlog.get_logger()


class Arbiter:
    """Main agent orchestrator."""

    def __init__(self):
        self.binance = BinanceClient()
        self.cmc = CMCClient()
        self.twak = TWAKExecutor()
        self.regime_clf = RegimeClassifier()
        self.scanner = TokenScanner(self.binance)
        self.portfolio = Portfolio()
        self.guardrails = Guardrails()
        self.monitor = PositionMonitor(self.twak, self.binance, self.portfolio)
        self._db = None
        self._trades_today = 0
        self._day_start = int(time.time())

    async def start(self):
        """Initialize and start the agent loop."""
        logger.info("arbiter.starting")
        self._db = await get_db()

        # Register on-chain identity (idempotent)
        await register_agent_identity()

        # Get initial portfolio value
        portfolio_data = await self.twak.get_portfolio()
        if portfolio_data:
            initial_value = float(portfolio_data.get(
                "total_value_usd", settings.initial_capital))
        else:
            initial_value = settings.initial_capital

        self.portfolio.cash_usd = initial_value
        self.guardrails.set_initial_value(initial_value)
        logger.info("arbiter.portfolio_loaded", value=initial_value)

        # Start concurrent loops
        await asyncio.gather(
            self._scan_loop(),
            self._monitor_loop(),
            self._daily_loop(),
        )

    async def _scan_loop(self):
        """Hourly: scan tokens → classify regime → validate → execute."""
        while True:
            try:
                await self._scan_and_trade()
            except Exception as e:
                logger.error("arbiter.scan_error", error=str(e))
            await asyncio.sleep(settings.scan_interval_seconds)

    async def _monitor_loop(self):
        """Every 5 min: check open positions for SL/TP."""
        while True:
            try:
                await self.monitor.check_all_positions()
            except Exception as e:
                logger.error("arbiter.monitor_error", error=str(e))
            await asyncio.sleep(settings.monitor_interval_seconds)

    async def _daily_loop(self):
        """Daily: ensure min trades, log performance."""
        while True:
            await asyncio.sleep(3600)
            now = int(time.time())
            if now - self._day_start > 86400:
                await self._daily_review()
                self._day_start = now
                self._trades_today = 0

    async def _scan_and_trade(self):
        """Core trading logic: scan → classify → validate → execute."""
        # 1. Check if trading allowed
        can_trade, reason = self.guardrails.can_trade(
            self.portfolio.total_value)
        if not can_trade:
            logger.info("arbiter.trading_blocked", reason=reason)
            return

        # 2. Classify market regime
        market_data = await self._fetch_market_context()
        regime = await self.regime_clf.classify(market_data)
        logger.info("arbiter.regime", regime=regime.value)

        # 3. Scan and rank tokens
        candidates = await self.scanner.scan_and_rank(regime, top_n=10)
        if not candidates:
            logger.info("arbiter.no_candidates")
            return

        # 4. For each candidate: fetch OHLCV → backtest → gate → execute
        executed = 0

        for token in candidates:
            if executed >= 3:
                break
            if self.portfolio.has_position(token.symbol):
                continue

            # Get initial strategy config for position sizing
            base_config = get_strategy_config(regime)
            position_size = calculate_position_size(
                self.portfolio.total_value,
                base_config.get("take_profit_atr_multiple", 4.0),
                -base_config.get("stop_loss_atr_multiple", 2.0) * 2,
            )

            # Check exposure
            can_add, reason = self.guardrails.check_exposure(
                self.portfolio.exposure_pct,
                (position_size / self.portfolio.total_value *
                 100) if self.portfolio.total_value > 0 else 0,
            )
            if not can_add:
                logger.info("arbiter.exposure_limit", reason=reason)
                break

            # Fetch OHLCV from Binance
            bars = await self._get_ohlcv(token.symbol)
            if not bars or len(bars) < 50:
                continue

            bars_json = json.dumps(bars)

            if settings.optimizer_enabled:
                from agent.optimizer import StrategyOptimizer
                optimizer = StrategyOptimizer()
                opt_result = optimizer.optimize(regime, bars_json)
                if opt_result.status == "accepted":
                    strategy_config = opt_result.strategy_config
                    success = await self._execute_entry(token.symbol, position_size, strategy_config)
                    if success:
                        executed += 1
                        self._trades_today += 1
                else:
                    logger.debug("optimizer.no_acceptable_strategy",
                                 symbol=token.symbol, status=opt_result.status)
            else:
                strategy_config = get_strategy_config(regime)
                config_json = json.dumps(strategy_config)
                gate_result = validate_strategy(bars_json, config_json)
                if gate_result.passed:
                    success = await self._execute_entry(token.symbol, position_size, strategy_config)
                    if success:
                        executed += 1
                        self._trades_today += 1
                else:
                    logger.debug("arbiter.gate_rejected", symbol=token.symbol,
                                 reasons=gate_result.rejection_reasons)

    async def _fetch_market_context(self) -> dict:
        """Fetch global market data for regime classification."""
        global_metrics = await self.cmc.get_global_metrics()
        derivatives = await self.cmc.get_derivatives_metrics()

        # Parse CMC MCP response — adapt based on actual format
        context = {
            "fear_greed": "N/A",
            "btc_dominance": "N/A",
            "total_mcap_change_24h": "N/A",
            "avg_funding_rate": "N/A",
            "oi_change_24h": "N/A",
        }

        # Extract from MCP response if available
        if global_metrics and isinstance(global_metrics, list):
            for item in global_metrics:
                if isinstance(item, dict) and "text" in item:
                    context["global_metrics_raw"] = item["text"][:500]

        if derivatives and isinstance(derivatives, list):
            for item in derivatives:
                if isinstance(item, dict) and "text" in item:
                    context["derivatives_raw"] = item["text"][:500]

        return context

    async def _get_ohlcv(self, symbol: str) -> list[dict]:
        """Get OHLCV bars (from cache or Binance)."""
        since_ts = int(time.time()) - (30 * 86400)

        # Check cache first
        cached = await get_cached_ohlcv(self._db, symbol, "1h", since_ts)
        if len(cached) >= 500:
            return cached

        # Fetch from Binance
        bars = await self.binance.fetch_ohlcv(symbol, interval="1h", limit=720)
        if not bars:
            return []

        engine_bars = bars_to_engine_json(bars)
        if engine_bars:
            await cache_ohlcv(self._db, symbol, "1h", engine_bars)

        return engine_bars

    async def _execute_entry(self, symbol: str, size_usd: float, config: dict) -> bool:
        """Execute a buy entry via TWAK."""
        result = await self.twak.swap(
            amount=size_usd,
            from_token="USDT",
            to_token=symbol,
            slippage_max=0.01,
        )
        if result is None:
            return False

        price = await self.binance.fetch_price(symbol)
        if price and price > 0:
            quantity = size_usd / price
            atr_approx = price * 0.02  # 2% approximation
            pos = OpenPosition(
                symbol=symbol,
                entry_price=price,
                quantity=quantity,
                stop_loss=price -
                (config["stop_loss_atr_multiple"] * atr_approx),
                take_profit=price +
                (config["take_profit_atr_multiple"] * atr_approx),
                strategy=config.get("name", "unknown"),
            )
            self.portfolio.open_position(pos)
            return True
        return False

    async def _daily_review(self):
        """End-of-day review."""
        if self._trades_today == 0:
            logger.warning("arbiter.no_trades_today")
            await self._force_minimum_trade()

    async def _force_minimum_trade(self):
        """Force a minimum trade to meet competition requirements."""
        min_size = self.portfolio.total_value * 0.02
        result = await self.twak.swap(min_size, "USDT", "BNB", slippage_max=0.01)
        if result:
            self._trades_today += 1
            logger.info("arbiter.forced_trade", size=min_size)


async def main():
    """Entry point."""
    structlog.configure(
        processors=[
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.add_log_level,
            structlog.dev.ConsoleRenderer(),
        ],
    )
    agent = Arbiter()
    await agent.start()


if __name__ == "__main__":
    asyncio.run(main())
