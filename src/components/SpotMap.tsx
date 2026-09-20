"use client";

import type { LeafletMouseEvent, Map as LeafletMap } from "leaflet";
import { useEffect, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";

import AddSpotForm from "@/components/AddSpotForm";
import Bilingual from "@/components/Bilingual";
import CityMask from "@/components/CityMask";
import ConfirmButton from "@/components/ConfirmButton";
import { AddSpotIcon } from "@/components/icons/action-icons";
import { AlertIcon } from "@/components/icons/status-icons";
import { VintaRule } from "@/components/icons/ornaments";
import ReportButton from "@/components/ReportButton";
import SignInPrompt, { type GatedAction } from "@/components/SignInPrompt";
import SpotPhoto from "@/components/SpotPhoto";
import type { AuthStatus } from "@/lib/auth";
import { isWithinZamboangaCity } from "@/lib/city-bounds";
import { CITY_OUTLINE_BOUNDS } from "@/lib/city-outline";
import { bilingualLabel } from "@/lib/copy";
import {
  DEFAULT_ZOOM,
  MAX_BOUNDS,
  MAX_ZOOM,
  MIN_ZOOM,
  TILE_ATTRIBUTION,
  TILE_URL,
  ZAMBOANGA_CENTER,
} from "@/lib/map-config";
import { createPhotoPinIcon, createPinIcon } from "@/lib/pin-icon";
import type { MapSource, MapSpot, Spot } from "@/lib/spots";
import type { NewSpotInput, ReportReason } from "@/lib/validation";

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

const FAB_CLASS =
  "zpots-shadow absolute right-4 top-4 z-[1000] flex min-h-10 items-center gap-2 rounded-full " +
  "px-4 py-3 text-sm font-bold text-cream focus:outline-none";
const FAB_IDLE_CLASS = "bg-terracotta hover:bg-terracotta-deep";
const FAB_ARMED_CLASS = "bg-teal hover:bg-teal-deep";

const BANNER_CLASS =
  "zpots-shadow absolute left-1/2 top-4 z-[1000] flex -translate-x-1/2 items-stretch " +
  "overflow-hidden rounded-[6px] border border-stone bg-cream-deep text-sm font-medium text-ink";
const BANNER_TEXT_CLASS = "px-4 py-2";

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
 * Mi mapa pin-by-source rule (social-spots.md): `mine` is the spot's own
 * photo inside the compass frame, `been` is the solid confirmed pin, and
 * `saved` is the hollow unconfirmed pin -- deliberately independent of the
 * spot's actual confirmation status, since a saved-but-unconfirmed spot and
 * an unconfirmed spot you dropped yourself should still look different.
 */
function iconForMapSpot(spot: MapSpot) {
  // Preview pins (famous-places fallback) are photo pins too -- they exist
  // to show what a filled-in map looks like.
  if (spot.source === "mine" || spot.source === "preview") {
    if (spot.photoUrl) return createPhotoPinIcon(spot.photoUrl, spot.status);
    return createPinIcon(spot.status);
  }
  return createPinIcon(spot.source === "been" ? "confirmed" : "unconfirmed");
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
  const [isPlacementArmed, setIsPlacementArmed] = useState(false);
  const [tappedLocation, setTappedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reportedSpotIds, setReportedSpotIds] = useState<ReadonlySet<string>>(new Set());
  const [gatedAction, setGatedAction] = useState<GatedAction | null>(null);
  const [showOutsideCityBanner, setShowOutsideCityBanner] = useState(false);

  function isGateOpen(): boolean {
    return effectiveAuthStatus === "signed-in";
  }

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
    leafletMap.fitBounds(CITY_OUTLINE_BOUNDS, { padding: [16, 16] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafletMap]);

  // Explicit bounds (Mi mapa's preview pins): re-fits whenever the bounds
  // *value* changes. Declared after the fit-to-city effect on purpose so
  // that, when both apply on the same mount, this one runs last and wins.
  const fitBoundsKey = fitBounds ? JSON.stringify(fitBounds) : null;
  useEffect(() => {
    if (!leafletMap || !fitBounds || openSpotId) return;
    leafletMap.fitBounds(fitBounds, FIT_BOUNDS_OPTIONS);
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
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <CityMask />
        {effectiveSpots.map((spot) => (
          <Marker key={spot.id} position={[spot.lat, spot.lng]} icon={createPinIcon(spot.status)}>
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
            icon={iconForMapSpot(spot)}
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
