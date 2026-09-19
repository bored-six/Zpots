"use client";

import { useEffect, useState } from "react";

import ClipboardShell from "@/components/ClipboardShell";
import MapView from "@/components/MapView";
import {
  getLocallyConfirmedSpotIds,
  markSpotConfirmedLocally,
} from "@/lib/confirmed-spots-storage";
import { getLocalConfirmerId } from "@/lib/local-identity";
import type { Spot } from "@/lib/spots";
import { confirmSpot, createSpot, fetchSpots, reportSpot } from "@/lib/spots-repo";
import type { NewSpotInput, ReportReason } from "@/lib/validation";

function loadErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Couldn't load spots.";
}

/**
 * Client-rendered per spec F4: once wired to live data, the map shows only
 * what `fetchSpots` returns -- `SEED_SPOTS` stays exported from
 * `src/lib/spots.ts` purely so `spots.test.ts` keeps passing, not for
 * display here.
 */
export default function Home() {
  const [spots, setSpots] = useState<Spot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Lazy initializer (not an effect): `getLocallyConfirmedSpotIds` already
  // guards against a missing/throwing `localStorage`, so this is safe to
  // run during SSR (yields an empty set there) and re-runs correctly when
  // the client mounts its own instance and can read the real value.
  const [confirmedSpotIds, setConfirmedSpotIds] = useState<ReadonlySet<string>>(
    () => getLocallyConfirmedSpotIds(),
  );

  useEffect(() => {
    let isMounted = true;

    fetchSpots()
      .then((fetched) => {
        if (isMounted) setSpots(fetched);
      })
      .catch((error: unknown) => {
        if (isMounted) setLoadError(loadErrorMessage(error));
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleCreateSpot(input: NewSpotInput): Promise<void> {
    const spot = await createSpot(input);
    // Optimistic per the brief ("new pins show up immediately") -- prepend
    // rather than refetch.
    setSpots((prev) => [spot, ...prev]);
  }

  async function handleConfirmSpot(spotId: string): Promise<void> {
    const confirmerId = getLocalConfirmerId();
    const updated = await confirmSpot(spotId, confirmerId);
    setSpots((prev) => prev.map((spot) => (spot.id === spotId ? updated : spot)));
    // Bookkeeping lives here, not in spots-repo.ts (spec F9).
    markSpotConfirmedLocally(spotId);
    setConfirmedSpotIds(getLocallyConfirmedSpotIds());
  }

  async function handleReportSpot(
    spotId: string,
    reason: ReportReason,
    details?: string,
  ): Promise<void> {
    // Reporting never hides or removes the spot (product.md) -- no spots
    // state change here beyond the request itself.
    await reportSpot(spotId, reason, details);
  }

  return (
    <ClipboardShell fullBleed>
      <main className="relative h-full w-full">
        <MapView
          spots={spots}
          confirmedSpotIds={confirmedSpotIds}
          onCreateSpot={handleCreateSpot}
          onConfirmSpot={handleConfirmSpot}
          onReportSpot={handleReportSpot}
        />

        {isLoading && (
          <div className="pointer-events-none absolute inset-x-0 top-6 z-[1200] flex justify-center">
            <div className="rounded-sm border border-[#d8d4cb] bg-white px-4 py-2 text-sm font-medium text-[#3a3730] shadow-md">
              Loading spots…
            </div>
          </div>
        )}

        {!isLoading && loadError && (
          <div className="pointer-events-none absolute inset-x-0 top-6 z-[1200] flex justify-center">
            <div className="rounded-sm border border-[#9a3324]/30 bg-white px-4 py-2 text-sm font-medium text-[#9a3324] shadow-md">
              {loadError} — the map still works, but pins may be out of date.
            </div>
          </div>
        )}
      </main>
    </ClipboardShell>
  );
}
