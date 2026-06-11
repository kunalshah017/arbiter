# Dashboard Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance Arbiter with persistent database, realtime streaming, detailed backtest visualization with trade markers, portfolio/agent monitoring, and a striking neobrutalism landing page.

**Architecture:** SQLite for dev + PostgreSQL in Docker for production (shared schema via SQLAlchemy async); WebSocket streaming via FastAPI for realtime OHLCV; lightweight-charts markers for trade visualization; landing page as separate route in the dashboard SPA with animated sections and feature showcase.

**Tech Stack:** FastAPI (WebSocket + REST), SQLAlchemy async + aiosqlite/asyncpg, PostgreSQL (Docker), lightweight-charts (markers, line series), React, React Router, Tailwind CSS, Framer Motion (animations), neobrutalism design tokens.

---

## File Structure

```
server/
├── api.py                          # Modify: add WebSocket, trade history, portfolio, agent status
├── ws.py                           # Create: WebSocket manager for realtime OHLCV
├── database.py                     # Create: SQLAlchemy async engine + session factory
├── models.py                       # Create: ORM models (trades, positions, snapshots, ohlcv_cache)
├── crud.py                         # Create: DB read/write operations

docker-compose.yml                  # Modify: add PostgreSQL service with volume persistence

dashboard/src/
├── components/
│   ├── OHLCVChart.tsx              # Modify: infinite scroll + realtime streaming
│   ├── BacktestPanel.tsx           # Modify: add trade list + chart with markers
│   ├── BacktestChart.tsx           # Create: OHLCV chart with entry/exit markers overlay
│   ├── TradeTable.tsx              # Create: sortable trade history table
│   ├── EquityCurve.tsx             # Create: equity curve line chart
│   ├── PortfolioPanel.tsx          # Create: portfolio positions + value
│   ├── AgentStatus.tsx             # Create: agent running status + metrics
│   └── __tests__/
│       ├── BacktestChart.test.tsx  # Create: marker rendering tests
│       ├── TradeTable.test.tsx     # Create: table rendering tests
│       └── PortfolioPanel.test.tsx # Create: portfolio display tests
├── pages/
│   ├── Landing.tsx                 # Create: neobrutalism landing page
│   └── Dashboard.tsx               # Create: extracted from current App.tsx
├── hooks/
│   └── useWebSocket.ts            # Create: WebSocket hook for realtime data
├── App.tsx                         # Modify: add React Router (Landing + Dashboard routes)
```

---

### Task 1: FastAPI — New Endpoints (Backtest Trades, Portfolio, Agent Status)

**Files:**

- Modify: `server/api.py`

- [ ] **Step 1: Add backtest endpoint that returns individual trades**

Add a new `/api/backtest/detailed` endpoint that returns the full backtest result including individual trade P&Ls with bar indices (needed for chart markers).

```python
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

    import json as json_mod
    from arbiter._engine import crypto_backtest
    raw_result = json_mod.loads(crypto_backtest(json_mod.dumps(engine_bars), json_mod.dumps(config)))

    # Build trade details with timestamps from bars
    trades = []
    trade_pnls = raw_result.get("trade_pnls", [])
    # The engine doesn't return entry/exit bar indices directly in JSON,
    # so we reconstruct approximate trade positions from the result
    num_trades = raw_result.get("num_trades", 0)
    avg_bars = raw_result.get("avg_trade_bars", 0)
    warmup = config.get("warmup_bars", 30)

    # Approximate trade positions based on avg duration
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

    gate_result = validate_strategy(json_mod.dumps(engine_bars), json_mod.dumps(config))

    return {
        "symbol": req.symbol,
        "regime": req.regime,
        "bars_count": len(bars),
        "bars": engine_bars,  # Full OHLCV for chart rendering
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


def _build_equity_curve(trade_pnls: list[float], initial: float) -> list[float]:
    """Build equity curve from trade P&Ls."""
    curve = [initial]
    equity = initial
    for pnl in trade_pnls:
        equity *= (1 + pnl / 100)
        curve.append(equity)
    return curve
```

- [ ] **Step 2: Add portfolio endpoint**

```python
@app.get("/api/portfolio")
async def get_portfolio():
    """Get current portfolio state (mock for dashboard testing)."""
    return {
        "cash_usd": 850.0,
        "total_value_usd": 1000.0,
        "positions": [
            {"symbol": "BNB", "entry_price": 590.0, "quantity": 0.085, "current_price": 600.0, "pnl_pct": 1.69, "stop_loss": 578.0, "take_profit": 640.0},
        ],
        "exposure_pct": 15.0,
        "daily_pnl_pct": 0.42,
    }
```

- [ ] **Step 3: Add agent status endpoint**

```python
@app.get("/api/agent/status")
async def get_agent_status():
    """Get agent running status."""
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
```

- [ ] **Step 4: Verify new endpoints work**

```bash
cd /Users/kunal/arbiter && source .venv/bin/activate
python -c "
from fastapi.testclient import TestClient
from server.api import app
c = TestClient(app)
print('detailed:', c.post('/api/backtest/detailed', json={'symbol':'BNB','regime':'trending_up','limit':200}).status_code)
print('portfolio:', c.get('/api/portfolio').status_code)
print('status:', c.get('/api/agent/status').status_code)
"
```

Expected: all 200.

- [ ] **Step 5: Commit**

```bash
git add server/api.py && git commit -m "feat(api): add detailed backtest, portfolio, agent status endpoints"
```

---

### Task 2: WebSocket — Realtime OHLCV Streaming

**Files:**

- Create: `server/ws.py`
- Modify: `server/api.py` (mount WebSocket)

- [ ] **Step 1: Create WebSocket manager**

Create `server/ws.py`:

```python
"""WebSocket endpoint for realtime OHLCV streaming."""
import asyncio
import json
import time
from fastapi import WebSocket, WebSocketDisconnect
import httpx


class OHLCVStreamer:
    """Streams realtime kline updates from Binance WebSocket to connected clients."""

    def __init__(self):
        self._clients: dict[str, list[WebSocket]] = {}  # symbol -> [ws, ...]
        self._binance_tasks: dict[str, asyncio.Task] = {}

    async def connect(self, websocket: WebSocket, symbol: str, interval: str = "1m"):
        """Accept client and start streaming for this symbol."""
        await websocket.accept()
        key = f"{symbol}_{interval}"
        if key not in self._clients:
            self._clients[key] = []
        self._clients[key].append(websocket)

        # Start Binance WS feed if not already running
        if key not in self._binance_tasks:
            self._binance_tasks[key] = asyncio.create_task(
                self._stream_binance(symbol, interval, key)
            )

        try:
            while True:
                # Keep connection alive, handle client messages (ping/config)
                await websocket.receive_text()
        except WebSocketDisconnect:
            self._clients[key].remove(websocket)
            if not self._clients[key]:
                # No more clients, cancel Binance stream
                self._binance_tasks[key].cancel()
                del self._binance_tasks[key]
                del self._clients[key]

    async def _stream_binance(self, symbol: str, interval: str, key: str):
        """Connect to Binance kline WebSocket and forward to clients."""
        pair = f"{symbol.lower()}usdt"
        url = f"wss://stream.binance.com:9443/ws/{pair}@kline_{interval}"

        while True:
            try:
                async with httpx.AsyncClient() as _:
                    import websockets
                    async with websockets.connect(url) as ws:
                        async for msg in ws:
                            data = json.loads(msg)
                            kline = data.get("k", {})
                            bar = {
                                "ts": kline["t"] // 1000,
                                "o": float(kline["o"]),
                                "h": float(kline["h"]),
                                "l": float(kline["l"]),
                                "c": float(kline["c"]),
                                "v": float(kline["v"]),
                                "closed": kline["x"],
                            }
                            # Broadcast to all connected clients
                            for client in list(self._clients.get(key, [])):
                                try:
                                    await client.send_json(bar)
                                except Exception:
                                    pass
            except asyncio.CancelledError:
                break
            except Exception:
                await asyncio.sleep(5)  # Reconnect after 5s


streamer = OHLCVStreamer()
```

- [ ] **Step 2: Mount WebSocket in api.py**

Add to `server/api.py`:

```python
from fastapi import WebSocket
from server.ws import streamer

@app.websocket("/ws/ohlcv/{symbol}")
async def ws_ohlcv(websocket: WebSocket, symbol: str, interval: str = "1m"):
    """WebSocket endpoint for realtime OHLCV streaming."""
    await streamer.connect(websocket, symbol.upper(), interval)
```

- [ ] **Step 3: Commit**

```bash
git add server/ && git commit -m "feat(api): WebSocket realtime OHLCV streaming via Binance"
```

---

### Task 3: Chart — Infinite Historical Scroll + Realtime Updates

**Files:**

- Create: `dashboard/src/hooks/useWebSocket.ts`
- Modify: `dashboard/src/components/OHLCVChart.tsx`

- [ ] **Step 1: Create WebSocket hook**

Create `dashboard/src/hooks/useWebSocket.ts`:

```typescript
import { useEffect, useRef, useCallback } from "react";

interface UseWebSocketOptions {
  url: string;
  onMessage: (data: any) => void;
  enabled?: boolean;
}

export function useWebSocket({
  url,
  onMessage,
  enabled = true,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!enabled) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}${url}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessageRef.current(data);
      } catch {}
    };

    ws.onclose = () => {
      // Reconnect after 3s
      setTimeout(() => {
        if (wsRef.current === ws) wsRef.current = null;
      }, 3000);
    };

    wsRef.current = ws;
    return () => {
      ws.close();
    };
  }, [url, enabled]);

  const send = useCallback((data: any) => {
    wsRef.current?.send(JSON.stringify(data));
  }, []);

  return { send };
}
```

- [ ] **Step 2: Update OHLCVChart with infinite scroll + realtime**

Replace `dashboard/src/components/OHLCVChart.tsx` with:

- On `visibleTimeRangeChange`: when user scrolls to the left edge, fetch older bars and prepend
- WebSocket subscription: update the last candle in realtime or append new closed candle
- Track `oldestTs` to know what to fetch next

Key additions to the existing component:

```typescript
// Add to state
const [oldestTs, setOldestTs] = useState<number>(0);
const [loadingMore, setLoadingMore] = useState(false);

// Infinite scroll: fetch older data when user scrolls left
const handleVisibleRangeChange = useCallback(
  async (range: any) => {
    if (!range || loadingMore || bars.length === 0) return;
    const firstVisibleTime = range.from;
    const firstBarTime = bars[0]?.ts;
    // If user is near the left edge (within 10 bars), load more
    if (firstVisibleTime <= firstBarTime + 10 * 3600) {
      setLoadingMore(true);
      const before = bars[0].ts;
      const resp = await fetch(
        `/api/ohlcv/${symbol}?interval=${interval}&limit=300&endTime=${before * 1000}`,
      );
      if (resp.ok) {
        const olderBars = await resp.json();
        if (olderBars.length > 0) {
          setBars((prev) => [...olderBars, ...prev]);
        }
      }
      setLoadingMore(false);
    }
  },
  [bars, symbol, interval, loadingMore],
);

// Subscribe to timeScale visible range changes
chart.timeScale().subscribeVisibleTimeRangeChange(handleVisibleRangeChange);

// WebSocket for realtime
useWebSocket({
  url: `/ws/ohlcv/${symbol}?interval=${interval}`,
  onMessage: (bar) => {
    if (candleSeriesRef.current) {
      candleSeriesRef.current.update({
        time: bar.ts as any,
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
      });
    }
    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.update({
        time: bar.ts as any,
        value: bar.v,
        color: bar.c >= bar.o ? "rgba(22,163,74,0.3)" : "rgba(220,38,38,0.3)",
      });
    }
  },
  enabled: true,
});
```

- [ ] **Step 3: Add `endTime` param to OHLCV API**

In `server/api.py`, modify the `/api/ohlcv/{symbol}` endpoint:

```python
@app.get("/api/ohlcv/{symbol}")
async def get_ohlcv(symbol: str, interval: str = "1h", limit: int = 200, endTime: int | None = None):
    """Fetch OHLCV data. If endTime provided, fetch bars before that timestamp."""
    from integrations.binance import BinanceClient
    client = BinanceClient()
    # Binance API accepts endTime in ms
    if endTime:
        import httpx
        params = {"symbol": f"{symbol.upper()}USDT", "interval": interval, "limit": limit, "endTime": endTime}
        async with httpx.AsyncClient(timeout=15.0) as http:
            resp = await http.get("https://api.binance.com/api/v3/klines", params=params)
            if resp.status_code == 200:
                from data.transforms import binance_klines_to_bars, bars_to_engine_json
                bars = binance_klines_to_bars(resp.json())
                return [{"ts": b.ts, "o": b.open, "h": b.high, "l": b.low, "c": b.close, "v": b.volume} for b in bars]
        return []
    bars = await binance.fetch_ohlcv(symbol, interval=interval, limit=limit)
    if not bars:
        raise HTTPException(404, f"No data for {symbol}")
    return [{"ts": b.ts, "o": b.open, "h": b.high, "l": b.low, "c": b.close, "v": b.volume} for b in bars]
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(chart): infinite historical scroll + realtime WebSocket updates"
```

---

### Task 4: Backtest Chart with Entry/Exit Markers

**Files:**

- Create: `dashboard/src/components/BacktestChart.tsx`

- [ ] **Step 1: Create BacktestChart component**

This component renders OHLCV bars with markers showing entry (green triangle up) and exit (red triangle down) points.

```typescript
// dashboard/src/components/BacktestChart.tsx
import { useEffect, useRef } from 'react'
import { createChart, CandlestickSeries, LineSeries, createSeriesMarkers, type IChartApi } from 'lightweight-charts'

interface Trade {
  id: number
  entry_ts: number
  exit_ts: number
  entry_price: number
  exit_price: number
  pnl_pct: number
  duration_bars: number
}

interface OHLCVBar { ts: number; o: number; h: number; l: number; c: number; v: number }

interface Props {
  bars: OHLCVBar[]
  trades: Trade[]
  equityCurve: number[]
}

export function BacktestChart({ bars, trades, equityCurve }: Props) {
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstance = useRef<IChartApi | null>(null)

  useEffect(() => {
    if (!chartRef.current || bars.length === 0) return
    if (chartInstance.current) {
      try { chartInstance.current.remove() } catch {}
      chartInstance.current = null
    }

    const container = chartRef.current
    const chart = createChart(container, {
      width: container.clientWidth, height: 350,
      layout: { background: { color: '#FFFFFF' }, textColor: '#1C293C', fontFamily: "'Inter', sans-serif" },
      grid: { vertLines: { color: '#f0f0ee' }, horzLines: { color: '#f0f0ee' } },
      rightPriceScale: { borderColor: '#1C293C' },
      timeScale: { borderColor: '#1C293C', timeVisible: true },
    })
    chartInstance.current = chart

    // Candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#16A34A', downColor: '#DC2626',
      borderUpColor: '#16A34A', borderDownColor: '#DC2626',
      wickUpColor: '#16A34A', wickDownColor: '#DC2626',
    })
    candleSeries.setData(bars.map(b => ({ time: b.ts as any, open: b.o, high: b.h, low: b.l, close: b.c })))

    // Entry/Exit markers
    const markers = trades.flatMap(t => [
      {
        time: t.entry_ts as any,
        position: 'belowBar' as const,
        color: '#16A34A',
        shape: 'arrowUp' as const,
        text: `BUY #${t.id}`,
      },
      {
        time: t.exit_ts as any,
        position: 'aboveBar' as const,
        color: t.pnl_pct >= 0 ? '#16A34A' : '#DC2626',
        shape: 'arrowDown' as const,
        text: `${t.pnl_pct >= 0 ? '+' : ''}${t.pnl_pct.toFixed(2)}%`,
      },
    ]).sort((a, b) => (a.time as number) - (b.time as number))

    if (markers.length > 0) {
      createSeriesMarkers(candleSeries, markers)
    }

    chart.timeScale().fitContent()

    const handleResize = () => { if (chartRef.current) chart.applyOptions({ width: container.clientWidth }) }
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      if (chartInstance.current === chart) {
        chartInstance.current = null
        try { chart.remove() } catch {}
      }
    }
  }, [bars, trades])

  return <div ref={chartRef} data-testid="backtest-chart" />
}
```

- [ ] **Step 2: Create test**

Create `dashboard/src/components/__tests__/BacktestChart.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { BacktestChart } from '../BacktestChart'

describe('BacktestChart', () => {
  it('renders chart container', () => {
    const bars = [{ ts: 1700000000, o: 100, h: 105, l: 99, c: 103, v: 1e6 }]
    render(<BacktestChart bars={bars} trades={[]} equityCurve={[10000]} />)
    expect(screen.getByTestId('backtest-chart')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(dashboard): BacktestChart component with entry/exit markers"
```

---

### Task 5: Backtest Panel — Trade List + Chart Integration

**Files:**

- Create: `dashboard/src/components/TradeTable.tsx`
- Modify: `dashboard/src/components/BacktestPanel.tsx`

- [ ] **Step 1: Create TradeTable component**

```typescript
// dashboard/src/components/TradeTable.tsx
interface Trade {
  id: number
  entry_ts: number
  exit_ts: number
  entry_price: number
  exit_price: number
  pnl_pct: number
  duration_bars: number
}

export function TradeTable({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) return null

  return (
    <div className="neo-card p-4 mt-4">
      <h3 className="font-bold mb-3">Trade History ({trades.length} trades)</h3>
      <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b-2 border-border">
              <th className="text-left py-2 font-bold">#</th>
              <th className="text-right py-2 font-bold">Entry</th>
              <th className="text-right py-2 font-bold">Exit</th>
              <th className="text-right py-2 font-bold">P&L</th>
              <th className="text-right py-2 font-bold">Bars</th>
            </tr>
          </thead>
          <tbody>
            {trades.map(t => (
              <tr key={t.id} className="border-b border-border/30 hover:bg-primary/10">
                <td className="py-1.5 font-mono text-xs opacity-50">{t.id}</td>
                <td className="py-1.5 text-right font-mono">${t.entry_price.toFixed(2)}</td>
                <td className="py-1.5 text-right font-mono">${t.exit_price.toFixed(2)}</td>
                <td className={`py-1.5 text-right font-mono font-bold ${t.pnl_pct >= 0 ? 'text-success' : 'text-danger'}`}>
                  {t.pnl_pct >= 0 ? '+' : ''}{t.pnl_pct.toFixed(2)}%
                </td>
                <td className="py-1.5 text-right font-mono text-xs">{t.duration_bars}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create EquityCurve component**

Create `dashboard/src/components/EquityCurve.tsx`:

```typescript
import { useEffect, useRef } from 'react'
import { createChart, LineSeries, type IChartApi } from 'lightweight-charts'

export function EquityCurve({ curve }: { curve: number[] }) {
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstance = useRef<IChartApi | null>(null)

  useEffect(() => {
    if (!chartRef.current || curve.length < 2) return
    if (chartInstance.current) {
      try { chartInstance.current.remove() } catch {}
      chartInstance.current = null
    }

    const container = chartRef.current
    const chart = createChart(container, {
      width: container.clientWidth, height: 200,
      layout: { background: { color: '#FFFFFF' }, textColor: '#1C293C', fontFamily: "'Inter', sans-serif" },
      grid: { vertLines: { color: '#f0f0ee' }, horzLines: { color: '#f0f0ee' } },
      rightPriceScale: { borderColor: '#1C293C' },
      timeScale: { visible: false },
    })
    chartInstance.current = chart

    const series = chart.addSeries(LineSeries, {
      color: curve[curve.length - 1] >= curve[0] ? '#16A34A' : '#DC2626',
      lineWidth: 2,
    })

    series.setData(curve.map((v, i) => ({ time: i as any, value: v })))
    chart.timeScale().fitContent()

    const handleResize = () => { if (chartRef.current) chart.applyOptions({ width: container.clientWidth }) }
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      if (chartInstance.current === chart) {
        chartInstance.current = null
        try { chart.remove() } catch {}
      }
    }
  }, [curve])

  return (
    <div className="neo-card p-4 mt-4">
      <h3 className="font-bold mb-2">Equity Curve</h3>
      <div ref={chartRef} data-testid="equity-curve" />
      <div className="mt-2 flex gap-4 text-xs font-mono opacity-60">
        <span>Start: ${curve[0]?.toFixed(0)}</span>
        <span>End: ${curve[curve.length - 1]?.toFixed(0)}</span>
        <span>Change: {((curve[curve.length - 1] / curve[0] - 1) * 100).toFixed(2)}%</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Update BacktestPanel to call detailed endpoint and show chart + trades**

Modify `BacktestPanel.tsx` to:

- Call `/api/backtest/detailed` instead of `/api/backtest`
- Show `BacktestChart` with bars and trade markers
- Show `TradeTable` with individual trades
- Show `EquityCurve`

Key changes:

```typescript
// In BacktestPanel state, add:
const [detailedResult, setDetailedResult] = useState<any>(null)

// Change fetch to use /api/backtest/detailed
const resp = await fetch('/api/backtest/detailed', { ... })

// After the metrics grid, add:
{detailedResult?.bars && detailedResult?.trades && (
  <div className="neo-card p-4 mt-4">
    <h3 className="font-bold mb-3">Backtest Chart</h3>
    <BacktestChart bars={detailedResult.bars} trades={detailedResult.trades} equityCurve={detailedResult.equity_curve} />
  </div>
)}
{detailedResult?.equity_curve && <EquityCurve curve={detailedResult.equity_curve} />}
{detailedResult?.trades && <TradeTable trades={detailedResult.trades} />}
```

- [ ] **Step 4: Write test for TradeTable**

Create `dashboard/src/components/__tests__/TradeTable.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { TradeTable } from '../TradeTable'

describe('TradeTable', () => {
  it('renders trades', () => {
    const trades = [
      { id: 1, entry_ts: 1700000000, exit_ts: 1700010000, entry_price: 600, exit_price: 620, pnl_pct: 3.2, duration_bars: 10 },
      { id: 2, entry_ts: 1700020000, exit_ts: 1700030000, entry_price: 615, exit_price: 600, pnl_pct: -2.4, duration_bars: 8 },
    ]
    render(<TradeTable trades={trades} />)
    expect(screen.getByText('Trade History (2 trades)')).toBeInTheDocument()
    expect(screen.getByText('+3.20%')).toBeInTheDocument()
    expect(screen.getByText('-2.40%')).toBeInTheDocument()
  })

  it('renders nothing for empty trades', () => {
    const { container } = render(<TradeTable trades={[]} />)
    expect(container.innerHTML).toBe('')
  })
})
```

- [ ] **Step 5: Run tests and commit**

```bash
cd /Users/kunal/arbiter/dashboard && npx vitest run
git add -A && git commit -m "feat(dashboard): trade table, equity curve, backtest chart integration"
```

---

### Task 6: Portfolio Panel + Agent Status

**Files:**

- Create: `dashboard/src/components/PortfolioPanel.tsx`
- Create: `dashboard/src/components/AgentStatus.tsx`
- Modify: `dashboard/src/App.tsx`

- [ ] **Step 1: Create PortfolioPanel**

```typescript
// dashboard/src/components/PortfolioPanel.tsx
import { useState, useEffect } from 'react'
import { Wallet, TrendingUp, TrendingDown, Shield } from 'lucide-react'

interface Position {
  symbol: string; entry_price: number; quantity: number
  current_price: number; pnl_pct: number; stop_loss: number; take_profit: number
}

interface Portfolio {
  cash_usd: number; total_value_usd: number; positions: Position[]
  exposure_pct: number; daily_pnl_pct: number
}

export function PortfolioPanel() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)

  useEffect(() => {
    fetch('/api/portfolio').then(r => r.json()).then(setPortfolio).catch(() => {})
  }, [])

  if (!portfolio) return <div className="neo-card p-4">Loading portfolio...</div>

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="neo-card p-4">
        <h2 className="font-bold text-lg mb-3">Portfolio</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="neo-card p-3 !shadow-[2px_2px_0px_var(--color-border)]">
            <div className="flex items-center gap-2 mb-1"><Wallet size={14} className="opacity-50" /><span className="text-xs font-bold uppercase opacity-60">Total Value</span></div>
            <p className="font-mono font-bold text-lg">${portfolio.total_value_usd.toFixed(2)}</p>
          </div>
          <div className="neo-card p-3 !shadow-[2px_2px_0px_var(--color-border)]">
            <div className="flex items-center gap-2 mb-1"><TrendingUp size={14} className="opacity-50" /><span className="text-xs font-bold uppercase opacity-60">Daily P&L</span></div>
            <p className={`font-mono font-bold text-lg ${portfolio.daily_pnl_pct >= 0 ? 'text-success' : 'text-danger'}`}>
              {portfolio.daily_pnl_pct >= 0 ? '+' : ''}{portfolio.daily_pnl_pct.toFixed(2)}%
            </p>
          </div>
          <div className="neo-card p-3 !shadow-[2px_2px_0px_var(--color-border)]">
            <div className="flex items-center gap-2 mb-1"><Shield size={14} className="opacity-50" /><span className="text-xs font-bold uppercase opacity-60">Exposure</span></div>
            <p className="font-mono font-bold text-lg">{portfolio.exposure_pct.toFixed(1)}%</p>
          </div>
          <div className="neo-card p-3 !shadow-[2px_2px_0px_var(--color-border)]">
            <div className="flex items-center gap-2 mb-1"><Wallet size={14} className="opacity-50" /><span className="text-xs font-bold uppercase opacity-60">Cash</span></div>
            <p className="font-mono font-bold text-lg">${portfolio.cash_usd.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Positions */}
      {portfolio.positions.length > 0 && (
        <div className="neo-card p-4">
          <h3 className="font-bold mb-3">Open Positions</h3>
          <table className="w-full text-sm">
            <thead><tr className="border-b-2 border-border">
              <th className="text-left py-2 font-bold">Symbol</th>
              <th className="text-right py-2 font-bold">Entry</th>
              <th className="text-right py-2 font-bold">Current</th>
              <th className="text-right py-2 font-bold">P&L</th>
              <th className="text-right py-2 font-bold">SL</th>
              <th className="text-right py-2 font-bold">TP</th>
            </tr></thead>
            <tbody>{portfolio.positions.map(p => (
              <tr key={p.symbol} className="border-b border-border/30">
                <td className="py-2 font-bold">{p.symbol}</td>
                <td className="py-2 text-right font-mono">${p.entry_price.toFixed(2)}</td>
                <td className="py-2 text-right font-mono">${p.current_price.toFixed(2)}</td>
                <td className={`py-2 text-right font-mono font-bold ${p.pnl_pct >= 0 ? 'text-success' : 'text-danger'}`}>
                  {p.pnl_pct >= 0 ? '+' : ''}{p.pnl_pct.toFixed(2)}%
                </td>
                <td className="py-2 text-right font-mono text-xs">${p.stop_loss.toFixed(2)}</td>
                <td className="py-2 text-right font-mono text-xs">${p.take_profit.toFixed(2)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create AgentStatus**

```typescript
// dashboard/src/components/AgentStatus.tsx
import { useState, useEffect } from 'react'
import { Activity, Clock, Zap, TrendingUp } from 'lucide-react'

interface Status {
  running: boolean; last_scan_ts: number; next_scan_ts: number
  current_regime: string; trades_today: number; positions_open: number
  portfolio_value_usd: number; daily_pnl_pct: number; uptime_seconds: number
}

export function AgentStatus() {
  const [status, setStatus] = useState<Status | null>(null)

  useEffect(() => {
    const load = () => fetch('/api/agent/status').then(r => r.json()).then(setStatus).catch(() => {})
    load()
    const interval = setInterval(load, 30000) // refresh every 30s
    return () => clearInterval(interval)
  }, [])

  if (!status) return <div className="neo-card p-4">Loading agent status...</div>

  const formatTime = (ts: number) => new Date(ts * 1000).toLocaleTimeString()
  const formatUptime = (s: number) => `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`

  return (
    <div className="neo-card p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-lg">Agent Status</h2>
        <span className={`neo-badge ${status.running ? 'neo-badge-success' : 'neo-badge-danger'}`}>
          {status.running ? '● RUNNING' : '○ STOPPED'}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 border-2 border-border rounded">
          <div className="flex items-center gap-1 text-xs font-bold opacity-60 mb-1"><Activity size={12} />Regime</div>
          <p className="font-mono font-bold">{status.current_regime.replace('_', ' ')}</p>
        </div>
        <div className="p-3 border-2 border-border rounded">
          <div className="flex items-center gap-1 text-xs font-bold opacity-60 mb-1"><Zap size={12} />Trades Today</div>
          <p className="font-mono font-bold">{status.trades_today}</p>
        </div>
        <div className="p-3 border-2 border-border rounded">
          <div className="flex items-center gap-1 text-xs font-bold opacity-60 mb-1"><Clock size={12} />Last Scan</div>
          <p className="font-mono font-bold text-sm">{formatTime(status.last_scan_ts)}</p>
        </div>
        <div className="p-3 border-2 border-border rounded">
          <div className="flex items-center gap-1 text-xs font-bold opacity-60 mb-1"><TrendingUp size={12} />Uptime</div>
          <p className="font-mono font-bold">{formatUptime(status.uptime_seconds)}</p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Update App.tsx to add Portfolio + Status tabs**

Add two new tabs to the nav and import the components:

```typescript
import { PortfolioPanel } from './components/PortfolioPanel'
import { AgentStatus } from './components/AgentStatus'
import { Wallet, Radio } from 'lucide-react'

// Add to Tab type:
type Tab = 'chart' | 'backtest' | 'scanner' | 'portfolio' | 'status'

// Add to nav tabs array:
{ id: 'portfolio' as Tab, label: 'Portfolio', icon: Wallet },
{ id: 'status' as Tab, label: 'Agent', icon: Radio },

// Add to main render:
{activeTab === 'portfolio' && <PortfolioPanel />}
{activeTab === 'status' && <AgentStatus />}
```

- [ ] **Step 4: Write test for PortfolioPanel**

Create `dashboard/src/components/__tests__/PortfolioPanel.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PortfolioPanel } from '../PortfolioPanel'

describe('PortfolioPanel', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('renders portfolio data', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true, json: async () => ({
        cash_usd: 850, total_value_usd: 1000, exposure_pct: 15, daily_pnl_pct: 0.42,
        positions: [{ symbol: 'BNB', entry_price: 590, quantity: 0.085, current_price: 600, pnl_pct: 1.69, stop_loss: 578, take_profit: 640 }],
      }),
    } as Response)

    render(<PortfolioPanel />)
    await waitFor(() => {
      expect(screen.getByText('$1000.00')).toBeInTheDocument()
      expect(screen.getByText('BNB')).toBeInTheDocument()
      expect(screen.getByText('+1.69%')).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 5: Run all tests and commit**

```bash
cd /Users/kunal/arbiter && source .venv/bin/activate && pytest tests/ -v --tb=short
cd /Users/kunal/arbiter/dashboard && npx vitest run
git add -A && git commit -m "feat(dashboard): portfolio panel + agent status + new tabs"
```

---

### Task 7: Install WebSocket dependency + Final Integration

**Files:**

- Modify: `dashboard/package.json` (no new dep needed — native WebSocket)
- Modify: `pyproject.toml` or `requirements.txt` (add `websockets` for server)

- [ ] **Step 1: Install websockets for server**

```bash
cd /Users/kunal/arbiter && source .venv/bin/activate && pip install websockets
```

- [ ] **Step 2: Run full test suite**

```bash
cd /Users/kunal/arbiter && pytest tests/ -v
cd /Users/kunal/arbiter/dashboard && npx vitest run
```

- [ ] **Step 3: Manual verification**

Start both servers and verify:

```bash
# Terminal 1: API server
uvicorn server.api:app --reload --port 8000

# Terminal 2: Dashboard
cd dashboard && npm run dev
```

Check:

1. OHLCV chart loads and updates realtime
2. Scroll left loads older bars
3. Backtest shows chart with green/red markers
4. Trade table shows individual trades
5. Equity curve shows portfolio growth
6. Portfolio tab shows positions
7. Agent tab shows status

- [ ] **Step 4: Final commit**

```bash
git add -A && git commit -m "feat: complete dashboard enhancements - realtime, infinite scroll, trade viz, portfolio"
```

---

## Summary of Deliverables

| Feature                                     | Task       |
| ------------------------------------------- | ---------- |
| Database layer (SQLAlchemy + PostgreSQL)     | Task 8     |
| Docker PostgreSQL with persistent volume    | Task 8     |
| Infinite scroll (load more history on left) | Task 3     |
| Realtime WebSocket OHLCV streaming          | Tasks 2, 3 |
| Backtest shows all individual trades        | Tasks 1, 5 |
| Backtest chart with entry/exit markers      | Tasks 4, 5 |
| Equity curve visualization                  | Task 5     |
| Portfolio panel (positions, exposure, P&L)  | Task 6     |
| Agent status (regime, uptime, trades today) | Task 6     |
| Neobrutalism landing page                   | Task 9     |

---

### Task 8: Database Layer — SQLAlchemy + PostgreSQL Docker

**Files:**

- Create: `server/database.py`
- Create: `server/models.py`
- Create: `server/crud.py`
- Modify: `docker-compose.yml`
- Create: `tests/test_database.py`

- [ ] **Step 1: Install dependencies**

```bash
cd /Users/kunal/arbiter && source .venv/bin/activate
pip install sqlalchemy[asyncio] asyncpg aiosqlite alembic
```

- [ ] **Step 2: Create database engine and session factory**

Create `server/database.py`:

```python
"""Async database engine — SQLite for dev, PostgreSQL for production."""
import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite+aiosqlite:///./arbiter.db"  # Default: local SQLite for dev
)

# For PostgreSQL in production: "postgresql+asyncpg://arbiter:arbiter@localhost:5432/arbiter"

engine = create_async_engine(DATABASE_URL, echo=False)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_session() -> AsyncSession:
    async with SessionLocal() as session:
        yield session


async def init_db():
    """Create all tables. Safe to call multiple times."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
```

- [ ] **Step 3: Create ORM models**

Create `server/models.py`:

```python
"""SQLAlchemy ORM models for Arbiter persistent state."""
from datetime import datetime
from sqlalchemy import String, Float, Integer, Boolean, DateTime, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from server.database import Base


class Trade(Base):
    """Completed trade record."""
    __tablename__ = "trades"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(20), index=True)
    action: Mapped[str] = mapped_column(String(10))  # "buy" or "sell"
    entry_price: Mapped[float] = mapped_column(Float)
    exit_price: Mapped[float] = mapped_column(Float, nullable=True)
    quantity: Mapped[float] = mapped_column(Float)
    pnl_pct: Mapped[float] = mapped_column(Float, nullable=True)
    entry_time: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    exit_time: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    exit_reason: Mapped[str] = mapped_column(String(50), nullable=True)
    strategy: Mapped[str] = mapped_column(String(50), nullable=True)
    regime: Mapped[str] = mapped_column(String(30), nullable=True)


class Position(Base):
    """Currently open position."""
    __tablename__ = "positions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    entry_price: Mapped[float] = mapped_column(Float)
    quantity: Mapped[float] = mapped_column(Float)
    stop_loss: Mapped[float] = mapped_column(Float)
    take_profit: Mapped[float] = mapped_column(Float)
    strategy: Mapped[str] = mapped_column(String(50))
    entry_time: Mapped[datetime] = mapped_column(DateTime, default=func.now())


class PortfolioSnapshot(Base):
    """Periodic portfolio value snapshot."""
    __tablename__ = "portfolio_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=func.now(), index=True)
    total_value_usd: Mapped[float] = mapped_column(Float)
    cash_usd: Mapped[float] = mapped_column(Float)
    num_positions: Mapped[int] = mapped_column(Integer)
    daily_pnl_pct: Mapped[float] = mapped_column(Float, nullable=True)
    regime: Mapped[str] = mapped_column(String(30), nullable=True)


class OHLCVCache(Base):
    """Cached OHLCV bars to reduce API calls."""
    __tablename__ = "ohlcv_cache"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(20), index=True)
    interval: Mapped[str] = mapped_column(String(10))
    timestamp: Mapped[int] = mapped_column(Integer, index=True)  # unix seconds
    open: Mapped[float] = mapped_column(Float)
    high: Mapped[float] = mapped_column(Float)
    low: Mapped[float] = mapped_column(Float)
    close: Mapped[float] = mapped_column(Float)
    volume: Mapped[float] = mapped_column(Float)


class AgentLog(Base):
    """Agent activity log for status monitoring."""
    __tablename__ = "agent_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=func.now(), index=True)
    event: Mapped[str] = mapped_column(String(50))  # "scan", "trade", "exit", "error"
    details: Mapped[str] = mapped_column(Text, nullable=True)
    regime: Mapped[str] = mapped_column(String(30), nullable=True)
```

- [ ] **Step 4: Create CRUD operations**

Create `server/crud.py`:

```python
"""Database CRUD operations."""
from datetime import datetime, timedelta
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from server.models import Trade, Position, PortfolioSnapshot, AgentLog


async def create_trade(db: AsyncSession, **kwargs) -> Trade:
    trade = Trade(**kwargs)
    db.add(trade)
    await db.commit()
    await db.refresh(trade)
    return trade


async def get_recent_trades(db: AsyncSession, limit: int = 50) -> list[Trade]:
    result = await db.execute(
        select(Trade).order_by(desc(Trade.entry_time)).limit(limit)
    )
    return list(result.scalars().all())


async def get_open_positions(db: AsyncSession) -> list[Position]:
    result = await db.execute(select(Position))
    return list(result.scalars().all())


async def upsert_position(db: AsyncSession, symbol: str, **kwargs) -> Position:
    result = await db.execute(select(Position).where(Position.symbol == symbol))
    pos = result.scalar_one_or_none()
    if pos:
        for k, v in kwargs.items():
            setattr(pos, k, v)
    else:
        pos = Position(symbol=symbol, **kwargs)
        db.add(pos)
    await db.commit()
    await db.refresh(pos)
    return pos


async def remove_position(db: AsyncSession, symbol: str):
    result = await db.execute(select(Position).where(Position.symbol == symbol))
    pos = result.scalar_one_or_none()
    if pos:
        await db.delete(pos)
        await db.commit()


async def save_snapshot(db: AsyncSession, **kwargs) -> PortfolioSnapshot:
    snap = PortfolioSnapshot(**kwargs)
    db.add(snap)
    await db.commit()
    return snap


async def get_snapshots(db: AsyncSession, hours: int = 24) -> list[PortfolioSnapshot]:
    since = datetime.utcnow() - timedelta(hours=hours)
    result = await db.execute(
        select(PortfolioSnapshot)
        .where(PortfolioSnapshot.timestamp >= since)
        .order_by(PortfolioSnapshot.timestamp)
    )
    return list(result.scalars().all())


async def log_event(db: AsyncSession, event: str, details: str = "", regime: str = ""):
    log = AgentLog(event=event, details=details, regime=regime)
    db.add(log)
    await db.commit()


async def get_agent_logs(db: AsyncSession, limit: int = 100) -> list[AgentLog]:
    result = await db.execute(
        select(AgentLog).order_by(desc(AgentLog.timestamp)).limit(limit)
    )
    return list(result.scalars().all())
```

- [ ] **Step 5: Update docker-compose.yml with PostgreSQL**

Replace `docker-compose.yml`:

```yaml
version: "3.8"

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: arbiter
      POSTGRES_PASSWORD: arbiter_secret
      POSTGRES_DB: arbiter
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U arbiter"]
      interval: 5s
      timeout: 3s
      retries: 5

  arbiter:
    build: .
    restart: unless-stopped
    env_file: .env
    environment:
      DATABASE_URL: postgresql+asyncpg://arbiter:arbiter_secret@postgres:5432/arbiter
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - ./data:/app/data
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  pgdata:
```

- [ ] **Step 6: Add DB initialization to server startup**

In `server/api.py`, add startup event:

```python
from server.database import init_db

@app.on_event("startup")
async def startup():
    await init_db()
```

- [ ] **Step 7: Write database test**

Create `tests/test_database.py`:

```python
"""Tests for database layer."""
import asyncio
import pytest
import os

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"

from server.database import engine, init_db, SessionLocal
from server.models import Trade, Position
from server import crud


@pytest.fixture
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def db():
    await init_db()
    async with SessionLocal() as session:
        yield session


@pytest.mark.asyncio
async def test_create_and_get_trade():
    await init_db()
    async with SessionLocal() as db:
        trade = await crud.create_trade(
            db, symbol="BNB", action="buy", entry_price=600.0,
            quantity=0.1, strategy="trending_up", regime="trending_up"
        )
        assert trade.id is not None
        assert trade.symbol == "BNB"

        trades = await crud.get_recent_trades(db, limit=10)
        assert len(trades) >= 1
        assert trades[0].symbol == "BNB"


@pytest.mark.asyncio
async def test_position_upsert_and_remove():
    await init_db()
    async with SessionLocal() as db:
        pos = await crud.upsert_position(
            db, symbol="ETH", entry_price=3000.0, quantity=0.5,
            stop_loss=2900.0, take_profit=3200.0, strategy="momentum"
        )
        assert pos.symbol == "ETH"

        positions = await crud.get_open_positions(db)
        assert any(p.symbol == "ETH" for p in positions)

        await crud.remove_position(db, "ETH")
        positions = await crud.get_open_positions(db)
        assert not any(p.symbol == "ETH" for p in positions)


@pytest.mark.asyncio
async def test_agent_log():
    await init_db()
    async with SessionLocal() as db:
        await crud.log_event(db, event="scan", details="Scanned 43 tokens", regime="trending_up")
        logs = await crud.get_agent_logs(db, limit=5)
        assert len(logs) >= 1
        assert logs[0].event == "scan"
```

- [ ] **Step 8: Run tests**

```bash
cd /Users/kunal/arbiter && source .venv/bin/activate
pip install pytest-asyncio -q
pytest tests/test_database.py -v
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(db): SQLAlchemy async ORM + PostgreSQL Docker + CRUD operations"
```

---

### Task 9: Neobrutalism Landing Page

**Files:**

- Create: `dashboard/src/pages/Landing.tsx`
- Create: `dashboard/src/pages/Dashboard.tsx`
- Modify: `dashboard/src/App.tsx`
- Install: `react-router-dom`, `framer-motion`

- [ ] **Step 1: Install dependencies**

```bash
cd /Users/kunal/arbiter/dashboard && npm install react-router-dom framer-motion
```

- [ ] **Step 2: Create Landing page**

Create `dashboard/src/pages/Landing.tsx`:

```tsx
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Activity, Shield, Zap, BarChart3, Bot, Lock, TrendingUp, Target } from 'lucide-react'

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
}

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
}

export function Landing() {
  return (
    <div className="min-h-screen bg-surface">
      {/* Hero */}
      <header className="border-b-[3px] border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary border-[2.5px] border-border rounded flex items-center justify-center font-bold text-lg">A</div>
            <span className="font-bold text-xl">Arbiter</span>
          </div>
          <Link to="/app" className="neo-btn neo-btn-primary text-sm">Launch Dashboard →</Link>
        </div>
      </header>

      {/* Hero Section */}
      <motion.section
        initial="hidden" animate="visible" variants={stagger}
        className="max-w-6xl mx-auto px-6 py-20 text-center"
      >
        <motion.div variants={fadeUp} className="inline-block neo-badge bg-primary/20 text-text mb-6">
          BNB Hack: AI Trading Agent Edition
        </motion.div>
        <motion.h1 variants={fadeUp} className="text-5xl md:text-7xl font-black tracking-tight leading-tight mb-6">
          Trade on <span className="bg-primary px-2 border-[2.5px] border-border inline-block -rotate-1">Evidence</span>,<br/>
          Not Belief
        </motion.h1>
        <motion.p variants={fadeUp} className="text-xl max-w-2xl mx-auto opacity-70 mb-10">
          An autonomous trading agent that validates every decision against a Rust-powered backtest engine before execution.
          Institutional quant discipline meets on-chain DeFi.
        </motion.p>
        <motion.div variants={fadeUp} className="flex gap-4 justify-center">
          <Link to="/app" className="neo-btn neo-btn-primary text-lg px-8 py-3">Open Dashboard</Link>
          <a href="https://github.com/kunalshah017/arbiter" target="_blank" className="neo-btn bg-white text-lg px-8 py-3">GitHub ↗</a>
        </motion.div>
      </motion.section>

      {/* How It Works */}
      <section className="border-t-[3px] border-border bg-white py-20">
        <div className="max-w-6xl mx-auto px-6">
          <motion.h2 initial="hidden" whileInView="visible" variants={fadeUp} viewport={{ once: true }}
            className="text-3xl font-black text-center mb-12">How It Works</motion.h2>
          <motion.div initial="hidden" whileInView="visible" variants={stagger} viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
            {[
              { icon: Activity, label: "Market Data", sub: "Binance OHLCV" },
              { icon: Bot, label: "AI Classifies", sub: "GPT-4o-mini" },
              { icon: Target, label: "Strategy", sub: "5 Regimes" },
              { icon: Zap, label: "Rust Validates", sub: "<50ms" },
              { icon: TrendingUp, label: "Execute", sub: "TWAK on BSC" },
            ].map((step, i) => (
              <motion.div key={i} variants={fadeUp} className="neo-card p-4 text-center">
                <step.icon size={32} className="mx-auto mb-2 text-secondary" />
                <p className="font-bold">{step.label}</p>
                <p className="text-xs font-mono opacity-60">{step.sub}</p>
                {i < 4 && <div className="hidden md:block absolute right-0 top-1/2 text-2xl font-bold opacity-30">→</div>}
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 max-w-6xl mx-auto px-6">
        <motion.h2 initial="hidden" whileInView="visible" variants={fadeUp} viewport={{ once: true }}
          className="text-3xl font-black text-center mb-12">Built Different</motion.h2>
        <motion.div initial="hidden" whileInView="visible" variants={stagger} viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { icon: Zap, title: "Rust Backtest Engine", desc: "20 technical indicators computed in <50ms. No trade executes without statistical edge." },
            { icon: Shield, title: "5-Layer Risk Gate", desc: "Expectancy, drawdown, win rate, profit factor, and min trades — ALL must pass." },
            { icon: BarChart3, title: "Regime-Aware", desc: "AI classifies markets into 5 regimes. Each gets a pre-optimized strategy template." },
            { icon: Lock, title: "Self-Custody", desc: "Trust Wallet Agent Kit. Your keys, your trades. No centralized exchange." },
            { icon: Activity, title: "Realtime Monitoring", desc: "Live OHLCV streaming, position tracking, trailing stops every 5 minutes." },
            { icon: Bot, title: "ERC-8004 Identity", desc: "On-chain agent identity via BNB AI Agent SDK. Verifiable autonomous trading." },
          ].map((feat, i) => (
            <motion.div key={i} variants={fadeUp} className="neo-card p-6 hover:!shadow-[6px_6px_0px_var(--color-border)] hover:-translate-y-1 transition-all">
              <feat.icon size={28} className="text-secondary mb-3" />
              <h3 className="font-bold text-lg mb-2">{feat.title}</h3>
              <p className="text-sm opacity-70">{feat.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Tech Stack */}
      <section className="border-t-[3px] border-border bg-white py-20">
        <div className="max-w-6xl mx-auto px-6">
          <motion.h2 initial="hidden" whileInView="visible" variants={fadeUp} viewport={{ once: true }}
            className="text-3xl font-black text-center mb-12">Tech Stack</motion.h2>
          <motion.div initial="hidden" whileInView="visible" variants={stagger} viewport={{ once: true }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: "Rust + PyO3", role: "Backtest Engine" },
              { name: "Python asyncio", role: "Orchestrator" },
              { name: "Binance API", role: "Market Data" },
              { name: "TWAK CLI", role: "Execution" },
              { name: "BNB Agent SDK", role: "Identity" },
              { name: "PostgreSQL", role: "Persistence" },
              { name: "FastAPI", role: "Dashboard API" },
              { name: "React + Vite", role: "Dashboard UI" },
            ].map((tech, i) => (
              <motion.div key={i} variants={fadeUp} className="p-4 border-[2.5px] border-border rounded bg-surface text-center">
                <p className="font-bold font-mono">{tech.name}</p>
                <p className="text-xs opacity-60">{tech.role}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-20 max-w-6xl mx-auto px-6">
        <motion.div initial="hidden" whileInView="visible" variants={stagger} viewport={{ once: true }}
          className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { value: "<50ms", label: "Backtest Speed" },
            { value: "20", label: "Indicators" },
            { value: "43", label: "Tokens Scanned" },
            { value: "5", label: "Market Regimes" },
          ].map((stat, i) => (
            <motion.div key={i} variants={fadeUp} className="neo-card p-6 text-center">
              <p className="text-3xl font-black text-secondary font-mono">{stat.value}</p>
              <p className="text-sm font-bold opacity-60 mt-1">{stat.label}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* CTA */}
      <section className="border-t-[3px] border-border bg-primary py-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-black mb-4">Ready to trade on evidence?</h2>
          <p className="opacity-70 mb-8">Open the dashboard to run backtests, scan tokens, and validate strategies.</p>
          <Link to="/app" className="neo-btn bg-white text-lg px-10 py-4 border-border">Launch Dashboard →</Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t-[3px] border-border py-8">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-primary border-2 border-border rounded flex items-center justify-center font-bold text-xs">A</div>
            <span className="font-bold">Arbiter</span>
            <span className="text-xs opacity-50 font-mono ml-2">v0.1.0</span>
          </div>
          <div className="flex gap-4 text-sm">
            <a href="https://github.com/kunalshah017/arbiter" target="_blank" className="hover:text-secondary font-bold">GitHub</a>
            <a href="https://dorahacks.io/hackathon/bnbhack-twt-cmc" target="_blank" className="hover:text-secondary font-bold">BNB Hack</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
```

- [ ] **Step 3: Extract Dashboard page from App.tsx**

Create `dashboard/src/pages/Dashboard.tsx` — move the current `App.tsx` content (header, tabs, main content) into this component. Keep the same structure.

```typescript
// dashboard/src/pages/Dashboard.tsx
// Move ALL current App.tsx content here, rename function to Dashboard
import { useState } from 'react'
import { OHLCVChart } from '../components/OHLCVChart'
import { BacktestPanel } from '../components/BacktestPanel'
import { ScannerPanel } from '../components/ScannerPanel'
import { PortfolioPanel } from '../components/PortfolioPanel'
import { AgentStatus } from '../components/AgentStatus'
import { Activity, BarChart3, Search, Wallet, Radio } from 'lucide-react'
import { Link } from 'react-router-dom'

type Tab = 'chart' | 'backtest' | 'scanner' | 'portfolio' | 'status'

export function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('chart')
  const [symbol, setSymbol] = useState('BNB')

  return (
    <div className="min-h-screen bg-surface p-4">
      <header className="neo-card p-4 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="w-10 h-10 bg-primary border-[2.5px] border-border rounded flex items-center justify-center font-bold text-lg hover:-translate-y-0.5 transition-transform">A</Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Arbiter Dashboard</h1>
            <p className="text-sm opacity-60 font-mono">Backtest-Validated Trading</p>
          </div>
        </div>
        <select className="neo-select text-sm" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
          {['BNB','ETH','XRP','DOGE','ADA','LINK','AVAX','DOT','UNI','CAKE'].map(s => (
            <option key={s} value={s}>{s}/USDT</option>
          ))}
        </select>
      </header>

      <nav className="flex gap-2 mb-4 flex-wrap">
        {([
          { id: 'chart' as Tab, label: 'Chart', icon: Activity },
          { id: 'backtest' as Tab, label: 'Backtest', icon: BarChart3 },
          { id: 'scanner' as Tab, label: 'Scanner', icon: Search },
          { id: 'portfolio' as Tab, label: 'Portfolio', icon: Wallet },
          { id: 'status' as Tab, label: 'Agent', icon: Radio },
        ]).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`neo-btn flex items-center gap-2 text-sm ${activeTab === tab.id ? 'neo-btn-primary' : 'bg-white'}`}>
            <tab.icon size={16} />{tab.label}
          </button>
        ))}
      </nav>

      <main>
        {activeTab === 'chart' && <OHLCVChart symbol={symbol} />}
        {activeTab === 'backtest' && <BacktestPanel symbol={symbol} />}
        {activeTab === 'scanner' && <ScannerPanel />}
        {activeTab === 'portfolio' && <PortfolioPanel />}
        {activeTab === 'status' && <AgentStatus />}
      </main>
    </div>
  )
}
```

- [ ] **Step 4: Update App.tsx with React Router**

Replace `dashboard/src/App.tsx`:

```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Landing } from './pages/Landing'
import { Dashboard } from './pages/Dashboard'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/app" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
```

- [ ] **Step 5: Update vite.config.ts for SPA routing**

Add `historyApiFallback` equivalent — in Vite dev server it's automatic. For production build, ensure `index.html` is served for all routes. No change needed for dev.

- [ ] **Step 6: Run dashboard build to verify**

```bash
cd /Users/kunal/arbiter/dashboard && npm run build
```

Expected: successful build with no errors.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(landing): neobrutalism landing page with animated feature showcase + React Router"
```
