"use client";

import Bilingual from "@/components/Bilingual";
import ClipboardShell from "@/components/ClipboardShell";

/**
 * Placeholder home route (social-spots.md). The old all-spots map body
 * (`MapView` + `fetchSpots`) is gone -- `fetchSpots` no longer exists in
 * `spots-repo.ts` (the public map is removed per the PRD). This keeps the
 * app compiling and the shell in place; Wave 3b replaces this body with the
 * full-screen Spots deck (`SpotsDeck`).
 */
export default function Home() {
  return (
    <ClipboardShell fullBleed>
      <main className="relative flex h-full w-full items-center justify-center">
        <div className="zpots-shadow rounded-[6px] border border-stone bg-cream-deep px-4 py-2 text-sm font-medium text-ink">
          <Bilingual k="loading" />
        </div>
      </main>
    </ClipboardShell>
  );
}
