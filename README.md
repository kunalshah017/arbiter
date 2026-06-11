# Arbiter — Backtest-Validated Autonomous Crypto Trader

> BNB Hack: AI Trading Agent Edition | Track 1: Autonomous Trading Agents

An AI trading agent that validates every trade decision against a Rust-powered backtest engine before execution — bringing institutional quant discipline to on-chain autonomous trading on BSC.

## How It Works

```
Market Data (Binance) → AI classifies regime → Selects strategy →
Rust engine validates (<50ms) → Only executes if positive expectancy →
TWAK signs & swaps on BSC
```

**The agent never trades on belief — it trades on evidence.**

## Architecture

| Layer             | Technology                                                |
| ----------------- | --------------------------------------------------------- |
| Orchestrator      | Python 3.11+ / asyncio                                    |
| Backtest Engine   | Rust (PyO3) — 20 technical indicators, <50ms per run      |
| Market Data       | Binance public API (OHLCV) + CMC MCP (regime signals)     |
| Execution         | Trust Wallet Agent Kit (self-custody, autonomous signing) |
| On-chain Identity | BNB AI Agent SDK (ERC-8004)                               |
| Chain             | BNB Smart Chain (BSC)                                     |

## Setup

### Prerequisites

- Python 3.11+
- Rust toolchain (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- TWAK CLI (`curl -fsSL https://agent-kit.trustwallet.com/install.sh | bash`)

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
# Edit .env with your API keys and wallet credentials
```

### Register Agent

```bash
python scripts/register.py
```

### Run

```bash
python -m agent.main
```

### Manual Backtest (test specific token)

```bash
python scripts/manual_backtest.py BNB trending_up
python scripts/manual_backtest.py ETH mean_reverting
```

### Docker (Production)

```bash
docker compose up -d
```

## Decision Gate

Every trade must pass ALL thresholds:

- Expected return > 0.5%
- Max drawdown < -15%
- Win rate > 35%
- Minimum 5 trades in backtest
- Profit factor > 1.2

## Risk Management

- Max 5% per position
- Max 60% total exposure
- Daily drawdown halt at -8%
- Competition cap at -25% (buffer vs -30% DQ)
- ATR-based stop-loss and take-profit on every trade

## Tech Stack Details

### Rust Backtest Engine

- 20 technical indicators via `nautilus-indicators` crate
- Condition evaluation: `>`, `<`, `>=`, `<=`, `crossover`, `crossunder`
- State machine: Idle → Long (spot only)
- ATR-based SL/TP with configurable multiples
- Full metrics: Sharpe, profit factor, win rate, drawdown, expectancy

### Market Regime Classification

- GPT-4o-mini classifies into 5 regimes from CMC global metrics
- Each regime maps to a pre-tested strategy template
- Strategies: Momentum, Mean Reversion, Volatility Breakout, Defensive, Ultra Conservative

### Token Scanning

- Scans 40+ BEP-20 tokens on Binance
- Regime-aware momentum scoring
- Filters by liquidity (min $50K 24h volume)

## Competition Wallet

- BSC Address: [filled after registration]
- Agent ID (ERC-8004): [filled after registration]

## License

MIT
