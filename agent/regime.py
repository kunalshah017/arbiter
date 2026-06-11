"""Market regime classifier using LLM + CMC MCP data."""
import structlog
from openai import AsyncOpenAI
from config.settings import settings
from data.models import Regime

logger = structlog.get_logger()

REGIME_PROMPT = """You are a market regime classifier for crypto markets. Based on the following market data, classify the current regime into exactly ONE of these categories:

- trending_up: Strong bullish trend (aligned EMAs, positive momentum, greed sentiment)
- trending_down: Strong bearish trend (inverted EMAs, negative momentum, fear sentiment)
- mean_reverting: Range-bound, oscillating market (low ADX, price in bands)
- high_volatility: Elevated volatility with directional uncertainty (ATR spike, extreme sentiment)
- choppy: No clear direction, random walk behavior (mixed signals, low confidence)

Market Data:
{market_data}

Respond with ONLY the regime name (one of: trending_up, trending_down, mean_reverting, high_volatility, choppy). No explanation."""


class RegimeClassifier:
    def __init__(self):
        self._client = AsyncOpenAI(api_key=settings.openai_api_key)

    async def classify(self, market_data: dict) -> Regime:
        """Classify current market regime based on global metrics."""
        data_str = "\n".join(f"- {k}: {v}" for k, v in market_data.items() if v is not None)
        prompt = REGIME_PROMPT.format(market_data=data_str)

        try:
            response = await self._client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=20,
                temperature=0.0,
            )
            text = response.choices[0].message.content.strip().lower()
            return Regime(text)
        except (ValueError, KeyError) as e:
            logger.warning("regime.classification_failed", error=str(e))
            return Regime.CHOPPY
