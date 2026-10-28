"use client";

import { useState, type FormEvent } from "react";
import LocationAutocomplete, { type GeoapifyLocation } from "@/components/LocationAutocomplete";

export type NewActivityInput = {
  sport: string;
  title: string;
  date: string;
  startTime: string;
  location: GeoapifyLocation;
  description: string;
  level: string;
  capacity: number;
};

type ActivityFormProps = {
  sports: string[];
  onClose: () => void;
  // Rejects with a Dutch message when saving fails.
  onSubmit: (activity: NewActivityInput) => Promise<void>;
};

const inputClassName =
  "mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";
const labelClassName = "block text-sm font-medium text-gray-700";

function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function ActivityForm({
  sports,
  onClose,
  onSubmit,
}: ActivityFormProps) {
  const [sport, setSport] = useState("Hardlopen");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(localDateString(new Date()));
  const [startTime, setStartTime] = useState("");
  const [location, setLocation] = useState("");
  const [selectedLocation, setSelectedLocation] =
    useState<GeoapifyLocation | null>(null);

  const [description, setDescription] = useState("");
  const [level, setLevel] = useState("Alle niveaus");
  const [capacity, setCapacity] = useState("8");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const today = localDateString(new Date());

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError("");

    if (!title.trim() || !date || !startTime || !selectedLocation) {
      setError(
        "Vul alle verplichte velden in en selecteer een adres uit de suggesties.",
      );
      return;
    }

    if (
      typeof selectedLocation.breedtegraad !== "number" ||
      typeof selectedLocation.lengtegraad !== "number"
    ) {
      setError("Het geselecteerde adres heeft geen geldige kaartcoördinaten.");
      return;
    }

    const startDateTime = new Date(`${date}T${startTime}`);
    if (Number.isNaN(startDateTime.getTime()) || startDateTime <= new Date()) {
      setError("Kies een datum en starttijd in de toekomst.");
      return;
    }

    const parsedCapacity = Number(capacity);
    if (!Number.isInteger(parsedCapacity) || parsedCapacity < 2 || parsedCapacity > 50) {
      setError("Het maximum moet tussen 2 en 50 deelnemers liggen, inclusief jezelf als organisator.");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        sport,
        title: title.trim(),
        date,
        startTime,
        location: selectedLocation,
        description: description.trim(),
        level,
        capacity: parsedCapacity,
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Activiteit opslaan is mislukt.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/50 p-3 backdrop-blur-[2px] sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-activity-title"
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 sm:px-7 sm:py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">SportConnect</p>
            <h2 id="create-activity-title" className="mt-1 text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">
              Activiteit aanmaken
            </h2>
            <p className="mt-1 text-sm text-gray-500">Organiseer een sportmoment en nodig anderen uit.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Formulier sluiten"
            className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="min-h-0 overflow-y-auto">
          <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 sm:gap-5 sm:px-7">
            <label className={labelClassName}>
              Sport <span className="text-red-600">*</span>
              <select value={sport} onChange={(event) => setSport(event.target.value)} className={inputClassName}>
                {sports.filter((item) => item !== "Alles").map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <label className={labelClassName}>
              Niveau <span className="text-red-600">*</span>
              <select value={level} onChange={(event) => setLevel(event.target.value)} className={inputClassName}>
                <option>Alle niveaus</option>
                <option>Beginner</option>
                <option>Gemiddeld</option>
                <option>Gevorderd</option>
              </select>
            </label>

            <label className={`${labelClassName} sm:col-span-2`}>
              Titel <span className="text-red-600">*</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} required placeholder="Bijv. Samen hardlopen in het park" className={inputClassName} />
            </label>

            <label className={labelClassName}>
              Datum <span className="text-red-600">*</span>
              <input type="date" value={date} min={today} onChange={(event) => setDate(event.target.value)} required className={inputClassName} />
            </label>

            <label className={labelClassName}>
              Starttijd <span className="text-red-600">*</span>
              <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required className={inputClassName} />
            </label>

            <div className={`${labelClassName} relative sm:col-span-2`}>
              <label htmlFor="activity-location">
                Locatie <span className="text-red-600">*</span>
              </label>

              <LocationAutocomplete
                id="activity-location"
                value={location}
                selected={selectedLocation}
                onValueChange={(value) => {
                  setLocation(value);
                  setSelectedLocation(null);
                  setError("");
                }}
                onSelect={(suggestion) => {
                  setSelectedLocation(suggestion);
                  setLocation(suggestion.formatted);
                  setError("");
                }}
                inputClassName={inputClassName}
              />
            </div>

            <label className={labelClassName}>
              Maximum aantal deelnemers <span className="text-red-600">*</span>
              <input type="number" value={capacity} onChange={(event) => setCapacity(event.target.value)} min={2} max={50} step={1} required className={inputClassName} />
              <span className="mt-1 block text-xs font-normal text-gray-500">Inclusief jou als organisator (2–50).</span>
            </label>

            <label className={`${labelClassName} sm:col-span-2`}>
              Beschrijving <span className="font-normal text-gray-400">(optioneel)</span>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} rows={3} placeholder="Vertel deelnemers wat ze kunnen verwachten..." className={`${inputClassName} resize-y`} />
            </label>

            {error && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 sm:col-span-2">
                {error}
              </p>
            )}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-gray-100 bg-gray-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">
              Annuleren
            </button>
            <button type="submit" disabled={submitting} className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? "Publiceren…" : "Activiteit publiceren"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
