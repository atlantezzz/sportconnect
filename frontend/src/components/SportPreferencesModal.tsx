"use client";

import { useEffect, useState } from "react";
import { sports } from "@/data/activities";

type Props = { onClose: () => void; onSaved: (favorite: string[], hidden: string[]) => void };

type SportPreferences = { favoriet?: string[]; verborgen?: string[]; detail?: string };

export default function SportPreferencesModal({ onClose, onSaved }: Props) {
  const [favorite, setFavorite] = useState<string[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [step, setStep] = useState<"favorite" | "hidden">("favorite");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.detail ?? "Je voorkeuren konden niet worden geladen.");
        if (cancelled) return;
        setFavorite(data.sporten?.favoriet ?? []);
        setHidden(data.sporten?.verborgen ?? []);
        setLoaded(true);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Je voorkeuren konden niet worden geladen."); });
    return () => { cancelled = true; };
  }, []);

  function toggle(name: string, group: "favorite" | "hidden") {
    const setter = group === "favorite" ? setFavorite : setHidden;
    const current = group === "favorite" ? favorite : hidden;
    setter(current.includes(name) ? current.filter((s) => s !== name) : [...current, name]);
    if (group === "favorite") setHidden((items) => items.filter((s) => s !== name));
    else setFavorite((items) => items.filter((s) => s !== name));
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/profile/sport-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favoriet: favorite, verborgen: hidden }),
      });
      const data: SportPreferences | null = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.detail === "string" ? data.detail : "Je voorkeuren konden niet worden opgeslagen.");
      onSaved(data?.favoriet ?? favorite, data?.verborgen ?? hidden);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Je voorkeuren konden niet worden opgeslagen.");
    } finally {
      setSaving(false);
    }
  }

  const choices = sports.filter((name) => name !== "Alles");
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="sport-pref-title" className="theme-surface w-full max-w-xl rounded-3xl border p-6 shadow-2xl sm:p-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-emerald-600">SportConnect · jouw voorkeuren</p>
            <h2 id="sport-pref-title" className="text-2xl font-bold">Welke sporten passen bij jou?</h2>
            <p className="mt-2 text-sm theme-muted">Kies je favorieten en geef aan welke sporten je liever niet in je overzicht ziet.</p>
          </div>
          <button type="button" onClick={onClose} className="theme-icon-button rounded-full p-2" aria-label="Sluiten">✕</button>
        </div>
        <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl theme-muted-surface p-1">
          <button type="button" onClick={() => setStep("favorite")} className={`rounded-lg px-3 py-2.5 text-sm font-semibold ${step === "favorite" ? "bg-emerald-700 text-white" : ""}`}>★ Favorieten ({favorite.length})</button>
          <button type="button" onClick={() => setStep("hidden")} className={`rounded-lg px-3 py-2.5 text-sm font-semibold ${step === "hidden" ? "bg-emerald-700 text-white" : ""}`}>Verbergen ({hidden.length})</button>
        </div>
        <div className="sport-choice-grid grid grid-cols-2 gap-3 sm:grid-cols-3">
          {choices.map((name) => {
            const active = (step === "favorite" ? favorite : hidden).includes(name);
            return <button key={name} type="button" aria-pressed={active} onClick={() => toggle(name, step)} className={`sport-choice rounded-xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-500 ${active ? "sport-choice-active" : ""}`}>
              <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-lg text-emerald-800">{step === "favorite" ? "★" : "−"}</span>
              <span className="block font-semibold">{name}</span>
              <span className="mt-1 block text-xs theme-muted">{active ? (step === "favorite" ? "Favoriet" : "Verborgen") : (step === "favorite" ? "Voeg toe als favoriet" : "Niet tonen in overzicht")}</span>
            </button>;
          })}
        </div>
        {error && <p role="alert" className="mt-5 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm">{error}</p>}
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <button type="button" onClick={onClose} className="rounded-xl border px-4 py-3 text-sm font-semibold">Later instellen</button>
          <button type="button" onClick={() => void save()} disabled={!loaded || saving} className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Opslaan…" : "Voorkeuren opslaan"}</button>
        </div>
        <p className="mt-3 text-xs theme-muted">Je kunt deze keuzes later wijzigen via je profiel. Je kunt altijd terugkomen op je voorkeuren.</p>
      </section>
    </div>
  );
}
