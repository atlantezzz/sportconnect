import type { Activity } from "@/types/activity";
import { sportColors, sportEmoji } from "@/data/activities";

export default function ActivityCard({
  activity,
  onOpen,
  isJoined,
  compact = false,
}: {
  activity: Activity;
  onOpen: () => void;
  isJoined: boolean;
  compact?: boolean;
}) {
  const isFull = activity.participants >= activity.capacity;
  const isCancelled = activity.status === "GEANNULEERD";

  const status = isCancelled ? "GEANNULEERD" : isJoined ? "DEELNEMEND" : isFull ? "VOL" : "OPEN";

  const statusColor = isCancelled
    ? "rounded-md bg-red-50 px-2 py-0.5 text-red-700"
    : isJoined
      ? "text-blue-700"
      : isFull
        ? "text-gray-500"
        : "text-emerald-700";

  const dotColor = isCancelled
    ? "bg-red-500"
    : isJoined
      ? "bg-blue-500"
      : isFull
        ? "bg-gray-400"
        : "bg-emerald-500";

  const progress = Math.min(
    100,
    (activity.participants / activity.capacity) * 100
  );

  return (
    <article className={`activity-card flex h-full min-w-0 flex-col rounded-xl border bg-white transition hover:shadow-sm ${isCancelled ? "activity-card-cancelled border-red-300 border-l-4 border-l-red-500" : "border-gray-200 hover:border-emerald-300"} ${compact ? "activity-card-compact" : ""}`}>
      <div className="flex flex-1 flex-col p-3">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span
            className={`truncate rounded-md px-2 py-0.5 text-[11px] font-semibold ${
              sportColors[activity.sport] ?? "bg-gray-100 text-gray-700"
            }`}
          >
            <span aria-hidden="true" className="mr-1">{sportEmoji[activity.sport] ?? "•"}</span>
            {activity.sport}
          </span>

          <span className={`flex shrink-0 items-center gap-1.5 text-[11px] font-semibold ${statusColor}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
            {status}
          </span>
        </div>

        <h3 className={`truncate text-[15px] font-semibold leading-snug ${isCancelled ? "text-gray-500 line-through" : "text-gray-900"}`} title={activity.title}>
          {activity.title}
        </h3>
        {isCancelled && (
          <p className="mt-0.5 text-xs font-medium text-red-700">
            Deze activiteit is geannuleerd door de organisator.
          </p>
        )}

        <dl className="mt-1.5 space-y-0.5 text-[13px] text-gray-500">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Wanneer</dt>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" strokeLinecap="round" /></svg>
            <dd className="truncate">{activity.time}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Waar</dt>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21Z" strokeLinejoin="round" /><circle cx="12" cy="10" r="2.3" /></svg>
            <dd className="truncate" title={activity.location}>{activity.location || "Locatie niet opgegeven"}</dd>
          </div>
        </dl>

        <div className="mt-auto flex items-center gap-3 pt-2.5">
          <div className="min-w-0 flex-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
              <div
                className={`h-full rounded-full ${isFull ? "bg-gray-400" : "bg-emerald-500"}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-gray-500">
              <span className="font-semibold text-gray-700">{activity.participants}/{activity.capacity}</span> deelnemers · {activity.level}
            </p>
          </div>
          <button
            type="button"
            onClick={onOpen}
            className="shrink-0 rounded-lg border border-emerald-700 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50"
            aria-label={`Bekijk ${activity.title}`}
          >
            Bekijk
          </button>
        </div>
      </div>
    </article>
  );
}
