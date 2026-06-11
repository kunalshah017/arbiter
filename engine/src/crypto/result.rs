use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CryptoBacktestResult {
    pub total_return_pct: f64,
    pub max_drawdown_pct: f64,
    pub win_rate: f64,
    pub num_trades: u32,
    pub profit_factor: f64,
    pub expectancy_pct: f64,
    pub sharpe: f64,
    pub avg_trade_bars: f64,
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
