"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import ClipboardShell from "@/components/ClipboardShell";
import MapView from "@/components/MapView";
import type { Spot } from "@/lib/spots";
import {
  confirmSpot,
  createSpot,
  fetchMyConfirmedSpotIds,
  fetchSpots,
  reportSpot,
} from "@/lib/spots-repo";
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
  const { status, user } = useAuth();
  const [spots, setSpots] = useState<Spot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmedSpotIds, setConfirmedSpotIds] = useState<ReadonlySet<string>>(new Set());

  // Pins load for everyone immediately -- this fetch never waits on auth.
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

  // The confirmed-spots set now comes from the database, scoped to the
  // signed-in account -- a sign-out must not leave the previous user's
  // confirmed set on screen. The synchronous reset below is a deliberate
  // external-state sync (auth status -> local set), not a data fetch.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let isMounted = true;

    if (status !== "signed-in") {
      setConfirmedSpotIds(new Set());
      return;
    }

    fetchMyConfirmedSpotIds()
      .then((ids) => {
        if (isMounted) setConfirmedSpotIds(ids);
      })
      .catch(() => {
        // Best-effort: a failed fetch just leaves ConfirmButton's disabled
        // state unset for this session, not a page-level error.
      });

    return () => {
      isMounted = false;
    };
  }, [status, user?.id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleCreateSpot(input: NewSpotInput): Promise<void> {
    const spot = await createSpot(input);
    // Optimistic per the brief ("new pins show up immediately") -- prepend
    // rather than refetch.
    setSpots((prev) => [spot, ...prev]);
  }

  async function handleConfirmSpot(spotId: string): Promise<void> {
    const updated = await confirmSpot(spotId);
    setSpots((prev) => prev.map((spot) => (spot.id === spotId ? updated : spot)));
    setConfirmedSpotIds((prev) => new Set(prev).add(spotId));
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
          authStatus={status}
          nickname={user?.nickname ?? ""}
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
