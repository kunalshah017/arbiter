"""Tests for strategy generator normalization and config conversion."""
from agent.strategy_generator import StrategyGenerator


def test_normalize_variant_valid():
    gen = StrategyGenerator.__new__(StrategyGenerator)
    variant = {"name": "Test", "indicators": [{"type": "EMA", "period": 12}, {"type": "ATR", "period": 14}],
               "entry_conditions": [{"left": "EMA_12", "op": ">", "right": "close"}],
               "exit_conditions": [], "stop_loss_atr_multiple": 1.5, "take_profit_atr_multiple": 3.0}
    result = gen._normalize_variant(variant)
    assert result is not None
    assert result["name"] == "Test"


def test_normalize_variant_adds_atr():
    gen = StrategyGenerator.__new__(StrategyGenerator)
    variant = {"name": "No ATR", "indicators": [{"type": "EMA", "period": 9}],
               "entry_conditions": [{"left": "EMA_9", "op": ">", "right": "close"}],
               "exit_conditions": [], "stop_loss_atr_multiple": 2.0, "take_profit_atr_multiple": 4.0}
    result = gen._normalize_variant(variant)
    assert any(i["type"] == "ATR" for i in result["indicators"])


def test_normalize_variant_rejects_empty():
    gen = StrategyGenerator.__new__(StrategyGenerator)
    assert gen._normalize_variant({}) is None


def test_template_to_config():
    gen = StrategyGenerator.__new__(StrategyGenerator)
    config = gen._template_to_config({"name": "X", "indicators": [{"type": "EMA", "period": 9}],
                                       "entry_conditions": [{"left": "EMA_9", "op": ">", "right": "close"}],
                                       "exit_conditions": [], "stop_loss_atr_multiple": 2.0, "take_profit_atr_multiple": 4.0})
    assert config["fee_bps"] == 50
    assert config["atr_period"] == 14
