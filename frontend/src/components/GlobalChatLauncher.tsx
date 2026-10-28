"use client";

import { useEffect, useState } from "react";

type ChatActivity = { activiteit_id?: number; id?: number; titel?: string; title?: string; starttijd?: string; time?: string; status?: string };

export default function GlobalChatLauncher() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ChatActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoading(true); setError("");
      try {
        const response = await fetch("/api/activities", { cache: "no-store" });
        const raw = await response.json();
        if (!response.ok) throw new Error("Groepschats konden niet worden geladen.");
        const rows: ChatActivity[] = Array.isArray(raw) ? raw : Array.isArray(raw.activities) ? raw.activities : Array.isArray(raw.activiteiten) ? raw.activiteiten : [];
        const candidates = rows.slice(0, 30);
        const allowed: ChatActivity[] = [];
        for (const activity of candidates) {
          const id = activity.activiteit_id ?? (activity.id && activity.id >= 100000 ? activity.id - 100000 : activity.id);
          if (!id) continue;
          try {
            const r = await fetch(`/api/activities/${id}/chat`, { cache: "no-store" });
            if (r.ok) allowed.push({ ...activity, activiteit_id: id });
          } catch {}
        }
        if (!cancelled) setItems(allowed);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Groepschats konden niet worden geladen.");
      } finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [open]);

  return <div className="chat-launcher-root flex flex-col items-end gap-3">
    {open && <section className="chat-launcher-panel w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-2xl border shadow-2xl theme-surface">
      <header className="flex items-center justify-between bg-emerald-800 px-4 py-3 text-white"><div><p className="font-bold">Groepschats</p><p className="text-xs text-emerald-100">Je activiteiten</p></div><button type="button" onClick={() => setOpen(false)} aria-label="Chatmenu sluiten">✕</button></header>
      <div className="max-h-80 overflow-y-auto p-2">
        {loading ? <p className="p-4 text-sm theme-muted">Groepschats laden…</p> : error ? <p className="p-4 text-sm text-red-500">{error}</p> : items.length ? items.map(a => <a key={a.activiteit_id} href={`/activities/${a.activiteit_id}/chat`} className="block rounded-xl p-3 transition hover:bg-emerald-700/10"><p className="text-sm font-semibold">{a.titel ?? a.title ?? `Activiteit ${a.activiteit_id}`}</p><p className="mt-1 text-xs theme-muted">{a.time ?? a.starttijd ?? "Groepschat openen"}</p></a>) : <p className="p-4 text-sm theme-muted">Je hebt geen toegankelijke groepschats gevonden.</p>}
      </div>
    </section>}
    <button type="button" className="chat-launcher-button grid h-12 w-12 place-items-center rounded-full shadow-lg transition hover:-translate-y-1" onClick={() => setOpen(v => !v)} aria-label="Groepschats openen" aria-expanded={open}>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.5 8.5 0 0 1-3.5-.8L4 20l1.1-3.6A7.3 7.3 0 0 1 4 12c0-4.1 3.6-7.5 8-7.5s8 3.1 8 7Z" strokeLinecap="round" strokeLinejoin="round"/><path d="M8 12h.01M12 12h.01M16 12h.01" strokeLinecap="round"/></svg>
    </button>
  </div>;
}
