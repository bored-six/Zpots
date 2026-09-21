"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import { MapContainer, Marker, Polyline, useMap } from "react-leaflet";

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

/** Floor for a flight's duration -- even a few-meter hop still reads as travel, not a snap. */
const MIN_FLY_SECONDS = 0.35;
/** Ceiling for a flight's duration -- past this a pan starts to feel sluggish inside a swipe deck. */
const MAX_FLY_SECONDS = 1.1;
/** Extra flight seconds added per kilometer of hop distance. */
const FLY_SECONDS_PER_KM = 0.12;
/**
 * Leaflet's default `easeLinearity` (0.25) eases hard out of the start,
 * which reads as a snap on a short hop. Pushed toward linear so the pan
 * reads as travel across the ground instead of an ease curve settling
 * into place.
 */
const FLY_EASE_LINEARITY = 0.5;

/** Trail color -- routed through the terracotta token, never a raw hex. */
const TRAIL_COLOR = "var(--color-terracotta)";
const TRAIL_WEIGHT = 3;
const TRAIL_MAX_OPACITY = 0.55;
/** How often the trail's opacity steps down while it fades. */
const TRAIL_FADE_TICK_MS = 30;
/** How much longer the trail lingers past the flight itself -- "a beat". */
const TRAIL_LINGER_MS = 250;

interface TrailSegment {
  /** Bumped per segment so React remounts `FadingTrail` instead of reusing a stale fade timer. */
  key: number;
  from: LatLng;
  to: LatLng;
  fadeMs: number;
}

/**
 * A polyline from the previous inset center to the new one that fades out
 * over roughly the flight duration plus a beat, then unmounts itself via
 * `onDone`. Driven by a plain interval rather than a CSS animation -- the
 * Paseo motion pass's CSS contract (globals.css) doesn't cover this trail,
 * and `pathOptions.opacity` is just a normal React-controlled prop either
 * way.
 */
function FadingTrail({ segment, onDone }: { segment: TrailSegment; onDone: () => void }) {
  const [opacity, setOpacity] = useState(TRAIL_MAX_OPACITY);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      const progress = Math.min(1, elapsed / segment.fadeMs);
      setOpacity(TRAIL_MAX_OPACITY * (1 - progress));
      if (progress >= 1) {
        clearInterval(id);
        onDone();
      }
    }, TRAIL_FADE_TICK_MS);

    return () => clearInterval(id);
    // `segment.fadeMs` is stable for the lifetime of a given segment --
    // the caller keys this component by `segment.key`, so a new segment
    // means a fresh mount (and a fresh `opacity` state) rather than this
    // effect resetting state on an existing one. `onDone` is stable from
    // the caller's `useCallback` but isn't part of the fade math itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segment.fadeMs]);

  return (
    <Polyline
      positions={[
        [segment.from.lat, segment.from.lng],
        [segment.to.lat, segment.to.lng],
      ]}
      pathOptions={{ color: TRAIL_COLOR, weight: TRAIL_WEIGHT, opacity }}
    />
  );
}

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
  const trailKeyRef = useRef(0);
  const [trail, setTrail] = useState<TrailSegment | null>(null);
  const clearTrail = useCallback(() => setTrail(null), []);

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
    previousCenterRef.current = center;

    // MapContainer's own `center` prop already positioned it -- see the
    // doc comment above for why this must not also pan.
    if (previous === null) return;
    if (previous.lat === center.lat && previous.lng === center.lng) return;

    if (hasUsableMapSize(map)) {
      // Scale the flight with hop distance -- a 40m hop and a cross-city
      // hop shouldn't take the same quarter-second. Clamped at both ends
      // so neither a near-zero hop nor a very far one breaks the feel.
      const km = map.distance([previous.lat, previous.lng], [center.lat, center.lng]) / 1000;
      const rawSeconds = MIN_FLY_SECONDS + km * FLY_SECONDS_PER_KM;
      const duration = Math.min(MAX_FLY_SECONDS, Math.max(MIN_FLY_SECONDS, rawSeconds));

      try {
        map.flyTo([center.lat, center.lng], map.getZoom(), {
          duration,
          easeLinearity: FLY_EASE_LINEARITY,
        });
        trailKeyRef.current += 1;
        setTrail({
          key: trailKeyRef.current,
          from: previous,
          to: center,
          fadeMs: duration * 1000 + TRAIL_LINGER_MS,
        });
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

  return trail ? <FadingTrail key={trail.key} segment={trail} onDone={clearTrail} /> : null;
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
