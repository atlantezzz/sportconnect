"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { GeoapifyLocation } from "@/components/LocationAutocomplete";

const LeafletLocationPicker = dynamic(() => import("@/components/LeafletLocationPicker"), {
  ssr: false,
  loading: () => <div className="grid h-full w-full place-items-center text-sm theme-muted">Kaart laden…</div>,
});

type Props = {
  initial: GeoapifyLocation | null;
  onClose: () => void;
  onConfirm: (location: GeoapifyLocation) => void;
};

function initialPosition(location: GeoapifyLocation | null): [number, number] | null {
  return location && typeof location.breedtegraad === "number" && typeof location.lengtegraad === "number"
    ? [location.breedtegraad, location.lengtegraad]
    : null;
}

// Choose a location by clicking on (or dragging a pin across) the map; the
// address is looked up for the chosen point.
export default function LocationMapPicker({ initial, onClose, onConfirm }: Props) {
  const [position, setPosition] = useState<[number, number] | null>(() => initialPosition(initial));
  const [location, setLocation] = useState<GeoapifyLocation | null>(initial);
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState("");
  const lookup = useRef<AbortController | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  async function pick(lat: number, lon: number) {
    setPosition([lat, lon]);
    setError("");
    setLooking(true);
    lookup.current?.abort();
    const controller = new AbortController();
    lookup.current = controller;
    try {
      const response = await fetch(`/api/geocode/reverse?lat=${lat}&lon=${lon}`, { cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Het adres kon niet worden opgezocht.");
      setLocation(data.location);
    } catch (e) {
      if (controller.signal.aborted) return;
      setLocation(null);
      setError(e instanceof Error ? e.message : "Het adres kon niet worden opgezocht.");
    } finally {
      if (!controller.signal.aborted) setLooking(false);
    }
  }

  function locateMe() {
    if (!navigator.geolocation) {
      setError("Je browser kan je locatie niet delen.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (result) => void pick(result.coords.latitude, result.coords.longitude),
      () => setError("Je locatie kon niet worden bepaald. Kies een punt op de kaart."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const canConfirm = Boolean(position && location && !looking);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-gray-950/60 p-3 backdrop-blur-[2px] sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="location-picker-title" className="location-picker theme-surface flex h-[min(88vh,720px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
          <div>
            <h2 id="location-picker-title" className="text-lg font-bold">Kies een locatie op de kaart</h2>
            <p className="mt-0.5 text-sm theme-muted">Klik op de kaart of sleep de pin naar de juiste plek.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Kaart sluiten" className="rounded-lg p-2 theme-muted hover:bg-black/5">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="relative min-h-0 flex-1">
          <LeafletLocationPicker position={position} onPick={(lat, lon) => void pick(lat, lon)} />
          <button type="button" onClick={locateMe} className="location-picker-locate absolute right-3 top-3 z-[500] inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold shadow-md">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="3.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" /></svg>
            Mijn locatie
          </button>
        </div>

        <div className="flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--border)" }}>
          <p className="min-w-0 text-sm" aria-live="polite">
            {looking ? <span className="theme-muted">Adres opzoeken…</span>
              : error ? <span role="alert" className="text-red-600">{error}</span>
              : location && position ? <><span className="block text-xs font-semibold uppercase tracking-wider theme-muted">Gekozen locatie</span><span className="font-semibold">{location.formatted}</span></>
              : <span className="theme-muted">Nog geen locatie gekozen.</span>}
          </p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2.5 text-sm font-semibold" style={{ borderColor: "var(--border)" }}>Annuleren</button>
            <button type="button" disabled={!canConfirm} onClick={() => location && onConfirm(location)} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
              Deze locatie gebruiken
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
