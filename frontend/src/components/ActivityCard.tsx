import type { Activity } from "@/types/activity";
import { sportColors } from "@/data/activities";

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

  const status = isJoined ? "DEELNEMEND" : isFull ? "VOL" : "OPEN";

  const statusColor = isJoined
    ? "text-blue-700"
    : isFull
      ? "text-gray-500"
      : "text-emerald-700";

  const dotColor = isJoined
    ? "bg-blue-500"
    : isFull
      ? "bg-gray-400"
      : "bg-emerald-500";

  const progress = Math.min(
    100,
    (activity.participants / activity.capacity) * 100
  );

  return (
    <article className={`activity-card h-full min-w-0 rounded-xl border border-gray-200 bg-white transition hover:border-emerald-300 hover:shadow-sm ${compact ? "activity-card-compact" : ""}`}>
      <div className={compact ? "p-3" : "p-4"}>
        <div className={`${compact ? "mb-2" : "mb-3"} flex items-center justify-between gap-2`}>
          <span
            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
              sportColors[activity.sport] ?? "bg-gray-100 text-gray-700"
            }`}
          >
            {activity.sport}
          </span>

          <span className={`flex items-center gap-1.5 text-xs font-semibold ${statusColor}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
            {status}
          </span>
        </div>

        <h3 className="text-[15px] font-semibold text-gray-900">
          {activity.title}
        </h3>

        <div className={`${compact ? "mt-1.5 space-y-1" : "mt-2 space-y-1.5"} text-sm text-gray-500`}>
          <p>{activity.time}</p>
          <p className={compact ? "truncate" : ""}>{activity.location}</p>
        </div>

        <div className={compact ? "mt-3" : "mt-4"}>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-gray-500">Deelnemers</span>
            <span className="font-medium text-gray-700">
              {activity.participants}/{activity.capacity}
            </span>
          </div>

          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full ${
                isFull ? "bg-gray-400" : "bg-emerald-500"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={onOpen}
          className={`${compact ? "mt-3 py-2" : "mt-4 py-2.5"} w-full rounded-lg border border-emerald-700 px-4 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50`}
        >
          Bekijk activiteit
        </button>
      </div>
    </article>
  );
}