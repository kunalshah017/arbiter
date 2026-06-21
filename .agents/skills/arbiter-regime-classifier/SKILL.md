---
name: arbiter-regime-classifier
description: >
  Classifies crypto market regimes using CMC Agent Hub data (Fear & Greed Index,
  derivatives positioning, technical analysis) to determine optimal strategy selection.
  Detects 5 regimes: trending_up, trending_down, mean_reverting, high_volatility, choppy.
  Use when you need to determine current market conditions before selecting or generating
  a trading strategy.
license: MIT
metadata:
  author: kunalshah017
  repository: https://github.com/kunalshah017/arbiter
  tags:
    - crypto
    - regime-detection
    - market-analysis
    - cmc
    - sentiment
---

# Arbiter Regime Classifier

Classifies current crypto market regime using CMC Agent Hub data to guide strategy selection.

## When to Use This Skill

- User asks "what's the current market regime?"
- User needs to select the right strategy for current conditions
- User wants to understand if the market is trending, ranging, or volatile
- Before running strategy optimization to determine the best regime parameter
- When building regime-aware trading systems

## CMC Data Inputs

| CMC MCP Tool                            | Data Used           | Regime Signal                                              |
| --------------------------------------- | ------------------- | ---------------------------------------------------------- |
| `get_global_metrics_latest`             | Fear & Greed Index  | Extreme fear → mean_reverting; Extreme greed → trending_up |
| `get_global_metrics_latest`             | BTC Dominance       | Rising dominance → risk-off / trending_down                |
| `get_global_crypto_derivatives_metrics` | Funding rates       | High positive → overheated / high_volatility               |
| `get_global_crypto_derivatives_metrics` | Open interest       | Expanding OI + price up → trending_up                      |
| `get_crypto_technical_analysis`         | RSI, EMA crossovers | Confirms trend direction and strength                      |

## Regime Definitions

### `trending_up`

- Fear & Greed > 60
- Price above key EMAs (9 > 21 > 50)
- RSI between 55-75
- Positive funding rates, expanding OI
- **Strategy**: Momentum breakout, trend-following

### `trending_down`

- Fear & Greed < 35
- Price below key EMAs
- RSI below 45
- Negative or declining funding
- **Strategy**: Cautious entries, tight stops

### `mean_reverting`

- Fear & Greed between 35-55
- Price oscillating around middle Bollinger Band
- RSI cycling between 30-70
- Flat funding rates
- **Strategy**: Buy oversold, sell overbought

### `high_volatility`

- ATR expanding (current ATR > 50-period ATR)
- Large daily ranges (>3% intraday moves)
- Liquidation cascades visible in OI data
- **Strategy**: Volatility breakout, wider stops

### `choppy`

- No clear directional bias
- Tight Bollinger Bands (squeeze)
- Low volume relative to average
- Mixed signals across indicators
- **Strategy**: Scalping, tight range plays

## Output

```json
{
  "regime": "trending_up",
  "confidence": 0.82,
  "signals": {
    "fear_greed": 68,
    "btc_dominance_trend": "declining",
    "funding_rate": "positive",
    "ema_alignment": "bullish",
    "rsi": 62
  },
  "recommended_strategies": ["Momentum Breakout", "Volatility Breakout"]
}
```

## Integration

This skill feeds directly into the `arbiter-strategy-optimizer` skill. When regime is auto-detected (not manually specified), the optimizer uses CMC data to classify the regime before generating strategy variants.
