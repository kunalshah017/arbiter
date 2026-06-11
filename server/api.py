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
from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from pydantic import BaseModel
from server.ws import streamer
from server.database import init_db

sys.path.insert(0, str(Path(__file__).parent.parent))


@asynccontextmanager
async def lifespan(app):
    await init_db()
    yield


app = FastAPI(title="Arbiter Dashboard API", lifespan=lifespan)

app.add_middleware(CORSMiddleware, allow_origins=[
                   "http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])

binance = BinanceClient()


@app.websocket("/ws/ohlcv/{symbol}")
async def ws_ohlcv(websocket: WebSocket, symbol: str, interval: str = "1m"):
    await streamer.connect(websocket, symbol.upper(), interval)


class BacktestRequest(BaseModel):
    symbol: str = "BNB"
    regime: str = "trending_up"
    interval: str = "1h"
    limit: int = 720


@app.get("/api/ohlcv/{symbol}")
async def get_ohlcv(symbol: str, interval: str = "1h", limit: int = 200, endTime: int | None = None):
    if endTime:
        import httpx as httpx_client
        params = {"symbol": f"{symbol.upper()}USDT", "interval": interval, "limit": limit, "endTime": endTime}
        async with httpx_client.AsyncClient(timeout=15.0) as http:
            resp = await http.get("https://api.binance.com/api/v3/klines", params=params)
            if resp.status_code == 200:
                from data.transforms import binance_klines_to_bars
                bars_list = binance_klines_to_bars(resp.json())
                return [{"ts": b.ts, "o": b.open, "h": b.high, "l": b.low, "c": b.close, "v": b.volume} for b in bars_list]
        return []
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


def _build_equity_curve(trade_pnls: list[float], initial: float) -> list[float]:
    curve = [initial]
    equity = initial
    for pnl in trade_pnls:
        equity *= (1 + pnl / 100)
        curve.append(equity)
    return curve


@app.post("/api/backtest/detailed")
async def run_backtest_detailed(req: BacktestRequest):
    """Run backtest and return full results including individual trades."""
    try:
        regime = Regime(req.regime)
    except ValueError:
        raise HTTPException(400, f"Invalid regime: {req.regime}")
    bars = await binance.fetch_ohlcv(req.symbol, interval=req.interval, limit=req.limit)
    if not bars or len(bars) < 50:
        raise HTTPException(400, f"Insufficient data for {req.symbol}")
    engine_bars = bars_to_engine_json(bars)
    config = get_strategy_config(regime)

    raw_result = json.loads(crypto_backtest(json.dumps(engine_bars), json.dumps(config)))

    # Build trade details with timestamps from bars
    trades = []
    trade_pnls = raw_result.get("trade_pnls", [])
    avg_bars = raw_result.get("avg_trade_bars", 0)
    warmup = config.get("warmup_bars", 30)

    bar_idx = warmup
    for i, pnl in enumerate(trade_pnls):
        entry_bar = min(bar_idx, len(engine_bars) - 1)
        exit_bar = min(entry_bar + max(int(avg_bars), 1), len(engine_bars) - 1)
        entry_ts = engine_bars[entry_bar]["ts"] if entry_bar < len(engine_bars) else 0
        exit_ts = engine_bars[exit_bar]["ts"] if exit_bar < len(engine_bars) else 0
        entry_price = engine_bars[entry_bar]["c"] if entry_bar < len(engine_bars) else 0
        exit_price = engine_bars[exit_bar]["c"] if exit_bar < len(engine_bars) else 0
        trades.append({
            "id": i + 1,
            "entry_ts": entry_ts,
            "exit_ts": exit_ts,
            "entry_price": entry_price,
            "exit_price": exit_price,
            "pnl_pct": pnl,
            "duration_bars": exit_bar - entry_bar,
        })
        bar_idx = exit_bar + 1

    gate_result = validate_strategy(json.dumps(engine_bars), json.dumps(config))

    return {
        "symbol": req.symbol,
        "regime": req.regime,
        "bars_count": len(bars),
        "bars": engine_bars,
        "passed": gate_result.passed,
        "total_return_pct": gate_result.total_return_pct,
        "max_drawdown_pct": gate_result.max_drawdown_pct,
        "win_rate": gate_result.win_rate,
        "num_trades": gate_result.num_trades,
        "profit_factor": gate_result.profit_factor,
        "expectancy_pct": gate_result.expectancy_pct,
        "rejection_reasons": gate_result.rejection_reasons,
        "trades": trades,
        "trade_pnls": trade_pnls,
        "equity_curve": _build_equity_curve(trade_pnls, config.get("initial_capital", 10000)),
    }


@app.get("/api/portfolio")
async def get_portfolio():
    return {
        "cash_usd": 850.0,
        "total_value_usd": 1000.0,
        "positions": [
            {"symbol": "BNB", "entry_price": 590.0, "quantity": 0.085, "current_price": 600.0, "pnl_pct": 1.69, "stop_loss": 578.0, "take_profit": 640.0},
        ],
        "exposure_pct": 15.0,
        "daily_pnl_pct": 0.42,
    }


@app.get("/api/agent/status")
async def get_agent_status():
    import time
    return {
        "running": False,
        "last_scan_ts": int(time.time()) - 1800,
        "next_scan_ts": int(time.time()) + 1800,
        "current_regime": "trending_up",
        "trades_today": 2,
        "positions_open": 1,
        "portfolio_value_usd": 1000.0,
        "daily_pnl_pct": 0.42,
        "uptime_seconds": 7200,
    }
