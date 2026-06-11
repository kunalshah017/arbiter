"""Tests for data transform functions."""
from data.models import OHLCVBar
from data.transforms import binance_klines_to_bars, bars_to_engine_json


def test_binance_klines_to_bars():
    # Binance format: [open_time_ms, open, high, low, close, volume, close_time, ...]
    klines = [
        [1704067200000, "100.0", "105.0", "99.0", "103.0", "5000000.0", 1704070799999, "0", 0, "0", "0", "0"],
        [1704070800000, "103.0", "107.0", "101.0", "106.0", "4000000.0", 1704074399999, "0", 0, "0", "0", "0"],
    ]
    bars = binance_klines_to_bars(klines)
    assert len(bars) == 2
    assert bars[0].ts == 1704067200
    assert bars[0].open == 100.0
    assert bars[0].close == 103.0
    assert bars[0].volume == 5000000.0
    assert bars[1].ts == 1704070800


def test_bars_to_engine_json_format():
    bars = [OHLCVBar(ts=1700000000, open=100, high=105, low=99, close=103, volume=1e6)]
    result = bars_to_engine_json(bars)
    assert result == [{"ts": 1700000000, "o": 100, "h": 105, "l": 99, "c": 103, "v": 1e6}]


def test_empty_klines():
    bars = binance_klines_to_bars([])
    assert bars == []
