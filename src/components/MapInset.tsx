"use client";

import dynamic from "next/dynamic";
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

interface MapInsetProps {
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

/** Leaflet-side controller: pans (flyTo) whenever `center` changes. */
function FlyToCenter({ center }: { center: LatLng }) {
  const map = useMap();

  useEffect(() => {
    map.flyTo([center.lat, center.lng], map.getZoom(), { duration: 0.25 });
    // Only the coordinates should retrigger the pan -- not a new `map`
    // reference (there isn't one) or a new function identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng]);

  return null;
}

function MapInsetInner({ center, status, onExpand, size = DEFAULT_SIZE, fill = false }: MapInsetProps) {
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

/**
 * Wrapped in `next/dynamic` with `ssr: false`, the same way `MapView.tsx`
 * wraps `SpotMap` -- Leaflet touches `window` at import time. Resolving a
 * component directly (rather than splitting into a second file) is the
 * same pattern `next/dynamic` uses internally for a plain module import:
 * it normalizes whatever the loader resolves to `{ default }` either way.
 */
const MapInset = dynamic(() => Promise.resolve({ default: MapInsetInner }), {
  ssr: false,
  loading: () => (
    <div
      style={{ width: DEFAULT_SIZE, height: DEFAULT_SIZE }}
      className="shrink-0 rounded border border-stone bg-cream-deep"
    />
  ),
});

export default MapInset;
