"use client";

import { useEffect, useRef, useState } from "react";

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [convos, setConvos] = useState<Convo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // The id we send with each message. Kept as a ref so async callbacks read the
  // latest value without stale-closure surprises.
  const conversationId = useRef<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // On load: fetch the sidebar list only. Start on a FRESH chat (no auto-restore).
  useEffect(() => {
    refreshConvos();
  }, []);

  async function refreshConvos() {
    const r = await fetch("/api/conversations");
    const data = await r.json();
    setConvos(data.conversations);
  }

  function newChat() {
    conversationId.current = null;
    setActiveId(null);
    setMessages([]);
    setInput("");
  }

  async function openChat(id: string) {
    conversationId.current = id;
    setActiveId(id);
    const r = await fetch(`/api/conversation/${id}`);
    const data = await r.json();
    setMessages(
      data.messages.map((m: { role: string; content: string }) => ({
        role: m.role === "user" ? "me" : "bot",
        text: m.content,
      })),
    );
  }

  async function sendText(text: string) {
    const clean = text.trim();
    if (!clean || loading) return;

    const wasNew = conversationId.current === null;
    setMessages((m) => [...m, { role: "me", text: clean }]);
    setInput("");
    setLoading(true);

    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: clean,
          conversation_id: conversationId.current,
        }),
      });
      const data = await r.json();
      conversationId.current = data.conversation_id;
      setActiveId(data.conversation_id);
      setMessages((m) => [...m, { role: "bot", text: data.reply }]);
      // If this message started a new conversation, refresh the sidebar.
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
            <button
              key={c.id}
              onClick={() => openChat(c.id)}
              className={
                "mb-1 w-full truncate rounded-lg px-3 py-2 text-left text-sm transition " +
                (c.id === activeId
                  ? "bg-white/[0.08] text-neutral-100"
                  : "text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200")
              }
              title={c.title}
            >
              {c.title}
            </button>
          ))}
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
