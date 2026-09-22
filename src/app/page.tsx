"use client";

import { Suspense } from "react";

import SpotsDeck from "@/components/SpotsDeck";

/**
 * Home route (social-spots.md, "Spots deck" / navigation section).
 *
 * Deliberately does not wrap in `ClipboardShell` -- that header belonged
 * to the pre-social-redesign map page. The persistent chrome for every
 * main route is now `AppNav` in `app/layout.tsx` (bottom bar / desktop
 * rail), which is already mounted around `{children}` there. Home only
 * owns its own two layouts: phone is the deck alone, edge to edge; desktop
 * (>= 1024px) centers that same deck as a single phone-width column
 * against the page background -- the way a vertical feed (Reels/TikTok)
 * reads on the web. There used to be a second column here, a full-height
 * map panned to whichever card was active, but every card already carries
 * its own map inset (SpotCardView -> MapInset) -- the second, larger one
 * was redundant and made the screen read as a panel instead of a screen
 * (removed 2026-09-22, see CLAUDE.md item 7).
 *
 * `main` in `app/layout.tsx` already reserves the left rail's width via
 * `lg:pl-24`, so centering here with `justify-center` centers the deck in
 * the space actually left over, not the raw viewport.
 *
 * `SpotsDeck` reads `useSearchParams()` (the `?spot=` deep link), which
 * requires a Suspense boundary for the prerendered shell (Next.js
 * static-bailout rule) -- same reasoning as login/page.tsx and
 * mapa/page.tsx's identical wrapper. The fallback essentially never shows
 * in practice since this whole page is client-rendered anyway.
 */
export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  return (
    <div className="flex h-[calc(100dvh-4rem)] w-full justify-center lg:h-dvh">
      <div className="h-full w-full lg:w-[480px]">
        <SpotsDeck />
      </div>
    </div>
  );
}
