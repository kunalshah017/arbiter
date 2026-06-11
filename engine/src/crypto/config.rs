use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bar {
    pub ts: i64,
    pub o: f64,
    pub h: f64,
    pub l: f64,
    pub c: f64,
    pub v: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndicatorDef {
    #[serde(rename = "type")]
    pub indicator_type: String,
    #[serde(default = "default_period")]
    pub period: usize,
    pub fast: Option<usize>,
    pub slow: Option<usize>,
    pub signal: Option<usize>,
    pub std_dev: Option<f64>,
    pub alias: Option<String>,
}

fn default_period() -> usize { 14 }

impl IndicatorDef {
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConditionDef {
    pub left: String,
    pub op: String,
    pub right: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CryptoBacktestConfig {
    pub indicators: Vec<IndicatorDef>,
    pub entry_conditions: Vec<ConditionDef>,
    pub exit_conditions: Vec<ConditionDef>,
    #[serde(default = "default_sl_atr")]
    pub stop_loss_atr_multiple: f64,
    #[serde(default = "default_tp_atr")]
    pub take_profit_atr_multiple: f64,
    #[serde(default = "default_fee")]
    pub fee_bps: u32,
    #[serde(default = "default_capital")]
    pub initial_capital: f64,
    #[serde(default = "default_warmup")]
    pub warmup_bars: usize,
    #[serde(default = "default_atr_period")]
    pub atr_period: usize,
}

fn default_sl_atr() -> f64 { 2.0 }
fn default_tp_atr() -> f64 { 4.0 }
fn default_fee() -> u32 { 50 }
fn default_capital() -> f64 { 10000.0 }
fn default_warmup() -> usize { 30 }
fn default_atr_period() -> usize { 14 }
