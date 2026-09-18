# Code Structure and Conventions

## Layout

```
src/app/            Next.js App Router pages and layout
src/components/     React components (PascalCase files)
src/lib/            Pure modules: config, types, data helpers (kebab-case files)
src/__tests__/      Vitest specs, one file per module under test
```

## Rules

- **Pure logic goes in `src/lib/`**, not inside components. Anything with a branch or a rule (status thresholds, validation, formatting) belongs in a module that can be unit tested without a DOM.
- **Components stay thin** — props in, markup out. No data fetching mixed with rendering logic.
- Leaflet touches `window`, so any map component must be loaded with `next/dynamic` and `ssr: false`.
- Types are exported from the module that owns the concept (`Spot` lives in `src/lib/spots.ts`).
- Test files mirror the module path: `src/lib/spots.ts` -> `src/__tests__/spots.test.ts`.
- Import alias is `@/*` -> `src/*`. Use it instead of relative climbs.

## Naming

- Components: `PascalCase.tsx`, default export matching the filename.
- Lib modules: `kebab-case.ts`, named exports only.
- Constants: `SCREAMING_SNAKE_CASE`.
- Booleans read as predicates: `isConfirmed`, not `confirmed`.

## Design notes

- **Palette:** Seagrass `#0f7a63` for Confirmed pins (deep, settled — this spot is vouched for) and Driftwood `#7a7368` for Unconfirmed pins (muted, sun-bleached — still provisional). Both are set as `currentColor` on the SVG so Tailwind text-color utilities drive them; nothing is hardcoded in the path data.
- **Silhouette:** pins are a faceted gem tapering to a point, not the stock teardrop-with-a-circle-hole. First draft was a swallowtail pennant flag, but it did not survive a real render — the notch collapsed into a smudge at 32px. The gem is six straight edges, symmetric about the tip, with an inner facet that stays a plain stroke on the unconfirmed (hollow) variant versus a true cut-out on the confirmed (solid) one — same mark, distinguishable by fill state alone, not color. "Hidden gems" is the app's own word for a spot, so the mark carries meaning instead of being decoration.
- **Fonts (recommended, not wired up):** `Fraunces` for display/headings — a warm serif with enough quirk to feel local and hand-set rather than templated. `Work Sans` for UI text — geometric and highly legible at small sizes (pin popups, buttons) without defaulting to the now-ubiquitous Inter/Roboto look.
