"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import Bilingual from "@/components/Bilingual";
import ClipboardShell from "@/components/ClipboardShell";
import { COPY } from "@/lib/copy";
import { previewBounds, previewMapSpots } from "@/lib/preview-spots";
import { myMap, unsaveSpot } from "@/lib/saves-repo";
import type { MapSource, MapSpot } from "@/lib/spots";

// Leaflet touches `window`, so SpotMap can only load on the client -- this
// is the ssr:false client boundary that makes that legal, since next/dynamic
// with ssr:false cannot be called from a Server Component.
const SpotMap = dynamic(() => import("@/components/SpotMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-stone-deep">
      <Bilingual k="loading" />
    </div>
  ),
});

const LEGEND_ITEMS: ReadonlyArray<{ source: MapSource; cv: string; en: string }> = [
  { source: "mine", cv: COPY.mine.cv, en: COPY.mine.en },
  { source: "been", cv: COPY.been.cv, en: COPY.been.en },
  { source: "saved", cv: COPY.saved.cv, en: COPY.saved.en },
];

const ALL_SOURCES: ReadonlySet<MapSource> = new Set(["mine", "been", "saved"]);

// Famous-places preview pins (src/lib/preview-spots.ts): what the map shows
// signed-out, and signed-in until the account has a real pin of its own.
const PREVIEW_MAP_SPOTS = previewMapSpots();
const PREVIEW_BOUNDS = previewBounds();

// Leaflet's panes sit at z-index 400 in the page's own stacking context, so
// anything overlaid on the map needs to clear them -- same z as SpotMap's
// own banners.
const OVERLAY_CLASS = "pointer-events-none absolute inset-0 z-[1000] flex items-end justify-center p-4 pb-6";

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
  // "Al tocar" (spec fix): browsing the map needs no account (CLAUDE.md),
  // so there is no standing gate here -- just the map, fully pan/zoom/
  // open-a-popup browsable, seeded with the famous-places preview pins.
  // The sign-in prompt only shows up at the moment of an actual gated
  // action (Save/confirm/report/follow/post), none of which this read-only
  // preview view renders any control for. Same flex-column + `min-h-0
  // flex-1` skeleton as SignedInView: the map needs a definite height at
  // mount, or `fitToCity`/`fitBounds` fits into a zero-size container and
  // lands at max zoom with every pin off-screen.
  return (
    <main className="relative flex h-full w-full flex-col">
      <div className="relative min-h-0 flex-1">
        <SpotMap authStatus="signed-out" mapSpots={PREVIEW_MAP_SPOTS} fitBounds={PREVIEW_BOUNDS} />
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

  const isEmpty = spots !== null && spots.length === 0;
  // An empty personal map shows the preview pins instead; they sit outside
  // the legend's source filter on purpose (nothing to toggle them off with).
  const visibleSpots = isEmpty
    ? PREVIEW_MAP_SPOTS
    : (spots ?? []).filter((spot) => visibleSources.has(spot.source));

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
          fitToCity
          fitBounds={isEmpty ? PREVIEW_BOUNDS : undefined}
        />
        {isEmpty && (
          <div className={OVERLAY_CLASS}>
            <div className={`${GATE_CARD_CLASS} pointer-events-auto`}>
              <p>
                <Bilingual k="emptyMap" />
              </p>
              <p className="mt-2 text-xs">
                <Bilingual k="previewHint" />
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MapaPageContent() {
  const { status } = useAuth();

  return (
    <ClipboardShell fullBleed hideHeader>
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
    <Suspense fallback={<ClipboardShell fullBleed hideHeader>{null}</ClipboardShell>}>
      <MapaPageContent />
    </Suspense>
  );
}
