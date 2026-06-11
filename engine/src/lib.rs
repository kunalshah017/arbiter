#![allow(non_snake_case)]
use pyo3::prelude::*;

pub mod crypto;
pub mod indicators;

/// Run a crypto spot backtest. Returns JSON result string.
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
