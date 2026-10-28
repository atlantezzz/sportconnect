"use client";

import { useEffect, useState, type FormEvent } from "react";
import SiteHeader from "@/components/SiteHeader";

type Person = { gebruiker_id: number; naam: string; woonplaats?: string | null; verzoek_id?: number; vriendschapsstatus?: string | null; richting?: string };
type FriendData = { friends: Person[]; incoming: Person[]; outgoing: Person[] };

export default function FriendsPage() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [name, setName] = useState<string | null>(null);
  const [data, setData] = useState<FriendData>({ friends: [], incoming: [], outgoing: [] });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function loadFriends() {
    const response = await fetch("/api/friends", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "Vrienden konden niet worden geladen.");
    setData(result);
  }
  useEffect(() => {
    const saved = localStorage.getItem("sportconnect-theme");
    if (saved === "dark" || saved === "light") setTheme(saved);
    fetch("/api/auth/me", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(d => setName(d?.user?.naam ?? null)).catch(() => setName(null));
    loadFriends().catch(e => setError(e.message));
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("sportconnect-theme", theme); }, [theme]);

  async function searchUsers(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    if (query.trim().length < 2) { setResults([]); setError("Vul minimaal twee tekens in om te zoeken."); return; }
    try {
      const r = await fetch(`/api/friends/search?q=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Zoeken is mislukt.");
      setResults(d.users ?? []);
      if (!(d.users ?? []).length) setNotice("Geen gebruikers gevonden.");
    } catch (e) { setError(e instanceof Error ? e.message : "Zoeken is mislukt."); }
  }
  async function action(id: number, url: string, body?: unknown, method = "POST") {
    setBusy(id); setError(""); setNotice("");
    try {
      const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Actie mislukt.");
      await loadFriends();
      if (url.includes("/request")) setResults(current => current.map(p => p.gebruiker_id === id ? { ...p, vriendschapsstatus: "pending", richting: "sent" } : p));
      setNotice("Wijziging opgeslagen.");
    } catch (e) { setError(e instanceof Error ? e.message : "Actie mislukt."); }
    finally { setBusy(null); }
  }
  const surface = "theme-surface rounded-2xl border p-5 shadow-sm";
  return <main className="min-h-screen theme-page">
    <SiteHeader theme={theme} onThemeToggle={() => setTheme(v => v === "light" ? "dark" : "light")} userName={name} onHome={() => { window.location.href = "/"; }} onLogout={async () => { const r = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }); if (r.ok) window.location.replace("/"); }} />
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6"><p className="text-xs font-bold uppercase tracking-[.16em] text-emerald-600">Samen sporten</p><h1 className="mt-1 text-3xl font-black">Vrienden</h1><p className="mt-2 theme-muted">Voeg mensen toe en ontdek activiteiten die zij organiseren of bijwonen.</p></div>
      {error && <p role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-600">{notice}</p>}
      <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <section className={surface}>
          <h2 className="text-lg font-bold">Mensen zoeken</h2>
          <form onSubmit={searchUsers} className="mt-3 flex gap-2"><input value={query} onChange={e=>setQuery(e.target.value)} className="theme-input min-w-0 flex-1 rounded-xl border px-3 py-3 text-sm" placeholder="Zoek op naam…" /><button className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-600">Zoeken</button></form>
          <div className="mt-4 space-y-2">{results.map(person => <article key={person.gebruiker_id} className="theme-surface-muted flex items-center justify-between gap-3 rounded-xl border p-3"><div><p className="font-semibold">{person.naam}</p><p className="theme-muted text-xs">{person.woonplaats || "Woonplaats afgeschermd"}</p></div>{person.vriendschapsstatus === "accepted" ? <span className="text-sm text-emerald-600">Vriend</span> : person.vriendschapsstatus === "pending" ? <span className="theme-muted text-xs">{person.richting === "sent" ? "Verzoek verzonden" : "Verzoek ontvangen"}</span> : <button disabled={busy === person.gebruiker_id} onClick={() => action(person.gebruiker_id, "/api/friends/request", { gebruiker_id: person.gebruiker_id })} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{busy === person.gebruiker_id ? "…" : "Toevoegen"}</button>}</article>)}</div>
        </section>
        <section className={surface}>
          <h2 className="text-lg font-bold">Vriendschapsverzoeken</h2>
          <div className="mt-3 space-y-2">{data.incoming.length ? data.incoming.map(person => <article key={person.verzoek_id} className="theme-surface-muted flex items-center justify-between gap-3 rounded-xl border p-3"><div><p className="font-semibold">{person.naam}</p><p className="theme-muted text-xs">{person.woonplaats || "Woonplaats niet ingesteld"}</p></div><div className="flex gap-2"><button disabled={busy === person.verzoek_id} onClick={() => action(person.verzoek_id!, "/api/friends/respond", { verzoek_id: person.verzoek_id, accepteren: true })} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Accepteren</button><button disabled={busy === person.verzoek_id} onClick={() => action(person.verzoek_id!, "/api/friends/respond", { verzoek_id: person.verzoek_id, accepteren: false })} className="rounded-lg border px-3 py-2 text-xs">Weigeren</button></div></article>) : <p className="theme-muted rounded-xl border border-dashed p-4 text-sm">Geen openstaande verzoeken.</p>}</div>
          <h2 className="mt-6 text-lg font-bold">Mijn vrienden ({data.friends.length})</h2>
          <div className="mt-3 space-y-2">{data.friends.length ? data.friends.map(person => <article key={person.gebruiker_id} className="theme-surface-muted flex items-center justify-between gap-3 rounded-xl border p-3"><div><p className="font-semibold">{person.naam}</p><p className="theme-muted text-xs">{person.woonplaats || "Woonplaats niet ingesteld"}</p></div><div className="flex flex-wrap gap-2"><button onClick={() => { window.location.href = `/messages/${person.gebruiker_id}`; }} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600">Privébericht</button><button disabled={busy === person.gebruiker_id} onClick={() => action(person.gebruiker_id, `/api/friends/${person.gebruiker_id}`, undefined, "DELETE")} className="rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-500">Verwijderen</button></div></article>) : <p className="theme-muted rounded-xl border border-dashed p-4 text-sm">Je hebt nog geen vrienden toegevoegd.</p>}</div>
          {data.outgoing.length > 0 && <p className="theme-muted mt-4 text-xs">{data.outgoing.length} verzoek(en) wachten op antwoord.</p>}
        </section>
      </div>
    </div>
  </main>;
}
