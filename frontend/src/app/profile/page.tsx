"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import GlobalChatLauncher from "@/components/GlobalChatLauncher";
import SportPreferencesModal from "@/components/SportPreferencesModal";
import { sports } from "@/data/activities";

type ProfileSettings = {
  displayName: string;
  city: string;
  age: string;
  bio: string;
  photo: string;
  publicProfile: boolean;
  allowMessages: boolean;
  showFavoriteSports: boolean;
  favoriteSports: string[];
  hiddenSports: string[];
};

const PROFILE_KEY = "sportconnect-profile-settings";
const PREFS_KEY = "sportconnect-sport-preferences";
const defaults: ProfileSettings = {
  displayName: "", city: "", age: "", bio: "", photo: "",
  publicProfile: true, allowMessages: true, showFavoriteSports: true,
  favoriteSports: [], hiddenSports: [],
};


const NOTIFICATION_OPTIONS = [
  { key: "participants", label: "Nieuwe deelnemers" },
  { key: "activity_changes", label: "Wijzigingen aan activiteiten" },
  { key: "group_chat", label: "Groepschatberichten" },
  { key: "private_messages", label: "Privéberichten" },
  { key: "friend_requests", label: "Vriendschapsverzoeken" },
  { key: "reminders", label: "Herinneringen voor activiteiten" },
] as const;

function NotificationPreferences() {
  const [preferences, setPreferences] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/notification-preferences", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Voorkeuren laden mislukt");
        return response.json();
      })
      .then((data) => {
        if (!cancelled) setPreferences(data);
      })
      .catch((error) => console.error(error))
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  async function togglePreference(key: string, enabled: boolean) {
    const previous = preferences[key] ?? true;
    setPreferences((current) => ({ ...current, [key]: enabled }));
    setSaving(key);
    try {
      const response = await fetch("/api/notification-preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [key]: enabled }),
      });
      if (!response.ok) throw new Error("Voorkeur opslaan mislukt");
    } catch (error) {
      setPreferences((current) => ({ ...current, [key]: previous }));
      console.error(error);
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="theme-surface rounded-2xl border p-5 sm:p-7">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-600">Meldingen</p>
      <h2 className="mt-1 text-xl font-bold">Notificatievoorkeuren</h2>
      <p className="mt-2 text-sm theme-muted">Kies welke meldingen je in SportConnect wilt ontvangen.</p>
      <div className="mt-4 space-y-3">
        {NOTIFICATION_OPTIONS.map((option) => (
          <label key={option.key} className="flex items-center justify-between gap-4">
            <span>{option.label}</span>
            <input
              type="checkbox"
              checked={preferences[option.key] ?? true}
              disabled={!loaded || saving !== null}
              onChange={(event) => void togglePreference(option.key, event.target.checked)}
              aria-label={option.label}
            />
          </label>
        ))}
      </div>
    </section>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [userId, setUserId] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<ProfileSettings>(defaults);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  useEffect(() => {
    const storedTheme = localStorage.getItem("sportconnect-theme");
    const activeTheme = storedTheme === "dark" ? "dark" : "light";
    setTheme(activeTheme);
    document.documentElement.dataset.theme = activeTheme;
    try {
      const stored = JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}");
      const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
      setProfile({ ...defaults, ...stored, favoriteSports: prefs.favorite ?? stored.favoriteSports ?? [], hiddenSports: prefs.hidden ?? stored.hiddenSports ?? [] });
    } catch {}
    fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" })
      .then(async (r) => {
        if (!r.ok) throw new Error("Log in om je profiel te bekijken.");
        const data = await r.json();
        setUserId(data.user?.gebruiker_id ?? null);
        setEmail(data.user?.email ?? "");
        setProfile((current) => ({
          ...current,
          displayName: current.displayName || data.user?.naam || "",
          age: current.age || (data.user?.leeftijd != null ? String(data.user.leeftijd) : ""),
          city: current.city || data.user?.woonplaats || "",
        }));
      })
      .catch(() => setError("Je bent niet ingelogd. Ga terug naar SportConnect en log in."));
  }, []);

  function update<K extends keyof ProfileSettings>(key: K, value: ProfileSettings[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Kies een afbeeldingsbestand."); return; }
    if (file.size > 1_500_000) { setError("De foto mag maximaal 1,5 MB zijn. Verklein de afbeelding en probeer opnieuw."); return; }
    const reader = new FileReader();
    reader.onload = () => { update("photo", String(reader.result)); setError(""); };
    reader.onerror = () => setError("De foto kon niet worden gelezen.");
    reader.readAsDataURL(file);
  }

  function save(event: FormEvent) {
    event.preventDefault();
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    localStorage.setItem(PREFS_KEY, JSON.stringify({ favorite: profile.favoriteSports, hidden: profile.hiddenSports }));
    setSaved(true);
  }

  const toggleSport = (name: string) => {
    const next = profile.favoriteSports.includes(name)
      ? profile.favoriteSports.filter((s) => s !== name)
      : [...profile.favoriteSports, name];
    update("favoriteSports", next);
  };

  return <main className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
    <SiteHeader
      theme={theme}
      onThemeToggle={() => { const next = theme === "light" ? "dark" : "light"; setTheme(next); document.documentElement.dataset.theme = next; localStorage.setItem("sportconnect-theme", next); }}
      userName={profile.displayName || email || "Ingelogd"}
      onHome={() => router.push("/")}
      onLogout={async () => { try { const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", cache: "no-store" }); if (!response.ok) throw new Error("Uitloggen is niet bevestigd door de server."); router.replace("/"); window.location.assign("/"); } catch (e) { setError(e instanceof Error ? e.message : "Uitloggen is niet gelukt."); } }}
    />
    <div className="mx-auto grid max-w-6xl gap-7 px-4 py-8 md:grid-cols-[260px_1fr] md:px-6">
      <aside className="theme-surface h-fit rounded-2xl border p-5">
        <div className="flex flex-col items-center text-center">
          <button type="button" onClick={() => fileRef.current?.click()} className="group relative mb-4 flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-2 border-emerald-600 bg-emerald-50 text-3xl font-bold text-emerald-800 transition hover:scale-[1.03]" aria-label="Profielfoto wijzigen">
            {profile.photo ? <img src={profile.photo} alt="Profielfoto" className="h-full w-full object-cover" /> : (profile.displayName.trim()[0] || "S")}
            <span className="absolute inset-x-0 bottom-0 bg-black/65 py-1 text-xs font-semibold text-white">Wijzigen</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
          <h1 className="text-xl font-bold">{profile.displayName || "Jouw profiel"}</h1>
          <p className="mt-1 text-sm theme-muted">{profile.city || "Voeg je woonplaats toe"}</p>
          <span className="mt-4 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-900">{profile.publicProfile ? "Openbaar profiel" : "Privéprofiel"}</span>
          <p className="mt-4 text-xs theme-muted">Account #{userId ?? "—"}</p>
        </div>
        <div className="mt-6 border-t pt-4 text-sm"><p className="font-semibold">Account</p><p className="mt-1 break-all theme-muted">{email}</p></div>
      </aside>
      <form onSubmit={save} className="space-y-6">
        <section className="theme-surface rounded-2xl border p-5 sm:p-7">
          <div className="mb-5"><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-600">Profiel</p><h2 className="mt-1 text-2xl font-bold">Profielgegevens</h2><p className="mt-2 text-sm theme-muted">Bepaal welke informatie je over jezelf deelt met andere sporters.</p></div>
          {error && <p role="alert" className="mb-4 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm">{error}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">Weergavenaam<input className="theme-field mt-2 w-full rounded-xl border px-3 py-3 font-normal" value={profile.displayName} onChange={(e) => update("displayName", e.target.value)} maxLength={100} required /></label>
            <label className="text-sm font-semibold">Woonplaats<input className="theme-field mt-2 w-full rounded-xl border px-3 py-3 font-normal" value={profile.city} onChange={(e) => update("city", e.target.value)} maxLength={100} /></label>
            <label className="text-sm font-semibold">Leeftijd<input className="theme-field mt-2 w-full rounded-xl border px-3 py-3 font-normal" type="number" min="13" max="120" value={profile.age} onChange={(e) => update("age", e.target.value)} /></label>
            <label className="text-sm font-semibold sm:col-span-2">Over mij<textarea className="theme-field mt-2 min-h-28 w-full rounded-xl border px-3 py-3 font-normal" value={profile.bio} onChange={(e) => update("bio", e.target.value)} maxLength={500} placeholder="Vertel kort wat je leuk vindt aan sporten…" /></label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" onClick={() => fileRef.current?.click()} className="rounded-xl border px-4 py-2.5 text-sm font-semibold transition hover:border-emerald-600">Profielfoto kiezen</button>{profile.photo && <button type="button" onClick={() => update("photo", "")} className="rounded-xl border px-4 py-2.5 text-sm font-semibold">Foto verwijderen</button>}<span className="text-xs theme-muted">JPG, PNG of andere afbeelding · maximaal 1,5 MB</span></div>
        </section>
        <section className="theme-surface rounded-2xl border p-5 sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-600">Privacy & contact</p><h2 className="mt-1 text-xl font-bold">Jij bepaalt wie wat ziet</h2>
          <div className="mt-4 space-y-3">
            <label className="theme-muted-surface flex cursor-pointer items-start gap-3 rounded-xl border p-4"><input type="checkbox" className="mt-1 accent-emerald-600" checked={profile.publicProfile} onChange={(e) => update("publicProfile", e.target.checked)} /><span><span className="block font-semibold">Openbaar profiel</span><span className="mt-1 block text-sm theme-muted">Andere gebruikers kunnen de informatie zien die je hierboven hebt ingevuld.</span></span></label>
            <label className="theme-muted-surface flex cursor-pointer items-start gap-3 rounded-xl border p-4"><input type="checkbox" className="mt-1 accent-emerald-600" checked={profile.allowMessages} onChange={(e) => update("allowMessages", e.target.checked)} /><span><span className="block font-semibold">Privéberichten toestaan</span><span className="mt-1 block text-sm theme-muted">Sta toe dat andere gebruikers je een privébericht sturen. De berichtenfunctie moet hiervoor nog aan de backend worden gekoppeld.</span></span></label>
            <label className="theme-muted-surface flex cursor-pointer items-start gap-3 rounded-xl border p-4"><input type="checkbox" className="mt-1 accent-emerald-600" checked={profile.showFavoriteSports} onChange={(e) => update("showFavoriteSports", e.target.checked)} /><span><span className="block font-semibold">Favoriete sporten tonen</span><span className="mt-1 block text-sm theme-muted">Toon je gekozen sporten op je profiel.</span></span></label>
          </div>
        </section>
        <NotificationPreferences />
        <section className="theme-surface rounded-2xl border p-5 sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-600">Sportvoorkeuren</p><h2 className="mt-1 text-xl font-bold">Jouw sporten</h2><p className="mt-2 text-sm theme-muted">Deze voorkeuren worden gebruikt voor jouw persoonlijke overzicht op dit apparaat.</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">{sports.filter((s) => s !== "Alles").map((sport) => <label key={sport} className={`sport-choice flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-semibold ${profile.favoriteSports.includes(sport) ? "sport-choice-active" : ""}`}><input type="checkbox" className="accent-emerald-600" checked={profile.favoriteSports.includes(sport)} onChange={() => toggleSport(sport)} />{sport}</label>)}</div>
          <p className="mt-4 text-sm theme-muted">Verborgen sporten: {profile.hiddenSports.length ? profile.hiddenSports.join(", ") : "geen"}.</p>
          <button type="button" onClick={() => setPreferencesOpen(true)} className="mt-3 rounded-xl border px-4 py-2.5 text-sm font-semibold hover:border-emerald-600">Favorieten en verborgen sporten aanpassen</button>
        </section>
        <div className="sticky bottom-3 flex items-center justify-between gap-3 rounded-2xl border p-3 backdrop-blur-xl" style={{ background: "color-mix(in srgb, var(--surface) 92%, transparent)" }}>
          <span role="status" className="text-sm">{saved ? "Wijzigingen opgeslagen in deze browser." : "Vergeet niet je wijzigingen op te slaan."}</span>
          <button type="submit" className="rounded-xl bg-emerald-700 px-6 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-emerald-600">Profiel opslaan</button>
        </div>
      </form>
    </div>
    <GlobalChatLauncher />
    <GlobalChatLauncher />
    {preferencesOpen && <SportPreferencesModal onClose={() => setPreferencesOpen(false)} onSaved={(favorite, hidden) => {
      update("favoriteSports", favorite);
      update("hiddenSports", hidden);
      localStorage.setItem(PREFS_KEY, JSON.stringify({ favorite, hidden }));
      setSaved(false);
    }} />}
  </main>;
}
