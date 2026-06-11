//! Backtest runner — full CryptoSpotRunner implementation.

use ahash::AHashMap;

use super::config::{Bar, ConditionDef, CryptoBacktestConfig};
use super::position::{CompletedTrade, ExitReason, Position};
use super::result::CryptoBacktestResult;
use crate::indicators::registry::IndicatorRegistry;

/// Tracks previous bar's indicator values for crossover/crossunder detection.
type PrevValues = AHashMap<String, f64>;

/// Run a crypto spot backtest.
pub fn run_backtest(bars: &[Bar], config: &CryptoBacktestConfig) -> CryptoBacktestResult {
    if bars.is_empty() {
        return CryptoBacktestResult::default();
    }

    // Build indicator registry
    let mut registry = IndicatorRegistry::new();
    for def in &config.indicators {
        let alias = def.alias();
        registry.add_indicator(
            &def.indicator_type,
            def.period,
            alias,
            def.fast,
            def.slow,
            def.signal,
            def.std_dev,
        );
    }

    // Add ATR if not already present
    let atr_alias = format!("ATR_{}", config.atr_period);
    if !registry.has(&atr_alias) {
        registry.add_indicator("ATR", config.atr_period, atr_alias.clone(), None, None, None, None);
    }

    let fee_mult = 1.0 - (config.fee_bps as f64 / 10000.0 / 2.0);

    let mut position: Option<Position> = None;
    let mut trades: Vec<CompletedTrade> = Vec::new();
    let mut prev_values: PrevValues = AHashMap::new();
    let mut equity = config.initial_capital;
    let mut peak_equity = equity;
    let mut max_drawdown_pct: f64 = 0.0;
    let mut bar_returns: Vec<f64> = Vec::new();

    for (i, bar) in bars.iter().enumerate() {
        registry.update_all(bar.o, bar.h, bar.l, bar.c, bar.v);

        if i < config.warmup_bars {
            update_prev_values(&registry, config, &mut prev_values);
            continue;
        }

        // Get current values snapshot for condition evaluation
        let current_values = snapshot_values(&registry, config, bar);

        match position.take() {
            None => {
                // Check entry conditions (AND-combined)
                let all_entry = config.entry_conditions.iter().all(|cond| {
                    evaluate_condition(cond, &current_values, &prev_values)
                });

                let atr_val = resolve_value_from_maps(&atr_alias, &current_values, &prev_values, false);

                if all_entry && !config.entry_conditions.is_empty() && atr_val.map_or(false, |v| v > 0.0) {
                    let atr = atr_val.unwrap();
                    let entry_price = bar.c * fee_mult; // buy at close, pay fee
                    let stop_loss = bar.c - config.stop_loss_atr_multiple * atr;
                    let take_profit = bar.c + config.take_profit_atr_multiple * atr;

                    position = Some(Position {
                        entry_price,
                        entry_bar_idx: i,
                        stop_loss,
                        take_profit,
                        highest_since_entry: bar.c,
                    });
                }
            }
            Some(mut pos) => {
                pos.highest_since_entry = pos.highest_since_entry.max(bar.h);

                // Check stop loss
                if bar.l <= pos.stop_loss {
                    let exit_price = pos.stop_loss * fee_mult;
                    let pnl_pct = (exit_price / pos.entry_price) - 1.0;
                    trades.push(CompletedTrade {
                        entry_price: pos.entry_price,
                        exit_price,
                        entry_bar_idx: pos.entry_bar_idx,
                        exit_bar_idx: i,
                        pnl_pct,
                        exit_reason: ExitReason::StopLoss,
                    });
                    equity *= 1.0 + pnl_pct;
                    bar_returns.push(pnl_pct);
                }
                // Check take profit
                else if bar.h >= pos.take_profit {
                    let exit_price = pos.take_profit * fee_mult;
                    let pnl_pct = (exit_price / pos.entry_price) - 1.0;
                    trades.push(CompletedTrade {
                        entry_price: pos.entry_price,
                        exit_price,
                        entry_bar_idx: pos.entry_bar_idx,
                        exit_bar_idx: i,
                        pnl_pct,
                        exit_reason: ExitReason::TakeProfit,
                    });
                    equity *= 1.0 + pnl_pct;
                    bar_returns.push(pnl_pct);
                }
                // Check signal exit (OR-combined)
                else if config.exit_conditions.iter().any(|cond| {
                    evaluate_condition(cond, &current_values, &prev_values)
                }) {
                    let exit_price = bar.c * fee_mult;
                    let pnl_pct = (exit_price / pos.entry_price) - 1.0;
                    trades.push(CompletedTrade {
                        entry_price: pos.entry_price,
                        exit_price,
                        entry_bar_idx: pos.entry_bar_idx,
                        exit_bar_idx: i,
                        pnl_pct,
                        exit_reason: ExitReason::SignalExit,
                    });
                    equity *= 1.0 + pnl_pct;
                    bar_returns.push(pnl_pct);
                } else {
                    // Still in position
                    position = Some(pos);
                }

                // Update drawdown
                if equity > peak_equity {
                    peak_equity = equity;
                }
                let dd = (equity - peak_equity) / peak_equity;
                if dd < max_drawdown_pct {
                    max_drawdown_pct = dd;
                }
            }
        }

        // Update prev values for next bar
        prev_values = current_values;
    }

    // Close open position at end of data
    if let Some(pos) = position {
        let last_bar = &bars[bars.len() - 1];
        let exit_price = last_bar.c * fee_mult;
        let pnl_pct = (exit_price / pos.entry_price) - 1.0;
        trades.push(CompletedTrade {
            entry_price: pos.entry_price,
            exit_price,
            entry_bar_idx: pos.entry_bar_idx,
            exit_bar_idx: bars.len() - 1,
            pnl_pct,
            exit_reason: ExitReason::EndOfData,
        });
        equity *= 1.0 + pnl_pct;
        bar_returns.push(pnl_pct);

        if equity > peak_equity {
            peak_equity = equity;
        }
        let dd = (equity - peak_equity) / peak_equity;
        if dd < max_drawdown_pct {
            max_drawdown_pct = dd;
        }
    }

    compute_metrics(&trades, config.initial_capital, equity, max_drawdown_pct)
}

/// Snapshot current indicator and price values.
fn snapshot_values(
    registry: &IndicatorRegistry,
    config: &CryptoBacktestConfig,
    bar: &Bar,
) -> AHashMap<String, f64> {
    let mut map = AHashMap::new();

    // Price fields
    map.insert("close".to_string(), bar.c);
    map.insert("open".to_string(), bar.o);
    map.insert("high".to_string(), bar.h);
    map.insert("low".to_string(), bar.l);
    map.insert("volume".to_string(), bar.v);

    // Indicator values
    for def in &config.indicators {
        let alias = def.alias();
        if let Some(val) = registry.get_value(&alias) {
            // RSI outputs 0-1, convert to 0-100 for user conditions
            let val = if alias.to_uppercase().contains("RSI") { val * 100.0 } else { val };
            map.insert(alias.clone(), val);
        }
        // Also snapshot common subfields
        for subfield in &["signal", "histogram", "upper", "lower", "middle"] {
            if let Some(val) = registry.get_subfield_value(&alias, subfield) {
                let key = format!("{}.{}", alias, subfield);
                map.insert(key, val);
            }
        }
    }

    // ATR alias
    let atr_alias = format!("ATR_{}", config.atr_period);
    if let Some(val) = registry.get_value(&atr_alias) {
        map.insert(atr_alias, val);
    }

    map
}

/// Update prev_values after warmup bars (without full snapshot overhead).
fn update_prev_values(
    registry: &IndicatorRegistry,
    config: &CryptoBacktestConfig,
    prev_values: &mut PrevValues,
) {
    prev_values.clear();
    for def in &config.indicators {
        let alias = def.alias();
        if let Some(val) = registry.get_value(&alias) {
            let val = if alias.to_uppercase().contains("RSI") { val * 100.0 } else { val };
            prev_values.insert(alias.clone(), val);
        }
        for subfield in &["signal", "histogram", "upper", "lower", "middle"] {
            if let Some(val) = registry.get_subfield_value(&alias, subfield) {
                let key = format!("{}.{}", alias, subfield);
                prev_values.insert(key, val);
            }
        }
    }
    let atr_alias = format!("ATR_{}", config.atr_period);
    if let Some(val) = registry.get_value(&atr_alias) {
        prev_values.insert(atr_alias, val);
    }
}

/// Resolve a value token to f64.
/// Supports: indicator alias, price fields, numeric literals, subfields (alias.subfield).
fn resolve_value(token: &str, current: &AHashMap<String, f64>) -> Option<f64> {
    // Try direct lookup (alias or price field)
    if let Some(&v) = current.get(token) {
        return Some(v);
    }

    // Try case-insensitive price fields
    let lower = token.to_lowercase();
    if let Some(&v) = current.get(&lower) {
        return Some(v);
    }

    // Try as numeric literal
    if let Ok(v) = token.parse::<f64>() {
        return Some(v);
    }

    // Try subfield: "ALIAS.subfield"
    if let Some(dot_pos) = token.find('.') {
        let alias = &token[..dot_pos];
        let subfield = &token[dot_pos + 1..];
        let key = format!("{}.{}", alias, subfield);
        if let Some(&v) = current.get(&key) {
            return Some(v);
        }
    }

    None
}

/// Resolve value from maps, optionally using prev.
fn resolve_value_from_maps(
    token: &str,
    current: &AHashMap<String, f64>,
    _prev: &AHashMap<String, f64>,
    use_prev: bool,
) -> Option<f64> {
    if use_prev {
        // Try direct lookup in prev
        if let Some(&v) = _prev.get(token) {
            return Some(v);
        }
        let lower = token.to_lowercase();
        if let Some(&v) = _prev.get(&lower) {
            return Some(v);
        }
        if let Ok(v) = token.parse::<f64>() {
            return Some(v);
        }
        if let Some(dot_pos) = token.find('.') {
            let alias = &token[..dot_pos];
            let subfield = &token[dot_pos + 1..];
            let key = format!("{}.{}", alias, subfield);
            if let Some(&v) = _prev.get(&key) {
                return Some(v);
            }
        }
        None
    } else {
        resolve_value(token, current)
    }
}

/// Evaluate a single condition.
fn evaluate_condition(
    cond: &ConditionDef,
    current: &AHashMap<String, f64>,
    prev: &AHashMap<String, f64>,
) -> bool {
    let op = cond.op.to_lowercase();

    match op.as_str() {
        "crossover" => {
            // left crosses above right: prev_left <= prev_right AND curr_left > curr_right
            let curr_left = resolve_value(&cond.left, current);
            let curr_right = resolve_value(&cond.right, current);
            let prev_left = resolve_value_from_maps(&cond.left, current, prev, true);
            let prev_right = resolve_value_from_maps(&cond.right, current, prev, true);

            match (curr_left, curr_right, prev_left, prev_right) {
                (Some(cl), Some(cr), Some(pl), Some(pr)) => pl <= pr && cl > cr,
                _ => false,
            }
        }
        "crossunder" => {
            // left crosses below right: prev_left >= prev_right AND curr_left < curr_right
            let curr_left = resolve_value(&cond.left, current);
            let curr_right = resolve_value(&cond.right, current);
            let prev_left = resolve_value_from_maps(&cond.left, current, prev, true);
            let prev_right = resolve_value_from_maps(&cond.right, current, prev, true);

            match (curr_left, curr_right, prev_left, prev_right) {
                (Some(cl), Some(cr), Some(pl), Some(pr)) => pl >= pr && cl < cr,
                _ => false,
            }
        }
        _ => {
            let left = resolve_value(&cond.left, current);
            let right = resolve_value(&cond.right, current);

            match (left, right) {
                (Some(l), Some(r)) => match op.as_str() {
                    ">" => l > r,
                    "<" => l < r,
                    ">=" => l >= r,
                    "<=" => l <= r,
                    "==" => (l - r).abs() < 1e-10,
                    _ => false,
                },
                _ => false,
            }
        }
    }
}

/// Compute final metrics from completed trades.
fn compute_metrics(
    trades: &[CompletedTrade],
    initial_capital: f64,
    final_equity: f64,
    max_drawdown_pct: f64,
) -> CryptoBacktestResult {
    let num_trades = trades.len() as u32;

    if num_trades == 0 {
        return CryptoBacktestResult {
            max_drawdown_pct,
            ..Default::default()
        };
    }

    let total_return_pct = (final_equity / initial_capital - 1.0) * 100.0;
    let max_drawdown_pct = max_drawdown_pct * 100.0; // convert to percentage

    let wins: Vec<&CompletedTrade> = trades.iter().filter(|t| t.pnl_pct > 0.0).collect();
    let losses: Vec<&CompletedTrade> = trades.iter().filter(|t| t.pnl_pct <= 0.0).collect();

    let win_rate = (wins.len() as f64 / num_trades as f64) * 100.0;

    let gross_profit: f64 = wins.iter().map(|t| t.pnl_pct).sum();
    let gross_loss: f64 = losses.iter().map(|t| t.pnl_pct.abs()).sum();

    let profit_factor = if gross_loss > 0.0 {
        gross_profit / gross_loss
    } else if gross_profit > 0.0 {
        f64::INFINITY
    } else {
        0.0
    };

    let trade_pnls: Vec<f64> = trades.iter().map(|t| t.pnl_pct * 100.0).collect();
    let expectancy_pct = trade_pnls.iter().sum::<f64>() / num_trades as f64;

    let avg_trade_bars = trades.iter().map(|t| (t.exit_bar_idx - t.entry_bar_idx) as f64).sum::<f64>()
        / num_trades as f64;

    // Sharpe ratio (annualized, 365 trading days)
    let sharpe = compute_sharpe(&trade_pnls);

    CryptoBacktestResult {
        total_return_pct,
        max_drawdown_pct,
        win_rate,
        num_trades,
        profit_factor,
        expectancy_pct,
        sharpe,
        avg_trade_bars,
        trade_pnls,
    }
}

/// Annualized Sharpe ratio (assume 365 trading days for crypto).
fn compute_sharpe(trade_pnls_pct: &[f64]) -> f64 {
    if trade_pnls_pct.len() < 2 {
        return 0.0;
    }
    let n = trade_pnls_pct.len() as f64;
    let mean = trade_pnls_pct.iter().sum::<f64>() / n;
    let variance = trade_pnls_pct.iter().map(|r| (r - mean).powi(2)).sum::<f64>() / (n - 1.0);
    let std_dev = variance.sqrt();
    if std_dev < 1e-12 {
        return 0.0;
    }
    (mean / std_dev) * (365.0_f64).sqrt()
}
