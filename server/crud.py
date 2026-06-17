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
    result = await db.execute(select(Trade).order_by(desc(Trade.entry_time)).limit(limit))
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
        select(PortfolioSnapshot).where(PortfolioSnapshot.timestamp >=
                                        since).order_by(PortfolioSnapshot.timestamp)
    )
    return list(result.scalars().all())


async def log_event(db: AsyncSession, event: str, details: str = "", regime: str = ""):
    log = AgentLog(event=event, details=details, regime=regime)
    db.add(log)
    await db.commit()


async def get_agent_logs(db: AsyncSession, limit: int = 100) -> list[AgentLog]:
    result = await db.execute(select(AgentLog).order_by(desc(AgentLog.timestamp)).limit(limit))
    return list(result.scalars().all())
