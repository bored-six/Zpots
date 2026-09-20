"use client";

import dynamic from "next/dynamic";

/** Default square size (px) for the deck-card inset -- mirrors MapInsetInner. */
const DEFAULT_SIZE = 112;

/**
 * Wrapped in `next/dynamic` with `ssr: false`, matching `MapView.tsx`'s
 * `SpotMap` boundary: the loader is a real `import()` of a *separate* file
 * so Leaflet's `window`-touching module graph is never evaluated during
 * server prerendering. Keeping the Leaflet-importing code in the same file
 * as the `dynamic()` call (as this file previously did, via
 * `Promise.resolve({ default: MapInsetInner })`) does not defer the file's
 * own top-level imports -- the server still evaluates them.
 */
const MapInset = dynamic(() => import("@/components/MapInsetInner"), {
  ssr: false,
  loading: () => (
    <div
      style={{ width: DEFAULT_SIZE, height: DEFAULT_SIZE }}
      className="shrink-0 rounded border border-stone bg-cream-deep"
    />
  ),
});

export default MapInset;
