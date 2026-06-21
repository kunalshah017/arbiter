"""Async database engine — PostgreSQL via Docker for dev and production."""
import os
import logging
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite+aiosqlite:///./arbiter.db"
)

engine = create_async_engine(DATABASE_URL, echo=False)
SessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False)

db_available = False


class Base(DeclarativeBase):
    pass


async def get_session() -> AsyncSession:
    async with SessionLocal() as session:
        yield session


async def init_db():
    """Create all tables. Logs warning if DB is unavailable."""
    global db_available
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        db_available = True
        logger.info("Database initialized successfully")
    except Exception as e:
        db_available = False
        logger.warning(
            f"Database not available ({e.__class__.__name__}). Running without persistence. Start PostgreSQL with: docker compose up postgres -d")
