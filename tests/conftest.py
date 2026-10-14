"""Shared test fixtures.

Point the app at a throwaway test database BEFORE importing it, recreate the
schema fresh for each test (isolation), and stub out the model call so tests
never need a running Ollama.
"""

import os

# Must be set before importing db/main (the engine is built at import time).
os.environ.setdefault(
    "ORBIT_DATABASE_URL", "postgresql+asyncpg://lakshan@localhost:5432/orbit_test"
)
# 32+ bytes keeps PyJWT from warning about short HMAC keys.
os.environ.setdefault("ORBIT_JWT_SECRET", "test-secret-test-secret-test-secret")

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import db
import main
import ratelimit
from db import Base

# pytest-asyncio runs each test on its own event loop. A pooled connection would
# get bound to one loop and reused on another → errors. NullPool opens/closes a
# fresh connection per use, so nothing leaks across loops.
test_engine = create_async_engine(db.DATABASE_URL, poolclass=NullPool)
TestSession = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

# Make the app use the test engine's sessions.
db.SessionLocal = TestSession
main.SessionLocal = TestSession


@pytest_asyncio.fixture(autouse=True)
async def fresh_db():
    # Drop + recreate every table before each test → clean slate, no bleed-over.
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield


@pytest_asyncio.fixture(autouse=True)
def reset_ratelimit():
    # Counters are in-process and persist across tests — clear them each time.
    ratelimit.reset()
    yield


@pytest_asyncio.fixture(autouse=True)
def stub_model(monkeypatch):
    # Replace the real inference with a deterministic canned reply.
    async def fake_complete(messages):
        return "mocked reply"

    monkeypatch.setattr(main, "ollama_complete", fake_complete)


@pytest_asyncio.fixture
async def client():
    # Drive the ASGI app in-process — no live server needed.
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def register(client, email="user@test.com", password="secret123"):
    """Helper: create an account and return its auth header."""
    r = await client.post("/auth/register", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}
