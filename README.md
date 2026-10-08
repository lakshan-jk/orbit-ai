# orbit-ai 🛰️

A private, local-first AI chatbot. An LLM runs entirely on your machine — **no API keys, no cloud, no per-token cost** — behind a production-shaped full-stack architecture: typed React client, async Python API, relational persistence, and versioned schema migrations.

> Built as a study in getting the *fundamentals* right: clean service boundaries, a storage layer that evolved without breaking its consumers, and migrations you could run against a real production database.

---

## Table of contents
- [Architecture](#architecture)
- [Request lifecycle](#request-lifecycle)
- [Data model](#data-model)
- [API](#api)
- [Design decisions & trade-offs](#design-decisions--trade-offs)
- [Scaling: what changes at 10×/100×](#scaling-what-changes-at-10100)
- [Running locally](#running-locally)
- [Project layout](#project-layout)

---

## Architecture

```
┌────────────┐     /api/*      ┌──────────────┐    /api/chat    ┌──────────────┐
│  Browser   │ ───────────────▶│   Next.js    │ ───────────────▶│   FastAPI    │
│ (React UI) │   same-origin   │  (rewrite    │   HTTP (JSON)   │  (async)     │
│            │◀─────────────── │   proxy)     │◀─────────────── │              │
└────────────┘                 └──────────────┘                 └──────┬───────┘
                                                                        │
                                                   async SQLAlchemy     │   httpx (async)
                                                        session         │
                                                                 ┌──────▼───────┐   ┌─────────────┐
                                                                 │ PostgreSQL   │   │   Ollama    │
                                                                 │ conversations│   │  llama3.2   │
                                                                 │ + messages   │   │  (local)    │
                                                                 └──────────────┘   └─────────────┘
```

**Boundary rationale**

| Layer | Responsibility | Why it's isolated |
|-------|---------------|-------------------|
| Next.js | Rendering, UX state, optimistic updates | Frontend can ship/deploy independently; the proxy means the browser only ever talks to its own origin |
| Rewrite proxy | Forwards `/api/*` → API server | Eliminates CORS; lets the API move hosts without a client rebuild |
| FastAPI | Orchestration, persistence, model I/O | Stateless request handlers — horizontally scalable |
| PostgreSQL | Durable source of truth | Relational integrity + queryability the model layer shouldn't own |
| Ollama | Inference | Swappable (any model/provider) behind one HTTP call |

The API is **stateless**: every request reconstructs context from Postgres, so any number of API instances can sit behind a load balancer with no sticky sessions.

---

## Request lifecycle

A `POST /chat` with `{ message, conversation_id? }`:

1. **Resolve conversation** — use the supplied `conversation_id`, or mint a UUID for a new one (and create its row, titled from the first message).
2. **Rehydrate memory** — load prior messages for the conversation, ordered, from Postgres. *(LLMs are stateless; "memory" = replaying the transcript.)*
3. **Persist the user turn** — insert the user message.
4. **Infer** — send the full transcript to Ollama over async HTTP.
5. **Persist the assistant turn** — insert the reply.
6. **Commit** — steps 3–5 land in **one transaction**; a mid-flight failure leaves no half-written conversation.
7. **Respond** — `{ reply, conversation_id }`; the client stores the id for the next turn.

---

## Data model

One-to-many, with a cascading foreign key:

```
conversations                      messages
─────────────                      ────────
id         text  PK  ◀──────┐      id              int  PK (serial)
title      text             └───── conversation_id text FK (indexed, ON DELETE CASCADE)
created_at timestamptz             role            text  -- 'user' | 'assistant'
                                   content         text
                                   created_at      timestamptz
```

- **Messages are first-class rows**, not a JSON blob — so they can be counted, searched, paginated, and joined.
- `conversation_id` is **indexed** (every read filters on it) and **`ON DELETE CASCADE`** (deleting a conversation reaps its messages atomically).
- Schema is owned by **Alembic migrations**, version-tracked in an `alembic_version` table — the DB is reproducible from zero on any environment.

---

## API

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/chat` | Send a message; returns the full reply + conversation id |
| `POST` | `/chat/stream` | Same, but streams the reply token-by-token (conversation id in `X-Conversation-Id` header) |
| `GET`  | `/conversations` | Sidebar list (most recent 50) |
| `GET`  | `/conversation/{id}` | Full transcript for one conversation |
| `GET`  | `/health` | Liveness probe |

Request/response bodies are validated by **Pydantic** — malformed input is rejected at the edge before any handler logic runs.

---

## Design decisions & trade-offs

**Stateless API, state in Postgres.** Request handlers hold nothing between calls. Trade-off: a DB round-trip per turn — acceptable, and the price of horizontal scalability.

**Storage evolved behind a stable contract.** Persistence went **in-memory dict → Redis → PostgreSQL** while the HTTP API and the entire frontend stayed byte-for-byte unchanged. The lesson the repo is built to demonstrate: *a well-defined interface lets the implementation change underneath it.*

**Why Postgres over Redis (the end state).** Redis gave persistence but stored each conversation as one opaque JSON string. Postgres makes messages queryable rows with referential integrity — the right call once "list / search / analyze conversations" is on the table. Redis remains the natural choice *later* as a cache / hot-session tier, not the system of record.

**Rewrite proxy over CORS headers.** Routing `/api/*` through Next keeps the browser same-origin. Simpler than CORS, and it decouples where the API is hosted from the client bundle.

**Transactional writes.** User + assistant messages commit together, so inference failure never persists a dangling half-turn.

**Async end-to-end.** FastAPI + async SQLAlchemy + httpx mean a slow inference call parks on `await` instead of blocking a worker — one process serves many concurrent chats.

**Streaming as a pass-through pipe.** `/chat/stream` relays Ollama's token stream straight to the browser (`StreamingResponse`, chunked transfer) and buffers only to persist the finished reply in one transaction. Cuts *perceived* latency to the first token while keeping writes correct.

---

## Scaling: what changes at 10×/100×

Honest about current limits and the next moves:

- **Context window** — full-transcript replay grows unboundedly. *Next:* sliding window + periodic summarization of older turns.
- **Inference throughput** — one local Ollama is the bottleneck. *Next:* a model-server pool / hosted inference behind the same single call-site.
- **Hot reads** — reintroduce **Redis** as a cache for active conversations and the sidebar list; Postgres stays source of truth.
- **Multi-tenancy** — add a `users` table + auth; `conversations.user_id` is the natural partition/shard key.
- **Delivery** — containerize, add read replicas, and connection pooling (PgBouncer) as write/read load diverges.

---

## Running locally

**Prerequisites:** Python 3, Node, [Ollama](https://ollama.com) with `llama3.2` pulled, PostgreSQL.

```bash
# 1. Database + schema
createdb orbit
./.venv/bin/alembic upgrade head          # apply migrations

# 2. Backend — FastAPI on :8100
./.venv/bin/uvicorn main:app --port 8100

# 3. Frontend — Next.js on :3000
cd web && npm install && npm run dev
```

Open the frontend and start chatting. Nothing leaves your machine.

---

## Project layout

```
orbit-ai/
├── main.py              # FastAPI app — endpoints & orchestration
├── db.py                # async engine, session factory, declarative Base
├── models.py            # SQLAlchemy models: Conversation ─< Message
├── alembic/             # migrations (schema as code)
│   └── versions/
└── web/                 # Next.js client (App Router, TS, Tailwind)
    └── app/page.tsx     # chat UI + sidebar
```

---

## Tech

Next.js · React · TypeScript · Tailwind · FastAPI · Python · SQLAlchemy (async) · Alembic · PostgreSQL · Ollama (llama3.2) · httpx · Pydantic
