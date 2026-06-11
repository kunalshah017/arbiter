"""Transform Binance API responses into engine-compatible formats."""
from data.models import OHLCVBar


def binance_klines_to_bars(klines: list[list]) -> list[OHLCVBar]:
    """Convert Binance klines response to OHLCVBar list.

    Binance kline format: [open_time, open, high, low, close, volume, close_time, ...]
    """
    bars = []
    for k in klines:
        bar = OHLCVBar(
            ts=int(k[0]) // 1000,  # ms to seconds
            open=float(k[1]),
            high=float(k[2]),
            low=float(k[3]),
            close=float(k[4]),
            volume=float(k[5]),
        )
        bars.append(bar)
    return bars


def bars_to_engine_json(bars: list[OHLCVBar]) -> list[dict]:
    """Convert bars to Rust engine input format."""
    return [bar.to_engine_dict() for bar in bars]
