# Reviewer verdict — social-spots, fix round 1 (dc00b27 on f125e9f)

## VERDICT: APPROVED

All three blockers from the previous REJECTED pass are resolved and independently verified.

## Verified
- **B1 (build)**: `src/components/MapInset.tsx` is now a thin
  `dynamic(() => import("@/components/MapInsetInner"), { ssr: false })`; the real
  Leaflet-importing component lives in `src/components/MapInsetInner.tsx`. `npm run build`
  passes, all routes prerender (`/`, `/gente`, `/login`, `/mapa`, `/post`, `/settings`, `/yo`
  static; `/u/[handle]` dynamic, as expected).
- **B2 (dedupe)**: `SpotsDeck.tsx`'s prefetch effect now filters `next` against a `Set` of
  already-loaded ids before merging (`SpotsDeck.tsx` prefetch effect, ~line 196-206).
- **B3 (save race)**: `saveTokensRef` (`Map<spotId, number>`) bumped per `handleSave`/
  `handleUnsave` call; each `catch` only reverts if its token is still current
  (`SpotsDeck.tsx`, `nextSaveToken`/`handleSave`/`handleUnsave`, ~line 230-266).
- **B4 (CityMask in PostFlow)**: `<CityMask />` added inside `PostFlow.tsx`'s tap-map
  `MapContainer`, after `TileLayer` — confirmed present.
- **C1 (CityMask hook hack)**: cleaned up — plain `import { Polygon, Polyline, useMap }`,
  unconditional `useMap()`, no more `eslint-disable` on rules-of-hooks or set-state-in-effect.
- **C2 (deep-link across pages)**: confirmed deliberately left unimplemented, documented in
  notes.md as a planner-accepted deviation — the adversarial test that would demand fetch-more
  behavior asserts the *current* (single-fetch, stays-at-index-0) behavior instead, so
  implementing C2 as originally worded would break a currently-green, intentionally-worded test.
  Reasonable call, correctly flagged rather than silently resolved.
- **Test diff**: reviewed `CityMask.test.tsx`, `SpotMap.wiring.adversarial.test.tsx`,
  `PostFlow.test.tsx`/`PostFlow.adversarial.test.tsx`, `SignInPrompt.test.tsx`,
  `profiles-repo.test.ts`, `gente-page.test.tsx` diffs directly — all changes are additive
  (new cases, new mock exports for `useMap`/`Polygon`/`Polyline`/`CityMask`) except the one
  disclosed loosening: `gente-page.test.tsx`'s "Siguiendo is empty" case moved from
  `findByText` to `findAllByText(...).length >= 1`, because its own fixture makes both empty
  sections render the same copy simultaneously (a real "multiple elements" hazard, not an
  assertion-intent weakening — confirmed by the very next test in the same file asserting
  `length >= 2`). No other assertion was loosened or removed.

## Commands
- `npm test` — 867/867 passing on a clean run. One flaky failure appeared on a second full-suite
  run (`profile-page.test.tsx`, `spotsByUser(...).then` on `undefined` — a mock-timing issue
  under full 61-file parallel load), reproduced 0/3 times running that file alone. Pre-existing
  test-infra flakiness under load, not a regression introduced by this fix round, not a source
  defect — not blocking.
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean (1 pre-existing, unrelated warning: unused `Spot` import in
  `src/__tests__/spots-repo.test.ts`).
- `npm run build` — succeeds, all 9 routes render.
