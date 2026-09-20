"use client";

import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";

import CityMask from "@/components/CityMask";
import type { LatLng } from "@/lib/geo";
import { TILE_ATTRIBUTION, TILE_URL } from "@/lib/map-config";
import { createPinIcon } from "@/lib/pin-icon";
import type { SpotStatus } from "@/lib/spots";

/** Close enough to read the single pin clearly without panning controls. */
const INSET_ZOOM = 16;

/** Default square size (px) for the deck-card inset. */
const DEFAULT_SIZE = 112;

export interface MapInsetProps {
  center: LatLng;
  status: SpotStatus;
  /**
   * Tap handler -- MapInset itself has no opinion on what a tap means; the
   * caller decides (navigate to `/mapa`, or expand an inline preview),
   * per social-spots.md "Spots deck" ("Tap opens `/mapa?spot=<id>` only
   * if... otherwise it expands inline").
   */
  onExpand: () => void;
  /** Square size in px. Ignored when `fill` is set. Defaults to 112. */
  size?: number;
  /**
   * Stretches to fill its container instead of a fixed square -- the
   * desktop two-column layout's right-hand map (`app/page.tsx`).
   */
  fill?: boolean;
}

/** True only for a `LatLng` Leaflet can actually plot -- both coordinates present and finite. */
function isUsableCenter(center: LatLng | undefined | null): center is LatLng {
  return (
    center != null && Number.isFinite(center.lat) && Number.isFinite(center.lng)
  );
}

/** Leaflet-side controller: pans (flyTo) whenever `center` changes. */
function FlyToCenter({ center }: { center: LatLng }) {
  const map = useMap();

  useEffect(() => {
    if (!isUsableCenter(center)) return;
    map.flyTo([center.lat, center.lng], map.getZoom(), { duration: 0.25 });
    // Only the coordinates should retrigger the pan -- not a new `map`
    // reference (there isn't one) or a new function identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng]);

  return null;
}

export default function MapInsetInner({
  center,
  status,
  onExpand,
  size = DEFAULT_SIZE,
  fill = false,
}: MapInsetProps) {
  // A missing/non-finite coordinate must never crash the page -- Leaflet's
  // LatLng constructor throws "Invalid LatLng object: (NaN, NaN)" on
  // anything else. A caller can hand this a center before any real spot is
  // active (page.tsx's right-column map before the first card loads) or a
  // row whose coordinates didn't survive the trip from the database; either
  // way, render nothing rather than a broken MapContainer.
  if (!isUsableCenter(center)) return null;

  const dimensionStyle = fill ? undefined : { width: size, height: size };
  const dimensionClass = fill ? "h-full w-full" : "";

  return (
    <button
      type="button"
      onClick={onExpand}
      style={dimensionStyle}
      className={`zpots-shadow block shrink-0 overflow-hidden rounded border border-stone ${dimensionClass}`}
    >
      <span className="sr-only">Open on the map</span>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={INSET_ZOOM}
        zoomControl={false}
        attributionControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        boxZoom={false}
        keyboard={false}
        className="h-full w-full"
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <CityMask />
        <Marker position={[center.lat, center.lng]} icon={createPinIcon(status)} />
        <FlyToCenter center={center} />
      </MapContainer>
    </button>
  );
}
