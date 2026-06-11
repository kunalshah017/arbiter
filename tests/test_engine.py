"""Tests for the Rust crypto backtest engine."""
import json
import pytest

from arbiter._engine import crypto_backtest


def _make_trending_bars(n=200, start_price=100.0, trend=0.005):
    """Generate upward-trending OHLCV bars."""
    bars = []
    price = start_price
    for i in range(n):
        price *= (1.0 + trend)
        bars.append({
            "ts": 1700000000 + i * 3600,
            "o": price * 0.998,
            "h": price * 1.01,
            "l": price * 0.99,
            "c": price,
            "v": 1000.0 + i * 10,
        })
    return bars


def _make_config(fee_bps=30):
    """Standard config with RSI + EMA crossover entry."""
    return {
        "indicators": [
            {"type": "RSI", "period": 14},
            {"type": "EMA", "period": 10, "alias": "EMA_10"},
            {"type": "EMA", "period": 20, "alias": "EMA_20"},
            {"type": "ATR", "period": 14},
        ],
        "entry_conditions": [
            {"left": "RSI_14", "op": ">", "right": "30"},
            {"left": "EMA_10", "op": ">", "right": "EMA_20"},
        ],
        "exit_conditions": [
            {"left": "RSI_14", "op": ">", "right": "70"},
        ],
        "stop_loss_atr_multiple": 2.0,
        "take_profit_atr_multiple": 4.0,
        "fee_bps": fee_bps,
        "initial_capital": 10000.0,
        "warmup_bars": 30,
        "atr_period": 14,
    }


def test_returns_valid_json():
    """Trending bars → valid result JSON with all fields."""
    bars = _make_trending_bars()
    config = _make_config()
    result_json = crypto_backtest(json.dumps(bars), json.dumps(config))
    result = json.loads(result_json)

    expected_fields = [
        "total_return_pct", "max_drawdown_pct", "win_rate",
        "num_trades", "profit_factor", "expectancy_pct",
        "sharpe", "avg_trade_bars", "trade_pnls",
    ]
    for field in expected_fields:
        assert field in result, f"Missing field: {field}"


def test_trending_market_produces_trades():
    """200 trending bars → at least 1 trade."""
    bars = _make_trending_bars(200)
    config = _make_config()
    result = json.loads(crypto_backtest(json.dumps(bars), json.dumps(config)))
    assert result["num_trades"] >= 1, f"Expected trades, got {result['num_trades']}"


def test_empty_bars_returns_zero():
    """Empty bars → 0 trades, 0 return."""
    config = _make_config()
    result = json.loads(crypto_backtest("[]", json.dumps(config)))
    assert result["num_trades"] == 0
    assert result["total_return_pct"] == 0.0


def test_fees_reduce_returns():
    """Compare 0 fee vs 100bps fee — fees should reduce returns."""
    bars = _make_trending_bars(200)
    config_no_fee = _make_config(fee_bps=0)
    config_high_fee = _make_config(fee_bps=100)

    result_no_fee = json.loads(crypto_backtest(json.dumps(bars), json.dumps(config_no_fee)))
    result_high_fee = json.loads(crypto_backtest(json.dumps(bars), json.dumps(config_high_fee)))

    # Only compare if both produce trades
    if result_no_fee["num_trades"] > 0 and result_high_fee["num_trades"] > 0:
        assert result_no_fee["total_return_pct"] >= result_high_fee["total_return_pct"]


def test_invalid_bars_json_raises():
    """Invalid JSON → ValueError."""
    config = _make_config()
    with pytest.raises(ValueError):
        crypto_backtest("not valid json", json.dumps(config))


def test_invalid_config_json_raises():
    """Invalid config → ValueError."""
    bars = _make_trending_bars(10)
    with pytest.raises(ValueError):
        crypto_backtest(json.dumps(bars), "not valid json")


def test_max_drawdown_is_negative_or_zero():
    """Max drawdown should be <= 0."""
    bars = _make_trending_bars(200)
    config = _make_config()
    result = json.loads(crypto_backtest(json.dumps(bars), json.dumps(config)))
    assert result["max_drawdown_pct"] <= 0.0
