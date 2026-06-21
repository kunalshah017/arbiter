---
name: arbiter-strategy-optimizer
description: >
  Regime-aware crypto strategy generation with closed-loop Rust backtest validation.
  Uses CMC Agent Hub data (Fear & Greed, derivatives, technical analysis) to classify
  market regimes, then generates and validates quantitative trading strategies through
  a multi-agent LLM optimization loop. Every strategy is backtested against real OHLCV
  data in <50ms before being accepted. Use when building, testing, or optimizing crypto
  trading strategies with proven positive expectancy.
license: MIT
metadata:
  author: kunalshah017
  repository: https://github.com/kunalshah017/arbiter
  tags:
    - crypto
    - trading
    - backtest
    - strategy
    - quantitative
    - cmc
    - bnb-chain
---

# Arbiter Strategy Optimizer

A CMC Strategy Skill that uses multi-agent LLM optimization with Rust backtest validation to produce regime-aware trading strategies with proven edge.

## When to Use This Skill

- User wants to generate a crypto trading strategy
- User wants to backtest a strategy against real market data
- User needs regime-aware strategy selection (trending, mean-reverting, volatile, choppy)
- User describes a strategy in natural language and wants structured config output
- User wants to optimize strategy parameters iteratively using AI feedback loops
- User needs validated entry/exit rules with risk management parameters

## Architecture

```
CMC Agent Hub (MCP) → Regime Classifier (LLM) → Strategy Generator (LLM)
                                                         ↓
Advisor (LLM) ← Risk Gate ← Rust Backtest Engine (<50ms)
     ↓                              ↑
     └──── feedback loop (max 3 iterations) ────┘
```

## Data Sources

### CoinMarketCap Agent Hub (MCP)

- `get_global_metrics_latest` — Fear & Greed Index, BTC dominance, total market cap
- `get_global_crypto_derivatives_metrics` — Funding rates, open interest, leverage
- `get_crypto_technical_analysis` — Pre-computed RSI, EMA, MACD signals
- `get_crypto_quotes_latest` — Real-time price data
- `trending_crypto_narratives` — Market narrative context

### Binance Public API

- OHLCV candle data (1m to 1d intervals, up to 1000 bars per request)

## Strategy Output Format

The skill produces structured JSON strategy configurations:

```json
{
  "indicators": [
    { "type": "EMA", "period": 9 },
    { "type": "EMA", "period": 21 },
    { "type": "RSI", "period": 14 },
    { "type": "ATR", "period": 14 }
  ],
  "entry_conditions": [
    { "left": "EMA_9", "op": ">", "right": "EMA_21" },
    { "left": "RSI_14", "op": ">", "right": "55" }
  ],
  "exit_conditions": [
    { "left": "EMA_9", "op": "crossunder", "right": "EMA_21" },
    { "left": "RSI_14", "op": "<", "right": "40" }
  ],
  "stop_loss_atr_multiple": 2.0,
  "take_profit_atr_multiple": 4.0
}
```

## Supported Indicators

| Type   | Parameters      | Signals Generated                            |
| ------ | --------------- | -------------------------------------------- |
| EMA    | period          | `EMA_{period}`                               |
| RSI    | period          | `RSI_{period}`                               |
| ATR    | period          | `ATR_{period}`                               |
| BBands | period, std_dev | `BBANDS_{period}.upper`, `.middle`, `.lower` |

## Supported Operators

`>`, `<`, `>=`, `<=`, `crossover`, `crossunder`

## Market Regimes

| Regime            | Description                  | Strategy Style             |
| ----------------- | ---------------------------- | -------------------------- |
| `trending_up`     | Bull market, strong momentum | Breakout / trend-following |
| `trending_down`   | Bear market, weak momentum   | Cautious momentum          |
| `mean_reverting`  | Range-bound, oscillating     | Buy dips, sell rallies     |
| `high_volatility` | Large moves, high ATR        | Volatility expansion       |
| `choppy`          | No clear trend, tight range  | Scalping / tight stops     |

## Risk Gate Thresholds

Every generated strategy must pass:

- Minimum trades: ≥ 2
- Max drawdown: ≤ 30%
- Min win rate: ≥ 30%
- Min profit factor: ≥ 1.0

## API Endpoints

| Endpoint                 | Method | Description                               |
| ------------------------ | ------ | ----------------------------------------- |
| `/api/optimize`          | POST   | Multi-agent optimization with CMC context |
| `/api/backtest/detailed` | POST   | Premade strategy backtest                 |
| `/api/backtest/custom`   | POST   | Custom strategy backtest                  |
| `/api/strategy/generate` | POST   | Natural language → strategy config        |

## Example Usage

### Natural Language Input

```
"Buy when RSI drops below 30 and price touches the lower Bollinger Band.
Exit when RSI goes above 60. Use tight stop loss of 1.5x ATR."
```

### Optimization Request

```json
{
  "symbol": "BNB",
  "regime": "trending_up",
  "interval": "1h",
  "limit": 1000
}
```

### Response includes

- `strategy_config` — Full structured strategy spec
- `passed` — Whether it cleared the risk gate
- `total_return_pct`, `max_drawdown_pct`, `win_rate`, `profit_factor`
- `trades` — Individual trade entries with timestamps and P&L
- `equity_curve` — Portfolio value over time

## Tech Stack

- **Engine**: Rust + PyO3 + nautilus-indicators (sub-50ms backtests)
- **API**: Python FastAPI (async)
- **LLM**: Gemini 3.1 Flash Lite (via OpenAI-compatible SDK)
- **Data**: Binance OHLCV + CMC MCP
- **Dashboard**: React 19 + Vite + TailwindCSS + Lightweight Charts

## Limitations

- Strategies are optimized against historical data — no guarantee of future performance
- Requires sufficient price history (30+ days / 720+ bars recommended for hourly)
- Output is a validated strategy specification, not a direct trade instruction
- CMC data enrichment requires a CMC API key (optional but recommended)
