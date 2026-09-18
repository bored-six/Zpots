"use client";

import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";

import {
  DEFAULT_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  TILE_ATTRIBUTION,
  TILE_URL,
  ZAMBOANGA_CENTER,
} from "@/lib/map-config";
import { createPinIcon } from "@/lib/pin-icon";
import type { Spot } from "@/lib/spots";

interface SpotMapProps {
  spots: readonly Spot[];
}

/** "Unconfirmed" or "Confirmed" -- the exact label shown in each popup. */
function statusLabel(spot: Spot): string {
  return spot.status === "confirmed" ? "Confirmed" : "Unconfirmed";
}

export default function SpotMap({ spots }: SpotMapProps) {
  return (
    <MapContainer
      center={ZAMBOANGA_CENTER}
      zoom={DEFAULT_ZOOM}
      minZoom={MIN_ZOOM}
      maxZoom={MAX_ZOOM}
      scrollWheelZoom
      className="h-full w-full"
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
      {spots.map((spot) => (
        <Marker
          key={spot.id}
          position={[spot.lat, spot.lng]}
          icon={createPinIcon(spot.status)}
        >
          <Popup>
            <div className="zpots-popup">
              <p className="zpots-popup-name">{spot.name}</p>
              <p className="zpots-popup-note">{spot.note}</p>
              <span className="zpots-popup-status" data-status={spot.status}>
                {statusLabel(spot)}
              </span>
              {spot.nickname && (
                <p className="zpots-popup-credit">by {spot.nickname}</p>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
