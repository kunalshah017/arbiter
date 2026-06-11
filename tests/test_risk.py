"""Tests for risk management."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from risk.sizing import calculate_position_size
from risk.guardrails import Guardrails


def test_position_size_capped_at_max():
    size = calculate_position_size(portfolio_value=10000, expected_return_pct=10.0, max_drawdown_pct=-5.0)
    assert size <= 500.0
    assert size > 0


def test_position_size_scales_with_confidence():
    high_conf = calculate_position_size(10000, 8.0, -4.0)
    low_conf = calculate_position_size(10000, 2.0, -10.0)
    assert high_conf >= low_conf


def test_guardrails_allows_trading_initially():
    g = Guardrails()
    g.set_initial_value(1000.0)
    allowed, reason = g.can_trade(1000.0)
    assert allowed
    assert reason == ""


def test_guardrails_blocks_on_competition_dd():
    g = Guardrails()
    g.set_initial_value(1000.0)
    allowed, reason = g.can_trade(740.0)
    assert not allowed
    assert "DD cap" in reason


def test_guardrails_blocks_on_daily_dd():
    g = Guardrails()
    g.set_initial_value(1000.0)
    allowed, reason = g.can_trade(910.0)
    assert not allowed
    assert "Daily DD halt" in reason


def test_guardrails_exposure_check():
    g = Guardrails()
    allowed, _ = g.check_exposure(55.0, 10.0)
    assert not allowed

    allowed, _ = g.check_exposure(40.0, 10.0)
    assert allowed
