"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import { divIcon, latLngBounds } from "leaflet";
import type { Activity } from "@/types/activity";
import { sportEmoji } from "@/data/activities";
import { useDocumentTheme } from "@/lib/useDocumentTheme";
import { useIsShown } from "@/lib/useIsShown";

type Props = {
  activities: Activity[];
  selectedActivityId?: number | null;
  onActivityClick?: (id: number) => void;
  className?: string;
};

const DEFAULT_CENTER: [number, number] = [51.4416, 5.4697];

// OpenStreetMap tiles (no API key). Dark mode darkens the same tiles with a CSS
// filter on the tile layer only (see .activity-map[data-map-theme="dark"] in
// globals.css), so pins keep their colours. CARTO's styles need an API key.
export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bijdragers';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

// Pin with the sport's emoji; only the sport is visible until you click.
function sportPin(activity: Activity, selected: boolean) {
  const full = activity.participants >= activity.capacity;
  const classes = ["sport-pin", selected ? "is-selected" : "", full ? "is-full" : ""].filter(Boolean).join(" ");
  const label = escapeHtml(`${activity.sport}: ${activity.title}`);
  return divIcon({
    className: "sport-pin-wrapper",
    html: `<span class="${classes}" role="img" aria-label="${label}"><span class="sport-pin-emoji">${sportEmoji[activity.sport] ?? "•"}</span></span>`,
    iconSize: selected ? [48, 56] : [40, 47],
    iconAnchor: selected ? [24, 56] : [20, 47],
  });
}

function FitActivities({ activities }: { activities: Activity[] }) {
  const map = useMap();

  useEffect(() => {
    const points = activities.map((a) => [a.latitude!, a.longitude!] as [number, number]);

    if (points.length === 1) {
      map.setView(points[0], 14);
    } else if (points.length > 1) {
      map.fitBounds(latLngBounds(points), { padding: [35, 35], maxZoom: 14 });
    }
  }, [activities, map]);

  return null;
}

export default function LeafletActivityMap({
  activities,
  selectedActivityId = null,
  onActivityClick,
  className = "",
}: Props) {
  const theme = useDocumentTheme();
  const shown = useIsShown();
  const locatedActivities = useMemo(
    () =>
      activities.filter(
        (a) =>
          typeof a.latitude === "number" &&
          typeof a.longitude === "number" &&
          Number.isFinite(a.latitude) &&
          Number.isFinite(a.longitude) &&
          a.latitude >= -90 &&
          a.latitude <= 90 &&
          a.longitude >= -180 &&
          a.longitude <= 180 &&
          a.status !== "GEANNULEERD"
      ),
    [activities],
  );

  return (
    <div className={`activity-map h-full w-full ${className}`} data-map-theme={theme}>
      {shown && (
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={10}
          scrollWheelZoom
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer attribution={ATTRIBUTION} url={TILE_URL} maxZoom={19} />

          <FitActivities activities={locatedActivities} />

          {locatedActivities.map((activity) => {
            const selected = activity.id === selectedActivityId;
            return (
              <Marker
                key={activity.id}
                position={[activity.latitude!, activity.longitude!]}
                icon={sportPin(activity, selected)}
                zIndexOffset={selected ? 1000 : 0}
                keyboard
                eventHandlers={{
                  click: () => onActivityClick?.(activity.id),
                  keypress: (event) => {
                    const key = (event.originalEvent as KeyboardEvent).key;
                    if (key === "Enter" || key === " ") onActivityClick?.(activity.id);
                  },
                }}
              />
            );
          })}
        </MapContainer>
      )}
    </div>
  );
}
