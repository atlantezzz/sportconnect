"use client";

import { useEffect, useState } from "react";
import LocationMapPicker from "@/components/LocationMapPicker";

export type GeoapifyLocation = {
  id: string | null;
  formatted: string;
  straatnaam: string | null;
  huisnummer: string | null;
  postcode: string | null;
  woonplaats: string | null;
  land: string | null;
  breedtegraad: number | null;
  lengtegraad: number | null;
};

type LocationAutocompleteProps = {
  id: string;
  value: string;
  selected: GeoapifyLocation | null;
  onValueChange: (value: string) => void;
  onSelect: (location: GeoapifyLocation) => void;
  inputClassName: string;
  disabled?: boolean;
};

// Address search via /api/geocode/autocomplete (Geoapify). The parent owns the
// text and the selected address; typing clears the selection until a
// suggestion is picked again.
export default function LocationAutocomplete({
  id,
  value,
  selected,
  onValueChange,
  onSelect,
  inputClassName,
  disabled = false,
}: LocationAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<GeoapifyLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    const query = value.trim();

    if (query.length < 3 || selected?.formatted === query) {
      setSuggestions([]);
      setLoading(false);
      setError("");
      return;
    }

    const controller = new AbortController();

    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/geocode/autocomplete?text=${encodeURIComponent(query)}`,
          {
            signal: controller.signal,
            cache: "no-store",
          },
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "Adressen ophalen is mislukt.");
        }

        if (!controller.signal.aborted) {
          setSuggestions(Array.isArray(data.features) ? data.features : []);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setError(
            err instanceof Error
              ? err.message
              : "Adreszoeken is tijdelijk niet beschikbaar.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value, selected]);

  const listId = `${id}-suggestions`;

  return (
    <>
      <input
        id={id}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        maxLength={200}
        required
        autoComplete="off"
        placeholder="Zoek een straat, adres of sportlocatie..."
        className={inputClassName}
        disabled={disabled}
        aria-autocomplete="list"
        aria-expanded={suggestions.length > 0}
        aria-controls={listId}
      />

      {loading && (
        <p className="mt-1 text-xs text-gray-500">
          Adressen zoeken…
        </p>
      )}

      {error && (
        <p role="status" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}

      {suggestions.length > 0 && (
        <ul
          id={listId}
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.id ?? `${suggestion.formatted}-${index}`}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-emerald-50 focus:bg-emerald-50 focus:outline-none"
                onClick={() => {
                  onSelect(suggestion);
                  setSuggestions([]);
                  setError("");
                }}
              >
                <span className="block font-medium">
                  {suggestion.formatted}
                </span>
                {suggestion.postcode && (
                  <span className="mt-0.5 block text-xs text-gray-500">
                    {suggestion.postcode}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <p className="mt-1 text-xs text-emerald-700">
          Adres geselecteerd
          {selected.postcode ? ` · ${selected.postcode}` : ""}
        </p>
      )}

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-normal text-gray-500">
          Selecteer een adres uit de resultaten, of kies het punt zelf op de kaart.
        </p>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21Z" strokeLinejoin="round" /><circle cx="12" cy="10" r="2.3" /></svg>
          Kies op kaart
        </button>
      </div>

      {pickerOpen && (
        <LocationMapPicker
          initial={selected}
          onClose={() => setPickerOpen(false)}
          onConfirm={(location) => {
            onSelect(location);
            setSuggestions([]);
            setError("");
            setPickerOpen(false);
          }}
        />
      )}
    </>
  );
}
