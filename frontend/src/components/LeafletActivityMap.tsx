"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import { divIcon, latLngBounds } from "leaflet";
import type { Activity } from "@/types/activity";
import { sportEmoji } from "@/data/activities";

type Props = {
  activities: Activity[];
  selectedActivityId?: number | null;
  onActivityClick?: (id: number) => void;
  className?: string;
};

const DEFAULT_CENTER: [number, number] = [51.4416, 5.4697];

// CARTO basemaps (OpenStreetMap data): Voyager for light, Dark Matter for dark.
const TILES = {
  light: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
} as const;
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bijdragers &copy; <a href="https://carto.com/attributions">CARTO</a>';

// Follows data-theme on <html>, which the theme toggle changes.
function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
function useDocumentTheme(): "light" | "dark" {
  return useSyncExternalStore(
    subscribeToTheme,
    () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"),
    () => "light",
  );
}

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
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={10}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        {/* key: remount the layer when the theme changes */}
        <TileLayer key={theme} attribution={ATTRIBUTION} url={TILES[theme]} subdomains="abcd" maxZoom={20} />

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
    </div>
  );
}
