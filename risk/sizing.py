"""Position sizing calculator."""
from config.settings import settings


def calculate_position_size(
    portfolio_value: float,
    expected_return_pct: float,
    max_drawdown_pct: float,
) -> float:
    """Calculate position size as USD amount.

    Uses a simplified Kelly-fraction approach capped by max_position_pct.
    """
    max_size = portfolio_value * (settings.max_position_pct / 100.0)

    if max_drawdown_pct >= 0:
        return max_size

    kelly_fraction = expected_return_pct / abs(max_drawdown_pct)
    kelly_fraction = min(kelly_fraction, 1.0)
    kelly_fraction = max(kelly_fraction, 0.3)

    size = max_size * kelly_fraction
    return round(size, 2)
