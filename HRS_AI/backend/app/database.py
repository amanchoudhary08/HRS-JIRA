from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def create_all_tables():
    async with engine.begin() as conn:
        from app.models.db import Base as ModelBase
        await conn.run_sync(ModelBase.metadata.create_all)
        # Apply any missing columns (SQLite doesn't support ALTER TABLE ADD IF NOT EXISTS)
        await _apply_migrations(conn)


async def _apply_migrations(conn):
    """Add new columns to existing tables without dropping data."""
    migrations = [
        "ALTER TABLE collaboration_sessions ADD COLUMN agent_outputs JSON",
        "ALTER TABLE collaboration_sessions ADD COLUMN created_by INTEGER REFERENCES users(id)",
        "ALTER TABLE collaboration_messages ADD COLUMN tool_result TEXT",
    ]
    for sql in migrations:
        try:
            await conn.execute(__import__("sqlalchemy").text(sql))
        except Exception:
            pass  # Column already exists — safe to ignore
