
import type { Activity } from "@/types/activity";
import { useRouter } from "next/navigation";
import { sportColors, sportEmoji } from "@/data/activities";
import ActivityMap from "@/components/ActivityMap";

type ActivityDetailsProps = {
  activity: Activity;
  onBack: () => void;
  hasJoined: boolean;
  onJoin: () => void;
  onLeave: () => void;
  isOrganizer: boolean;
  onManageSettings: () => void;
};

export default function ActivityDetails({
  activity,
  onBack,
  hasJoined,
  onJoin,
  onLeave,
  isOrganizer,
  onManageSettings,
}: ActivityDetailsProps) {
  const router = useRouter();
  const isFull = activity.participants >= activity.capacity;
  const isCancelled = activity.status === "GEANNULEERD";



  return (
    <div className="activity-details-page min-h-0 flex-1 overflow-y-auto bg-gray-50">
      <div className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
        <button
          type="button"
          onClick={onBack}
          className="mb-5 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-gray-600 transition hover:bg-white hover:text-emerald-800"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              d="m15 18-6-6 6-6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Terug naar activiteiten
        </button>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 p-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                  sportColors[activity.sport] ??
                  "bg-gray-100 text-gray-700"
                }`}
              >
                <span className="text-2xl leading-none" role="img" aria-label={activity.sport}>{sportEmoji[activity.sport] ?? "✦"}</span>
              </span>

              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  isCancelled
                    ? "bg-red-50 text-red-700"
                    : isFull
                      ? "bg-gray-100 text-gray-600"
                      : "bg-emerald-50 text-emerald-700"
                }`}
              >
                {isCancelled ? "GEANNULEERD" : isFull ? "VOL" : "OPEN"}
              </span>

              <span className="text-sm text-gray-500">
                {activity.sport}
              </span>
            </div>

            <h1 className="mt-5 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              {activity.title}
            </h1>

            <p className="mt-3 max-w-2xl leading-7 text-gray-600">
              {activity.description}
            </p>
          </div>

          <div className="grid gap-6 p-5 sm:p-7 md:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-7">
              <section>
                <h2 className="text-base font-semibold text-gray-900">
                  Wanneer en waar?
                </h2>

                <div className="mt-4 space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                      <svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <rect
                          x="3"
                          y="5"
                          width="18"
                          height="16"
                          rx="2"
                        />
                        <path d="M16 3v4M8 3v4M3 10h18" />
                      </svg>
                    </span>

                    <div>
                      <p className="text-sm text-gray-500">Datum en tijd</p>
                      <p className="mt-1 font-medium text-gray-900">
                        {activity.time}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                      <svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
                        <circle cx="12" cy="10" r="2.5" />
                      </svg>
                    </span>

                    <div>
                      <p className="text-sm text-gray-500">Locatie</p>
                      <p className="mt-1 font-medium text-gray-900">
                        {activity.location}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                      <span className="text-xl leading-none" role="img" aria-label="Niveau">
                        🎯
                      </span>
                    </span>

                    <div>
                      <p className="text-sm text-gray-500">Niveau</p>
                      <p className="mt-1 font-medium text-gray-900">
                        {activity.level}
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-base font-semibold text-gray-900">
                  Locatie op de kaart
                </h2>

                <div className="relative mt-3 h-48 overflow-hidden rounded-xl border border-gray-200 bg-[#edf1e9]">
                  {activity.latitude != null && activity.longitude != null ? (
                    <ActivityMap activities={[activity]} selectedActivityId={activity.id} />
                  ) : (
                    <div className="flex h-full items-center justify-center px-5 text-center text-sm text-gray-600">
                      Voor deze activiteit is nog geen exacte kaartlocatie beschikbaar.
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xs text-gray-400">
                  Kaartgegevens: OpenStreetMap-bijdragers.
                </p>
              </section>
            </div>

            <div className="space-y-6">
              <section className="rounded-xl border border-gray-200 p-4">
                <h2 className="font-semibold text-gray-900">
                  Deelnemers
                </h2>

                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-gray-500">
                    Aantal deelnemers
                  </span>
                  <span className="font-semibold text-gray-900">
                    {activity.participants}/{activity.capacity}
                  </span>
                </div>

                <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full ${
                      isFull ? "bg-gray-400" : "bg-emerald-500"
                    }`}
                    style={{
                      width: `${Math.min(
                        100,
                        (activity.participants / activity.capacity) * 100
                      )}%`,
                    }}
                  />
                </div>

                <div className="mt-4 divide-y divide-gray-100">
                  {activity.memberNames.map((name, index) => (
                    <div
                      key={`${activity.id}-${name}`}
                      className="flex items-center gap-3 py-3"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-sm font-semibold text-emerald-800">
                        {name.charAt(0).toUpperCase()}
                      </span>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-800">
                          {name}
                        </p>
                        {name === activity.organizer && (
                          <p className="text-xs text-gray-500">
                            Organisator
                          </p>
                        )}
                      </div>

                      {index === 0 && name !== activity.organizer && (
                        <span className="ml-auto text-xs text-gray-400">
                          Deelnemer
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-gray-200 p-4">
                <h2 className="font-semibold text-gray-900">
                  Organisator
                </h2>

                <div className="mt-3 flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-700 text-base font-semibold text-white">
                    {activity.organizer.charAt(0).toUpperCase()}
                  </span>

                  <div>
                    <p className="font-medium text-gray-900">
                      {activity.organizer}
                    </p>
                    <p className="text-sm text-gray-500">
                      Organisator van deze activiteit
                    </p>
                  </div>
                </div>
              </section>

              {(isOrganizer || hasJoined) &&
                !isCancelled &&
                activity.id >= 100000 && (
                  <section className="rounded-xl border border-emerald-200 bg-white p-4">
                    <h2 className="font-semibold text-gray-900">
                      Groepschat
                    </h2>

                    <p className="mt-1 text-sm text-gray-500">
                      Chat met de andere deelnemers van deze activiteit.
                    </p>

                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/activities/${activity.id - 100000}/chat`)
                      }
                      className="mt-4 w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
                    >
                      Open groepschat
                    </button>
                  </section>
                )}
              {isOrganizer && !isCancelled && activity.id >= 100000 && (
                <section className="rounded-xl border border-gray-200 p-4">
                  <h2 className="font-semibold text-gray-900">
                    Activiteit beheren
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Wijzig de activiteit via de instellingenpagina.
                    Annuleren en organisatorschap overdragen zijn daar
                    beschikbaar.
                  </p>
                  <button
                    type="button"
                    onClick={onManageSettings}
                    className="mt-4 w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
                  >
                    Instellingen beheren
                  </button>
                </section>
              )}

              {/* Deelname-interface bestaat alleen voor niet-organisatoren. */}
              {!isOrganizer && (
                <section className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
                  {isCancelled ? (
                    <p className="text-sm font-medium text-red-700">
                      Deelname is niet meer mogelijk.
                    </p>
                  ) : (
                    <>
                      <p className="text-sm leading-6 text-gray-600">
                        {hasJoined
                          ? "Je bent toegevoegd aan de deelnemerslijst. Deze wijziging is tijdelijk en wordt nog niet online opgeslagen."
                          : isFull
                            ? "Deze activiteit heeft het maximale aantal deelnemers bereikt."
                            : "Er is nog plek bij deze activiteit. Je kunt je tijdelijk aanmelden om de frontend te testen."}
                      </p>

                      {hasJoined ? (
                        <div className="mt-4 space-y-2">
                          <div className="w-full rounded-lg bg-emerald-100 px-4 py-3 text-center text-sm font-semibold text-emerald-800">
                            Je doet mee
                          </div>

                          <button
                            type="button"
                            onClick={onLeave}
                            className="w-full rounded-lg border border-red-200 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                          >
                            Afmelden voor activiteit
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={onJoin}
                          disabled={isFull}
                          className={`mt-4 w-full rounded-lg px-4 py-3 text-sm font-semibold transition ${
                            isFull
                              ? "cursor-not-allowed bg-gray-200 text-gray-500"
                              : "bg-emerald-700 text-white hover:bg-emerald-800"
                          }`}
                        >
                          {isFull ? "Activiteit is vol" : "Deelnemen"}
                        </button>
                      )}
                    </>
                  )}
                </section>
              )}
            </div>
          </div>
        </div>
      </div>

      
    </div>
  );
}
