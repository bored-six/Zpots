"use client";

import { Suspense } from "react";

import SpotsDeck from "@/components/SpotsDeck";

/**
 * Home route (social-spots.md, "Spots deck" / navigation section).
 *
 * Deliberately does not wrap in `ClipboardShell` -- that header belonged
 * to the pre-social-redesign map page. The persistent chrome for every
 * main route is now `AppNav` in `app/layout.tsx` (bottom bar / desktop
 * rail), which is already mounted around `{children}` there. Home is the
 * deck, full screen, at every breakpoint: phone is edge to edge, and at
 * `lg` the deck fills everything to the right of the nav rail rather than
 * sitting as a centered phone-width column -- a centered 480px column on a
 * wide monitor left hundreds of pixels of dead ground on each side, which
 * read as a page that failed to fill rather than a deliberate design
 * (the centered-column attempt was reverted 2026-09-22, see CLAUDE.md item
 * 7). There used to also be a second column here, a full-height map panned
 * to whichever card was active, but every card already carries its own map
 * inset (SpotCardView -> MapInset) -- that second, larger one was
 * redundant and made the screen read as a panel instead of a screen
 * (removed 2026-09-22, see CLAUDE.md item 7).
 *
 * `main` in `app/layout.tsx` already reserves the left rail's width via
 * `lg:pl-24`, so "full screen" here means filling the space actually left
 * over beside the rail, not the raw viewport -- the deck must never slide
 * under it.
 *
 * Spot photos are portrait; a full-bleed card on a wide, short viewport is
 * strongly landscape, so `SpotPhoto`'s `object-cover` crops the top and
 * bottom of the photo. That's an accepted consequence of filling the
 * screen, not a bug to fight with a width cap. What *does* need capping is
 * the text/actions column `SpotCardView` overlays on the photo -- see that
 * component's `lg:max-w-[640px]` for why a full-bleed line length would be
 * unreadable while the photo stays edge to edge.
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
    <div className="flex h-[calc(100dvh-4rem)] w-full lg:h-dvh">
      <div className="h-full w-full">
        <SpotsDeck />
      </div>
    </div>
  );
}
