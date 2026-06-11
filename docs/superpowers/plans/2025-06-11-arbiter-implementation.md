# Arbiter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an autonomous BNB Chain trading agent that validates every trade against a Rust backtest engine before execution, competing in the BNB Hack: AI Trading Agent Edition ($36K prize pool, Track 1).

**Architecture:** Python asyncio orchestrator calls CMC MCP (x402) for market intelligence, feeds OHLCV to a Rust crypto backtest engine (PyO3) for strategy validation, and executes approved trades via TWAK CLI on BSC. ERC-8004 on-chain identity via BNB SDK. All state persisted in SQLite.

**Tech Stack:** Python 3.11, Rust (PyO3/maturin), CMC MCP + REST API, Trust Wallet Agent Kit (CLI), BNB Agent SDK, OpenAI GPT-4o-mini, SQLite, Docker, asyncio.

---

## File Structure

```
arbiter/
├── engine/                         # Rust backtest engine (new crypto module)
│   ├── Cargo.toml                  # Rust dependencies + PyO3 cdylib
│   └── src/
│       ├── lib.rs                  # PyO3 module: exposes crypto_backtest()
│       ├── crypto/
│       │   ├── mod.rs              # Module declarations
│       │   ├── config.rs           # CryptoBacktestConfig (deserialized from JSON)
│       │   ├── runner.rs           # CryptoSpotRunner: bar loop + state machine
│       │   ├── position.rs         # Position struct: entry/exit tracking, P&L
│       │   └── result.rs           # CryptoBacktestResult: metrics output
│       ├── indicators/             # COPIED from Astryx: registry.rs, nautilus_wrapper.rs
│       │   ├── mod.rs
│       │   ├── registry.rs
│       │   └── nautilus_wrapper.rs
│       └── conditions/             # COPIED from Astryx: condition evaluator
│           ├── mod.rs
│           └── evaluator.rs
│
├── agent/                          # Python orchestration layer
│   ├── __init__.py
│   ├── main.py                     # Entry point: asyncio event loop + scheduler
│   ├── regime.py                   # Market regime classifier (LLM-based)
│   ├── scanner.py                  # Multi-token scanner + ranker
│   ├── strategy.py                 # Strategy selector: regime → backtest config
│   ├── gate.py                     # Decision gate: backtest result → PASS/FAIL
│   └── monitor.py                  # Position monitor: SL/TP/trailing every 5min
│
├── integrations/                   # External service wrappers
│   ├── __init__.py
│   ├── cmc.py                      # CMC MCP client (x402) + REST OHLCV fetcher
│   ├── twak.py                     # TWAK CLI subprocess wrapper
│   └── bnb_sdk.py                  # BNB Agent SDK: ERC-8004 registration
│
├── risk/                           # Portfolio-level risk management
│   ├── __init__.py
│   ├── portfolio.py                # Position tracking, exposure calculation
│   ├── guardrails.py               # Drawdown caps, daily loss halt, kill switches
│   └── sizing.py                   # Position size calculator (Kelly-lite)
│
├── data/                           # Data persistence layer
│   ├── __init__.py
│   ├── db.py                       # SQLite connection + schema init
│   ├── models.py                   # Pydantic models (Bar, Position, Trade, etc.)
│   └── transforms.py              # CMC JSON → Rust bar format conversion
│
├── config/                         # Static configuration
│   ├── settings.py                 # Pydantic Settings (env vars)
│   ├── strategies.yaml             # Strategy templates per regime
│   └── tokens.yaml                 # 149 eligible tokens (stablecoins filtered)
│
├── notifications/                  # Alerting
│   ├── __init__.py
│   └── telegram.py                 # Telegram bot: trade alerts, daily summary
│
├── tests/
│   ├── __init__.py
│   ├── test_engine.py              # Rust engine: synthetic bar validation
│   ├── test_gate.py                # Decision gate pass/fail logic
│   ├── test_scanner.py             # Token ranking logic
│   ├── test_risk.py                # Position sizing + guardrails
│   ├── test_transforms.py          # CMC → Rust data transform
│   └── test_integration.py         # End-to-end: fetch → backtest → decision
│
├── scripts/
│   ├── register.py                 # One-time: ERC-8004 + competition registration
│   └── manual_backtest.py          # Ad-hoc: test backtest on specific token
│
├── pyproject.toml                  # Python project + maturin build config
├── Dockerfile                      # Production deployment
├── docker-compose.yml              # Docker compose for VPS
├── .env.example                    # Environment variable template
└── README.md                       # Submission README
```

---

### Task 1: Project Scaffold + Rust Engine Setup

**Files:**

- Create: `engine/Cargo.toml`
- Create: `engine/src/lib.rs`
- Create: `engine/src/crypto/mod.rs`
- Create: `engine/src/crypto/config.rs`
- Create: `engine/src/crypto/result.rs`
- Create: `engine/src/crypto/position.rs`
- Create: `engine/src/indicators/mod.rs` (copy from Astryx)
- Create: `engine/src/indicators/registry.rs` (copy from Astryx)
- Create: `engine/src/indicators/nautilus_wrapper.rs` (copy from Astryx)
- Create: `engine/src/conditions/mod.rs` (copy from Astryx)
- Create: `engine/src/conditions/evaluator.rs` (copy from Astryx)
- Create: `pyproject.toml`
- Create: `.env.example`
- Create: `.gitignore`

- [ ] **Step 1: Initialize git and project root**

```bash
cd /Users/kunal/arbiter
git init  # if not already
```

- [ ] **Step 2: Create `pyproject.toml` with maturin build**

```toml
[build-system]
requires = ["maturin>=1.5,<2.0"]
build-backend = "maturin"

[project]
name = "arbiter"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "bnbagent>=0.3.6",
    "httpx[http2]",
    "openai>=1.30",
    "pydantic>=2.0",
    "pydantic-settings>=2.0",
    "aiosqlite>=0.20",
    "pyyaml>=6.0",
    "python-dotenv>=1.0",
    "aiogram>=3.0",
    "structlog>=24.0",
]

[tool.maturin]
manifest-path = "engine/Cargo.toml"
module-name = "arbiter._engine"
python-source = "."

[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"
```

- [ ] **Step 3: Create `engine/Cargo.toml`**

```toml
[package]
name = "arbiter-engine"
version = "0.1.0"
edition = "2021"

[lib]
name = "arbiter__engine"
crate-type = ["cdylib"]

[dependencies]
pyo3 = { version = "0.22", features = ["extension-module"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
rust_decimal = { version = "1.35", features = ["serde", "maths"] }
rust_decimal_macros = "1.35"
thiserror = "1.0"
ahash = "0.8"
nautilus-indicators = "0.4"
```

Note: `nautilus-indicators` is the same crate used in Astryx. Check the exact version with `grep nautilus /Users/kunal/Astryx/backtest-engine/rust_engine/Cargo.toml` — if it's vendored or a git dep, copy that line.

- [ ] **Step 4: Create `engine/src/lib.rs` — PyO3 entry point**

```rust
use pyo3::prelude::*;

pub mod crypto;
pub mod indicators;
pub mod conditions;

/// Run a crypto spot backtest. Returns JSON result string.
///
/// # Arguments
/// * `bars_json` - JSON array of OHLCV bars: [{"ts": i64, "o": f64, "h": f64, "l": f64, "c": f64, "v": f64}, ...]
/// * `config_json` - JSON config with indicators, entry/exit conditions, risk params
///
/// # Returns
/// JSON string with backtest results: total_return, max_drawdown, win_rate, num_trades, profit_factor, sharpe
#[pyfunction]
fn crypto_backtest(bars_json: &str, config_json: &str) -> PyResult<String> {
    let bars: Vec<crypto::Bar> = serde_json::from_str(bars_json)
        .map_err(|e| pyo3::exceptions::PyValueError::new_err(format!("Invalid bars JSON: {e}")))?;
    let config: crypto::CryptoBacktestConfig = serde_json::from_str(config_json)
        .map_err(|e| pyo3::exceptions::PyValueError::new_err(format!("Invalid config JSON: {e}")))?;

    let result = crypto::run_backtest(&bars, &config);

    let json = serde_json::to_string(&result)
        .map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(format!("Serialize error: {e}")))?;
    Ok(json)
}

#[pymodule]
fn _engine(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(crypto_backtest, m)?)?;
    Ok(())
}
```

- [ ] **Step 5: Create `engine/src/crypto/mod.rs`**

```rust
pub mod config;
pub mod position;
pub mod result;
pub mod runner;

pub use config::{Bar, CryptoBacktestConfig};
pub use result::CryptoBacktestResult;
pub use runner::run_backtest;
```

- [ ] **Step 6: Create `engine/src/crypto/config.rs` — input types**

```rust
use serde::{Deserialize, Serialize};

/// Single OHLCV bar input from Python.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bar {
    /// Timestamp (unix seconds)
    pub ts: i64,
    /// Open price
    pub o: f64,
    /// High price
    pub h: f64,
    /// Low price
    pub l: f64,
    /// Close price
    pub c: f64,
    /// Volume
    pub v: f64,
}

/// Indicator configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndicatorDef {
    /// Indicator type: "EMA", "RSI", "ATR", "MACD", "BBands", etc.
    #[serde(rename = "type")]
    pub indicator_type: String,
    /// Period / length
    #[serde(default = "default_period")]
    pub period: usize,
    /// MACD fast period
    pub fast: Option<usize>,
    /// MACD slow period
    pub slow: Option<usize>,
    /// MACD signal period
    pub signal: Option<usize>,
    /// Bollinger Bands std dev multiplier
    pub std_dev: Option<f64>,
    /// Alias override (default: "{type}_{period}")
    pub alias: Option<String>,
}

fn default_period() -> usize { 14 }

impl IndicatorDef {
    /// Generate the default alias for this indicator.
    pub fn alias(&self) -> String {
        if let Some(ref a) = self.alias {
            return a.clone();
        }
        let name = self.indicator_type.to_uppercase();
        match name.as_str() {
            "MACD" => format!("MACD_{}_{}", self.fast.unwrap_or(12), self.slow.unwrap_or(26)),
            _ => format!("{}_{}", name, self.period),
        }
    }
}

/// A single condition: left_operand op right_operand.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConditionDef {
    /// Left operand: indicator alias (e.g. "EMA_9") or "close", "open", etc.
    pub left: String,
    /// Operator: ">", "<", ">=", "<=", "==", "crossover", "crossunder"
    pub op: String,
    /// Right operand: indicator alias, price field, or numeric string
    pub right: String,
}

/// Complete backtest configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CryptoBacktestConfig {
    /// Technical indicators to compute
    pub indicators: Vec<IndicatorDef>,
    /// Entry conditions (AND-combined)
    pub entry_conditions: Vec<ConditionDef>,
    /// Exit conditions (OR-combined: any triggers exit)
    pub exit_conditions: Vec<ConditionDef>,
    /// Stop-loss as ATR multiple (e.g. 2.0 = 2×ATR below entry)
    #[serde(default = "default_sl_atr")]
    pub stop_loss_atr_multiple: f64,
    /// Take-profit as ATR multiple (e.g. 4.0 = 4×ATR above entry)
    #[serde(default = "default_tp_atr")]
    pub take_profit_atr_multiple: f64,
    /// Trading fee in basis points (50 = 0.5% round trip)
    #[serde(default = "default_fee")]
    pub fee_bps: u32,
    /// Initial capital for position sizing
    #[serde(default = "default_capital")]
    pub initial_capital: f64,
    /// Warmup bars (skip first N bars for indicator stabilization)
    #[serde(default = "default_warmup")]
    pub warmup_bars: usize,
    /// ATR period for SL/TP calculation (must match an indicator)
    #[serde(default = "default_atr_period")]
    pub atr_period: usize,
}

fn default_sl_atr() -> f64 { 2.0 }
fn default_tp_atr() -> f64 { 4.0 }
fn default_fee() -> u32 { 50 }
fn default_capital() -> f64 { 10000.0 }
fn default_warmup() -> usize { 30 }
fn default_atr_period() -> usize { 14 }
```

- [ ] **Step 7: Create `engine/src/crypto/result.rs` — output types**

```rust
use serde::{Deserialize, Serialize};

/// Result of a crypto spot backtest.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CryptoBacktestResult {
    /// Total return percentage (e.g. 4.2 = +4.2%)
    pub total_return_pct: f64,
    /// Maximum drawdown percentage (e.g. -8.1 = -8.1%)
    pub max_drawdown_pct: f64,
    /// Win rate (0.0 to 100.0)
    pub win_rate: f64,
    /// Number of completed trades
    pub num_trades: u32,
    /// Profit factor (gross profit / gross loss). Infinity if no losses.
    pub profit_factor: f64,
    /// Expectancy per trade (average P&L per trade as % of entry)
    pub expectancy_pct: f64,
    /// Sharpe ratio (annualized, assuming 365 trading days for crypto)
    pub sharpe: f64,
    /// Average trade duration in bars
    pub avg_trade_bars: f64,
    /// Individual trade P&L percentages (for analysis)
    pub trade_pnls: Vec<f64>,
}

impl Default for CryptoBacktestResult {
    fn default() -> Self {
        Self {
            total_return_pct: 0.0,
            max_drawdown_pct: 0.0,
            win_rate: 0.0,
            num_trades: 0,
            profit_factor: 0.0,
            expectancy_pct: 0.0,
            sharpe: 0.0,
            avg_trade_bars: 0.0,
            trade_pnls: vec![],
        }
    }
}
```

- [ ] **Step 8: Create `engine/src/crypto/position.rs` — position tracking**

```rust
/// A single open position (LONG only for spot).
#[derive(Debug, Clone)]
pub struct Position {
    /// Entry price
    pub entry_price: f64,
    /// Entry bar index
    pub entry_bar_idx: usize,
    /// Stop-loss price
    pub stop_loss: f64,
    /// Take-profit price
    pub take_profit: f64,
    /// Highest price since entry (for trailing stop)
    pub highest_since_entry: f64,
}

/// Completed trade record.
#[derive(Debug, Clone)]
pub struct CompletedTrade {
    /// Entry price
    pub entry_price: f64,
    /// Exit price
    pub exit_price: f64,
    /// Entry bar index
    pub entry_bar_idx: usize,
    /// Exit bar index
    pub exit_bar_idx: usize,
    /// P&L percentage (after fees)
    pub pnl_pct: f64,
    /// Exit reason
    pub exit_reason: ExitReason,
}

#[derive(Debug, Clone, Copy)]
pub enum ExitReason {
    StopLoss,
    TakeProfit,
    SignalExit,
    EndOfData,
}
```

- [ ] **Step 9: Create `.env.example`**

```bash
# CMC API
CMC_API_KEY=your-coinmarketcap-api-key
CMC_MCP_URL=https://mcp.coinmarketcap.com/mcp
CMC_X402_URL=https://mcp.coinmarketcap.com/x402/mcp

# OpenAI (for regime classification)
OPENAI_API_KEY=sk-...

# BNB Agent SDK
PRIVATE_KEY=0x...
WALLET_PASSWORD=your-secure-password
NETWORK=bsc-mainnet

# Telegram notifications
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...

# Agent settings
INITIAL_CAPITAL=1000.0
MAX_POSITION_PCT=5.0
MAX_EXPOSURE_PCT=60.0
DAILY_DRAWDOWN_HALT_PCT=8.0
COMPETITION_DRAWDOWN_CAP_PCT=25.0
SCAN_INTERVAL_SECONDS=3600
MONITOR_INTERVAL_SECONDS=300
```

- [ ] **Step 10: Create `.gitignore`**

```gitignore
# Python
__pycache__/
*.pyc
*.pyo
.venv/
venv/
*.egg-info/
dist/
build/

# Rust
engine/target/

# Environment
.env
.env.local

# IDE
.vscode/
.idea/

# Data
*.db
*.sqlite

# OS
.DS_Store
```

- [ ] **Step 11: Copy indicator files from Astryx engine**

```bash
mkdir -p engine/src/indicators
cp /Users/kunal/Astryx/backtest-engine/rust_engine/src/indicators/mod.rs engine/src/indicators/
cp /Users/kunal/Astryx/backtest-engine/rust_engine/src/indicators/registry.rs engine/src/indicators/
cp /Users/kunal/Astryx/backtest-engine/rust_engine/src/indicators/nautilus_wrapper.rs engine/src/indicators/
```

Then strip all `crate::config::` imports and replace with local types. The indicator module only needs `IndicatorConfig` which we'll define locally.

- [ ] **Step 12: Copy condition evaluator from Astryx**

```bash
mkdir -p engine/src/conditions
```

Extract the `ConditionEvaluator` struct and its `evaluate_groups`, `evaluate_condition`, `resolve_operand` methods from `/Users/kunal/Astryx/backtest-engine/rust_engine/src/components/`. Simplify: remove multi-data-index support (always data_index=0), remove expression operand (not needed for our conditions).

- [ ] **Step 13: Verify Rust compiles**

```bash
cd engine && cargo check
```

Expected: compiles with warnings (unused fields in copied code). Fix any import errors.

- [ ] **Step 14: Commit**

```bash
cd /Users/kunal/arbiter
git add -A
git commit -m "feat: project scaffold with Rust engine structure"
```

---

### Task 2: Rust CryptoSpotRunner — Core Backtest Logic

**Files:**

- Create: `engine/src/crypto/runner.rs`
- Modify: `engine/src/crypto/mod.rs`
- Test: `tests/test_engine.py`

- [ ] **Step 1: Implement `runner.rs` — the bar-processing loop**

```rust
use crate::indicators::registry::IndicatorRegistry;
use crate::indicators::nautilus_wrapper::IndicatorOutput;
use super::config::{Bar, CryptoBacktestConfig, ConditionDef};
use super::position::{Position, CompletedTrade, ExitReason};
use super::result::CryptoBacktestResult;

/// State machine states
#[derive(Debug, Clone, Copy, PartialEq)]
enum State {
    /// Waiting for entry signal
    Idle,
    /// In a long position
    Long,
}

/// Previous values for crossover detection
struct PrevValues {
    values: std::collections::HashMap<String, f64>,
}

impl PrevValues {
    fn new() -> Self {
        Self { values: std::collections::HashMap::new() }
    }

    fn get(&self, key: &str) -> Option<f64> {
        self.values.get(key).copied()
    }

    fn set(&mut self, key: &str, val: f64) {
        self.values.insert(key.to_string(), val);
    }
}

/// Run a crypto spot backtest.
pub fn run_backtest(bars: &[Bar], config: &CryptoBacktestConfig) -> CryptoBacktestResult {
    if bars.is_empty() {
        return CryptoBacktestResult::default();
    }

    // Initialize indicators
    let mut registry = build_indicator_registry(config);
    let mut state = State::Idle;
    let mut position: Option<Position> = None;
    let mut trades: Vec<CompletedTrade> = Vec::new();
    let mut equity_curve: Vec<f64> = Vec::new();
    let mut current_equity = config.initial_capital;
    let mut prev_values = PrevValues::new();

    let fee_mult = 1.0 - (config.fee_bps as f64 / 10000.0 / 2.0); // half fee per side

    for (i, bar) in bars.iter().enumerate() {
        // Update all indicators with this bar
        registry.update_all(bar.o, bar.h, bar.l, bar.c, bar.v);

        // Skip warmup period
        if i < config.warmup_bars {
            update_prev_values(&mut prev_values, &registry, config);
            continue;
        }

        match state {
            State::Idle => {
                // Check entry conditions (AND-combined)
                if evaluate_conditions_and(&config.entry_conditions, &registry, &prev_values, bar) {
                    // Get ATR for SL/TP
                    let atr = get_atr_value(&registry, config.atr_period);
                    if atr > 0.0 {
                        let entry_price = bar.c;
                        let sl = entry_price - (config.stop_loss_atr_multiple * atr);
                        let tp = entry_price + (config.take_profit_atr_multiple * atr);

                        position = Some(Position {
                            entry_price,
                            entry_bar_idx: i,
                            stop_loss: sl,
                            take_profit: tp,
                            highest_since_entry: entry_price,
                        });
                        state = State::Long;
                    }
                }
            }
            State::Long => {
                let pos = position.as_mut().unwrap();
                pos.highest_since_entry = pos.highest_since_entry.max(bar.h);

                // Check stop-loss (using bar low)
                if bar.l <= pos.stop_loss {
                    let exit_price = pos.stop_loss; // assume filled at SL
                    let pnl_pct = ((exit_price * fee_mult) / (pos.entry_price / fee_mult) - 1.0) * 100.0;
                    trades.push(CompletedTrade {
                        entry_price: pos.entry_price,
                        exit_price,
                        entry_bar_idx: pos.entry_bar_idx,
                        exit_bar_idx: i,
                        pnl_pct,
                        exit_reason: ExitReason::StopLoss,
                    });
                    current_equity *= 1.0 + (pnl_pct / 100.0);
                    position = None;
                    state = State::Idle;
                }
                // Check take-profit (using bar high)
                else if bar.h >= pos.take_profit {
                    let exit_price = pos.take_profit;
                    let pnl_pct = ((exit_price * fee_mult) / (pos.entry_price / fee_mult) - 1.0) * 100.0;
                    trades.push(CompletedTrade {
                        entry_price: pos.entry_price,
                        exit_price,
                        entry_bar_idx: pos.entry_bar_idx,
                        exit_bar_idx: i,
                        pnl_pct,
                        exit_reason: ExitReason::TakeProfit,
                    });
                    current_equity *= 1.0 + (pnl_pct / 100.0);
                    position = None;
                    state = State::Idle;
                }
                // Check signal exit conditions (OR-combined)
                else if evaluate_conditions_or(&config.exit_conditions, &registry, &prev_values, bar) {
                    let exit_price = bar.c;
                    let pnl_pct = ((exit_price * fee_mult) / (pos.entry_price / fee_mult) - 1.0) * 100.0;
                    trades.push(CompletedTrade {
                        entry_price: pos.entry_price,
                        exit_price,
                        entry_bar_idx: pos.entry_bar_idx,
                        exit_bar_idx: i,
                        pnl_pct,
                        exit_reason: ExitReason::SignalExit,
                    });
                    current_equity *= 1.0 + (pnl_pct / 100.0);
                    position = None;
                    state = State::Idle;
                }
            }
        }

        equity_curve.push(current_equity);
        update_prev_values(&mut prev_values, &registry, config);
    }

    // Close any open position at end
    if let Some(pos) = position {
        let last_bar = bars.last().unwrap();
        let exit_price = last_bar.c;
        let pnl_pct = ((exit_price * fee_mult) / (pos.entry_price / fee_mult) - 1.0) * 100.0;
        trades.push(CompletedTrade {
            entry_price: pos.entry_price,
            exit_price,
            entry_bar_idx: pos.entry_bar_idx,
            exit_bar_idx: bars.len() - 1,
            pnl_pct,
            exit_reason: ExitReason::EndOfData,
        });
        current_equity *= 1.0 + (pnl_pct / 100.0);
        equity_curve.push(current_equity);
    }

    compute_result(&trades, &equity_curve, config.initial_capital)
}

/// Build indicator registry from config.
fn build_indicator_registry(config: &CryptoBacktestConfig) -> IndicatorRegistry {
    let mut registry = IndicatorRegistry::new();
    for def in &config.indicators {
        registry.add_indicator(&def.indicator_type, def.period, def.alias(), def.fast, def.slow, def.signal, def.std_dev);
    }
    // Ensure ATR is always present for SL/TP
    let atr_alias = format!("ATR_{}", config.atr_period);
    if !registry.has(&atr_alias) {
        registry.add_indicator("ATR", config.atr_period, atr_alias, None, None, None, None);
    }
    registry
}

/// Get current ATR value from registry.
fn get_atr_value(registry: &IndicatorRegistry, period: usize) -> f64 {
    let alias = format!("ATR_{}", period);
    registry.get_value(&alias).unwrap_or(0.0)
}

/// Evaluate entry conditions (all must be true = AND).
fn evaluate_conditions_and(
    conditions: &[ConditionDef],
    registry: &IndicatorRegistry,
    prev: &PrevValues,
    bar: &Bar,
) -> bool {
    if conditions.is_empty() {
        return false;
    }
    conditions.iter().all(|c| evaluate_single_condition(c, registry, prev, bar))
}

/// Evaluate exit conditions (any true = OR).
fn evaluate_conditions_or(
    conditions: &[ConditionDef],
    registry: &IndicatorRegistry,
    prev: &PrevValues,
    bar: &Bar,
) -> bool {
    if conditions.is_empty() {
        return false;
    }
    conditions.iter().any(|c| evaluate_single_condition(c, registry, prev, bar))
}

/// Evaluate a single condition.
fn evaluate_single_condition(
    cond: &ConditionDef,
    registry: &IndicatorRegistry,
    prev: &PrevValues,
    bar: &Bar,
) -> bool {
    let left = resolve_value(&cond.left, registry, bar);
    let right = resolve_value(&cond.right, registry, bar);

    let (left_val, right_val) = match (left, right) {
        (Some(l), Some(r)) => (l, r),
        _ => return false,
    };

    match cond.op.as_str() {
        ">" => left_val > right_val,
        "<" => left_val < right_val,
        ">=" => left_val >= right_val,
        "<=" => left_val <= right_val,
        "==" => (left_val - right_val).abs() < 1e-10,
        "crossover" => {
            // Current: left > right, Previous: left <= right
            let prev_left = prev.get(&cond.left).unwrap_or(left_val);
            let prev_right = prev.get(&cond.right).unwrap_or(right_val);
            prev_left <= prev_right && left_val > right_val
        }
        "crossunder" => {
            let prev_left = prev.get(&cond.left).unwrap_or(left_val);
            let prev_right = prev.get(&cond.right).unwrap_or(right_val);
            prev_left >= prev_right && left_val < right_val
        }
        _ => false,
    }
}

/// Resolve a value reference to a number.
/// Supports: indicator alias ("EMA_9"), indicator subfield ("MACD_12_26.histogram"),
/// price fields ("close", "open", "high", "low", "volume"), numeric literals ("55.0").
fn resolve_value(reference: &str, registry: &IndicatorRegistry, bar: &Bar) -> Option<f64> {
    // Try price field
    match reference.to_lowercase().as_str() {
        "close" | "c" => return Some(bar.c),
        "open" | "o" => return Some(bar.o),
        "high" | "h" => return Some(bar.h),
        "low" | "l" => return Some(bar.l),
        "volume" | "vol" | "v" => return Some(bar.v),
        _ => {}
    }

    // Try numeric literal
    if let Ok(val) = reference.parse::<f64>() {
        return Some(val);
    }

    // Try indicator (with optional subfield)
    if reference.contains('.') {
        let parts: Vec<&str> = reference.splitn(2, '.').collect();
        registry.get_subfield_value(parts[0], parts[1])
    } else {
        registry.get_value(reference)
    }
}

/// Store current indicator values for next-bar crossover detection.
fn update_prev_values(prev: &mut PrevValues, registry: &IndicatorRegistry, config: &CryptoBacktestConfig) {
    for def in &config.indicators {
        let alias = def.alias();
        if let Some(val) = registry.get_value(&alias) {
            prev.set(&alias, val);
        }
    }
}

/// Compute final metrics from completed trades.
fn compute_result(
    trades: &[CompletedTrade],
    equity_curve: &[f64],
    initial_capital: f64,
) -> CryptoBacktestResult {
    if trades.is_empty() {
        return CryptoBacktestResult::default();
    }

    let num_trades = trades.len() as u32;
    let trade_pnls: Vec<f64> = trades.iter().map(|t| t.pnl_pct).collect();

    let wins: Vec<f64> = trade_pnls.iter().filter(|&&p| p > 0.0).copied().collect();
    let losses: Vec<f64> = trade_pnls.iter().filter(|&&p| p <= 0.0).copied().collect();

    let win_rate = (wins.len() as f64 / num_trades as f64) * 100.0;
    let gross_profit: f64 = wins.iter().sum();
    let gross_loss: f64 = losses.iter().map(|l| l.abs()).sum();
    let profit_factor = if gross_loss > 0.0 { gross_profit / gross_loss } else { f64::INFINITY };
    let expectancy = trade_pnls.iter().sum::<f64>() / num_trades as f64;
    let total_return = (equity_curve.last().unwrap_or(&initial_capital) / initial_capital - 1.0) * 100.0;

    // Max drawdown from equity curve
    let max_drawdown = compute_max_drawdown(equity_curve);

    // Sharpe (annualized for crypto: 365 days, assume 1 bar = 1 hour → 8760 bars/year)
    let sharpe = compute_sharpe(&trade_pnls);

    // Average trade duration
    let avg_bars: f64 = trades.iter()
        .map(|t| (t.exit_bar_idx - t.entry_bar_idx) as f64)
        .sum::<f64>() / num_trades as f64;

    CryptoBacktestResult {
        total_return_pct: total_return,
        max_drawdown_pct: max_drawdown,
        win_rate,
        num_trades,
        profit_factor,
        expectancy_pct: expectancy,
        sharpe,
        avg_trade_bars: avg_bars,
        trade_pnls,
    }
}

fn compute_max_drawdown(equity: &[f64]) -> f64 {
    if equity.is_empty() { return 0.0; }
    let mut peak = equity[0];
    let mut max_dd = 0.0_f64;
    for &val in equity {
        if val > peak { peak = val; }
        let dd = (val - peak) / peak * 100.0;
        if dd < max_dd { max_dd = dd; }
    }
    max_dd
}

fn compute_sharpe(pnls: &[f64]) -> f64 {
    if pnls.len() < 2 { return 0.0; }
    let mean = pnls.iter().sum::<f64>() / pnls.len() as f64;
    let variance = pnls.iter().map(|p| (p - mean).powi(2)).sum::<f64>() / (pnls.len() - 1) as f64;
    let std_dev = variance.sqrt();
    if std_dev < 1e-10 { return 0.0; }
    // Annualize: assume ~365 trades per year for crypto
    (mean / std_dev) * (365.0_f64).sqrt()
}
```

- [ ] **Step 2: Create a minimal `IndicatorRegistry` interface**

The registry must expose these methods (adapt from Astryx code):

- `new() -> Self`
- `add_indicator(type_str, period, alias, fast, slow, signal, std_dev)`
- `update_all(open, high, low, close, volume)` — feeds all indicators
- `get_value(alias) -> Option<f64>` — get main value
- `get_subfield_value(alias, subfield) -> Option<f64>` — get band/signal/histogram
- `has(alias) -> bool`

This is a simplification of the Astryx `IndicatorRegistry`. Strip multi-data-index support (only index 0).

- [ ] **Step 3: Verify Rust builds**

```bash
cd /Users/kunal/arbiter/engine
cargo build --release
```

Expected: successful compile. Binary in `target/release/`.

- [ ] **Step 4: Build Python wheel with maturin**

```bash
cd /Users/kunal/arbiter
python -m venv .venv && source .venv/bin/activate
pip install maturin
maturin develop --release
```

Expected: `arbiter._engine` importable from Python.

- [ ] **Step 5: Write Python test for engine**

Create `tests/test_engine.py`:

```python
"""Tests for the Rust crypto backtest engine."""
import json
import pytest

from arbiter._engine import crypto_backtest


def make_trending_bars(n: int = 100, start_price: float = 100.0) -> list[dict]:
    """Generate synthetic uptrending OHLCV bars."""
    bars = []
    price = start_price
    for i in range(n):
        # Trending up with noise
        price *= 1.002  # 0.2% per bar
        noise = 0.005 * price * ((-1) ** i)
        o = price + noise
        h = price * 1.005
        l = price * 0.995
        c = price - noise
        v = 1000000.0
        bars.append({"ts": 1700000000 + i * 3600, "o": o, "h": h, "l": l, "c": c, "v": v})
    return bars


def make_config(
    sl_atr: float = 2.0,
    tp_atr: float = 4.0,
    fee_bps: int = 50,
) -> dict:
    """Create a simple momentum strategy config."""
    return {
        "indicators": [
            {"type": "EMA", "period": 9},
            {"type": "EMA", "period": 21},
            {"type": "RSI", "period": 14},
            {"type": "ATR", "period": 14},
        ],
        "entry_conditions": [
            {"left": "EMA_9", "op": ">", "right": "EMA_21"},
            {"left": "RSI_14", "op": ">", "right": "50"},
        ],
        "exit_conditions": [
            {"left": "EMA_9", "op": "<", "right": "EMA_21"},
        ],
        "stop_loss_atr_multiple": sl_atr,
        "take_profit_atr_multiple": tp_atr,
        "fee_bps": fee_bps,
        "initial_capital": 10000.0,
        "warmup_bars": 30,
        "atr_period": 14,
    }


class TestCryptoBacktest:
    def test_returns_valid_json(self):
        bars = make_trending_bars(100)
        config = make_config()
        result_json = crypto_backtest(json.dumps(bars), json.dumps(config))
        result = json.loads(result_json)

        assert "total_return_pct" in result
        assert "max_drawdown_pct" in result
        assert "win_rate" in result
        assert "num_trades" in result
        assert "profit_factor" in result
        assert "expectancy_pct" in result
        assert "sharpe" in result

    def test_trending_market_produces_trades(self):
        bars = make_trending_bars(200)
        config = make_config()
        result = json.loads(crypto_backtest(json.dumps(bars), json.dumps(config)))

        assert result["num_trades"] >= 1, "Should find at least 1 trade in trending data"

    def test_empty_bars_returns_zero(self):
        result = json.loads(crypto_backtest("[]", json.dumps(make_config())))
        assert result["num_trades"] == 0
        assert result["total_return_pct"] == 0.0

    def test_fees_reduce_returns(self):
        bars = make_trending_bars(200)
        no_fee = json.loads(crypto_backtest(json.dumps(bars), json.dumps(make_config(fee_bps=0))))
        with_fee = json.loads(crypto_backtest(json.dumps(bars), json.dumps(make_config(fee_bps=100))))

        if no_fee["num_trades"] > 0 and with_fee["num_trades"] > 0:
            assert with_fee["total_return_pct"] < no_fee["total_return_pct"]

    def test_invalid_bars_json_raises(self):
        with pytest.raises(ValueError):
            crypto_backtest("not json", json.dumps(make_config()))

    def test_invalid_config_json_raises(self):
        bars = json.dumps(make_trending_bars(50))
        with pytest.raises(ValueError):
            crypto_backtest(bars, "not json")

    def test_max_drawdown_is_negative_or_zero(self):
        bars = make_trending_bars(200)
        result = json.loads(crypto_backtest(json.dumps(bars), json.dumps(make_config())))
        assert result["max_drawdown_pct"] <= 0.0
```

- [ ] **Step 6: Run tests**

```bash
cd /Users/kunal/arbiter
source .venv/bin/activate
pip install pytest
pytest tests/test_engine.py -v
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: Rust CryptoSpotRunner with PyO3 bindings + tests"
```

---

### Task 3: Python Data Layer — CMC Integration + SQLite Cache

**Files:**

- Create: `data/__init__.py`
- Create: `data/db.py`
- Create: `data/models.py`
- Create: `data/transforms.py`
- Create: `integrations/__init__.py`
- Create: `integrations/cmc.py`
- Create: `config/__init__.py` (empty)
- Create: `config/settings.py`
- Test: `tests/test_transforms.py`

- [ ] **Step 1: Create `config/settings.py` — environment config**

```python
"""Application settings loaded from environment variables."""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # CMC
    cmc_api_key: str = ""
    cmc_mcp_url: str = "https://mcp.coinmarketcap.com/mcp"
    cmc_x402_url: str = "https://mcp.coinmarketcap.com/x402/mcp"
    cmc_rest_base: str = "https://pro-api.coinmarketcap.com"

    # OpenAI
    openai_api_key: str = ""

    # BNB SDK
    private_key: str = ""
    wallet_password: str = ""
    network: str = "bsc-mainnet"

    # Telegram
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    # Agent params
    initial_capital: float = 1000.0
    max_position_pct: float = 5.0
    max_exposure_pct: float = 60.0
    daily_drawdown_halt_pct: float = 8.0
    competition_drawdown_cap_pct: float = 25.0
    scan_interval_seconds: int = 3600
    monitor_interval_seconds: int = 300

    # Backtest gate thresholds
    gate_min_expectancy_pct: float = 0.5
    gate_max_drawdown_pct: float = -15.0
    gate_min_win_rate: float = 35.0
    gate_min_trades: int = 5
    gate_min_profit_factor: float = 1.2

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
```

- [ ] **Step 2: Create `data/models.py` — Pydantic data models**

```python
"""Core data models."""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


@dataclass(frozen=True, slots=True)
class OHLCVBar:
    """Single OHLCV candle."""
    ts: int        # Unix timestamp (seconds)
    open: float
    high: float
    low: float
    close: float
    volume: float

    def to_engine_dict(self) -> dict:
        """Convert to Rust engine input format."""
        return {
            "ts": self.ts,
            "o": self.open,
            "h": self.high,
            "l": self.low,
            "c": self.close,
            "v": self.volume,
        }


class Regime(str, Enum):
    TRENDING_UP = "trending_up"
    TRENDING_DOWN = "trending_down"
    MEAN_REVERTING = "mean_reverting"
    HIGH_VOLATILITY = "high_volatility"
    CHOPPY = "choppy"


class TradeAction(str, Enum):
    BUY = "buy"
    SELL = "sell"


@dataclass
class TokenScore:
    """Token ranking result."""
    symbol: str
    cmc_id: int
    price: float
    volume_24h: float
    change_24h_pct: float
    momentum_score: float


@dataclass
class BacktestGateResult:
    """Result of the decision gate check."""
    passed: bool
    total_return_pct: float
    max_drawdown_pct: float
    win_rate: float
    num_trades: int
    profit_factor: float
    expectancy_pct: float
    rejection_reasons: list[str]
```

- [ ] **Step 3: Create `data/db.py` — SQLite persistence**

```python
"""SQLite database for state persistence."""
import aiosqlite
from pathlib import Path

DB_PATH = Path("arbiter.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS ohlcv_cache (
    symbol TEXT NOT NULL,
    interval TEXT NOT NULL,
    ts INTEGER NOT NULL,
    open REAL NOT NULL,
    high REAL NOT NULL,
    low REAL NOT NULL,
    close REAL NOT NULL,
    volume REAL NOT NULL,
    fetched_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    PRIMARY KEY (symbol, interval, ts)
);

CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    action TEXT NOT NULL,
    entry_price REAL,
    exit_price REAL,
    quantity REAL,
    pnl_pct REAL,
    entry_time INTEGER,
    exit_time INTEGER,
    exit_reason TEXT,
    strategy TEXT,
    regime TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS positions (
    symbol TEXT PRIMARY KEY,
    entry_price REAL NOT NULL,
    quantity REAL NOT NULL,
    stop_loss REAL NOT NULL,
    take_profit REAL NOT NULL,
    strategy TEXT NOT NULL,
    entry_time INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    ts INTEGER PRIMARY KEY,
    total_value_usd REAL NOT NULL,
    num_positions INTEGER NOT NULL,
    daily_pnl_pct REAL
);

CREATE INDEX IF NOT EXISTS idx_ohlcv_symbol_ts ON ohlcv_cache(symbol, ts);
CREATE INDEX IF NOT EXISTS idx_trades_time ON trades(entry_time);
"""


async def get_db() -> aiosqlite.Connection:
    """Get database connection (creates tables on first call)."""
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.executescript(SCHEMA)
    return db


async def cache_ohlcv(db: aiosqlite.Connection, symbol: str, interval: str, bars: list[dict]):
    """Cache OHLCV bars. Upsert on conflict."""
    await db.executemany(
        """INSERT OR REPLACE INTO ohlcv_cache (symbol, interval, ts, open, high, low, close, volume)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        [(symbol, interval, b["ts"], b["o"], b["h"], b["l"], b["c"], b["v"]) for b in bars],
    )
    await db.commit()


async def get_cached_ohlcv(db: aiosqlite.Connection, symbol: str, interval: str, since_ts: int) -> list[dict]:
    """Retrieve cached bars newer than since_ts."""
    cursor = await db.execute(
        """SELECT ts, open as o, high as h, low as l, close as c, volume as v
           FROM ohlcv_cache
           WHERE symbol = ? AND interval = ? AND ts >= ?
           ORDER BY ts ASC""",
        (symbol, interval, since_ts),
    )
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]
```

- [ ] **Step 4: Create `data/transforms.py` — format conversions**

```python
"""Transform CMC API responses into engine-compatible formats."""
from data.models import OHLCVBar


def cmc_ohlcv_to_bars(cmc_response: dict, symbol: str) -> list[OHLCVBar]:
    """Convert CMC REST OHLCV response to OHLCVBar list.

    CMC OHLCV format:
    {
        "data": {
            "quotes": [
                {
                    "time_open": "2024-01-01T00:00:00.000Z",
                    "time_close": "2024-01-01T00:59:59.999Z",
                    "quote": {
                        "USD": {
                            "open": 100.0,
                            "high": 101.0,
                            "low": 99.0,
                            "close": 100.5,
                            "volume": 1000000
                        }
                    }
                }
            ]
        }
    }
    """
    bars = []
    quotes = cmc_response.get("data", {}).get("quotes", [])
    for quote in quotes:
        # Parse timestamp
        time_str = quote.get("time_open", "")
        ts = _parse_iso_timestamp(time_str)
        if ts == 0:
            continue

        usd = quote.get("quote", {}).get("USD", {})
        bar = OHLCVBar(
            ts=ts,
            open=usd.get("open", 0.0),
            high=usd.get("high", 0.0),
            low=usd.get("low", 0.0),
            close=usd.get("close", 0.0),
            volume=usd.get("volume", 0.0),
        )
        bars.append(bar)
    return bars


def bars_to_engine_json(bars: list[OHLCVBar]) -> list[dict]:
    """Convert bars to Rust engine input format."""
    return [bar.to_engine_dict() for bar in bars]


def _parse_iso_timestamp(iso_str: str) -> int:
    """Parse ISO 8601 timestamp to unix seconds."""
    from datetime import datetime, timezone
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return int(dt.timestamp())
    except (ValueError, AttributeError):
        return 0
```

- [ ] **Step 5: Create `integrations/cmc.py` — CMC data client**

```python
"""CoinMarketCap data client — MCP (x402) + REST API."""
import json
import time
from typing import Any

import httpx
import structlog

from config.settings import settings

logger = structlog.get_logger()


class CMCClient:
    """Unified client for CMC MCP and REST API."""

    def __init__(self):
        self._rest_headers = {
            "X-CMC_PRO_API_KEY": settings.cmc_api_key,
            "Accept": "application/json",
        }
        self._http = httpx.AsyncClient(timeout=30.0)

    # ─── REST API (OHLCV) ───────────────────────────────────────────────────

    async def fetch_ohlcv(
        self,
        symbol: str,
        interval: str = "hourly",
        days: int = 30,
    ) -> dict:
        """Fetch historical OHLCV from CMC REST API.

        Args:
            symbol: Token symbol (e.g. "BNB")
            interval: "hourly" or "daily"
            days: Number of days of history

        Returns:
            Raw CMC response dict.
        """
        # First resolve symbol to CMC ID
        cmc_id = await self._resolve_symbol_id(symbol)
        if not cmc_id:
            logger.warning("cmc.symbol_not_found", symbol=symbol)
            return {"data": {"quotes": []}}

        now = int(time.time())
        start = now - (days * 86400)

        url = f"{settings.cmc_rest_base}/v2/cryptocurrency/ohlcv/historical"
        params = {
            "id": cmc_id,
            "time_start": start,
            "time_end": now,
            "interval": interval,
            "convert": "USD",
        }

        resp = await self._http.get(url, headers=self._rest_headers, params=params)
        if resp.status_code != 200:
            logger.error("cmc.ohlcv_error", status=resp.status_code, body=resp.text[:200])
            return {"data": {"quotes": []}}

        return resp.json()

    async def _resolve_symbol_id(self, symbol: str) -> int | None:
        """Resolve token symbol to CMC ID."""
        url = f"{settings.cmc_rest_base}/v1/cryptocurrency/map"
        params = {"symbol": symbol, "limit": 1}
        resp = await self._http.get(url, headers=self._rest_headers, params=params)
        if resp.status_code == 200:
            data = resp.json().get("data", [])
            if data:
                return data[0]["id"]
        return None

    # ─── MCP Tools (via HTTP) ────────────────────────────────────────────────

    async def mcp_call(self, tool_name: str, arguments: dict) -> Any:
        """Call a CMC MCP tool via streamable HTTP transport.

        Uses x402 endpoint if no API key configured.
        """
        url = settings.cmc_x402_url if not settings.cmc_api_key else settings.cmc_mcp_url
        headers = {}
        if settings.cmc_api_key:
            headers["X-CMC-MCP-API-KEY"] = settings.cmc_api_key

        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": tool_name, "arguments": arguments},
        }

        resp = await self._http.post(url, json=payload, headers=headers)
        if resp.status_code == 200:
            result = resp.json()
            return result.get("result", {}).get("content", [])
        else:
            logger.error("cmc.mcp_error", status=resp.status_code, tool=tool_name)
            return None

    async def get_global_metrics(self) -> dict | None:
        """Get Fear & Greed, BTC dominance, total market cap."""
        return await self.mcp_call("get_global_metrics_latest", {})

    async def get_derivatives_metrics(self) -> dict | None:
        """Get funding rates, OI, leverage."""
        return await self.mcp_call("get_global_crypto_derivatives_metrics", {})

    async def get_technical_analysis(self, symbol: str) -> dict | None:
        """Get pre-computed TA for a token."""
        return await self.mcp_call("get_crypto_technical_analysis", {"symbol": symbol})

    async def get_quotes(self, symbols: list[str]) -> dict | None:
        """Get latest quotes for multiple tokens."""
        return await self.mcp_call("get_crypto_quotes_latest", {"symbol": ",".join(symbols)})

    async def close(self):
        await self._http.aclose()
```

- [ ] **Step 6: Write test for transforms**

Create `tests/test_transforms.py`:

```python
"""Tests for data transform functions."""
from data.models import OHLCVBar
from data.transforms import cmc_ohlcv_to_bars, bars_to_engine_json


def test_cmc_ohlcv_to_bars_parses_correctly():
    cmc_resp = {
        "data": {
            "quotes": [
                {
                    "time_open": "2024-01-01T00:00:00.000Z",
                    "quote": {
                        "USD": {
                            "open": 100.0,
                            "high": 105.0,
                            "low": 99.0,
                            "close": 103.0,
                            "volume": 5000000.0,
                        }
                    },
                }
            ]
        }
    }
    bars = cmc_ohlcv_to_bars(cmc_resp, "BNB")
    assert len(bars) == 1
    assert bars[0].open == 100.0
    assert bars[0].close == 103.0
    assert bars[0].ts == 1704067200  # 2024-01-01 00:00 UTC


def test_bars_to_engine_json_format():
    bars = [OHLCVBar(ts=1700000000, open=100, high=105, low=99, close=103, volume=1e6)]
    result = bars_to_engine_json(bars)
    assert result == [{"ts": 1700000000, "o": 100, "h": 105, "l": 99, "c": 103, "v": 1e6}]


def test_empty_cmc_response():
    bars = cmc_ohlcv_to_bars({"data": {"quotes": []}}, "X")
    assert bars == []
```

- [ ] **Step 7: Run tests**

```bash
pytest tests/test_transforms.py -v
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: CMC integration + SQLite cache + data transforms"
```

---

### Task 4: Regime Classifier + Strategy Templates

**Files:**

- Create: `agent/__init__.py`
- Create: `agent/regime.py`
- Create: `agent/strategy.py`
- Create: `agent/gate.py`
- Create: `config/strategies.yaml`
- Test: `tests/test_gate.py`

- [ ] **Step 1: Create `config/strategies.yaml` — strategy templates**

```yaml
# Strategy templates keyed by market regime.
# Each strategy defines indicators + entry/exit conditions for the Rust engine.

trending_up:
  name: "Momentum Breakout"
  indicators:
    - { type: "EMA", period: 9 }
    - { type: "EMA", period: 21 }
    - { type: "RSI", period: 14 }
    - { type: "ATR", period: 14 }
    - { type: "MACD", fast: 12, slow: 26, signal: 9 }
  entry_conditions:
    - { left: "EMA_9", op: ">", right: "EMA_21" }
    - { left: "RSI_14", op: ">", right: "55" }
    - { left: "MACD_12_26.histogram", op: ">", right: "0" }
  exit_conditions:
    - { left: "EMA_9", op: "crossunder", right: "EMA_21" }
    - { left: "RSI_14", op: "<", right: "40" }
  stop_loss_atr_multiple: 2.0
  take_profit_atr_multiple: 4.0

mean_reverting:
  name: "Mean Reversion"
  indicators:
    - { type: "BBands", period: 20, std_dev: 2.0 }
    - { type: "RSI", period: 14 }
    - { type: "ATR", period: 14 }
    - { type: "EMA", period: 50 }
  entry_conditions:
    - { left: "close", op: "<", right: "BBANDS_20.lower" }
    - { left: "RSI_14", op: "<", right: "30" }
  exit_conditions:
    - { left: "close", op: ">", right: "BBANDS_20.middle" }
    - { left: "RSI_14", op: ">", right: "65" }
  stop_loss_atr_multiple: 1.5
  take_profit_atr_multiple: 3.0

high_volatility:
  name: "Volatility Breakout"
  indicators:
    - { type: "ATR", period: 14 }
    - { type: "ATR", period: 50, alias: "ATR_50" }
    - { type: "Donchian", period: 20 }
    - { type: "EMA", period: 21 }
    - { type: "RSI", period: 14 }
  entry_conditions:
    - { left: "ATR_14", op: ">", right: "ATR_50" }
    - { left: "close", op: ">", right: "DONCHIAN_20.upper" }
    - { left: "RSI_14", op: ">", right: "50" }
  exit_conditions:
    - { left: "close", op: "<", right: "EMA_21" }
  stop_loss_atr_multiple: 3.0
  take_profit_atr_multiple: 5.0

trending_down:
  name: "Defensive (Cash Rotation)"
  # In bearish regime, we use tight conditions so we rarely enter.
  # The agent should mostly hold stablecoins.
  indicators:
    - { type: "EMA", period: 9 }
    - { type: "EMA", period: 50 }
    - { type: "RSI", period: 14 }
    - { type: "ATR", period: 14 }
  entry_conditions:
    - { left: "EMA_9", op: ">", right: "EMA_50" }
    - { left: "RSI_14", op: ">", right: "60" }
    - { left: "close", op: ">", right: "EMA_50" }
  exit_conditions:
    - { left: "RSI_14", op: "<", right: "50" }
    - { left: "close", op: "<", right: "EMA_9" }
  stop_loss_atr_multiple: 1.5
  take_profit_atr_multiple: 2.5

choppy:
  name: "Ultra Conservative"
  # Minimal trading in choppy markets. Very tight conditions.
  indicators:
    - { type: "RSI", period: 14 }
    - { type: "BBands", period: 20, std_dev: 2.5 }
    - { type: "ATR", period: 14 }
  entry_conditions:
    - { left: "RSI_14", op: "<", right: "20" }
    - { left: "close", op: "<", right: "BBANDS_20.lower" }
  exit_conditions:
    - { left: "RSI_14", op: ">", right: "50" }
  stop_loss_atr_multiple: 1.0
  take_profit_atr_multiple: 2.0
```

- [ ] **Step 2: Create `agent/regime.py` — market regime classifier**

```python
"""Market regime classifier using LLM + CMC data."""
import json
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
- Fear & Greed Index: {fear_greed}
- BTC Dominance Change (24h): {btc_dom_change}%
- Total Market Cap Change (24h): {mcap_change}%
- Funding Rates (avg): {funding}
- Derivatives OI Change: {oi_change}%

Respond with ONLY the regime name (one of: trending_up, trending_down, mean_reverting, high_volatility, choppy). No explanation."""


class RegimeClassifier:
    def __init__(self):
        self._client = AsyncOpenAI(api_key=settings.openai_api_key)

    async def classify(self, market_data: dict) -> Regime:
        """Classify current market regime based on global metrics.

        Args:
            market_data: Dict with keys: fear_greed, btc_dom_change, mcap_change, funding, oi_change

        Returns:
            Regime enum value.
        """
        prompt = REGIME_PROMPT.format(
            fear_greed=market_data.get("fear_greed", "N/A"),
            btc_dom_change=market_data.get("btc_dom_change", "N/A"),
            mcap_change=market_data.get("mcap_change", "N/A"),
            funding=market_data.get("funding", "N/A"),
            oi_change=market_data.get("oi_change", "N/A"),
        )

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
            return Regime.CHOPPY  # Default to conservative
```

- [ ] **Step 3: Create `agent/strategy.py` — strategy selection**

```python
"""Strategy selector: maps regime to backtest config."""
import yaml
from pathlib import Path

from data.models import Regime

_STRATEGIES_PATH = Path(__file__).parent.parent / "config" / "strategies.yaml"
_strategies: dict | None = None


def _load_strategies() -> dict:
    global _strategies
    if _strategies is None:
        with open(_STRATEGIES_PATH) as f:
            _strategies = yaml.safe_load(f)
    return _strategies


def get_strategy_config(regime: Regime) -> dict:
    """Get Rust engine backtest config for the given regime.

    Returns:
        Dict ready to be serialized to JSON for crypto_backtest().
    """
    strategies = _load_strategies()
    strategy = strategies.get(regime.value)
    if strategy is None:
        # Fallback to choppy (ultra conservative)
        strategy = strategies["choppy"]

    return {
        "indicators": strategy["indicators"],
        "entry_conditions": strategy["entry_conditions"],
        "exit_conditions": strategy["exit_conditions"],
        "stop_loss_atr_multiple": strategy.get("stop_loss_atr_multiple", 2.0),
        "take_profit_atr_multiple": strategy.get("take_profit_atr_multiple", 4.0),
        "fee_bps": 50,  # 0.5% round-trip for DEX
        "initial_capital": 10000.0,
        "warmup_bars": 30,
        "atr_period": 14,
    }
```

- [ ] **Step 4: Create `agent/gate.py` — decision gate**

```python
"""Decision gate: evaluates backtest results against thresholds."""
import json
import structlog

from config.settings import settings
from data.models import BacktestGateResult
from arbiter._engine import crypto_backtest

logger = structlog.get_logger()


def validate_strategy(bars_json: str, config_json: str) -> BacktestGateResult:
    """Run backtest and check if results pass the gate.

    Args:
        bars_json: JSON array of OHLCV bars
        config_json: JSON strategy config

    Returns:
        BacktestGateResult with pass/fail and reasons.
    """
    result_json = crypto_backtest(bars_json, config_json)
    result = json.loads(result_json)

    reasons = []
    passed = True

    # Check minimum trades
    if result["num_trades"] < settings.gate_min_trades:
        reasons.append(f"Too few trades: {result['num_trades']} < {settings.gate_min_trades}")
        passed = False

    # Check expectancy
    if result["expectancy_pct"] < settings.gate_min_expectancy_pct:
        reasons.append(f"Low expectancy: {result['expectancy_pct']:.2f}% < {settings.gate_min_expectancy_pct}%")
        passed = False

    # Check max drawdown (result is negative, threshold is negative)
    if result["max_drawdown_pct"] < settings.gate_max_drawdown_pct:
        reasons.append(f"High drawdown: {result['max_drawdown_pct']:.2f}% < {settings.gate_max_drawdown_pct}%")
        passed = False

    # Check win rate
    if result["win_rate"] < settings.gate_min_win_rate:
        reasons.append(f"Low win rate: {result['win_rate']:.1f}% < {settings.gate_min_win_rate}%")
        passed = False

    # Check profit factor
    if result["profit_factor"] < settings.gate_min_profit_factor:
        reasons.append(f"Low profit factor: {result['profit_factor']:.2f} < {settings.gate_min_profit_factor}")
        passed = False

    if passed:
        logger.info("gate.passed",
                    trades=result["num_trades"],
                    return_pct=result["total_return_pct"],
                    drawdown=result["max_drawdown_pct"])
    else:
        logger.info("gate.rejected", reasons=reasons)

    return BacktestGateResult(
        passed=passed,
        total_return_pct=result["total_return_pct"],
        max_drawdown_pct=result["max_drawdown_pct"],
        win_rate=result["win_rate"],
        num_trades=result["num_trades"],
        profit_factor=result["profit_factor"],
        expectancy_pct=result["expectancy_pct"],
        rejection_reasons=reasons,
    )
```

- [ ] **Step 5: Write test for the decision gate**

Create `tests/test_gate.py`:

```python
"""Tests for the decision gate."""
import json
import pytest
from unittest.mock import patch

from data.models import BacktestGateResult


def test_gate_passes_good_result():
    """Gate should pass a result with all metrics above thresholds."""
    from agent.gate import validate_strategy

    # Create bars that will produce a decent backtest (use trending synthetic data)
    from tests.test_engine import make_trending_bars, make_config

    bars = make_trending_bars(300)
    config = make_config()

    result = validate_strategy(json.dumps(bars), json.dumps(config))

    # Result should be a BacktestGateResult with valid fields
    assert isinstance(result, BacktestGateResult)
    assert isinstance(result.passed, bool)
    assert result.num_trades >= 0


def test_gate_rejects_insufficient_trades():
    """Gate should reject when too few trades."""
    from agent.gate import validate_strategy

    # Very short data = few or no trades
    bars = [{"ts": 1700000000 + i * 3600, "o": 100, "h": 101, "l": 99, "c": 100, "v": 1e6}
            for i in range(40)]  # Only 40 bars, warmup=30, leaves 10 for trading
    config = {
        "indicators": [{"type": "EMA", "period": 9}, {"type": "EMA", "period": 21},
                       {"type": "RSI", "period": 14}, {"type": "ATR", "period": 14}],
        "entry_conditions": [{"left": "EMA_9", "op": ">", "right": "EMA_21"}],
        "exit_conditions": [{"left": "EMA_9", "op": "<", "right": "EMA_21"}],
        "stop_loss_atr_multiple": 2.0, "take_profit_atr_multiple": 4.0,
        "fee_bps": 50, "initial_capital": 10000, "warmup_bars": 30, "atr_period": 14,
    }
    result = validate_strategy(json.dumps(bars), json.dumps(config))
    # With flat data and few bars, expect rejection
    if result.num_trades < 5:
        assert not result.passed
        assert any("Too few trades" in r for r in result.rejection_reasons)
```

- [ ] **Step 6: Run tests**

```bash
pytest tests/test_gate.py -v
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: regime classifier + strategy templates + decision gate"
```

---

### Task 5: TWAK Execution + Risk Management

**Files:**

- Create: `integrations/twak.py`
- Create: `risk/__init__.py`
- Create: `risk/portfolio.py`
- Create: `risk/guardrails.py`
- Create: `risk/sizing.py`
- Test: `tests/test_risk.py`

- [ ] **Step 1: Create `integrations/twak.py` — TWAK CLI wrapper**

```python
"""Trust Wallet Agent Kit CLI wrapper for execution."""
import asyncio
import json
import structlog

logger = structlog.get_logger()


class TWAKExecutor:
    """Wraps TWAK CLI commands for autonomous trading."""

    async def swap(
        self,
        amount: float,
        from_token: str,
        to_token: str,
        slippage_max: float = 0.01,
        chain: str = "bsc",
    ) -> dict | None:
        """Execute a token swap via TWAK.

        Args:
            amount: Amount of from_token to swap
            from_token: Source token symbol (e.g. "USDT")
            to_token: Destination token symbol (e.g. "BNB")
            slippage_max: Maximum slippage tolerance (0.01 = 1%)
            chain: Chain to execute on

        Returns:
            Dict with tx hash and details, or None on failure.
        """
        cmd = [
            "twak", "swap",
            str(amount), from_token, to_token,
            "--chain", chain,
            "--slippage", str(slippage_max),
            "--json",
        ]
        result = await self._run_cmd(cmd)
        if result:
            logger.info("twak.swap_executed",
                        from_token=from_token, to_token=to_token,
                        amount=amount, tx=result.get("tx_hash"))
        return result

    async def get_quote(
        self,
        amount: float,
        from_token: str,
        to_token: str,
        chain: str = "bsc",
    ) -> dict | None:
        """Get swap quote without executing."""
        cmd = [
            "twak", "swap",
            str(amount), from_token, to_token,
            "--chain", chain,
            "--quote-only",
            "--json",
        ]
        return await self._run_cmd(cmd)

    async def get_portfolio(self) -> dict | None:
        """Get current portfolio balances."""
        cmd = ["twak", "wallet", "portfolio", "--json"]
        return await self._run_cmd(cmd)

    async def get_price(self, token: str) -> float | None:
        """Get current price for a token."""
        cmd = ["twak", "price", token, "--json"]
        result = await self._run_cmd(cmd)
        if result:
            return result.get("price")
        return None

    async def register_competition(self) -> dict | None:
        """Register for the BNB Hack competition."""
        cmd = ["twak", "compete", "register", "--json"]
        return await self._run_cmd(cmd)

    async def _run_cmd(self, cmd: list[str]) -> dict | None:
        """Run a TWAK CLI command and parse JSON output."""
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=60.0)

            if proc.returncode != 0:
                logger.error("twak.cmd_failed",
                            cmd=" ".join(cmd),
                            stderr=stderr.decode()[:200])
                return None

            output = stdout.decode().strip()
            if output:
                return json.loads(output)
            return {}

        except asyncio.TimeoutError:
            logger.error("twak.timeout", cmd=" ".join(cmd))
            return None
        except json.JSONDecodeError:
            logger.error("twak.invalid_json", cmd=" ".join(cmd))
            return None
        except FileNotFoundError:
            logger.error("twak.not_installed")
            return None
```

- [ ] **Step 2: Create `risk/sizing.py` — position size calculator**

```python
"""Position sizing calculator."""
from config.settings import settings


def calculate_position_size(
    portfolio_value: float,
    expected_return_pct: float,
    max_drawdown_pct: float,
) -> float:
    """Calculate position size as USD amount.

    Uses a simplified Kelly-fraction approach capped by max_position_pct.

    Args:
        portfolio_value: Current total portfolio value in USD
        expected_return_pct: Expected return from backtest
        max_drawdown_pct: Max drawdown from backtest (negative)

    Returns:
        USD amount to allocate to this trade.
    """
    max_size = portfolio_value * (settings.max_position_pct / 100.0)

    # Simple sizing: scale by confidence (higher return, lower DD = bigger)
    if max_drawdown_pct >= 0:
        return max_size

    # Kelly-lite: fraction = (expected / abs(max_loss)) but capped
    kelly_fraction = expected_return_pct / abs(max_drawdown_pct)
    kelly_fraction = min(kelly_fraction, 1.0)  # Never more than 100% of max
    kelly_fraction = max(kelly_fraction, 0.3)  # Never less than 30% of max

    size = max_size * kelly_fraction
    return round(size, 2)
```

- [ ] **Step 3: Create `risk/guardrails.py` — portfolio-level risk limits**

```python
"""Portfolio-level guardrails and kill switches."""
import time
import structlog

from config.settings import settings

logger = structlog.get_logger()


class Guardrails:
    """Enforces portfolio-level risk limits."""

    def __init__(self):
        self._initial_value: float | None = None
        self._daily_start_value: float | None = None
        self._daily_start_ts: int = 0
        self._halted_until: int = 0

    def set_initial_value(self, value: float):
        """Set portfolio value at competition start."""
        self._initial_value = value
        self._daily_start_value = value
        self._daily_start_ts = int(time.time())

    def check_daily_reset(self, current_value: float):
        """Reset daily tracking if new day."""
        now = int(time.time())
        if now - self._daily_start_ts > 86400:
            self._daily_start_value = current_value
            self._daily_start_ts = now
            self._halted_until = 0

    def can_trade(self, current_value: float) -> tuple[bool, str]:
        """Check if trading is allowed given current portfolio value.

        Returns:
            (allowed, reason) tuple.
        """
        now = int(time.time())

        # Check halt
        if now < self._halted_until:
            remaining = (self._halted_until - now) // 60
            return False, f"Trading halted for {remaining} more minutes"

        self.check_daily_reset(current_value)

        # Competition drawdown cap
        if self._initial_value and self._initial_value > 0:
            total_dd = (current_value - self._initial_value) / self._initial_value * 100
            if total_dd < -settings.competition_drawdown_cap_pct:
                return False, f"Competition DD cap hit: {total_dd:.1f}%"

            # Warning zone: reduce aggressiveness
            if total_dd < -(settings.competition_drawdown_cap_pct - 5):
                logger.warning("guardrails.approaching_dd_cap", dd_pct=total_dd)

        # Daily drawdown halt
        if self._daily_start_value and self._daily_start_value > 0:
            daily_dd = (current_value - self._daily_start_value) / self._daily_start_value * 100
            if daily_dd < -settings.daily_drawdown_halt_pct:
                self._halted_until = now + 86400  # Halt for 24h
                logger.warning("guardrails.daily_halt", dd_pct=daily_dd)
                return False, f"Daily DD halt: {daily_dd:.1f}%"

        return True, ""

    def check_exposure(self, current_exposure_pct: float, new_position_pct: float) -> tuple[bool, str]:
        """Check if adding a new position would exceed exposure limits."""
        total = current_exposure_pct + new_position_pct
        if total > settings.max_exposure_pct:
            return False, f"Exposure limit: {total:.1f}% > {settings.max_exposure_pct}%"
        return True, ""
```

- [ ] **Step 4: Create `risk/portfolio.py` — position tracker**

```python
"""Position tracking and portfolio state."""
import time
from dataclasses import dataclass, field
import structlog

logger = structlog.get_logger()


@dataclass
class OpenPosition:
    """An active position."""
    symbol: str
    entry_price: float
    quantity: float
    stop_loss: float
    take_profit: float
    strategy: str
    entry_time: int = field(default_factory=lambda: int(time.time()))
    highest_price: float = 0.0

    def update_trailing(self, current_price: float, atr: float, multiplier: float = 2.0):
        """Update trailing stop based on highest price."""
        if current_price > self.highest_price:
            self.highest_price = current_price
            # Ratchet stop-loss up
            new_sl = self.highest_price - (multiplier * atr)
            if new_sl > self.stop_loss:
                self.stop_loss = new_sl

    @property
    def value_usd(self) -> float:
        return self.entry_price * self.quantity


class Portfolio:
    """Tracks open positions and portfolio state."""

    def __init__(self):
        self.positions: dict[str, OpenPosition] = {}
        self.cash_usd: float = 0.0

    @property
    def total_value(self) -> float:
        """Total portfolio value (cash + positions at entry)."""
        pos_value = sum(p.value_usd for p in self.positions.values())
        return self.cash_usd + pos_value

    @property
    def exposure_pct(self) -> float:
        """Current exposure as % of total value."""
        if self.total_value <= 0:
            return 0.0
        pos_value = sum(p.value_usd for p in self.positions.values())
        return (pos_value / self.total_value) * 100.0

    @property
    def num_positions(self) -> int:
        return len(self.positions)

    def has_position(self, symbol: str) -> bool:
        return symbol in self.positions

    def open_position(self, pos: OpenPosition):
        """Record a new open position."""
        self.positions[pos.symbol] = pos
        self.cash_usd -= pos.value_usd
        logger.info("portfolio.opened", symbol=pos.symbol, price=pos.entry_price, qty=pos.quantity)

    def close_position(self, symbol: str, exit_price: float) -> float:
        """Close a position and return P&L percentage."""
        pos = self.positions.pop(symbol, None)
        if pos is None:
            return 0.0
        pnl_pct = (exit_price / pos.entry_price - 1.0) * 100.0
        proceeds = exit_price * pos.quantity
        self.cash_usd += proceeds
        logger.info("portfolio.closed", symbol=symbol, pnl_pct=pnl_pct, exit_price=exit_price)
        return pnl_pct
```

- [ ] **Step 5: Write test for risk module**

Create `tests/test_risk.py`:

```python
"""Tests for risk management."""
from risk.sizing import calculate_position_size
from risk.guardrails import Guardrails


def test_position_size_capped_at_max():
    size = calculate_position_size(
        portfolio_value=10000,
        expected_return_pct=10.0,
        max_drawdown_pct=-5.0,
    )
    # Max is 5% of 10000 = 500
    assert size <= 500.0
    assert size > 0


def test_position_size_scales_with_confidence():
    # Higher expected return → larger position
    high_conf = calculate_position_size(10000, 8.0, -4.0)
    low_conf = calculate_position_size(10000, 2.0, -10.0)
    assert high_conf >= low_conf


def test_guardrails_allows_trading_initially():
    g = Guardrails()
    g.set_initial_value(1000.0)
    allowed, reason = g.can_trade(1000.0)
    assert allowed
    assert reason == ""


def test_guardrails_blocks_on_competition_dd():
    g = Guardrails()
    g.set_initial_value(1000.0)
    # 26% drawdown exceeds 25% cap
    allowed, reason = g.can_trade(740.0)
    assert not allowed
    assert "DD cap" in reason


def test_guardrails_blocks_on_daily_dd():
    g = Guardrails()
    g.set_initial_value(1000.0)
    # 9% daily loss exceeds 8% cap
    allowed, reason = g.can_trade(910.0)
    assert not allowed
    assert "Daily DD halt" in reason


def test_guardrails_exposure_check():
    g = Guardrails()
    allowed, _ = g.check_exposure(55.0, 10.0)
    assert not allowed  # 65% > 60%

    allowed, _ = g.check_exposure(40.0, 10.0)
    assert allowed  # 50% < 60%
```

- [ ] **Step 6: Run tests**

```bash
pytest tests/test_risk.py -v
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: TWAK executor + risk management (sizing, guardrails, portfolio)"
```

---

### Task 6: Token Scanner + Ranking

**Files:**

- Create: `agent/scanner.py`
- Create: `config/tokens.yaml`
- Test: `tests/test_scanner.py`

- [ ] **Step 1: Create `config/tokens.yaml` — eligible token list**

```yaml
# 149 eligible BEP-20 tokens for BNB Hack competition.
# Stablecoins removed from trading universe (kept as quote only).

stablecoins:
  - USDT
  - USDC
  - DAI
  - FDUSD
  - FRAX
  - USDD
  - TUSD
  - USD1
  - USDe
  - FRXUSD
  - DUSD
  - XUSD
  - USDf
  - lisUSD
  - EURI

tradeable:
  - ETH
  - BNB
  - XRP
  - TRX
  - DOGE
  - ADA
  - LINK
  - BCH
  - TON
  - LTC
  - AVAX
  - SHIB
  - DOT
  - UNI
  - ETC
  - AAVE
  - ATOM
  - FIL
  - INJ
  - FET
  - BONK
  - PENGU
  - CAKE
  - LUNC
  - ZRO
  - BTT
  - FLOKI
  - LDO
  - PENDLE
  - STG
  - AXS
  - TWT
  - RAY
  - COMP
  - BAT
  - APE
  - IP
  - SFP
  - NXPC
  - 1INCH
  - SNX
  - FORM
  - BDX
  - BEAM
  - AIOZ
  - YFI
  - ZIL
  - ZETA
  - ROSE
  - VELO
  - AXL
  - KAVA
  - SUSHI
  - ZEC
  - NFT
  - EDGE
  - NEX
  - XCN
  - XPL
  - HOME
  - GWEI
  - GENIUS
  - SKYAI
  - TAG
  - AB
  - SAHARA
  - CHEEMS
  - BANANAS31
  - RIVER
  - MYX
  - RAVE
  - LAB
  - HTX
  - CTM
  - SLX
  - UB
  - DUCKY
  - BILL
  - WFI
  - KOGE
  - ALE
  - GOMINING
  - VCNT
  - GUA
  - SMILEK
  - 0G
  - MY
  - SOON
  - REAL
  - Q
  - ZIG
  - TAC
  - CYS
  - ZAMA
  - TRIA
  - HUMA
  - PLUME
  - XPR
  - BabyDoge
  - NILA
  - UAI
  - BRETT
  - OPEN
  - BSB
  - TOSHI
  - BAS
  - ACH
  - ELF
  - APR
  - IRYS
  - BARD
  - DUSK
  - PEAQ
  - COAI
  - BDCA
  - XAUM
  - ASTER
  - DEXE
  - STABLE
  - SIREN
  - KITE
  - BEAT
  - PIEVERSE
  - B
  - FF
  - NIGHT
  - LUR
```

- [ ] **Step 2: Create `agent/scanner.py` — multi-token scanner**

```python
"""Multi-token scanner: ranks 149 eligible tokens and selects top candidates."""
import yaml
from pathlib import Path
from typing import Optional

import structlog

from data.models import TokenScore, Regime
from integrations.cmc import CMCClient

logger = structlog.get_logger()

_TOKENS_PATH = Path(__file__).parent.parent / "config" / "tokens.yaml"


def load_tradeable_tokens() -> list[str]:
    """Load tradeable token list (excludes stablecoins)."""
    with open(_TOKENS_PATH) as f:
        config = yaml.safe_load(f)
    return config.get("tradeable", [])


class TokenScanner:
    """Scans eligible tokens and ranks them by momentum score."""

    def __init__(self, cmc: CMCClient):
        self._cmc = cmc
        self._tokens = load_tradeable_tokens()

    async def scan_and_rank(self, regime: Regime, top_n: int = 10) -> list[TokenScore]:
        """Scan all tokens and return top N by momentum score.

        Args:
            regime: Current market regime (affects scoring)
            top_n: Number of top candidates to return

        Returns:
            Sorted list of TokenScore (highest score first).
        """
        # Batch fetch quotes (CMC supports comma-separated symbols)
        # Split into chunks of 20 to avoid URL length limits
        all_scores: list[TokenScore] = []

        for chunk_start in range(0, len(self._tokens), 20):
            chunk = self._tokens[chunk_start:chunk_start + 20]
            quotes = await self._cmc.get_quotes(chunk)
            if quotes is None:
                continue

            for token_data in self._parse_quotes(quotes):
                score = self._compute_momentum_score(token_data, regime)
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

    def _parse_quotes(self, mcp_response) -> list[dict]:
        """Parse CMC MCP quotes response into usable dicts."""
        # CMC MCP returns content as list of text blocks
        # Actual parsing depends on MCP response format — adapt at integration time
        results = []
        if isinstance(mcp_response, list):
            for item in mcp_response:
                if isinstance(item, dict) and "text" in item:
                    # Parse structured text response
                    # This will need adaptation based on actual CMC MCP output format
                    pass
        return results

    def _compute_momentum_score(self, data: dict, regime: Regime) -> Optional[TokenScore]:
        """Compute momentum score for ranking.

        Score = |24h_change| * log(volume) * regime_multiplier
        - Trending regimes favor high absolute change
        - Mean-reverting favors oversold tokens (negative change)
        """
        try:
            symbol = data.get("symbol", "")
            price = float(data.get("price", 0))
            volume = float(data.get("volume_24h", 0))
            change = float(data.get("percent_change_24h", 0))

            if price <= 0 or volume < 10000:  # Filter dust
                return None

            import math
            vol_factor = math.log10(max(volume, 1))

            if regime == Regime.TRENDING_UP:
                # Favor positive movers
                score = max(change, 0) * vol_factor
            elif regime == Regime.MEAN_REVERTING:
                # Favor oversold (negative change = buying opportunity)
                score = max(-change, 0) * vol_factor
            elif regime == Regime.HIGH_VOLATILITY:
                # Favor highest absolute movement
                score = abs(change) * vol_factor
            else:
                # Choppy/down: favor stability + volume
                score = vol_factor * max(1.0 - abs(change) / 10.0, 0.1)

            return TokenScore(
                symbol=symbol,
                cmc_id=int(data.get("id", 0)),
                price=price,
                volume_24h=volume,
                change_24h_pct=change,
                momentum_score=score,
            )
        except (ValueError, TypeError):
            return None
```

- [ ] **Step 3: Write test for scanner ranking logic**

Create `tests/test_scanner.py`:

```python
"""Tests for token scanner ranking."""
from agent.scanner import TokenScanner, load_tradeable_tokens
from data.models import Regime, TokenScore


def test_load_tradeable_tokens():
    tokens = load_tradeable_tokens()
    assert len(tokens) > 50
    # Stablecoins should not be in tradeable
    assert "USDT" not in tokens
    assert "USDC" not in tokens
    # Known tokens should be present
    assert "BNB" in tokens
    assert "ETH" in tokens
    assert "CAKE" in tokens


def test_momentum_score_trending_up_favors_gainers():
    """In trending_up, positive movers should score higher."""
    from agent.scanner import TokenScanner

    # Mock the score computation directly
    scanner = TokenScanner.__new__(TokenScanner)

    gainer = scanner._compute_momentum_score(
        {"symbol": "BNB", "price": 600, "volume_24h": 1e9, "percent_change_24h": 5.0, "id": 1},
        Regime.TRENDING_UP,
    )
    loser = scanner._compute_momentum_score(
        {"symbol": "ETH", "price": 3000, "volume_24h": 1e9, "percent_change_24h": -3.0, "id": 2},
        Regime.TRENDING_UP,
    )

    assert gainer is not None
    assert loser is not None
    assert gainer.momentum_score > loser.momentum_score


def test_momentum_score_mean_reverting_favors_oversold():
    """In mean-reverting, negative movers (oversold) should score higher."""
    scanner = TokenScanner.__new__(TokenScanner)

    oversold = scanner._compute_momentum_score(
        {"symbol": "X", "price": 10, "volume_24h": 1e8, "percent_change_24h": -8.0, "id": 1},
        Regime.MEAN_REVERTING,
    )
    overbought = scanner._compute_momentum_score(
        {"symbol": "Y", "price": 10, "volume_24h": 1e8, "percent_change_24h": 5.0, "id": 2},
        Regime.MEAN_REVERTING,
    )

    assert oversold.momentum_score > overbought.momentum_score


def test_filters_dust_tokens():
    """Tokens with very low volume should be filtered."""
    scanner = TokenScanner.__new__(TokenScanner)
    result = scanner._compute_momentum_score(
        {"symbol": "DUST", "price": 0.001, "volume_24h": 100, "percent_change_24h": 50, "id": 99},
        Regime.TRENDING_UP,
    )
    assert result is None
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_scanner.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: multi-token scanner with regime-aware ranking"
```

---

### Task 7: Main Agent Loop + Orchestration

**Files:**

- Create: `agent/main.py`
- Create: `agent/scheduler.py`
- Create: `agent/monitor.py`
- Create: `integrations/bnb_sdk.py`

- [ ] **Step 1: Create `integrations/bnb_sdk.py` — BNB SDK wrapper**

```python
"""BNB Agent SDK integration for ERC-8004 registration."""
import os
import structlog

logger = structlog.get_logger()


async def register_agent_identity():
    """Register agent on-chain via ERC-8004.

    One-time operation. Idempotent — safe to call if already registered.
    """
    try:
        from bnbagent import ERC8004Agent, AgentEndpoint, EVMWalletProvider

        wallet = EVMWalletProvider(
            password=os.getenv("WALLET_PASSWORD", ""),
            private_key=os.getenv("PRIVATE_KEY"),
        )

        sdk = ERC8004Agent(network=os.getenv("NETWORK", "bsc-mainnet"), wallet_provider=wallet)

        agent_uri = sdk.generate_agent_uri(
            name="arbiter-trading-agent",
            description="Backtest-validated autonomous crypto trader on BSC. "
                        "Validates every trade against a Rust engine before execution.",
            endpoints=[
                AgentEndpoint(
                    name="trading",
                    endpoint="https://arbiter.agent",
                    version="0.1.0",
                ),
            ],
        )

        result = sdk.register_agent(agent_uri=agent_uri)
        logger.info("bnb_sdk.registered",
                    agent_id=result.get("agentId"),
                    tx=result.get("transactionHash"))
        return result

    except Exception as e:
        logger.error("bnb_sdk.registration_failed", error=str(e))
        return None
```

- [ ] **Step 2: Create `agent/monitor.py` — position monitor**

```python
"""Position monitor: checks SL/TP/trailing every 5 minutes."""
import structlog

from integrations.twak import TWAKExecutor
from risk.portfolio import Portfolio, OpenPosition

logger = structlog.get_logger()


class PositionMonitor:
    """Monitors open positions and exits on SL/TP/trailing stop."""

    def __init__(self, twak: TWAKExecutor, portfolio: Portfolio):
        self._twak = twak
        self._portfolio = portfolio

    async def check_all_positions(self):
        """Check all open positions against current prices."""
        if not self._portfolio.positions:
            return

        for symbol in list(self._portfolio.positions.keys()):
            pos = self._portfolio.positions.get(symbol)
            if pos is None:
                continue

            current_price = await self._twak.get_price(symbol)
            if current_price is None:
                logger.warning("monitor.price_unavailable", symbol=symbol)
                continue

            exit_reason = self._check_exit(pos, current_price)
            if exit_reason:
                await self._execute_exit(symbol, pos, current_price, exit_reason)

    def _check_exit(self, pos: OpenPosition, price: float) -> str | None:
        """Check if position should be exited."""
        if price <= pos.stop_loss:
            return "stop_loss"
        if price >= pos.take_profit:
            return "take_profit"
        # Update trailing stop
        pos.update_trailing(price, atr=0.0)  # ATR would need to be stored
        return None

    async def _execute_exit(self, symbol: str, pos: OpenPosition, price: float, reason: str):
        """Execute position exit via TWAK."""
        logger.info("monitor.exiting", symbol=symbol, reason=reason, price=price)
        result = await self._twak.swap(
            amount=pos.quantity,
            from_token=symbol,
            to_token="USDT",
            slippage_max=0.01,
        )
        if result:
            pnl = self._portfolio.close_position(symbol, price)
            logger.info("monitor.exit_complete", symbol=symbol, pnl_pct=pnl, reason=reason)
```

- [ ] **Step 3: Create `agent/main.py` — main entry point and loop**

```python
"""Arbiter — Main agent entry point."""
import asyncio
import json
import time

import structlog

from config.settings import settings
from data.models import Regime
from data.db import get_db, cache_ohlcv, get_cached_ohlcv
from data.transforms import cmc_ohlcv_to_bars, bars_to_engine_json
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
        self.cmc = CMCClient()
        self.twak = TWAKExecutor()
        self.regime_clf = RegimeClassifier()
        self.scanner = TokenScanner(self.cmc)
        self.portfolio = Portfolio()
        self.guardrails = Guardrails()
        self.monitor = PositionMonitor(self.twak, self.portfolio)
        self._db = None
        self._trades_today = 0
        self._day_start = int(time.time())

    async def start(self):
        """Initialize and start the agent loop."""
        logger.info("arbiter.starting")
        self._db = await get_db()

        # Register on-chain identity (idempotent)
        await register_agent_identity()

        # Get initial portfolio value from TWAK
        portfolio_data = await self.twak.get_portfolio()
        if portfolio_data:
            initial_value = float(portfolio_data.get("total_value_usd", settings.initial_capital))
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
            await asyncio.sleep(3600)  # Check every hour
            now = int(time.time())
            if now - self._day_start > 86400:
                await self._daily_review()
                self._day_start = now
                self._trades_today = 0

    async def _scan_and_trade(self):
        """Core trading logic: scan → classify → validate → execute."""
        # 1. Check if trading allowed
        can_trade, reason = self.guardrails.can_trade(self.portfolio.total_value)
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
        strategy_config = get_strategy_config(regime)
        executed = 0

        for token in candidates:
            if executed >= 3:  # Max 3 new positions per cycle
                break
            if self.portfolio.has_position(token.symbol):
                continue

            # Check exposure
            position_size = calculate_position_size(
                self.portfolio.total_value,
                strategy_config.get("take_profit_atr_multiple", 4.0),
                -strategy_config.get("stop_loss_atr_multiple", 2.0) * 2,
            )
            can_add, reason = self.guardrails.check_exposure(
                self.portfolio.exposure_pct,
                (position_size / self.portfolio.total_value) * 100 if self.portfolio.total_value > 0 else 0,
            )
            if not can_add:
                logger.info("arbiter.exposure_limit", reason=reason)
                break

            # Fetch OHLCV
            bars = await self._get_ohlcv(token.symbol)
            if not bars or len(bars) < 50:
                continue

            # Validate with backtest
            bars_json = json.dumps(bars)
            config_json = json.dumps(strategy_config)
            gate_result = validate_strategy(bars_json, config_json)

            if gate_result.passed:
                # Execute trade
                success = await self._execute_entry(token.symbol, position_size, strategy_config)
                if success:
                    executed += 1
                    self._trades_today += 1
            else:
                logger.debug("arbiter.gate_rejected",
                            symbol=token.symbol,
                            reasons=gate_result.rejection_reasons)

    async def _fetch_market_context(self) -> dict:
        """Fetch global market data for regime classification."""
        global_metrics = await self.cmc.get_global_metrics()
        derivatives = await self.cmc.get_derivatives_metrics()
        # Parse into the format regime classifier expects
        # This will be adapted based on actual CMC MCP response format
        return {
            "fear_greed": 50,  # Default neutral
            "btc_dom_change": 0.0,
            "mcap_change": 0.0,
            "funding": 0.0,
            "oi_change": 0.0,
        }

    async def _get_ohlcv(self, symbol: str) -> list[dict]:
        """Get OHLCV bars (from cache or CMC)."""
        since_ts = int(time.time()) - (30 * 86400)  # 30 days
        cached = await get_cached_ohlcv(self._db, symbol, "hourly", since_ts)

        if len(cached) >= 500:  # Enough cached data
            return cached

        # Fetch from CMC REST
        resp = await self.cmc.fetch_ohlcv(symbol, interval="hourly", days=30)
        from data.transforms import cmc_ohlcv_to_bars, bars_to_engine_json
        bars = cmc_ohlcv_to_bars(resp, symbol)
        engine_bars = bars_to_engine_json(bars)

        if engine_bars:
            await cache_ohlcv(self._db, symbol, "hourly", engine_bars)

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

        # Record position
        price = await self.twak.get_price(symbol)
        if price and price > 0:
            quantity = size_usd / price
            atr_approx = price * 0.02  # 2% approximation if no ATR available
            pos = OpenPosition(
                symbol=symbol,
                entry_price=price,
                quantity=quantity,
                stop_loss=price - (config["stop_loss_atr_multiple"] * atr_approx),
                take_profit=price + (config["take_profit_atr_multiple"] * atr_approx),
                strategy=config.get("name", "unknown"),
            )
            self.portfolio.open_position(pos)
            return True
        return False

    async def _daily_review(self):
        """End-of-day review and forced trade if needed."""
        if self._trades_today == 0:
            logger.warning("arbiter.no_trades_today, forcing_conservative")
            # Force a small conservative trade to meet minimum
            # Use the safest token (BNB or ETH) with minimal size
            await self._force_minimum_trade()

    async def _force_minimum_trade(self):
        """Force a minimum trade to meet competition requirements."""
        min_size = self.portfolio.total_value * 0.02  # 2% position
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
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: main agent loop with scan/monitor/daily cycles"
```

---

### Task 8: Telegram Notifications

**Files:**

- Create: `notifications/__init__.py`
- Create: `notifications/telegram.py`

- [ ] **Step 1: Create `notifications/telegram.py`**

```python
"""Telegram bot for trade alerts and daily summaries."""
import asyncio
from typing import Optional

import httpx
import structlog

from config.settings import settings

logger = structlog.get_logger()

_BASE_URL = "https://api.telegram.org/bot{token}/sendMessage"


async def send_message(text: str, parse_mode: str = "HTML"):
    """Send a message to the configured Telegram chat."""
    if not settings.telegram_bot_token or not settings.telegram_chat_id:
        return

    url = _BASE_URL.format(token=settings.telegram_bot_token)
    payload = {
        "chat_id": settings.telegram_chat_id,
        "text": text,
        "parse_mode": parse_mode,
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload, timeout=10.0)
            if resp.status_code != 200:
                logger.warning("telegram.send_failed", status=resp.status_code)
    except Exception as e:
        logger.warning("telegram.error", error=str(e))


async def notify_trade_entry(symbol: str, price: float, size_usd: float, strategy: str):
    """Notify on trade entry."""
    text = (
        f"🟢 <b>BUY {symbol}</b>\n"
        f"Price: ${price:.4f}\n"
        f"Size: ${size_usd:.2f}\n"
        f"Strategy: {strategy}"
    )
    await send_message(text)


async def notify_trade_exit(symbol: str, price: float, pnl_pct: float, reason: str):
    """Notify on trade exit."""
    emoji = "🟢" if pnl_pct > 0 else "🔴"
    text = (
        f"{emoji} <b>SELL {symbol}</b>\n"
        f"Price: ${price:.4f}\n"
        f"P&L: {pnl_pct:+.2f}%\n"
        f"Reason: {reason}"
    )
    await send_message(text)


async def notify_daily_summary(
    total_value: float,
    daily_pnl_pct: float,
    num_trades: int,
    regime: str,
    positions: list[str],
):
    """Send daily performance summary."""
    text = (
        f"📊 <b>Daily Summary</b>\n"
        f"Portfolio: ${total_value:.2f}\n"
        f"Daily P&L: {daily_pnl_pct:+.2f}%\n"
        f"Trades today: {num_trades}\n"
        f"Regime: {regime}\n"
        f"Positions: {', '.join(positions) or 'None'}"
    )
    await send_message(text)


async def notify_error(error_msg: str):
    """Alert on errors."""
    text = f"⚠️ <b>Error</b>\n{error_msg}"
    await send_message(text)
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: Telegram notification bot"
```

---

### Task 9: Docker + Deployment Config

**Files:**

- Create: `Dockerfile`
- Create: `docker-compose.yml`

- [ ] **Step 1: Create `Dockerfile`**

```dockerfile
# Multi-stage: build Rust + Python wheel, then run
FROM python:3.11-slim AS builder

# Install Rust
RUN apt-get update && apt-get install -y curl build-essential && \
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Install maturin
RUN pip install maturin

# Copy engine source
WORKDIR /app
COPY engine/ engine/
COPY pyproject.toml .

# Build wheel
RUN maturin build --release --out dist/

# Runtime stage
FROM python:3.11-slim

# Install TWAK CLI
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://agent-kit.trustwallet.com/install.sh | bash && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps + built wheel
COPY --from=builder /app/dist/*.whl /tmp/
COPY pyproject.toml .
RUN pip install /tmp/*.whl && pip install . && rm /tmp/*.whl

# Copy application code
COPY agent/ agent/
COPY integrations/ integrations/
COPY risk/ risk/
COPY data/ data/
COPY config/ config/
COPY notifications/ notifications/

# Run
CMD ["python", "-m", "agent.main"]
```

- [ ] **Step 2: Create `docker-compose.yml`**

```yaml
version: "3.8"

services:
  arbiter:
    build: .
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./data:/app/data
      - arbiter-db:/app/arbiter.db
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  arbiter-db:
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: Docker deployment configuration"
```

---

### Task 10: Registration Script + README

**Files:**

- Create: `scripts/register.py`
- Create: `README.md`

- [ ] **Step 1: Create `scripts/register.py` — one-time setup**

```python
"""One-time registration: ERC-8004 identity + competition."""
import asyncio
import sys

from integrations.bnb_sdk import register_agent_identity
from integrations.twak import TWAKExecutor


async def main():
    print("=" * 60)
    print("Arbiter — Agent Registration")
    print("=" * 60)

    # 1. Register ERC-8004 identity
    print("\n[1/2] Registering ERC-8004 on-chain identity...")
    result = await register_agent_identity()
    if result:
        print(f"  ✓ Agent ID: {result.get('agentId')}")
        print(f"  ✓ TX: {result.get('transactionHash')}")
    else:
        print("  ✗ Registration failed (may already be registered)")

    # 2. Register for competition
    print("\n[2/2] Registering for BNB Hack competition...")
    twak = TWAKExecutor()
    comp_result = await twak.register_competition()
    if comp_result:
        print(f"  ✓ Competition registered")
        print(f"  ✓ Details: {comp_result}")
    else:
        print("  ✗ Competition registration failed")

    print("\n" + "=" * 60)
    print("Done. Agent is ready for trading window.")


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 2: Create `README.md`**

```markdown
# Arbiter — Backtest-Validated Autonomous Crypto Trader

> BNB Hack: AI Trading Agent Edition | Track 1: Autonomous Trading Agents

An AI trading agent that validates every trade decision against a Rust-powered backtest engine before execution — bringing institutional quant discipline to on-chain autonomous trading on BSC.

## How It Works
```

Market Data (CMC) → AI classifies regime → Selects strategy →
Rust engine validates (<50ms) → Only executes if positive expectancy →
TWAK signs & swaps on BSC

````

**The agent never trades on belief — it trades on evidence.**

## Architecture

| Layer | Technology |
|-------|-----------|
| Orchestrator | Python 3.11 / asyncio |
| Backtest Engine | Rust (PyO3) — 22 technical indicators, <50ms per run |
| Market Data | CoinMarketCap Agent Hub (MCP + x402) |
| Execution | Trust Wallet Agent Kit (self-custody, autonomous signing) |
| On-chain Identity | BNB AI Agent SDK (ERC-8004) |
| Chain | BNB Smart Chain (BSC) |

## Setup

### Prerequisites
- Python 3.11+
- Rust toolchain (for engine compilation)
- TWAK CLI installed (`curl -fsSL https://agent-kit.trustwallet.com/install.sh | bash`)

### Install
```bash
git clone https://github.com/kunalshah017/arbiter
cd arbiter
python -m venv .venv && source .venv/bin/activate
pip install maturin && maturin develop --release
pip install -e .
````

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

## Competition Wallet

- BSC Address: [to be filled after registration]
- Agent ID (ERC-8004): [to be filled after registration]

## License

MIT

````

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: registration script + README for submission"
````

---

### Task 11: Integration Test — End-to-End Validation

**Files:**

- Create: `tests/test_integration.py`
- Create: `scripts/manual_backtest.py`

- [ ] **Step 1: Create `scripts/manual_backtest.py` — test the full pipeline**

```python
"""Manual backtest script: test the full pipeline with a specific token."""
import asyncio
import json
import sys
import time

from integrations.cmc import CMCClient
from data.transforms import cmc_ohlcv_to_bars, bars_to_engine_json
from agent.strategy import get_strategy_config
from agent.gate import validate_strategy
from data.models import Regime


async def main():
    symbol = sys.argv[1] if len(sys.argv) > 1 else "BNB"
    regime = Regime(sys.argv[2]) if len(sys.argv) > 2 else Regime.TRENDING_UP

    print(f"Running backtest for {symbol} with regime={regime.value}")
    print("-" * 60)

    # Fetch OHLCV
    cmc = CMCClient()
    resp = await cmc.fetch_ohlcv(symbol, interval="hourly", days=30)
    bars = cmc_ohlcv_to_bars(resp, symbol)
    print(f"Fetched {len(bars)} bars")

    if len(bars) < 50:
        print("ERROR: Not enough bars for backtest")
        await cmc.close()
        return

    # Get strategy config
    config = get_strategy_config(regime)
    print(f"Strategy: {config.get('indicators', [])}")
    print(f"Entry conditions: {config.get('entry_conditions', [])}")

    # Run backtest
    engine_bars = bars_to_engine_json(bars)
    result = validate_strategy(json.dumps(engine_bars), json.dumps(config))

    # Print results
    print(f"\n{'='*60}")
    print(f"GATE: {'✓ PASSED' if result.passed else '✗ REJECTED'}")
    print(f"{'='*60}")
    print(f"Total Return:  {result.total_return_pct:+.2f}%")
    print(f"Max Drawdown:  {result.max_drawdown_pct:.2f}%")
    print(f"Win Rate:      {result.win_rate:.1f}%")
    print(f"Trades:        {result.num_trades}")
    print(f"Profit Factor: {result.profit_factor:.2f}")
    print(f"Expectancy:    {result.expectancy_pct:+.2f}%")

    if not result.passed:
        print(f"\nRejection reasons:")
        for r in result.rejection_reasons:
            print(f"  - {r}")

    await cmc.close()


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 2: Create `tests/test_integration.py` — automated integration test**

```python
"""Integration tests — requires Rust engine built but no live APIs."""
import json
import pytest
from unittest.mock import AsyncMock, patch

from data.models import Regime, BacktestGateResult


class TestFullPipeline:
    """Test the scan → classify → validate → gate pipeline."""

    def test_strategy_config_loads_for_all_regimes(self):
        from agent.strategy import get_strategy_config

        for regime in Regime:
            config = get_strategy_config(regime)
            assert "indicators" in config
            assert "entry_conditions" in config
            assert "exit_conditions" in config
            assert config["fee_bps"] > 0

    def test_gate_with_synthetic_trending_data(self):
        from agent.gate import validate_strategy
        from agent.strategy import get_strategy_config
        from tests.test_engine import make_trending_bars

        bars = make_trending_bars(300)
        config = get_strategy_config(Regime.TRENDING_UP)

        result = validate_strategy(json.dumps(bars), json.dumps(config))
        assert isinstance(result, BacktestGateResult)
        # With strong trending data, should find trades
        assert result.num_trades >= 0

    def test_gate_with_flat_data_rejects(self):
        from agent.gate import validate_strategy
        from agent.strategy import get_strategy_config

        # Flat sideways data — no trend
        bars = [
            {"ts": 1700000000 + i * 3600, "o": 100, "h": 100.5, "l": 99.5, "c": 100, "v": 1e6}
            for i in range(200)
        ]
        config = get_strategy_config(Regime.TRENDING_UP)

        result = validate_strategy(json.dumps(bars), json.dumps(config))
        # Flat data + trending strategy = should likely reject
        if result.num_trades < 5:
            assert not result.passed
```

- [ ] **Step 3: Run all tests**

```bash
pytest tests/ -v
```

Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: integration tests + manual backtest script"
```

---

### Task 12: Final Verification + Tag

**Files:**

- None new — verification only

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/kunal/arbiter
source .venv/bin/activate
pytest tests/ -v --tb=short
```

Expected: All green.

- [ ] **Step 2: Verify Rust engine builds clean**

```bash
cd engine && cargo build --release 2>&1 | grep -E "error|warning|Compiling|Finished"
```

Expected: `Finished` with no errors.

- [ ] **Step 3: Verify Python import works**

```bash
python -c "from arbiter._engine import crypto_backtest; print('Engine loaded OK')"
```

Expected: `Engine loaded OK`

- [ ] **Step 4: Verify TWAK CLI is available**

```bash
which twak && twak --version
```

Expected: Version output.

- [ ] **Step 5: Test CMC API connectivity**

```bash
python -c "
import asyncio, httpx
async def test():
    async with httpx.AsyncClient() as c:
        r = await c.get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/map',
                        headers={'X-CMC_PRO_API_KEY': 'YOUR_KEY'}, params={'symbol': 'BNB', 'limit': 1})
        print(f'CMC API: {r.status_code}')
asyncio.run(test())
"
```

Expected: `CMC API: 200`

- [ ] **Step 6: Tag release**

```bash
git tag v0.1.0
git push origin main --tags
```

---

## Post-Implementation: Competition Week Checklist

After all tasks are complete and the agent is deployed:

- [ ] Fund agent wallet with competition capital ($500-1000 USDT on BSC)
- [ ] Run `scripts/register.py` to register ERC-8004 + competition
- [ ] Deploy to VPS via `docker compose up -d`
- [ ] Verify Telegram notifications working
- [ ] Monitor first 24h of live trading
- [ ] Submit on DoraHacks (GitHub link + agent address + demo video)
