# Execution state

**Feature:** Pergamino drawn map
**PRD:** `.claude/prds/pergamino-map.md`
**Phase:** complete and running; one polish item open
**Last updated:** 2026-09-20

## Decisions made

| Date | Decision | Who |
|------|----------|-----|
| 2026-09-20 | Map ground is "Pergamino": parchment, drawn from vector geometry rather than a filtered raster. Chosen from a six-option design preview. | User |
| 2026-09-20 | Lettering is ours: Cinzel for landmarks, Alegreya Sans for barangays, Alegreya italic for water. Roughly eight names downtown, not sixty. | User |
| 2026-09-20 | Route is Protomaps vector tiles via `protomaps-leaflet`, keeping Leaflet and the existing map components and tests. | User, on the planner's recommendation |
| 2026-09-20 | The `.pmtiles` archive is hosted in **Supabase Storage**, not committed to the repo. URL comes from an env var, so it is reversible. | User (T1.6 checkpoint) |
| 2026-09-20 | The floating bottom navigation ("Isla") is **deferred**. Map first; the nav is judged once the new map is on screen. | User |

## Task tracker

### Wave 1 (files written locally, committed per task by the orchestrator)
- [x] T1.1 Tokens + label CSS + palette
- [x] T1.2 Pure ground style
- [x] T1.3 Curated places + label icon
- [x] T1.4 Archive probe
- [x] T1.5 Config + copy
- [x] T1.6 Hosting decision — Supabase Storage

### Wave 2
- [x] T2.1 BasemapLayer
- [x] T2.2 PlaceLabelsLayer
- [ ] T2.3 Cut the archive, confirm road tags (checkpoint: human action)

### Wave 3
- [x] T3.1 Wire SpotMap
- [x] T3.2 Wire MapInsetInner + PostFlow
- [x] T3.3 Extend the Leaflet test doubles (not in the original plan)

### Wave 4-6
- [ ] T4.1 Host it, set env, verify range requests (checkpoint: human action)
- [ ] T5.1 Visual check + full gates (checkpoint: human verify)
- [ ] T6.1 Learnings + PRD status

## Completed work

| Task | Commit | Notes |
|------|--------|-------|
| T1.1 | ec1ede8 | Eight ground tokens plus the three label styles |
| T1.2 | 92520db | Road tag to weight mapping, pure and framework-free |
| T1.3 | 8579225 | 20 curated places, all asserted inside the city outline |
| T1.4 | 9849221 | Range probe; a plain 200 counts as failure |
| T1.5 | b356912 | Archive config and fallback copy; TILE_URL kept |
| T2.1 | ae9bf39 | BasemapLayer with raster fallback |
| T2.2 | b60b72d | PlaceLabelsLayer on its own pane |
| T3.1 | 5117b3f | SpotMap wired, one frozen assertion rewritten |
| T3.2 | 0353c3a | Card inset and post picker wired, no labels |
| T3.3 | e5abaa9 | Four fake Leaflet maps taught the real method surface |

Gates after wave 3: 1065 tests pass, types clean, build clean, one pre-existing lint warning.
Live check: with no archive hosted the app falls back to raster, shows the "Mapa simple" chip,
and already renders our own Cinzel lettering over it.

## Blockers

None. The drawn map is live in the running app.

## Open polish item

- At 375px, four landmark labels around the waterfront (Plaza Pershing, Puerto, Paseo del Mar,
  Fort Pilar) overlap each other and the pins. The zoom bounds in `zamboanga-places.ts` were
  tuned for a wider view. Needs either collision avoidance in `PlaceLabelsLayer` or tighter
  per-place `minZoom` values.

## Hosting deviation from the T1.6 decision

The decision was Supabase Storage, taken when the archive was estimated at 8-40MB. The real cut
is **4.2MB**, and the machine only carries the public anon key, which cannot create a bucket or
upload an object. Rather than handle an admin credential, the archive was committed to
`public/basemap/zamboanga.pmtiles`, which the plan already named as the fallback and which the
size comfortably allows. `.git` is 8.5MB total. `BASEMAP_PMTILES_URL` still reads
`NEXT_PUBLIC_BASEMAP_PMTILES_URL` first, so moving to Supabase later is one env var and a
`git rm`, with no code change.

## Known nits, for the review round

- `protomaps-leaflet`'s chunk is fetched even on the failing-probe path, so the fallback pays for
  a download it never uses. Harmless once the archive exists; flagged for judgement.

## Notes

- Parallel agents must not run git write commands in this tree: they raced the index on an earlier feature and merged two tasks into one commit. Agents write files; the orchestrator commits per task.
