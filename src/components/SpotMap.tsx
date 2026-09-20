"use client";

import type { LeafletMouseEvent, Map as LeafletMap } from "leaflet";
import { useEffect, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";

import AddSpotForm from "@/components/AddSpotForm";
import Bilingual from "@/components/Bilingual";
import ConfirmButton from "@/components/ConfirmButton";
import { AddSpotIcon } from "@/components/icons/action-icons";
import { AlertIcon } from "@/components/icons/status-icons";
import { VintaRule } from "@/components/icons/ornaments";
import ReportButton from "@/components/ReportButton";
import SignInPrompt, { type GatedAction } from "@/components/SignInPrompt";
import type { AuthStatus } from "@/lib/auth";
import { isWithinZamboangaCity } from "@/lib/city-bounds";
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
import { createPinIcon } from "@/lib/pin-icon";
import type { Spot } from "@/lib/spots";
import type { NewSpotInput, ReportReason } from "@/lib/validation";

interface SpotMapProps {
  spots: readonly Spot[];
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
  /** Rejecting keeps the form open with an inline error; resolving closes it and ends placement mode. */
  onCreateSpot: (input: NewSpotInput) => Promise<void>;
  onConfirmSpot: (spotId: string) => Promise<void>;
  onReportSpot: (spotId: string, reason: ReportReason, details?: string) => Promise<void>;
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

const OVERLAY_CLASS =
  "absolute inset-0 z-[1100] flex items-center justify-center bg-tinta/55 p-4";
const CARD_CLASS =
  "zpots-shadow flex max-h-full w-full max-w-sm flex-col overflow-y-auto rounded-[6px] " +
  "border border-stone bg-cream";
const CARD_BODY_CLASS = "flex flex-col gap-4 p-5";

/**
 * "Unconfirmed pin" or "Confirmed pin" -- the status pill's own label.
 * Deliberately not the bare word "Confirmed": `ConfirmButton`'s settled
 * badge (now rendered in this same popup, spec item 4) already uses that
 * exact word, and a second literal match would make it ambiguous which
 * element a plain-text query found.
 */
function statusLabel(spot: Spot): string {
  return spot.status === "confirmed" ? "Confirmed pin" : "Unconfirmed pin";
}

function submitErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

/**
 * Renders the map, its markers/popups, and the tap-to-place flow for adding
 * a new spot. Placement is a deliberate two-step gesture (arm via the
 * floating action button, then tap a location) so an ordinary pan/zoom
 * never accidentally opens the add-spot form.
 */
export default function SpotMap({
  spots,
  confirmedSpotIds = new Set(),
  authStatus,
  nickname,
  onCreateSpot,
  onConfirmSpot,
  onReportSpot,
}: SpotMapProps) {
  // Fail-closed default: an absent authStatus (only possible under the
  // frozen SpotMap.test.tsx, which never exercises a gated action) behaves
  // exactly like 'signed-out'. Never default to 'signed-in'.
  const effectiveAuthStatus: AuthStatus = authStatus ?? "signed-out";

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
        {spots.map((spot) => (
          <Marker key={spot.id} position={[spot.lat, spot.lng]} icon={createPinIcon(spot.status)}>
            <Popup>
              <div className="zpots-popup">
                <VintaRule />
                <div className="px-4 py-3.5">
                  {spot.photoUrl && (
                    // next/image needs a known width/height or `fill` with a
                    // sized parent; a Leaflet popup sizes itself around its
                    // content, so a plain <img> is the simpler, correct fit.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={spot.photoUrl}
                      alt={`Photo of ${spot.name}`}
                      className="zpots-popup-photo"
                    />
                  )}
                  <p className="zpots-popup-name">{spot.name}</p>
                  <p className="zpots-popup-note">{spot.note}</p>
                  <span className="zpots-popup-status" data-status={spot.status}>
                    {statusLabel(spot)}
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
      </MapContainer>

      {!tappedLocation && (
        <button
          type="button"
          onClick={handleFabClick}
          aria-pressed={isPlacementArmed}
          aria-label={bilingualLabel(isPlacementArmed ? "cancel" : "addSpot")}
          className={`${FAB_CLASS} ${isPlacementArmed ? FAB_ARMED_CLASS : FAB_IDLE_CLASS}`}
        >
          <AddSpotIcon />
          {isPlacementArmed ? <Bilingual k="cancel" /> : <Bilingual k="addSpot" />}
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
