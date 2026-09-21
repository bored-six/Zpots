"use client";

import type { LeafletMouseEvent, Map as LeafletMap } from "leaflet";
import type L from "leaflet";
import { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, Marker, Popup } from "react-leaflet";

import AddSpotForm from "@/components/AddSpotForm";
import BasemapLayer, { type BasemapMode } from "@/components/BasemapLayer";
import Bilingual from "@/components/Bilingual";
import CityMask from "@/components/CityMask";
import ConfirmButton from "@/components/ConfirmButton";
import { AddSpotIcon } from "@/components/icons/action-icons";
import { AlertIcon } from "@/components/icons/status-icons";
import { VintaRule } from "@/components/icons/ornaments";
import PlaceLabelsLayer from "@/components/PlaceLabelsLayer";
import ReportButton from "@/components/ReportButton";
import SignInPrompt, { type GatedAction } from "@/components/SignInPrompt";
import SpotPhoto from "@/components/SpotPhoto";
import type { AuthStatus } from "@/lib/auth";
import { isWithinZamboangaCity } from "@/lib/city-bounds";
import { CITY_OUTLINE_BOUNDS } from "@/lib/city-outline";
import { bilingualLabel, COPY } from "@/lib/copy";
import { hasUsableMapSize } from "@/lib/leaflet-safe-view";
import {
  DEFAULT_ZOOM,
  MAX_BOUNDS,
  MAX_ZOOM,
  MIN_ZOOM,
  ZAMBOANGA_CENTER,
} from "@/lib/map-config";
import { createPhotoPinIcon, createPinIcon, type PhotoPinSize, type PinSize } from "@/lib/pin-icon";
import {
  computePinTiers,
  PHOTO_CEILING_TIER,
  PHOTO_LAST_TIER,
  PIN_TIER_SIZES,
  PLAIN_CEILING_TIER,
  type DensityPoint,
  type PinTier,
} from "@/lib/pin-density";
import type { MapSource, MapSpot, Spot } from "@/lib/spots";
import type { NewSpotInput, ReportReason } from "@/lib/validation";

/**
 * press 320 + delay 320 + pulse 640 = 1280ms; 1200 sits inside the pulse's
 * invisible tail (pin-revamp-spec.md section 4.7's "one-shot guarantee") --
 * every animation's end frame equals the static confirmed render, so
 * clearing the flag here is invisible even if it lands mid-pulse.
 */
const JUST_CONFIRMED_TTL_MS = 1200;

/**
 * True only for a spot Leaflet can actually plot. A row with a missing or
 * non-finite `lat`/`lng` (bad upstream data, a partial/legacy row) must
 * never reach a `Marker` -- Leaflet's LatLng constructor throws "Invalid
 * LatLng object: (NaN, NaN)", which would take down the whole map instead
 * of just skipping the one bad pin.
 */
function hasFiniteCoords(spot: { lat: number; lng: number }): boolean {
  return Number.isFinite(spot.lat) && Number.isFinite(spot.lng);
}

interface SpotMapProps {
  /**
   * Write-mode spots (tap-to-place, confirm, report). Omitted entirely by
   * the read-only Mi mapa caller, which passes `mapSpots` instead.
   */
  spots?: readonly Spot[];
  /**
   * Read-only personal-map spots (Mi mapa, social-spots.md), each tagged
   * with why it's on the caller's map. Renders alongside `spots` if both
   * are somehow passed, but in practice a caller picks one or the other.
   */
  mapSpots?: readonly MapSpot[];
  /**
   * Spot ids this browser has already confirmed (spec F9) -- feeds
   * `ConfirmButton`'s `confirmedByMe`. Optional so a caller that only cares
   * about rendering spots (no confirm/report wiring) isn't forced to pass it.
   */
  confirmedSpotIds?: ReadonlySet<string>;
  /**
   * Required in the type; at runtime `undefined` is treated as
   * `'signed-out'` (fail-closed) so the frozen static-render test
   * (SpotMap.test.tsx, which passes no such prop) still renders.
   */
  authStatus: AuthStatus;
  /** The signed-in user's account nickname, forwarded to AddSpotForm as defaultNickname. */
  nickname?: string;
  /**
   * Rejecting keeps the form open with an inline error; resolving closes it
   * and ends placement mode. The add-spot FAB itself only renders when this
   * is provided -- Mi mapa has no tap-to-place flow, so it simply omits it.
   */
  onCreateSpot?: (input: NewSpotInput) => Promise<void>;
  /** Omit to hide the Confirm control on `mapSpots` popups (Mi mapa doesn't wire this yet). */
  onConfirmSpot?: (spotId: string) => Promise<void>;
  /** Omit to hide the Report control on `mapSpots` popups (Mi mapa doesn't wire this yet). */
  onReportSpot?: (spotId: string, reason: ReportReason, details?: string) => Promise<void>;
  /** Opens this `mapSpots` entry's popup once its Marker mounts (the `?spot=` deep link). */
  openSpotId?: string;
  /** When provided, saved-source `mapSpots` popups get a Quita ghost button that calls this. */
  onUnsave?: (spotId: string) => void;
  /** Restricts which `mapSpots` sources render; omitted shows every source passed in. */
  sourceFilter?: ReadonlySet<MapSource>;
  /**
   * Fits the initial view to CITY_OUTLINE_BOUNDS once on mount instead of
   * the usual ZAMBOANGA_CENTER/DEFAULT_ZOOM -- Mi mapa's own view of the
   * whole city, per the city-outline mask work. Never applied when
   * `openSpotId` is set (that deep link opens its own popup instead).
   */
  fitToCity?: boolean;
  /**
   * Fits the view to these [[south, west], [north, east]] bounds whenever
   * the value changes (compared by value, so an inline literal is fine),
   * and wins over `fitToCity` when both are set on mount. Mi mapa uses it
   * to frame the preview pins, which fit-to-city would leave off-screen.
   */
  fitBounds?: [[number, number], [number, number]];
}

/** Padding + zoom cap for `fitBounds`, so a tight downtown cluster doesn't land at street level. */
const FIT_BOUNDS_OPTIONS = { padding: [32, 32] as [number, number], maxZoom: 15 };

/**
 * `fitBounds`, guarded the same way `MapInsetInner`'s `FlyToCenter` guards
 * `flyTo`: `fitBounds`'s own zoom-to-fit math (`Map#getBoundsZoom`) divides
 * by the container's pixel size, and a 0x0 container -- possible the
 * instant this map mounts, before layout has settled -- turns that into
 * NaN, which Leaflet's `LatLng` constructor then throws on regardless of
 * `animate`. If the container isn't sized yet, wait one frame (nudging
 * Leaflet to notice its real size via `invalidateSize()`) and retry once;
 * either way a throw is swallowed rather than crashing the page. Returns a
 * cleanup that cancels the pending retry, if there is one.
 */
function safeFitBounds(
  map: LeafletMap,
  bounds: Parameters<LeafletMap["fitBounds"]>[0],
  options?: Parameters<LeafletMap["fitBounds"]>[1],
): () => void {
  // Unlike `flyTo`, `fitBounds` has no safe animate:false-style fallback --
  // the NaN comes from the zoom-to-fit math itself, not the animation on
  // top of it. So a still-zero container after the retry just doesn't get
  // fit, rather than risking the crash.
  function fitIfUsable(): boolean {
    if (!hasUsableMapSize(map)) return false;
    try {
      map.fitBounds(bounds, options);
    } catch {
      // A fit must never take the whole page down.
    }
    return true;
  }

  if (fitIfUsable()) return () => {};

  let cancelled = false;
  const frame = requestAnimationFrame(() => {
    if (cancelled) return;
    map.invalidateSize();
    fitIfUsable();
  });
  return () => {
    cancelled = true;
    cancelAnimationFrame(frame);
  };
}

const FAB_CLASS =
  "zpots-shadow absolute right-4 top-4 z-[1000] flex min-h-10 items-center gap-2 rounded-full " +
  "px-4 py-3 text-sm font-bold text-cream focus:outline-none";
const FAB_IDLE_CLASS = "bg-terracotta hover:bg-terracotta-deep";
const FAB_ARMED_CLASS = "bg-teal hover:bg-teal-deep";

const BANNER_CLASS =
  "zpots-shadow absolute left-1/2 top-4 z-[1000] flex -translate-x-1/2 items-stretch " +
  "overflow-hidden rounded-[6px] border border-stone bg-cream-deep text-sm font-medium text-ink";
const BANNER_TEXT_CLASS = "px-4 py-2";

/**
 * The raster-fallback notice (Pergamino PRD D6): a small chip, not a banner
 * -- it must never fight the outside-city / tap-to-place banners for the
 * same top-of-map space, and at 112px the deck inset doesn't show it at all
 * (PlaceLabelsLayer and this chip are both SpotMap-only, per D3/T3.2).
 */
const RASTER_CHIP_CLASS =
  "zpots-shadow absolute bottom-4 left-4 z-[1000] w-fit rounded-full border border-stone " +
  "bg-cream px-3 py-1 text-xs font-medium text-ink";
/** Id of the sr-only span carrying `simpleMapWhy`, referenced by the chip's `aria-describedby`. */
const RASTER_CHIP_WHY_ID = "raster-chip-why";

const OVERLAY_CLASS =
  "absolute inset-0 z-[1100] flex items-center justify-center bg-tinta/55 p-4";
const CARD_CLASS =
  "zpots-shadow flex max-h-full w-full max-w-sm flex-col overflow-y-auto rounded-[6px] " +
  "border border-stone bg-cream";
const CARD_BODY_CLASS = "flex flex-col gap-4 p-5";

function submitErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

/**
 * Looks up (or lazily creates) the `L.DivIcon` for a given marker id,
 * reusing the previous one as long as `key` -- a small string standing in
 * for whatever actually changes that icon's markup -- hasn't changed.
 *
 * paseo-motion.md fix-round-2, finding 1: both marker loops below build
 * icons inside a `.map()`, so a hook can't run per item the way `useMemo`
 * would in a plain (non-list) call site (see MapInsetInner.tsx). This is
 * the same idea carried out by hand, backed by a `useRef` map that lives
 * for the component instance's lifetime, so react-leaflet's `Marker` (a
 * reference check on `props.icon`, see node_modules/react-leaflet/lib/
 * Marker.js) sees the same object across renders that don't affect that
 * particular spot's icon.
 */
function usePinIconCache() {
  const cacheRef = useRef(new Map<string, { key: string; icon: L.DivIcon }>());

  return useCallback((id: string, key: string, factory: () => L.DivIcon): L.DivIcon => {
    const cache = cacheRef.current;
    const cached = cache.get(id);
    if (cached && cached.key === key) return cached.icon;
    const icon = factory();
    cache.set(id, { key, icon });
    return icon;
  }, []);
}

type PinIconCacheGetter = ReturnType<typeof usePinIconCache>;

/**
 * Density-key prefixes (pin-revamp-spec.md section 5.7, E6): `spots` and
 * `mapSpots` can both contain a spot with the same id, so each layer's
 * `DensityPoint`/tier lookup needs its own namespaced key.
 */
function spotDensityKey(id: string): string {
  return `spot:${id}`;
}
function mapSpotDensityKey(id: string): string {
  return `map:${id}`;
}

/** Largest tier a computed map didn't produce an entry for (E9/defensive) falls back to the kind's ceiling. */
function tierFor(tiers: ReadonlyMap<string, PinTier>, key: string, wantsPhoto: boolean): PinTier {
  return tiers.get(key) ?? (wantsPhoto ? PHOTO_CEILING_TIER : PLAIN_CEILING_TIER);
}

/**
 * `saved`/`been` are the two sources Mi mapa renders as *status* pins by
 * rule (social-spots.md: `been` = solid, `saved` = hollow); every other
 * source with a photo is the photo (spec section 5.4/A5). Written as a
 * denylist typed on `MapSource` on purpose: it compiles against today's
 * union with no literal for a member (e.g. a future famous-place source,
 * famous-spots-seed.md) that does not exist yet, and that source starts
 * showing its photo the moment `MapSource` gains it, with no edit here.
 */
function isPhotoEligibleSource(source: MapSource): boolean {
  return source !== "saved" && source !== "been";
}

/** `wantsPhoto` mirrors `iconForMapSpot`'s own photo-eligibility rule (spec section 5.4). */
function wantsPhotoFor(spot: MapSpot): boolean {
  return isPhotoEligibleSource(spot.source) && Boolean(spot.photoUrl);
}

/**
 * `spots` (write-mode) layer icon factory + cache key (spec sections 5.7,
 * 7.5): `${status}:${justConfirmed}:${category ?? "-"}:${tier}`. A `size`
 * outside `PinSize` never reaches `createPinIcon` here -- `tier` always maps
 * to one of the plain ladder's four sizes (32/22/16/10) for this layer.
 */
function iconForSpot(
  spot: Spot,
  tier: PinTier,
  justConfirmed: boolean,
  getIcon: PinIconCacheGetter,
): L.DivIcon {
  const category = spot.category;
  const key = `${spot.status}:${justConfirmed}:${category ?? "-"}:${tier}`;
  return getIcon(spot.id, key, () =>
    createPinIcon(spot.status, { justConfirmed, category, size: PIN_TIER_SIZES[tier] as PinSize }),
  );
}

/**
 * Mi mapa pin-by-source rule (social-spots.md): `mine`/`preview` use the
 * spot's own actual `status`; `saved`/`been` derive a pseudo-status from
 * `source` instead (`been` -> confirmed, `saved` -> unconfirmed) --
 * deliberately independent of the spot's real confirmation status, since a
 * saved-but-unconfirmed spot and an unconfirmed spot you dropped yourself
 * should still look different. `createPhotoPinIcon` is only reached when
 * the spot wants a photo *and* the current tier still shows one (spec
 * section 5.4/7.5) -- crowding drops the photo before the glyph returns.
 */
function iconForMapSpot(
  spot: MapSpot,
  tier: PinTier,
  justConfirmed: boolean,
  getIcon: PinIconCacheGetter,
): L.DivIcon {
  const category = spot.category;
  const key = `${spot.source}:${spot.photoUrl ?? ""}:${spot.status}:${category ?? "-"}:${tier}:${justConfirmed}`;

  return getIcon(spot.id, key, () => {
    if (isPhotoEligibleSource(spot.source)) {
      if (spot.photoUrl && tier <= PHOTO_LAST_TIER) {
        return createPhotoPinIcon(spot.photoUrl, spot.status, {
          justConfirmed,
          size: PIN_TIER_SIZES[tier] as PhotoPinSize,
        });
      }
      return createPinIcon(spot.status, {
        justConfirmed,
        category,
        size: PIN_TIER_SIZES[tier] as PinSize,
      });
    }
    return createPinIcon(spot.source === "been" ? "confirmed" : "unconfirmed", {
      justConfirmed,
      category,
      size: PIN_TIER_SIZES[tier] as PinSize,
    });
  });
}

/**
 * Renders the map, its markers/popups, and the tap-to-place flow for adding
 * a new spot. Placement is a deliberate two-step gesture (arm via the
 * floating action button, then tap a location) so an ordinary pan/zoom
 * never accidentally opens the add-spot form.
 */
export default function SpotMap({
  spots,
  mapSpots,
  confirmedSpotIds = new Set(),
  authStatus,
  nickname,
  onCreateSpot,
  onConfirmSpot,
  onReportSpot,
  openSpotId,
  onUnsave,
  sourceFilter,
  fitToCity = false,
  fitBounds,
}: SpotMapProps) {
  // Fail-closed default: an absent authStatus (only possible under the
  // frozen SpotMap.test.tsx, which never exercises a gated action) behaves
  // exactly like 'signed-out'. Never default to 'signed-in'.
  const effectiveAuthStatus: AuthStatus = authStatus ?? "signed-out";
  const effectiveSpots = (spots ?? []).filter(hasFiniteCoords);
  const visibleMapSpots = (
    sourceFilter ? (mapSpots ?? []).filter((spot) => sourceFilter.has(spot.source)) : (mapSpots ?? [])
  ).filter(hasFiniteCoords);

  const [leafletMap, setLeafletMap] = useState<LeafletMap | null>(null);
  // Density-responsive sizing (pin-revamp-spec.md section 5.5): read once the
  // real map exists, then only on `zoomend` -- never `move`/`moveend`/`zoom`,
  // since pixel distance between two spots is invariant under panning.
  const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM);
  const [basemapMode, setBasemapMode] = useState<BasemapMode | null>(null);
  const [isPlacementArmed, setIsPlacementArmed] = useState(false);
  const [tappedLocation, setTappedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reportedSpotIds, setReportedSpotIds] = useState<ReadonlySet<string>>(new Set());
  // Ids whose confirm just completed in this SpotMap instance -- paseo-motion.md
  // fix-round-2 finding 2, mirroring reportedSpotIds above: the mutation that
  // flips a spot's status lives in handleConfirm below, so this is where the
  // "just confirmed" signal for that spot's own pin belongs too, rather than
  // new global state. `createPinIcon`'s justConfirmed option is a no-op
  // unless the spot's status is also already "confirmed", so this being set
  // slightly ahead of a caller re-fetching the updated status is harmless.
  const [justConfirmedIds, setJustConfirmedIds] = useState<ReadonlySet<string>>(new Set());
  const [gatedAction, setGatedAction] = useState<GatedAction | null>(null);
  // Two separate caches (not one shared by id) -- `effectiveSpots` and
  // `visibleMapSpots` can both contain a spot with the same id (a spot the
  // viewer dropped shows up in the plain "spots" layer and again, styled
  // differently, in Mi mapa's `mapSpots` layer), and each layer's icon
  // depends on different inputs (see paseo-motion.md fix-round-2, finding 1).
  const getSpotIcon = usePinIconCache();
  const getMapSpotIcon = usePinIconCache();
  const [showOutsideCityBanner, setShowOutsideCityBanner] = useState(false);
  // Pending `justConfirmedIds` removals (spec section 4.7's "one-shot
  // guarantee"): keyed by spot id so a second confirm before the first
  // timer fires replaces it instead of stacking two removals.
  const justConfirmedTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  function isGateOpen(): boolean {
    return effectiveAuthStatus === "signed-in";
  }

  // Density-responsive sizing (spec sections 5.5, 7.5): subscribes once the
  // real Leaflet map instance exists, reads the zoom immediately, and
  // recomputes only on `zoomend` -- a fake map in a test double that never
  // calls back into `on("zoomend", ...)` just leaves `zoom` at DEFAULT_ZOOM.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!leafletMap) return;
    const map = leafletMap;
    setZoom(map.getZoom());
    function handleZoomEnd() {
      setZoom(map.getZoom());
    }
    map.on("zoomend", handleZoomEnd);
    return () => {
      map.off("zoomend", handleZoomEnd);
    };
  }, [leafletMap]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Clears any pending justConfirmedIds-removal timers on unmount -- a
  // confirm that resolves right before navigating away must never try to
  // setState on an unmounted SpotMap (spec E16).
  useEffect(() => {
    const timers = justConfirmedTimersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  // Computed fresh every render (spec 5.5: "the computation runs in render,
  // it is O(n) and pure" -- the icon cache above is what prevents DOM churn,
  // not memoizing this). `effectiveSpots`/`visibleMapSpots` can share an id
  // (E6), so each layer gets its own namespaced density key.
  const densityPoints: DensityPoint[] = [
    ...effectiveSpots.map((spot) => ({
      key: spotDensityKey(spot.id),
      lat: spot.lat,
      lng: spot.lng,
      wantsPhoto: false,
    })),
    ...visibleMapSpots.map((spot) => ({
      key: mapSpotDensityKey(spot.id),
      lat: spot.lat,
      lng: spot.lng,
      wantsPhoto: wantsPhotoFor(spot),
    })),
  ];
  const pinTiers = computePinTiers(densityPoints, zoom);

  // Sign-out in another tab while placement/the add form is open: close
  // both, same as Cancel (auth-migration.md section 3.2). This is a
  // deliberate external-state sync (auth status -> placement state), not a
  // data fetch.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (effectiveAuthStatus === "signed-out") {
      setIsPlacementArmed(false);
      setTappedLocation(null);
    }
  }, [effectiveAuthStatus]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Belt-and-suspenders enforcement of the Zamboanga City restriction: the
  // `maxBounds`/`maxBoundsViscosity` props below get applied by react-leaflet
  // as one-shot Leaflet Map *constructor* options, at the moment the
  // underlying DOM node is first attached -- before layout has necessarily
  // settled. Calling `setMaxBounds` again here, once the real Leaflet Map
  // instance is available post-mount, is the imperative safety net most
  // real-world react-leaflet v5 apps also rely on for this: Leaflet's own
  // `setMaxBounds` re-clamps the current view immediately if the map is
  // already loaded, so this also self-corrects if the initial view somehow
  // ended up outside bounds by the time this runs.
  useEffect(() => {
    if (!leafletMap) return;
    leafletMap.setMaxBounds(MAX_BOUNDS);
  }, [leafletMap]);

  // Mi mapa's whole-city view: fit to the actual outline shape (not just
  // the center/zoom every other caller opens with) once on mount, only
  // when the caller opts in and isn't already deep-linking to a spot's own
  // popup via openSpotId. Deliberately depends on `leafletMap` alone --
  // `fitToCity`/`openSpotId` are read once at that moment, not re-run on
  // every later identity change of either.
  useEffect(() => {
    if (!leafletMap || !fitToCity || openSpotId) return;
    return safeFitBounds(leafletMap, CITY_OUTLINE_BOUNDS, { padding: [16, 16] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafletMap]);

  // Explicit bounds (Mi mapa's preview pins): re-fits whenever the bounds
  // *value* changes. Declared after the fit-to-city effect on purpose so
  // that, when both apply on the same mount, this one runs last and wins.
  const fitBoundsKey = fitBounds ? JSON.stringify(fitBounds) : null;
  useEffect(() => {
    if (!leafletMap || !fitBounds || openSpotId) return;
    return safeFitBounds(leafletMap, fitBounds, FIT_BOUNDS_OPTIONS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafletMap, fitBoundsKey]);

  // Only listens once the real Leaflet Map instance is available (never
  // happens under a test double that doesn't forward `ref`) -- clicking an
  // existing Marker/Popup does not reach this handler, since Leaflet
  // disables click-propagation from both onto the map by default.
  useEffect(() => {
    if (!leafletMap) return;

    function handleMapClick(event: LeafletMouseEvent) {
      if (!isPlacementArmed) return;
      const { lat, lng } = event.latlng;
      // Defensive tap guard: don't open the add-pin modal for a tap outside
      // Zamboanga City -- MAX_BOUNDS should already keep the viewport from
      // getting there, but this is the belt-and-suspenders check at the
      // point of the tap itself.
      if (!isWithinZamboangaCity(lat, lng)) {
        setShowOutsideCityBanner(true);
        setTimeout(() => setShowOutsideCityBanner(false), 3000);
        return;
      }
      setTappedLocation({ lat, lng });
    }

    leafletMap.on("click", handleMapClick);
    return () => {
      leafletMap.off("click", handleMapClick);
    };
  }, [leafletMap, isPlacementArmed]);

  function handleFabClick() {
    if (isPlacementArmed) {
      setIsPlacementArmed(false);
      setTappedLocation(null);
      setSubmitError(null);
      return;
    }

    if (!isGateOpen()) {
      setGatedAction("add");
      return;
    }

    setIsPlacementArmed(true);
  }

  async function handleAddSpotSubmit(input: NewSpotInput) {
    if (!onCreateSpot) return;
    setSubmitError(null);
    try {
      await onCreateSpot(input);
      setIsPlacementArmed(false);
      setTappedLocation(null);
    } catch (error) {
      setSubmitError(submitErrorMessage(error));
    }
  }

  function handleAddSpotCancel() {
    setIsPlacementArmed(false);
    setTappedLocation(null);
    setSubmitError(null);
  }

  async function handleConfirm(spotId: string) {
    if (!isGateOpen()) {
      setGatedAction("confirm");
      return;
    }

    if (!onConfirmSpot) return;

    try {
      await onConfirmSpot(spotId);
      setJustConfirmedIds((prev) => new Set(prev).add(spotId));

      const timers = justConfirmedTimersRef.current;
      const existingTimer = timers.get(spotId);
      if (existingTimer) clearTimeout(existingTimer);
      timers.set(
        spotId,
        setTimeout(() => {
          timers.delete(spotId);
          setJustConfirmedIds((prev) => {
            if (!prev.has(spotId)) return prev;
            const next = new Set(prev);
            next.delete(spotId);
            return next;
          });
        }, JUST_CONFIRMED_TTL_MS),
      );
    } catch {
      // No error-display contract on ConfirmButton -- it just stays
      // clickable again so the user can retry.
    }
  }

  async function handleReport(spotId: string, reason: ReportReason, details?: string) {
    if (!isGateOpen()) {
      setGatedAction("report");
      return;
    }

    if (!onReportSpot) return;

    try {
      await onReportSpot(spotId, reason, details);
      setReportedSpotIds((prev) => new Set(prev).add(spotId));
    } catch {
      // Reporting is a best-effort signal (product.md); no error UI beyond
      // the Report control simply being available to try again.
    }
  }

  return (
    <div className="relative h-full w-full">
      <MapContainer
        ref={setLeafletMap}
        center={ZAMBOANGA_CENTER}
        zoom={DEFAULT_ZOOM}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        maxBounds={MAX_BOUNDS}
        maxBoundsViscosity={1.0}
        scrollWheelZoom
        className="h-full w-full"
      >
        <BasemapLayer map={leafletMap} onModeChange={setBasemapMode} />
        <CityMask />
        <PlaceLabelsLayer map={leafletMap} />
        {effectiveSpots.map((spot) => (
          <Marker
            key={spot.id}
            position={[spot.lat, spot.lng]}
            icon={iconForSpot(
              spot,
              tierFor(pinTiers, spotDensityKey(spot.id), false),
              justConfirmedIds.has(spot.id),
              getSpotIcon,
            )}
          >
            <Popup>
              <div className="zpots-popup">
                <VintaRule />
                <div className="px-4 py-3.5">
                  <SpotPhoto photoUrl={spot.photoUrl} name={spot.name} />
                  <p className="zpots-popup-name">{spot.name}</p>
                  <p className="zpots-popup-note">{spot.note}</p>
                  <span className="zpots-popup-status" data-status={spot.status}>
                    {spot.status === "confirmed" ? (
                      <Bilingual k="statusConfirmed" />
                    ) : (
                      <Bilingual k="statusUnconfirmed" />
                    )}
                  </span>
                  <p className="zpots-popup-confirmations">
                    {spot.confirmations} confirmation{spot.confirmations === 1 ? "" : "s"}
                  </p>
                  {spot.nickname && <p className="zpots-popup-credit">by {spot.nickname}</p>}
                  <div className="zpots-popup-actions">
                    <ConfirmButton
                      spot={{ ...spot, confirmedByMe: confirmedSpotIds.has(spot.id) }}
                      onConfirm={() => handleConfirm(spot.id)}
                    />
                    <ReportButton
                      spotId={spot.id}
                      onReport={(reason, details) => handleReport(spot.id, reason, details)}
                    />
                  </div>
                  {!isGateOpen() && (
                    <p className="mt-1 text-xs text-stone-deep">Sign in to confirm or report.</p>
                  )}
                  {reportedSpotIds.has(spot.id) && (
                    <p className="zpots-popup-report-ack">Reported — thanks</p>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
        {visibleMapSpots.map((spot) => (
          <Marker
            key={spot.id}
            position={[spot.lat, spot.lng]}
            icon={iconForMapSpot(
              spot,
              tierFor(pinTiers, mapSpotDensityKey(spot.id), wantsPhotoFor(spot)),
              justConfirmedIds.has(spot.id),
              getMapSpotIcon,
            )}
            ref={(marker) => {
              if (marker && openSpotId && spot.id === openSpotId) {
                marker.openPopup();
              }
            }}
          >
            <Popup>
              <div className="zpots-popup">
                <VintaRule />
                <div className="px-4 py-3.5">
                  <SpotPhoto photoUrl={spot.photoUrl} name={spot.name} />
                  <p className="zpots-popup-name">{spot.name}</p>
                  <p className="zpots-popup-note">{spot.note}</p>
                  <span className="zpots-popup-status" data-status={spot.status}>
                    {spot.status === "confirmed" ? (
                      <Bilingual k="statusConfirmed" />
                    ) : (
                      <Bilingual k="statusUnconfirmed" />
                    )}
                  </span>
                  <p className="zpots-popup-confirmations">
                    {spot.confirmations} confirmation{spot.confirmations === 1 ? "" : "s"}
                  </p>
                  {spot.nickname && <p className="zpots-popup-credit">by {spot.nickname}</p>}
                  {spot.photoCredit && <p className="zpots-popup-credit">{`Foto: ${spot.photoCredit}`}</p>}
                  {(onConfirmSpot || onReportSpot) && (
                    <div className="zpots-popup-actions">
                      {onConfirmSpot && (
                        <ConfirmButton
                          spot={{ ...spot, confirmedByMe: confirmedSpotIds.has(spot.id) }}
                          onConfirm={() => handleConfirm(spot.id)}
                        />
                      )}
                      {onReportSpot && (
                        <ReportButton
                          spotId={spot.id}
                          onReport={(reason, details) => handleReport(spot.id, reason, details)}
                        />
                      )}
                    </div>
                  )}
                  {onUnsave && spot.source === "saved" && (
                    <button
                      type="button"
                      onClick={() => onUnsave(spot.id)}
                      aria-label={bilingualLabel("unsave")}
                      className="mt-2 inline-flex min-h-9 items-center justify-center rounded border border-stone px-3 py-1.5 text-sm font-medium text-ink hover:bg-cream-deep"
                    >
                      <Bilingual k="unsave" />
                    </button>
                  )}
                  {!isGateOpen() && (onConfirmSpot || onReportSpot) && (
                    <p className="mt-1 text-xs text-stone-deep">Sign in to confirm or report.</p>
                  )}
                  {reportedSpotIds.has(spot.id) && (
                    <p className="zpots-popup-report-ack">Reported — thanks</p>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {basemapMode === "raster" && (
        <div
          className={RASTER_CHIP_CLASS}
          title={COPY.simpleMapWhy.en}
          aria-describedby={RASTER_CHIP_WHY_ID}
        >
          <Bilingual k="simpleMap" />
          <span id={RASTER_CHIP_WHY_ID} className="sr-only">
            {COPY.simpleMapWhy.en}
          </span>
        </div>
      )}

      {!tappedLocation && onCreateSpot && (
        <button
          type="button"
          onClick={handleFabClick}
          aria-pressed={isPlacementArmed}
          aria-label={bilingualLabel(isPlacementArmed ? "cancel" : "addSpot")}
          className={`${FAB_CLASS} ${isPlacementArmed ? FAB_ARMED_CLASS : FAB_IDLE_CLASS}`}
        >
          <AddSpotIcon />
          {isPlacementArmed ? (
            <Bilingual k="cancel" tone="inherit" />
          ) : (
            <Bilingual k="addSpot" tone="inherit" />
          )}
        </button>
      )}

      {showOutsideCityBanner && (
        <div className={BANNER_CLASS}>
          <VintaRule orientation="vertical" />
          <span className={BANNER_TEXT_CLASS}>
            <Bilingual k="outsideCity" />
          </span>
        </div>
      )}

      {!showOutsideCityBanner && isPlacementArmed && !tappedLocation && (
        <div className={BANNER_CLASS}>
          <VintaRule orientation="vertical" />
          <span className={BANNER_TEXT_CLASS}>
            <Bilingual k="tapToPlace" />
          </span>
        </div>
      )}

      {tappedLocation && (
        <div className={OVERLAY_CLASS}>
          <div className={CARD_CLASS}>
            <VintaRule />
            <div className={CARD_BODY_CLASS}>
              {submitError && (
                <p className="flex items-center gap-1.5 text-sm font-medium text-cardinal">
                  <AlertIcon className="shrink-0" />
                  <span>{submitError}</span>
                </p>
              )}
              <AddSpotForm
                lat={tappedLocation.lat}
                lng={tappedLocation.lng}
                onSubmit={handleAddSpotSubmit}
                onCancel={handleAddSpotCancel}
                defaultNickname={nickname}
              />
            </div>
          </div>
        </div>
      )}

      {gatedAction && <SignInPrompt action={gatedAction} onDismiss={() => setGatedAction(null)} />}
    </div>
  );
}
