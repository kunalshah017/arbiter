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
    """Get Rust engine backtest config for the given regime."""
    strategies = _load_strategies()
    strategy = strategies.get(regime.value)
    if strategy is None:
        strategy = strategies["choppy"]

    return {
        "indicators": strategy["indicators"],
        "entry_conditions": strategy["entry_conditions"],
        "exit_conditions": strategy["exit_conditions"],
        "stop_loss_atr_multiple": strategy.get("stop_loss_atr_multiple", 2.0),
        "take_profit_atr_multiple": strategy.get("take_profit_atr_multiple", 4.0),
        "fee_bps": 50,
        "initial_capital": 10000.0,
        "warmup_bars": 30,
        "atr_period": 14,
    }
