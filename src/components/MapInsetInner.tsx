"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import { MapContainer, Marker, useMap } from "react-leaflet";

import BasemapLayer from "@/components/BasemapLayer";
import CityMask from "@/components/CityMask";
import type { LatLng } from "@/lib/geo";
import { hasUsableMapSize } from "@/lib/leaflet-safe-view";
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

/**
 * Recenters via `setView` (no animation, no division-by-pixel-size math) --
 * the safe fallback whenever an animated `flyTo` can't be trusted, and used
 * again once the container has a real size to make sure it's centered on
 * whatever `center` was actually meant. Swallows a throw defensively: a pan
 * must never take the whole page down.
 */
function safeSetView(map: LeafletMap, center: LatLng) {
  try {
    map.setView([center.lat, center.lng], map.getZoom(), { animate: false });
  } catch {
    // Nothing useful to do beyond not crashing.
  }
}

/**
 * Leaflet-side controller: pans whenever `center` changes to a different
 * coordinate.
 *
 * Does *not* pan on the very first run -- `MapContainer`'s own `center`
 * prop already positions the map at mount, so an initial pan here would
 * just be a redundant animation. It was also, in practice, the dangerous
 * one: `MapInset`'s `fill` variant (`app/page.tsx`'s desktop right column,
 * `h-full w-full` inside a flex row) can still report a 0x0 container to
 * Leaflet the moment this effect first fires, before that flex layout has
 * resolved a real height. Leaflet's `flyTo` divides by the container's
 * pixel size (`getSize()`) as part of its easing math; a 0x0 size turns
 * that into NaN, which its `LatLng` constructor then throws on --
 * "Invalid LatLng object: (NaN, NaN)" -- taking down the whole page.
 */
function FlyToCenter({ center }: { center: LatLng }) {
  const map = useMap();
  const previousCenterRef = useRef<LatLng | null>(null);

  // If the container is already usably sized at mount, there's nothing to
  // fix here -- MapContainer's own `center` prop already positioned it
  // correctly. Otherwise (the `fill` variant before its flex layout has
  // resolved a real height), wait one frame, nudge Leaflet to recompute
  // against whatever real size it has by then via `invalidateSize()`, and
  // reapply the center it was mounted with -- the pixel origin Leaflet
  // computed against the 0x0 container at mount would otherwise stay
  // wrong even after the box gets its real height.
  useEffect(() => {
    if (hasUsableMapSize(map)) return;

    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      if (cancelled) return;
      map.invalidateSize();
      const pending = previousCenterRef.current;
      if (pending) safeSetView(map, pending);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
    // Runs once per mount only -- `map` is a stable reference from
    // react-leaflet, not something that should retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isUsableCenter(center)) return;

    const previous = previousCenterRef.current;
    const isFirstRun = previous === null;
    const isUnchanged = previous !== null && previous.lat === center.lat && previous.lng === center.lng;
    previousCenterRef.current = center;

    if (isFirstRun || isUnchanged) return;

    if (hasUsableMapSize(map)) {
      try {
        map.flyTo([center.lat, center.lng], map.getZoom(), { duration: 0.25 });
      } catch {
        // A pan must never take the whole page down.
      }
    } else {
      safeSetView(map, center);
    }
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
  // Declared before the `isUsableCenter` early return below so hook order
  // never varies across renders (PostFlow.tsx's own early returns follow
  // the same shape). Feeds the live Leaflet instance to `BasemapLayer` as
  // an explicit prop -- D4: never `useMap()`.
  const [map, setMap] = useState<LeafletMap | null>(null);

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
        ref={setMap}
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
        {/* No PlaceLabelsLayer and no raster-fallback chip here (D3/D6/E17):
            112px is too small for either -- ground + pin only. */}
        <BasemapLayer map={map} />
        <CityMask />
        <Marker position={[center.lat, center.lng]} icon={createPinIcon(status)} />
        <FlyToCenter center={center} />
      </MapContainer>
    </button>
  );
}
