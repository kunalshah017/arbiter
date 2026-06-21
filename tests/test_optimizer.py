"""Tests for optimizer module and integration."""
import json
from agent.optimizer import OptimizationResult
from agent.strategy import get_base_template, get_strategy_config
from agent.gate import validate_strategy_detailed
from data.models import Regime


def make_trending_bars(n=200):
    bars = []
    price = 100.0
    for i in range(n):
        price *= 1.002
        noise = 0.005 * price * ((-1) ** i)
        bars.append({"ts": 1700000000 + i * 3600, "o": price + noise,
                    "h": price * 1.005, "l": price * 0.995, "c": price - noise, "v": 1e6})
    return bars


def test_get_base_template():
    t = get_base_template(Regime.TRENDING_UP)
    assert "name" in t and "indicators" in t


def test_validate_strategy_detailed():
    bars = make_trending_bars(200)
    config = get_strategy_config(Regime.TRENDING_UP)
    gate, raw = validate_strategy_detailed(
        json.dumps(bars), json.dumps(config))
    assert hasattr(gate, "passed")
    assert "trade_pnls" in raw


def test_optimization_result():
    r = OptimizationResult(status="accepted", strategy_config={
                           "name": "test"}, iteration=1, total_iterations=3)
    assert r.status == "accepted"
