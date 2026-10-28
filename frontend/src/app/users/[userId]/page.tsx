"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { sportEmoji } from "@/data/activities";

// What GET /api/users/{id} returns; the detail fields are absent for a shielded profile.
type PublicProfile = {
  gebruiker_id: number;
  naam: string;
  eigen_profiel: boolean;
  afgeschermd: boolean;
  vriendschapsstatus: "pending" | "accepted" | "declined" | null;
  verzoek_van_mij: boolean;
  kan_bericht_sturen: boolean;
  leeftijd?: number | null;
  woonplaats?: string | null;
  bio?: string | null;
  profielfoto?: string | null;
  lid_sinds?: string | null;
  favoriete_sporten?: string[];
  detail?: string;
};

function memberSince(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" }).format(date);
}

function PublicProfileContent() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [myName, setMyName] = useState<string | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("sportconnect-theme");
    const active = saved === "dark" ? "dark" : "light";
    setTheme(active);
    document.documentElement.dataset.theme = active;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMyName(d?.user?.naam ?? null))
      .catch(() => setMyName(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/users/${encodeURIComponent(userId)}`, { cache: "no-store" })
      .then(async (r) => {
        const data: PublicProfile = await r.json();
        if (r.status === 401) throw new Error("Log in om profielen te bekijken.");
        if (!r.ok) throw new Error(data.detail ?? "Dit profiel kon niet worden geladen.");
        if (!cancelled) setProfile(data);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Dit profiel kon niet worden geladen."); });
    return () => { cancelled = true; };
  }, [userId]);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("sportconnect-theme", next);
  }

  async function sendFriendRequest() {
    if (!profile || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await fetch("/api/friends/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gebruiker_id: profile.gebruiker_id }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(typeof d?.detail === "string" ? d.detail : "Het verzoek kon niet worden verstuurd.");
      setProfile({ ...profile, vriendschapsstatus: "pending", verzoek_van_mij: true });
      setNotice("Vriendschapsverzoek verstuurd.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Het verzoek kon niet worden verstuurd.");
    } finally {
      setBusy(false);
    }
  }

  const since = memberSince(profile?.lid_sinds);
  const facts = profile && !profile.afgeschermd
    ? [
        profile.leeftijd != null ? `${profile.leeftijd} jaar` : null,
        profile.woonplaats || null,
        since ? `Lid sinds ${since}` : null,
      ].filter((fact): fact is string => Boolean(fact))
    : [];

  return (
    <main className="min-h-screen theme-page">
      <SiteHeader
        theme={theme}
        onThemeToggle={toggleTheme}
        userName={myName}
        onHome={() => { window.location.href = "/"; }}
        onLogout={async () => { const r = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }); if (r.ok) window.location.replace("/"); }}
      />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {error && <p role="alert" className="mb-4 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm">{error}</p>}
        {!profile && !error && <p className="theme-muted text-sm">Profiel laden…</p>}

        {profile && (
          <section className="profile-card theme-surface overflow-hidden rounded-3xl border shadow-sm">
            <div className="profile-card-banner h-28 sm:h-32" aria-hidden="true" />
            <div className="px-5 pb-6 sm:px-8">
              <div className="-mt-12 flex flex-wrap items-end justify-between gap-4">
                <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full border-4 bg-emerald-50 text-3xl font-black text-emerald-800" style={{ borderColor: "var(--surface)" }}>
                  {profile.profielfoto
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={profile.profielfoto} alt={`Profielfoto van ${profile.naam}`} className="h-full w-full object-cover" />
                    : profile.naam.trim().charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-wrap gap-2">
                  {profile.eigen_profiel ? (
                    <a href="/profile" className="rounded-xl border px-4 py-2.5 text-sm font-semibold hover:border-emerald-600">Profiel bewerken</a>
                  ) : profile.vriendschapsstatus === "accepted" ? (
                    profile.kan_bericht_sturen
                      ? <a href={`/messages/${profile.gebruiker_id}`} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-600">Stuur een bericht</a>
                      : <span className="rounded-xl border px-4 py-2.5 text-sm theme-muted">Ontvangt geen privéberichten</span>
                  ) : profile.vriendschapsstatus === "pending" ? (
                    <span className="rounded-xl border px-4 py-2.5 text-sm theme-muted">{profile.verzoek_van_mij ? "Verzoek verstuurd" : "Wil vrienden met je worden"}</span>
                  ) : (
                    <button type="button" onClick={() => void sendFriendRequest()} disabled={busy} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-60">{busy ? "Versturen…" : "Vriend toevoegen"}</button>
                  )}
                </div>
              </div>

              <h1 className="mt-4 text-2xl font-black sm:text-3xl">{profile.naam}</h1>
              {profile.vriendschapsstatus === "accepted" && <p className="mt-1 text-sm font-semibold text-emerald-600">Jullie zijn vrienden</p>}
              {facts.length > 0 && <p className="mt-2 text-sm theme-muted">{facts.join(" · ")}</p>}
              {notice && <p role="status" className="mt-3 text-sm text-emerald-600">{notice}</p>}

              {profile.afgeschermd ? (
                <div className="theme-muted-surface mt-6 rounded-2xl border p-5">
                  <p className="font-semibold">Dit profiel is afgeschermd</p>
                  <p className="mt-1 text-sm theme-muted">{profile.naam} deelt alleen profielgegevens met vrienden.</p>
                </div>
              ) : (
                <>
                  <div className="mt-6">
                    <h2 className="text-xs font-bold uppercase tracking-[.16em] text-emerald-600">Over</h2>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{profile.bio || <span className="theme-muted">Nog geen beschrijving.</span>}</p>
                  </div>
                  {(profile.favoriete_sporten?.length ?? 0) > 0 && (
                    <div className="mt-6">
                      <h2 className="text-xs font-bold uppercase tracking-[.16em] text-emerald-600">Favoriete sporten</h2>
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {profile.favoriete_sporten!.map((sport) => (
                          <li key={sport} className="sport-choice rounded-full border px-3 py-1.5 text-sm font-semibold">
                            <span aria-hidden="true" className="mr-1">{sportEmoji[sport] ?? "•"}</span>{sport}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
              {profile.eigen_profiel && <p className="mt-6 text-xs theme-muted">Zo zien anderen je profiel. Je privacy-instellingen wijzig je op je profielpagina.</p>}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

export default function PublicProfilePage() {
  return (
    <Suspense fallback={<main className="min-h-screen theme-page grid place-items-center"><p className="text-sm theme-muted">Profiel laden…</p></main>}>
      <PublicProfileContent />
    </Suspense>
  );
}
