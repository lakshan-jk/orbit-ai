"""Database setup: the engine, the session factory, and the declarative Base.

Think of this as the Sequelize `new Sequelize(...)` connection + `sequelize.define`
base, split into Python's style.
"""

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

# asyncpg is the async Postgres driver (like `pg` in Node, but non-blocking).
DATABASE_URL = "postgresql+asyncpg://lakshan@localhost:5432/orbit"

# The engine manages a pool of connections to Postgres.
engine = create_async_engine(DATABASE_URL, echo=False)

# A factory that hands out short-lived sessions (one "unit of work" per request).
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# Every model class inherits from this. Alembic reads Base.metadata to know
# which tables should exist (like Sequelize's model registry).
class Base(DeclarativeBase):
    pass
