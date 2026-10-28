"use client";

import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { divIcon, type LeafletEvent, type Marker as LeafletMarker } from "leaflet";
import { ATTRIBUTION, TILE_URL } from "@/components/LeafletActivityMap";
import { useDocumentTheme } from "@/lib/useDocumentTheme";

type Props = {
  position: [number, number] | null;
  onPick: (lat: number, lon: number) => void;
};

const DEFAULT_CENTER: [number, number] = [51.4416, 5.4697];

const PICK_ICON = divIcon({
  className: "sport-pin-wrapper",
  html: '<span class="sport-pin is-selected"><span class="sport-pin-emoji">📍</span></span>',
  iconSize: [48, 56],
  iconAnchor: [24, 56],
});

function ClickToPick({ onPick }: { onPick: Props["onPick"] }) {
  useMapEvents({ click: (event) => onPick(event.latlng.lat, event.latlng.lng) });
  return null;
}

// Keep the chosen point in view, e.g. after "Mijn locatie".
function FollowPosition({ position }: { position: Props["position"] }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView(position, Math.max(map.getZoom(), 15));
  }, [map, position]);
  return null;
}

export default function LeafletLocationPicker({ position, onPick }: Props) {
  const theme = useDocumentTheme();
  return (
    <div className="activity-map location-picker-map h-full w-full" data-map-theme={theme}>
      <MapContainer center={position ?? DEFAULT_CENTER} zoom={position ? 15 : 12} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
        <TileLayer attribution={ATTRIBUTION} url={TILE_URL} maxZoom={19} />
        <ClickToPick onPick={onPick} />
        <FollowPosition position={position} />
        {position && (
          <Marker
            position={position}
            icon={PICK_ICON}
            draggable
            eventHandlers={{
              dragend: (event: LeafletEvent) => {
                const point = (event.target as LeafletMarker).getLatLng();
                onPick(point.lat, point.lng);
              },
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
