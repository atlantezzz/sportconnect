"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useParams } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";

type Message = { bericht_id: number; afzender_id: number; ontvanger_id: number; inhoud: string; verzonden_op: string; afzender_naam: string };
type Payload = { friend?: { gebruiker_id: number; naam: string }; messages?: Message[]; detail?: string };

function PrivateMessageContent() {
  const params = useParams<{ friendUserId: string }>();
  const friendId = Number(params.friendUserId);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [myId, setMyId] = useState<number | null>(null);
  const [myName, setMyName] = useState<string | null>(null);
  const [friendName, setFriendName] = useState("Privégesprek");
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("sportconnect-theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
    fetch("/api/auth/me", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(d => { setMyId(d?.user?.gebruiker_id ?? null); setMyName(d?.user?.naam ?? null); }).catch(() => {});
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("sportconnect-theme", theme); }, [theme]);

  const loadMessages = useCallback(async () => {
    if (!Number.isInteger(friendId) || friendId <= 0) return;
    try {
      const response = await fetch(`/api/messages/${friendId}`, { cache: "no-store" });
      const data: Payload = await response.json();
      if (!response.ok) throw new Error(data.detail || "Gesprek kon niet worden geladen.");
      setFriendName(data.friend?.naam || "Privégesprek");
      setMessages(data.messages || []);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Gesprek kon niet worden geladen."); }
  }, [friendId]);

  useEffect(() => { void loadMessages(); const timer = window.setInterval(() => void loadMessages(), 4000); return () => window.clearInterval(timer); }, [loadMessages]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  async function send(event: FormEvent) {
    event.preventDefault(); const inhoud = text.trim(); if (!inhoud || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/messages/${friendId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inhoud }) });
      const data: Payload = await response.json();
      if (!response.ok) throw new Error(data.detail || "Bericht kon niet worden verstuurd.");
      setText(""); await loadMessages();
    } catch (e) { setError(e instanceof Error ? e.message : "Bericht kon niet worden verstuurd."); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen theme-page flex flex-col">
    <SiteHeader theme={theme} onThemeToggle={() => setTheme(v => v === "dark" ? "light" : "dark")} userName={myName} onHome={() => { window.location.href = "/"; }} onLogout={async () => { const r = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }); if (r.ok) window.location.replace("/"); }} />
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-3 py-5 sm:px-6">
      <div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-emerald-600">Privéberichten</p><h1 className="mt-1 text-2xl font-black">{friendName}</h1><p className="mt-1 text-sm theme-muted">Alleen zichtbaar voor jou en deze vriend.</p></div><button onClick={() => { window.location.href = "/friends"; }} className="rounded-xl border px-4 py-2 text-sm font-semibold theme-surface-muted">← Vrienden</button></div>
      <section className="theme-surface flex min-h-[60vh] flex-1 flex-col overflow-hidden rounded-2xl border shadow-sm">
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6" aria-live="polite">
          {messages.length === 0 && !error && <div className="grid min-h-64 place-items-center text-center"><div><div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-emerald-700/10 text-2xl text-emerald-600">✉</div><h2 className="font-bold">Begin het gesprek</h2><p className="mt-1 max-w-sm text-sm theme-muted">Stuur een privébericht om een sportmoment af te spreken of even bij te praten.</p></div></div>}
          {messages.map(message => { const own = message.afzender_id === myId; return <div key={message.bericht_id} className={`flex ${own ? "justify-end" : "justify-start"}`}><article className={`max-w-[85%] rounded-2xl px-4 py-3 sm:max-w-[70%] ${own ? "bg-emerald-700 text-white" : "theme-message-incoming border"}`}><p className="mb-1 text-xs font-semibold opacity-80">{own ? "Jij" : message.afzender_naam}</p><p className="whitespace-pre-wrap break-words text-sm leading-6">{message.inhoud}</p><time className="mt-2 block text-right text-[10px] opacity-70">{new Date(message.verzonden_op).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" })}</time></article></div>; })}<div ref={bottomRef}/>
        </div>
        {error && <p role="alert" className="mx-4 mb-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">{error}</p>}
        <form onSubmit={send} className="flex items-end gap-2 border-t p-3 sm:p-4"><textarea value={text} onChange={e => setText(e.target.value)} maxLength={4000} rows={2} placeholder="Typ een privébericht…" className="theme-input min-h-12 flex-1 resize-y rounded-xl border px-3 py-3 text-sm" aria-label="Privébericht"/><button disabled={!text.trim() || busy} className="min-h-12 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Versturen…" : "Verstuur"}</button></form>
      </section>
    </div>
  </main>;
}


export default function PrivateMessagePage() {
  return <Suspense fallback={<main className="min-h-screen theme-page grid place-items-center"><p className="text-sm theme-muted">Privégesprek laden…</p></main>}><PrivateMessageContent /></Suspense>;
}
