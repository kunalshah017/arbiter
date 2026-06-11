//! Simplified Indicator Registry for Arbiter crypto engine.
//! Removed multi-data-index support (always index 0 for crypto spot).

use ahash::AHashMap;
use super::nautilus_wrapper::{NautilusIndicator, IndicatorOutput};

/// A single indicator instance.
#[derive(Debug)]
struct IndicatorInstance {
    indicator: NautilusIndicator,
    current: IndicatorOutput,
    initialized: bool,
}

/// Indicator Registry — manages all indicators by alias.
#[derive(Debug)]
pub struct IndicatorRegistry {
    indicators: AHashMap<String, IndicatorInstance>,
}

impl IndicatorRegistry {
    pub fn new() -> Self {
        Self { indicators: AHashMap::new() }
    }

    /// Add an indicator with the given parameters.
    pub fn add_indicator(
        &mut self,
        type_str: &str,
        period: usize,
        alias: String,
        fast: Option<usize>,
        slow: Option<usize>,
        signal: Option<usize>,
        std_dev: Option<f64>,
    ) {
        let indicator = match type_str.to_uppercase().as_str() {
            "SMA" => NautilusIndicator::new_sma(period),
            "EMA" => NautilusIndicator::new_ema(period),
            "DEMA" => NautilusIndicator::new_dema(period),
            "HMA" => NautilusIndicator::new_hma(period),
            "WMA" => NautilusIndicator::new_wma(period),
            "VWAP" => NautilusIndicator::new_vwap(),
            "RMA" => NautilusIndicator::new_rma(period),
            "RSI" => NautilusIndicator::new_rsi(period),
            "MACD" => NautilusIndicator::new_macd(
                fast.unwrap_or(12),
                slow.unwrap_or(26),
                signal.unwrap_or(9),
            ),
            "AROON" => NautilusIndicator::new_aroon(period),
            "CCI" => NautilusIndicator::new_cci(period, 0.015),
            "ROC" => NautilusIndicator::new_roc(period),
            "STOCHASTIC" => NautilusIndicator::new_stochastic(period, 3),
            "ATR" => NautilusIndicator::new_atr(period),
            "BBANDS" | "BOLLINGERBANDS" => NautilusIndicator::new_bbands(period, std_dev.unwrap_or(2.0)),
            "KELTNERCHANNEL" | "KELTNER" => NautilusIndicator::new_keltner(period, std_dev.unwrap_or(2.0)),
            "DONCHIANCHANNEL" | "DONCHIAN" => NautilusIndicator::new_donchian(period),
            "OBV" => NautilusIndicator::new_obv(),
            "EFFICIENCYRATIO" => NautilusIndicator::new_efficiency_ratio(period),
            "LINEARREGRESSION" => NautilusIndicator::new_linear_regression(period),
            _ => return, // Unknown indicator, skip
        };

        self.indicators.insert(alias, IndicatorInstance {
            indicator,
            current: IndicatorOutput::default(),
            initialized: false,
        });
    }

    /// Update all indicators with a new bar.
    pub fn update_all(&mut self, open: f64, high: f64, low: f64, close: f64, volume: f64) {
        for instance in self.indicators.values_mut() {
            instance.current = instance.indicator.update(open, high, low, close, volume);
            instance.initialized = instance.indicator.initialized();
        }
    }

    /// Get main value for an indicator by alias.
    pub fn get_value(&self, alias: &str) -> Option<f64> {
        self.indicators.get(alias).and_then(|inst| {
            if inst.initialized { Some(inst.current.value) } else { None }
        })
    }

    /// Get subfield value (e.g., "BBANDS_20.lower").
    pub fn get_subfield_value(&self, alias: &str, subfield: &str) -> Option<f64> {
        self.indicators.get(alias).and_then(|inst| {
            if inst.initialized { inst.current.get_subfield(subfield) } else { None }
        })
    }

    /// Check if an indicator alias exists.
    pub fn has(&self, alias: &str) -> bool {
        self.indicators.contains_key(alias)
    }
}
