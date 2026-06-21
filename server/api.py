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


class CustomBacktestRequest(BaseModel):
    symbol: str = "BNB"
    interval: str = "1h"
    limit: int = 720
    indicators: list[dict]
    entry_conditions: list[dict]
    exit_conditions: list[dict]
    stop_loss_atr_multiple: float = 2.0
    take_profit_atr_multiple: float = 4.0
    initial_capital: float = 10000.0


class NLStrategyRequest(BaseModel):
    prompt: str


@app.post("/api/strategy/generate")
async def generate_strategy_from_prompt(req: NLStrategyRequest):
    """Use LLM to convert a natural language strategy description into structured config."""
    from agent.strategy_generator import _get_llm_client_and_model, GEMINI_GENERATOR_MODEL, NVIDIA_GENERATOR_MODEL

    client, model = _get_llm_client_and_model(
        NVIDIA_GENERATOR_MODEL, GEMINI_GENERATOR_MODEL)
    if client is None:
        raise HTTPException(
            500, "No LLM API key configured (GOOGLE_API_KEY or NVIDIA_API_KEY)")

    system_prompt = """You are a quantitative trading strategy configuration assistant.
The user will describe a trading strategy in natural language. Convert it into a structured JSON config.

You MUST output ONLY valid JSON with this exact schema:
{
  "indicators": [{"type": "EMA"|"RSI"|"ATR"|"BBands", "period": <int>, "std_dev": <float optional>}],
  "entry_conditions": [{"left": "<signal>", "op": ">"|"<"|">="|"<="|"crossover"|"crossunder", "right": "<signal_or_number>"}],
  "exit_conditions": [{"left": "<signal>", "op": ">"|"<"|">="|"<="|"crossover"|"crossunder", "right": "<signal_or_number>"}],
  "stop_loss_atr_multiple": <float>,
  "take_profit_atr_multiple": <float>
}

Signal naming rules:
- EMA with period 9 → "EMA_9"
- RSI with period 14 → "RSI_14"
- ATR with period 14 → "ATR_14"
- BBands with period 20 → "BBANDS_20.upper", "BBANDS_20.middle", "BBANDS_20.lower"
- Price values: "close", "open", "high", "low"
- Numeric thresholds are strings: "55", "30", "70"

Examples:
- "Buy when fast EMA crosses above slow EMA and RSI is above 50" →
  indicators: EMA 9, EMA 21, RSI 14, ATR 14
  entry: EMA_9 crossover EMA_21, RSI_14 > 50
  exit: EMA_9 crossunder EMA_21

- "Mean reversion: buy when price is below lower bollinger band and RSI oversold" →
  indicators: BBands 20, RSI 14, ATR 14
  entry: close < BBANDS_20.lower, RSI_14 < 30
  exit: close > BBANDS_20.middle, RSI_14 > 50

Always include ATR indicator (needed for stop/take profit). Output ONLY the JSON object, no markdown fences or explanation."""

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": req.prompt},
            ],
            temperature=0.3,
            max_tokens=1000,
        )
        content = response.choices[0].message.content.strip()
        # Strip markdown fences if present
        if content.startswith("```"):
            content = content.split(
                "\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()

        config = json.loads(content)

        # Validate required fields
        required = ["indicators", "entry_conditions", "exit_conditions"]
        for field in required:
            if field not in config or not isinstance(config[field], list) or len(config[field]) == 0:
                raise ValueError(f"Missing or empty field: {field}")

        # Ensure defaults
        config.setdefault("stop_loss_atr_multiple", 2.0)
        config.setdefault("take_profit_atr_multiple", 4.0)

        return config
    except json.JSONDecodeError:
        raise HTTPException(
            422, "LLM returned invalid JSON. Try rephrasing your strategy.")
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(500, f"LLM error: {str(e)}")


@app.get("/api/ohlcv/{symbol}")
async def get_ohlcv(symbol: str, interval: str = "1h", limit: int = 200, endTime: int | None = None):
    if endTime:
        import httpx as httpx_client
        params = {"symbol": f"{symbol.upper()}USDT", "interval": interval,
                  "limit": limit, "endTime": endTime}
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


# Ensure we fetch enough bars for meaningful backtests per interval
INTERVAL_MIN_BARS = {"1m": 1000, "5m": 1000,
                     "15m": 720, "1h": 720, "4h": 500, "1d": 365}


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
    effective_limit = max(req.limit, INTERVAL_MIN_BARS.get(req.interval, 720))
    bars = await binance.fetch_ohlcv(req.symbol, interval=req.interval, limit=effective_limit)
    if not bars or len(bars) < 50:
        raise HTTPException(400, f"Insufficient data for {req.symbol}")
    engine_bars = bars_to_engine_json(bars)
    config = get_strategy_config(regime)

    raw_result = json.loads(crypto_backtest(
        json.dumps(engine_bars), json.dumps(config)))

    # Build trade details with timestamps from bars
    trades = []
    trade_pnls = raw_result.get("trade_pnls", [])
    avg_bars = raw_result.get("avg_trade_bars", 0)
    warmup = config.get("warmup_bars", 30)

    bar_idx = warmup
    for i, pnl in enumerate(trade_pnls):
        entry_bar = min(bar_idx, len(engine_bars) - 1)
        exit_bar = min(entry_bar + max(int(avg_bars), 1), len(engine_bars) - 1)
        entry_ts = engine_bars[entry_bar]["ts"] if entry_bar < len(
            engine_bars) else 0
        exit_ts = engine_bars[exit_bar]["ts"] if exit_bar < len(
            engine_bars) else 0
        entry_price = engine_bars[entry_bar]["c"] if entry_bar < len(
            engine_bars) else 0
        exit_price = engine_bars[exit_bar]["c"] if exit_bar < len(
            engine_bars) else 0
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

    gate_result = validate_strategy(
        json.dumps(engine_bars), json.dumps(config))

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


@app.post("/api/backtest/custom")
async def run_custom_backtest(req: CustomBacktestRequest):
    """Run backtest with a user-defined custom strategy config."""
    effective_limit = max(req.limit, INTERVAL_MIN_BARS.get(req.interval, 720))
    bars = await binance.fetch_ohlcv(req.symbol, interval=req.interval, limit=effective_limit)
    if not bars or len(bars) < 50:
        raise HTTPException(400, f"Insufficient data for {req.symbol}")
    engine_bars = bars_to_engine_json(bars)

    config = {
        "indicators": req.indicators,
        "entry_conditions": req.entry_conditions,
        "exit_conditions": req.exit_conditions,
        "stop_loss_atr_multiple": req.stop_loss_atr_multiple,
        "take_profit_atr_multiple": req.take_profit_atr_multiple,
        "fee_bps": 50,
        "initial_capital": req.initial_capital,
        "warmup_bars": 30,
        "atr_period": 14,
    }

    raw_result = json.loads(crypto_backtest(
        json.dumps(engine_bars), json.dumps(config)))

    trades = []
    trade_pnls = raw_result.get("trade_pnls", [])
    avg_bars = raw_result.get("avg_trade_bars", 0)
    warmup = config.get("warmup_bars", 30)

    bar_idx = warmup
    for i, pnl in enumerate(trade_pnls):
        entry_bar = min(bar_idx, len(engine_bars) - 1)
        exit_bar = min(entry_bar + max(int(avg_bars), 1), len(engine_bars) - 1)
        entry_ts = engine_bars[entry_bar]["ts"] if entry_bar < len(
            engine_bars) else 0
        exit_ts = engine_bars[exit_bar]["ts"] if exit_bar < len(
            engine_bars) else 0
        entry_price = engine_bars[entry_bar]["c"] if entry_bar < len(
            engine_bars) else 0
        exit_price = engine_bars[exit_bar]["c"] if exit_bar < len(
            engine_bars) else 0
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

    gate_result = validate_strategy(
        json.dumps(engine_bars), json.dumps(config))

    return {
        "symbol": req.symbol,
        "strategy_name": "Custom Strategy",
        "strategy_config": config,
        "bars_count": len(bars),
        "bars": engine_bars,
        "passed": gate_result.passed,
        "status": "accepted" if gate_result.passed else "best_effort",
        "iteration": 1,
        "total_iterations": 1,
        "total_return_pct": gate_result.total_return_pct,
        "max_drawdown_pct": gate_result.max_drawdown_pct,
        "win_rate": gate_result.win_rate,
        "num_trades": gate_result.num_trades,
        "profit_factor": gate_result.profit_factor,
        "expectancy_pct": gate_result.expectancy_pct,
        "rejection_reasons": gate_result.rejection_reasons,
        "trades": trades,
        "trade_pnls": trade_pnls,
        "equity_curve": _build_equity_curve(trade_pnls, req.initial_capital),
    }


async def get_portfolio():
    return {
        "cash_usd": 850.0,
        "total_value_usd": 1000.0,
        "positions": [
            {"symbol": "BNB", "entry_price": 590.0, "quantity": 0.085, "current_price": 600.0,
                "pnl_pct": 1.69, "stop_loss": 578.0, "take_profit": 640.0},
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


@app.post("/api/optimize")
async def run_optimization(req: BacktestRequest):
    """Run the strategy optimization loop for a symbol."""
    from agent.optimizer import StrategyOptimizer
    try:
        regime = Regime(req.regime)
    except ValueError:
        raise HTTPException(400, f"Invalid regime: {req.regime}")
    bars = await binance.fetch_ohlcv(req.symbol, interval=req.interval, limit=req.limit)
    if not bars or len(bars) < 50:
        raise HTTPException(400, f"Insufficient data for {req.symbol}")
    engine_bars = bars_to_engine_json(bars)
    optimizer = StrategyOptimizer()
    result = optimizer.optimize(regime, json.dumps(engine_bars))
    return {
        "status": result.status,
        "iteration": result.iteration,
        "total_iterations": result.total_iterations,
        "strategy_name": result.strategy_config.get("name") if result.strategy_config else None,
        "passed": result.gate_result.passed if result.gate_result else False,
        "total_return_pct": result.gate_result.total_return_pct if result.gate_result else 0,
        "max_drawdown_pct": result.gate_result.max_drawdown_pct if result.gate_result else 0,
        "win_rate": result.gate_result.win_rate if result.gate_result else 0,
        "num_trades": result.gate_result.num_trades if result.gate_result else 0,
        "profit_factor": result.gate_result.profit_factor if result.gate_result else 0,
        "expectancy_pct": result.gate_result.expectancy_pct if result.gate_result else 0,
        "rejection_reasons": result.gate_result.rejection_reasons if result.gate_result else [],
        "all_attempts": result.all_attempts,
        "last_feedback": result.last_feedback,
        "strategy_config": result.strategy_config,
    }
