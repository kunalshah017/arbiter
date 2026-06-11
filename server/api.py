"""FastAPI server exposing backtest engine and live data to the dashboard."""
from data.models import Regime
from agent.gate import validate_strategy
from agent.strategy import get_strategy_config
from data.transforms import bars_to_engine_json
from integrations.binance import BinanceClient
from arbiter._engine import crypto_backtest
import json
import sys
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).parent.parent))


app = FastAPI(title="Arbiter Dashboard API")

app.add_middleware(CORSMiddleware, allow_origins=[
                   "http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])

binance = BinanceClient()


class BacktestRequest(BaseModel):
    symbol: str = "BNB"
    regime: str = "trending_up"
    interval: str = "1h"
    limit: int = 720


@app.get("/api/ohlcv/{symbol}")
async def get_ohlcv(symbol: str, interval: str = "1h", limit: int = 200):
    bars = await binance.fetch_ohlcv(symbol, interval=interval, limit=limit)
    if not bars:
        raise HTTPException(404, f"No data for {symbol}")
    return [{"ts": b.ts, "o": b.open, "h": b.high, "l": b.low, "c": b.close, "v": b.volume} for b in bars]


@app.post("/api/backtest")
async def run_backtest(req: BacktestRequest):
    try:
        regime = Regime(req.regime)
    except ValueError:
        raise HTTPException(400, f"Invalid regime: {req.regime}")
    bars = await binance.fetch_ohlcv(req.symbol, interval=req.interval, limit=req.limit)
    if not bars or len(bars) < 50:
        raise HTTPException(400, f"Insufficient data for {req.symbol}")
    engine_bars = bars_to_engine_json(bars)
    config = get_strategy_config(regime)
    gate_result = validate_strategy(
        json.dumps(engine_bars), json.dumps(config))
    return {
        "symbol": req.symbol, "regime": req.regime, "bars_count": len(bars),
        "passed": gate_result.passed, "total_return_pct": gate_result.total_return_pct,
        "max_drawdown_pct": gate_result.max_drawdown_pct, "win_rate": gate_result.win_rate,
        "num_trades": gate_result.num_trades, "profit_factor": gate_result.profit_factor,
        "expectancy_pct": gate_result.expectancy_pct, "rejection_reasons": gate_result.rejection_reasons,
    }


@app.get("/api/regimes")
async def get_regimes():
    return [r.value for r in Regime]


@app.get("/api/tokens")
async def get_tokens():
    from agent.scanner import load_tradeable_tokens
    return load_tradeable_tokens()


@app.get("/api/scanner/{regime}")
async def scan_tokens(regime: str, top_n: int = 10):
    try:
        r = Regime(regime)
    except ValueError:
        raise HTTPException(400, f"Invalid regime: {regime}")
    from agent.scanner import TokenScanner
    scanner = TokenScanner(binance)
    results = await scanner.scan_and_rank(r, top_n=top_n)
    return [{"symbol": t.symbol, "price": t.price, "volume_24h": t.volume_24h,
             "change_24h_pct": t.change_24h_pct, "momentum_score": t.momentum_score} for t in results]
