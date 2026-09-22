@AGENTS.md

# Zpots

Crowdsourced map of local spots in Zamboanga City — street food, hangouts, hidden gems that do not show up well on Google Maps. Anyone drops a pin with a photo and a short note; other people confirm it is real by tapping "I've been here."

> Note: the `CLAUDE.md` in the parent `Documents/` folder is a Salesforce orchestrator config and does NOT apply to this project. This file plus `.claude/steering/` govern Zpots.

## Product scope — v2 "Paseo" (social spot sharing)

Zpots is a social app for sharing spots, closer to Instagram or Snapchat than to Google Maps.
The map is a feature inside the app, not the home screen. The v1 five-item map MVP is
superseded by this list (decided 2026-09-20, see `.claude/prds/social-spots.md`).

Build these, nothing else:

1. **Paseo (home)** — full-screen vertical swipe deck of spot cards: photo, spotter avatar and
   @handle, spot name, barangay, distance from you. Lanes: **Cerca** (near me), **Nuevo**
   (newest), **Siguiendo** (people I follow), **Famosos** (a curated set of well-known
   Zamboanga places, browsable without an account — added 2026-09-21, see
   `.claude/prds/famosos-lane.md`).
2. **Map inset and Mapa tab** — a small live map on each card pans as you swipe; tap to expand
   to the full map. On the full map every pin is the spot's category stamp (a Grabado glyph)
   inside the compass-rose frame; photos stay on the cards and popups, clusters stack. Map stays
   clamped to Zamboanga City.
3. **Hoy row** — avatars of followed people who dropped a spot today, vinta-stripe ring, tap
   jumps the walk to their spot.
4. **Post** — camera-first: photo, then name and one-line note, location from GPS with a map
   nudge. Requires a signed-in account. Zamboanga City only (client + DB constraint).
5. **Confirm and Report** — unchanged rules: "Ya anda yo aqui" from 2 distinct people flips
   Unconfirmed to Confirmed; Report offers spam / wrong info / closed.
6. **Profiles and follows** — @handle, avatar, "Mi paseo" route map of dropped + confirmed spots,
   photo grid, follower and following counts. Follow is "Camina con".
7. **Bottom nav** Paseo · Mapa · camera · Gente · Yo. Phone (375px) and desktop are both
   first-class; desktop fills the deck full screen beside the nav rail, not a two-column
   layout with a side map (that second map was removed 2026-09-22 as redundant — every card
   already carries its own map inset) and not a centered phone-width column either (that
   attempt, also 2026-09-22, left dead space on wide monitors and was reverted the same day).

Browsing the Paseo and the map needs no account. Posting, confirming, reporting, and following
require signing in (email + password or Google via Supabase Auth).

## Explicitly out of scope for v2

- Comments, DMs, expiring stories, push notifications
- Categories, search, filters
- Anything not in the 7 items above

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 16 + TypeScript + Tailwind | Matches existing experience, fastest path |
| Map | Leaflet + OpenStreetMap via react-leaflet | Free, no API key or billing |
| Backend + photos | Supabase (Postgres + Storage) | One free service covers data and files |
| Tests | Vitest + Testing Library + jsdom | Fast, ESM-native, no Jest config tax |
| Hosting | Vercel + Supabase | Both free tier |

## Workflow rules

- **Test-first on anything substantial.** Tests get written against a stated contract before the implementation exists, and they must fail red first. Never reshape tests around code after the fact.
- **One commit per completed task**, format `{type}({scope}): {description}`, with a `Co-Authored-By` line.
- **No emojis. No generic AI look.** Custom SVG icons and deliberately chosen fonts only — no icon packs, no untouched templates.
- Capture non-obvious discoveries in `.claude/learnings.md` after each task.

## Commands

```
npm run dev        # dev server
npm test           # vitest run
npm run test:watch # vitest watch
npm run lint
npx tsc --noEmit
npm run build
```
