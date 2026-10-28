"use client";

import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";

type ActivityRow = {
  activiteit_id: number;
  maker_id: number;
  titel: string;
  beschrijving: string | null;
  starttijd: string;
  locatie_naam: string | null;
  woonplaats: string | null;
  maximaal_aantal_deelnemers: number;
  status: string;
  sport: string;
  aantal_deelnemers: number;
};

type Member = {
  gebruiker_id: number;
  naam: string;
  rol: string | null;
};

type SettingsForm = {
  titel: string;
  beschrijving: string;
  datumtijd: string;
  locatie: string;
  woonplaats: string;
  capaciteit: number;
};

const inputClass =
  "mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

const labelClass = "block text-sm font-medium text-gray-700";

function toLocalDateTime(value: string) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function errorMessage(data: unknown, fallback: string) {
  if (
    data &&
    typeof data === "object" &&
    "detail" in data &&
    typeof data.detail === "string"
  ) {
    return data.detail;
  }

  return fallback;
}

export default function ActivitySettingsPage() {
  return (
    <Suspense fallback={<main className="p-6">Instellingen laden...</main>}>
      <ActivitySettingsContent />
    </Suspense>
  );
}

function ActivitySettingsContent() {
  useEffect(() => {
    const applyTheme = () => {
      const stored = window.localStorage.getItem("sportconnect-theme");
      document.documentElement.dataset.theme = stored === "dark" ? "dark" : "light";
    };
    applyTheme();
    window.addEventListener("storage", applyTheme);
    const timer = window.setInterval(applyTheme, 500);
    return () => { window.removeEventListener("storage", applyTheme); window.clearInterval(timer); };
  }, []);
  const params = useParams<{ activityId: string }>();
  const router = useRouter();
  const activityId = params.activityId;

  const [activity, setActivity] = useState<ActivityRow | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [form, setForm] = useState<SettingsForm>({
    titel: "",
    beschrijving: "",
    datumtijd: "",
    locatie: "",
    woonplaats: "",
    capaciteit: 2,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [newOrganizerId, setNewOrganizerId] = useState("");
  const [cancelConfirmationOpen, setCancelConfirmationOpen] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadActivity = useCallback(async () => {
    if (!/^\d+$/.test(activityId)) {
      setError("Ongeldig activiteit-ID.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/activities", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Activiteiten ophalen mislukt.");
      }

      const rows: ActivityRow[] = await response.json();
      const found = rows.find(
        (row) => row.activiteit_id === Number(activityId),
      );

      if (!found) {
        setError("Activiteit niet gevonden.");
        setActivity(null);
        return;
      }

      setActivity(found);
      setForm({
        titel: found.titel,
        beschrijving: found.beschrijving ?? "",
        datumtijd: toLocalDateTime(found.starttijd),
        locatie: found.locatie_naam ?? "",
        woonplaats: found.woonplaats ?? "",
        capaciteit: found.maximaal_aantal_deelnemers,
      });

      if (found.status === "OPEN") {
        const membersResponse = await fetch(
          `/api/activities/${activityId}/members`,
          { cache: "no-store" },
        );

        if (membersResponse.ok) {
          setMembers(await membersResponse.json());
        } else if (membersResponse.status === 401 ||
                   membersResponse.status === 403) {
          setError("Alleen de huidige organisator kan deze instellingen beheren.");
        } else {
          const data = await membersResponse.json().catch(() => null);
          setError(errorMessage(data, "Deelnemers ophalen mislukt."));
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Er is een fout opgetreden.",
      );
    } finally {
      setLoading(false);
    }
  }, [activityId]);

  useEffect(() => {
    void loadActivity();
  }, [loadActivity]);

  async function saveChanges(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!activity) return;

    if (form.capaciteit < activity.aantal_deelnemers || form.capaciteit > 50) {
      setError(
        `De capaciteit moet tussen ${activity.aantal_deelnemers} en 50 liggen.`,
      );
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(`/api/activities/${activityId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titel: form.titel.trim(),
          beschrijving: form.beschrijving.trim() || null,
          starttijd: form.datumtijd,
          locatie_naam: form.locatie.trim() || null,
          woonplaats: form.woonplaats.trim() || null,
          maximaal_aantal_deelnemers: Number(form.capaciteit),
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(errorMessage(data, "Opslaan is mislukt."));
      }

      setSuccess("De wijzigingen zijn opgeslagen.");
      await loadActivity();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Opslaan is mislukt.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function transferOrganizer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!newOrganizerId) {
      setError("Selecteer eerst een nieuwe organisator.");
      return;
    }

    const target = members.find(
      (member) => member.gebruiker_id === Number(newOrganizerId),
    );

    if (!target || target.gebruiker_id === activity?.maker_id) {
      setError("Selecteer een andere bestaande deelnemer.");
      return;
    }

    if (
      !window.confirm(
        `Het organisatorschap overdragen aan ${target.naam}? Je verliest daarna de beheerrechten.`,
      )
    ) {
      return;
    }

    setTransferring(true);

    try {
      const response = await fetch(
        `/api/activities/${activityId}/transfer-organizer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nieuwe_organisator_id: Number(newOrganizerId),
          }),
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(errorMessage(data, "Overdracht mislukt."));
      }

      window.alert("Het organisatorschap is overgedragen.");
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Overdracht mislukt.",
      );
    } finally {
      setTransferring(false);
    }
  }

  async function cancelActivity() {
    setError("");
    setCancelling(true);

    try {
      const response = await fetch(
        `/api/activities/${activityId}/cancel`,
        { method: "POST" },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(errorMessage(data, "Annuleren mislukt."));
      }

      window.alert("De activiteit is geannuleerd.");
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Annuleren mislukt.",
      );
    } finally {
      setCancelling(false);
      setCancelConfirmationOpen(false);
    }
  }

  if (loading) {
    return (
      <main className="settings-page min-h-screen bg-gray-50 p-6">
        <p className="mx-auto max-w-3xl text-sm text-gray-600">
          Activiteit laden…
        </p>
      </main>
    );
  }

  if (!activity) {
    return (
      <main className="settings-page min-h-screen bg-gray-50 p-6">
        <div className="mx-auto max-w-3xl rounded-xl border border-gray-200 bg-white p-6">
          <h1 className="text-xl font-bold text-gray-900">
            Instellingen niet beschikbaar
          </h1>
          <p className="mt-2 text-sm text-red-700">
            {error || "Activiteit niet gevonden."}
          </p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="mt-5 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            Terug naar activiteiten
          </button>
        </div>
      </main>
    );
  }

  const isOpen = activity.status === "OPEN";
  const otherMembers = members.filter(
    (member) =>
      member.gebruiker_id !== activity.maker_id &&
      member.rol !== "organisator",
  );

  return (
    <main className="settings-page min-h-screen bg-gray-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="mb-5 rounded-lg px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-white hover:text-emerald-800"
        >
          ← Terug naar activiteiten
        </button>

        <header className="mb-6">
          <p className="text-sm font-semibold text-emerald-700">
            SPORTCONNECT · ORGANISATOR
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            Activiteit beheren
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Pas de activiteit aan, draag het organisatorschap over of annuleer
            de activiteit. De sport kan niet worden gewijzigd.
          </p>
        </header>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
          >
            {success}
          </div>
        )}

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Algemene instellingen
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Sport: {activity.sport} · {activity.aantal_deelnemers} deelnemers
              </p>
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
              {activity.status}
            </span>
          </div>

          {!isOpen && (
            <p className="mb-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              Deze activiteit is niet meer open. Bewerken, overdragen en
              annuleren zijn daarom uitgeschakeld.
            </p>
          )}

          <form onSubmit={saveChanges} className="space-y-5">
            <label className={labelClass}>
              Titel
              <input
                required
                minLength={3}
                maxLength={120}
                value={form.titel}
                onChange={(event) =>
                  setForm({ ...form, titel: event.target.value })
                }
                className={inputClass}
                disabled={!isOpen || saving}
              />
            </label>

            <label className={labelClass}>
              Beschrijving
              <textarea
                rows={4}
                value={form.beschrijving}
                onChange={(event) =>
                  setForm({ ...form, beschrijving: event.target.value })
                }
                className={inputClass}
                disabled={!isOpen || saving}
              />
            </label>

            <label className={labelClass}>
              Datum en tijd
              <input
                type="datetime-local"
                required
                value={form.datumtijd}
                onChange={(event) =>
                  setForm({ ...form, datumtijd: event.target.value })
                }
                className={inputClass}
                disabled={!isOpen || saving}
              />
            </label>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className={labelClass}>
                Locatie
                <input
                  value={form.locatie}
                  onChange={(event) =>
                    setForm({ ...form, locatie: event.target.value })
                  }
                  className={inputClass}
                  disabled={!isOpen || saving}
                  placeholder="Bijv. Sportpark"
                />
              </label>

              <label className={labelClass}>
                Woonplaats
                <input
                  value={form.woonplaats}
                  onChange={(event) =>
                    setForm({ ...form, woonplaats: event.target.value })
                  }
                  className={inputClass}
                  disabled={!isOpen || saving}
                  placeholder="Bijv. Eindhoven"
                />
              </label>
            </div>

            <label className={labelClass}>
              Maximumaantal deelnemers
              <input
                type="number"
                required
                min={activity.aantal_deelnemers}
                max={50}
                value={form.capaciteit}
                onChange={(event) =>
                  setForm({
                    ...form,
                    capaciteit: Number(event.target.value),
                  })
                }
                className={inputClass}
                disabled={!isOpen || saving}
              />
              <span className="mt-1 block text-xs font-normal text-gray-500">
                Minimaal {activity.aantal_deelnemers} (huidig aantal), maximaal
                50. De organisator telt mee.
              </span>
            </label>

            <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
              <span className="font-medium text-gray-800">Sport:</span>{" "}
              {activity.sport}. De sport is niet wijzigbaar.
            </div>

            <button
              type="submit"
              disabled={!isOpen || saving}
              className="w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Wijzigingen opslaan…" : "Wijzigingen opslaan"}
            </button>
          </form>
        </section>

        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-lg font-semibold text-gray-900">
            Organisatorschap overdragen
          </h2>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            Kies een andere deelnemer. De overdracht gaat direct in en je
            verliest daarna de organisatorrechten.
          </p>

          <form onSubmit={transferOrganizer} className="mt-4 space-y-3">
            <label className={labelClass}>
              Nieuwe organisator
              <select
                value={newOrganizerId}
                onChange={(event) => setNewOrganizerId(event.target.value)}
                className={inputClass}
                disabled={!isOpen || transferring || otherMembers.length === 0}
              >
                <option value="">Kies een deelnemer</option>
                {otherMembers.map((member) => (
                  <option
                    key={member.gebruiker_id}
                    value={member.gebruiker_id}
                  >
                    {member.naam}
                  </option>
                ))}
              </select>
            </label>

            {otherMembers.length === 0 && (
              <p className="text-sm text-gray-500">
                Er zijn geen andere deelnemers aan wie je het organisatorschap
                kunt overdragen.
              </p>
            )}

            <button
              type="submit"
              disabled={!isOpen || transferring || !newOrganizerId}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {transferring ? "Overdracht uitvoeren…" : "Organisatorschap overdragen"}
            </button>
          </form>
        </section>

        <section className="mt-6 rounded-2xl border border-red-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-lg font-semibold text-red-800">
            Activiteit annuleren
          </h2>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            Annuleren beëindigt de activiteit voor alle deelnemers. Deze actie
            kan niet via de activiteitendetails worden uitgevoerd.
          </p>

          <button
            type="button"
            onClick={() => setCancelConfirmationOpen(true)}
            disabled={!isOpen || cancelling}
            className="mt-4 w-full rounded-lg border border-red-200 px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Activiteit annuleren
          </button>
        </section>
      </div>

      {cancelConfirmationOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-activity-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2
              id="cancel-activity-title"
              className="text-lg font-bold text-gray-900"
            >
              Activiteit definitief annuleren?
            </h2>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              De activiteit wordt als geannuleerd opgeslagen. Deelnemers
              kunnen zich daarna niet meer aanmelden.
            </p>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setCancelConfirmationOpen(false)}
                disabled={cancelling}
                className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Terug
              </button>
              <button
                type="button"
                onClick={cancelActivity}
                disabled={cancelling}
                className="rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
              >
                {cancelling ? "Annuleren…" : "Ja, annuleer activiteit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
