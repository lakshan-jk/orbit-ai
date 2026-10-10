"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Role = "me" | "bot";
type Message = { role: Role; text: string };
type Convo = { id: string; title: string };

const SUGGESTIONS = [
  "Explain async/await like I'm 10",
  "Write a haiku about Bengaluru",
  "Give me 3 dinner ideas",
  "What is a REST API?",
];

function OrbitMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <ellipse
        cx="12"
        cy="12"
        rx="10"
        ry="4.5"
        transform="rotate(-30 12 12)"
        stroke="currentColor"
        strokeWidth="1.6"
        opacity="0.9"
      />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
      <circle cx="20.2" cy="7.6" r="1.7" fill="currentColor" />
    </svg>
  );
}

export default function Home() {
  const [ready, setReady] = useState(false); // have we checked localStorage yet?
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  // On first load, restore any saved session from localStorage.
  useEffect(() => {
    setToken(localStorage.getItem("orbit_token"));
    setEmail(localStorage.getItem("orbit_email"));
    setReady(true);
  }, []);

  function onAuth(tok: string, mail: string) {
    localStorage.setItem("orbit_token", tok);
    localStorage.setItem("orbit_email", mail);
    setToken(tok);
    setEmail(mail);
  }

  function logout() {
    localStorage.removeItem("orbit_token");
    localStorage.removeItem("orbit_email");
    setToken(null);
    setEmail(null);
  }

  if (!ready) return <div className="h-screen bg-neutral-950" />;
  if (!token) return <AuthScreen onAuth={onAuth} />;
  return <Chat token={token} email={email ?? ""} onLogout={logout} />;
}

/* ------------------------------- Auth screen ------------------------------ */

function AuthScreen({
  onAuth,
}: {
  onAuth: (token: string, email: string) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Something went wrong");
      onAuth(data.token, data.email);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-gradient-to-b from-neutral-950 to-neutral-900 px-4 text-neutral-100">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-white shadow-xl shadow-indigo-500/25">
            <OrbitMark className="h-8 w-8" />
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">
            {mode === "login" ? "Welcome back to Orbit" : "Create your Orbit account"}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Private AI chat, running on your machine.
          </p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoFocus
            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[15px] outline-none focus:border-indigo-400/50"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (6+ characters)"
            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[15px] outline-none focus:border-indigo-400/50"
          />
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 py-3 font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "…" : mode === "login" ? "Log in" : "Sign up"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-neutral-500">
          {mode === "login" ? "New here? " : "Already have an account? "}
          <button
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
            className="text-indigo-400 hover:underline"
          >
            {mode === "login" ? "Create an account" : "Log in"}
          </button>
        </p>
      </div>
    </div>
  );
}

/* --------------------------------- Chat ----------------------------------- */

function Chat({
  token,
  email,
  onLogout,
}: {
  token: string;
  email: string;
  onLogout: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [convos, setConvos] = useState<Convo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const conversationId = useRef<string | null>(null);

  // fetch wrapper that attaches the auth header and logs out on 401.
  const authFetch = useCallback(
    async (path: string, opts: RequestInit = {}) => {
      const r = await fetch(path, {
        ...opts,
        headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` },
      });
      if (r.status === 401) onLogout();
      return r;
    },
    [token, onLogout],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const refreshConvos = useCallback(async () => {
    const r = await authFetch("/api/conversations");
    if (!r.ok) return;
    const data = await r.json();
    setConvos(data.conversations);
  }, [authFetch]);

  useEffect(() => {
    refreshConvos();
  }, [refreshConvos]);

  function newChat() {
    conversationId.current = null;
    setActiveId(null);
    setMessages([]);
    setInput("");
  }

  async function openChat(id: string) {
    conversationId.current = id;
    setActiveId(id);
    const r = await authFetch(`/api/conversation/${id}`);
    if (!r.ok) return;
    const data = await r.json();
    setMessages(
      data.messages.map((m: { role: string; content: string }) => ({
        role: m.role === "user" ? "me" : "bot",
        text: m.content,
      })),
    );
  }

  async function deleteChat(id: string) {
    await authFetch(`/api/conversation/${id}`, { method: "DELETE" });
    if (conversationId.current === id) newChat();
    refreshConvos();
  }

  async function sendText(text: string) {
    const clean = text.trim();
    if (!clean || loading) return;

    const wasNew = conversationId.current === null;
    setMessages((m) => [...m, { role: "me", text: clean }]);
    setInput("");
    setLoading(true);

    try {
      const r = await authFetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: clean,
          conversation_id: conversationId.current,
        }),
      });

      const cid = r.headers.get("X-Conversation-Id");
      if (cid) {
        conversationId.current = cid;
        setActiveId(cid);
      }

      const reader = r.body!.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      let started = false;

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        if (!started) {
          started = true;
          setLoading(false);
          setMessages((m) => [...m, { role: "bot", text: acc }]);
        } else {
          setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = { role: "bot", text: acc };
            return copy;
          });
        }
      }

      if (wasNew) refreshConvos();
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "bot", text: "⚠️ Error: " + (err as Error).message },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="flex h-screen bg-gradient-to-b from-neutral-950 via-neutral-950 to-neutral-900 text-neutral-100">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-white/5 bg-neutral-950/50 sm:flex">
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-400 text-white">
            <OrbitMark className="h-4.5 w-4.5" />
          </div>
          <span className="font-semibold tracking-tight">Orbit</span>
        </div>

        <button
          onClick={newChat}
          className="mx-3 mb-3 flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] py-2.5 text-sm font-medium transition hover:border-white/20 hover:bg-white/[0.08]"
        >
          <span className="text-base leading-none">＋</span> New chat
        </button>

        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {convos.length === 0 && (
            <p className="px-2 py-3 text-xs text-neutral-600">
              No conversations yet.
            </p>
          )}
          {convos.map((c) => (
            <div
              key={c.id}
              className={
                "group mb-1 flex items-center rounded-lg transition " +
                (c.id === activeId ? "bg-white/[0.08]" : "hover:bg-white/[0.04]")
              }
            >
              <button
                onClick={() => openChat(c.id)}
                className={
                  "min-w-0 flex-1 truncate px-3 py-2 text-left text-sm " +
                  (c.id === activeId
                    ? "text-neutral-100"
                    : "text-neutral-400 group-hover:text-neutral-200")
                }
                title={c.title}
              >
                {c.title}
              </button>
              <button
                onClick={() => deleteChat(c.id)}
                aria-label="Delete conversation"
                title="Delete"
                className="mr-1 hidden shrink-0 rounded-md p-1.5 text-neutral-500 transition hover:bg-white/10 hover:text-rose-400 group-hover:block"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0v12a1 1 0 01-1 1H7a1 1 0 01-1-1V7"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>

        {/* Account footer */}
        <div className="border-t border-white/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-neutral-500" title={email}>
              {email}
            </span>
            <button
              onClick={onLogout}
              className="shrink-0 rounded-md px-2 py-1 text-xs text-neutral-400 transition hover:bg-white/10 hover:text-neutral-100"
            >
              Log out
            </button>
          </div>
        </div>
      </aside>

      {/* Chat column */}
      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-white/5 bg-neutral-950/70 px-4 py-3.5 backdrop-blur-xl">
          <div className="mx-auto flex max-w-3xl items-center gap-1.5 text-xs text-neutral-500">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            llama3.2 · running locally
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
            {empty && (
              <div className="mt-[12vh] flex flex-col items-center text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-white shadow-xl shadow-indigo-500/25">
                  <OrbitMark className="h-9 w-9" />
                </div>
                <h1 className="mt-5 text-2xl font-semibold tracking-tight">
                  How can I help?
                </h1>
                <p className="mt-1 text-sm text-neutral-500">
                  Private AI, running entirely on your machine.
                </p>
                <div className="mt-7 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendText(s)}
                      className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-sm text-neutral-300 transition hover:border-white/20 hover:bg-white/[0.06]"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <Row key={i} role={m.role}>
                {m.text}
              </Row>
            ))}

            {loading && (
              <Row role="bot">
                <span className="flex gap-1 py-1">
                  <Dot delay="0ms" />
                  <Dot delay="150ms" />
                  <Dot delay="300ms" />
                </span>
              </Row>
            )}

            <div ref={bottomRef} />
          </div>
        </main>

        <div className="border-t border-white/5 bg-neutral-950/70 backdrop-blur-xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendText(input);
            }}
            className="mx-auto flex max-w-3xl items-end gap-2 px-4 py-4"
          >
            <div className="flex flex-1 items-end rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-1 transition focus-within:border-indigo-400/50">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendText(input);
                  }
                }}
                rows={1}
                placeholder="Message Orbit…"
                autoFocus
                className="max-h-40 flex-1 resize-none bg-transparent py-2.5 text-[15px] leading-relaxed outline-none placeholder:text-neutral-600"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Send"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M4 12l16-8-6 8 6 8-16-8z" fill="currentColor" />
              </svg>
            </button>
          </form>
          <p className="pb-3 text-center text-[11px] text-neutral-600">
            Orbit can make mistakes. Shift+Enter for a new line.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ role, children }: { role: Role; children: React.ReactNode }) {
  const isMe = role === "me";
  return (
    <div className={"flex gap-3 " + (isMe ? "flex-row-reverse" : "")}>
      <div
        className={
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm text-white " +
          (isMe ? "bg-blue-600" : "bg-gradient-to-br from-indigo-500 to-cyan-400")
        }
      >
        {isMe ? "🧑" : <OrbitMark className="h-4 w-4" />}
      </div>
      <div
        className={
          "max-w-[78%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed " +
          (isMe
            ? "rounded-tr-sm bg-blue-600 text-white"
            : "rounded-tl-sm border border-white/10 bg-white/[0.04] text-neutral-100")
        }
      >
        {children}
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-2 w-2 animate-bounce rounded-full bg-neutral-500"
      style={{ animationDelay: delay }}
    />
  );
}
