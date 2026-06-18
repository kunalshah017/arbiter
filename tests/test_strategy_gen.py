"""Tests for strategy generator agent."""
import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from agent.strategy_generator import StrategyGenerator


def test_normalize_variant_valid():
    gen = StrategyGenerator.__new__(StrategyGenerator)
    variant = {
        "name": "Test Variant",
        "indicators": [
            {"type": "EMA", "period": 12},
            {"type": "RSI", "period": 14},
            {"type": "ATR", "period": 14},
        ],
        "entry_conditions": [{"left": "EMA_12", "op": ">", "right": "close"}],
        "exit_conditions": [{"left": "RSI_14", "op": "<", "right": "30"}],
        "stop_loss_atr_multiple": 1.5,
        "take_profit_atr_multiple": 3.0,
    }
    result = gen._normalize_variant(variant)
    assert result is not None
    assert result["name"] == "Test Variant"
    assert result["fee_bps"] == 50
    assert result["warmup_bars"] == 30


def test_normalize_variant_adds_atr():
    gen = StrategyGenerator.__new__(StrategyGenerator)
    variant = {
        "name": "No ATR",
        "indicators": [{"type": "EMA", "period": 9}],
        "entry_conditions": [{"left": "EMA_9", "op": ">", "right": "close"}],
        "exit_conditions": [],
        "stop_loss_atr_multiple": 2.0,
        "take_profit_atr_multiple": 4.0,
    }
    result = gen._normalize_variant(variant)
    assert result is not None
    atr_indicators = [i for i in result["indicators"] if i["type"] == "ATR"]
    assert len(atr_indicators) >= 1


def test_normalize_variant_rejects_empty():
    gen = StrategyGenerator.__new__(StrategyGenerator)
    assert gen._normalize_variant({}) is None
    assert gen._normalize_variant({"indicators": []}) is None


def test_template_to_config():
    gen = StrategyGenerator.__new__(StrategyGenerator)
    template = {
        "name": "Momentum",
        "indicators": [{"type": "EMA", "period": 9}],
        "entry_conditions": [{"left": "EMA_9", "op": ">", "right": "close"}],
        "exit_conditions": [],
        "stop_loss_atr_multiple": 2.0,
        "take_profit_atr_multiple": 4.0,
    }
    config = gen._template_to_config(template)
    assert config["fee_bps"] == 50
    assert config["warmup_bars"] == 30
    assert config["atr_period"] == 14
