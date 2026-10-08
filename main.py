import json
import uuid

import httpx
from fastapi import FastAPI
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select

from db import SessionLocal
from models import Conversation, Message

# `app` is our waiter. Every route below is something the waiter knows how to do.
app = FastAPI(title="Pulse")

# Where the kitchen (Ollama) lives, and which cook (model) we use.
OLLAMA_URL = "http://127.0.0.1:11434/api/chat"
MODEL = "llama3.2"


# The shape of an incoming order. `conversation_id` is optional: on the very
# first message the client has none, so the server creates one and hands it back.
class ChatRequest(BaseModel):
    message: str
    conversation_id: str | None = None


@app.get("/")
def home():
    # Serve the chat web page (the "dining room").
    return FileResponse("static/index.html")


@app.get("/health")
def health():
    # A GET request to "/health" just confirms the server is alive.
    return {"status": "ok", "bot": "Pulse"}


@app.get("/conversations")
async def list_conversations():
    # The sidebar list, newest first — one row per conversation.
    async with SessionLocal() as session:
        rows = await session.scalars(
            select(Conversation).order_by(Conversation.created_at.desc()).limit(50)
        )
        return {
            "conversations": [{"id": c.id, "title": c.title} for c in rows]
        }


@app.get("/conversation/{conv_id}")
async def get_conversation(conv_id: str):
    # Load one conversation's messages (oldest first) so the UI can reopen it.
    async with SessionLocal() as session:
        rows = await session.scalars(
            select(Message)
            .where(Message.conversation_id == conv_id)
            .order_by(Message.id)
        )
        return {
            "messages": [{"role": m.role, "content": m.content} for m in rows]
        }


@app.post("/chat")
async def chat(req: ChatRequest):
    is_new = req.conversation_id is None
    conv_id = req.conversation_id or str(uuid.uuid4())

    async with SessionLocal() as session:
        # 1. A brand-new conversation gets its own row, titled by the first message.
        if is_new:
            session.add(Conversation(id=conv_id, title=req.message[:40]))

        # 2. Load prior messages from Postgres to rebuild the history (the "memory").
        prior = await session.scalars(
            select(Message)
            .where(Message.conversation_id == conv_id)
            .order_by(Message.id)
        )
        history = [{"role": m.role, "content": m.content} for m in prior]

        # 3. Add the new user message — to both the history and the database.
        history.append({"role": "user", "content": req.message})
        session.add(
            Message(conversation_id=conv_id, role="user", content=req.message)
        )

        # 4. Send the ENTIRE history to the kitchen — this is what "memory" means.
        payload = {"model": MODEL, "messages": history, "stream": False}
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(OLLAMA_URL, json=payload)
            data = r.json()
        reply = data["message"]["content"]

        # 5. Persist the assistant's reply, then commit everything in one transaction.
        session.add(
            Message(conversation_id=conv_id, role="assistant", content=reply)
        )
        await session.commit()

    # 6. Return the reply AND the conversation id (client stores it for next time).
    return {"reply": reply, "conversation_id": conv_id}


@app.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    # Same logic as /chat, but we relay tokens to the browser as they arrive.
    is_new = req.conversation_id is None
    conv_id = req.conversation_id or str(uuid.uuid4())

    async def token_stream():
        # The DB session stays open for the whole stream, so we can save the
        # finished reply at the end — all inside one generator.
        async with SessionLocal() as session:
            if is_new:
                session.add(Conversation(id=conv_id, title=req.message[:40]))

            prior = await session.scalars(
                select(Message)
                .where(Message.conversation_id == conv_id)
                .order_by(Message.id)
            )
            history = [{"role": m.role, "content": m.content} for m in prior]
            history.append({"role": "user", "content": req.message})
            session.add(
                Message(conversation_id=conv_id, role="user", content=req.message)
            )
            await session.commit()  # persist the user turn before we start talking

            payload = {"model": MODEL, "messages": history, "stream": True}
            parts: list[str] = []
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream("POST", OLLAMA_URL, json=payload) as resp:
                    # Ollama streams newline-delimited JSON — one object per token.
                    async for line in resp.aiter_lines():
                        if not line.strip():
                            continue
                        chunk = json.loads(line)
                        token = chunk.get("message", {}).get("content", "")
                        if token:
                            parts.append(token)
                            yield token  # push this token straight to the browser
                        if chunk.get("done"):
                            break

            # Stream done: persist the full assistant reply.
            session.add(
                Message(
                    conversation_id=conv_id,
                    role="assistant",
                    content="".join(parts),
                )
            )
            await session.commit()

    # The conversation id travels in a header (sent before the streamed body).
    return StreamingResponse(
        token_stream(),
        media_type="text/plain; charset=utf-8",
        headers={"X-Conversation-Id": conv_id},
    )
