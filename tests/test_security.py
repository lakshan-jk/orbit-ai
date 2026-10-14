import main
from conftest import register


async def test_security_headers_present(client):
    r = await client.get("/health")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"
    assert r.headers["Referrer-Policy"] == "no-referrer"


async def test_message_too_long_rejected(client):
    auth = await register(client)
    r = await client.post(
        "/chat", json={"message": "x" * 9000, "conversation_id": None}, headers=auth
    )
    assert r.status_code == 422  # Pydantic rejects before the handler runs


async def test_empty_message_rejected(client):
    auth = await register(client)
    r = await client.post(
        "/chat", json={"message": "", "conversation_id": None}, headers=auth
    )
    assert r.status_code == 422


async def test_chat_rate_limited(client, monkeypatch):
    monkeypatch.setattr(main, "CHAT_RATE", (2, 60))  # 2 requests / minute
    auth = await register(client)
    body = {"message": "hi", "conversation_id": None}
    assert (await client.post("/chat", json=body, headers=auth)).status_code == 200
    assert (await client.post("/chat", json=body, headers=auth)).status_code == 200
    third = await client.post("/chat", json=body, headers=auth)
    assert third.status_code == 429
    assert "Retry-After" in third.headers


async def test_auth_rate_limited(client, monkeypatch):
    monkeypatch.setattr(main, "AUTH_RATE", (2, 60))
    body = {"email": "a@test.com", "password": "secret123"}
    assert (await client.post("/auth/register", json=body)).status_code == 200
    # Same IP, different emails — still counts against the IP bucket.
    await client.post("/auth/register", json={"email": "b@test.com", "password": "secret123"})
    blocked = await client.post(
        "/auth/register", json={"email": "c@test.com", "password": "secret123"}
    )
    assert blocked.status_code == 429
