# Execution state

**Feature:** Pergamino drawn map
**PRD:** `.claude/prds/pergamino-map.md`
**Phase:** wave-1
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
- [ ] T1.1 Tokens + label CSS + palette
- [ ] T1.2 Pure ground style
- [ ] T1.3 Curated places + label icon
- [ ] T1.4 Archive probe
- [x] T1.5 Config + copy
- [x] T1.6 Hosting decision — Supabase Storage

### Wave 2
- [ ] T2.1 BasemapLayer
- [ ] T2.2 PlaceLabelsLayer
- [ ] T2.3 Cut the archive, confirm road tags (checkpoint: human action)

### Wave 3
- [ ] T3.1 Wire SpotMap
- [ ] T3.2 Wire MapInsetInner + PostFlow

### Wave 4-6
- [ ] T4.1 Host it, set env, verify range requests (checkpoint: human action)
- [ ] T5.1 Visual check + full gates (checkpoint: human verify)
- [ ] T6.1 Learnings + PRD status

## Blockers

- T2.3 needs the `pmtiles` CLI installed locally (`brew install pmtiles`) to cut the city extract. Not yet installed.

## Notes

- Parallel agents must not run git write commands in this tree: they raced the index on an earlier feature and merged two tasks into one commit. Agents write files; the orchestrator commits per task.
