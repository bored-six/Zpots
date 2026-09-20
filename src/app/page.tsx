"use client";

import { useState } from "react";

import Bilingual from "@/components/Bilingual";
import MapInset from "@/components/MapInset";
import SpotsDeck from "@/components/SpotsDeck";
import type { SpotCard } from "@/lib/spots";

/**
 * Home route (social-spots.md, "Spots deck" / navigation section).
 *
 * Deliberately does not wrap in `ClipboardShell` -- that header belonged
 * to the pre-social-redesign map page. The persistent chrome for every
 * main route is now `AppNav` in `app/layout.tsx` (bottom bar / desktop
 * rail), which is already mounted around `{children}` there. Home only
 * owns its own two layouts: phone is the deck alone, each card carrying
 * its own map inset; desktop (>= 1024px) adds a second column, a
 * full-height map that pans to whichever card is active (`MapInset` with
 * `fill`).
 */
export default function Home() {
  const [activeCard, setActiveCard] = useState<SpotCard | null>(null);

  return (
    <div className="flex h-dvh w-full flex-col lg:flex-row">
      <div className="min-h-0 w-full flex-1 lg:w-[480px] lg:flex-none lg:border-r lg:border-stone">
        <SpotsDeck onActiveCardChange={setActiveCard} />
      </div>

      <div className="hidden min-h-0 flex-1 lg:block">
        {activeCard ? (
          <MapInset
            center={{ lat: activeCard.lat, lng: activeCard.lng }}
            status={activeCard.status}
            onExpand={() => {}}
            fill
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-stone-deep">
            <Bilingual k="loading" />
          </div>
        )}
      </div>
    </div>
  );
}
