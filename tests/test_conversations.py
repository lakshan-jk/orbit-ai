from conftest import register


async def test_chat_creates_conversation(client):
    auth = await register(client)
    r = await client.post(
        "/chat", json={"message": "Hello", "conversation_id": None}, headers=auth
    )
    assert r.status_code == 200
    body = r.json()
    assert body["reply"] == "mocked reply"
    assert body["conversation_id"]

    # It shows up in the owner's list, titled from the first message.
    lst = await client.get("/conversations", headers=auth)
    convos = lst.json()["conversations"]
    assert len(convos) == 1
    assert convos[0]["title"] == "Hello"


async def test_tenant_isolation(client):
    a = await register(client, "a@test.com")
    b = await register(client, "b@test.com")

    made = await client.post(
        "/chat", json={"message": "A's chat", "conversation_id": None}, headers=a
    )
    cid = made.json()["conversation_id"]

    # B sees an empty list...
    assert (await client.get("/conversations", headers=b)).json()["conversations"] == []
    # ...and cannot open A's conversation.
    assert (await client.get(f"/conversation/{cid}", headers=b)).status_code == 404
    # A can.
    assert (await client.get(f"/conversation/{cid}", headers=a)).status_code == 200


async def test_rename_and_pin_ordering(client):
    auth = await register(client)
    c1 = (
        await client.post(
            "/chat", json={"message": "First", "conversation_id": None}, headers=auth
        )
    ).json()["conversation_id"]
    c2 = (
        await client.post(
            "/chat", json={"message": "Second", "conversation_id": None}, headers=auth
        )
    ).json()["conversation_id"]

    # Newest first by default.
    titles = [c["title"] for c in (await client.get("/conversations", headers=auth)).json()["conversations"]]
    assert titles == ["Second", "First"]

    # Rename + pin the older one.
    patched = await client.patch(
        f"/conversation/{c1}", json={"title": "Pinned one", "pinned": True}, headers=auth
    )
    assert patched.status_code == 200
    assert patched.json()["pinned"] is True

    # Pinned now sorts first despite being older.
    convos = (await client.get("/conversations", headers=auth)).json()["conversations"]
    assert convos[0]["title"] == "Pinned one"
    assert convos[0]["pinned"] is True
    assert c2  # (second still present)


async def test_delete_conversation(client):
    auth = await register(client)
    cid = (
        await client.post(
            "/chat", json={"message": "Delete me", "conversation_id": None}, headers=auth
        )
    ).json()["conversation_id"]

    assert (await client.delete(f"/conversation/{cid}", headers=auth)).status_code == 200
    assert (await client.get("/conversations", headers=auth)).json()["conversations"] == []


async def test_cannot_delete_others_conversation(client):
    a = await register(client, "a@test.com")
    b = await register(client, "b@test.com")
    cid = (
        await client.post(
            "/chat", json={"message": "A's", "conversation_id": None}, headers=a
        )
    ).json()["conversation_id"]

    # B's delete is a no-op (scoped by owner); A's chat survives.
    await client.delete(f"/conversation/{cid}", headers=b)
    assert len((await client.get("/conversations", headers=a)).json()["conversations"]) == 1
