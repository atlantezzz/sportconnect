import type { Activity } from "@/types/activity";
import { SportIcon } from "@/components/SportIcon";

export default function MapPin({ activity, selected, onClick }: { activity: Activity; selected: boolean; onClick: () => void }) {
  const isFull = activity.participants >= activity.capacity;
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${activity.sport}: ${activity.title}${isFull ? " (vol)" : ""}`}
      aria-label={`${activity.sport}: ${activity.title}${isFull ? ", activiteit is vol" : ""}`}
      className={`map-pin absolute z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] shadow-md transition hover:scale-110 ${isFull ? "map-pin-full" : ""} ${selected ? "map-pin-selected scale-110 ring-4 ring-emerald-200" : ""}`}
      style={{ left: `${activity.x}%`, top: `${activity.y}%` }}
    >
      <SportIcon sport={activity.sport} className="h-6 w-6" />
    </button>
  );
}
