"""SQLite database for state persistence."""
import aiosqlite
from pathlib import Path

DB_PATH = Path("arbiter.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS ohlcv_cache (
    symbol TEXT NOT NULL,
    interval TEXT NOT NULL,
    ts INTEGER NOT NULL,
    open REAL NOT NULL,
    high REAL NOT NULL,
    low REAL NOT NULL,
    close REAL NOT NULL,
    volume REAL NOT NULL,
    fetched_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    PRIMARY KEY (symbol, interval, ts)
);

CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    action TEXT NOT NULL,
    entry_price REAL,
    exit_price REAL,
    quantity REAL,
    pnl_pct REAL,
    entry_time INTEGER,
    exit_time INTEGER,
    exit_reason TEXT,
    strategy TEXT,
    regime TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS positions (
    symbol TEXT PRIMARY KEY,
    entry_price REAL NOT NULL,
    quantity REAL NOT NULL,
    stop_loss REAL NOT NULL,
    take_profit REAL NOT NULL,
    strategy TEXT NOT NULL,
    entry_time INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    ts INTEGER PRIMARY KEY,
    total_value_usd REAL NOT NULL,
    num_positions INTEGER NOT NULL,
    daily_pnl_pct REAL
);

CREATE INDEX IF NOT EXISTS idx_ohlcv_symbol_ts ON ohlcv_cache(symbol, ts);
CREATE INDEX IF NOT EXISTS idx_trades_time ON trades(entry_time);
"""


async def get_db() -> aiosqlite.Connection:
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.executescript(SCHEMA)
    return db


async def cache_ohlcv(db: aiosqlite.Connection, symbol: str, interval: str, bars: list[dict]):
    await db.executemany(
        """INSERT OR REPLACE INTO ohlcv_cache (symbol, interval, ts, open, high, low, close, volume)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        [(symbol, interval, b["ts"], b["o"], b["h"], b["l"], b["c"], b["v"]) for b in bars],
    )
    await db.commit()


async def get_cached_ohlcv(db: aiosqlite.Connection, symbol: str, interval: str, since_ts: int) -> list[dict]:
    cursor = await db.execute(
        """SELECT ts, open as o, high as h, low as l, close as c, volume as v
           FROM ohlcv_cache WHERE symbol = ? AND interval = ? AND ts >= ? ORDER BY ts ASC""",
        (symbol, interval, since_ts),
    )
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]
