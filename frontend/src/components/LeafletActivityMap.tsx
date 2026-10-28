"use client";

import { useEffect } from "react";
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import { latLngBounds } from "leaflet";
import type { Activity } from "@/types/activity";

type Props = {
  activities: Activity[];
  selectedActivityId?: number | null;
  onActivityClick?: (id: number) => void;
  className?: string;
};

const DEFAULT_CENTER: [number, number] = [51.4416, 5.4697];

function FitActivities({ activities }: { activities: Activity[] }) {
  const map = useMap();

  useEffect(() => {
    const points = activities
      .filter(
        (a) =>
          typeof a.latitude === "number" &&
          typeof a.longitude === "number" &&
          Number.isFinite(a.latitude) &&
          Number.isFinite(a.longitude) &&
          a.latitude >= -90 &&
          a.latitude <= 90 &&
          a.longitude >= -180 &&
          a.longitude <= 180
      )
      .map((a) => [a.latitude!, a.longitude!] as [number, number]);

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
  const locatedActivities = activities.filter(
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
  );

  return (
    <div className={`h-full w-full ${className}`}>
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={10}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bijdragers'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitActivities activities={locatedActivities} />

        {locatedActivities.map((activity) => {
          const selected = activity.id === selectedActivityId;
          const full = activity.participants >= activity.capacity;

          return (
            <CircleMarker
              key={activity.id}
              center={[activity.latitude!, activity.longitude!]}
              radius={selected ? 12 : 9}
              pathOptions={{
                color: selected ? "#064e3b" : "#ffffff",
                weight: selected ? 4 : 3,
                fillColor: full ? "#6b7280" : "#047857",
                fillOpacity: 1,
              }}
              eventHandlers={{
                click: () => onActivityClick?.(activity.id),
              }}
            >
              <Tooltip direction="top" offset={[0, -8]}>
                <strong>{activity.title}</strong>
                <br />
                {activity.sport}
                <br />
                {full ? "Vol" : `${activity.participants}/${activity.capacity} deelnemers`}
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
