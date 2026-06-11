"""Tests for token scanner ranking."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from agent.scanner import TokenScanner, load_tradeable_tokens
from data.models import Regime, TokenScore


def test_load_tradeable_tokens():
    tokens = load_tradeable_tokens()
    assert len(tokens) > 20
    assert "USDT" not in tokens
    assert "USDC" not in tokens
    assert "BNB" in tokens
    assert "ETH" in tokens


def test_momentum_score_trending_up_favors_gainers():
    scanner = TokenScanner.__new__(TokenScanner)
    gainer = scanner._compute_momentum_score(
        "BNB",
        {"lastPrice": "600", "quoteVolume": "1000000000", "priceChangePercent": "5.0"},
        Regime.TRENDING_UP,
    )
    loser = scanner._compute_momentum_score(
        "ETH",
        {"lastPrice": "3000", "quoteVolume": "1000000000", "priceChangePercent": "-3.0"},
        Regime.TRENDING_UP,
    )
    assert gainer is not None
    assert loser is not None
    assert gainer.momentum_score > loser.momentum_score


def test_momentum_score_mean_reverting_favors_oversold():
    scanner = TokenScanner.__new__(TokenScanner)
    oversold = scanner._compute_momentum_score(
        "X",
        {"lastPrice": "10", "quoteVolume": "100000000", "priceChangePercent": "-8.0"},
        Regime.MEAN_REVERTING,
    )
    overbought = scanner._compute_momentum_score(
        "Y",
        {"lastPrice": "10", "quoteVolume": "100000000", "priceChangePercent": "5.0"},
        Regime.MEAN_REVERTING,
    )
    assert oversold.momentum_score > overbought.momentum_score


def test_filters_low_liquidity():
    scanner = TokenScanner.__new__(TokenScanner)
    result = scanner._compute_momentum_score(
        "DUST",
        {"lastPrice": "0.001", "quoteVolume": "100", "priceChangePercent": "50"},
        Regime.TRENDING_UP,
    )
    assert result is None
