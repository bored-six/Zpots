"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  /**
   * True for the render span right after this spot's own confirm action
   * completed (paseo-motion.md fix-round-2 finding 2) -- forwarded straight
   * to `createPinIcon`'s `justConfirmed` option so the pin draws its halo
   * once. Optional and defaults to `false`; a no-op unless `status` is also
   * `"confirmed"`.
   */
  justConfirmed?: boolean;
  /**
   * False for every phone deck card except the currently active one
   * (`SpotsDeck.tsx`'s `activeMove.index`) -- unused, and defaulting to
   * `true`, for every other caller (the desktop `fill` column, `PostFlow`,
   * etc). Gates all camera work in `FlyToCenter`: an inactive instance never
   * calls `flyTo`/`setView`, so up to five mounted phone cards never animate
   * together, only the one actually transitioning to active does.
   */
  active?: boolean;
  /**
   * The walk's current stop -- coordinates of whichever card was active
   * immediately before this one -- supplied fresh by `SpotsDeck.tsx` (via
   * `SpotCardView.tsx`) at the moment this instance activates. `null`/
   * `undefined` when nothing has been active yet. See `FlyToCenter`'s doc
   * comment for why this is read live rather than baked into the map's
   * mount position.
   */
  previousCenter?: LatLng | null;
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
 * coordinate, OR (the phone deck fix) whenever this instance's own `active`
 * flag flips from false to true while `center` itself never moves.
 *
 * Each phone deck card (`SpotCardView.tsx`) mounts its *own* `MapInsetInner`
 * at its own fixed spot, so a single card's `center` prop never changes
 * over that card's lifetime -- there is nothing for the original
 * center-change-driven pan below to react to. `active` is the actual
 * per-card activation signal `SpotsDeck.tsx` already tracks
 * (`data-active`/`activeMove`); `previousCenter` is the walk's current stop
 * as of the moment this instance activates -- supplied fresh by
 * `SpotsDeck.tsx` (the only thing that knows both the active index and the
 * full card list) via `SpotCardView.tsx`.
 *
 * An earlier version of this tried to seed the origin from wherever
 * `MapContainer` actually mounted the camera (an `initialCenter` prop
 * threaded into its `center` construction prop), on the theory that a
 * not-yet-active card could simply be mounted "pre-positioned" at the
 * walk's then-current stop. That breaks for exactly the cards most likely
 * to be exercised first: `SpotsDeck`'s +/-2 window means indices 1 and 2
 * are already mounted on the very first render, before any activation has
 * happened at all, so their "initial" position froze in as their *own* true
 * coordinates (nothing to travel from existed yet) -- and since
 * react-leaflet's `MapContainer` only reads its `center` prop once, at
 * construction, that freeze is permanent for the lifetime of the instance.
 * The very first swipe or two would silently never travel. This version
 * always mounts `MapContainer` at `center` (its own true coordinates, as
 * before this fix existed) and instead does the travel entirely inside this
 * effect, at the exact moment `active` flips true: an instant, unanimated
 * `setView` to `previousCenter` (wherever the walk actually was, read fresh
 * at that moment) immediately followed by the same animated `flyTo` this
 * effect already does for the desktop case. Both calls happen synchronously
 * in the same effect, before the browser paints a frame, so this reads as
 * one continuous flight away from the previous stop rather than a visible
 * snap.
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
 *
 * An inactive instance (a phone card sitting in the +/-2 window, not yet
 * the active one) does zero Leaflet work here -- no setView, no flyTo --
 * so five mounted cards never mean five live camera updates; only the one
 * instance whose `active` flip is actually happening ever touches the map.
 */
function FlyToCenter({
  center,
  active = true,
  previousCenter,
}: {
  center: LatLng;
  /** False for every phone deck card except the currently active one.
   * Always true (the default) for every existing caller -- the desktop
   * `fill` instance and any other single-instance usage -- so this change
   * is a no-op for them. */
  active?: boolean;
  /** The walk's current stop, read fresh at the moment this instance
   * activates -- unused while inactive, and unused by the desktop path
   * (which derives its own origin from `center` changing instead; see the
   * doc comment above). */
  previousCenter?: LatLng | null;
}) {
  const map = useMap();
  // For the desktop path: the last `center` this effect actually flew to
  // (or the value it mounted with). Untouched while a phone instance is
  // inactive -- an inactive card's camera never really moves, so nothing
  // here should pretend otherwise.
  const previousCenterRef = useRef<LatLng | null>(null);
  // Phone path only: true once this instance has performed its own
  // activation-triggered travel. `center` never changes for a phone card,
  // so `previousCenterRef` alone can't tell "already traveled" apart from
  // "just mounted" the way it can for the desktop path -- and without this,
  // deactivating and reactivating with the same still-live `previousCenter`
  // prop (nothing else has become active in between) would replay the same
  // flight as a dishonest no-op "travel" from a spot the camera never
  // actually left. One-shot per instance: once the camera genuinely sits at
  // `center` from a real completed flight, a later reactivation finding it
  // already there is simply honest, not something to fake a pan for.
  const hasTraveledRef = useRef(false);
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

    if (previousCenterRef.current === null) {
      // Mount guard -- MapContainer's own `center` prop already positioned
      // the map here. Never pan on this very first run, regardless of
      // `active` or `previousCenter` -- see the long doc comment above.
      previousCenterRef.current = center;
      return;
    }

    // Inactive instance: never touch Leaflet. This is what keeps up to five
    // mounted phone cards (+/-2 window) from ever animating together --
    // only the one instance whose own `active` flip is happening reaches
    // the code below, and every other one does zero work here.
    if (!active) return;

    const priorTarget = previousCenterRef.current;
    const centerMoved = priorTarget.lat !== center.lat || priorTarget.lng !== center.lng;
    previousCenterRef.current = center;

    // Desktop path (case 1): this single instance's own `center` prop moved
    // to a new spot -- travel from wherever it was flying to/sitting at.
    // Phone path (case 2): `center` never moves for a given card; the
    // activation itself is the trigger, and `previousCenter` (the walk's
    // current stop, supplied fresh by the caller) is the origin -- but only
    // the first time (see `hasTraveledRef`'s doc comment).
    let origin: LatLng | null = null;
    if (centerMoved) {
      origin = priorTarget;
    } else if (!hasTraveledRef.current && isUsableCenter(previousCenter)) {
      origin = previousCenter;
      hasTraveledRef.current = true;
    }

    if (origin === null) return;
    if (origin.lat === center.lat && origin.lng === center.lng) return;

    if (hasUsableMapSize(map)) {
      if (!centerMoved) {
        // Phone activation case only: the camera has been quietly sitting
        // at `center` (its own true coordinates -- MapContainer always
        // mounts there) the whole time this card was inactive. Recenter it
        // to `origin` instantly, in the same synchronous effect run as the
        // animated `flyTo` just below, so the browser never paints the
        // intermediate frame -- this reads as one continuous flight away
        // from the previous stop, not a snap back followed by a return.
        try {
          map.setView([origin.lat, origin.lng], map.getZoom(), { animate: false });
        } catch {
          // A pan must never take the whole page down.
        }
      }
      // Scale the flight with hop distance -- a 40m hop and a cross-city
      // hop shouldn't take the same quarter-second. Clamped at both ends
      // so neither a near-zero hop nor a very far one breaks the feel.
      const km = map.distance([origin.lat, origin.lng], [center.lat, center.lng]) / 1000;
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
          from: origin,
          to: center,
          fadeMs: duration * 1000 + TRAIL_LINGER_MS,
        });
      } catch {
        // A pan must never take the whole page down.
      }
    } else {
      safeSetView(map, center);
    }
    // `active` must retrigger this: a phone card's `center` never changes
    // over its own lifetime, so its activation (the only phone-path trigger)
    // shows up here as an `active` flip with `center` untouched.
    // `previousCenter` is read fresh at exactly that moment, so it belongs
    // in the deps too. Neither `map` (a stable reference from react-leaflet)
    // nor a new function identity should retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng, active, previousCenter?.lat, previousCenter?.lng]);

  return trail ? <FadingTrail key={trail.key} segment={trail} onDone={clearTrail} /> : null;
}

export default function MapInsetInner({
  center,
  status,
  onExpand,
  size = DEFAULT_SIZE,
  fill = false,
  justConfirmed = false,
  active = true,
  previousCenter,
}: MapInsetProps) {
  // Declared before the `isUsableCenter` early return below so hook order
  // never varies across renders (PostFlow.tsx's own early returns follow
  // the same shape). Feeds the live Leaflet instance to `BasemapLayer` as
  // an explicit prop -- D4: never `useMap()`.
  const [map, setMap] = useState<LeafletMap | null>(null);

  // paseo-motion.md fix-round-2, finding 1 -- `createPinIcon` used to be
  // called inline in JSX, allocating a brand-new `L.DivIcon` on every
  // render regardless of whether `status`/`justConfirmed` changed.
  // react-leaflet's `Marker` only calls `setIcon` on a reference change,
  // and Leaflet's `DivIcon.createIcon` unconditionally rewrites the
  // marker div's `innerHTML` -- so a fresh icon on an unrelated re-render
  // (e.g. an adjacent card's scroll-driven state update) tore down and
  // rebuilt this marker's DOM, restarting the one-shot
  // `.zpots-pin-icon--just-confirmed` halo animation. Memoizing on the
  // two inputs that actually change the icon's markup keeps the same
  // object across every other re-render.
  const pinIcon = useMemo(
    () => createPinIcon(status, { justConfirmed }),
    [status, justConfirmed],
  );

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
        <Marker position={[center.lat, center.lng]} icon={pinIcon} />
        <FlyToCenter center={center} active={active} previousCenter={previousCenter} />
      </MapContainer>
    </button>
  );
}
