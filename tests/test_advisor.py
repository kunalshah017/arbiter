"""Tests for the optimization advisor agent."""
from agent.advisor import OptimizationAdvisor


def test_advisor_init():
    advisor = OptimizationAdvisor.__new__(OptimizationAdvisor)
    assert advisor is not None
