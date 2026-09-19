"use client";

import type { LeafletMouseEvent, Map as LeafletMap } from "leaflet";
import { useEffect, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";

import AddSpotForm from "@/components/AddSpotForm";
import ConfirmButton from "@/components/ConfirmButton";
import { AddSpotIcon } from "@/components/icons/action-icons";
import { AlertIcon } from "@/components/icons/status-icons";
import ReportButton from "@/components/ReportButton";
import {
  DEFAULT_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  MINDANAO_BOUNDS,
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
  /** Rejecting keeps the form open with an inline error; resolving closes it and ends placement mode. */
  onCreateSpot: (input: NewSpotInput) => Promise<void>;
  onConfirmSpot: (spotId: string) => Promise<void>;
  onReportSpot: (spotId: string, reason: ReportReason, details?: string) => Promise<void>;
}

const FAB_CLASS =
  "absolute right-6 top-6 z-[1000] flex items-center gap-2 rounded-sm px-4 py-3 text-sm font-semibold " +
  "text-white shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2";
const FAB_IDLE_CLASS =
  "bg-[var(--zpots-brass)] hover:brightness-90 focus:ring-[var(--zpots-brass)]/40";
const FAB_ARMED_CLASS =
  "bg-[var(--zpots-pewter)] hover:brightness-90 focus:ring-[var(--zpots-pewter)]/40";

const BANNER_CLASS =
  "absolute left-1/2 top-6 z-[1000] -translate-x-1/2 rounded-sm border border-[#d8d4cb] bg-white " +
  "px-4 py-2 text-sm font-medium text-[#3a3730] shadow-md";

const OVERLAY_CLASS =
  "absolute inset-0 z-[1100] flex items-center justify-center bg-[#1f2420]/40 p-4";
const CARD_CLASS =
  "flex max-h-full w-full max-w-sm flex-col gap-4 overflow-y-auto rounded-sm bg-white p-5 shadow-xl";

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
  onCreateSpot,
  onConfirmSpot,
  onReportSpot,
}: SpotMapProps) {
  const [leafletMap, setLeafletMap] = useState<LeafletMap | null>(null);
  const [isPlacementArmed, setIsPlacementArmed] = useState(false);
  const [tappedLocation, setTappedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reportedSpotIds, setReportedSpotIds] = useState<ReadonlySet<string>>(new Set());

  // Belt-and-suspenders enforcement of the Mindanao restriction: the
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
    leafletMap.setMaxBounds(MINDANAO_BOUNDS);
  }, [leafletMap]);

  // Only listens once the real Leaflet Map instance is available (never
  // happens under a test double that doesn't forward `ref`) -- clicking an
  // existing Marker/Popup does not reach this handler, since Leaflet
  // disables click-propagation from both onto the map by default.
  useEffect(() => {
    if (!leafletMap) return;

    function handleMapClick(event: LeafletMouseEvent) {
      if (!isPlacementArmed) return;
      setTappedLocation({ lat: event.latlng.lat, lng: event.latlng.lng });
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
    } else {
      setIsPlacementArmed(true);
    }
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
    try {
      await onConfirmSpot(spotId);
    } catch {
      // No error-display contract on ConfirmButton -- it just stays
      // clickable again so the user can retry.
    }
  }

  async function handleReport(spotId: string, reason: ReportReason, details?: string) {
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
        maxBounds={MINDANAO_BOUNDS}
        maxBoundsViscosity={1.0}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        {spots.map((spot) => (
          <Marker key={spot.id} position={[spot.lat, spot.lng]} icon={createPinIcon(spot.status)}>
            <Popup>
              <div className="zpots-popup">
                <p className="zpots-popup-name">{spot.name}</p>
                <p className="zpots-popup-note">{spot.note}</p>
                <span className="zpots-popup-status" data-status={spot.status}>
                  {statusLabel(spot)}
                </span>
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
                {reportedSpotIds.has(spot.id) && (
                  <p className="zpots-popup-report-ack">Reported — thanks</p>
                )}
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
          className={`${FAB_CLASS} ${isPlacementArmed ? FAB_ARMED_CLASS : FAB_IDLE_CLASS}`}
        >
          <AddSpotIcon />
          {isPlacementArmed ? "Cancel" : "Add a spot"}
        </button>
      )}

      {isPlacementArmed && !tappedLocation && (
        <div className={BANNER_CLASS}>Tap the map to place your pin.</div>
      )}

      {tappedLocation && (
        <div className={OVERLAY_CLASS}>
          <div className={CARD_CLASS}>
            {submitError && (
              <p className="flex items-center gap-1.5 text-sm font-medium text-[#9a3324]">
                <AlertIcon className="shrink-0" />
                <span>{submitError}</span>
              </p>
            )}
            <AddSpotForm
              lat={tappedLocation.lat}
              lng={tappedLocation.lng}
              onSubmit={handleAddSpotSubmit}
              onCancel={handleAddSpotCancel}
            />
          </div>
        </div>
      )}
    </div>
  );
}
