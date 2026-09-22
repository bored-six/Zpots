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

- **Theme:** "Ciudad Latina" — a warm rework built around Fort Pilar coral stone, vinta sail
  stripes, azulejo tiles, and Chavacano micro-copy, replacing the earlier navy/parchment
  Compass Rose theme. All colors are Tailwind v4 tokens declared in `src/app/globals.css`'s
  `@theme` block (`--color-cream`, `--color-cream-deep`, `--color-stone`,
  `--color-stone-deep`, `--color-ink`, `--color-tinta`, `--color-terracotta` /
  `-deep`, `--color-teal` / `-deep`, `--color-cardinal`, and `--color-vinta-red` /
  `-yellow` / `-blue` / `-green`). No raw hex belongs in components — everything routes
  through these tokens (`bg-cream`, `text-ink`, etc.), enforced by
  `src/__tests__/no-raw-hex.test.ts`. The four vinta colors are used only by the `.vinta-rule`
  divider, never as text or fills, so the motif reads as a stripe rather than a flag.
- **Tiles:** OpenStreetMap tiles stay as-is but get a warm tint via a CSS `filter` on
  `.leaflet-tile-pane` only (`sepia(0.38) saturate(0.72) contrast(0.92) brightness(1.04)
  hue-rotate(-6deg)`) — markers and popups live in other Leaflet panes, so the filter never
  touches them and they stay crisp.
- **Silhouette:** pins are the same compass-rose mark as before, now density-responsive: a
  five-tier ladder `[44, 32, 22, 16, 10]` px (`PIN_TIER_SIZES` in `src/lib/pin-density.ts`),
  chosen per pin from nearest-neighbour pixel distance on `zoomend` and data change (never
  `moveend`); 22 stays the default when no size is given. Below tier 3 the rose becomes a
  dotted "punto". Confirmed pins earn a seal ring (chiselled teeth) instead of a plain fill
  swap, and category pins (tiers 0-2) show a Grabado glyph — a woodblock-stamp mass with
  cream cuts knocked out of it — inside the rose's window. Four hex values are allowed in
  `src/lib/pin-icon.ts`: `unconfirmed: #7a6448` (stone-deep), `confirmed: #1f6f78` (teal),
  glyph mass `#2a2017` (ink), glyph cuts and windows `#f6eedc` (cream) — all four must equal
  the matching tokens above. The halo stroke and unconfirmed fill use cream so the mark
  still reads over the tinted tiles.
- **Fonts (wired up via `next/font/google`, `display: "swap"`, in `src/app/layout.tsx`):**
  `Cinzel` (`--font-wordmark`) for the word "Zpots" only; `Alegreya` (`--font-display`) for
  headings, spot names, and the italic tagline; `Alegreya Sans` (`--font-body`) for
  everything else. Alegreya is a Latin-American calligraphic serif by Huerta Tipografica
  (Argentina) — chosen for that lineage to match Zamboanga's Spanish-colonial "Latin City"
  identity. The three font CSS variables are re-exposed as Tailwind font-family tokens via
  an `@theme inline` block in `globals.css` (mirrors the `--font-wordmark` /
  `--font-display` / `--font-body` names, so `font-wordmark` / `font-display` / `font-body`
  utilities exist).
- **Chavacano copy:** every user-facing string has a Chavacano primary line and an English
  secondary line, defined once in `src/lib/copy.ts` and rendered via `<Bilingual>`. Buttons
  keep an English `aria-label` so accessible names and existing test queries stay stable —
  the Chavacano text is visual only (`aria-hidden`). These strings are best-effort
  Zamboangueno forms from a non-native speaker and need a native-speaker review before
  launch; that's why they all live in one file instead of being scattered inline.
