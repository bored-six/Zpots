"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import Bilingual from "@/components/Bilingual";
import ClipboardShell from "@/components/ClipboardShell";
import { COPY } from "@/lib/copy";
import { myMap, unsaveSpot } from "@/lib/saves-repo";
import type { MapSource, MapSpot } from "@/lib/spots";

// Leaflet touches `window`, so SpotMap can only load on the client -- the
// same ssr:false client boundary MapView.tsx uses for the write-mode map.
// Mi mapa is read-only (mapSpots/openSpotId/onUnsave/sourceFilter) and
// doesn't fit MapView's write-mode prop contract, so this loads SpotMap
// directly instead of going through MapView.
const SpotMap = dynamic(() => import("@/components/SpotMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-stone-deep">
      <Bilingual k="loading" />
    </div>
  ),
});

// FLAG FOR REVIEW: "mine"/"been" have no copy.ts entries yet (only "saved"
// does) -- these two pairs are placeholders pending a real COPY key added
// by whoever owns copy.ts, same native-review caveat as the rest of the
// Chavacano copy in that file.
const LEGEND_ITEMS: ReadonlyArray<{ source: MapSource; cv: string; en: string }> = [
  { source: "mine", cv: "Mios", en: "Mine" },
  { source: "been", cv: "Ya anda", en: "Been" },
  { source: "saved", cv: COPY.saved.cv, en: COPY.saved.en },
];

const ALL_SOURCES: ReadonlySet<MapSource> = new Set(["mine", "been", "saved"]);

const GATE_CARD_CLASS =
  "zpots-shadow max-w-sm rounded-[6px] border border-stone bg-cream-deep px-5 py-4 text-center text-sm text-ink";

function LoadingView() {
  return (
    <main className="relative flex h-full w-full items-center justify-center p-4">
      <div className={GATE_CARD_CLASS}>
        <Bilingual k="loading" />
      </div>
    </main>
  );
}

function SignedOutView() {
  return (
    <main className="relative flex h-full w-full items-center justify-center p-4">
      <div className={GATE_CARD_CLASS}>
        <p className="font-bold uppercase tracking-[0.12em] text-stone-deep">
          <Bilingual k="signInFirst" />
        </p>
        <p className="mt-2">
          <Bilingual k="emptyMap" />
        </p>
      </div>
    </main>
  );
}

function SignedInView() {
  const searchParams = useSearchParams();
  const openSpotId = searchParams.get("spot") ?? undefined;

  const [spots, setSpots] = useState<MapSpot[] | null>(null);
  const [visibleSources, setVisibleSources] = useState<ReadonlySet<MapSource>>(ALL_SOURCES);

  useEffect(() => {
    let cancelled = false;

    myMap().then((result) => {
      if (!cancelled) setSpots(result);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  function toggleSource(source: MapSource) {
    setVisibleSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) {
        next.delete(source);
      } else {
        next.add(source);
      }
      return next;
    });
  }

  // Optimistic: the pin drops off the map immediately, same convention as
  // ConfirmButton/ReportButton's fire-and-forget calls in SpotMap.tsx. A
  // failed unsave just means the pin reappears next time myMap() refetches.
  async function handleUnsave(spotId: string) {
    setSpots((prev) => (prev ? prev.filter((spot) => spot.id !== spotId) : prev));
    try {
      await unsaveSpot(spotId);
    } catch {
      // No error-display contract here yet -- see the ConfirmButton comment above.
    }
  }

  const visibleSpots = (spots ?? []).filter((spot) => visibleSources.has(spot.source));
  const isEmpty = spots !== null && spots.length === 0;

  return (
    <div className="relative flex h-full w-full flex-col">
      <div
        role="group"
        aria-label="Map legend"
        className="flex gap-4 border-b border-stone bg-cream-deep px-4 py-2"
      >
        {LEGEND_ITEMS.map((item) => (
          <label key={item.source} className="inline-flex items-center gap-1.5 text-sm text-ink">
            <input
              type="checkbox"
              checked={visibleSources.has(item.source)}
              onChange={() => toggleSource(item.source)}
              aria-label={item.en}
            />
            <span aria-hidden="true">{item.cv}</span>
          </label>
        ))}
      </div>

      <div className="relative min-h-0 flex-1">
        <SpotMap
          authStatus="signed-in"
          mapSpots={visibleSpots}
          openSpotId={openSpotId}
          onUnsave={handleUnsave}
        />
        {isEmpty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
            <p className={`${GATE_CARD_CLASS} pointer-events-auto`}>
              <Bilingual k="emptyMap" />
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function MapaPageContent() {
  const { status } = useAuth();

  return (
    <ClipboardShell fullBleed>
      {status === "loading" && <LoadingView />}
      {status === "signed-out" && <SignedOutView />}
      {status === "signed-in" && <SignedInView />}
    </ClipboardShell>
  );
}

// useSearchParams() (read inside SignedInView) requires a Suspense boundary
// for the prerendered shell (Next.js static-bailout rule) -- same reasoning
// as login/page.tsx's identical wrapper.
export default function MapaPage() {
  return (
    <Suspense fallback={<ClipboardShell fullBleed>{null}</ClipboardShell>}>
      <MapaPageContent />
    </Suspense>
  );
}
