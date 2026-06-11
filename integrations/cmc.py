"""CoinMarketCap MCP client — for regime classification and token discovery only.
NOTE: CMC MCP does NOT provide OHLCV data. Use Binance for price history."""
import structlog
from typing import Any
import httpx

from config.settings import settings

logger = structlog.get_logger()


class CMCClient:
    """Client for CMC MCP tools (streamable HTTP transport)."""

    def __init__(self):
        self._http = httpx.AsyncClient(timeout=30.0)

    async def mcp_call(self, tool_name: str, arguments: dict) -> Any:
        """Call a CMC MCP tool via streamable HTTP."""
        url = settings.cmc_mcp_url
        headers = {}
        if settings.cmc_api_key:
            headers["X-CMC-MCP-API-KEY"] = settings.cmc_api_key

        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": tool_name, "arguments": arguments},
        }

        try:
            resp = await self._http.post(url, json=payload, headers=headers)
            if resp.status_code == 200:
                result = resp.json()
                return result.get("result", {}).get("content", [])
            else:
                logger.error("cmc.mcp_error",
                             status=resp.status_code, tool=tool_name)
                return None
        except Exception as e:
            logger.error("cmc.request_failed", tool=tool_name, error=str(e))
            return None

    async def get_global_metrics(self) -> Any:
        """Get Fear & Greed, BTC dominance, total market cap."""
        return await self.mcp_call("get_global_metrics_latest", {})

    async def get_derivatives_metrics(self) -> Any:
        """Get funding rates, OI, leverage."""
        return await self.mcp_call("get_global_crypto_derivatives_metrics", {})

    async def get_technical_analysis(self, symbol: str) -> Any:
        """Get pre-computed TA for a token."""
        return await self.mcp_call("get_crypto_technical_analysis", {"symbol": symbol})

    async def get_quotes(self, symbols: list[str]) -> Any:
        """Get latest quotes for multiple tokens."""
        return await self.mcp_call("get_crypto_quotes_latest", {"symbol": ",".join(symbols)})

    async def search_cryptos(self, query: str) -> Any:
        """Search for cryptocurrencies."""
        return await self.mcp_call("search_cryptos", {"query": query})

    async def close(self):
        await self._http.aclose()
