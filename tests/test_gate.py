"""Tests for the decision gate."""
import json
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))


def make_trending_bars(n: int = 100, start_price: float = 100.0) -> list[dict]:
    """Generate synthetic uptrending OHLCV bars."""
    bars = []
    price = start_price
    for i in range(n):
        price *= 1.002
        noise = 0.005 * price * ((-1) ** i)
        bars.append({
            "ts": 1700000000 + i * 3600,
            "o": price + noise,
            "h": price * 1.005,
            "l": price * 0.995,
            "c": price - noise,
            "v": 1000000.0,
        })
    return bars


def test_gate_returns_valid_result():
    from agent.gate import validate_strategy
    from agent.strategy import get_strategy_config
    from data.models import Regime, BacktestGateResult

    bars = make_trending_bars(300)
    config = get_strategy_config(Regime.TRENDING_UP)
    result = validate_strategy(json.dumps(bars), json.dumps(config))
    assert isinstance(result, BacktestGateResult)
    assert isinstance(result.passed, bool)
    assert result.num_trades >= 0


def test_gate_rejects_insufficient_trades():
    from agent.gate import validate_strategy
    from agent.strategy import get_strategy_config
    from data.models import Regime

    # Flat data with few bars → few/no trades
    bars = [{"ts": 1700000000 + i * 3600, "o": 100, "h": 100.5, "l": 99.5, "c": 100, "v": 1e6}
            for i in range(40)]
    config = get_strategy_config(Regime.TRENDING_UP)
    result = validate_strategy(json.dumps(bars), json.dumps(config))
    if result.num_trades < 5:
        assert not result.passed
        assert any("Too few trades" in r for r in result.rejection_reasons)


def test_strategy_config_loads_for_all_regimes():
    from agent.strategy import get_strategy_config
    from data.models import Regime

    for regime in Regime:
        config = get_strategy_config(regime)
        assert "indicators" in config
        assert "entry_conditions" in config
        assert "exit_conditions" in config
        assert config["fee_bps"] > 0
