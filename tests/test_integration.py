"""Integration tests — requires Rust engine built but no live APIs."""
import json
import sys
from pathlib import Path

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


class TestFullPipeline:
    """Test the full scan → classify → validate → gate pipeline."""

    def test_strategy_config_loads_for_all_regimes(self):
        from agent.strategy import get_strategy_config
        from data.models import Regime

        for regime in Regime:
            config = get_strategy_config(regime)
            assert "indicators" in config
            assert "entry_conditions" in config
            assert "exit_conditions" in config
            assert config["fee_bps"] > 0
            assert config["warmup_bars"] > 0

    def test_gate_with_synthetic_trending_data(self):
        from agent.gate import validate_strategy
        from agent.strategy import get_strategy_config
        from data.models import Regime, BacktestGateResult

        bars = make_trending_bars(300)
        config = get_strategy_config(Regime.TRENDING_UP)

        result = validate_strategy(json.dumps(bars), json.dumps(config))
        assert isinstance(result, BacktestGateResult)
        assert result.num_trades >= 0

    def test_gate_with_flat_data_rejects(self):
        from agent.gate import validate_strategy
        from agent.strategy import get_strategy_config
        from data.models import Regime

        bars = [
            {"ts": 1700000000 + i * 3600, "o": 100,
                "h": 100.5, "l": 99.5, "c": 100, "v": 1e6}
            for i in range(200)
        ]
        config = get_strategy_config(Regime.TRENDING_UP)
        result = validate_strategy(json.dumps(bars), json.dumps(config))
        # Flat data with trending strategy should likely reject (few/no trades)
        if result.num_trades < 5:
            assert not result.passed

    def test_engine_handles_large_dataset(self):
        """Verify engine handles 720 bars (30 days hourly) without crashing."""
        from arbiter._engine import crypto_backtest

        bars = make_trending_bars(720)
        config = {
            "indicators": [
                {"type": "EMA", "period": 9},
                {"type": "EMA", "period": 21},
                {"type": "RSI", "period": 14},
                {"type": "ATR", "period": 14},
            ],
            "entry_conditions": [
                {"left": "EMA_9", "op": ">", "right": "EMA_21"},
                {"left": "RSI_14", "op": ">", "right": "55"},
            ],
            "exit_conditions": [
                {"left": "EMA_9", "op": "<", "right": "EMA_21"},
            ],
            "stop_loss_atr_multiple": 2.0,
            "take_profit_atr_multiple": 4.0,
            "fee_bps": 50,
            "initial_capital": 10000.0,
            "warmup_bars": 30,
            "atr_period": 14,
        }
        result = json.loads(crypto_backtest(
            json.dumps(bars), json.dumps(config)))
        assert result["num_trades"] >= 1
        assert "total_return_pct" in result

    def test_all_strategies_produce_valid_output(self):
        """Every regime strategy should produce valid backtest output, not crash."""
        from agent.gate import validate_strategy
        from agent.strategy import get_strategy_config
        from data.models import Regime

        bars = make_trending_bars(300)
        for regime in Regime:
            config = get_strategy_config(regime)
            result = validate_strategy(json.dumps(bars), json.dumps(config))
            assert result.num_trades >= 0
            assert result.max_drawdown_pct <= 0.0

    def test_portfolio_lifecycle(self):
        """Test opening and closing positions in portfolio."""
        from risk.portfolio import Portfolio, OpenPosition

        p = Portfolio()
        p.cash_usd = 1000.0

        pos = OpenPosition(
            symbol="BNB", entry_price=600.0, quantity=0.1,
            stop_loss=580.0, take_profit=650.0, strategy="test"
        )
        p.open_position(pos)
        assert p.has_position("BNB")
        assert p.num_positions == 1
        assert p.cash_usd < 1000.0

        pnl = p.close_position("BNB", 620.0)
        assert pnl > 0
        assert not p.has_position("BNB")

    def test_transforms_roundtrip(self):
        """Test Binance klines → bars → engine format."""
        from data.transforms import binance_klines_to_bars, bars_to_engine_json

        klines = [
            [1704067200000, "100.0", "105.0", "99.0", "103.0",
                "5000000.0", 1704070799999, "0", 0, "0", "0", "0"],
        ]
        bars = binance_klines_to_bars(klines)
        engine = bars_to_engine_json(bars)
        assert len(engine) == 1
        assert engine[0]["ts"] == 1704067200
        assert engine[0]["o"] == 100.0
