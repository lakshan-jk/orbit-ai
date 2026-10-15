# Orbit — 90-second demo script

A tight walkthrough for a screen recording or a live interview demo. The goal is
to show the *product* and name the *engineering* behind each beat.

**Setup (before recording):** `ollama serve` (with `llama3.2`), backend on `:8100`,
frontend on `:3000`. Have one throwaway account ready, or register live.

---

### 0:00 — Sign in (10s)
Open the app → the **login screen**.

> "Orbit is a local-first AI chatbot — the model runs on *my* machine, no API
> keys. It's multi-tenant, so first: sign in."

Register a new account. **Say:** *passwords are bcrypt-hashed; login returns a JWT
the client sends on every request — the API is stateless.*

### 0:15 — First message, streaming (20s)
Click a suggestion or type *"Explain async/await like I'm 10, with a code example."*

> "The reply **streams token-by-token** — FastAPI relays Ollama's stream straight
> to the browser."

When it lands, point at the **formatting**: *"Replies render as Markdown with
syntax-highlighted code — stored as raw text, rendered at the edge."*

### 0:40 — Memory (15s)
Ask a follow-up that depends on the first: *"Now rewrite that in Python."*

> "It remembers the conversation — every turn is persisted in Postgres, and old
> turns get summarized so the context stays bounded as chats grow."

### 0:55 — Sidebar CRUD (15s)
In the sidebar: **rename** this chat (double-click), **pin** it (jumps to top),
start a **New chat**, then **delete** one.

> "Full CRUD, all scoped to my account — another user can't see or touch these."

### 1:10 — Multi-tenancy proof (10s)
Open an incognito window, register a *second* account.

> "Brand-new user — empty history. Isolation is enforced in the query, not with
> scattered checks."

### 1:20 — The engineering (10s)
> "Under the hood: async FastAPI + SQLAlchemy, Alembic migrations, JWT auth,
> rate limiting, a pytest suite in CI, and it's fully dockerized — one command
> brings up Postgres, the model, and the app."

End on the repo / README.

---

### One-liner
> "A private, multi-tenant, streaming AI chat — local model, Postgres-backed,
> tested, and dockerized. Zero API cost, and no data leaves the box."
