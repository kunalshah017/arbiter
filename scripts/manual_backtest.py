"""Manual backtest script: test the full pipeline with a specific token."""
from data.models import Regime
from agent.gate import validate_strategy
from agent.strategy import get_strategy_config
from data.transforms import bars_to_engine_json
from integrations.binance import BinanceClient
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))


async def main():
    symbol = sys.argv[1] if len(sys.argv) > 1 else "BNB"
    regime_str = sys.argv[2] if len(sys.argv) > 2 else "trending_up"
    regime = Regime(regime_str)

    print(f"Running backtest for {symbol} with regime={regime.value}")
    print("-" * 60)

    binance = BinanceClient()
    bars = await binance.fetch_ohlcv(symbol, interval="1h", limit=720)
    print(f"Fetched {len(bars)} bars from Binance")

    if len(bars) < 50:
        print("ERROR: Not enough bars for backtest")
        await binance.close()
        return

    config = get_strategy_config(regime)
    print(f"Strategy: {regime.value}")
    print(f"Indicators: {[i['type'] for i in config['indicators']]}")

    engine_bars = bars_to_engine_json(bars)
    result = validate_strategy(json.dumps(engine_bars), json.dumps(config))

    print(f"\n{'='*60}")
    print(f"GATE: {'✓ PASSED' if result.passed else '✗ REJECTED'}")
    print(f"{'='*60}")
    print(f"Total Return:  {result.total_return_pct:+.2f}%")
    print(f"Max Drawdown:  {result.max_drawdown_pct:.2f}%")
    print(f"Win Rate:      {result.win_rate:.1f}%")
    print(f"Trades:        {result.num_trades}")
    print(f"Profit Factor: {result.profit_factor:.2f}")
    print(f"Expectancy:    {result.expectancy_pct:+.2f}%")

    if not result.passed:
        print(f"\nRejection reasons:")
        for r in result.rejection_reasons:
            print(f"  - {r}")

    await binance.close()


if __name__ == "__main__":
    asyncio.run(main())
