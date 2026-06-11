"""WebSocket endpoint for realtime OHLCV streaming."""
import asyncio
import json
from fastapi import WebSocket, WebSocketDisconnect
import websockets


class OHLCVStreamer:
    """Streams realtime kline updates from Binance WebSocket to connected clients."""

    def __init__(self):
        self._clients: dict[str, list[WebSocket]] = {}
        self._binance_tasks: dict[str, asyncio.Task] = {}

    async def connect(self, websocket: WebSocket, symbol: str, interval: str = "1m"):
        await websocket.accept()
        key = f"{symbol}_{interval}"
        if key not in self._clients:
            self._clients[key] = []
        self._clients[key].append(websocket)

        if key not in self._binance_tasks:
            self._binance_tasks[key] = asyncio.create_task(
                self._stream_binance(symbol, interval, key)
            )

        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            self._clients[key].remove(websocket)
            if not self._clients[key]:
                self._binance_tasks[key].cancel()
                del self._binance_tasks[key]
                del self._clients[key]

    async def _stream_binance(self, symbol: str, interval: str, key: str):
        pair = f"{symbol.lower()}usdt"
        url = f"wss://stream.binance.com:9443/ws/{pair}@kline_{interval}"

        while True:
            try:
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
                        for client in list(self._clients.get(key, [])):
                            try:
                                await client.send_json(bar)
                            except Exception:
                                pass
            except asyncio.CancelledError:
                break
            except Exception:
                await asyncio.sleep(5)


streamer = OHLCVStreamer()
