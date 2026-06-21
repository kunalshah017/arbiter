# Arbiter — AI Strategy Skill with Closed-Loop Rust Validation

> **BNB Hack: AI Trading Agent Edition | Track 2: Strategy Skills**

A CMC Strategy Skill that uses multi-agent LLM optimization with Rust backtest validation to produce regime-aware trading strategies with proven edge — not guesses.

## The Problem

LLM-generated trading strategies are **unvalidated opinions**. Every "AI strategy generator" today does:

```
Prompt LLM → Get rules → Hope it works
```

No feedback loop. No quantitative validation. No iteration based on real market data.

## The Solution

A **closed-loop strategy optimization system** where:

1. **CMC Agent Hub** provides regime classification data (Fear & Greed, derivatives, technical analysis)
2. **Generator LLM** proposes strategy rules tuned to the detected regime
3. **Rust Backtest Engine** validates every strategy against 30 days of real OHLCV data in <50ms
4. **Advisor LLM** reviews failed results, identifies weaknesses, suggests improvements
5. **Loop repeats** until the strategy passes quantitative thresholds

**The LLM doesn't guess — it iterates with evidence.**

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    ARBITER STRATEGY SKILL                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │  CMC Agent   │───▶│   Regime     │───▶│  Strategy    │      │
│  │  Hub (MCP)   │    │  Classifier  │    │  Generator   │      │
│  │              │    │  (LLM)       │    │  (LLM)       │      │
│  │ • F&G Index  │    │              │    │              │      │
│  │ • Derivatives│    │ 5 regimes:   │    │ • Indicators │      │
│  │ • Tech Anal. │    │ trending_up  │    │ • Entry rules│      │
│  │ • Narratives │    │ trending_down│    │ • Exit rules │      │
│  └──────────────┘    │ mean_revert  │    │ • Risk params│      │
│                      │ volatile     │    └──────┬───────┘      │
│                      │ choppy       │           │              │
│                      └──────────────┘           ▼              │
│                                        ┌──────────────┐        │
│  ┌──────────────┐    ┌──────────────┐  │ Rust Engine  │        │
│  │   Advisor    │◀───│  Risk Gate   │◀─│ (PyO3)       │        │
│  │   (LLM)     │    │              │  │              │        │
│  │              │    │ • min trades │  │ • <50ms      │        │
│  │ "Try wider  │    │ • drawdown   │  │ • Full OHLCV │        │
│  │  stops..."  │    │ • win rate   │  │   replay     │        │
│  └──────┬───────┘    │ • profit fac │  │ • Indicator  │        │
│         │            └──────────────┘  │   compute    │        │
│         │                              └──────────────┘        │
│         └──────── feedback loop (max 3 iterations) ────────▶   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## CMC Agent Hub Integration

Arbiter uses the CoinMarketCap MCP server for:

| Tool                                    | Usage                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------ |
| `get_global_metrics_latest`             | Fear & Greed Index, BTC dominance, total market cap for regime detection |
| `get_global_crypto_derivatives_metrics` | Funding rates, open interest, leverage for positioning context           |
| `get_crypto_technical_analysis`         | Pre-computed RSI, EMA, MACD for signal confirmation                      |
| `get_crypto_quotes_latest`              | Real-time price data for target tokens                                   |
| `trending_crypto_narratives`            | Narrative context for strategy generation                                |

This data feeds directly into the optimization loop's `seed_feedback` parameter, giving the LLM agents market context before generating strategies.

## Key Features

- **Sub-50ms backtests** — Rust engine (PyO3 bindings) replays full OHLCV history with indicator computation
- **5 validated strategies** — All pass gate validation on real BNB/USDT data (30 days, 1h candles)
- **Multi-agent optimization** — Generator + Advisor LLMs iterate until quality thresholds are met
- **Natural language input** — Users describe strategies in English; AI converts to structured config
- **Custom strategy builder** — Full UI for manual indicator/rule configuration
- **Regime-aware** — Automatically selects optimal strategy parameters per market condition
- **Risk gates** — Every strategy must pass: min trades, max drawdown, min win rate, profit factor

## Strategy Output Format

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

## Backtest Results (BNB/USDT, 1h, 30 days)

| Strategy            | Trades | Return  | Win Rate | Profit Factor |
| ------------------- | ------ | ------- | -------- | ------------- |
| Momentum Breakout   | 20     | +8.94%  | 50.0%    | 1.76          |
| Mean Reversion      | 17     | +5.09%  | 52.9%    | 1.46          |
| Volatility Breakout | 27     | +5.67%  | 40.7%    | 1.51          |
| Cautious Momentum   | 22     | +4.61%  | 45.5%    | 1.37          |
| Tight Range Scalper | 42     | +12.70% | 47.6%    | 1.95          |

## Quick Start

```bash
# Clone
git clone https://github.com/kunalshah017/arbiter
cd arbiter

# Backend setup
python -m venv .venv && source .venv/bin/activate
pip install -e .

# Set API keys in .env
cp .env.example .env
# Add: GOOGLE_API_KEY=your-gemini-key
# Add: CMC_API_KEY=your-cmc-key (optional, enriches regime detection)

# Build Rust engine
cd engine && maturin develop --release && cd ..

# Start API server
uvicorn server.api:app --reload --port 8000

# Start dashboard
cd dashboard && npm install && npm run dev
```

## Tech Stack

| Layer           | Technology                                                |
| --------------- | --------------------------------------------------------- |
| Backtest Engine | Rust + PyO3 + nautilus-indicators                         |
| API Server      | Python, FastAPI, async                                    |
| LLM Agents      | Gemini 3.1 Flash Lite (via OpenAI SDK)                    |
| Data            | Binance OHLCV + CMC MCP (global metrics, derivatives, TA) |
| Dashboard       | React 19 + Vite + TailwindCSS + Framer Motion             |
| Charts          | Lightweight Charts (TradingView)                          |

## Skill Definition

See [`skills/arbiter-strategy-optimizer.yaml`](skills/arbiter-strategy-optimizer.yaml) for the full CMC Skill specification.

## API Endpoints

| Endpoint                      | Description                                        |
| ----------------------------- | -------------------------------------------------- |
| `POST /api/optimize`          | Run multi-agent optimization loop with CMC context |
| `POST /api/backtest/detailed` | Run premade strategy backtest                      |
| `POST /api/backtest/custom`   | Run user-defined strategy backtest                 |
| `POST /api/strategy/generate` | Natural language → structured strategy config      |
| `GET /api/ohlcv/{symbol}`     | Fetch OHLCV data                                   |

## License

MIT
