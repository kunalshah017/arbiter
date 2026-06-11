"""Binance public API client for OHLCV data. No API key required."""
import structlog
import httpx

from config.settings import settings
from data.models import OHLCVBar
from data.transforms import binance_klines_to_bars

logger = structlog.get_logger()

# Map common symbols to Binance trading pairs
# Most competition tokens trade against USDT on Binance
PAIR_SUFFIX = "USDT"


class BinanceClient:
    """Fetches OHLCV data from Binance public API (free, no key needed)."""

    def __init__(self):
        self._http = httpx.AsyncClient(
            base_url=settings.binance_base_url,
            timeout=30.0,
        )

    async def fetch_ohlcv(
        self,
        symbol: str,
        interval: str = "1h",
        limit: int = 720,
    ) -> list[OHLCVBar]:
        """Fetch historical klines from Binance.

        Args:
            symbol: Token symbol (e.g. "BNB") — will append "USDT" for the pair
            interval: Kline interval: "1m","5m","15m","1h","4h","1d"
            limit: Max number of bars (max 1000)

        Returns:
            List of OHLCVBar sorted by time ascending.
        """
        pair = f"{symbol.upper()}{PAIR_SUFFIX}"
        params = {
            "symbol": pair,
            "interval": interval,
            "limit": min(limit, 1000),
        }

        try:
            resp = await self._http.get("/api/v3/klines", params=params)
            if resp.status_code == 200:
                klines = resp.json()
                bars = binance_klines_to_bars(klines)
                logger.debug("binance.fetched", symbol=symbol, bars=len(bars))
                return bars
            else:
                logger.warning("binance.error", symbol=symbol, status=resp.status_code)
                return []
        except Exception as e:
            logger.error("binance.request_failed", symbol=symbol, error=str(e))
            return []

    async def fetch_price(self, symbol: str) -> float | None:
        """Get current price for a symbol."""
        pair = f"{symbol.upper()}{PAIR_SUFFIX}"
        try:
            resp = await self._http.get("/api/v3/ticker/price", params={"symbol": pair})
            if resp.status_code == 200:
                return float(resp.json()["price"])
            return None
        except Exception:
            return None

    async def close(self):
        await self._http.aclose()
