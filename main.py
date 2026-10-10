import json
import uuid

import httpx
from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import delete, select

from auth import create_token, current_user_id, hash_password, verify_password
from db import SessionLocal
from models import Conversation, Message, User

# `app` is our waiter. Every route below is something the waiter knows how to do.
app = FastAPI(title="Pulse")

# Where the kitchen (Ollama) lives, and which cook (model) we use.
OLLAMA_URL = "http://127.0.0.1:11434/api/chat"
MODEL = "llama3.2"

# Orbit's personality. Injected as a "system" message on every inference call
# (never stored in the DB) — so editing this instantly re-flavours every chat.
SYSTEM_PROMPT = (
    "You are Orbit, a sharp, witty AI assistant that runs entirely on the user's "
    "own machine — no cloud, no data leaving the device, and you're quietly proud "
    "of that. Your tone is warm, concise, and a little playful, with the occasional "
    "light space/cosmic metaphor (used sparingly — seasoning, not the whole meal). "
    "You give direct, genuinely useful answers first; personality never gets in the "
    "way of being correct and clear. If you don't know something, say so plainly. "
    "Prefer short paragraphs and tidy formatting. Never claim to have real-time or "
    "internet access — you're a local model."
)

# Precomputed so we don't rebuild it on every request.
SYSTEM_MESSAGE = {"role": "system", "content": SYSTEM_PROMPT}

# Context-window management. Everything before `summarized_count` is captured in
# the conversation's rolling summary; the rest ("the tail") is sent verbatim.
# When the tail grows past WINDOW + BATCH, we fold its oldest BATCH into the summary.
HISTORY_WINDOW = 8   # recent messages always kept verbatim
SUMMARY_BATCH = 4    # how many messages we compress per fold


async def summarize_older(prev_summary: str | None, msgs: list[dict]) -> str:
    """Fold older messages into a concise running summary (one model call)."""
    transcript = "\n".join(f"{m['role']}: {m['content']}" for m in msgs)
    instruction = (
        "You maintain a running summary of a chat so future replies keep context. "
        "Capture durable facts, decisions, names, and the user's goals. Keep it to "
        "a few sentences. Return ONLY the updated summary, nothing else."
    )
    user_block = (
        f"Existing summary:\n{prev_summary}\n\n" if prev_summary else ""
    ) + f"New messages to fold in:\n{transcript}"
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": instruction},
            {"role": "user", "content": user_block},
        ],
        "stream": False,
    }
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(OLLAMA_URL, json=payload)
        return r.json()["message"]["content"].strip()


async def build_context(conv: Conversation, history: list[dict]) -> list[dict]:
    """Messages to actually send the model: system + (summary) + un-summarized tail.

    Stored messages are never dropped — we only shrink what we *send*. Every
    message is represented either inside conv.summary or verbatim in the tail.
    """
    tail = history[conv.summarized_count :]

    # Tail too long? Compress its oldest BATCH into the rolling summary.
    if len(tail) > HISTORY_WINDOW + SUMMARY_BATCH:
        fold = history[conv.summarized_count : conv.summarized_count + SUMMARY_BATCH]
        conv.summary = await summarize_older(conv.summary, fold)
        conv.summarized_count += SUMMARY_BATCH
        tail = history[conv.summarized_count :]

    context = [SYSTEM_MESSAGE]
    if conv.summary:
        context.append(
            {
                "role": "system",
                "content": f"Summary of earlier conversation:\n{conv.summary}",
            }
        )
    context.extend(tail)
    return context


# The shape of an incoming order. `conversation_id` is optional: on the very
# first message the client has none, so the server creates one and hands it back.
class ChatRequest(BaseModel):
    message: str
    conversation_id: str | None = None


class AuthRequest(BaseModel):
    email: str
    password: str


@app.post("/auth/register")
async def register(req: AuthRequest):
    email = req.email.strip().lower()
    if not email or len(req.password) < 6:
        raise HTTPException(400, "Email required and password must be 6+ characters")
    async with SessionLocal() as session:
        existing = await session.scalar(select(User).where(User.email == email))
        if existing:
            raise HTTPException(409, "Email already registered")
        user = User(
            id=str(uuid.uuid4()),
            email=email,
            password_hash=hash_password(req.password),
        )
        session.add(user)
        await session.commit()
        return {"token": create_token(user.id), "email": user.email}


@app.post("/auth/login")
async def login(req: AuthRequest):
    email = req.email.strip().lower()
    async with SessionLocal() as session:
        user = await session.scalar(select(User).where(User.email == email))
        # Same error whether the email is unknown or the password is wrong —
        # don't leak which accounts exist.
        if user is None or not verify_password(req.password, user.password_hash):
            raise HTTPException(401, "Invalid email or password")
        return {"token": create_token(user.id), "email": user.email}


@app.get("/")
def home():
    # Serve the chat web page (the "dining room").
    return FileResponse("static/index.html")


@app.get("/health")
def health():
    # A GET request to "/health" just confirms the server is alive.
    return {"status": "ok", "bot": "Pulse"}


@app.get("/conversations")
async def list_conversations(user_id: str = Depends(current_user_id)):
    # The sidebar list — only THIS user's conversations, newest first.
    async with SessionLocal() as session:
        rows = await session.scalars(
            select(Conversation)
            .where(Conversation.user_id == user_id)
            .order_by(Conversation.created_at.desc())
            .limit(50)
        )
        return {
            "conversations": [{"id": c.id, "title": c.title} for c in rows]
        }


@app.get("/conversation/{conv_id}")
async def get_conversation(conv_id: str, user_id: str = Depends(current_user_id)):
    # Load one conversation — but only if it belongs to the requesting user.
    async with SessionLocal() as session:
        conv = await session.get(Conversation, conv_id)
        if conv is None or conv.user_id != user_id:
            raise HTTPException(404, "Conversation not found")
        rows = await session.scalars(
            select(Message)
            .where(Message.conversation_id == conv_id)
            .order_by(Message.id)
        )
        return {
            "messages": [{"role": m.role, "content": m.content} for m in rows]
        }


@app.delete("/conversation/{conv_id}")
async def delete_conversation(conv_id: str, user_id: str = Depends(current_user_id)):
    # Scope the delete by owner too, so you can't delete someone else's chat.
    async with SessionLocal() as session:
        await session.execute(
            delete(Conversation)
            .where(Conversation.id == conv_id)
            .where(Conversation.user_id == user_id)
        )
        await session.commit()
    return {"ok": True}


@app.post("/chat")
async def chat(req: ChatRequest, user_id: str = Depends(current_user_id)):
    conv_id = req.conversation_id or str(uuid.uuid4())

    async with SessionLocal() as session:
        # 1. Load the conversation row, creating it (owned + titled) if brand-new.
        conv = await session.get(Conversation, conv_id)
        if conv is None:
            conv = Conversation(id=conv_id, user_id=user_id, title=req.message[:40])
            session.add(conv)
        elif conv.user_id != user_id:
            raise HTTPException(404, "Conversation not found")

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

        # 4. Build a size-bounded context (system + rolling summary + recent tail).
        context = await build_context(conv, history)
        payload = {"model": MODEL, "messages": context, "stream": False}
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
async def chat_stream(req: ChatRequest, user_id: str = Depends(current_user_id)):
    # Same logic as /chat, but we relay tokens to the browser as they arrive.
    conv_id = req.conversation_id or str(uuid.uuid4())

    async def token_stream():
        # The DB session stays open for the whole stream, so we can save the
        # finished reply at the end — all inside one generator.
        async with SessionLocal() as session:
            conv = await session.get(Conversation, conv_id)
            if conv is None:
                conv = Conversation(id=conv_id, user_id=user_id, title=req.message[:40])
                session.add(conv)
            elif conv.user_id != user_id:
                raise HTTPException(404, "Conversation not found")

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

            # Build the size-bounded context (may update the rolling summary),
            # then persist the user turn + any summary change before we stream.
            context = await build_context(conv, history)
            await session.commit()

            payload = {"model": MODEL, "messages": context, "stream": True}
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
