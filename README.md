# orbit-ai 🛰️

A private, local AI chatbot — chat with an LLM running entirely on your machine. No API keys, no cloud, no cost.

## Stack

- **Frontend:** Next.js (App Router, TypeScript, Tailwind) — `web/`
- **Backend:** FastAPI (Python) — `main.py`
- **Model:** Ollama + `llama3.2` (local)
- **Storage:** PostgreSQL via SQLAlchemy ORM + Alembic migrations

## Features

- Conversational memory (full transcript persisted per conversation)
- ChatGPT-style sidebar: new chat + past conversations
- Fully local — the model and your data never leave your machine

## Running locally

**Prerequisites:** Python 3, Node, [Ollama](https://ollama.com) with `llama3.2` pulled, and PostgreSQL.

```bash
# 1. Database
createdb orbit
cd ~/pulse
./.venv/bin/alembic upgrade head        # apply migrations

# 2. Backend (FastAPI on :8100)
./.venv/bin/uvicorn main:app --port 8100

# 3. Frontend (Next.js on :3000)
cd web && npm install && npm run dev
```

Then open the frontend in your browser and start chatting.

## Architecture

```
Browser → Next.js (proxy /api/*) → FastAPI → Ollama (llama3.2)
                                       ↓
                                  PostgreSQL
```
