# PRD: Famosos lane — a 4th lane of famous Zamboanga spots

**Parent:** paseo-social.md
**Status:** Complete
**Created:** 2026-09-21

## Summary

Add a 4th lane, **Famosos / Famous**, showing well-known Zamboanga City places, and grow the
curated set from 5 to 20. The content already half-exists as `PREVIEW_SPOTS`, today wired only as
an empty-state fallback.

## Scope change, stated plainly

`CLAUDE.md` currently says "Lanes: Cerca, Nuevo, Siguiendo" under a heading reading "Build these,
nothing else". A 4th lane is a deliberate, user-approved change to that list. `CLAUDE.md` must be
updated as part of this work, not silently contradicted.

## Why client-side and not seeded

The user explicitly said no seeding. That is also the only workable route: `spots.photo_url` is
regex-locked to the project's own Supabase bucket (`0001_init.sql:44-47`), `spot_cards` inner-joins
`profiles` so every row needs a real `auth.users` account, and the insert policy forbids creating a
row that is already `confirmed`. Hot-linked Wikimedia photos are legal precisely because these
never become database rows.

## Data: 20 spots

Keep the existing 5 (Fort Pilar, Paseo del Mar, Pasonanca Park, Great Santa Cruz Island,
Plaza Pershing) unchanged. Add 15.

### With a verified freely-licensed photo (11)

| Name | lat | lng | Photo credit |
|---|---|---|---|
| Merloquet Falls | 7.31066 | 122.21366 | Heigen Villacarlos, CC BY-SA 4.0, Wikimedia Commons |
| Metropolitan Cathedral | 6.90893 | 122.07602 | Ralff Nestor Nacor, CC BY-SA 4.0, Wikimedia Commons |
| Taluksangay Mosque | 6.95072 | 122.18153 | Patrickroque01, CC BY-SA 4.0, Wikimedia Commons |
| Zamboanga City Hall | 6.90391 | 122.07628 | Patrickroque01, CC BY-SA 4.0, Wikimedia Commons |
| Climaco Freedom Park | 6.96486 | 122.07632 | Wowzamboangacity, CC BY 3.0, Wikimedia Commons |
| Bolong Beach | 7.09787 | 122.24096 | CyraFelix, CC0, Wikimedia Commons |
| Lantawan Grassland | 6.96474 | 122.06255 | Nikkaella, CC0, Wikimedia Commons |
| La Vista del Mar | 6.92454 | 122.02019 | MaryelleJ, CC BY-SA 4.0, Wikimedia Commons |
| Grand Masjid Barbara | 6.90347 | 122.08104 | Ralff Nestor Nacor, CC BY-SA 4.0, Wikimedia Commons |
| Once Islas | 7.14917 | 122.26361 | BelleIbanez, CC BY 4.0, Wikimedia Commons |
| Manicahan Beach | 7.00941 | 122.19683 | CyraFelix, CC0, Wikimedia Commons |

Exact photo URLs are in the research notes appended at the bottom of this file. Every URL returned
HTTP 200 `image/jpeg`. **Re-verify each returns 200 before committing** — a dead hot-link renders
the placeholder.

### Verified coordinates, no freely-licensed photo (4)

| Name | lat | lng | Source |
|---|---|---|---|
| Duyan Spot | 6.945938 | 122.060937 | Google Maps plus code `W3W6+99`, decoded; Upper Cabatangan |
| Muruk Haven | 6.973313 | 122.079937 | Google Maps plus code `X3FH+8X`, decoded; Upper Pasonanca, hiking area |
| Yakan Weaving Village | 6.92491 | 122.02220 | OSM `shop=gift` + Nominatim, Barangay Calarian |
| Canelar Barter Trade Center | 6.91393 | 122.07423 | OSM `amenity=marketplace`, single source |

Duyan and Muruk were named by the user, who lives there. Google Maps is the authority for both.
Muruk Haven is a **hiking/trail area**, not the Malagutay residential quarter an earlier pass
guessed at — do not use 6.94946, 122.02658.

### Deliberately excluded

- **Rio Hondo** — a dense Muslim stilt-house residential community. The user chose not to list
  where people live as a tourist spot. Do not add it.
- **Sta. Cruz pink sand beach** — not distinct from the existing Great Santa Cruz Island entry.
- **Zamboanga City Hall is redundant-ish** with Plaza Pershing (~190 m apart, and the Plaza photo
  is captioned "…Plaza Pershing top view"). The user chose to include it anyway. Keep both.

## Work

### Task 1 — data and bounds (`src/lib/preview-spots.ts` + its tests)

1. Add the 15 entries. Every `note` must be **≤ 140 characters** and every id must match
   `^preview-[a-z0-9-]+$`. Keep `author` deep-equal to `PREVIEW_AUTHOR` and `status`/`confirmations`
   consistent with the threshold of 2.
2. **Raise the size cap.** `src/__tests__/preview-spots.test.ts:17-20` asserts 3–8 with the comment
   "not one and not a whole city directory". That cap was written when this set was an empty-state
   fallback. A browsable lane is a different thing — raise it to a range that still forbids a city
   directory (suggest 3–24) and **update the comment to say why**. This is a product decision, not
   test-reshaping; record it in the Change Log.
3. **Allow photoless entries.** The same test currently requires an `https://` `photoUrl` AND a
   non-empty `photoCredit` on every entry. Change it to: a photo is optional, but **if `photoUrl`
   is present then `photoCredit` must be non-empty**. That invariant is the one that matters
   legally; do not weaken it.
4. **Fix `previewBounds()`.** It fits the map to every entry, and a header comment notes the
   current spots are all downtown so the fit stays tight. Merloquet (7.31), Once Islas (7.15),
   Bolong (7.10) and Manicahan (7.01) now stretch it across the whole city, which would push the
   downtown cluster into a corner. Decide and justify: clamp to a sensible default view, fit only
   downtown spots, or accept the wide fit. Update the stale header comment either way.
5. Keep the export names (`PREVIEW_SPOTS`, `previewCards`, `previewBounds`, `previewMapSpots`,
   `isPreviewSpot`). A rename to `FAMOUS_*` would read better but touches many files during a scope
   change — note it as optional follow-up, do not do it here.

### Task 2 — the lane (`SpotsDeck.tsx`, `copy.ts`)

Add lane `"famosos"`, label `{ cv: "Famosos", en: "Famous" }`.

**The English label must not contain "new", "near me", or "following".** `SpotsDeck.test.tsx:132-138`
builds substring regexes from `COPY.*.en` and `getByRole` throws on multiple matches. "Famous" is safe.

Every lane-conditional branch in `SpotsDeck.tsx` needs a decision — there are eight, and several use
an implicit `else` that means "siguiendo", so a new lane would silently fall into `feedSiguiendo`:
- `:96` initial lane — **must stay `"cerca"`**; `SpotsDeck.test.tsx:140-144` pins it
- `:188` sign-in gate — Famosos needs no account
- `:217` signed-out early return
- `:232-238` first-page dispatch — add an explicit branch **before** the implicit else
- `:240` preview-fallback gate — the Famosos lane must not double-fall-back onto itself
- `:269` effect deps
- `:311-317` prefetch — the set is fixed-size, so no pagination; set `hasMore` false
- `:576` Hoy row visibility

Keep the empty-state fallback behavior intact — `SpotsDeck.preview.test.tsx` pins it, including
"Cerca failed: still shows Could not load + Retry, never the previews".

Tab strip at `:548` is a flat `flex gap-2` row; **four pills at 375px is a real layout risk**, each
`px-4` with two stacked lines. Verify at phone width and fix if it wraps or overflows.

### Task 3 — photoless card legibility

Four entries have no photo. `SpotPhoto` renders `variant="fill"` as `bg-cream-deep text-stone-deep`
with a centered glyph, while the card's overlaid text is `text-cream` under the `paseo-veil`
gradient (`from-tinta via-tinta/70 to-transparent`, bottom 2/5).

**Verify in a real browser before changing anything** — the gradient may already darken the bottom
enough that cream text reads fine. If it does, change nothing and say so. If it does not, fix the
contrast. Do not fix a problem you have not confirmed exists.

### Task 4 — docs

Update `CLAUDE.md`'s lane list from three to four and note the Famosos lane in the v2 scope section.

## Testing

Test-first, red before green, per the project rule. Cover: the lane renders and is selectable; it
shows the famous spots without an account; it does not paginate; the photoless entries render
without crashing; every photo URL is https and every photo'd entry has a credit; all 20 sit inside
the city outline polygon; the tab strip fits at 375px.

## Change Log

| Date | Change | Reason |
|---|---|---|
| 2026-09-21 | Created | User asked for a famous-spots tab and more spots than the existing 5 |
| 2026-09-21 | Cap raised 8 -> 24 | The 3-8 cap was written for an empty-state fallback; a browsable lane is a different product surface |
| 2026-09-21 | Photo made optional | Duyan and Muruk are real and user-named but have no freely-licensed photo; "photo implies credit" is kept |
| 2026-09-21 | Review REJECTED | A lane switch while the previous lane still had `hasMore=true` let the prefetch effect read a stale closure, call `feedSiguiendo` with a cursor from the old lane's cards, and then clobber the just-loaded Famosos cards on resolve. The deck rendered the old lane's cards while the Famosos tab reported `aria-pressed="true"`. Every test mocked the feed functions to resolve `[]`, so `hasMore` was never true before a switch in any test. |
| 2026-09-21 | Fix `2bbecff` | `handleLaneChange` clears `cards` in the same batch as `setLane`, so no render has a new lane with old cards; a `cancelled` flag discards an in-flight fetch that resolves after a switch. General across all lane pairs, so it also closes the same pre-existing hazard on Cerca to Nuevo/Siguiendo. |

## Verified by hand, not just by tests

- Loaded the lane in a real browser at 375px: four tabs overflow 375 -> 404 and scroll horizontally,
  no page-level horizontal scroll, deck walks all 20 cards.
- Photoless cards (Duyan, Muruk, Yakan, Canelar) are legible: the tinta gradient darkens the bottom
  enough for the cream text over the cream placeholder. Checked before changing anything; no fix
  was needed, so none was made.
- All 16 photo URLs re-fetched independently during review: HTTP 200, `image/jpeg`.

## Known gaps at completion

- Zamboanga City Hall sits ~190 m from Plaza Pershing and the Plaza photo is captioned
  "...Plaza Pershing top view". The user chose to keep both; they may read as duplicates.
- Duyan Spot, Muruk Haven, Yakan Weaving Village and Canelar Barter Trade Center have no photo.
  The user can replace them with their own through the post flow.
- Once Islas is an 11-island group pinned at one arbitrary point; the Panubigan ferry jump-off
  would be the more useful pin if anyone has its coordinates.
- Grand Masjid Barbara's coordinate is a camera EXIF position, so it is approximate.
- Lantawan Grassland's photo is captioned "Upper Pasonanca" and never "Lantawan"; the photo-to-place
  link is inference.
- A programmatic scroll interrupted by a lane switch loses its gesture-cancel listeners for the
  gap while the scroller is unmounted. No traced path leaves `activeIndex` stuck: every
  `loadFirstPage` calls `moveActiveIndexTo(...)`, which creates a fresh `activeMove`, overwrites
  the stale `programmaticTargetRef` and clears the stale settle timer; the one case that does not
  re-arm is a stale target already equal to 0, which is self-consistent. The mechanism is
  pre-existing, but **this change widens how often it is reachable** — before `2bbecff` only the
  signed-out Siguiendo path cleared `cards` mid-lane, and now every lane switch does. Saying it is
  merely "pre-existing" undersells that.
- `handleLaneChange` resets `cards` and `loading` but not `loadError` or `isPreview`. Verified to
  cause no visible flash today, because the render ternary checks `loading && cards.length === 0`
  first and the preview banner gates on `!loading`. That is incidental, not deliberate — reordering
  the ternary later would silently reintroduce a stale-error flash mid-switch.

## Research notes — exact photo URLs

1. Merloquet Falls: https://upload.wikimedia.org/wikipedia/commons/thumb/c/cc/Merloquet_Falls.jpg/1280px-Merloquet_Falls.jpg
2. Metropolitan Cathedral: https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Zamboanga_Cathedral%2C_Mar_2026_%281%29.jpg/1280px-Zamboanga_Cathedral%2C_Mar_2026_%281%29.jpg
3. Taluksangay Mosque: https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/Taluksangay_Mosque_front_%28Zamboanga_City%3B_10-12-2023%29.jpg/1280px-Taluksangay_Mosque_front_%28Zamboanga_City%3B_10-12-2023%29.jpg
4. Zamboanga City Hall: https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Zamboanga_City_Hall_facade_%28NS_Valderosa%2C_Zamboanga_City%3B_10-12-2023%29.jpg/1280px-Zamboanga_City_Hall_facade_%28NS_Valderosa%2C_Zamboanga_City%3B_10-12-2023%29.jpg
5. Climaco Freedom Park: https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Cross_Mayor_-_Abong_Abong.JPG/1280px-Cross_Mayor_-_Abong_Abong.JPG
6. Bolong Beach: https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/Bolong_beach.jpg/1280px-Bolong_beach.jpg
7. Lantawan Grassland: https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Grassland_Night_View.jpg/1280px-Grassland_Night_View.jpg
8. La Vista del Mar: https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/La_Vista_del_Mar_Beach_Resort.jpg/1280px-La_Vista_del_Mar_Beach_Resort.jpg
9. Grand Masjid Barbara: https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Grand_Masjid_Barbara%2C_Zamboanga_City%2C_Mar_2026.jpg/1280px-Grand_Masjid_Barbara%2C_Zamboanga_City%2C_Mar_2026.jpg
10. Once Islas: https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Once_Islas%2CSiromon_Beach_resort_ZC.jpg/1280px-Once_Islas%2CSiromon_Beach_resort_ZC.jpg
11. Manicahan Beach: search Commons for CyraFelix's Manicahan Beach (CC0, EXIF GPS 7.009406/122.196831) and resolve the exact thumb URL before use.

Confidence notes: Climaco's photo-to-place link rests on the filename alone. Bolong's file sits in
"Unidentified beaches" but its EXIF lands 230 m from OSM's Bolong Beach. Grand Masjid Barbara's
coordinate is the camera position from EXIF, so it is approximate. Once Islas is an 11-island group
and any single point is arbitrary. Lantawan Grassland's photo says "Upper Pasonanca" but never
"Lantawan", so that link is inference.
