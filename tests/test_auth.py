from conftest import register


async def test_register_returns_token(client):
    r = await client.post(
        "/auth/register", json={"email": "a@test.com", "password": "secret123"}
    )
    assert r.status_code == 200
    assert "token" in r.json()
    assert r.json()["email"] == "a@test.com"


async def test_duplicate_email_rejected(client):
    await register(client, "dup@test.com")
    r = await client.post(
        "/auth/register", json={"email": "dup@test.com", "password": "secret123"}
    )
    assert r.status_code == 409


async def test_short_password_rejected(client):
    r = await client.post(
        "/auth/register", json={"email": "x@test.com", "password": "123"}
    )
    assert r.status_code == 400


async def test_login_wrong_password(client):
    await register(client, "login@test.com", "secret123")
    r = await client.post(
        "/auth/login", json={"email": "login@test.com", "password": "nope"}
    )
    assert r.status_code == 401


async def test_login_success(client):
    await register(client, "ok@test.com", "secret123")
    r = await client.post(
        "/auth/login", json={"email": "ok@test.com", "password": "secret123"}
    )
    assert r.status_code == 200
    assert "token" in r.json()


async def test_chat_requires_auth(client):
    r = await client.post("/chat", json={"message": "hi", "conversation_id": None})
    assert r.status_code == 401
