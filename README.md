# Arbiter — AI Strategy Skill with Backtest Validation

> **BNB Hack: AI Trading Agent Edition | Track 2: Strategy Skills**

A CMC Strategy Skill that generates regime-aware crypto trading strategies through a closed-loop optimization system — LLM proposes, Rust engine validates, Advisor LLM iterates — producing backtestable strategy specs with proven edge.

## How It Works

```
CMC Agent Hub → LLM classifies regime → Generator LLM proposes strategy →
Rust engine backtests in <50ms → Pass? Output spec. Fail? Advisor iterates.
```

1. **Regime Detection**: CMC MCP tools (global metrics, derivatives, fear & greed) feed an LLM that classifies the market into 5 regimes
2. **Strategy Generation**: A generator LLM produces entry/exit rules tuned to the detected regime
3. **Rust Validation**: Every strategy is backtested against 30 days of real OHLCV data in <50ms
4. **Advisor Loop**: Failed strategies get diagnosed by an advisor LLM that suggests improvements — loop repeats until pass or max iterations

**The LLM doesn't guess — it iterates with evidence.**

## Architecture

| Layer             | Technology                                                |
| ----------------- | --------------------------------------------------------- |
| Orchestrator      | Python 3.11+ / asyncio                                    |
| Backtest Engine   | Rust (PyO3) — 22 technical indicators, <50ms per run      |
| Market Data       | Binance public API (OHLCV)                                |
| Regime Signals    | CMC Agent Hub (MCP) — global metrics, derivatives, TA     |
| LLM Agents        | GPT-4o-mini (generator + regime classifier + advisor)     |
| Dashboard         | Vite + React + TradingView Lightweight Charts             |
| API Server        | FastAPI + WebSocket                                       |

## Setup

### Prerequisites

- Python 3.11+
- Rust toolchain (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- Node.js 18+ (for dashboard)

### Install

```bash
git clone https://github.com/kunalshah017/arbiter
cd arbiter
python -m venv .venv && source .venv/bin/activate
pip install maturin && maturin develop --release
pip install -e .
```

### Configure

```bash
cp .env.example .env
# Add: OPENAI_API_KEY, CMC_API_KEY
```

### Dashboard

```bash
cd dashboard && npm install && npm run dev
```

## How to Run

### Strategy Optimization Loop (main feature)

```bash
python -m agent.main
```

This runs the full optimization loop: regime detection → strategy generation → backtest validation → advisory iteration.

### Manual Backtest (test specific token + regime)

```bash
python scripts/manual_backtest.py BNB trending_up
python scripts/manual_backtest.py ETH mean_reverting
python scripts/manual_backtest.py SOL high_volatility
```

### API Server (for dashboard)

```bash
uvicorn server.api:app --reload --port 8000
```

### Dashboard UI

```bash
cd dashboard && npm run dev
# Open http://localhost:5173
```

### Docker

```bash
docker compose up -d
```

## Decision Gate Thresholds

Every generated strategy must pass ALL criteria before acceptance:

| Metric           | Threshold    | Purpose                        |
| ---------------- | ------------ | ------------------------------ |
| Expected return  | > 0.5%       | Positive expectancy required   |
| Max drawdown     | < -15%       | Risk-controlled                |
| Win rate         | > 35%        | Not random noise               |
| Minimum trades   | ≥ 5          | Statistical significance       |
| Profit factor    | > 1.2        | Reward exceeds risk            |

Strategies that fail are sent to the Advisor LLM for diagnosis and improvement, not discarded.

## CMC Agent Hub Usage

Arbiter uses CMC Agent Hub via MCP protocol for regime classification:

| MCP Tool                   | What We Extract                          |
| -------------------------- | ---------------------------------------- |
| `get_global_metrics`       | Market cap dominance, total volume       |
| `get_fear_greed_index`     | Sentiment extremes (greed/fear)          |
| `get_derivatives_data`     | Funding rates, open interest positioning |
| `get_technical_indicators` | RSI, MACD on major assets                |
| `get_trending_tokens`      | Momentum candidates                      |

These signals determine which of 5 regimes the market is in, which determines what TYPE of strategy the generator LLM produces.

## Market Regimes

| Regime           | Strategy Approach                        |
| ---------------- | ---------------------------------------- |
| Trending Up      | Momentum breakouts, trailing stops       |
| Trending Down    | Short momentum, defensive positioning    |
| Mean Reverting   | Fade at BBand extremes, RSI reversals    |
| High Volatility  | Wide stops, volatility capture           |
| Choppy           | Conservative / skip                      |

## Tech Stack

- **Python 3.11+** — orchestration, LLM calls, data pipeline
- **Rust (PyO3 + maturin)** — backtest engine, 22 indicators via nautilus-indicators
- **CMC Agent Hub (MCP)** — regime classification data
- **Binance API** — OHLCV candlestick data
- **GPT-4o-mini** — strategy generation, regime classification, advisory
- **FastAPI + WebSocket** — live backtest API
- **Vite + React + lightweight-charts** — dashboard visualization
- **BNB AI Agent SDK** — ERC-8004 on-chain identity

## Strategy Results Example

```
Token:    BNBUSDT
Regime:   trending_up
Strategy: Momentum Breakout v3 (iteration 3 of 5)

Entry: EMA(9) > EMA(21) AND RSI > 55 AND MACD histogram > 0
Exit:  EMA(9) < EMA(21) OR trailing stop at 2×ATR

Backtest (30d):
  Return:        +6.2%
  Max Drawdown:  -4.8%
  Win Rate:      58%
  Trades:        14
  Sharpe:        1.84
  Profit Factor: 2.1

Gate: ✅ PASS (all thresholds met)
```

## Project Structure

```
agent/           — Orchestrator, regime classifier, strategy generator, advisor, gate
engine/          — Rust backtest engine (PyO3 bindings)
integrations/    — Binance, CMC MCP, BNB SDK
data/            — Database models, OHLCV transforms
risk/            — Position sizing, guardrails, portfolio tracking
server/          — FastAPI endpoints + WebSocket
dashboard/       — React + Vite frontend
config/          — Strategy templates, token lists, settings
scripts/         — Manual backtest, registration
tests/           — 38 tests (all passing)
```

## License

MIT
