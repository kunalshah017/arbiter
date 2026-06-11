"""Multi-token scanner: ranks eligible tokens and selects top candidates."""
import math
import yaml
from pathlib import Path
from typing import Optional

import structlog

from data.models import TokenScore, Regime
from integrations.binance import BinanceClient

logger = structlog.get_logger()

_TOKENS_PATH = Path(__file__).parent.parent / "config" / "tokens.yaml"


def load_tradeable_tokens() -> list[str]:
    """Load tradeable token list (excludes stablecoins)."""
    with open(_TOKENS_PATH) as f:
        config = yaml.safe_load(f)
    return config.get("tradeable", [])


class TokenScanner:
    """Scans eligible tokens and ranks them by momentum score."""

    def __init__(self, binance: BinanceClient):
        self._binance = binance
        self._tokens = load_tradeable_tokens()

    async def scan_and_rank(self, regime: Regime, top_n: int = 10) -> list[TokenScore]:
        """Scan all tokens via Binance 24h ticker and rank by momentum score.

        Args:
            regime: Current market regime (affects scoring)
            top_n: Number of top candidates to return

        Returns:
            Sorted list of TokenScore (highest score first).
        """
        all_scores: list[TokenScore] = []

        # Use Binance 24hr ticker for all symbols at once
        import httpx
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get("https://api.binance.com/api/v3/ticker/24hr")
            if resp.status_code != 200:
                logger.error("scanner.binance_ticker_failed", status=resp.status_code)
                return []
            tickers = resp.json()

        # Build lookup: symbol -> ticker data
        ticker_map = {}
        for t in tickers:
            sym = t.get("symbol", "")
            if sym.endswith("USDT"):
                base = sym[:-4]  # Remove USDT suffix
                ticker_map[base] = t

        # Score each tradeable token
        for token in self._tokens:
            ticker = ticker_map.get(token)
            if ticker is None:
                continue

            score = self._compute_momentum_score(token, ticker, regime)
            if score is not None:
                all_scores.append(score)

        # Sort by momentum_score descending
        all_scores.sort(key=lambda s: s.momentum_score, reverse=True)
        top = all_scores[:top_n]

        logger.info("scanner.ranked",
                    total_scanned=len(all_scores),
                    top_n=len(top),
                    top_symbols=[t.symbol for t in top[:5]])
        return top

    def _compute_momentum_score(self, symbol: str, ticker: dict, regime: Regime) -> Optional[TokenScore]:
        """Compute momentum score for ranking.

        Uses Binance 24hr ticker data:
        - priceChangePercent: 24h change %
        - quoteVolume: 24h volume in USDT
        - lastPrice: current price
        """
        try:
            price = float(ticker.get("lastPrice", 0))
            volume = float(ticker.get("quoteVolume", 0))
            change = float(ticker.get("priceChangePercent", 0))

            if price <= 0 or volume < 50000:  # Filter low-liquidity
                return None

            vol_factor = math.log10(max(volume, 1))

            if regime == Regime.TRENDING_UP:
                score = max(change, 0) * vol_factor
            elif regime == Regime.MEAN_REVERTING:
                score = max(-change, 0) * vol_factor
            elif regime == Regime.HIGH_VOLATILITY:
                score = abs(change) * vol_factor
            elif regime == Regime.TRENDING_DOWN:
                # In bearish: favor stability + volume
                score = vol_factor * max(1.0 - abs(change) / 10.0, 0.1)
            else:  # CHOPPY
                score = vol_factor * max(1.0 - abs(change) / 10.0, 0.1)

            return TokenScore(
                symbol=symbol,
                price=price,
                volume_24h=volume,
                change_24h_pct=change,
                momentum_score=score,
            )
        except (ValueError, TypeError):
            return None
