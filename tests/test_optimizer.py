"""Tests for the closed-loop strategy optimizer."""
import json
import pytest
from agent.optimizer import StrategyOptimizer, OptimizationResult
from agent.strategy import get_base_template, get_strategy_config
from agent.gate import validate_strategy_detailed
from data.models import Regime


def make_trending_bars(n: int = 200, start_price: float = 100.0) -> list[dict]:
    bars = []
    price = start_price
    for i in range(n):
        price *= 1.002
        noise = 0.005 * price * ((-1) ** i)
        bars.append({"ts": 1700000000 + i * 3600, "o": price + noise,
                      "h": price * 1.005, "l": price * 0.995,
                      "c": price - noise, "v": 1000000.0})
    return bars


def test_get_base_template():
    template = get_base_template(Regime.TRENDING_UP)
    assert "name" in template
    assert "indicators" in template
    assert "entry_conditions" in template


def test_validate_strategy_detailed_returns_tuple():
    bars = make_trending_bars(200)
    config = get_strategy_config(Regime.TRENDING_UP)
    gate_result, raw = validate_strategy_detailed(json.dumps(bars), json.dumps(config))
    assert hasattr(gate_result, "passed")
    assert "num_trades" in raw
    assert "trade_pnls" in raw


def test_optimization_result_creation():
    result = OptimizationResult(
        status="accepted",
        strategy_config={"name": "test"},
        iteration=1,
        total_iterations=3,
    )
    assert result.status == "accepted"
    assert result.iteration == 1
